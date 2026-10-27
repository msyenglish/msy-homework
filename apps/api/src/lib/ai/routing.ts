// ============================================================
//  Điều phối: tác vụ nào chạy provider/model nào.
//  Cấu hình nằm ở D1 (bảng `settings`), KHÔNG ở env — để trang admin /teacher/ai
//  đổi được mà KHÔNG cần deploy lại. Env chỉ giữ key (secret) + baseUrl.
// ============================================================
import { inArray } from "drizzle-orm";
import type { Db } from "../../db";
import { schema } from "../../db";
import type { Bindings } from "../env";
import { findModelIn, isProviderId, type ModelInfo, type ProviderId } from "./models";
import { listModels } from "./registry";
import { AI_TASKS, type AiTaskName } from "./tasks";

export type Route = { provider: ProviderId; model: string };

/** Chốt cuối cùng khi mọi thứ khác trống — đúng hành vi trước khi có AI Gateway. */
export const HARD_DEFAULT: Route = { provider: "google", model: "gemini-3.1-flash-lite" };

const KEY_DEFAULT = "ai_default";
const KEY_ROUTES = "ai_routes";

export type RoutingConfig = {
  default: Route;
  routes: Partial<Record<AiTaskName, Route>>; // ONLY the tasks that override the default
  /** The model registry read alongside the routes — see `modelOf`. */
  models: ModelInfo[];
};

function parseRoute(raw: string | null | undefined, models: ModelInfo[]): Route | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!isProviderId(v?.provider) || typeof v?.model !== "string") return null;
    if (!findModelIn(models, v.provider, v.model)) return null; // model removed from the registry
    return { provider: v.provider, model: v.model };
  } catch {
    return null;
  }
}

/** Model info for a route from the registry. */
export const modelOf = (cfg: RoutingConfig, route: Route): ModelInfo | undefined =>
  findModelIn(cfg.models, route.provider, route.model);

/** Reads the routing config from `settings`. Missing / corrupt → fall back, never throw. */
export async function getRoutingConfig(db: Db): Promise<RoutingConfig> {
  const [rows, models] = await Promise.all([
    db.select().from(schema.settings).where(inArray(schema.settings.key, [KEY_DEFAULT, KEY_ROUTES])),
    listModels(db),
  ]);
  const m = new Map(rows.map((r) => [r.key, r.value]));

  const def = parseRoute(m.get(KEY_DEFAULT), models) ?? HARD_DEFAULT;

  const routes: Partial<Record<AiTaskName, Route>> = {};
  try {
    const raw = JSON.parse(m.get(KEY_ROUTES) || "{}");
    for (const [task, val] of Object.entries(raw ?? {})) {
      if (!(task in AI_TASKS)) continue; // task removed from the registry
      const r = parseRoute(JSON.stringify(val), models);
      if (r) routes[task as AiTaskName] = r;
    }
  } catch {
    /* corrupt JSON → treat as no overrides */
  }

  return { default: def, routes, models };
}

export async function setRoutingConfig(db: Db, cfg: Pick<RoutingConfig, "default" | "routes">): Promise<void> {
  const patch: Record<string, string> = {
    [KEY_DEFAULT]: JSON.stringify(cfg.default),
    [KEY_ROUTES]: JSON.stringify(cfg.routes),
  };
  for (const [key, value] of Object.entries(patch)) {
    await db
      .insert(schema.settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value } });
  }
}

/**
 * Chốt route cho 1 task: ghi đè riêng → mặc định → chốt cứng.
 *
 * GUARD LÚC CHẠY: task cần audio mà route trỏ model không nghe
 * được (catalog đổi, DB sửa tay) → tự rơi về model có audio. KHÔNG được để bài nói chết
 * vì cấu hình sai.
 */
export function resolveRoute(cfg: RoutingConfig, name: AiTaskName): Route {
  const task = AI_TASKS[name];
  let route = cfg.routes[name] ?? cfg.default;

  // Tác vụ chạy ở dịch vụ ngoài: hãng không nằm trong danh sách hỗ trợ thì
  // rơi về mặc định, không để cuộc gọi chết vì một lần chọn nhầm ở trang admin.
  if (task?.onlyProviders && !task.onlyProviders.includes(route.provider)) {
    const fallback = task.onlyProviders.includes(cfg.default.provider) ? cfg.default : HARD_DEFAULT;
    console.error(
      `[ai/routing] Tác vụ "${name}" chỉ chạy với ${task.onlyProviders.join("/")} nhưng route trỏ ${route.provider} → dùng ${fallback.model}`,
    );
    route = fallback;
  }

  if (task?.needsAudio && !modelOf(cfg, route)?.audio) {
    const fallback = modelOf(cfg, cfg.default)?.audio ? cfg.default : HARD_DEFAULT;
    console.error(
      `[ai/routing] Tác vụ "${name}" cần audio nhưng route trỏ ${route.model} (không nghe được) → dùng ${fallback.model}`,
    );
    route = fallback;
  }
  return route;
}

/** Tên biến môi trường chứa key của từng provider. `google` giữ tên cũ để khỏi rotate secret đang chạy. */
export const KEY_ENV: Record<ProviderId, keyof Bindings> = {
  google: "GEMINI_API_KEYS",
  openai: "OPENAI_API_KEYS",
  deepseek: "DEEPSEEK_API_KEYS",
  xai: "XAI_API_KEYS",
  anthropic: "ANTHROPIC_API_KEYS",
  openrouter: "OPENROUTER_API_KEYS",
};

export const BASE_URL_ENV: Record<ProviderId, keyof Bindings> = {
  google: "GEMINI_BASE_URL",
  openai: "OPENAI_BASE_URL",
  deepseek: "DEEPSEEK_BASE_URL",
  xai: "XAI_BASE_URL",
  anthropic: "ANTHROPIC_BASE_URL",
  openrouter: "OPENROUTER_BASE_URL",
};

export const envKeys = (env: Bindings, p: ProviderId): string => (env[KEY_ENV[p]] as string) || "";
export const envBaseUrl = (env: Bindings, p: ProviderId): string | undefined =>
  (env[BASE_URL_ENV[p]] as string) || undefined;
