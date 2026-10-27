// ============================================================
//  Đăng ký các nhóm tác vụ AI. Mỗi task:
//    - system: chỉ dẫn vai trò cho model
//    - build(input): dựng prompt từ input đã validate
//    - output: zod schema để validate JSON model trả về
//  Thêm tác vụ mới = thêm 1 entry vào AI_TASKS (không đụng hub/route).
// ============================================================
import { WRITING_JUDGE_SYSTEM, buildWritingJudge } from "./writing/judge";
import {
  aiFeedbackInputSchema,
  aiFeedbackOutputSchema,
  aiReadingFeedbackInputSchema,
  aiReadingFeedbackOutputSchema,
  aiWritingJudgeInputSchema,
  aiWritingJudgeOutputSchema,
  aiGenerateExerciseInputSchema,
  aiGenerateExerciseOutputSchema,
  aiGenerateReadingInputSchema,
  aiGenerateReadingOutputSchema,
  aiGenerateSpeakingInputSchema,
  aiGenerateSpeakingOutputSchema,
  aiIpaInputSchema,
  aiIpaOutputSchema,
  aiGenerateQuestionsInputSchema,
  aiGenerateQuestionsOutputSchema,
  aiGenerateWordlistInputSchema,
  aiGenerateWordlistOutputSchema,
  aiFillVocabInputSchema,
  aiFillVocabOutputSchema,
  aiMonthlyReportInputSchema,
  aiMonthlyReportOutputSchema,
  aiRefinePromptInputSchema,
  aiRefinePromptOutputSchema,
  aiSuggestPairInputSchema,
  aiSuggestPairOutputSchema,
  aiTranslateOutlineInputSchema,
  aiTranslateOutlineOutputSchema,
  aiVideoClassifyInputSchema,
  aiVideoClassifyOutputSchema,
  aiVideoFeedbackInputSchema,
  aiVideoFeedbackOutputSchema,
  aiVideoGroupInputSchema,
  aiVideoGroupOutputSchema,
  aiVideoIpaFillInputSchema,
  aiVideoIpaFillOutputSchema,
  aiVideoSegmentInputSchema,
  aiVideoSegmentOutputSchema,
  aiTagGrammarInputSchema,
  aiTagGrammarOutputSchema,
  aiReportFocusInputSchema,
  aiReportFocusOutputSchema,
} from "@msyen/shared/schemas";
import type { AiGenerateExerciseInput, AiTagGrammarInput, GrammarCatalogItem } from "@msyen/shared/schemas";
import { questionTypeLabel, } from "@msyen/shared";
import type { ZodTypeAny } from "zod";
import {
  IPA_SYSTEM,
  QTYPE_SPEC,
  TYPE_RULE,
  REFINE_READING_SYSTEM,
  REFINE_VOCAB_SYSTEM,
  REFINE_SYSTEM,
  SUGGEST_PAIR_SYSTEM,
  buildSuggestPair,
  buildIpaPrompt,
  buildReadingUserPrompt,
  buildWritingUserPrompt,
  buildRefineReadingPrompt,
  buildRefineVocabPrompt,
  buildRefinePrompt,
  buildUserPrompt,
  composeQuizSystemPrompt,
  composeReadingSystemPrompt,
  composeWritingSystemPrompt,
} from "./prompts";

export type AiTask = {
  input: ZodTypeAny;
  output: ZodTypeAny;
  // system prompt: chuỗi cố định HOẶC hàm dựng động theo input (đã validate).
  system: string | ((input: any) => string);
  temperature?: number;
  build: (input: any) => string;

  // ---- Điều phối ----
  /** Cần model NGHE được audio → chỉ Gemini. Hub tự rơi về Gemini nếu route trỏ sai. */
  needsAudio?: boolean;
  /**
   * Tác vụ CHẤM ĐIỂM học sinh. Đổi model ở đây là ĐỔI ĐIỂM — thang đã hiệu chuẩn theo
   * Gemini, phải hiệu chuẩn lại. Trang admin cảnh báo trước khi cho đổi.
   */
  graded?: boolean;
  /** Trần token output riêng; không đặt thì lấy theo nhóm ở MAX_TOKENS bên dưới. */
  maxOutputTokens?: number;
  /**
   * Chỉ cho phép các provider này. Dùng cho tác vụ KHÔNG chạy ở Worker mà do
   * an external caller): a provider outside this list would fail the call, so routing refuses it.
   */
  onlyProviders?: readonly string[];
};

const SKILL_VI: Record<string, string> = {
  grammar: "Ngữ pháp",
  reading: "Đọc hiểu",
  listening: "Nghe",
  vocabulary: "Từ vựng",
  writing: "Viết",
  mixed: "Tổng hợp",
};

// ── Greeting shared by every feedback task (quiz · read-aloud · video) ──────────────────────
// One learner must meet ONE teacher: if the quiz comment teases and the read-aloud comment is
// formally warm, that reads as two different people. Keep this in a single place.

const GENDER_VI: Record<string, string> = { male: "nam", female: "nữ" };

/** Name, gender and age joined with a dot — whichever parts exist (onboarding is optional). */
export const learnerLine = (name: string, gender?: string | null, age?: number | null): string =>
  [name, gender ? GENDER_VI[gender] : "", age ? `${age} tuổi` : ""].filter(Boolean).join(" · ");

// Drawn per call — the hub rebuilds the prompt on every attempt, and rotating the style is the
// only real source of variety (temperature alone reproduces the same opener for the same paper).
// Styles that stay safe for young learners: no irony, no teasing that a child could take literally.
const KID_SAFE = new Set([1, 2, 5, 6, 7]);

const OPENING_STYLES = [
  "đá xoáy nhẹ kiểu bạn thân — nói ngược để em tự thấy",
  "trịnh trọng giả vờ, như đọc một bản tuyên bố long trọng về chuyện cỏn con",
  "ví von với một hình ảnh đời thường (nấu ăn, đá bóng, phim ảnh, game)",
  "hỏi xoáy một câu rồi tự trả lời luôn",
  "khen một thứ chẳng liên quan trước (bàn phím, cái tên, giờ nộp bài…) rồi mới vào việc",
  "kiểu tin nhắn ngắn, cụt lủn mà có duyên",
  "gọi em bằng một biệt danh dí dỏm hợp tuổi rồi vào thẳng vấn đề",
  "nói như thể cô vừa chấm xong và còn đang cầm bài làm của em trên tay",
];

/**
 * The opening paragraph instruction. `humor` is decided by each task from its own result data —
 * a half-finished paper and a perfect one must not be greeted the same way.
 * `sentences` shrinks the slot for short formats (video comments are only 5-7 sentences total).
 */
function greetingBlock(o: {
  name: string;
  gender?: string | null;
  age?: number | null;
  humor: string;
  sentences?: string;
}): string {
  const gender = o.gender ? GENDER_VI[o.gender] : null;
  const age = o.age ?? null;
  const kid = age != null && age < 12;
  const pool = kid ? OPENING_STYLES.filter((_, i) => KID_SAFE.has(i)) : OPENING_STYLES;
  const style = pool[Math.floor(Math.random() * pool.length)];
  return [
    "PHẦN MỞ ĐẦU (đứng TRƯỚC tất cả các phần bên dưới, cách phần sau bằng MỘT DÒNG TRỐNG):",
    `Một LỜI CHÀO ${o.sentences ?? "1-2 câu"}, có cá tính, gọi đúng em: ${learnerLine(o.name, o.gender, o.age)}.`,
    'Lời chào PHẢI có chữ "Cô" chỉ CHÍNH CÔ (vd "Cô vừa chấm bài…", "Cô phải công nhận…").',
    '   Lưu ý: "cô nàng"/"quý cô" là gọi EM, không tính — vẫn phải có chỗ cô tự xưng.',
    `KIỂU CHÀO LẦN NÀY: ${style}. (Bám đúng kiểu này, đừng viết khuôn chào chung chung.)`,
    `ĐỘ HÀI HƯỚC: ${o.humor}.`,
    gender || age
      ? `Xưng hô hợp ${[gender ? `giới tính (${gender})` : "", age ? `tuổi (${age})` : ""].filter(Boolean).join(" và ")} — ` +
        'vd "cô nàng", "chàng trai", "cô bé", "cậu bé", "quý cô", "quý ngài"… chọn cho hợp, đừng dùng lại mãi một từ.'
      : "Không có thông tin giới tính/tuổi — gọi bằng tên, đừng đoán bừa.",
    kid ? "Em còn NHỎ: đùa thật nhẹ nhàng, tuyệt đối không khịa đau, không nói mỉa vì em sẽ hiểu theo nghĩa đen." : "",
    "GIỚI HẠN CỦA ĐÙA (phụ huynh cũng đọc lời phê này):",
    "- Cô CHỈ NHÌN THẤY BÀI LÀM, không nhìn thấy em. TUYỆT ĐỐI KHÔNG mô tả ngoại hình, quần áo,",
    "  nét mặt hay hành động của em — bịa ra những thứ đó là sai sự thật và rất phản cảm.",
    '  Cấm cả lời khen vẻ ngoài: KHÔNG "xinh", "xinh đẹp", "đẹp trai", "điển trai", "dễ thương".',
    "- KHÔNG nói ngược sự thật về kết quả: bài làm tốt thì tuyệt đối không viết \"em làm tệ\" theo kiểu",
    "  mỉa mai ngược — em (nhất là em nhỏ) sẽ tưởng thật.",
    "- Chỉ đùa quanh CHUYỆN LÀM BÀI (bỏ trống, đoán bừa, cẩu thả, điểm số). Tuyệt đối KHÔNG",
    "  đụng tới ngoại hình, cân nặng, gia đình, hoàn cảnh, hay trí tuệ của em.",
    "- KHÔNG bịa chi tiết về đời em (không nói em mải chơi game, thức khuya… nếu dữ liệu không có).",
    "- Đùa xong PHẢI vào việc thật — lời chào không được thay thế phần nhận xét.",
    "- Không mỉa mai cay nghiệt, không hạ nhục, không so sánh em với bạn khác.",
  ]
    .filter(Boolean)
    .join("\n");
}

const feedback: AiTask = {
  input: aiFeedbackInputSchema,
  output: aiFeedbackOutputSchema,
  temperature: 0.4,
  system:
    "Bạn là CÔ GIÁO tiếng Anh giàu kinh nghiệm, nhận xét bài làm GỬI TRỰC TIẾP CHO HỌC SINH (phụ huynh cũng đọc). " +
    "Phong cách: NGẮN GỌN, súc tích như lời cô phê vào vở — khen ra khen, chê ra chê, đi thẳng vào chỗ sai và cách sửa. " +
    "NHẤT QUÁN xưng 'Cô' và gọi học sinh là 'em' — TUYỆT ĐỐI KHÔNG dùng 'con', KHÔNG chào/nhắn 'ba mẹ' (học sinh nhiều lứa tuổi); có thể gọi kèm tên em. " +
    "Sắc thái KHÔNG cố định: bài làm nghiêm túc thì ghi nhận đúng mực, bài bỏ dở giữa chừng thì nghiêm khắc — " +
    "sắc thái bắt buộc cho từng bài được ghi rõ trong phần dữ liệu, PHẢI theo đúng. " +
    "Không sáo rỗng, không lan man, không lời chúc dài. Chỉ dựa vào dữ liệu được cung cấp, không bịa thêm. " +
    "CHỈ trả về JSON đúng cấu trúc, không thêm chữ nào ngoài JSON.",
  build: (v) => {
    const pctVal = Math.round((v.score / v.total) * 100);
    const skillVi = v.skill ? SKILL_VI[v.skill] ?? v.skill : null;
    const name = v.student_name?.trim() || "học sinh";

    const wrong = v.items.filter((it: any) => !it.correct);
    // Split by the NATURE of the miss, the way reading_feedback splits Omission from
    // Mispronunciation: a blank is unfinished work, a wrong answer is a knowledge gap. Merging
    // them makes the reply coach grammar at a student who simply stopped doing the exercise.
    const blank = wrong.filter((it: any) => !it.student_answer?.trim());
    const answered = wrong.filter((it: any) => !!it.student_answer?.trim());
    const nBlank = blank.length;
    const donePct = Math.round(((v.total - nBlank) / v.total) * 100);

    const line = (it: any, i: number) =>
      `${i + 1}. Câu: ${it.question}\n   HS trả lời: ${it.student_answer?.trim() || "(bỏ trống)"}\n   Đáp án đúng: ${
        it.correct_answer?.trim() || "(không có)"
      }`;
    const listOr = (arr: any[], cap = 12) =>
      arr.length ? arr.slice(0, cap).map(line).join("\n") : "(không có)";

    // Tone follows COMPLETION first and the score second — same order as reading_feedback.
    // A half-abandoned paper scores badly for the right reason; the reply must name the
    // abandonment, not coach the fragment that was attempted.
    const strict = donePct < 50;
    const partial = !strict && donePct < 80;
    const tone = strict
      ? `NGHIÊM KHẮC. Em bỏ trống ${nBlank}/${v.total} câu — bài này CHƯA HOÀN THÀNH. ` +
        "Nói thẳng ngay câu đầu rằng em chưa làm hết bài, nêu ĐÚNG con số. Đây là chuyện làm bài chưa " +
        "tới nơi, KHÔNG phải chuyện em kém — nói rõ vậy. Yêu cầu em làm lại ĐẦY ĐỦ. " +
        "TUYỆT ĐỐI KHÔNG mở đầu bằng lời khen, KHÔNG có mục điểm mạnh, KHÔNG hứa hẹn hoa mỹ ở cuối. " +
        "Nghiêm nhưng TÔN TRỌNG: không mỉa mai, không chì chiết, không nói em lười."
      : partial
        ? `NHẮC NHỞ RÕ RÀNG. Em bỏ trống ${nBlank}/${v.total} câu — chưa làm trọn vẹn. ` +
          "Ghi nhận thật ngắn (một vế câu) rồi chỉ thẳng phần bỏ dở và yêu cầu làm đủ ở lần sau, " +
          "sau đó mới góp ý các câu làm sai."
        : pctVal < 50
          ? "NGHIÊM KHẮC. Em làm hết bài nhưng kết quả CHƯA ĐẠT — nói thẳng em còn yếu chỗ nào và cần " +
            "ôn lại nghiêm túc. KHÔNG mở đầu bằng lời khen. Tôn trọng, không mỉa mai."
          : pctVal < 80
            ? "NHẮC NHỞ. Kết quả tạm được nhưng còn lỗi. Ghi nhận ngắn gọn rồi chỉ thẳng chỗ hổng và yêu cầu cải thiện."
            : "GHI NHẬN. Kết quả tốt. Khen ngắn gọn, xứng đáng, rồi giao một thử thách nâng cao hơn.";

    const perfect = !wrong.length;

    const humor = strict
      ? "CÓ GAI nhưng không hạ nhục — trêu đúng chỗ em bỏ bài dở dang, để em thấy nhột mà làm lại"
      : pctVal < 50
        ? "trêu nhẹ, hơi khịa về kết quả — nhưng vẫn để em thấy cô đứng về phía em"
        : pctVal < 80
          ? "dí dỏm, nửa đùa nửa nhắc"
          : "hài hước ấm áp, tán thưởng hơi phóng đại một chút cho vui";
    const greet = greetingBlock({ name, gender: v.student_gender, age: v.student_age, humor });
    const who = learnerLine(name, v.student_gender, v.student_age);

    return [
      `Học sinh: ${who}.`,
      `Bài tập: "${v.title}"${skillVi ? ` — kỹ năng ${skillVi}` : ""}.`,
      // `score` carries partial credit; the count of fully right items is reported separately so the
      // numbers the model quotes agree with the error list below.
      `Kết quả: ${v.score}/${v.total} điểm (${pctVal}%) · đúng trọn ${v.items.length - wrong.length}/${v.items.length} câu.`,
      v.passage ? `Ngữ liệu bài (để hiểu ngữ cảnh, KHÔNG chép lại):\n"""\n${String(v.passage).slice(0, 1500)}\n"""` : "",
      "",
      `MỨC ĐỘ HOÀN THÀNH: em làm ${donePct}% bài · bỏ trống ${nBlank} câu · trả lời sai ${answered.length} câu.`,
      "",
      perfect ? "(Không có câu nào sai — học sinh làm đúng toàn bộ.)" : "Chi tiết lỗi (đối chiếu đáp án):",
      perfect ? "" : `A. BỎ TRỐNG — không trả lời (${nBlank} câu${nBlank > 12 ? ", liệt kê 12 câu đầu" : ""}):`,
      perfect ? "" : listOr(blank),
      perfect ? "" : `B. TRẢ LỜI SAI (${answered.length} câu${answered.length > 12 ? ", liệt kê 12 câu đầu" : ""}):`,
      perfect ? "" : listOr(answered),
      "",
      "Hãy viết như CÔ GIÁO nhắn TRỰC TIẾP cho em — TRUNG THỰC, cụ thể, BỐ CỤC RÕ RÀNG.",
      `SẮC THÁI BẮT BUỘC: ${tone}`,
      `NHẤT QUÁN xưng "Cô", gọi "em" (có thể kèm tên ${name}). KHÔNG "con", KHÔNG "ba mẹ".`,
      "",
      greet,
      "",
      strict
        ? [
            "CẤU TRÚC (mỗi phần cách nhau MỘT DÒNG TRỐNG \\n\\n, theo đúng thứ tự):",
            `1) 2-3 câu nói thẳng: em bỏ trống ${nBlank}/${v.total} câu nên bài chưa hoàn thành; điểm thấp là`,
            "   vì bỏ dở chứ không phải vì em kém — đây là việc làm bài chưa tới nơi.",
            "   Đây là phần NGHIÊM TÚC, không đùa tiếp — vào thẳng chuyện bỏ bài dở dang.",
            `   LƯU Ý: bài VẪN được chấm và em thấy ${v.score}/${v.total} trên màn hình. TUYỆT ĐỐI KHÔNG`,
            '   viết "cô chưa chấm" hay "cô không thể chấm" — sai sự thật và em sẽ hoang mang.',
            '2) Dòng bắt đầu bằng "Cần làm lại:" rồi XUỐNG DÒNG, mỗi ý một GẠCH ĐẦU DÒNG "- ".',
            "   Gạch ĐẦU TIÊN luôn là: làm lại ĐẦY ĐỦ cả bài, không bỏ câu nào.",
            "   Các gạch sau: gom những câu em TRẢ LỜI SAI theo cùng kiểu lỗi, in đậm **từ/cấu trúc sai**",
            "   và nói ngắn cách sửa. Gom được thì gom, lỗi rời rạc thì để riêng — đừng bỏ sót lỗi nào.",
            '3) Một câu kết DỨT KHOÁT: yêu cầu em làm lại đủ rồi nộp lại. KHÔNG khen, KHÔNG "cô tin em sẽ…".',
          ].join("\n")
        : [
            "CẤU TRÚC (mỗi phần cách nhau MỘT DÒNG TRỐNG \\n\\n, theo đúng thứ tự):",
            (partial
              ? `1) 1-2 câu: ghi nhận thật ngắn rồi nói rõ em còn bỏ trống ${nBlank}/${v.total} câu.`
              : "1) 1–2 câu nhận định thẳng về kết quả (đúng sắc thái trên) + một câu khích lệ/nhắc nhở ngắn.") +
              "\n   Đây là phần NGHIÊM TÚC, không đùa tiếp — vào thẳng kết quả.",
            perfect
              ? '2) Dòng bắt đầu bằng "Làm tốt:" — 1–2 điểm mạnh CỤ THỂ (dựa vào kỹ năng của bài), mỗi ý một gạch đầu dòng "- ".'
              : pctVal < 50
                ? "" // no praise section when the result is a fail
                : `2) Dòng bắt đầu bằng "Điểm mạnh:" — MỘT câu khen điểm mạnh cụ thể, có thật trong dữ liệu (vd ${partial ? "" : "làm đủ bài, "}đúng trọn phần từ vựng). KHÔNG khen chung chung.`,
            perfect
              ? ""
              : `${pctVal < 50 ? "2" : "3"}) Dòng bắt đầu bằng "Cần sửa:" rồi XUỐNG DÒNG, mỗi ý một GẠCH ĐẦU DÒNG "- ".\n` +
                "   BẮT BUỘC GOM NHÓM: mỗi gạch là MỘT KIỂU LỖI (chia động từ / thì / từ vựng / giới từ /\n" +
                "   đọc hiểu / bất cẩn), gộp mọi câu cùng kiểu vào một gạch.\n" +
                `   Bài này có ${wrong.length} câu sai. Gom được tới đâu thì gom tới đó — 2-4 gạch là đẹp.\n` +
                "   NHƯNG KHÔNG ĐƯỢC gượng ép: lỗi nào thật sự rời rạc (vd nhiều từ vựng khác nhau) thì cứ\n" +
                "   để riêng và GIẢI THÍCH ĐỦ, thà dài mà đúng còn hơn nhồi vào một nhóm chung chung.\n" +
                "   TUYỆT ĐỐI KHÔNG bỏ sót lỗi chỉ để cho danh sách ngắn.\n" +
                "   Mỗi gạch: in đậm **từ/cấu trúc sai** + giải thích NGẮN vì sao sai và cách sửa." +
                (nBlank ? `\n   Có ${nBlank} câu bỏ trống thì gạch ĐẦU TIÊN phải nhắc em làm đủ các câu đó.` : ""),
            `${perfect ? "3" : pctVal < 50 ? "3" : "4"}) Dòng "Luyện tiếp:" — 1–2 việc cụ thể, làm được ngay (${perfect ? "một thử thách khó hơn cùng chủ điểm" : "bám đúng lỗi ở trên; nếu là lỗi TỪ VỰNG, gợi ý em ôn lại bộ từ theo chủ đề trong mục Từ vựng"}).`,
            pctVal < 50
              ? '4) Một câu kết DỨT KHOÁT: yêu cầu em ôn lại rồi làm lại bài. KHÔNG khen, KHÔNG "cô tin em sẽ…".'
              : partial
                ? "5) Một câu kết: nhắc em lần sau làm trọn vẹn cả bài."
                : `${perfect ? "4" : "5"}) Một câu kết ngắn, ấm áp — Cô tin em tiến bộ khi luyện thêm.`,
          ]
            .filter(Boolean)
            .join("\n"),
      "",
      'QUAN TRỌNG: MỌI từ/cụm tiếng Anh khi nhắc tới đều đặt trong **…** để nổi bật (vd **grandmother**, **present simple**).',
      'ĐỊNH DẠNG: chỉ dùng **đậm** và gạch đầu dòng "- "; KHÔNG tiêu đề #, KHÔNG markdown khác. Tránh lan man, không lời chúc dài.',
      'Trả JSON: {"feedback": string} — dùng \\n\\n ngăn cách các phần và \\n cho từng gạch đầu dòng.',
    ]
      .filter(Boolean)
      .join("\n");
  },
};

// Nhận xét bài ĐỌC TO: dựa trên điểm phát âm Azure (không phải câu đúng/sai).
const readingFeedback: AiTask = {
  input: aiReadingFeedbackInputSchema,
  output: aiReadingFeedbackOutputSchema,
  temperature: 0.5,
  system:
    "Bạn là CÔ GIÁO tiếng Anh đang nhận xét phần ĐỌC TO (phát âm) của học sinh. " +
    "NHẤT QUÁN xưng 'Cô' và gọi học sinh là 'em' — TUYỆT ĐỐI KHÔNG dùng 'con', KHÔNG chào 'ba mẹ'. Có thể kèm tên em. " +
    "Chân thành và CỤ THỂ về phát âm; tránh thuật ngữ khó. Chỉ dựa vào dữ liệu, không bịa. " +
    "Sắc thái KHÔNG cố định: bài làm nghiêm túc thì ấm áp, bài đọc bỏ dở thì nghiêm khắc — " +
    "sắc thái bắt buộc cho từng bài được ghi rõ trong phần dữ liệu, PHẢI theo đúng. " +
    "CHỈ trả JSON đúng cấu trúc, không thêm chữ nào ngoài JSON.",
  build: (v) => {
    const name = v.student_name?.trim() || "học sinh";
    const weak = (v.weak_words as { word: string; errorType: string; accuracy?: number | null }[]) ?? [];
    // Tách 3 loại lỗi để AI nhận xét ĐÚNG bản chất (đọc nhầm ≠ phát âm chưa tròn).
    const mispron = weak.filter((w) => w.errorType === "Mispronunciation");
    const omission = weak.filter((w) => w.errorType === "Omission");
    const insertion = weak.filter((w) => w.errorType === "Insertion");
    const listOr = (arr: { word: string; accuracy?: number | null }[], withScore = false) =>
      arr.length
        ? arr
            .slice(0, 15)
            .map((w) => (withScore && w.accuracy != null ? `"${w.word}" (${Math.round(w.accuracy)}%)` : `"${w.word}"`))
            .join(", ")
        : "(không có)";
    const weakPhonemes = (v.weak_phonemes as string[] | undefined) ?? [];
    const transcript = String(v.transcript || "").slice(0, 1500).trim();

    // Counted HERE, from weak_words, rather than passed in: two call sites build this input
    // (readingJob on submit, routes/reading.ts on regenerate) and a field added to only one of them
    // would silently arrive as zero. Both already send the complete error list.
    const nOmit = omission.length;
    const nIns = insertion.length;
    const read = Number(v.completeness) || 0; // Azure's share of the text actually read (0-100)
    // Tone is driven by HOW MUCH was read, not by the score: a take that stops a third of the way in
    // scores badly for the right reason, but the reply has to name the unfinished work, not coach
    // pronunciation on the fragment that was read.
    const strict = read < 50;
    const partial = !strict && read < 80;
    // Read in full but scored low: no warm opening, no promises — the pronunciation is the news.
    const weakPron = !strict && !partial && Number(v.pron_score) < 50;
    const tone = strict
      ? `NGHIÊM KHẮC. Em mới đọc ${read}% bài${nOmit ? ` và bỏ sót ${nOmit} từ` : ""} — bài này CHƯA HOÀN THÀNH. ` +
        "Nói thẳng ngay câu đầu rằng em chưa đọc hết bài, nêu ĐÚNG con số. Đây là chuyện làm bài chưa " +
        "tới nơi, KHÔNG phải chuyện em kém — nói rõ vậy. Yêu cầu em thu lại và đọc TRỌN VẸN cả bài. " +
        "TUYỆT ĐỐI KHÔNG mở đầu bằng lời khen, KHÔNG có mục điểm mạnh, KHÔNG hứa hẹn hoa mỹ ở cuối. " +
        "Nghiêm nhưng TÔN TRỌNG: không mỉa mai, không chì chiết, không nói em lười."
      : partial
        ? `NHẮC NHỞ RÕ RÀNG. Em đọc được ${read}% bài${nOmit ? `, còn bỏ sót ${nOmit} từ` : ""} — chưa trọn vẹn. ` +
          "Ghi nhận thật ngắn (một vế câu) rồi chỉ thẳng phần còn bỏ dở và yêu cầu đọc đủ ở lần sau."
        : weakPron
          ? "NHẮC NHỞ THẲNG. Em đã đọc đủ bài — ghi nhận đúng một câu — nhưng phát âm còn yếu " +
            `(${v.pron_score}/100). Chỉ thẳng những từ/âm sai nhiều nhất và yêu cầu luyện lại rồi thu lại. ` +
            "KHÔNG khen phát âm, KHÔNG hứa hẹn hoa mỹ."
          : "ẤM ÁP, chân thành. Em đã đọc gần đủ/đủ bài — ghi nhận xứng đáng rồi góp ý phát âm cụ thể.";

    const humor = strict
      ? "CÓ GAI nhưng không hạ nhục — trêu đúng chỗ em bỏ bài đọc dở dang, để em thấy nhột mà thu lại"
      : partial
        ? "dí dỏm, nửa đùa nửa nhắc về phần em chưa đọc hết"
        : read >= 95 && Number(v.pron_score) >= 80
          ? "hài hước ấm áp, tán thưởng hơi phóng đại một chút cho vui"
          : "dí dỏm nhẹ, thân mật";

    return [
      `Học sinh: ${learnerLine(name, v.student_gender, v.student_age)}.`,
      `Bài đọc: "${v.title}".`,
      `Đề bài — đoạn văn em CẦN đọc:\n"""\n${String(v.passage).slice(0, 1400)}\n"""`,
      "",
      // Đối chiếu đề ↔ điều máy nghe được: đây là chìa khoá để nhận xét SÁT.
      "Điều máy NGHE được khi em đọc (có thể sai/thiếu/lặp so với đề — dùng để chỉ ra chỗ đọc chưa đúng, ĐỪNG chép lại nguyên văn):",
      transcript ? `"""\n${transcript}\n"""` : "(Máy gần như không nghe được — em đọc quá nhỏ/ngắt quãng.)",
      "",
      "Điểm (0-100, ĐÃ tính theo độ trung thành với đề — đọc thừa/thiếu/nhầm bị trừ):",
      `- Tổng: ${v.pron_score} · Đọc đúng & tròn tiếng: ${v.accuracy} · Trôi chảy: ${v.fluency} · Đọc đủ: ${v.completeness}${
        v.prosody != null ? ` · Ngữ điệu: ${v.prosody}` : ""
      }`,
      "",
      `MỨC ĐỘ HOÀN THÀNH: em đọc ${read}% bài · bỏ sót ${nOmit} từ · đọc thừa/nhầm ${nIns} từ.`,
      "",
      "Chi tiết lỗi (đối chiếu đề):",
      `- Phát âm chưa tròn (${mispron.length} từ): ${listOr(mispron, true)}`,
      `- ĐỌC THIẾU — bỏ sót từ trong đề (${nOmit} từ${nOmit > 15 ? ", liệt kê 15 từ đầu" : ""}): ${listOr(omission)}`,
      `- ĐỌC THỪA / NHẦM — đọc ra từ không có, hoặc lặp (${nIns} từ${nIns > 15 ? ", liệt kê 15 từ đầu" : ""}): ${listOr(insertion)}`,
      weakPhonemes.length
        ? `- ÂM (IPA) đọc sai LẶP LẠI cả bài — nên nhắc em luyện đúng các âm này: ${weakPhonemes.join(", ")}.`
        : "",
      "",
      "Hãy viết như CÔ GIÁO nhắn TRỰC TIẾP cho em — TRUNG THỰC, cụ thể, BỐ CỤC RÕ RÀNG.",
      `SẮC THÁI BẮT BUỘC: ${tone}`,
      `NHẤT QUÁN xưng "Cô", gọi "em" (có thể kèm tên ${name}). KHÔNG "con", KHÔNG "ba mẹ".`,
      "",
      greetingBlock({ name, gender: v.student_gender, age: v.student_age, humor }),
      "",
      strict
        ? [
            "CẤU TRÚC (mỗi phần cách nhau MỘT DÒNG TRỐNG \\n\\n, theo đúng thứ tự):",
            `1) 2-3 câu nói thẳng: em mới đọc ${read}% bài và bỏ sót ${nOmit} từ nên bài chưa hoàn thành;`,
            "   điểm thấp là vì bỏ dở chứ không phải vì em đọc kém — đây là việc làm bài chưa tới nơi.",
            `   LƯU Ý: bài VẪN được chấm và em thấy ${v.pron_score} điểm trên màn hình. TUYỆT ĐỐI KHÔNG`,
            '   viết "cô chưa chấm" hay "cô không thể chấm" — sai sự thật và em sẽ hoang mang.',
            '2) Dòng bắt đầu bằng "Cần làm lại:" rồi XUỐNG DÒNG, mỗi ý một GẠCH ĐẦU DÒNG "- ".',
            "   Gạch ĐẦU TIÊN luôn là: đọc lại TRỌN VẸN cả bài, không bỏ câu nào.",
            "   Các gạch sau: nêu đúng những từ trong đề em đã bỏ sót (in đậm **từ**), rồi tới từ phát",
            "   âm chưa tròn kèm mẹo ngắn. Tối đa 4 gạch.",
            '3) Một câu kết DỨT KHOÁT: yêu cầu em thu lại và đọc hết bài rồi nộp lại. KHÔNG khen, KHÔNG "cô tin em sẽ…".',
          ].join("\n")
        : [
            "CẤU TRÚC (mỗi phần cách nhau MỘT DÒNG TRỐNG \\n\\n, theo đúng thứ tự):",
            partial
              ? `1) 1-2 câu: ghi nhận thật ngắn rồi nói rõ em mới đọc ${read}% bài, còn bỏ sót ${nOmit} từ.`
              : weakPron
                ? `1) 1-2 câu: ghi nhận em đã đọc đủ bài, rồi nói thẳng phát âm còn yếu (${v.pron_score} điểm).`
                : "1) Một đoạn mở đầu ấm áp: ghi nhận nỗ lực & nhắc điểm tổng tự nhiên, khích lệ chân thành.",
            '2) Dòng bắt đầu bằng "Điểm mạnh:" — 1 câu khen điểm mạnh cụ thể (vd trôi chảy / đọc đủ).',
            '3) Dòng bắt đầu bằng "Cần luyện lại:" rồi XUỐNG DÒNG, mỗi ý một GẠCH ĐẦU DÒNG "- ": ưu tiên nhắc chỗ ĐỌC THIẾU/NHẦM trước (nêu đúng từ trong đề em bỏ sót hoặc đọc sai), rồi tới từ phát âm chưa tròn kèm mẹo ngắn; in đậm **từ**. Tối đa 4 gạch đầu dòng.',
            '4) Dòng bắt đầu bằng "Gợi ý luyện tập:" — 1–2 việc nhỏ.',
            partial
              ? "5) Một câu kết: nhắc em lần sau đọc trọn vẹn cả bài."
              : weakPron
                ? "5) Một câu kết DỨT KHOÁT: luyện lại các từ trên rồi thu lại bài."
                : "5) Một câu kết ấm áp, Cô tin em sẽ tiến bộ khi luyện thêm.",
          ].join("\n"),
      "",
      "ĐỊNH DẠNG: chỉ dùng **đậm** để nhấn mạnh từ khóa và gạch đầu dòng \"- \" cho danh sách; KHÔNG dùng tiêu đề # hay cú pháp markdown khác.",
      "",
      'Trả JSON: {"feedback": string} — dùng \\n\\n ngăn cách các phần và \\n cho từng gạch đầu dòng.',
    ]
      .filter(Boolean)
      .join("\n");
  },
};

// ══ WRITING GRADING ═════════════════════════════════════════════════════════

const gradeWriting: AiTask = {
  input: aiWritingJudgeInputSchema,
  output: aiWritingJudgeOutputSchema,
  temperature: 0.2, // chấm điểm cần ổn định; vẫn cần chút tự nhiên cho phần nhận xét
  system: WRITING_JUDGE_SYSTEM,
  graded: true, // đổi model = đổi điểm học sinh → phải hiệu chuẩn lại trên bộ mẫu chuẩn
  maxOutputTokens: 4096, // analysis + 4 scores + comment in one pass
  build: (v) => buildWritingJudge(v as Record<string, unknown>),
};

const generateQuestions: AiTask = {
  input: aiGenerateQuestionsInputSchema,
  output: aiGenerateQuestionsOutputSchema,
  temperature: 0.7,
  system:
    "You are an English test author for an online class (primary to adult). " +
    "Generate questions grounded in the source, at the right level, with exactly correct answers. " +
    "Return ONLY JSON in the required shape — nothing outside the JSON.",
  build: (v) => {
    const specs = (v.types as (keyof typeof QTYPE_SPEC)[]).filter((t) => QTYPE_SPEC[t]).map((t) => `- ${t}: ${QTYPE_SPEC[t]}`);
    return [
      `Generate ${v.count} questions${v.skill ? ` for the ${v.skill} skill` : ""}${v.level ? ` at level "${v.level}"` : ""}.`,
      `Use only these types${v.types.length > 1 ? " and mix them for variety" : ""}: ${v.types.join(", ")}.`,
      `Source (passage / listening script / topic / word list):\n"""\n${v.source}\n"""`,
      ...(v.context ? [`Context/setting: ${v.context}`] : []),
      ...(v.keywords ? [`These words/phrases MUST appear across the questions: ${v.keywords}`] : []),
      ...(v.difficulty ? [`Difficulty within the level: ${v.difficulty}`] : []),
      // Detailed description of the chosen grammar points (summary, form, signals, common
      // mistakes). Far more useful per token than the flat catalogue, so it goes first.
      ...(v.focus?.trim() ? ["", v.focus.trim()] : []),
      ...(v.bands?.length && !v.grammar_ids?.length
        ? ["", `Spread the questions across DIFFERENT grammar points at ${(v.bands as string[]).join(" / ")} — pick them from the ALLOWED LIST below.`]
        : []),
      "",
      'Return JSON: {"questions": [ ... ]}. EXACT structure per type:',
      ...specs,
      "",
      "Mandatory rules:",
      "- multiple_choice: exactly one answer; `answer` must equal one element of `options`.",
      "- ordering: `tokens` joined in order (single spaces) must equal `answer`.",
      "- categorize: every item `category` must be in `categories`.",
      "- No fields beyond the structure above, except an optional short `explanation` (in English) and `grammar_id` when asked; no commentary; no markdown; answers correct per the source.",
      // translate flips the language of `question`, so the blanket "everything in English" reading
      // of the rules above would be wrong; spell its rules out whenever it is one of the types.
      ...((v.types as string[]).includes("translate") ? ["", TYPE_RULE.translate] : []),
      // Có sổ tay ngữ pháp → gắn nhãn luôn tại đây, khỏi tốn thêm lượt tag_grammar.
      ...(v.catalog?.length
        ? [
            "",
            "GRAMMAR TAGGING — add `grammar_id` to every question: an id from the list below (NEVER invent one),",
            "naming the ONE grammar point the question tests. Tests no grammar / not sure → null (a wrong tag is worse than none).",
            "ALLOWED LIST (id | CEFR | name | signals):",
            (v.catalog as GrammarCatalogItem[])
              .map((g) => `${g.id} | ${g.cefr} | ${g.title}${g.keywords?.length ? ` | signals: ${g.keywords.join(", ")}` : ""}`)
              .join("\n"),
          ]
        : []),
    ].join("\n");
  },
};

const generateWordlist: AiTask = {
  input: aiGenerateWordlistInputSchema,
  output: aiGenerateWordlistOutputSchema,
  temperature: 0.5,
  // Prompt bằng TIẾNG ANH; chỉ ô `meaning` là tiếng Việt (nghĩa cho học sinh Việt Nam).
  system:
    "You are an English-Vietnamese lexicographer for school learners. Glosses must be short, accurate " +
    "and context-appropriate. Return ONLY JSON — nothing outside the JSON.",
  build: (v) => {
    const form = (v.form ?? "both") as "word" | "phrase" | "both";
    const FORM_RULE: Record<typeof form, string> = {
      word: "SINGLE WORDS ONLY (one token each). NEVER return an entry of two or more words.",
      phrase:
        "MULTI-WORD ITEMS ONLY (collocation / phrasal verb / short idiom): EVERY entry must be two or more words. " +
        "NEVER return a single word.",
      both: "BOTH kinds: about half single words, half multi-word items (collocations / phrasal verbs).",
    };
    const exclude = (v.exclude ?? []) as string[];
    return [
      // "at most N" khiến model trả 15 khi xin 25 — nêu con số CỨNG và bắt đếm lại.
      `From the list/topic below, build EXACTLY ${v.count} vocabulary entries — no fewer, no more.`,
      `Count again before answering: the "wordlist" array must contain exactly ${v.count} items.`,
      `Source:\n"""\n${v.source}\n"""`,
      "",
      `REQUIRED ITEM FORM: ${FORM_RULE[form]}`,
      exclude.length
        ? `DO NOT return any of the entries already collected below (nor inflected variants):\n${exclude
            .slice(0, 300)
            .map((w) => `- ${w}`)
            .join("\n")}\nAll ${v.count} entries must be NEW with respect to that list.`
        : "",
      "",
      // `word` phải SẠCH (không nhét từ loại vào) vì nó là khoá khử trùng với ngân hàng
      // (normalizeWordForCompare) — "art gallery (n)" sẽ tạo mục rác không bao giờ khớp lại.
      '`word` must be the clean term only — NO part-of-speech in brackets (write "art gallery", not "art gallery (n)").',
      "`ipa` must be General American (GA) with stress marks ˈ/ˌ, WITHOUT slashes — e.g. aunt → ænt, NOT the British ɑːnt.",
      "`example` must be ONE complete sentence containing the entry, not a definition fragment.",
      // Thực tế đã dính: AI trả "my little sister", "our pet dog", "the whole family" —
      // đó là cụm trong câu, không phải mục từ vựng để học.
      "`word` must NOT start with an article or possessive (a/an/the/my/our/your/his/her/their): " +
        'write "little sister", NOT "my little sister"; write "pet dog", NOT "our pet dog".',
      'Return JSON: {"wordlist": [ {"word": string, "pos": string (n/v/adj/adv/prep...), "ipa": string (IPA), ' +
        '"meaning": string (gloss in VIETNAMESE), "example": string (English example sentence)} ]}.',
    ]
      .filter(Boolean)
      .join("\n");
  },
};

// Điền ipa/nghĩa/ví dụ/pos cho DANH SÁCH TỪ có sẵn (ngân hàng từ vựng v2).
const fillVocab: AiTask = {
  input: aiFillVocabInputSchema,
  output: aiFillVocabOutputSchema,
  temperature: 0.3,
  system:
    "You are an English-Vietnamese lexicographer writing learner's-dictionary entries for Vietnamese " +
    "students. Every field must be accurate, natural and consistent with ONE chosen sense of the entry. " +
    "KEEP each entry exactly as given (never change it, never add or drop entries). Return ONLY JSON.",
  build: (v) =>
    [
      "Write a complete entry for each of these English words / phrases:",
      (v.words as string[]).map((w) => `- ${w}`).join("\n"),
      "",
      v.context ? `Learner: ${v.context}` : "",
      v.instruction ? `Teacher's instruction (follow it): ${v.instruction}` : "",
      // Grammatical but wrong-audience senses happened before ("brother" as a monk, "baby" as
      // pregnancy): pin the everyday sense and keep examples short and age-appropriate.
      "Use the MOST COMMON everyday sense (the one a learner meets first) unless the teacher's instruction " +
        "names another; never a technical, religious or archaic sense. ALL fields describe that same sense.",
      "Field rules:",
      "- pos: n / v / adj / adv / prep / conj / pron / phr v / idiom / phrase.",
      "- ipa: General American IPA with stress marks ˈ ˌ, no slashes (e.g. ˈbjuːtɪfəl). For a phrase, the whole phrase.",
      "- meaning: short VIETNAMESE gloss (2-8 words), the way a good bilingual dictionary writes it; no English.",
      "- definition: ONE short English learner's-dictionary definition (max 15 words), simpler than the word itself.",
      "- example: ONE natural everyday English sentence (6-14 words) that CONTAINS the entry (an inflected form " +
        "is fine), suited to the learner's age; avoid adult topics (illness, religion, politics, romance).",
      "- example_vi: natural Vietnamese translation of `example`.",
      "- cefr: the CEFR level of this sense: A1 / A2 / B1 / B2 / C1 / C2.",
      "- collocations: 2-4 very common combinations containing the entry (e.g. for 'decision': 'make a decision').",
      "- family: 0-4 related forms with their part of speech, e.g. 'beauty (n)', 'beautifully (adv)'; empty for phrases.",
      "- synonyms: 0-3 common equivalents in this sense; antonyms: 0-2 common opposites; empty arrays when none.",
      "- note: OPTIONAL short VIETNAMESE usage note or common mistake for Vietnamese learners (one sentence), " +
        "empty string when there is nothing useful to say.",
      'Return JSON: {"items": [ {"word": string (exactly as given), "pos": string, "ipa": string, "meaning": string, ' +
        '"definition": string, "example": string, "example_vi": string, "cefr": string, "synonyms": string[], ' +
        '"antonyms": string[], "collocations": string[], "family": string[], "note": string} ]}.',
    ]
      .filter(Boolean)
      .join("\n"),
};

const monthlyReport: AiTask = {
  input: aiMonthlyReportInputSchema,
  output: aiMonthlyReportOutputSchema,
  temperature: 0.5,
  system:
    "Bạn là CÔ GIÁO tiếng Anh, viết BÁO CÁO HỌC TẬP THÁNG cho học sinh (phụ huynh cùng đọc). " +
    "NHẤT QUÁN xưng 'Cô' và gọi học sinh là 'em' — TUYỆT ĐỐI KHÔNG dùng 'con', KHÔNG 'thầy', KHÔNG chào/nhắn 'ba mẹ' (học sinh nhiều lứa tuổi); có thể gọi kèm tên em. " +
    "Viết bằng tiếng Việt, giọng ấm áp, động viên nhưng trung thực và CỤ THỂ. " +
    "Chỉ dựa vào dữ liệu được cung cấp, không bịa. CHỈ trả về JSON đúng cấu trúc.",
  build: (v) => {
    const s = v.summary;
    const skillLines = s.by_skill.length
      ? s.by_skill
          .map(
            (k: any) =>
              `  - ${SKILL_VI[k.skill] ?? k.skill}: ${k.done} bài${
                k.avg_pct != null ? `, TB ${Math.round(k.avg_pct)}%` : ""
              }`,
          )
          .join("\n")
      : "  (chưa có dữ liệu theo kỹ năng)";

    const mistakes = v.mistakes.slice(0, 40);
    const mistakeBlock = mistakes.length
      ? mistakes
          .map((m: any, i: number) => {
            const sk = m.skill ? `[${SKILL_VI[m.skill] ?? m.skill}] ` : "";
            return `${i + 1}. ${sk}${String(m.question).replace(/\s+/g, " ").trim()} → em: "${
              m.student_answer?.trim() || "(bỏ trống)"
            }" | đúng: "${m.correct_answer?.trim() || ""}"`;
          })
          .join("\n")
      : "(Không ghi nhận câu sai nào trong tháng.)";

    // Khối ĐỌC TO (nếu tháng này em có luyện đọc chấm phát âm).
    const rd = s.reading;
    const readingBlock =
      rd && rd.count > 0
        ? [
            "",
            "Luyện ĐỌC TO (chấm phát âm) trong tháng:",
            `- Số lượt đọc: ${rd.count}${rd.avg_pron != null ? `, điểm phát âm TB ${rd.avg_pron}/100` : ""}` +
              `${rd.avg_accuracy != null ? ` (chính xác âm ${rd.avg_accuracy}, trôi chảy ${rd.avg_fluency}, đọc đủ ${rd.avg_completeness})` : ""}.`,
            rd.weak_words?.length
              ? `- Từ hay phát âm chưa chuẩn/thiếu: ${rd.weak_words.map((w: any) => `${w.word}${w.count > 1 ? ` (×${w.count})` : ""}`).join(", ")}.`
              : "- Không ghi nhận từ phát âm sai nổi bật.",
            rd.notes?.length
              ? `- Nhận xét phát âm ĐÃ CÓ (hãy DÙNG LẠI/tóm gọn ý, không viết lại từ đầu):\n${rd.notes.map((n: string, i: number) => `  (${i + 1}) ${n.replace(/\*\*/g, "").replace(/\s+/g, " ").trim()}`).join("\n")}`
              : "",
          ].filter(Boolean).join("\n")
        : "";

    // Chuyên cần & xếp hạng (streak/rank/tổng điểm) — nếu có.
    const at = s.attendance;
    const attendanceLine = at
      ? `Chuyên cần: học ${at.active_days} ngày trong tháng. Tính từ trước tới nay (KHÔNG phải riêng tháng này): ` +
        `chuỗi hiện tại ${at.streak_days} ngày (kỷ lục ${at.best_streak_days}); tổng ${at.total_points} điểm${at.rank != null ? `, hạng #${at.rank} trên bảng xếp hạng` : ""}.`
      : "";

    // Độ chính xác theo loại câu — nêu các dạng còn yếu.
    const qt = s.question_types;
    const questionTypeLine =
      qt && qt.length
        ? `Độ chính xác theo dạng câu: ${qt
            .slice()
            .sort((a: any, b: any) => a.accuracy - b.accuracy)
            .map((t: any) => `${questionTypeLabel(t.type)} ${t.accuracy}% (${t.correct}/${t.total})`)
            .join("; ")}.`
        : "";

    // Từ vựng trong tháng.
    const vc = s.vocab;
    const vocabLine =
      vc && (vc.sessions > 0 || vc.words_mastered > 0)
        ? `Từ vựng: ${vc.sessions} buổi luyện${vc.avg_pct != null ? ` (điểm TB ${vc.avg_pct}%)` : ""}; đã học thêm ${vc.words_learned} từ trong tháng, tổng ${vc.words_mastered} từ đã thuộc.`
        : "";

    // Weakest grammar points, already grouped by the server from the questions' grammar tags.
    const gw = (s.grammar ?? []) as { title: string; wrong: number; seen: number }[];
    const grammarLine = gw.length
      ? `Điểm ngữ pháp sai nhiều nhất: ${gw.slice(0, 5).map((g) => `${g.title} (sai ${g.wrong}/${g.seen} câu)`).join("; ")}.`
      : "";

    const extraBlock = [attendanceLine, questionTypeLine, vocabLine, grammarLine]
      .filter(Boolean)
      .join("\n");

    return [
      `Học sinh: ${v.student_name}. Tháng: ${v.month}.`,
      "",
      "Tổng quan hoạt động trong tháng:",
      `- Số bài đã làm: ${s.exercises_done}${s.avg_pct != null ? `, điểm trung bình ${Math.round(s.avg_pct)}%` : ""}.`,
      "- Theo kỹ năng:",
      skillLines,
      readingBlock,
      extraBlock ? "\n" + extraBlock : "",
      "",
      `Danh sách câu SAI (tối đa 40)${v.mistakes.length > mistakes.length ? ` — còn ${v.mistakes.length - mistakes.length} câu nữa đã lược` : ""}:`,
      mistakeBlock,
      v.teacher_note?.trim() ? `\nGhi chú của giáo viên: ${v.teacher_note.trim()}` : "",
      "",
      "Hãy viết báo cáo gồm các phần sau. MỖI PHẦN bắt đầu bằng TIÊU ĐỀ ngắn KẾT THÚC bằng dấu hai chấm ':' trên MỘT DÒNG RIÊNG, rồi xuống dòng viết nội dung:",
      "1. Nhận xét chung: tinh thần, mức độ chuyên cần (dựa số bài), tiến bộ nổi bật của em.",
      "2. Điểm mạnh: kỹ năng/dạng bài em làm tốt (dựa điểm theo kỹ năng).",
      "3. Điểm cần cải thiện: GOM các câu sai thành nhóm chủ điểm (ngữ pháp/từ vựng/đọc hiểu" +
        (gw.length ? " — với ngữ pháp, dùng đúng các ĐIỂM NGỮ PHÁP sai nhiều nhất ở trên" : "") +
        "); mỗi nhóm MỘT gạch đầu dòng '-' giải thích ngắn lỗi + cách sửa + 1 ví dụ đúng.",
      "4. Định hướng tháng tới: liệt kê 3–5 việc luyện tập cụ thể, MỖI việc một dòng đánh số '1.', '2.'…",
      "5. Lời nhắn động viên: Cô nhắn riêng cho em, ấm áp và chân thành.",
      rd && rd.count > 0
        ? "Nếu có dữ liệu ĐỌC TO, hãy nhận xét thêm về phát âm (điểm phát âm, điểm mạnh, và các từ cần luyện) đan xen vào mục Điểm mạnh / Điểm cần cải thiện / Định hướng cho phù hợp."
        : "",
      extraBlock
        ? "Nếu có dữ liệu Chuyên cần / dạng câu / Từ vựng / ngữ pháp ở trên, hãy khéo léo dẫn các con số này vào bài (chuyên cần & chuỗi ngày ở mục Nhận xét chung; từ vựng ở Điểm mạnh/cải thiện; dạng câu yếu nhất gợi ý ở Định hướng). KHÔNG bịa số không có."
        : "",
      "",
      "XƯNG HÔ BẮT BUỘC: NHẤT QUÁN 'Cô' – 'em'; KHÔNG dùng 'con', KHÔNG 'thầy', KHÔNG chào 'ba mẹ'.",
      "Định dạng: văn xuôi tiếng Việt tự nhiên; tiêu đề mục KẾT THÚC bằng ':'; danh sách dùng '-' hoặc số; KHÔNG markdown (**, #), KHÔNG bảng. Độ dài vừa phải, dễ đọc.",
      "",
      'Trả JSON: {"report": string}.',
    ].join("\n");
  },
};

// Gom câu sai của tháng thành 2–4 CHỦ ĐIỂM cần luyện + gợi ý ngắn.
const reportFocus: AiTask = {
  input: aiReportFocusInputSchema,
  output: aiReportFocusOutputSchema,
  temperature: 0.3,
  system:
    "Bạn là giáo viên tiếng Anh. Từ danh sách câu SAI của một học sinh, hãy GOM thành 2–4 CHỦ ĐIỂM cần luyện " +
    "(vd: cụm động từ, thì của động từ, giới từ, từ vựng chủ đề X, đọc hiểu suy luận…). " +
    "Mỗi chủ điểm kèm 1 gợi ý luyện tập NGẮN, cụ thể, dễ hiểu cho phụ huynh (tiếng Việt). " +
    "Chỉ dựa vào dữ liệu, không bịa. Viết như nhận xét của giáo viên — KHÔNG nhắc tới AI/mô hình. " +
    "CHỈ trả về JSON đúng cấu trúc.",
  build: (v) => {
    const lines = v.mistakes
      .slice(0, 30)
      .map((m: any, i: number) => {
        const sk = m.skill ? `[${SKILL_VI[m.skill] ?? m.skill}] ` : "";
        return `${i + 1}. ${sk}${String(m.question).replace(/\s+/g, " ").trim()} → em: "${
          m.student_answer?.trim() || "(bỏ trống)"
        }" | đúng: "${m.correct_answer?.trim() || ""}"`;
      })
      .join("\n");
    return [
      `Học sinh: ${v.student_name}.`,
      "",
      "Các câu SAI trong tháng:",
      lines,
      "",
      "Hãy gom thành 2–4 chủ điểm cần luyện. Ưu tiên chủ điểm lặp lại nhiều lần.",
      'Trả JSON: {"focus": [{"topic": string (tên chủ điểm ngắn), "note": string (gợi ý luyện tập 1 câu)}]}.',
    ].join("\n");
  },
};

// Sinh TRỌN bài tập — system prompt TĨNH (tri thức + ví dụ JSON) ở lib/ai/prompts.
const generateExercise: AiTask = {
  input: aiGenerateExerciseInputSchema,
  output: aiGenerateExerciseOutputSchema,
  temperature: 0.6,
  // Chọn prompt CHUYÊN biệt theo template (blueprint); catalog có → kèm gắn `grammar_id`.
  system: (v: AiGenerateExerciseInput) => composeQuizSystemPrompt(v.template, v.catalog, v.focus),
  build: (v) => buildUserPrompt(v),
};

// Sinh bài ĐỌC TO (reading record): passage + wordlist, KHÔNG có câu hỏi.
const generateReading: AiTask = {
  input: aiGenerateReadingInputSchema,
  output: aiGenerateReadingOutputSchema,
  temperature: 0.6,
  system: composeReadingSystemPrompt(),
  build: (v) => buildReadingUserPrompt(v),
};

// Generate a WRITING exercise: prompt + outline + sample answer.
const generateWriting: AiTask = {
  input: aiGenerateSpeakingInputSchema,
  output: aiGenerateSpeakingOutputSchema,
  temperature: 0.6,
  system: composeWritingSystemPrompt(),
  build: (v) => buildWritingUserPrompt(v),
};

// Phiên âm IPA đoạn văn theo câu (cho bài đọc to).
const generateIpa: AiTask = {
  input: aiIpaInputSchema,
  output: aiIpaOutputSchema,
  temperature: 0.2,
  system: IPA_SYSTEM,
  build: (v) => buildIpaPrompt(v.passage),
};

// Gắn điểm ngữ pháp cho từng câu hỏi — CHỈ được chọn trong catalog truyền vào.
// Ưu tiên ĐỘ CHÍNH XÁC: thà trả null còn hơn gắn bừa (học sinh đọc thẳng ở báo cáo).
const tagGrammar: AiTask = {
  input: aiTagGrammarInputSchema,
  output: aiTagGrammarOutputSchema,
  temperature: 0.1,
  system:
    "You are an English curriculum specialist. Classify each exercise question by the GRAMMAR POINT it TESTS. " +
    "Mandatory rules: " +
    "(1) `grammar_id` MUST be an id from the supplied catalogue — NEVER invent an id or a name. " +
    "(2) Pick EXACTLY ONE main grammar point the question truly tests (look at the gap / correct answer, " +
    "not at the topic of the exercise). " +
    "(3) A question that tests no grammar (reading for information, word meaning, spelling, pronunciation) → " +
    "`grammar_id` = null. " +
    "(4) When unsure → null. A WRONG tag is far worse than none. " +
    "(5) Return every position asked for, matching the question count. " +
    "Return ONLY JSON in the required shape — nothing outside the JSON.",
  build: (v: AiTagGrammarInput) => {
    const catalog = v.catalog
      .map((g) => `${g.id} | ${g.cefr} | ${g.title}${g.keywords?.length ? ` | signals: ${g.keywords.join(", ")}` : ""}`)
      .join("\n");
    const questions = v.questions
      .map((q) => {
        const parts = [`[${q.position}] (${q.type}) ${q.question}`];
        if (q.options?.length) parts.push(`   Options: ${q.options.join(" / ")}`);
        if (q.answer) parts.push(`   Correct answer: ${q.answer}`);
        if (q.explanation) parts.push(`   Explanation: ${q.explanation}`);
        return parts.join("\n");
      })
      .join("\n");
    return [
      `Exercise: ${v.title}${v.skill ? ` · skill: ${v.skill}` : ""}${v.level ? ` · level: ${v.level}` : ""}`,
      v.passage?.trim() ? `\nContext (passage / listening script):\n${v.passage.trim().slice(0, 2000)}` : "",
      `\nALLOWED GRAMMAR CATALOGUE (id | CEFR | name | signals):\n${catalog}`,
      `\nQUESTIONS:\n${questions}`,
      `\nReturn JSON: {"tags": [{"position": number, "grammar_id": string|null}]} — exactly ${v.questions.length} items.`,
    ]
      .filter(Boolean)
      .join("\n");
  },
};

// Chuẩn hóa yêu cầu thô của giáo viên → prompt gạch đầu dòng.
const refinePrompt: AiTask = {
  input: aiRefinePromptInputSchema,
  output: aiRefinePromptOutputSchema,
  temperature: 0.3,
  system: REFINE_SYSTEM,
  build: (v) => buildRefinePrompt(v.text, v.context),
};

// Enhance riêng cho bài ĐỌC TO (field reading, không nhắc câu hỏi).
const refineReadingPrompt: AiTask = {
  input: aiRefinePromptInputSchema,
  output: aiRefinePromptOutputSchema,
  temperature: 0.3,
  system: REFINE_READING_SYSTEM,
  build: (v) => buildRefineReadingPrompt(v.text, v.context),
};

// Gợi ý GỘP Context/setting + Target vocabulary theo metadata đã chọn.
const suggestPair: AiTask = {
  input: aiSuggestPairInputSchema,
  output: aiSuggestPairOutputSchema,
  temperature: 0.6,
  system: SUGGEST_PAIR_SYSTEM,
  build: (v) => buildSuggestPair(v.context, v.full, v.kind),
};

// Enhance riêng cho BỘ THẺ TỪ VỰNG (không câu hỏi, chỉ tiêu chí chọn từ).
const refineVocabPrompt: AiTask = {
  input: aiRefinePromptInputSchema,
  output: aiRefinePromptOutputSchema,
  temperature: 0.3,
  system: REFINE_VOCAB_SYSTEM,
  build: (v) => buildRefineVocabPrompt(v.text, v.context),
};

// Dịch dàn ý bài NÓI sang tiếng Việt cho học sinh bấm xem.
const TRANSLATE_OUTLINE_SYSTEM = [
  "You translate the short English outline points of a writing task into natural Vietnamese for the learner.",
  "- Keep the SAME number of items, in the SAME order.",
  "- Each item: plain, friendly Vietnamese the learner understands. Do NOT add or drop ideas.",
  "- Keep it short — one clause, like the English source. No numbering, no extra explanation.",
  'OUTPUT CONTRACT — return ONLY: {"vi": ["...", "..."]}',
].join("\n");

const translateOutline: AiTask = {
  input: aiTranslateOutlineInputSchema,
  output: aiTranslateOutlineOutputSchema,
  temperature: 0.2,
  system: TRANSLATE_OUTLINE_SYSTEM,
  build: (v) =>
    ["Translate each line to Vietnamese:", ...(v.outline as string[]).map((o, i) => `${i + 1}. ${o}`)].join("\n"),
};

// LEVEL + TOPIC for a batch-imported video lesson. Judged from the transcript itself (vocabulary
// range, sentence length, speech density), not from the YouTube title — channels label everything
// "for beginners".
const videoClassify: AiTask = {
  input: aiVideoClassifyInputSchema,
  output: aiVideoClassifyOutputSchema,
  temperature: 0.1,
  system:
    "You are an experienced CEFR examiner sorting authentic English listening material for a " +
    "Vietnamese learning platform. Judge the LANGUAGE in the transcript, not the marketing title: " +
    "vocabulary range, sentence length and clause complexity, idioms/phrasal verbs, and how much " +
    "context a learner needs. Be strict — everyday two-speaker dialogue about familiar situations " +
    "is A2, not B2. Only return JSON in the required shape.",
  build: (v) => {
    const topics = (v.topics as { id: string; name: string }[]).map((t) => `  · ${t.id} = ${t.name}`).join("\n");
    const mins = v.duration ? Math.round((v.duration as number) / 60) : null;
    return [
      `YouTube title: ${v.title}${mins ? ` (${mins} min)` : ""}`,
      "",
      "Transcript excerpt:",
      '"""',
      v.transcript as string,
      '"""',
      "",
      "Pick exactly one level NAME from this list (copy it verbatim):",
      ...(v.levels as string[]).map((l) => `  · ${l}`),
      "",
      "Pick the single best topic id from this list, or null if none fits:",
      topics,
      "",
      "`title`: a short, clean English lesson title (max ~60 chars). Strip channel branding, " +
        "episode numbers and clickbait; keep what the lesson is actually about.",
      "`reason`: ONE sentence in Vietnamese explaining the level, citing what you saw in the language.",
      "",
      'Return JSON: {"level": string, "topic_id": string|null, "title": string, "reason": string}.',
    ].join("\n");
  },
};

// VIDEO LESSON BUILD: gloss each practice line + pick the words to blank out for dictation.
// Timestamps are NEVER touched (the server owns them) — only TEXT, keyed by index `i`. Lines from
// STT are already punctuated and match the audio word for word, so their text is not sent back:
// a line "improved" away from the audio marks the learner against words nobody said.
const videoSegment: AiTask = {
  input: aiVideoSegmentInputSchema,
  output: aiVideoSegmentOutputSchema,
  temperature: 0.2,
  system:
    "You prepare English listening/shadowing practice from a video transcript. " +
    "Each numbered line is ONE practice chunk: never split a line, never merge two lines. " +
    "RETURN ONE ENTRY FOR EVERY LINE — same count, same `i`, in order; a line you cannot improve " +
    "comes back unchanged, never left out. " +
    "Only return JSON in the required shape — nothing outside the JSON.",
  build: (v) => {
    const lvl = (v.level as string) || "A2";
    const fixText = v.fix_text !== false;
    const lines = (v.segments as { i: number; text: string }[])
      .map((s) => `[${s.i}] ${s.text}`)
      .join("\n");
    return [
      `Level: ${lvl}.`,
      fixText
        ? [
            "TEXT — repair what the transcriber got wrong, and nothing else:",
            "· punctuation and capitals, so each line reads as sentences;",
            "· a word clearly misheard from its sound ('their' for 'there') — only when the surrounding words settle it.",
            "DO NOT improve the English, DO NOT paraphrase, DO NOT add, remove or reorder words (keep fillers and " +
              "repetitions the speaker said): the learner types what they HEAR and is marked against `text`.",
          ].join("\n")
        : "The text is already correct and matches the audio. Return `text` as null — do not rewrite it.",
      v.make_blanks
        ? "For dictation, also choose `blanks`: the 0-based WORD indices (split by spaces on the line's text) " +
          "to hide as fill-in gaps. Pick words the learner must HEAR to get right (content words, inflected verbs) — " +
          "never proper nouns or numbers. About " +
          (["A1", "A2"].includes(lvl) ? "1" : ["B1", "B2"].includes(lvl) ? "2" : "2-3") +
          " per sentence; an empty array when a line has no good gap."
        : "Do not add `blanks` (return empty array).",
      "Translate each line into natural Vietnamese as `vi` — the learner reads it for context, so translate " +
        "the MEANING, not word by word. One line's `vi` covers that line only. Keep proper nouns as they are.",
      "NUMBERS — list every number expression in the line as `numbers` (empty array when there is none): " +
        "`text` = its words EXACTLY as they appear in the line (e.g. \"twenty twenty four\", \"2017\", \"18%\"); " +
        "`canon` = ONE token with no spaces, in digits — the way most people type it (\"2024\", \"22\", \"24-hour\", " +
        "\"18%\", \"$2.47\", \"771,000\"); `alts` = other ways a learner may write what was SAID (\"twenty twenty-four\", " +
        "\"two thousand twenty-four\", \"eighteen percent\", \"two dollars forty-seven\"). Counts up to twelve said as a word (\"one mom\", \"two days\") " +
        "are listed too, with `canon` in digits — the text keeps the word. \"A few\", \"a couple\" are not numbers.",
      "",
      "Lines:",
      lines,
      "",
      'Return JSON: {"segments": [{"i": number, "text": string|null, "vi": string, "ipa": null, "blanks": number[], "numbers": [{"text": string, "canon": string, "alts": string[]}]}]} — one per input line, same `i`.',
    ]
      .filter(Boolean)
      .join("\n");
  },
};

// IPA for the words the bank could not resolve. The input is a DEDUPED word list, never lines:
// generating per line would pay for the same word 3.3 times over (measured).
const videoIpaFill: AiTask = {
  input: aiVideoIpaFillInputSchema,
  output: aiVideoIpaFillOutputSchema,
  temperature: 0.1,
  system:
    "You are a pronunciation dictionary. For each English word return its General American (GA) " +
    "phonemic transcription with stress marks ˈ/ˌ, WITHOUT slashes — e.g. aunt → ænt (not the " +
    "British ɑːnt). Return the word EXACTLY as given. Skip a word only if it is not English at all. " +
    "Only return JSON in the required shape — nothing outside the JSON.",
  build: (v) =>
    [
      "Words:",
      ...(v.words as string[]).map((w) => `  · ${w}`),
      "",
      'Return JSON: {"words": [{"word": string, "ipa": string}]}.',
    ].join("\n"),
};

// GROUP transcript lines BY CONTEXT. Returns index groups only — no rewording, no timestamps
// (the server recomputes those from the first/last line of each group). A rule that cuts on word
// count and silence cannot tell who is speaking, so it keeps gluing two people's turns into one
// dictation item.
const videoGroup: AiTask = {
  input: aiVideoGroupInputSchema,
  output: aiVideoGroupOutputSchema,
  temperature: 0,
  system:
    "You cut a transcript into practice lines for an English learner by grouping consecutive lines. " +
    "Return ONLY groups of the given line indices — never reword, reorder, drop or invent lines. " +
    "Every input index must appear EXACTLY ONCE, groups must be consecutive and in ascending order. " +
    "You cannot hear the audio: when the words alone do not settle that two lines are one person, do " +
    "NOT join them — a short line costs the learner little, a line mixing two speakers is a sentence " +
    "nobody ever said. Only return JSON in the required shape — nothing outside the JSON.",
  build: (v) => {
    const lvl = (v.level as string) || "A2";
    const lines = (v.segments as { i: number; text: string; gap?: number | null }[])
      .map((s, k) => `[${s.i}] (${k === 0 ? "start" : s.gap == null ? "unknown" : `+${s.gap.toFixed(1)}s`}) ${s.text}`)
      .join("\n");
    return [
      `Level: ${lvl}. Each group becomes ONE dictation/shadowing item: the learner hears it and types it back.`,
      "Rules, most important first:",
      "1. NEVER group across a change of speaker. A reply, an interruption or an answer to a question is a new " +
        "speaker even when nothing labels it — a question then its answer, an offer then its refusal.",
      "2. Short reactions (`Yeah.` `Really?` `Same.` `Exactly.` `No, it's not.`) are almost always somebody else. " +
        "A reaction OPENS a turn: group it FORWARD with the line after it when that line continues the thought, " +
        "never backwards into the line it answers.",
      "3. `(+Ns)` is the silence before that line. Past about 1.5s, do not join. `(unknown)` means the start was " +
        "estimated, not heard — treat it as a reason NOT to join.",
      "4. Join what is one grammatical unit (a clause cut from its main clause, a verb from its object). Never " +
        "merge across a topic change.",
      "5. Aim for " + (["A1", "A2"].includes(lvl) ? "6-12" : "8-16") + " words per group; above 20 the learner forgets " +
        "the start. A line that is already a whole sentence of reasonable length stays on its own.",
      "",
      "Lines:",
      lines,
      "",
      'Return JSON: {"groups": [[0,1],[2],[3,4,5]]} — every index above, exactly once, in order.',
    ].join("\n");
  },
};

// NHẬN XÉT bài Nghe & Nói (nghe-viết + shadowing). Đầu vào là HỒ SƠ LỖI, không phải cả bài.
const videoFeedback: AiTask = {
  input: aiVideoFeedbackInputSchema,
  output: aiVideoFeedbackOutputSchema,
  temperature: 0.4,
  system:
    "Bạn là CÔ GIÁO tiếng Anh, nhận xét một buổi luyện NGHE-VIẾT / NÓI NHẠI theo video. " +
    "Viết cho HỌC SINH đọc, NHẤT QUÁN xưng 'Cô' gọi 'em' (TUYỆT ĐỐI không dùng 'con', không nhắn 'ba mẹ'). " +
    "NGẮN GỌN như lời phê vào vở: 5-7 câu, trong đó 1-2 câu đầu là LỜI CHÀO có cá tính. "  +
    "Nhận xét theo ĐIỂM KHÓ của chính những câu em vướng được đưa ở dưới (câu dài, cụm nối âm, từ " +
    "chức năng đọc lướt, số đếm…) — chỉ suy ra từ nội dung các câu đó, KHÔNG đoán em đã gõ sai gì — rồi " +
    "cho 1-2 việc cần làm tiếp. Sắc thái KHÔNG cố định: buổi luyện nghiêm túc thì ghi nhận, buổi bỏ dở hoặc xin đáp án " +
    "liên tục thì nghiêm khắc — sắc thái bắt buộc ghi rõ trong phần dữ liệu, PHẢI theo đúng. " +
    "KHÔNG liệt kê lại từng câu, KHÔNG sáo rỗng, không bịa gì ngoài dữ liệu đưa cho. " +
    "CHỈ trả về JSON đúng cấu trúc.",
  build: (v) => {
    const d = v.dictation as {
      level?: string | null; done: number; total: number; first_ok: number; revealed: number; hint_lines: number;
      hardest: { text: string; attempts: number; hints: number; revealed: boolean }[];
    };
    const sh = v.shadow as { done: number; total: number; avg: number; weakest: { text: string; score: number }[] } | null;
    const shadowed = !!sh && sh.done > 0;
    const lines = [`Bài: "${v.title}"${v.level ? ` · cấp độ ${v.level}` : ""}${v.name ? ` · học sinh: ${v.name}` : ""}`];
    // A shadowing-only session has no dictation to report: "0/N" would read as abandoned work.
    if (d.done > 0 || !shadowed) {
      lines.push(
        `NGHE-VIẾT (mức ${d.level ?? "medium"}): xong ${d.done}/${d.total} câu · đúng ngay lần đầu ${d.first_ok} · ` +
          `mở gợi ý ${d.hint_lines} câu · xin đáp án ${d.revealed} câu.`,
      );
    }
    if (d.hardest.length) {
      lines.push("Câu phải vật lộn nhiều nhất (số lần thử · gợi ý):");
      for (const h of d.hardest) lines.push(`- "${h.text}" — ${h.attempts} lần${h.hints ? `, gợi ý ${h.hints}` : ""}${h.revealed ? ", đã xin đáp án" : ""}`);
    }
    if (sh && shadowed) {
      lines.push(`NÓI NHẠI: đã nói ${sh.done}/${sh.total} câu · điểm phát âm trung bình ${Math.round(sh.avg)}/100.`);
      if (sh.weakest.length) {
        lines.push("Câu phát âm yếu nhất:");
        for (const w of sh.weakest) lines.push(`- "${w.text}" — ${Math.round(w.score)}/100`);
      }
    }
    // Tone from EFFORT, not from the score — same rule as reading_feedback. Asking for the answer
    // instead of trying is the dictation equivalent of leaving the passage half-read.
    // Completion counts whichever mode the learner worked in more; a shadowing-only session is judged
    // by its pronunciation instead of by dictation it never started.
    const dictPct = d.total ? Math.round((d.done / d.total) * 100) : 0;
    const shPct = sh?.total ? Math.round((sh.done / sh.total) * 100) : 0;
    const onlyShadow = shadowed && d.done === 0;
    const donePct = Math.max(dictPct, shPct);
    const [doneN, totalN] = shPct > dictPct && sh ? [sh.done, sh.total] : [d.done, d.total];
    const gaveUp = d.done ? Math.round((d.revealed / d.done) * 100) : 0;
    const goodShadow = !!sh && sh.avg >= 80;
    const tone =
      donePct < 50
        ? `NGHIÊM KHẮC. Em mới làm ${doneN}/${totalN} câu — buổi luyện này CHƯA HOÀN THÀNH. Nói thẳng ngay ` +
          "câu đầu, nêu đúng con số, yêu cầu em làm trọn vẹn. KHÔNG mở đầu bằng lời khen. Tôn trọng, không mỉa mai."
        : onlyShadow
          ? goodShadow
            ? "GHI NHẬN. Em nói nhại đều và phát âm tốt — khen ngắn gọn rồi gợi ý thử thêm phần nghe-viết."
            : "NHẮC NHỞ. Em đã nói nhại đủ nhưng phát âm còn vướng — chỉ thẳng những câu yếu nhất và cách luyện lại."
        : gaveUp >= 40
          ? `NHẮC NHỞ THẲNG. Em xin đáp án ${d.revealed}/${d.done} câu — nghe chưa tới nơi đã bấm xem đáp án, ` +
            "như vậy tai không luyện được gì. Nói rõ điều đó rồi yêu cầu lần sau nghe lại ít nhất 2-3 lần trước khi xin đáp án."
          : d.first_ok >= Math.ceil(d.done * 0.7)
            ? "GHI NHẬN. Em nghe tốt, đúng ngay lần đầu phần lớn câu — khen ngắn gọn rồi giao thử thách khó hơn."
            : "NHẮC NHỞ. Kết quả tạm được nhưng còn vướng. Ghi nhận ngắn rồi chỉ thẳng kiểu lỗi và cách luyện.";
    const humor =
      donePct < 50
        ? "CÓ GAI nhưng không hạ nhục — trêu đúng chỗ em bỏ buổi luyện dở dang"
        : onlyShadow
          ? goodShadow
            ? "hài hước ấm áp, tán thưởng hơi phóng đại một chút cho vui"
            : "dí dỏm, nửa đùa nửa nhắc"
        : gaveUp >= 40
          ? "trêu nhẹ chuyện em vội bấm xem đáp án — khịa vừa đủ để em thấy nhột"
          : d.first_ok >= Math.ceil(d.done * 0.7)
            ? "hài hước ấm áp, tán thưởng hơi phóng đại một chút cho vui"
            : "dí dỏm, nửa đùa nửa nhắc";
    lines.push("", `SẮC THÁI BẮT BUỘC: ${tone}`);
    // Always: the system prompt asks for a greeting, with or without a name.
    lines.push(
      "",
      greetingBlock({ name: String(v.name || "em"), gender: v.gender, age: v.age, humor, sentences: "1-2 câu" }),
    );

    const opts = (v.grammar_options ?? []) as { id: string; title: string; cefr: string }[];
    if (opts.length) {
      lines.push(
        "",
        "Nhìn các câu em vướng ở trên: có ĐIỂM NGỮ PHÁP nào trong danh mục dưới đáng ôn lại không? " +
          "Chọn TỐI ĐA 3 `id`, chỉ chọn khi thật sự liên quan tới câu em sai — không liên quan thì trả mảng rỗng. " +
          "Nghe hụt từ vì phát âm (không phải vì cấu trúc) thì KHÔNG tính là lỗi ngữ pháp.",
        ...opts.map((g) => `- ${g.id} · ${g.title} (${g.cefr})`),
      );
    }
    lines.push(
      "",
      'Trả JSON: {"feedback": "5-7 câu tiếng Việt — lời chào, rồi nhận xét theo kiểu lỗi, rồi việc cần làm", "grammar_ids": []}',
    );
    return lines.join("\n");
  },
};

// ── Gắn cảm xúc cho hội thoại ─────────────────────────────────────────────────
// Model chỉ trả NHÃN theo từng dòng, không trả lại script. Bài đã xuất bản: audio, phụ đề và câu hỏi
// đều bám đúng câu chữ hiện tại, để model viết lại là hỏng cả ba.

export const AI_TASKS = {
  feedback,
  reading_feedback: readingFeedback,
  grade_writing: gradeWriting,
  generate_questions: generateQuestions,
  generate_exercise: generateExercise,
  generate_reading: generateReading,
  generate_writing: generateWriting,
  generate_ipa: generateIpa,
  tag_grammar: tagGrammar,
  refine_prompt: refinePrompt,
  refine_reading_prompt: refineReadingPrompt,
  refine_vocab_prompt: refineVocabPrompt,
  suggest_pair: suggestPair,
  generate_wordlist: generateWordlist,
  fill_vocab: fillVocab,
  monthly_report: monthlyReport,
  report_focus: reportFocus,
  translate_outline: translateOutline,
  video_classify: videoClassify,
  video_segment: videoSegment,
  video_group: videoGroup,
  video_ipa_fill: videoIpaFill,
  video_feedback: videoFeedback,
} satisfies Record<string, AiTask>;

export type AiTaskName = keyof typeof AI_TASKS;

// ── Trần token output ──────────────────────────────
// Trước đây KHÔNG có trần nào → một prompt lỗi có thể sinh tới trần model.
// Chọn RỘNG RÃI có chủ ý: chạm trần = JSON bị cắt = hỏng bài, tệ hơn là tốn token.
// Adapter phân biệt "cắt vì trần" với "JSON hỏng" để không xoay key vô ích.
const MAX_TOKENS: Record<AiTaskName, number> = {
  // Vặt / phân loại — output vài dòng.
  tag_grammar: 1024,
  suggest_pair: 1024,
  refine_prompt: 1024,
  refine_reading_prompt: 1024,
  refine_vocab_prompt: 1024,
  translate_outline: 2048,
  // Nhận xét / chấm — một đoạn văn hoặc vài điểm số.
  feedback: 2048,
  reading_feedback: 2048,
  grade_writing: 4096,
  report_focus: 2048,
  // Sinh nội dung dài — cả bài tập, cả báo cáo tháng. Trần RỘNG để JSON bài nhiều câu /
  // đoạn dài không bị cắt giữa chừng (cắt = hỏng cả bài, tệ hơn tốn token). max_tokens chỉ là
  // TRẦN yêu cầu — vẫn tính tiền theo token THỰC sinh, nên nâng không tốn thêm nếu bài ngắn.
  // ⚠️ Model phải HỖ TRỢ mức này: model output-cap thấp (vd deepseek-chat cap 8192) sẽ 400 nếu
  // gửi vượt cap → khi đổi model ở /teacher/ai nhớ kiểm cap.
  generate_questions: 32768,
  generate_exercise: 32768,
  generate_reading: 32768,
  generate_writing: 32768,
  generate_ipa: 16384,
  generate_wordlist: 16384,
  fill_vocab: 8192,
  monthly_report: 16384,
  video_classify: 1024, // one level + topic + short title
  video_segment: 16384, // tinh chỉnh nhiều câu transcript trong 1 lượt
  video_group: 8192, // chỉ trả mảng chỉ số
  video_ipa_fill: 8192, // one IPA string per deduped word
  video_feedback: 2048,
};

/** Trần token của 1 task: ghi đè riêng ở AiTask → bảng nhóm ở trên. */
export const maxTokensFor = (name: AiTaskName): number =>
  AI_TASKS[name]?.maxOutputTokens ?? MAX_TOKENS[name] ?? 4096;

/** Metadata cho trang admin — nhóm hiển thị + cờ ràng buộc. */
export const TASK_GROUP: Record<AiTaskName, string> = {
  feedback: "Tự động · mỗi bài nộp",
  tag_grammar: "Tự động · mỗi bài nộp",
  reading_feedback: "Tự động · mỗi bài nộp",
  grade_writing: "Chấm điểm",
  generate_exercise: "Sinh bài",
  generate_questions: "Sinh bài",
  generate_reading: "Sinh bài",
  generate_writing: "Sinh bài",
  generate_ipa: "Vặt",
  generate_wordlist: "Vặt",
  fill_vocab: "Vặt",
  refine_prompt: "Vặt",
  refine_reading_prompt: "Vặt",
  refine_vocab_prompt: "Vặt",
  suggest_pair: "Vặt",
  translate_outline: "Vặt",
  monthly_report: "Phụ huynh đọc",
  report_focus: "Phụ huynh đọc",
  video_classify: "Sinh bài",
  video_segment: "Sinh bài",
  video_group: "Sinh bài",
  video_ipa_fill: "Sinh bài",
  video_feedback: "Tự động · mỗi bài nộp",
};

export const TASK_LABEL: Record<AiTaskName, string> = {
  feedback: "Nhận xét bài làm",
  tag_grammar: "Gắn điểm ngữ pháp cho câu",
  reading_feedback: "Nhận xét bài đọc to",
  grade_writing: "Bài viết: chấm điểm & nhận xét",
  generate_exercise: "Sinh trọn bài tập",
  generate_questions: "Sinh câu hỏi",
  generate_reading: "Sinh bài đọc to",
  generate_writing: "Sinh bài viết",
  generate_ipa: "Phiên âm IPA",
  generate_wordlist: "Sinh danh sách từ",
  fill_vocab: "Điền đủ mục từ vựng (IPA, nghĩa, ví dụ, cụm từ…)",
  refine_prompt: "Chuẩn hoá yêu cầu (quiz)",
  refine_reading_prompt: "Chuẩn hoá yêu cầu (đọc to)",
  refine_vocab_prompt: "Chuẩn hoá yêu cầu (bộ thẻ từ vựng)",
  suggest_pair: "Gợi ý ngữ cảnh + từ vựng",
  translate_outline: "Dịch dàn ý bài nói sang tiếng Việt",
  monthly_report: "Báo cáo tháng",
  report_focus: "Trọng tâm cần chú ý",
  video_classify: "Xếp bậc + chủ đề bài video",
  video_ipa_fill: "Vá IPA cho từ thiếu",
  video_segment: "Tạo bài video (tách câu + khoét từ)",
  video_group: "Gộp câu transcript theo ngữ cảnh",
  video_feedback: "Nhận xét bài Nghe & Nói",
};
