# One-line install of MSY Homework on Cloudflare (Windows, PowerShell):
#   $env:CF_TOKEN = "<TOKEN_CLOUDFLARE>"; irm https://free.msyen.com/install.ps1 | iex
# While the repository is private, also set the read-only deploy key (one base64 line from the owner):
#   $env:API_DEPLOY = "<API_DEPLOY>"; $env:CF_TOKEN = "<TOKEN_CLOUDFLARE>"; irm https://free.msyen.com/install.ps1 | iex
# ($env:CF_DOMAIN = "hoc.truongcuaban.com" for a domain of that Cloudflare account.)
# Installs Git (which also brings the bash the deploy script needs) and Node.js LTS with winget when
# they are missing, enables pnpm, clones the repo into .\english-homework (or updates it) and runs
# `pnpm cf:setup`. The deploy key is kept in the clone's git config for `pnpm cf:update`.
$ErrorActionPreference = "Stop"
$SshCmd = $null
if ($env:API_DEPLOY) {
  # One base64 line → the private key file.
  $SshDir = Join-Path $HOME ".ssh"
  New-Item -ItemType Directory -Force -Path $SshDir | Out-Null
  $KeyFile = Join-Path $SshDir "msy_homework_deploy"
  try { [IO.File]::WriteAllBytes($KeyFile, [Convert]::FromBase64String(($env:API_DEPLOY -replace '\s', ''))) }
  catch { Write-Host "x API_DEPLOY không đúng — copy lại nguyên dòng key được cấp." -ForegroundColor Red; exit 1 }
  if (-not (Select-String -Path $KeyFile -Pattern "PRIVATE KEY" -Quiet)) { Write-Host "x API_DEPLOY không đúng — copy lại nguyên dòng key được cấp." -ForegroundColor Red; exit 1 }
  $env:DEPLOY_KEY = $KeyFile
}
if ($env:DEPLOY_KEY) {
  if (-not (Test-Path $env:DEPLOY_KEY)) { Write-Host "x Không đọc được deploy key: $($env:DEPLOY_KEY)" -ForegroundColor Red; exit 1 }
  $KeyPath = (Resolve-Path $env:DEPLOY_KEY).Path -replace '\\', '/'
  $SshCmd = "ssh -i `"$KeyPath`" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
  $env:GIT_SSH_COMMAND = $SshCmd
}
$DefaultRepo = if ($SshCmd) { "git@github.com:msyenglish/msy-homework.git" } else { "https://github.com/msyenglish/msy-homework.git" }
$Repo = if ($env:REPO) { $env:REPO } else { $DefaultRepo }
$Dir = if ($env:DIR) { $env:DIR } else { "english-homework" }

function Say($m) { Write-Host "> $m" -ForegroundColor Cyan }
function Die($m) { Write-Host "x $m" -ForegroundColor Red; exit 1 }
function Refresh-Path {
  $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
}
function Has($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

if (-not (Has "winget")) { Die "Thiếu winget (App Installer) — cập nhật Windows hoặc cài App Installer từ Microsoft Store rồi chạy lại." }

if (-not (Has "git")) {
  Say "Cài Git"
  winget install --id Git.Git -e --silent --accept-source-agreements --accept-package-agreements | Out-Null
  Refresh-Path
  if (-not (Has "git")) { Die "Chưa cài được Git — mở cửa sổ PowerShell mới rồi chạy lại." }
}

$needNode = $true
if (Has "node") { $needNode = [int]((node -p "process.versions.node.split('.')[0]")) -lt 20 }
if ($needNode) {
  Say "Cài Node.js LTS"
  winget install --id OpenJS.NodeJS.LTS -e --silent --accept-source-agreements --accept-package-agreements | Out-Null
  Refresh-Path
  if (-not (Has "node")) { Die "Chưa cài được Node.js — mở cửa sổ PowerShell mới rồi chạy lại." }
}

$env:COREPACK_ENABLE_DOWNLOAD_PROMPT = "0"
if (-not (Has "pnpm")) {
  Say "Bật pnpm"
  corepack enable 2>$null
  if (-not (Has "pnpm")) { npm install -g pnpm@9 | Out-Null }
  Refresh-Path
}

if (Test-Path "$Dir\.git") {
  Say "Đã có .\$Dir — cập nhật"
  Set-Location $Dir
  if ($SshCmd) { git config core.sshCommand $SshCmd }
  if (Test-Path ".deploy.env") { pnpm install --frozen-lockfile; pnpm cf:update; exit $LASTEXITCODE }
} else {
  Say "Tải mã nguồn vào .\$Dir"
  git clone --depth 1 $Repo $Dir
  Set-Location $Dir
  if ($SshCmd) { git config core.sshCommand $SshCmd }  # later pulls (pnpm cf:update) reuse the key
}

Say "Cài gói"
pnpm install --frozen-lockfile
$SetupArgs = @()
if ($env:CF_TOKEN) { $SetupArgs += $env:CF_TOKEN }
if ($env:CF_DOMAIN) { $SetupArgs += @("--domain", $env:CF_DOMAIN) }
pnpm cf:setup @SetupArgs
exit $LASTEXITCODE
