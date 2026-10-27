# Cổng AI

Mọi lời gọi AI đi qua **một điểm vào**: `runAiTask(env, name, input)` ở `apps/api/src/lib/ai/hub.ts`.

1. Kiểm input bằng zod schema của tác vụ (`lib/ai/tasks.ts`).
2. Chọn provider/model theo cấu hình trong D1.
3. Chọn key ít dùng nhất của provider đó, gọi qua adapter (`lib/ai/providers/*`).
4. Lỗi do key (429 hết hạn mức, 403 key hỏng, 5xx) → tạm nghỉ key đó, thử key kế tiếp.
5. Ghi `ai_usage` (kể cả lượt lỗi) → tab **Chi phí** ở `/teacher/ai`.
6. Kiểm output bằng zod; sai schema thì thử lại tối đa 2 key rồi báo lỗi.

## Nhà cung cấp & key

Cách đơn giản: vào `/teacher/ai` → tab **Key**, dán API key. Key được kiểm tra với provider (gọi danh sách
model, không tốn token), rồi **mã hoá AES-256-GCM** và lưu trong bảng `ai_provider_keys`. Khoá mã hoá
dẫn xuất từ `KEY_ENCRYPTION_SECRET` (nếu đặt) hoặc `JWT_SECRET` — đổi secret đó thì phải nhập lại key.
Trang chỉ hiện 4 ký tự cuối; có thể tắt/bật, kiểm tra, xoá từng key.

Cách nâng cao: đặt secret của Worker (nhiều key cách nhau bằng dấu phẩy). Key ở đây được gộp chung với
key trong D1 và hiện nhãn `.env` (chỉ xem).

| Provider | Secret | Ghi đè endpoint |
| --- | --- | --- |
| Google Gemini | `GEMINI_API_KEYS` | `GEMINI_BASE_URL` |
| OpenAI | `OPENAI_API_KEYS` | `OPENAI_BASE_URL` |
| Anthropic Claude | `ANTHROPIC_API_KEYS` | `ANTHROPIC_BASE_URL` |
| OpenRouter | `OPENROUTER_API_KEYS` | `OPENROUTER_BASE_URL` |
| DeepSeek | `DEEPSEEK_API_KEYS` | `DEEPSEEK_BASE_URL` |
| xAI Grok | `XAI_API_KEYS` | `XAI_BASE_URL` |

## Danh sách model

Model chọn được nằm trong bảng `ai_models`, quản lý ở tab **Model**:

- Lần đầu mở, bảng được nạp sẵn danh sách mặc định (`DEFAULT_MODELS` trong `lib/ai/models.ts`). Sau đó
  giáo viên tự thêm/xoá; nút **Mặc định** thêm lại model mặc định đã xoá.
- **Thêm model**: chọn provider → danh sách lấy trực tiếp từ provider (OpenRouter: danh mục công khai
  ~400 model, cache 1 ngày trong `settings.ai_openrouter_catalog`), hoặc gõ mã model bất kỳ. Giá tự điền
  từ bảng giá OpenRouter khi tìm được; giá chỉ để ước tính chi phí.
- Nút **Test** gửi một yêu cầu JSON nhỏ tới model (ghi vào `ai_usage` với tác vụ `model_test`) và báo
  độ trễ hoặc lỗi.
- Không xoá được model đang là mặc định hoặc đang gán cho tác vụ nào.
- Chỉ Gemini (trực tiếp hoặc qua OpenRouter) được đánh dấu nghe audio.

## Chọn model cho tác vụ

Cấu hình **không nằm trong code hay env** mà trong bảng `settings`:

- `ai_default` — model mặc định cho mọi tác vụ.
- `ai_routes` — ghi đè cho từng tác vụ.

Sửa ở trang `/teacher/ai`, có hiệu lực ngay, không cần deploy. Khi chưa cấu hình gì, app dùng
`gemini-3.1-flash-lite` (`HARD_DEFAULT` trong `lib/ai/routing.ts`). Trang chỉ cho chọn provider đã có key.

## Các tác vụ

| Nhóm | Tác vụ |
| --- | --- |
| Chấm & nhận xét | `feedback` (quiz), `reading_feedback` (đọc to), `grade_writing`, `video_feedback`, `report_focus`, `monthly_report` |
| Sinh nội dung | `generate_exercise`, `generate_questions`, `generate_reading`, `generate_writing`, `generate_wordlist`, `generate_ipa`, `fill_vocab`, `suggest_pair` |
| Chuẩn hoá yêu cầu | `refine_prompt`, `refine_reading_prompt`, `refine_vocab_prompt`, `translate_outline` |
| Video | `video_segment`, `video_group`, `video_classify`, `video_ipa_fill` |
| Phân loại | `tag_grammar` (gắn điểm ngữ pháp cho từng câu, chỉ chọn trong sổ tay) |

Tác vụ có `graded: true` (vd `grade_writing`) ảnh hưởng trực tiếp tới điểm học viên — đổi model là đổi
cách chấm, nên thử trên vài bài mẫu trước.

## Thêm hoặc sửa tác vụ

1. Khai báo input/output schema ở `packages/shared/src/schemas.ts`.
2. Viết prompt + `AiTask` trong `lib/ai/tasks.ts` (prompt dài tách ra module riêng như `lib/ai/writing/judge.ts`),
   thêm vào `AI_TASKS`, `TASK_LABEL`, `TASK_GROUP`.
3. Dòng `Return JSON: {...}` trong prompt phải liệt kê **đúng** các key của output schema —
   `node scripts/check-ai-contracts.mjs` kiểm việc này (deploy tự chạy).

## Gemini bị chặn theo vùng

Worker gọi ra từ PoP gần người dùng; một số vùng bị Google từ chối (`User location is not supported`).
Cloudflare AI Gateway không giải quyết được (nó chuyển tiếp từ cùng PoP). Cách xử lý:

- Trỏ `GEMINI_BASE_URL` tới một proxy đặt ở vùng được hỗ trợ (dạng `https://<proxy>/v1beta/models`).
- Hoặc chọn provider khác cho các tác vụ ở `/teacher/ai`.
