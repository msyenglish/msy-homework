# Giọng nói: TTS và chấm phát âm

App dùng **Azure Speech** trực tiếp, không qua dịch vụ trung gian. Cách đơn giản nhất: dán key và vùng
(region, vd `southeastasia`) ở `/teacher/ai` → tab Key → mục Giọng nói (lưu mã hoá trong D1). Hoặc đặt bằng
hai secret `AZURE_SPEECH_KEY` và `AZURE_SPEECH_REGION`; key trong D1 được ưu tiên. Thiếu cả hai thì các tính
năng này báo chưa cấu hình, phần còn lại của app vẫn chạy. Gói F0 miễn phí của Azure đủ cho lớp nhỏ thử nghiệm.

Mã nguồn: `apps/api/src/lib/azureSpeech.ts` (gọi Azure), `apps/api/src/lib/media.ts` (lớp điều phối),
`packages/shared/src/assess.ts` (chuẩn hoá kết quả chấm), `apps/web/src/lib/azureAssess.ts` (chấm trên trình duyệt).

## TTS

Hai provider, chọn ở `/teacher/ai` → tab **Giọng đọc**, riêng cho từng việc: phát âm từ & câu, bài nghe
một giọng, hội thoại nhiều vai. Cấu hình lưu ở `settings.tts_config`; danh mục giọng (Mỹ, Anh, Úc,
Ireland, Ấn Độ) ở `packages/shared/src/tts.ts`. Provider được chọn mà lỗi (hết credit, key sai) thì tự
rơi về provider còn lại.

**Azure Speech**
- Gọi WebSocket `wss://<region>.tts.speech.microsoft.com/cognitiveservices/websocket/v1` từ Worker,
  nhận audio mp3 **kèm mốc thời gian từng từ** (WordBoundary) → phụ đề chạy theo audio.
- Hội thoại đọc trong một SSML, nhãn cảm xúc `[happy]`… thành style (chỉ với giọng hỗ trợ style).

**Deepgram Flux** (`apps/api/src/lib/deepgram.ts`)
- Key dán ở tab **Key** (lưu mã hoá) hoặc secret `DEEPGRAM_API_KEYS`. Tài khoản mới được tặng $200.
- `POST /v2/speak?model=flux-<tên>-en&encoding=mp3`; mỗi lượt tối đa 2000 ký tự nên đoạn dài được cắt
  theo câu rồi nối mp3.
- Deepgram TTS không trả mốc thời gian từ, nên phụ đề lấy bằng một lượt nhận dạng giọng nói
  (`/v1/listen`, model nova-3) trên chính file vừa tạo, rồi đặt từng từ nghe được lên **kịch bản của
  mình** (chữ luôn là của kịch bản, máy chỉ cho mốc giờ).
- Hội thoại: mỗi lượt thoại đọc bằng giọng của vai rồi nối lại. Không có giọng cảm xúc.

Chung: hội thoại có nhãn người nói (`Woman: …`, `Anna (F): …`) được đọc **nhiều giọng**, chọn theo giới
tính của vai (`lib/dialogueCast.ts`). Audio lưu R2; audio từ vựng cache theo từ + giọng, nên đổi giọng thì
từ được đọc lại bằng giọng mới ở lần bấm sau. Cron mỗi giờ tự tạo audio cho bài nghe còn thiếu.

## Chấm phát âm

Điểm là **điểm Pronunciation Assessment mặc định của Azure** (thang 100: Accuracy, Fluency,
Completeness, Prosody, PronScore) — không có luật chấm riêng. Từ đọc sai / bỏ sót / thừa lấy theo
`ErrorType` của Azure.

| Trường hợp | Chạy ở đâu | Cách |
| --- | --- | --- |
| Từ, câu ngắn (thẻ từ vựng, shadowing) | Worker | Trình duyệt chuyển bản ghi sang WAV 16 kHz (`lib/wav.ts`), Worker gọi REST short-audio (≤ 30 giây) |
| Bài đọc to dài (nhiều phút) | Trình duyệt | Speech SDK chế độ liên tục, token tạm lấy từ `POST /api/v1/account/speech-token` (key không rời server) |

Với bài dài, trình duyệt gửi **kết quả từng đoạn** của Azure lên server; server tự gộp lại
(`mergeContinuousAssessment`: căn theo bài gốc, PronScore nhân theo độ đầy đủ) chứ không tin con số
tổng do trình duyệt tính. Speech SDK được tải lười, chỉ khi mở bài đọc to.

## Phiên âm video / audio (bài Nghe & chép, Shadowing)

Có key Deepgram (trang `/teacher/ai`) là Worker tự gọi Deepgram (`nova-3`, chấm câu, tách người nói,
mốc giờ từng từ) cho **file audio tải lên** và **link media trực tiếp** (mp3/podcast).

**Link YouTube**: Worker không tải được audio từ YouTube, nên audio đi từ máy giáo viên:

- trong trình soạn bài, bấm **"Tải audio của video"** và chọn file mp3/m4a của chính video đó, hoặc
- chạy `pnpm video:transcribe <link> [link…] [--from 1:30 --to 12:00] [--api https://domain-cua-ban]`
  (cần `yt-dlp` + `ffmpeg`; đăng nhập bằng `TEACHER_EMAIL` / `TEACHER_PASSWORD`). Video dài hơn 30 phút
  phải chọn đoạn (hoặc thêm `--force`).

Trong trình soạn, giáo viên chỉ cần dán link (tuỳ chọn ô **Từ / Đến**) rồi bấm **Tạo bài**: lấy transcript
→ AI xếp bậc + chủ đề (nếu còn trống) → AI gộp câu → AI dịch + chuẩn hoá số. Các bước tay (dán SRT, tách
đoạn, chạy lại từng bước AI) nằm trong "Công cụ nâng cao".

Transcript được lưu theo id video (bảng `video_transcripts`): khoá `en` = cả video, `en@60-180` = mới phiên
âm đoạn đó. Xin một đoạn mà đã có bản cả video (hoặc một đoạn rộng hơn) thì cắt từ bộ nhớ, không tốn thêm
phút Deepgram. Câu luyện được cắt từ transcript bằng
`buildPracticeLines` (`packages/shared/src/video.ts`): nối thành câu → cắt khi đổi người nói / câu quá dài
(16 từ, 9 giây) → dán mẩu quá ngắn → nới mép vào khoảng lặng. Bước AI chỉ dịch và chuẩn hoá **số**
(một cách viết trong câu, các cách viết khác vẫn được chấm đúng); chữ do STT nghe được không bị viết lại.
