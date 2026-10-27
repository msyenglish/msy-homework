# Tổng quan kiến trúc

## Một Worker cho tất cả

`apps/api` là **một Cloudflare Worker** (Hono) phục vụ:

- `/api/v1/*` — API.
- Mọi đường dẫn khác — SPA đã build (`apps/web/dist`, binding `ASSETS`, fallback single-page-application).

Web và API **cùng origin** → cookie phiên đơn giản, không cần CORS ở production. Khi chạy local,
Vite proxy `/api` sang `wrangler dev` để giữ cùng origin.

```
apps/api/src/
  index.ts            # nối route, guard, cron, queue consumer, SPA fallback
  routes/             # mỗi file một nhóm API
  middleware/         # requireTeacher · requireUser
  lib/                # nghiệp vụ: chấm bài, lộ trình, queue job, Azure Speech, AI gateway (lib/ai)
  db/schema.ts        # schema D1 (Drizzle)
apps/web/src/
  pages/              # trang học viên (/u), giáo viên (/teacher), báo cáo công khai
  components/ui/      # design system dùng chung
  lib/api.ts          # client API
packages/shared/src/  # types, zod schema, logic chấm điểm dùng chung web + api
```

`packages/shared` là nguồn sự thật duy nhất cho kiểu dữ liệu và logic chấm. **API chấm thật; web chỉ hiển thị.**

## Hai nhóm người dùng

| Ai | Đăng nhập | Guard |
| --- | --- | --- |
| Giáo viên | email + mật khẩu (tạo bằng `pnpm teacher:create`) | `requireTeacher` trên `/api/v1/teacher/*`, cookie `msyen_session` |
| Học viên | tự đăng ký email/mật khẩu hoặc Google | `requireUser` trên `/library/*`, `/account/*`, cookie `msyen_user` |

Học viên chỉ làm được bài trong lộ trình đã mở hoặc bài được giao (cho lớp hoặc riêng em).
Không có RLS — mọi phân quyền nằm trong middleware và route. **Đáp án không bao giờ rời server** trước
khi nộp: payload bài bỏ `answer`/`accept`, chấm ở `/grade`.

## Dữ liệu chính (D1)

- **Bài & câu hỏi:** `exercises` (slug `exercise_id`, `skill`, `level`, `topic_id`, `stage_id`, `path_order`),
  `questions` (6 dạng: trắc nghiệm, điền từ, nối, sắp xếp, phân loại, dịch câu).
- **Phân loại:** `levels` (trục CEFR), `topics` (cây chủ đề), `tags` (nhãn của giáo viên + phạm vi hiển thị),
  `path_stages` (chặng trong lộ trình mỗi cấp).
- **Người học:** `users`, `classes` + `class_members`, `class_assignments` / `user_assignments` (bài được giao).
- **Kết quả:** `submissions` (quiz), `reading_submissions` (đọc to), `writing_submissions`,
  `vocab_submissions`, `grammar_submissions`, `video_*_scores`.
- **Từ vựng:** `vocab_sets` + `vocab_items` (bộ của giáo viên và từ riêng của học viên),
  `user_vocab_progress` (lịch ôn FSRS).
- **Ngữ pháp:** `grammar` (sổ tay), `grammar_items` (câu luyện, chép từ bài Grammar đã gắn điểm),
  `grammar_translate_items` (câu dịch Việt → Anh do giáo viên nhập).
- **Hệ thống:** `settings` (cấu hình AI, nhận xét tự động, Telegram), `gen_jobs`, `reading_jobs`,
  `writing_jobs`, `ai_usage`, `ai_key_usage`.

Quy ước: JSON lưu `text({ mode: "json" })`, boolean là integer, `id` mặc định `crypto.randomUUID()`,
thời gian là chuỗi ISO. D1 giới hạn ~100 tham số mỗi câu lệnh → insert hàng loạt phải chia lô.

## Luồng bất đồng bộ (Queues)

| Queue | Việc |
| --- | --- |
| `AI_QUEUE` | sinh bài bằng AI, tạo audio TTS, gắn điểm ngữ pháp |
| `INTERACTIVE_QUEUE` | chấm đọc to, chấm viết, nhận xét quiz — học viên đang chờ nên tách riêng |
| `CONTENT_QUEUE` | IPA + dịch câu cho đoạn văn |

Cron mỗi giờ (`scheduled()` trong `index.ts`): cứ 6 giờ thử lại nhận xét AI còn kẹt/lỗi của bài lớp, áp các yêu cầu
đổi email đã tới hạn, bổ sung IPA + dịch câu cho đoạn văn, tự sinh lại audio còn thiếu
(tắt bằng `MEDIA_BACKFILL = "off"`).

## Lộ trình (gạn giọt)

Mỗi cấp có các chặng; bài trong lộ trình có `path_order`. Mỗi ngày học viên được mở thêm một số bài,
làm đạt bài mới thì được mở thêm (`lib/learningPath.ts`). Bài được giao cho lớp đi cửa riêng, không bị
gạn giọt. Giáo viên sắp chặng và thứ tự ở trang **Lộ trình**.

## Chấm điểm

- **Quiz:** xác định, ở `packages/shared/src/grading.ts`.
- **Đọc to:** điểm Azure Pronunciation Assessment, xem [`SPEECH.md`](SPEECH.md).
- **Viết:** một lượt AI (`grade_writing`), 4 tiêu chí 0–100, điểm tổng là trung bình.
- **Từ vựng:** theo tiến bộ trí nhớ (FSRS, `shared/srs.ts`).

## Bộ nhớ đệm

Có thể đặt Cache Rule cache các `GET /api/v1/*` công khai không cookie. Vì vậy mọi endpoint nhạy cảm
hoặc thay đổi theo người dùng dùng **POST**.
