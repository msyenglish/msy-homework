// Sổ đăng ký provider: 3 adapter phục vụ 5 provider.
import type { ProviderId } from "../models";
import { anthropicProvider } from "./anthropic";
import { geminiProvider } from "./gemini";
import { deepseekProvider, openaiProvider, openrouterProvider, xaiProvider } from "./openaiCompat";
import type { AiProvider } from "./types";

export const PROVIDERS: Record<ProviderId, AiProvider> = {
  google: geminiProvider,
  openai: openaiProvider,
  deepseek: deepseekProvider,
  xai: xaiProvider,
  anthropic: anthropicProvider,
  openrouter: openrouterProvider,
};

export * from "./types";
