// ============================================================
//  Adapter OpenAI-compatible — PHỤC VỤ 4 PROVIDER: OpenAI · DeepSeek · xAI · OpenRouter.
//  Cả bốn đều nói /chat/completions với cùng shape → chỉ khác baseUrl + tên model.
//  Audio: CHỈ OpenRouter nhận (nó chuyển tiếp tới Gemini) — 3 hãng còn lại bị chặn ở đây.
// ============================================================
import type { ProviderId } from "../models";
import { AiError, isRetryableStatus, netError, type AiProvider, type AiRequest, type AiResult } from "./types";

const DEFAULT_BASE: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  xai: "https://api.x.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

/**
 * OpenRouter is the one aggregator here: one key, one endpoint, 300+ models — so it is also the
 * only member of this family that can carry audio (it forwards to Gemini and friends). The two
 * ranking headers are optional but OpenRouter uses them for its public leaderboard.
 */
const OPENROUTER_HEADERS: Record<string, string> = {
  "X-Title": "English Homework",
};

/** OpenRouter accepts only these audio containers in `input_audio`. */
const AUDIO_FORMAT: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/wave": "wav",
};

/**
 * Tên tham số trần token — KHÔNG đồng nhất dù cùng giao thức OpenAI.
 * ĐÃ ĐO (07/2026): DeepSeek **âm thầm bỏ qua** `max_completion_tokens` (đặt 50 → trả 1006 token,
 * finish_reason "stop"); chỉ `max_tokens` mới có tác dụng (→ finish_reason "length"). Gửi sai tên
 * là trần token thành no-op VÔ HÌNH — mất kiểm soát chi phí mà không có lỗi nào báo.
 * OpenAI thì ngược lại: dòng gpt-5.x đã bỏ `max_tokens`, phải dùng `max_completion_tokens`.
 */
const MAX_TOKENS_PARAM: Record<string, string> = {
  openai: "max_completion_tokens",
  deepseek: "max_tokens",
  xai: "max_tokens",
  openrouter: "max_tokens",
};

/** OpenAI models that reject a non-default temperature. */
const FIXED_TEMPERATURE = /^(gpt-(5\.([6-9]|\d{2})|[6-9])|o\d)/;

function make(id: ProviderId): AiProvider {
  const isRouter = id === "openrouter";
  return {
    id,
    async generate(req: AiRequest): Promise<AiResult> {
      if (req.inline && !isRouter) {
        throw new AiError(400, `${id} không nhận audio input — tác vụ này phải dùng Gemini`, false);
      }

      const messages: Record<string, unknown>[] = [];
      if (req.system) messages.push({ role: "system", content: req.system });
      if (req.inline) {
        const format = AUDIO_FORMAT[req.inline.mimeType];
        if (!format) {
          throw new AiError(400, `OpenRouter không nhận định dạng audio ${req.inline.mimeType}`, false);
        }
        messages.push({
          role: "user",
          content: [
            { type: "text", text: req.prompt },
            { type: "input_audio", input_audio: { data: req.inline.data, format } },
          ],
        });
      } else {
        messages.push({ role: "user", content: req.prompt });
      }

      const base = (req.baseUrl || DEFAULT_BASE[id]).replace(/\/$/, "");

      // Gọi 1 lần với trần token cho trước (null = không đặt). Tách hàm để có thể THỬ LẠI
      // với trần thấp hơn khi model từ chối vì vượt cap output (xem clamp-retry bên dưới).
      const call = async (maxTok: number | undefined): Promise<Response> => {
        const body = {
          model: req.model,
          messages,
          // GPT-5.6+, GPT-6 and the o-series accept only their default temperature.
          ...(!(id === "openai" && FIXED_TEMPERATURE.test(req.model)) ? { temperature: req.temperature ?? 0.7 } : {}),
          ...(maxTok ? { [MAX_TOKENS_PARAM[id]]: maxTok } : {}),
          // json_object là mẫu số chung của cả 3 (DeepSeek chưa chắc có json_schema
          // nghiêm ngặt). Hub vẫn validate lại bằng zod.
          ...(req.json ? { response_format: { type: "json_object" } } : {}),
        };
        return fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${req.key}`,
            ...(isRouter ? OPENROUTER_HEADERS : {}),
          },
          body: JSON.stringify(body),
        });
      };

      // Trần model KHÔNG nằm trong code (đổi model ở /teacher/ai) → không biết trước cap output.
      // Nếu ta xin max_tokens cao hơn cap model, provider trả 400 nhắc tới max_tokens → hỏng CẢ bài.
      // Lưới: bắt đúng lỗi đó, thử LẠI 1 lần với trần an toàn 8192 (mọi model ở đây đều nhận).
      const SAFE_MAX = 8192;
      let res: Response;
      try {
        res = await call(req.maxOutputTokens);
        if (res.status === 400 && req.maxOutputTokens && req.maxOutputTokens > SAFE_MAX) {
          const body = await res.clone().text().catch(() => "");
          if (/max_tokens|max output|maximum.*token/i.test(body)) {
            res = await call(SAFE_MAX); // model cap thấp → lùi về 8192 thay vì chết hẳn
          }
        }
      } catch (e) {
        throw netError(e);
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new AiError(res.status, `${id} ${res.status}: ${text.slice(0, 300)}`, isRetryableStatus(res.status));
      }

      const data = (await res.json().catch(() => null)) as any;

      // OpenRouter reports upstream failures (provider down, rate limit, moderation) INSIDE a
      // 200 body — without this they surface as the useless empty-answer error below.
      if (data?.error) {
        const status = Number(data.error.code) || 502;
        throw new AiError(status, `${id}: ${String(data.error.message ?? "").slice(0, 300)}`, isRetryableStatus(status));
      }

      const choice = data?.choices?.[0];

      // Truncated at the ceiling → broken JSON. Rotating keys would not help.
      if (choice?.finish_reason === "length") {
        throw new AiError(200, `${id}: output chạm trần ${req.maxOutputTokens} token → JSON bị cắt`, false);
      }

      // MEASURED (28/07, eval feedback): an upstream cut mid-answer comes back as HTTP 200 with
      // finish_reason "error" and a half-written JSON string. Letting it through means the hub
      // fails on JSON.parse, which is NOT retryable — one glitch kills the whole submission's
      // feedback. Flag it as retryable so the next key gets a turn.
      const stop = choice?.finish_reason;
      if (stop && stop !== "stop" && stop !== "tool_calls") {
        throw new AiError(502, `${id}: bị cắt giữa chừng (finish_reason=${stop})`, true);
      }

      const out: string = (choice?.message?.content ?? "").trim();
      if (!out) throw new AiError(200, `${id} trả về rỗng`, false);

      const u = data?.usage;
      return {
        text: out,
        usage: u
          ? {
              inputTokens: Number(u.prompt_tokens ?? 0),
              outputTokens: Number(u.completion_tokens ?? 0),
              ...(typeof u.cost === "number" ? { costUsd: u.cost } : {}),
            }
          : null,
      };
    },
  };
}

export const openaiProvider = make("openai");
export const deepseekProvider = make("deepseek");
export const xaiProvider = make("xai");
export const openrouterProvider = make("openrouter");
