#!/usr/bin/env bash
# One-line install of MSY Homework on Cloudflare (macOS / Linux):
#   curl -fsSL https://free.msyen.com/install.sh | bash -s -- <TOKEN_CLOUDFLARE>
#   … | bash -s -- <TOKEN_CLOUDFLARE> --domain hoc.truongcuaban.com
# While the repository is private, add the read-only deploy key (one base64 line from the owner):
#   curl -fsSL https://free.msyen.com/install.sh | bash -s -- --key <API_DEPLOY> <TOKEN_CLOUDFLARE>
# (the same file is at raw.githubusercontent.com/msyenglish/msy-homework/main/scripts/install.sh once public)
# Every other argument goes to `pnpm cf:setup`; CF_TOKEN / API_DEPLOY in the environment work too.
# Installs what is missing — git (package manager / Apple's Command Line Tools) and Node.js 22
# (official build, checksum-verified, into ~/.english-homework/node, no admin rights) — then
# enables pnpm, clones the repo into ./english-homework (or updates an existing clone), installs
# dependencies and runs `pnpm cf:setup`. The deploy key is written to ~/.ssh/msy_homework_deploy and
# into the clone's git config, so `pnpm cf:update` keeps pulling with it.
# Windows: use install.ps1 instead.
set -euo pipefail

say() { printf '\033[1m▸ %s\033[0m\n' "$*"; }
ok() { printf '\033[32m✓ %s\033[0m\n' "$*"; }
die() { printf '\033[31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

# `--key <API_DEPLOY>` is ours; everything else is passed on to cf:setup.
KEY_B64="${API_DEPLOY:-}"
PASS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --key) KEY_B64="${2:-}"; shift 2 || shift ;;
    --key=*) KEY_B64="${1#--key=}"; shift ;;
    *) PASS+=("$1"); shift ;;
  esac
done
set -- ${PASS[@]+"${PASS[@]}"}

DEPLOY_KEY="${DEPLOY_KEY:-}"
if [ -n "$KEY_B64" ]; then
  # One base64 line → the private key file (pasting a multi-line key into a command does not work).
  mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
  DEPLOY_KEY="$HOME/.ssh/msy_homework_deploy"
  printf '%s' "$KEY_B64" | tr -d ' \n\r' | { base64 -d 2>/dev/null || base64 -D; } > "$DEPLOY_KEY" 2>/dev/null || true
  grep -q "PRIVATE KEY" "$DEPLOY_KEY" 2>/dev/null || die "API_DEPLOY không đúng — copy lại nguyên dòng key được cấp."
  chmod 600 "$DEPLOY_KEY"
fi
if [ -n "$DEPLOY_KEY" ]; then
  DEPLOY_KEY="${DEPLOY_KEY/#\~/$HOME}"
  [ -r "$DEPLOY_KEY" ] || die "Không đọc được deploy key: $DEPLOY_KEY"
  chmod 600 "$DEPLOY_KEY" 2>/dev/null || true
  SSH_CMD="ssh -i $DEPLOY_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
  export GIT_SSH_COMMAND="$SSH_CMD"
fi
REPO="${REPO:-$([ -n "$DEPLOY_KEY" ] && echo git@github.com:msyenglish/msy-homework.git || echo https://github.com/msyenglish/msy-homework.git)}"
DIR="${DIR:-english-homework}"
NODE_HOME="$HOME/.english-homework/node"
NODE_LINE="latest-v22.x"

# Prompts read from the terminal, not from the pipe this script arrived through. A machine with no
# terminal (CI, a container) has a /dev/tty that cannot be opened: run without input there — with the
# token on the command line nothing is asked anyway.
if (: < /dev/tty) 2>/dev/null; then TTY=/dev/tty; else TTY=/dev/null; fi

as_root() {
  if [ "$(id -u)" = 0 ]; then "$@"
  elif command -v sudo >/dev/null; then echo "  (cần quyền quản trị — máy có thể hỏi mật khẩu đăng nhập)"; sudo "$@" < "$TTY"
  else die "Cần quyền quản trị để cài $* — cài tay rồi chạy lại."
  fi
}

# ---------- git ----------
ensure_git() {
  # On macOS `git` exists as a stub that only opens the installer, so ask it for a version.
  if git --version >/dev/null 2>&1; then return; fi
  say "Cài git"
  case "$(uname -s)" in
    Darwin)
      if command -v brew >/dev/null; then brew install git
      else
        xcode-select --install >/dev/null 2>&1 || true
        echo "  Một hộp thoại của Apple vừa mở: bấm \"Install\" và đợi cài xong (vài phút)."
        for _ in $(seq 1 180); do git --version >/dev/null 2>&1 && break; sleep 10; done
      fi ;;
    Linux)
      if command -v apt-get >/dev/null; then as_root apt-get update -qq && as_root apt-get install -y -qq git
      elif command -v dnf >/dev/null; then as_root dnf install -y -q git
      elif command -v yum >/dev/null; then as_root yum install -y -q git
      elif command -v apk >/dev/null; then as_root apk add --no-cache git
      elif command -v pacman >/dev/null; then as_root pacman -Sy --noconfirm git
      elif command -v zypper >/dev/null; then as_root zypper -q install -y git
      else die "Không nhận ra trình quản lý gói — cài git tay rồi chạy lại."
      fi ;;
    *) die "Hệ điều hành chưa hỗ trợ — trên Windows dùng scripts/install.ps1." ;;
  esac
  git --version >/dev/null 2>&1 || die "Chưa cài được git — cài tay rồi chạy lại."
  ok "$(git --version)"
}

# ---------- Node.js ----------
node_ok() { command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ]; }

ensure_node() {
  [ -x "$NODE_HOME/bin/node" ] && export PATH="$NODE_HOME/bin:$PATH"
  if node_ok; then return; fi
  say "Cài Node.js 22 (bản chính thức, vào $NODE_HOME — không cần quyền quản trị)"
  local os arch file tmp
  case "$(uname -s)" in Darwin) os=darwin ;; Linux) os=linux ;; *) die "Hệ điều hành chưa hỗ trợ." ;; esac
  case "$(uname -m)" in x86_64|amd64) arch=x64 ;; arm64|aarch64) arch=arm64 ;; *) die "Kiến trúc máy $(uname -m) chưa hỗ trợ." ;; esac
  tmp="$(mktemp -d)"
  curl -fsSL "https://nodejs.org/dist/$NODE_LINE/SHASUMS256.txt" -o "$tmp/SHASUMS256.txt"
  file="$(grep -oE "node-v[0-9.]+-$os-$arch\.tar\.gz" "$tmp/SHASUMS256.txt" | head -1)"
  [ -n "$file" ] || die "Không tìm thấy bản Node cho $os-$arch."
  curl -fSL --progress-bar "https://nodejs.org/dist/$NODE_LINE/$file" -o "$tmp/$file"
  # Refuse a download that does not match the published checksum.
  (cd "$tmp" && grep " $file\$" SHASUMS256.txt | { if command -v sha256sum >/dev/null; then sha256sum -c -; else shasum -a 256 -c -; fi; } >/dev/null) \
    || die "Bản Node tải về không khớp checksum — thử lại sau."
  rm -rf "$NODE_HOME" && mkdir -p "$NODE_HOME"
  tar -xzf "$tmp/$file" -C "$NODE_HOME" --strip-components=1
  rm -rf "$tmp"
  export PATH="$NODE_HOME/bin:$PATH"
  # Later shells (`pnpm cf:update`) need it on PATH too.
  local line="export PATH=\"$NODE_HOME/bin:\$PATH\""
  for rc in "$HOME/.bashrc" "$HOME/.zshrc" "$HOME/.profile"; do
    if [ -f "$rc" ] || [ "$rc" = "$HOME/.profile" ]; then
      grep -qF "$NODE_HOME/bin" "$rc" 2>/dev/null || printf '\n# English Homework: Node.js\n%s\n' "$line" >> "$rc"
    fi
  done
  node_ok || die "Chưa cài được Node.js."
  ok "Node $(node -v)"
}

ensure_pnpm() {
  if command -v pnpm >/dev/null; then return; fi
  say "Bật pnpm"
  corepack enable >/dev/null 2>&1 || npm install -g pnpm@9 >/dev/null 2>&1 || die "Không bật được pnpm."
  # corepack asks before downloading pnpm the first time; answer for the user.
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm --version >/dev/null || die "Không chạy được pnpm."
  ok "pnpm $(pnpm --version)"
}

ensure_git
ensure_node
ensure_pnpm
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0

if [ -d "$DIR/.git" ]; then
  say "Đã có ./$DIR — cập nhật"
  cd "$DIR"
  [ -n "$DEPLOY_KEY" ] && git config core.sshCommand "$SSH_CMD"
  if [ -f .deploy.env ]; then
    pnpm install --frozen-lockfile
    exec pnpm cf:update < "$TTY"
  fi
else
  say "Tải mã nguồn vào ./$DIR"
  git clone --depth 1 "$REPO" "$DIR"
  cd "$DIR"
  # Later pulls (pnpm cf:update) reuse the same key.
  [ -n "$DEPLOY_KEY" ] && git config core.sshCommand "$SSH_CMD"
fi

say "Cài gói"
pnpm install --frozen-lockfile
[ -n "${CF_TOKEN:-}" ] && export CLOUDFLARE_API_TOKEN="$CF_TOKEN"
exec pnpm cf:setup "$@" < "$TTY"
