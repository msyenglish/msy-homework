# Changelog

Mỗi phiên bản ghi: **Mới**, **Sửa**, và **Cần làm** (việc tay khi cập nhật, nếu có). Hướng dẫn cập nhật:
[docs/UPDATING.md](docs/UPDATING.md).

## Chưa phát hành

### Mới
- Giao diện hai ngôn ngữ Việt / Anh; ngôn ngữ mặc định trong Cài đặt → Thương hiệu, mỗi người tự đổi ở menu tài khoản.
- Trang **Văn bản giao diện** (`/teacher/texts`): sửa mọi câu chữ của app, không bị bản cập nhật ghi đè.
- Cổng AI: key nhập trong app (mã hoá AES-256 trong D1), tab Model (thêm/xoá/test), OpenAI · Claude · OpenRouter.
- Giọng đọc: Deepgram Flux bên cạnh Azure, chọn provider/giọng (Mỹ, Anh, Úc, Ireland, Ấn Độ) cho từng việc.
- Từ vựng: mục từ đầy đủ (định nghĩa, dịch ví dụ, CEFR, cụm từ, họ từ…), tạo bằng AI theo chủ đề, nhập JSON.
- Ngữ pháp: trang giáo viên mới (danh sách dính, tìm kiếm, biểu mẫu thay JSON thô).

### Cần làm
- Không có secret bắt buộc mới. Tuỳ chọn: `DEEPGRAM_API_KEYS`, `KEY_ENCRYPTION_SECRET` (hoặc nhập key trong app).
