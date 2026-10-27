// Generates listening AUDIO from `audio_script` (Azure TTS).
// Chạy NỀN sau khi lưu bài — vì cái bẫy này quá dễ dính: AI sinh đề listening LUÔN kèm
// audio_script nhưng để audio_url = null, mà học sinh KHÔNG được gửi script trước khi nộp
// → giáo viên quên bấm nút TTS là xuất bản ra một bài nghe không nghe được gì.
import { eq } from "drizzle-orm";
import { dialogueRateForLevel } from "@msyen/shared";
import { getDb, schema } from "../db";
import { buildDialogueCast, dialogueSpeakers } from "./dialogueCast";
import { fileUrl, newAudioKey } from "./files";
import { dialoguePoolsFor, synthesizeDialogue, synthesizeKaraoke, ttsAudioMeta, ttsVoiceInfo } from "./media";
import type { Bindings } from "./env";

// Strips speaker labels at line start ("Woman:", "Boy:", "Interviewer:"…) before single-voice TTS,
// otherwise the voice reads the label aloud. Only on a labelled dialogue (2+ matching lines), so a
// colon inside an ordinary sentence is left alone.
const SPEAKER_LABEL = /^\s*[A-Za-z][\w .'()-]{0,22}:[ \t]+(?=\S)/;
function stripSpeakerLabels(text: string): string {
  const lines = text.split(/\r?\n/);
  const labeled = lines.filter((l) => SPEAKER_LABEL.test(l)).length;
  if (labeled < 2) return text; // không phải hội thoại có nhãn → giữ nguyên
  return lines.map((l) => l.replace(SPEAKER_LABEL, "")).join("\n");
}

/** true = đã sinh audio mới. phần audio. */
export async function autoExerciseAudio(
  env: Bindings,
  exerciseRowId: string,
  opts: { force?: boolean } = {},
): Promise<boolean> {
  const db = getDb(env.DB);
  const ex = await db.query.exercises.findFirst({ where: eq(schema.exercises.id, exerciseRowId) });
  if (!ex) return false;
  // force = sinh lại kể cả khi đã có audio (dùng cho dictation: sửa câu → audio phải khớp câu mới).
  if (ex.audioUrl && !opts.force) return false; // đã có audio (upload/thư viện/TTS tay) → không đụng
  if (ex.readAloud) return false; // read-aloud: the audio is the LEARNER's
  // Bài Tổng hợp sinh audio TỪ đoạn văn và ép cues.text === passage (bất biến karaoke của
  // LessonPanel) → tự viết lại passage ngầm sau lưng giáo viên là quá bạo. Để nút riêng lo.
  // Bài TỔNG HỢP (mixed): audio = ĐỌC PASSAGE dạng karaoke (bất biến cues.text === passage). Ở
  // queue AN TOÀN vì synthesizeKaraoke trả cues.text = CHÍNH passage (không viết lại). audioUrl đã
  // có → đã bị chặn ở đầu hàm (trừ force). Sinh từ passage, KHÔNG dùng audio_script.
  if (ex.skill === "mixed") {
    const p = ex.passage?.trim();
    if (!p) return false;
    const { bytes, contentType, cues, provider, voice } = await synthesizeKaraoke(env, { text: p });
    const key = newAudioKey("mp3");
    await env.AUDIO.put(key, bytes, { httpMetadata: { contentType }, customMetadata: ttsAudioMeta({ provider, voice }) });
    await db
      .update(schema.exercises)
      .set({ audioUrl: fileUrl(key), audioCues: cues, audioVoice: ttsVoiceInfo({ provider, voice }) })
      .where(eq(schema.exercises.id, exerciseRowId));
    return true;
  }

  // DICTATION: audio đọc SẠCH TỪNG CÂU (từ đáp án các câu hỏi, KHÔNG đọc số thứ tự "1. 2."),
  // mỗi câu 1 dòng + chấm cuối → TTS ngắt rõ, và cues tách câu khớp đúng thứ tự câu hỏi.
  const isDictation = ex.templateId === "dictation";
  let text: string;
  if (isDictation) {
    const qs = await db
      .select()
      .from(schema.questions)
      .where(eq(schema.questions.exerciseId, ex.id))
      .orderBy(schema.questions.position);
    const sentences = qs
      .map((q) => (q.accept?.[0] ?? q.answer ?? "").trim())
      .filter(Boolean)
      .map((s) => (/[.!?…]$/.test(s) ? s : `${s}.`));
    if (!sentences.length) return false;
    text = sentences.join("\n");
  } else {
    const raw = ex.audioScript?.trim();
    if (!raw) return false;
    // Multi-speaker dialogue: a script with ≥2 speaker labels gets one voice per speaker.
    // A dialogue failure falls back to a single voice below.
    const speakers = dialogueSpeakers(raw);
    if (speakers.length >= 2) {
      try {
        const dlg = await synthesizeDialogue(env, {
          script: raw,
          cast: buildDialogueCast(speakers, dialogueRateForLevel(ex.level), await dialoguePoolsFor(env)),
        });
        const key = newAudioKey("mp3");
        await env.AUDIO.put(key, dlg.bytes, {
          httpMetadata: { contentType: dlg.contentType },
          customMetadata: { ttsProvider: dlg.provider, ttsVoice: dlg.voices.join("+"), ttsLabel: `${dlg.provider} · hội thoại ${speakers.length} vai` },
        });
        await db
          .update(schema.exercises)
          .set({ audioUrl: fileUrl(key), audioCues: dlg.cues, audioVoice: `${dlg.provider} / hội thoại ${speakers.length} vai` })
          .where(eq(schema.exercises.id, exerciseRowId));
        return true;
      } catch (e) {
        // Multi-voice synthesis failed → fall back to a single voice.
        console.error("[ttsJob] dialogue synth failed, fallback single-voice:", e);
      }
    }
    text = stripSpeakerLabels(raw); // 1 giọng: bỏ "Woman:"/"Boy:" khỏi phần đọc
  }

  const { bytes, contentType, cues, provider, voice } = await synthesizeKaraoke(env, { text });
  const key = newAudioKey("mp3");
  // customMetadata records the voice actually used (after any provider fallback).
  await env.AUDIO.put(key, bytes, { httpMetadata: { contentType }, customMetadata: ttsAudioMeta({ provider, voice }) });
  // Cues GIỜ LƯU CHO CẢ DICTATION: cần mốc giờ tách câu để phát riêng từng câu. KHÔNG lộ đáp án
  // vì payload công khai của dictation đã ẩn cues (chỉ gửi mốc audio + mask + hash). Xem lib/dictation.ts.
  await db
    .update(schema.exercises)
    .set({ audioUrl: fileUrl(key), audioCues: cues, audioVoice: ttsVoiceInfo({ provider, voice }) })
    .where(eq(schema.exercises.id, exerciseRowId));
  return true;
}
