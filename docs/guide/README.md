# Hướng dẫn sử dụng cho giáo viên

Bộ hướng dẫn này đi qua toàn bộ khu quản trị của English Homework: từ cài đặt ban đầu, tạo bài, giao bài,
đến chấm và gửi báo cáo cho phụ huynh. Ảnh chụp dùng giao diện tiếng Anh; trong bài, mỗi nút được ghi
**tên tiếng Việt** kèm *tên tiếng Anh* để đối chiếu dù bạn dùng ngôn ngữ nào.

> Trong app: menu **Cài đặt** (*Settings*) → **Hướng dẫn** (*Guide*) mở đúng bộ tài liệu này.

## Lộ trình đọc đề xuất

Lần đầu dùng, hãy đi theo thứ tự — mỗi bước cần bước trước đó:

1. [Bắt đầu](01-bat-dau.md) — đăng nhập, bố cục màn hình, ngôn ngữ, trang chủ.
2. [Cài đặt](02-cai-dat.md) — thương hiệu, Telegram, tài khoản, văn bản giao diện.
3. [Cổng AI](03-cong-ai.md) — thêm key AI, chọn model, giọng đọc, chi phí.
4. [Học viên & lớp](04-hoc-vien-lop.md) — cấp độ, tạo học viên, lớp học, theo dõi từng em.
5. [Soạn bài](05-soan-bai.md) — tạo bài bằng AI hoặc soạn tay, giao bài.
6. [Lộ trình](06-lo-trinh.md) — sắp bài theo chặng, mở dần mỗi ngày.
7. [Từ vựng](07-tu-vung.md) — bộ từ, thêm từ bằng danh sách / AI / JSON.
8. [Ngữ pháp](08-ngu-phap.md) — sổ tay, câu drill, câu dịch.
9. [Chấm bài & báo cáo](09-cham-bai-bao-cao.md) — xem bài làm, nhận xét, báo cáo tháng.
10. [Học viên thấy gì](10-hoc-vien-thay-gi.md) — góc nhìn của học viên.
11. [Câu hỏi thường gặp](11-hoi-dap.md)
12. [Lấy API key](12-api-key.md) — Gemini, OpenAI, Claude, Deepgram, Azure Speech… từng bước.

## Việc cần làm trong ngày đầu

| # | Việc | Ở đâu |
|---|---|---|
| 1 | Đặt tên app, logo, cách xưng hô | Cài đặt → Thương hiệu |
| 2 | Dán ít nhất một key AI (Gemini có gói miễn phí) | AI → Key |
| 3 | Tạo cấp độ và lớp, thêm học viên | Học viên → Cấp độ / Lớp học |
| 4 | Tạo vài bài bằng AI, lưu nháp để duyệt | Bài tập → Tạo bài AI |
| 5 | Xếp bài vào lộ trình hoặc giao thẳng cho lớp | Lộ trình / nút Giao |
| 6 | (Tuỳ chọn) Nối Telegram để nhận thông báo | Cài đặt → Telegram |

## Cập nhật ảnh chụp

Ảnh trong `images/` được chụp tự động, nên khi giao diện đổi chỉ cần chạy lại:

```bash
pnpm dev                                   # app đang chạy, có DEV_QUICK_LOGIN=1
node scripts/guide-screenshots.mjs         # chụp lại toàn bộ (BASE_URL mặc định :5173)
node scripts/guide-screenshots.mjs 50-     # chỉ chụp lại nhóm ảnh bắt đầu bằng "50-"
```

Script cần Playwright (`pnpm add -Dw playwright && npx playwright install chromium`). Ảnh chụp ở giao
diện tiếng Anh, chế độ sáng; các giá trị riêng tư (key AI) được che trước khi chụp.
