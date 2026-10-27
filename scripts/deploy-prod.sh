#!/usr/bin/env bash
# ============================================================
#  Production deploy (Cloudflare Worker + SPA)
# ------------------------------------------------------------
#  One command: typecheck → i18n check → build web → apply remote D1 migrations → sample content on an
#  empty database → wrangler deploy → smoke test.
#  Idempotent and non-interactive. See docs/DEPLOY.md.
#
#  Usage:
#    bash scripts/deploy-prod.sh                  # full deploy
#    bash scripts/deploy-prod.sh --skip-typecheck
#    bash scripts/deploy-prod.sh --skip-migrate
#    bash scripts/deploy-prod.sh --skip-seed      # never load sample content into an empty database
#    bash scripts/deploy-prod.sh --skip-smoke     # no smoke test (cloudflare-setup runs its own after secrets)
#    pnpm deploy:prod                             # same thing
#
#  Credentials: CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID from the environment, or from a
#  gitignored .deploy.env (KEY=VALUE) at the repo root.
#  Smoke-test URL: PROD_URL, else PUBLIC_BASE_URL from the wrangler config.
#  WRANGLER_CONFIG: another config file in apps/api (e.g. wrangler.prod.local.toml, gitignored) so
#  your real resource IDs never have to be committed.
# ============================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"
CONFIG="${WRANGLER_CONFIG:-wrangler.toml}"
TOML="$ROOT/apps/api/$CONFIG"
[ -f "$TOML" ] || { echo "Missing $TOML"; exit 1; }

DO_TYPECHECK=1
DO_MIGRATE=1
DO_SEED=1
DO_SMOKE=1
for arg in "$@"; do
  case "$arg" in
    --skip-typecheck) DO_TYPECHECK=0 ;;
    --skip-migrate)   DO_MIGRATE=0 ;;
    --skip-seed)      DO_SEED=0 ;;
    --skip-smoke)     DO_SMOKE=0 ;;
    -h|--help) awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "$0"; exit 0 ;;
    *) echo "Unknown argument: $arg (see --help)"; exit 2 ;;
  esac
done

if [ -t 1 ]; then C_B="\033[1m"; C_G="\033[32m"; C_Y="\033[33m"; C_R="\033[31m"; C_0="\033[0m"; else C_B=; C_G=; C_Y=; C_R=; C_0=; fi
step() { echo -e "\n${C_B}▸ $*${C_0}"; }
ok()   { echo -e "${C_G}✓ $*${C_0}"; }
warn() { echo -e "${C_Y}⚠ $*${C_0}"; }
die()  { echo -e "${C_R}✘ $*${C_0}" >&2; exit 1; }

# Values read straight from wrangler.toml, so this script never drifts from the config.
toml_get() { grep -E "^$1[[:space:]]*=" "$TOML" | head -1 | sed -E 's/^[^=]*=[[:space:]]*"?([^"]*)"?.*/\1/'; }
WORKER="$(toml_get name)"
DB_NAME="$(toml_get database_name)"
PROD_URL="${PROD_URL:-$(toml_get PUBLIC_BASE_URL)}"
[ -n "$WORKER" ] && [ -n "$DB_NAME" ] || die "Could not read name / database_name from $TOML"
grep -q 'database_id = "00000000-0000-0000-0000-000000000000"' "$TOML" && die "Set database_id in $CONFIG first (wrangler d1 create $DB_NAME)"

# ---- 1) Cloudflare credentials ----
step "Loading Cloudflare credentials"
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -f "$ROOT/.deploy.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/.deploy.env"
  set +a
  ok "Loaded .deploy.env"
fi
[ -n "${CLOUDFLARE_API_TOKEN:-}" ]  || die "Missing CLOUDFLARE_API_TOKEN (env or .deploy.env)"
[ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ] || die "Missing CLOUDFLARE_ACCOUNT_ID"
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
ok "Worker: $WORKER · D1: $DB_NAME · config: $CONFIG"

WRANGLER="pnpm --filter @msyen/api exec wrangler --config $CONFIG"

# ---- 2) Typecheck + AI contract check ----
if [ "$DO_TYPECHECK" = 1 ]; then
  step "Typecheck"
  pnpm -r typecheck || die "Typecheck failed"
  # AI prompts are strings and schemas are types: a mismatch typechecks clean and only breaks
  # once a learner submits.
  step "AI task JSON contracts"
  node "$ROOT/scripts/check-ai-contracts.mjs" || die "An AI prompt disagrees with its schema"
  step "UI i18n (no hardcoded Vietnamese)"
  node "$ROOT/scripts/check-i18n.mjs" || die "Hardcoded UI text found — move it to apps/web/src/i18n (docs/I18N.md)"
  ok "Clean"
else
  warn "Skipping typecheck (--skip-typecheck)"
fi

# ---- 3) Build the SPA (served by the Worker) ----
step "Building web"
pnpm --filter @msyen/web build || die "Web build failed"
ASSET="$(grep -oE 'index-[A-Za-z0-9_-]+\.js' "$ROOT/apps/web/dist/index.html" | head -1)"
[ -n "$ASSET" ] || die "No asset found in dist/index.html"
ok "Built · $ASSET"

# ---- 4) Remote D1 migrations (only the pending ones run) ----
if [ "$DO_MIGRATE" = 1 ]; then
  step "Applying D1 migrations (remote)"
  $WRANGLER d1 migrations apply "$DB_NAME" --remote || die "Migration failed"
  ok "D1 up to date"
else
  warn "Skipping migrations (--skip-migrate)"
fi

# ---- 4b) First install: sample content into an empty database (never overwrites existing data) ----
if [ "$DO_SEED" = 1 ]; then
  step "Sample content (only when the database is empty)"
  WRANGLER_CONFIG="$CONFIG" node "$ROOT/scripts/db-bootstrap.mjs" --remote --skip-migrate || die "Seeding failed"
else
  warn "Skipping sample content (--skip-seed)"
fi

# ---- 5) Deploy ----
# A token without Zone permissions makes wrangler exit non-zero at the custom-domain step even
# though the Worker was uploaded; treat that case as a warning.
step "Deploying Worker ($WORKER)"
DEPLOY_LOG="$(mktemp)"
if $WRANGLER deploy 2>&1 | tee "$DEPLOY_LOG"; then
  ok "wrangler deploy OK"
elif grep -q "Uploaded $WORKER" "$DEPLOY_LOG"; then
  warn "Worker uploaded; only the custom-domain binding failed (token lacks Zone permissions)."
else
  rm -f "$DEPLOY_LOG"
  die "Deploy failed — see the log above"
fi
rm -f "$DEPLOY_LOG"

# ---- 6) Smoke test ----
[ "$DO_SMOKE" = 1 ] || { echo -e "\n${C_G}${C_B}✓ Deployed${C_0}"; exit 0; }
case "$PROD_URL" in
  http://localhost*|"") warn "PUBLIC_BASE_URL is still local — set it (or PROD_URL) to smoke-test production"; exit 0 ;;
esac
step "Smoke test — $PROD_URL"
LIVE_ASSET="$(curl -fsS "$PROD_URL/" | grep -oE 'index-[A-Za-z0-9_-]+\.js' | head -1 || true)"
API_CODE="$(curl -sS -o /dev/null -w '%{http_code}' "$PROD_URL/api/v1/auth/me" || true)"
[ "$LIVE_ASSET" = "$ASSET" ] && ok "New build is live ($LIVE_ASSET)" \
                             || warn "Live asset ($LIVE_ASSET) differs from the build ($ASSET) — the CDN may lag a few seconds"
[ "$API_CODE" = "401" ] && ok "API answers (auth/me → 401 when signed out)" \
                         || warn "auth/me → $API_CODE (expected 401)"
echo -e "\n${C_G}${C_B}✓ Deployed → $PROD_URL${C_0}"
