# Cập nhật lên bản mới mà không mất phần đã tuỳ chỉnh

## Cái gì được giữ, cái gì bị thay

| Nằm ở đâu | Ví dụ | Khi cập nhật |
| --- | --- | --- |
| Cơ sở dữ liệu D1 | bài tập, ngữ pháp, từ vựng, học viên, điểm | **Giữ nguyên** — migration chỉ thêm bảng/cột |
| Cài đặt trong app | thương hiệu (tên, logo, cô/thầy, ngôn ngữ mặc định), key AI, danh sách model, điều phối, giọng đọc | **Giữ nguyên** |
| Văn bản giao diện đã sửa | `/teacher/texts` | **Giữ nguyên**; nếu chữ gốc đổi, trang đánh dấu "Chữ gốc đã đổi" để xem lại |
| Secret của Worker, `wrangler.*.local.toml` | key, ID tài nguyên | **Giữ nguyên** (không nằm trong repo) |
| Mã nguồn (`apps/`, `packages/`) | file `.tsx`, prompt AI | **Thay bằng bản mới**; chỗ bạn tự sửa được đặt lại lên trên (dừng lại nếu bản mới sửa đúng chỗ đó) |

Nguyên tắc: **tuỳ chỉnh qua trang cài đặt, hạn chế sửa file lõi.** Muốn đổi một câu chữ → `/teacher/texts`.
Thiếu chỗ tuỳ chỉnh cho nhu cầu của bạn → mở issue thay vì sửa thẳng code, để bản sau có sẵn chỗ cấu hình.

## Các bước

Bản cài bằng `pnpm cf:setup` (xem [SETUP.md](SETUP.md)) — một lệnh, trong thư mục cài đặt:

```bash
pnpm cf:update            # backup D1 → tải bản mới → giữ chỗ sửa riêng → migrate → nạp gói mẫu mới → deploy
pnpm cf:update --reset    # bỏ chỗ sửa riêng trong code, lấy đúng bản phát hành
```

Bản tự quản lý bằng git (fork, tự deploy):

```bash
git pull                      # hoặc git fetch upstream && git merge upstream/main
pnpm install
pnpm deploy:prod              # kiểm kiểu → build → áp migration D1 → deploy → kiểm tra nhanh
```

Đọc `CHANGELOG.md` trước khi cập nhật: mục **Cần làm** liệt kê việc tay (secret mới, bước cấu hình) nếu có.

## Quy ước cho người phát triển lõi

- Migration chỉ **thêm**: không xoá/đổi tên cột đang có dữ liệu người dùng, không ghi đè cài đặt.
  Dữ liệu mặc định (model, giọng…) chỉ nạp một lần, có cờ trong `settings`.
- Đổi tên hoặc xoá key văn bản (`apps/web/src/i18n`) làm bản ghi đè của giáo viên mồ côi — tránh đổi tên
  key chỉ vì sắp xếp lại; nếu bắt buộc, ghi vào CHANGELOG.
- Mỗi bản phát hành: tăng `version` trong `package.json`, thêm mục vào `CHANGELOG.md`.
