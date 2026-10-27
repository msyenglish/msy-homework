# 12. Lấy API key cho AI, giọng đọc và phát âm

App không tự có AI. Mỗi tính năng AI gọi tới một nhà cung cấp bên ngoài, và nhà cung cấp cần một **API
key** — một chuỗi ký tự dài, giống mật khẩu, cho biết ai đang dùng. Chương này hướng dẫn lấy key ở từng
nơi. Lấy xong, dán key vào **AI** → **Key** như ở chương [Cổng AI](03-cong-ai.md).

## Key nào dùng cho việc gì

| Key | Bật tính năng | Bắt buộc? |
|---|---|---|
| **Google Gemini** | Tạo bài, nhận xét, chấm bài viết, báo cáo tháng | Cần ít nhất một key AI. Gemini có gói miễn phí — nên bắt đầu ở đây |
| **OpenAI**, **Anthropic Claude**, **DeepSeek**, **xAI Grok**, **OpenRouter** | Giống Gemini — thay thế hoặc dùng thêm | Tuỳ chọn |
| **Azure Speech** | Chấm phát âm, giọng đọc mẫu | Cần nếu học viên luyện phát âm |
| **Deepgram** | Giọng đọc bài nghe, lấy phụ đề video YouTube | Tuỳ chọn |

Mẹo chung:

- Giữ key kín như mật khẩu. Không gửi qua nhóm chat, không dán vào bài tập.
- Phần lớn trang chỉ hiện key **một lần** lúc tạo. Chép ngay; lỡ mất thì tạo key mới.
- Trong app, nút **Lấy key** (*Get key*) cạnh mỗi nhà cung cấp mở thẳng trang tạo key của họ.

## Google Gemini (miễn phí để bắt đầu)

1. Mở [aistudio.google.com](https://aistudio.google.com), đăng nhập bằng tài khoản Google.
2. Bấm **Get API key** (ở thanh bên trái hoặc góc trên).
3. Bấm **Create API key**. Nếu được hỏi chọn dự án, chọn dự án có sẵn hoặc để Google tạo mới.
4. Chép key (thường bắt đầu bằng `AIza`).

Gói miễn phí có giới hạn số lần gọi mỗi phút và mỗi ngày — đủ cho một lớp nhỏ. Dùng nhiều hơn thì bật
thanh toán trong Google AI Studio.

## OpenAI

1. Mở [platform.openai.com](https://platform.openai.com), đăng nhập hoặc tạo tài khoản.
2. Nạp tiền trước: vào **Settings** → **Billing**, thêm thẻ và nạp một khoản nhỏ. OpenAI không có gói miễn
   phí cho API.
3. Mở [platform.openai.com/api-keys](https://platform.openai.com/api-keys), bấm **Create new secret key**.
4. Đặt tên, bấm tạo, chép key (bắt đầu bằng `sk-`).

## Anthropic Claude

1. Mở [console.anthropic.com](https://console.anthropic.com) (có thể tự chuyển sang trang mới của
   Anthropic), đăng nhập hoặc tạo tài khoản.
2. Nạp tiền trước ở mục **Billing** — API của Claude trả trước.
3. Vào **API Keys** (trong **Settings**), bấm **Create Key**.
4. Đặt tên, chép key (bắt đầu bằng `sk-ant-`).

## DeepSeek

1. Mở [platform.deepseek.com](https://platform.deepseek.com), đăng ký bằng email.
2. Nạp tiền ở mục **Top up** — DeepSeek rất rẻ, nạp ít là dùng được lâu.
3. Vào **API keys**, bấm **Create new API key**, đặt tên, chép key (bắt đầu bằng `sk-`).

## xAI Grok

1. Mở [console.x.ai](https://console.x.ai), đăng nhập hoặc tạo tài khoản.
2. Nạp tiền ở mục thanh toán (**Billing** hoặc **Credits**).
3. Vào **API Keys**, bấm **Create API Key**, chép key (bắt đầu bằng `xai-`).

## OpenRouter

OpenRouter là một "cổng chung": một key dùng được model của nhiều hãng. Có một số model miễn phí.

1. Mở [openrouter.ai](https://openrouter.ai), đăng nhập.
2. Muốn dùng model trả phí: nạp tiền ở mục **Credits**.
3. Mở [openrouter.ai/settings/keys](https://openrouter.ai/settings/keys), bấm **Create Key**.
4. Đặt tên, chép key (bắt đầu bằng `sk-or-`).

## Deepgram (giọng đọc và phụ đề video)

Deepgram cho giọng đọc tự nhiên (nhiều giọng Anh, Úc, Ireland) và nhận dạng lời nói để lấy phụ đề từ video
YouTube. Tài khoản mới thường được tặng một khoản dùng thử.

1. Mở [console.deepgram.com](https://console.deepgram.com), đăng ký bằng email hoặc tài khoản Google.
2. Nếu được hỏi tạo dự án, đặt tên tuỳ ý.
3. Ở thanh bên trái, mở **API Keys**, bấm nút tạo key mới.
4. Đặt tên, giữ quyền mặc định, bấm tạo, chép key.

Trong app, key Deepgram nằm ở nhóm **Giọng nói** của tab **Key**.

## Azure Speech (chấm phát âm) — chi tiết

Đây là key khó lấy nhất, nhưng cần thiết nếu học viên luyện phát âm. Azure Speech chấm từng âm, từng từ,
và đọc câu mẫu. Gói **Free F0** miễn phí, đủ cho lớp nhỏ.

Khác các key khác, Azure cần **hai thứ**: **key** và **vùng** (*region*, ví dụ `southeastasia`).

### 1. Tạo tài khoản Azure miễn phí

1. Mở [azure.microsoft.com/free](https://azure.microsoft.com/free), bấm nút bắt đầu dùng miễn phí.
2. Đăng nhập bằng tài khoản Microsoft (Outlook, Hotmail…) hoặc tạo mới.
3. Điền thông tin, xác minh số điện thoại.
4. Thêm thẻ để xác minh danh tính. Microsoft không trừ tiền cho gói miễn phí.
5. Chờ Azure tạo xong gói đăng ký (*subscription*), rồi mở [portal.azure.com](https://portal.azure.com).

### 2. Tạo tài nguyên Speech

1. Mở thẳng trang tạo:
   [portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices](https://portal.azure.com/#create/Microsoft.CognitiveServicesSpeechServices).
   Hoặc trên Azure Portal, gõ `Speech` vào ô tìm kiếm trên cùng, chọn dịch vụ Speech (tên có thể là
   **Speech service** hoặc **Azure AI Speech**, nằm trong nhóm dịch vụ AI của Azure), rồi bấm **Create**.
2. Điền trang **Basics**: **Subscription** chọn gói vừa tạo · **Resource group** bấm **Create new**, đặt tên
   (ví dụ `msy-homework`) · **Region** chọn **Southeast Asia** (gần Việt Nam, nhanh nhất) · **Name** một tên
   chưa ai dùng (ví dụ `msy-speech-truongcuaban`) · **Pricing tier** chọn **Free F0**.
3. Bấm **Review + create**, chờ kiểm tra xong, bấm **Create**.
4. Chờ khoảng một phút đến khi hiện thông báo tạo xong, bấm **Go to resource**.

Mỗi gói đăng ký chỉ tạo được **một** tài nguyên Speech gói F0. Nếu không chọn được **Free F0**, có thể bạn
đã có một tài nguyên F0 — dùng lại key của nó.

### 3. Chép key và vùng

1. Trong tài nguyên Speech vừa tạo, ở thanh bên trái mở **Resource Management** → **Keys and Endpoint**.
2. Bấm biểu tượng sao chép cạnh **KEY 1**.
3. Ghi lại **Location/Region**, ví dụ `southeastasia` (viết liền, chữ thường).

### 4. Dán vào app

1. Mở **AI** → tab **Key**, kéo xuống nhóm **Giọng nói**.
2. Ở dòng **Azure**, bấm **Thêm key** (*Add key*).
3. Dán **KEY 1**, chọn hoặc gõ **Vùng (region)** đúng như trên Azure.
4. Bấm **Kiểm tra & lưu** (*Check & save*).

Key đúng nhưng app báo lỗi? Kiểm tra lại vùng — key của vùng này không dùng được với vùng khác.

## Dán key vào app

Mọi key đều dán ở **AI** → tab **Key**. Cách thêm, kiểm tra, tắt key và dùng nhiều key cùng lúc: xem
[Cổng AI](03-cong-ai.md#key--việc-đầu-tiên-cần-làm).
