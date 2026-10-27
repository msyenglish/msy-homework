// ============================================================
//  Adapter Google Gemini (REST generateContent).
//  Là adapter DUY NHẤT xử lý `inline` (audio)
//  Gọi thẳng Google từ Worker bị chặn địa lý → baseUrl phải trỏ Cloudflare AI Gateway
//  (secret GEMINI_BASE_URL). Xem CLAUDE.md Gotcha #2 — đừng gỡ.
// ============================================================
import { AiError, isRetryableStatus, netError, type AiProvider, type AiRequest, type AiResult } from "./types";

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const endpoint = (base: string, model: string, key: string) =>
  `${base.replace(/\/$/, "")}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;

async function generate(req: AiRequest): Promise<AiResult> {
  // Gemini REST dùng snake_case cho phần đính kèm: inline_data { mime_type, data }.
  const parts: Record<string, unknown>[] = [{ text: req.prompt }];
  if (req.inline) {
    parts.push({ inline_data: { mime_type: req.inline.mimeType, data: req.inline.data } });
  }

  const body = {
    ...(req.system ? { systemInstruction: { parts: [{ text: req.system }] } } : {}),
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: req.temperature ?? 0.7,
      ...(req.maxOutputTokens ? { maxOutputTokens: req.maxOutputTokens } : {}),
      ...(req.json ? { responseMimeType: "application/json" } : {}),
    },
  };

  let res: Response;
  try {
    res = await fetch(endpoint(req.baseUrl || DEFAULT_BASE, req.model, req.key), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw netError(e);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    // Key-scoped 400s (dead key, or a key whose Google project sits in an unsupported region)
    // are reported as 403 so the hub rotates to the next key instead of failing the whole task.
    const keyScoped = res.status === 400 && /location is not supported|API_KEY_INVALID|API key not valid/i.test(text);
    const status = keyScoped ? 403 : res.status;
    throw new AiError(status, `Gemini ${res.status}: ${text.slice(0, 300)}`, isRetryableStatus(status));
  }

  const data = (await res.json().catch(() => null)) as any;
  const cand = data?.candidates?.[0];

  // Cắt vì chạm trần token → JSON chắc chắn hỏng. Báo rõ thay vì để rơi vào nhánh
  // "JSON không hợp lệ" rồi xoay key vô ích (đổi key không làm output ngắn lại).
  if (cand?.finishReason === "MAX_TOKENS") {
    throw new AiError(200, `Gemini: output chạm trần ${req.maxOutputTokens} token → JSON bị cắt`, false);
  }
  if (cand?.finishReason && cand.finishReason !== "STOP") {
    throw new AiError(200, `Gemini finishReason=${cand.finishReason}`, false);
  }

  const out: string = cand?.content?.parts?.map((p: any) => p?.text ?? "").join("").trim() ?? "";
  if (!out) throw new AiError(200, "Gemini trả về rỗng", false);

  const u = data?.usageMetadata;
  return {
    text: out,
    usage: u
      ? { inputTokens: Number(u.promptTokenCount ?? 0), outputTokens: Number(u.candidatesTokenCount ?? 0) }
      : null,
  };
}

export const geminiProvider: AiProvider = { id: "google", generate };
