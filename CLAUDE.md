# CLAUDE.md

Guide for agents working in this repo.

## RULE #0 — LANGUAGE

**Every comment, JSDoc and TODO/FIXME/NOTE marker MUST be written in English.**

| Where | Language |
| --- | --- |
| Code comments, JSDoc, TODO/FIXME/NOTE | **English** |
| Variable / function / type names, test names | **English** |
| Web UI text (labels, buttons, toasts, empty states, placeholders, aria-labels) | **Never inline** — `t("ns.key")` with Vietnamese in `i18n/vi/` + English in `i18n/en/` (RULE #1) |
| Error messages thrown to the user (`HTTPException`) | **Vietnamese** (server messages are not translated yet) |
| Docs in `docs/*.md`, README | **Vietnamese** |

Some legacy files still carry Vietnamese comments; do not add new ones. A `PostToolUse` hook
(`.claude/hooks/check-comment-language.mjs`) rejects a Write/Edit whose new comments contain Vietnamese.

## RULE #1 — THE WEB UI HAS TWO LANGUAGES (vi + en)

Every screen ships in **Vietnamese and English**. Any new or changed UI text in `apps/web/src` goes
through the i18n catalog — never a hardcoded string. Full rules: [`docs/I18N.md`](docs/I18N.md).

- `import { t } from "<relative>/i18n"` → `t("ns.key", { n, name })`. Add the key to **both**
  `apps/web/src/i18n/vi/<ns>.ts` (source text) and `en/<ns>.ts` (`Record<keyof typeof vi, string>`, so a
  missing English key is a type error). Use the screen's existing namespace; a new screen gets a new
  namespace (`vi/` + `en/` pair, then `node scripts/i18n-registry.mjs`). Don't add keys to `common`
  unless the meaning is truly generic.
- English plurals: `"{n} word|{n} words"` and always pass `n`. Each side of `|` is a full sentence.
- Never call `t()` at module level — store a `TKey` in constants and call `t()` while rendering.
- Don't wrap in `tt()` — `t()` already applies the teacher's cô/thầy choice to Vietnamese.
- Not translated: teacher/learner content, DB data values, AI prompt text, Vietnamese sample content
  (e.g. a placeholder for a Vietnamese-meaning field). Mark such a literal with an `i18n-ignore`
  comment on its line or the line above (`i18n-ignore-file` anywhere in a file for prompt/data modules).
- Teachers can override any text at `/teacher/texts` (stored in D1); renaming a key drops their override,
  changing the Vietnamese/English text flags it as stale — prefer adding keys over renaming.
- Check: `cd apps/web && npx tsc --noEmit -p tsconfig.app.json`, `node scripts/check-i18n.mjs` (also run
  by `pnpm deploy:prod`, which stops on a hit), then `pnpm build:web`.

A `PostToolUse` hook (`.claude/hooks/check-ui-i18n.mjs`) rejects a Write/Edit under `apps/web/src`
(outside `i18n/`) that adds a Vietnamese string literal or JSX text without an `i18n-ignore` marker.

Comment style: state **what** the code does, briefly; keep the surrounding comment density. Rationale and
"what changed" belong in the commit message.

## Project

**English Homework** — a free, self-hosted English homework & practice platform for teachers. Teachers
author exercises (by hand or with AI), arrange level paths, assign work to classes, review answers and
export monthly reports. Learners sign up, follow a daily-unlocking path and get graded instantly.

- Architecture: [`docs/OVERVIEW.md`](docs/OVERVIEW.md)
- AI gateway: [`docs/AI_GATEWAY.md`](docs/AI_GATEWAY.md)
- Speech (Azure TTS + pronunciation): [`docs/SPEECH.md`](docs/SPEECH.md)
- Deploy: [`docs/DEPLOY.md`](docs/DEPLOY.md)

## Commands

pnpm 9 monorepo, Node ≥ 20, run from the repo root.

```bash
pnpm install
pnpm oss                  # web :5185 + api :8795; migrates, applies pending seed packs, creates teacher@example.com / teacher123 if none
pnpm dev                  # web :5173 + api (wrangler dev) :8787
pnpm -r typecheck         # NOT enough on its own — see Gotcha 1
pnpm build:web
pnpm db:generate          # after editing apps/api/src/db/schema.ts; commit apps/api/migrations/
pnpm db:migrate:local
pnpm db:seed              # apply pending sample-content packs (local) — see apps/api/seed/content/
pnpm teacher:create <email> <password> [name]
pnpm learner:demo         # with pnpm oss running: learner@example.com / learner123 + class, ~2 weeks of activity (--reset to recreate)
pnpm video:transcribe <youtube-url>  # yt-dlp on this machine → Deepgram via the API → cached transcript for that video
pnpm deploy:prod          # typecheck → AI contract check → build → remote migrate → deploy → smoke test
pnpm cf:setup <token>     # end-user install (asks nothing else): D1/R2/queues, config, secrets, admin@msyen.com, deploy — idempotent
pnpm cf:update            # end-user update: cf:backup → git pull → install → cf:setup --update
pnpm cf:backup            # D1 export to ./backups and the app's R2 (backups/d1/)
pnpm cf:google <id> <secret>  # learner Google sign-in (redirect URL derived from PUBLIC_BASE_URL)
pnpm cf:demo [--reset]    # demo learner learner@msyen.com / msyen123 with ~2 weeks of activity on the live install (cf:setup makes it on a first install)
pnpm cf:reset-password    # end-user: reset a teacher password on the live D1 with the saved token
node scripts/check-ai-contracts.mjs
node scripts/check-i18n.mjs --verbose   # hardcoded Vietnamese UI text in apps/web/src
```

There is no linter; use typecheck + build.

## Architecture

- **One Cloudflare Worker** (`apps/api`, Hono) serves `/api/v1/*` and the built SPA (`[assets]` →
  `../web/dist`). Same-origin, cookie sessions, no CORS in production. Entry: `apps/api/src/index.ts`.
- **D1** (SQLite, Drizzle) · **R2** (audio, images) · **Queues** (`AI_QUEUE`, `INTERACTIVE_QUEUE`,
  `CONTENT_QUEUE`) · hourly cron.
- **`packages/shared`** is the single source of truth for types, zod schemas and grading. The API grades;
  the web only displays. Change shared logic there, never duplicate it.
- Speech goes straight to Azure (`lib/azureSpeech.ts`) and Deepgram (`lib/deepgram.ts`: TTS + transcription); no other speech service.

## Authorization

- Teachers: every `/api/v1/teacher/*` route is behind `requireTeacher` (JWT in httpOnly cookie).
- Learners: `requireUser` on `/library/*` and protected `/account/*` routes. Mount guards on a path
  prefix — a sub-app `use("*")` mounted at `/` leaks the guard onto every later route.
- A learner may only open path exercises already unlocked for them or work assigned to them / their class.
- **Answers never leave the server** before submission: exercise payloads strip `answer` / `accept`.

## Conventions

- Validate every API input with zod (`packages/shared/src/schemas.ts`); throw `HTTPException` with a
  friendly Vietnamese message.
- UI: all text through `t()` (RULE #1); reuse `apps/web/src/components/ui/*`; no emoji in UI or content (lucide icons instead), except the
  answer celebration in `components/practice/VerdictBurst.tsx`.
- D1: JSON in `text({ mode: "json" })`, booleans as integers, ISO timestamps; ~100 bind parameters per
  statement → chunk bulk inserts.
- Sensitive or per-user endpoints use **POST** so an edge cache on public GETs never serves them.

## Gotchas

1. A green `pnpm -r typecheck` does not guarantee a green `pnpm build:web` (tsc -b with project
   references is stricter). Always build.
2. Which model runs which AI task lives in D1 (`settings.ai_default` / `ai_routes`), edited at
   `/teacher/ai` — not in code or env.
3. An AI prompt's `Return JSON: {...}` line must list exactly the keys of its output schema;
   `scripts/check-ai-contracts.mjs` enforces it.
4. Gemini can be geo-blocked from the Worker's egress region; use a proxy via `GEMINI_BASE_URL` or
   another provider.
5. Secrets go through `wrangler secret put` (local: `apps/api/.dev.vars`), never `wrangler.toml`.

## Git

Commit messages in Vietnamese. Only commit when asked; never `git commit -a` (stage explicit paths).
