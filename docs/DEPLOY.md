# Cài lên Cloudflare

Toàn bộ app chạy trong gói miễn phí của Cloudflare với lượng dùng của một vài lớp học.

## Cách nhanh: một lệnh

Hướng dẫn từng bước cho người mới (tài khoản Cloudflare, bật R2, lấy token, đăng nhập Google, backup):
[`SETUP.md`](SETUP.md) — cũng xem được ở trang `/setup` của app (ví dụ https://free.msyen.com/setup).

Không cần cài gì trước; thay `<TOKEN_CLOUDFLARE>` bằng API token Cloudflare và — khi repo còn private —
`<API_DEPLOY>` bằng khoá chỉ-đọc (xem mục dưới). macOS / Linux — Terminal:

```bash
curl -fsSL https://free.msyen.com/install.sh | bash -s -- --key <API_DEPLOY> <TOKEN_CLOUDFLARE>
```

Windows — PowerShell:

```powershell
$env:API_DEPLOY = "<API_DEPLOY>"; $env:CF_TOKEN = "<TOKEN_CLOUDFLARE>"; irm https://free.msyen.com/install.ps1 | iex
```

`/install.sh` và `/install.ps1` được app phát ở gốc mọi bản cài (chép từ `scripts/` lúc build), nên lệnh
chạy được cả khi repo GitHub còn private. Repo public thì bỏ phần `--key` / `$env:API_DEPLOY`.

Máy chưa có git hoặc Node.js thì script tự cài: git qua trình quản lý gói (Linux, có thể hỏi mật khẩu
máy), Command Line Tools của Apple (macOS, bấm "Install" ở hộp thoại hiện ra) hoặc winget (Windows);
Node.js 22 bản chính thức vào `~/.english-homework/node` (không cần quyền quản trị, không đụng Node có
sẵn). Sau đó tải mã nguồn vào `./english-homework`, cài gói rồi chạy `pnpm cf:setup <TOKEN_CLOUDFLARE>`.

Ngoài token, script **không hỏi gì**: tên app `msy-homework`, địa chỉ `https://msy-homework.<tên>.workers.dev`
(tài khoản chưa có tên `workers.dev` thì tự tạo theo tên tài khoản; đặt tên khác: `WORKERS_SUBDOMAIN=…`).
Domain riêng (đã nằm trong cùng tài khoản Cloudflare, token thêm quyền **Zone** · DNS: Edit và Workers
Routes: Edit): thêm `--domain hoc.truongcuaban.com` vào cuối lệnh, hoặc chạy lại
`pnpm cf:setup --domain …` sau này. Đổi tên app: `--name ten-khac`.

Script tạo D1, R2, các queue (đã có thì dùng lại) → sinh `apps/api/wrangler.prod.local.toml` từ
`wrangler.toml` → build → migrate → nạp dữ liệu mẫu → deploy → tạo `JWT_SECRET` / `CRON_SECRET` → tạo tài
khoản mặc định → kiểm tra app. Mọi lựa chọn lưu ở `.deploy.env` trong thư mục cài (trong đó có API token).

**Tài khoản mặc định** (chỉ một, tạo khi chưa có giáo viên nào): `admin@msyen.com` / `msyen123`. Đăng nhập
rồi đổi email/mật khẩu ở **Cài đặt → Tài khoản**. Muốn khác ngay từ đầu: đặt `TEACHER_EMAIL` /
`TEACHER_PASSWORD` trước khi chạy.

**Học viên demo** (chỉ lần cài đầu, bỏ bằng `--no-demo`): `learner@msyen.com` / `msyen123`, trong lớp
**Demo Class**, đã có khoảng hai tuần học (bài giao, bài làm, từ vựng, ngữ pháp, báo cáo tháng). Tạo lại hoặc
thêm cho bản cài cũ: `pnpm cf:demo --reset` (đăng nhập giáo viên bằng tài khoản trong `.deploy.env`, hoặc đặt
`TEACHER_EMAIL` / `TEACHER_PASSWORD`).

R2 chưa bật thì script in link thẳng tới trang R2 của tài khoản và **chờ**: bật xong (gói miễn phí,
Cloudflare có thể đòi thêm thẻ) bấm Enter là chạy tiếp. Tài khoản chưa bật **Analytics Engine** thì script
tự bỏ phần ghi nhật ký chống lạm dụng (chỉ để theo dõi spam) và deploy tiếp — không cần làm gì; muốn bật
lại: bật Analytics Engine trên dashboard, xoá dòng `NO_ANALYTICS_ENGINE=1` trong `.deploy.env`, chạy
`pnpm cf:update`.

### Repo còn private: dùng deploy key

Khi repo chưa public, người cài cần một **deploy key** — khoá SSH chỉ-đọc, chỉ có quyền trên đúng repo này.
Chủ dự án làm một lần:

1. Tạo khoá (không đặt mật khẩu) và thêm **khoá công khai** ở GitHub → repo → *Settings* → *Deploy keys* →
   *Add deploy key* (để trống *Allow write access*):

   `ssh-keygen -t ed25519 -N "" -C "msy-homework deploy (read-only)" -f ~/.ssh/msy_homework_deploy`

2. Đổi **khoá riêng** thành **một dòng** — đây là `<API_DEPLOY>` gửi cho người cài:

   `base64 -w0 ~/.ssh/msy_homework_deploy` (Linux) · `base64 -i ~/.ssh/msy_homework_deploy | tr -d '\n'` (macOS)

Người cài dán nó vào lệnh (`--key <API_DEPLOY>` hoặc `$env:API_DEPLOY`). Script ghi khoá vào
`~/.ssh/msy_homework_deploy` và vào cấu hình git của bản cài, nên `pnpm cf:update` sau này tự kéo bản mới.
Thu hồi: xoá deploy key trên GitHub — mọi bản cài dùng khoá đó mất quyền kéo bản mới ngay (app đang chạy
không bị ảnh hưởng).

**Cập nhật bản mới** — một lệnh, trong thư mục đã cài:

```bash
pnpm cf:update
```

Lệnh này backup D1 (vào `backups/` và R2) → tải bản mới → cài gói → sinh lại cấu hình (bản mới cần thêm queue/tài nguyên thì tự tạo) →
migrate → nạp gói dữ liệu mẫu mới → deploy. Dữ liệu, secret và tài khoản giữ nguyên. Code đã sửa trong
thư mục cài đặt được tự lưu thành commit rồi đặt lại lên bản mới (`git rebase`); nếu bản mới sửa đúng chỗ
đó, lệnh dừng trước khi deploy và báo file xung đột. `pnpm cf:update --reset` bỏ chỗ sửa riêng, lấy đúng
bản phát hành.

**Backup** — `pnpm cf:backup` xuất toàn bộ D1 ra `backups/<tên>-<thời-điểm>.sql` và đẩy một bản lên R2
(`backups/d1/`). `pnpm cf:update` tự backup trước mỗi lần cập nhật. Khôi phục mấy ngày gần đây: D1 Time
Travel — `cd apps/api && npx wrangler d1 time-travel restore msy_homework --timestamp=<thời-điểm ISO> --config wrangler.prod.local.toml`.

**Đăng nhập Google cho học viên** — tạo OAuth client (Web application) trong Google Cloud Console với
*Authorized JavaScript origins* = địa chỉ app và *Authorized redirect URIs* =
`<địa-chỉ-app>/api/v1/account/oauth/google/callback`, rồi `pnpm cf:google <client-id> <client-secret>`
(chạy không kèm tham số để script in đúng hai địa chỉ cần dán). Tắt: `pnpm cf:google --off`.

**Quên mật khẩu giáo viên** — trong thư mục đã cài:

```bash
pnpm cf:reset-password                          # chọn tài khoản, tự sinh mật khẩu mới
pnpm cf:reset-password you@example.com 'mat-khau-moi'
```

Lệnh dùng token đã lưu trong `.deploy.env`, chỉ đổi mật khẩu (giữ nguyên tên, dữ liệu) và báo lỗi nếu
email không tồn tại.

Mọi bước đều chạy lại được an toàn: lỗi giữa chừng thì sửa nguyên nhân rồi chạy lại cùng lệnh.
`pnpm cf:setup --dry-run` in kế hoạch và cấu hình sẽ sinh ra mà không tạo gì.

Phần dưới là cách làm tay từng bước, cho ai muốn tự kiểm soát.

## 1. Tài nguyên

Đăng nhập `npx wrangler login` (hoặc dùng API token, xem bước 4), rồi trong `apps/api`:

```bash
npx wrangler d1 create english_homework           # in ra database_id
npx wrangler r2 bucket create english-homework
npx wrangler queues create english-homework-ai-jobs
npx wrangler queues create english-homework-interactive-jobs
npx wrangler queues create english-homework-content-jobs
```

Mở `apps/api/wrangler.toml`:

- Dán `database_id` vừa nhận.
- Đổi `PUBLIC_BASE_URL` thành địa chỉ app (ví dụ `https://homework.example.com`, hoặc
  `https://english-homework.<tài-khoản>.workers.dev` nếu không dùng domain riêng).
- Muốn dùng domain riêng: bỏ comment khối `[[routes]]` và điền domain (domain phải nằm trong tài khoản
  Cloudflare của bạn).
- Đổi tên Worker / D1 / bucket / queue thì đổi đồng loạt trong file này và ở `apps/api/package.json`
  (`db:migrate:*`, `db:seed`) cùng `apps/api/seed/create-teacher.mjs`.

## 2. Secrets

```bash
cd apps/api
openssl rand -base64 32 | npx wrangler secret put JWT_SECRET
# Key AI: dán ở /teacher/ai → tab Key sau khi deploy (lưu mã hoá trong D1).
# Hoặc đặt bằng secret: GEMINI_/OPENAI_/ANTHROPIC_/OPENROUTER_/DEEPSEEK_/XAI_API_KEYS
npx wrangler secret put AZURE_SPEECH_KEY       # tuỳ chọn: TTS + chấm phát âm (hoặc dán ở tab Key)
npx wrangler secret put AZURE_SPEECH_REGION    # ví dụ southeastasia
npx wrangler secret put CRON_SECRET            # tuỳ chọn: gọi /api/v1/cron/* từ ngoài
```

Tuỳ chọn khác: `RESEND_API_KEY` (email quên mật khẩu), `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` /
`GOOGLE_REDIRECT_URI` (đăng nhập Google, redirect `https://<domain>/api/v1/account/oauth/google/callback`),
`PEXELS_API_KEY` / `PIXABAY_API_KEY` (tìm ảnh trong trình soạn bài).

Key nhiều cái thì phân cách bằng dấu phẩy — app tự xoay vòng và chuyển key khi một key hết hạn mức.

## 3. Deploy lần đầu

```bash
# từ thư mục gốc repo
export CLOUDFLARE_API_TOKEN=...      # hoặc ghi vào .deploy.env (đã gitignore)
export CLOUDFLARE_ACCOUNT_ID=...
pnpm deploy:prod
```

Script chạy: typecheck → kiểm hợp đồng JSON của prompt AI → build web → áp migration D1 remote →
nạp gói dữ liệu mẫu còn thiếu → `wrangler deploy` → smoke test vào `PUBLIC_BASE_URL`.

Dữ liệu mẫu chia thành các gói `apps/api/seed/content/NNNN_ten.sql`, áp theo thứ tự như migration và
mỗi gói chỉ áp **một lần** (ghi ở `settings.seed_packs`): bản cài mới nhận đủ, bản cài cũ chỉ nhận gói
mới thêm, nội dung mẫu đã xoá trong app không bị nạp lại. Không muốn dữ liệu mẫu:
`pnpm deploy:prod -- --skip-seed`.

Sau lần deploy đầu, tạo tài khoản giáo viên (script nhắc lệnh này khi chưa có giáo viên nào):

```bash
cd apps/api
node seed/create-teacher.mjs you@example.com 'mat-khau-manh' 'Tên của bạn' --remote
```

Dữ liệu mẫu gồm 7 cấp CEFR, cây chủ đề, 35 điểm ngữ pháp phổ biến và lộ trình Pre-A1 + A1 (164 bài), cùng 3 bài video nghe-viết + shadowing từ TED Talks (xếp ở Pre A1 để học viên mới thấy ngay trên kệ video).
Bài nghe chưa có audio — cron mỗi giờ tự tạo bằng Azure khi đã cấu hình key.

## 4. API token

Tạo token ở Cloudflare Dashboard → My Profile → API Tokens, quyền:

- **Account** · Workers Scripts : Edit · D1 : Edit · Workers R2 Storage : Edit · Queues : Edit
- Dùng domain riêng: thêm **Zone** · DNS : Edit cho zone đó (token "All account resources" **không** kèm
  quyền Zone).

Nếu token thiếu quyền Zone, `wrangler deploy` báo lỗi ở bước gắn domain dù Worker đã upload — script coi
đó là cảnh báo.

## 5. Sau khi chạy

- Vào `/teacher/ai` chọn model mặc định và model cho từng tác vụ (lưu trong D1, có hiệu lực ngay).
- Mở **Cài đặt** (menu tài khoản giáo viên) để bật nhận xét tự động, thông báo Telegram (tuỳ chọn).
- Học viên tự đăng ký ở `/u/login`; giáo viên xếp em vào lớp ở trang **Học viên → Lớp học**.

## Cập nhật

`git pull && pnpm install && pnpm deploy:prod` — migration mới tự áp.

## Đếm số bản cài

Sau khi deploy, `cf:setup` gửi `{url, event: "install" | "update", version}` tới
`https://free.msyen.com/api/v1/installs/ping`; cron của Worker gửi lại `event: "daily"` mỗi ngày một lần.
Không gửi gì khác. Tắt: `pnpm cf:setup --update --no-telemetry` (ghi `TELEMETRY=off` vào `.deploy.env` và
biến `TELEMETRY = "off"` của Worker).

Phía nhận chỉ chạy khi `PUBLIC_BASE_URL` là `https://free.msyen.com` (`apps/api/src/lib/installPing.ts`):
kiểm tra `<url>/api/v1/health` trả `ok`, ghi bảng `installs` trong D1, báo cài mới / cập nhật qua Telegram
đã cấu hình ở **Cài đặt → Telegram** (cần bật công tắc). Danh sách bản cài nằm ngay dưới phần Telegram đó.

## Lưu ý

- `pnpm -r typecheck` xanh **chưa chắc** build xanh; script deploy luôn build.
- Gemini bị chặn ở một số vùng egress của Worker (`User location is not supported`). Khi gặp, trỏ
  `GEMINI_BASE_URL` qua một proxy ở vùng được hỗ trợ, hoặc dùng nhà cung cấp khác — xem
  [`AI_GATEWAY.md`](AI_GATEWAY.md).
