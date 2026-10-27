// ============================================================
//  Teacher route: overrides of interface copy. Mount: /api/v1/teacher/ui-texts.
// ============================================================
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { UI_LANGS } from "@msyen/shared";
import { getUiTexts, KEY_RE, saveUiTexts } from "../lib/uiTexts";
import type { AppEnv } from "../lib/env";

const r = new Hono<AppEnv>();

const MAX_OVERRIDES = 3000;

r.get("/", async (c) => c.json({ overrides: await getUiTexts(c.env) }));

const patchSchema = z.object({
  lang: z.enum(UI_LANGS as [string, ...string[]]),
  key: z.string().regex(KEY_RE, "Mã văn bản không hợp lệ"),
  // null removes the override (back to the built-in text).
  text: z.string().max(1000).nullable(),
  base: z.string().max(2000).default(""),
});

r.put("/", async (c) => {
  const parsed = patchSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) throw new HTTPException(400, { message: parsed.error.issues[0]?.message || "Dữ liệu không hợp lệ" });
  const { lang, key, text, base } = parsed.data;
  const all = await getUiTexts(c.env);
  const map = { ...(all[lang as keyof typeof all] ?? {}) };
  if (text == null || !text.trim()) delete map[key];
  else {
    if (!map[key] && Object.values(all).reduce((n, m) => n + Object.keys(m ?? {}).length, 0) >= MAX_OVERRIDES) {
      throw new HTTPException(400, { message: "Đã đạt giới hạn số văn bản tuỳ chỉnh" });
    }
    map[key] = { text: text.trim(), base, at: new Date().toISOString() };
  }
  await saveUiTexts(c.env, { ...all, [lang]: map });
  return c.json({ ok: true });
});

export default r;
