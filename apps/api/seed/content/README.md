# Gói dữ liệu mẫu

Mỗi file `NNNN_ten.sql` là một gói nội dung mẫu. `scripts/db-bootstrap.mjs` (chạy bởi `pnpm oss`,
`pnpm db:seed`, `pnpm deploy:prod`) áp các gói chưa áp theo thứ tự số và ghi tên vào
`settings.seed_packs` — mỗi gói chỉ chạy **một lần** trên mỗi DB.

Thêm nội dung mới = thêm gói mới, **không sửa gói đã phát hành** (bản cài cũ sẽ không nhận phần sửa):

- Đặt số kế tiếp: `0002_a2_flyers.sql`, `0003_...`.
- Chỉ dùng `INSERT OR IGNORE INTO ...` với **id cố định** (không sinh ngẫu nhiên) để chạy lại an toàn.
- Tham chiếu level / topic / grammar bằng id đã có trong các gói trước.
- Bài đã có `published = 1` phải dùng được ngay khi không có key AI/Azure: bài nghe cần
  `audio_script` (audio được tạo sau khi cấu hình Azure).
- Thử trên DB trống trước khi commit: `WRANGLER_CONFIG=<config có database_id riêng> pnpm db:seed`.

## Các gói hiện có

| Gói | Nội dung | Giấy phép |
| --- | --- | --- |
| `0001_base.sql` | 7 cấp CEFR, cây chủ đề, 35 điểm ngữ pháp, lộ trình Pre-A1 + A1 (164 bài) | như repo |
| `0002_vocab_common_words.sql` | 7 bộ từ "Common English Words" (2.809 từ NGSL + thứ, tháng, số đếm), mỗi bộ ≤ 500 từ — đủ nghĩa, IPA, định nghĩa, ví dụ kèm bản dịch, đồng nghĩa, collocation, họ từ | **CC BY-SA 4.0** |
| `0003_grammar_translate.sql` | Ngân hàng câu dịch Việt → Anh cho luyện ngữ pháp: 10 câu × 35 điểm ngữ pháp (350 câu), xếp từ dễ đến khó (tier 1–3), kèm cách dịch khác được chấp nhận, ngân hàng từ và ghi chú | như repo |
| `0004_video_samples.sql` | 3 bài video mẫu (nghe-viết + shadowing, xếp ở Pre A1 Starters để học viên mới thấy ngay; nội dung thật khoảng B2) từ TED Talks trên YouTube: câu và mốc thời gian từ Deepgram, gộp câu và dịch tiếng Việt bằng AI của app. Chỉ lưu id YouTube, video phát từ YouTube | bài nói © TED, **CC BY-NC-ND 4.0** |

Danh sách từ của gói 0002 là New General Service List của C. Browne, B. Culligan và J. Phillips
(newgeneralservicelist.com), phát hành theo CC BY-SA 4.0; vì vậy gói này (danh sách cùng phần nghĩa,
ví dụ đi kèm) cũng phát hành theo CC BY-SA 4.0. Giữ nguyên dòng ghi nguồn trong mô tả của từng bộ.
