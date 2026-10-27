// ============================================================
//  Hợp đồng chung cho mọi provider AI.
//  Adapter có nhiệm vụ che đi khác biệt (auth · system prompt · ép JSON · trần token ·
//  usage · lý do dừng) và quy tất cả về AiRequest → AiResult / AiError.
// ============================================================
import type { ProviderId } from "../models";

/** Số token thực tế provider báo về — nguồn cho bảng ai_usage. */
export type AiUsage = {
  inputTokens: number;
  outputTokens: number;
  /** Amount the provider says it actually charged. OpenRouter reports it per call, which beats
   *  our list-price estimate — it already counts reasoning tokens and tiered pricing. */
  costUsd?: number;
};

export type AiResult = {
  text: string;
  usage: AiUsage | null; // null nếu provider không trả (hiếm) → ghi cost 0
};

/**
 * Binary file sent with the prompt (audio only).
 * Only adapters of providers with the `audio: true` cap accept it (guarded in the hub).
 * Gemini accepts wav · mp3 · aiff · aac · ogg · flac only — convert webm/opus first.
 * 20MB cap; audio costs ~32 tokens per second.
 */
export type AiInline = {
  mimeType: string; // vd "audio/mp3"
  data: string; // base64 (KHÔNG kèm tiền tố data:)
};

export type AiRequest = {
  key: string;
  model: string;
  system?: string;
  prompt: string;
  json?: boolean; // ép trả JSON
  temperature?: number;
  maxOutputTokens?: number; // trần chặn prompt lỗi đốt token (bắt buộc với Anthropic)
  baseUrl?: string; // ghi đè endpoint (vd qua Cloudflare AI Gateway)
  inline?: AiInline; // đính kèm audio — đặt SAU text
};

/**
 * Lỗi đã chuẩn hoá. `retryable = true` nghĩa là lỗi do key/quota/tạm thời → hub nên đổi key.
 * 400 (prompt sai) hay output bị cắt vì trần token thì đổi key vô ích → retryable = false.
 */
export class AiError extends Error {
  status: number;
  retryable: boolean;
  constructor(status: number, message: string, retryable: boolean) {
    super(message);
    this.name = "AiError";
    this.status = status;
    this.retryable = retryable;
  }
}

export type AiProvider = {
  id: ProviderId;
  generate(req: AiRequest): Promise<AiResult>;
};

/** Lỗi mạng → coi là tạm thời, cho phép đổi key. Dùng chung cho mọi adapter. */
export function netError(e: unknown): AiError {
  return new AiError(0, `Network: ${(e as Error).message}`, true);
}

/**
 * Quy tắc chung: 429 (quota) / 403 (key hết hạn) / 5xx (server) → đổi key giúp được.
 * 400/401/404 → đổi key vô ích.
 */
export const isRetryableStatus = (status: number) =>
  status === 429 || status === 403 || status >= 500;
