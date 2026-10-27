// ============================================================
//  AI Hub — điểm vào duy nhất cho mọi tác vụ AI.
//    runAiTask(env, name, rawInput):
//      1. validate input theo schema của task
//      2. chốt route (provider/model) từ cấu hình D1 — trang admin /teacher/ai đổi được
//      3. chọn key theo LRU, gọi provider qua adapter
//      4. LỖI do key/quota → fallback sang key kế tiếp (cooldown key hỏng)
//      5. ghi nhật ký ai_usage (kể cả lượt lỗi) → tab "Chi phí"
//      6. validate & trả JSON output đã parse
// ============================================================
import { HTTPException } from "hono/http-exception";
import type { Bindings } from "../env";
import { getDb } from "../../db";
import { AiError, PROVIDERS, type AiInline } from "./providers";
import { getKeys, markFailed, markUsed, orderedCandidates } from "./keyring";
import { envBaseUrl, getRoutingConfig, modelOf, resolveRoute } from "./routing";
import type { ProviderId } from "./models";
import { AI_TASKS, maxTokensFor, type AiTaskName } from "./tasks";
import { logUsage } from "./usage";
import { applyTeacherTitle } from "@msyen/shared";
import { getBrand } from "../brand";

// Cooldown theo loại lỗi (ms): 429 quota ngắn hạn vs 403 key hỏng lâu hơn.
const cooldownFor = (status: number) =>
  status === 429 ? 60_000 : status === 403 ? 5 * 60_000 : status >= 500 ? 10_000 : 0;

// Output sai schema thì thử lại tối đa ngần này KEY rồi bỏ. Trước đây thử hết mọi key —
// khi prompt sai thật thì đó chỉ là đốt token vô ích.
const MAX_SCHEMA_RETRIES = 2;

/**
 * Strips a ```json ... ``` fence if the model wrapped its answer, then parses safely.
 *
 * Also unwraps DOUBLE-ENCODED output: a model in JSON mode sometimes answers with the object
 * serialised *again* as a string ("{\"heard\": …}"), which parses into a plain string and then
 * fails schema validation as `Expected object, received string` — measured on speaking_extract.
 * One extra pass is enough; the loop is bounded so a string of quoted strings cannot spin.
 */
function parseJson(raw: string): unknown {
  const cleaned = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new HTTPException(502, { message: "AI trả JSON không hợp lệ" });
  }
  for (let depth = 0; depth < 2 && typeof parsed === "string"; depth++) {
    const inner = parsed.trim();
    if (!/^[[{]/.test(inner)) break; // a genuinely string-valued answer stays a string
    try {
      parsed = JSON.parse(inner);
    } catch {
      break;
    }
  }
  return parsed;
}

/** Every string inside a plain JSON value with the teacher title swapped. */
function swapStrings<T>(v: T, title: Parameters<typeof applyTeacherTitle>[1]): T {
  if (typeof v === "string") return applyTeacherTitle(v, title) as T;
  if (Array.isArray(v)) return v.map((x) => swapStrings(x, title)) as T;
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swapStrings(x, title)])) as T;
  }
  return v;
}

/**
 * `opts.inline`: file đính kèm (audio) gửi kèm prompt. Truyền NGOÀI zod schema — base64 vài trăm KB
 * nhét vào input schema chỉ tổ phình log/validate mà chẳng kiểm được gì có ích.
 */
export async function runAiTask<T = unknown>(
  env: Bindings,
  name: AiTaskName,
  rawInput: unknown,
  opts?: { inline?: AiInline },
): Promise<T> {
  const task = AI_TASKS[name];
  if (!task) throw new HTTPException(400, { message: `Tác vụ AI không tồn tại: ${name}` });

  const parsed = task.input.safeParse(rawInput);
  if (!parsed.success) {
    throw new HTTPException(400, {
      message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ",
    });
  }

  const db = getDb(env.DB);
  const cfg = await getRoutingConfig(db);
  const route = resolveRoute(cfg, name);
  const { provider, model } = route;

  const keys = await getKeys(env, db, provider);
  if (!keys.length) {
    throw new HTTPException(503, {
      message: `Chưa cấu hình key AI cho ${provider} — kiểm tra ở trang Cổng AI.`,
    });
  }

  // Guard §7.2, second layer: the adapter blocks it too, but the message is clearer here.
  const modelInfo = modelOf(cfg, route);
  if (opts?.inline && !modelInfo?.audio) {
    throw new HTTPException(503, {
      message: `Model ${model} không nghe được audio — tác vụ "${name}" cần model có audio.`,
    });
  }

  const candidates = await orderedCandidates(db, keys);
  const adapter = PROVIDERS[provider];
  const baseUrl = envBaseUrl(env, provider);
  const maxOutputTokens = maxTokensFor(name);
  // Prompts are written in the default teacher voice; rewrite them for the configured title. The swap
  // cô ↔ thầy is its own inverse, so the input is swapped first: the data inside the prompt (stored
  // comments, learner content) is swapped twice and comes out as it was — only the template changes.
  const { title } = await getBrand(env);
  const data = swapStrings(parsed.data, title);
  const system = applyTeacherTitle(typeof task.system === "function" ? task.system(data) : task.system, title);
  const prompt = applyTeacherTitle(task.build(data), title);

  let lastErr: unknown;
  let schemaRetries = 0;

  for (const cand of candidates) {
    const startedAt = Date.now();
    try {
      const res = await adapter.generate({
        key: cand.key,
        model,
        system,
        prompt,
        json: true,
        temperature: task.temperature,
        maxOutputTokens,
        baseUrl,
        inline: opts?.inline,
      });
      await markUsed(db, cand.id, provider);

      const out = task.output.safeParse(parseJson(res.text));
      if (!out.success) {
        // Valid JSON but wrong shape → try another key (the model may answer correctly next time).
        // The zod message alone ("Expected object, received string") says nothing about what the
        // model actually sent, which makes these failures undebuggable after the fact — keep a
        // short raw sample next to it. Truncated: the point is the SHAPE, not the content.
        const issue = out.error.issues[0];
        const where = issue?.path?.length ? ` tại "${issue.path.join(".")}"` : "";
        const sample = res.text.replace(/\s+/g, " ").slice(0, 220);
        console.error(`[ai] ${name} sai định dạng${where}: ${issue?.message} :: raw=${res.text.slice(0, 1500)}`);
        await logUsage(db, {
          task: name,
          provider,
          model,
          modelInfo,
          keyId: cand.id,
          inputTokens: res.usage?.inputTokens,
          outputTokens: res.usage?.outputTokens,
          costUsd: res.usage?.costUsd,
          latencyMs: Date.now() - startedAt,
          ok: false,
          error: `Sai định dạng${where}: ${issue?.message ?? ""} :: ${sample}`,
        });
        lastErr = new Error("AI trả kết quả sai định dạng");
        if (++schemaRetries >= MAX_SCHEMA_RETRIES) break;
        continue;
      }

      await logUsage(db, {
        task: name,
        provider,
        model,
        modelInfo,
        keyId: cand.id,
        inputTokens: res.usage?.inputTokens,
        outputTokens: res.usage?.outputTokens,
        costUsd: res.usage?.costUsd,
        latencyMs: Date.now() - startedAt,
        ok: true,
      });
      return out.data as T;
    } catch (e) {
      if (e instanceof HTTPException) throw e; // lỗi parse/định dạng → không xoay key

      lastErr = e;
      await logUsage(db, {
        task: name,
        provider,
        model,
        modelInfo,
        keyId: cand.id,
        latencyMs: Date.now() - startedAt,
        ok: false,
        error: (e as Error).message,
      });

      if (e instanceof AiError) {
        if (e.retryable) {
          await markFailed(db, cand.id, cooldownFor(e.status), provider);
          continue; // thử key kế tiếp
        }
        // Lỗi không do key (400 prompt sai, output chạm trần…) → xoay vô ích.
        throw new HTTPException(502, { message: `AI lỗi: ${e.message}` });
      }
      throw e;
    }
  }

  throw new HTTPException(502, {
    message: `Tất cả key AI (${provider}) đều lỗi: ${
      lastErr instanceof Error ? lastErr.message : "không rõ"
    }`,
  });
}

export type ModelTestResult = {
  ok: boolean;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  reply?: string;
  error?: string;
};

/**
 * Sends one tiny JSON request to a model (admin "test" button). Tries each key in rotation order
 * until one answers; a failure on every key is reported, not thrown. Logged as task "model_test".
 */
export async function testModel(env: Bindings, provider: ProviderId, model: string): Promise<ModelTestResult> {
  const db = getDb(env.DB);
  const keys = await getKeys(env, db, provider);
  if (!keys.length) return { ok: false, latencyMs: 0, error: "Chưa có key cho provider này" };
  const cfg = await getRoutingConfig(db);
  const modelInfo = modelOf(cfg, { provider, model });
  const baseUrl = envBaseUrl(env, provider);
  let error = "";
  for (const cand of await orderedCandidates(db, keys)) {
    const startedAt = Date.now();
    try {
      const res = await PROVIDERS[provider].generate({
        key: cand.key,
        model,
        system: "You are a connectivity check. Reply with JSON only.",
        prompt: 'Return exactly this JSON object: {"ok": true, "word": "hello"}',
        json: true,
        maxOutputTokens: 2000,
        baseUrl,
      });
      const latencyMs = Date.now() - startedAt;
      await markUsed(db, cand.id, provider);
      await logUsage(db, {
        task: "model_test",
        provider,
        model,
        modelInfo,
        keyId: cand.id,
        inputTokens: res.usage?.inputTokens,
        outputTokens: res.usage?.outputTokens,
        costUsd: res.usage?.costUsd,
        latencyMs,
        ok: true,
      });
      let valid = true;
      try {
        parseJson(res.text);
      } catch {
        valid = false;
      }
      return {
        ok: valid,
        latencyMs,
        inputTokens: res.usage?.inputTokens,
        outputTokens: res.usage?.outputTokens,
        reply: res.text.slice(0, 200),
        ...(valid ? {} : { error: "Model trả lời nhưng không đúng định dạng JSON" }),
      };
    } catch (e) {
      error = (e as Error).message;
      await logUsage(db, { task: "model_test", provider, model, modelInfo, keyId: cand.id, latencyMs: Date.now() - startedAt, ok: false, error });
      if (e instanceof AiError && e.retryable) {
        await markFailed(db, cand.id, cooldownFor(e.status), provider);
        continue;
      }
      return { ok: false, latencyMs: Date.now() - startedAt, error };
    }
  }
  return { ok: false, latencyMs: 0, error: error || "Mọi key đều lỗi" };
}

export { AI_TASKS } from "./tasks";
export type { AiTaskName } from "./tasks";
