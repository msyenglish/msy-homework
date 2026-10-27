// ============================================================
//  Anthropic Claude adapter (/v1/messages), native rather than through an OpenAI shim.
//  JSON is requested through the system prompt. Current models (4.6+) reject assistant prefill
//  and sampling parameters, so neither is sent. No audio input.
// ============================================================
import { AiError, isRetryableStatus, netError, type AiProvider, type AiRequest, type AiResult } from "./types";

const DEFAULT_BASE = "https://api.anthropic.com/v1";
const API_VERSION = "2023-06-01";

// Anthropic BẮT BUỘC max_tokens. Hub luôn truyền, đây chỉ là lưới an toàn.
const FALLBACK_MAX_TOKENS = 4096;

const JSON_NUDGE =
  "\n\nChỉ trả về một object JSON hợp lệ, không kèm giải thích, không bọc trong ```.";

async function generate(req: AiRequest): Promise<AiResult> {
  if (req.inline) {
    throw new AiError(400, "Anthropic không nhận audio input — tác vụ này phải dùng Gemini", false);
  }

  const messages: Record<string, unknown>[] = [{ role: "user", content: req.prompt }];

  const body = {
    model: req.model,
    max_tokens: req.maxOutputTokens ?? FALLBACK_MAX_TOKENS,
    ...(req.system ? { system: req.json ? req.system + JSON_NUDGE : req.system } : {}),
    messages,
  };

  const base = (req.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  let res: Response;
  try {
    res = await fetch(`${base}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": req.key,
        "anthropic-version": API_VERSION,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw netError(e);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new AiError(res.status, `Anthropic ${res.status}: ${text.slice(0, 300)}`, isRetryableStatus(res.status));
  }

  const data = (await res.json().catch(() => null)) as any;

  if (data?.stop_reason === "refusal") {
    throw new AiError(200, `Anthropic từ chối yêu cầu (${data?.stop_details?.category ?? "refusal"})`, false);
  }
  if (data?.stop_reason === "max_tokens") {
    throw new AiError(200, `Anthropic: output chạm trần ${body.max_tokens} token → JSON bị cắt`, false);
  }

  let out: string = (data?.content ?? [])
    .map((b: any) => (b?.type === "text" ? (b.text ?? "") : ""))
    .join("")
    .trim();
  if (!out) throw new AiError(200, "Anthropic trả về rỗng", false);

  // Without prefill the model may wrap the object in prose; keep only the outermost JSON object.
  if (req.json && !out.startsWith("{")) {
    const a = out.indexOf("{");
    const b = out.lastIndexOf("}");
    if (a >= 0 && b > a) out = out.slice(a, b + 1);
  }

  const u = data?.usage;
  return {
    text: out,
    usage: u
      ? { inputTokens: Number(u.input_tokens ?? 0), outputTokens: Number(u.output_tokens ?? 0) }
      : null,
  };
}

export const anthropicProvider: AiProvider = { id: "anthropic", generate };
