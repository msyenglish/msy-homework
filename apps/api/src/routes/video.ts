// ============================================================
//  Teacher · VIDEO lessons (YouTube): transcript → practice segments.
//   • POST /transcript   — paste SRT/VTT (or plain text) → timestamped segments.
//   • POST /transcribe   — automatic STT with Deepgram; YouTube links answer from the transcript cache.
//   • POST /classify     — AI proposes level + topic + a short title (batch import).
//   • POST /ai-segment   — AI tidies sentences + picks gap words (timestamps kept).
//  Lesson content is saved into exercises.video_* through the exercises route.
// ============================================================
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  applyNumberSpellings,
  buildPracticeLines,
  joinAlts,
  cuesToSegments,
  extractYoutubeId,
  parseSubtitles,
  splitWords,
  type VideoSegment,
} from "@msyen/shared";
import type { AiVideoClassifyOutput, AiVideoGroupOutput, AiVideoSegmentOutput } from "@msyen/shared/schemas";
import { eq, isNull } from "drizzle-orm";
import { runAiTask } from "../lib/ai/hub";
import { transcribeMedia, type TranscribeCue } from "../lib/media";
import { getDb, schema } from "../db";
import type { AppEnv } from "../lib/env";

const video = new Hono<AppEnv>();

/** Union of two alternative maps for the same text, deduplicated per word. */
function mergeAlts(a: VideoSegment["alts"], b: VideoSegment["alts"]): VideoSegment["alts"] {
  const out: Record<string, string[]> = {};
  for (const m of [a, b]) for (const [k, v] of Object.entries(m ?? {})) out[k] = [...new Set([...(out[k] ?? []), ...v])].slice(0, 8);
  return Object.keys(out).length ? out : null;
}

// Tách câu thô từ TEXT không có timestamp (fallback) — mốc giờ = 0 (không seek được, cần sửa tay).
function sentencesFromText(raw: string): VideoSegment[] {
  const parts = raw
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.map((text, i) => ({ i, start: 0, end: 0, text }));
}

/** Dán transcript SRT/VTT (hoặc text) → đoạn luyện. Trả kèm youtube_id nếu dán URL. */
video.post("/transcript", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    raw?: string;
    youtube_url?: string;
    merge_sentences?: boolean;
  };
  const raw = (body.raw || "").trim();
  if (!raw) throw new HTTPException(400, { message: "Thiếu nội dung transcript" });

  const cues = parseSubtitles(raw);
  let segments: VideoSegment[];
  let has_timing = true;
  if (cues.length) {
    segments = body.merge_sentences === false ? cuesToSegments(cues) : buildPracticeLines(cues);
  } else {
    // Không nhận diện được timecode → coi là text thuần.
    segments = sentencesFromText(raw);
    has_timing = false;
  }
  if (!segments.length) throw new HTTPException(400, { message: "Không tách được đoạn nào từ transcript" });

  const youtube_id = body.youtube_url ? extractYoutubeId(body.youtube_url) : null;
  return c.json({ youtube_id, has_timing, segments });
});

/** Seconds from a form/JSON field; 0 when absent or invalid. */
const secs = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/** Cues that overlap [start, end] (end 0 = to the end): a line starting just before still counts. */
const inRange = (cues: TranscribeCue[], start: number, end: number) =>
  start || end ? cues.filter((c) => c.end > start && (!end || c.start < end)) : cues;

// Cache rows: `lang` = the whole video, `lang@from-to` = only that stretch was ever transcribed.
const rangeKey = (lang: string, from: number, to: number) => `${lang}@${from}-${to}`;

/** Cached cues of a video covering [start, end], or null when that stretch was never heard. */
async function cachedCues(db: ReturnType<typeof getDb>, ytId: string, lang: string, start: number, end: number) {
  const rows = await db.select().from(schema.videoTranscripts).where(eq(schema.videoTranscripts.youtubeId, ytId));
  const whole = rows.find((r) => r.lang === lang);
  if (whole?.cues?.length) return inRange(whole.cues as TranscribeCue[], start, end);
  for (const r of rows) {
    const m = /^(.+)@(\d+)-(\d+)$/.exec(r.lang);
    if (!m || m[1] !== lang || !end || Number(m[2]) > start || Number(m[3]) < end) continue;
    if (r.cues?.length) return inRange(r.cues as TranscribeCue[], start, end);
  }
  return null;
}

async function saveCues(db: ReturnType<typeof getDb>, ytId: string, key: string, cues: TranscribeCue[]) {
  await db
    .insert(schema.videoTranscripts)
    .values({ youtubeId: ytId, lang: key, cues })
    .onConflictDoUpdate({ target: [schema.videoTranscripts.youtubeId, schema.videoTranscripts.lang], set: { cues } });
}

/**
 * Automatic STT (see `transcribeMedia`). Nothing to transcribe from → 501 and the UI suggests
 * uploading the video's audio or pasting SRT/VTT.
 *  • JSON `{url, lang, start?, end?}` — a YouTube link is served from the transcript cache only (a
 *    stretch is cut out of a wider transcript for free); a direct media URL goes to Deepgram.
 *  • multipart `audio` (+ `youtube_url`, `offset`, `start`, `end`) — the teacher's own copy of the
 *    audio; `offset` = where in the video the file starts (a stretch cut by `pnpm video:transcribe`).
 */
video.post("/transcribe", async (c) => {
  const ct = c.req.header("content-type") || "";
  const db = getDb(c.env.DB);
  let cues: TranscribeCue[] | undefined;
  let lang = "en";
  if (ct.includes("multipart/form-data")) {
    const form = await c.req.parseBody();
    const audio = form.audio;
    if (typeof form.lang === "string" && form.lang) lang = form.lang;
    if (!(audio instanceof File) || audio.size === 0) throw new HTTPException(400, { message: "Thiếu file audio" });
    // `offset` present = the file is only a stretch of the video, starting there.
    const partial = typeof form.offset === "string";
    const offset = secs(form.offset);
    const [start, end] = [secs(form.start), secs(form.end)];
    const heard = await transcribeMedia(c.env, {
      audio: await audio.arrayBuffer(),
      contentType: audio.type,
      lang,
    });
    // Put the clip's clock on the video's clock.
    const shifted = offset
      ? heard.cues.map((q) => ({ ...q, start: q.start + offset, end: q.end + offset, words: q.words?.map((w) => ({ ...w, s: w.s + offset, e: w.e + offset })) }))
      : heard.cues;
    const ytId = typeof form.youtube_url === "string" ? extractYoutubeId(form.youtube_url) : null;
    if (ytId && shifted.length) {
      const to = end || Math.ceil(shifted[shifted.length - 1].end);
      await saveCues(db, ytId, partial ? rangeKey(lang, offset, to) : lang, shifted);
    }
    cues = inRange(shifted, start, end);
  } else {
    const body = (await c.req.json().catch(() => ({}))) as { url?: string; lang?: string; refresh?: boolean; start?: number; end?: number };
    if (!body.url) throw new HTTPException(400, { message: "Thiếu URL media" });
    lang = body.lang || "en";
    const [start, end] = [secs(body.start), secs(body.end)];
    if (end && end <= start) throw new HTTPException(400, { message: "Mốc kết thúc phải sau mốc bắt đầu" });
    // A YouTube video always yields the same audio: re-authoring a lesson costs no transcription.
    const ytId = extractYoutubeId(body.url);
    if (ytId && !body.refresh) cues = (await cachedCues(db, ytId, lang, start, end)) ?? undefined;
    if (!cues) {
      const heard = await transcribeMedia(c.env, { url: body.url, lang });
      if (ytId && heard.cues?.length) {
        const key = start || end ? rangeKey(lang, start, end || Math.ceil(heard.cues[heard.cues.length - 1].end)) : lang;
        c.executionCtx.waitUntil(saveCues(db, ytId, key, heard.cues).catch((e) => console.error("Lưu cache transcript lỗi:", e)));
      }
      cues = inRange(heard.cues ?? [], start, end);
    }
  }
  if (!cues.length) throw new HTTPException(400, { message: "Không nghe được câu nào trong đoạn này." });
  // Word timings and speaker labels travel with each line through every join and cut.
  return c.json({ lang, has_timing: true, segments: buildPracticeLines(cues) });
});

// How much transcript the level judge reads. The opening minutes are usually the easiest part of a
// video, so sample from the middle too instead of just slicing the head.
const CLASSIFY_LINES = 90;

/**
 * AI proposes LEVEL + TOPIC + a short lesson title for one video (used by the batch importer).
 * Levels/topics come from the DB and the model must pick from those lists — invented values are dropped.
 */
video.post("/classify", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string;
    duration?: number | null;
    segments?: { text?: string }[];
    transcript?: string;
  };
  const title = (body.title || "").trim();
  if (!title) throw new HTTPException(400, { message: "Thiếu tên video" });

  const lines = Array.isArray(body.segments)
    ? body.segments.map((s) => (s?.text || "").trim()).filter(Boolean)
    : (body.transcript || "")
        .split(/\n+/)
        .map((s) => s.trim())
        .filter(Boolean);
  if (!lines.length) throw new HTTPException(400, { message: "Thiếu transcript để xếp bậc" });

  const step = Math.max(1, Math.floor(lines.length / CLASSIFY_LINES));
  const sample = lines.filter((_, i) => i % step === 0).slice(0, CLASSIFY_LINES);

  const db = getDb(c.env.DB);
  const [levelRows, topicRows] = await Promise.all([
    db.select({ name: schema.levels.name }).from(schema.levels).orderBy(schema.levels.position),
    db
      .select({ id: schema.topics.id, name: schema.topics.name })
      .from(schema.topics)
      .where(isNull(schema.topics.parentId))
      .orderBy(schema.topics.position),
  ]);
  if (!levelRows.length || !topicRows.length)
    throw new HTTPException(400, { message: "Chưa có bậc hoặc chủ đề nào trong hệ thống" });

  const out = await runAiTask<AiVideoClassifyOutput>(c.env, "video_classify", {
    title,
    duration: body.duration ?? null,
    levels: levelRows.map((l) => l.name),
    topics: topicRows,
    transcript: sample.join("\n"),
  }).catch(() => null);
  if (!out) throw new HTTPException(502, { message: "AI không xếp bậc được video này — thử lại sau." });

  // Guard the model's picks against the real lists: a hallucinated level would silently file the
  // lesson under a band that does not exist.
  const level = levelRows.find((l) => l.name === out.level)?.name ?? null;
  const topicId = topicRows.find((t) => t.id === out.topic_id)?.id ?? null;
  return c.json({
    level,
    topic_id: topicId,
    topic: topicRows.find((t) => t.id === topicId)?.name ?? null,
    title: out.title?.trim() || title,
    reason: out.reason ?? "",
  });
});

// Lines sent to the AI per call. A real video transcript runs 100-300 lines: sending it as one
// block hits the output token cap and corrupts the whole run, so batch it and stitch the results.
const AI_BATCH = 40;
const AI_MAX_SEGMENTS = 400;

/** AI chuẩn hoá câu + chọn từ khoét (nghe-viết). GIỮ NGUYÊN timestamp; AI chỉ sửa text theo `i`. */
video.post("/ai-segment", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    segments?: VideoSegment[];
    level?: string | null;
    make_blanks?: boolean;
  };
  const segments = Array.isArray(body.segments) ? body.segments : [];
  if (!segments.length) throw new HTTPException(400, { message: "Thiếu danh sách đoạn" });
  if (segments.length > AI_MAX_SEGMENTS)
    throw new HTTPException(400, { message: `Quá nhiều đoạn (tối đa ${AI_MAX_SEGMENTS}) — hãy cắt bớt transcript.` });

  // Lines heard by STT match the audio word for word; only pasted subtitles get their text repaired.
  const fixText = !segments.every((s) => s.words?.length);
  const batches: VideoSegment[][] = [];
  for (let i = 0; i < segments.length; i += AI_BATCH) batches.push(segments.slice(i, i + AI_BATCH));
  // Lô lỗi thì chỉ mất phần đó (giữ text gốc), không đánh sập cả lượt.
  const results = await Promise.all(
    batches.map((batch) =>
      runAiTask<AiVideoSegmentOutput>(c.env, "video_segment", {
        level: body.level ?? "A2",
        make_blanks: body.make_blanks ?? false,
        fix_text: fixText,
        segments: batch.map((s) => ({ i: s.i, text: s.text })),
      }).catch(() => null),
    ),
  );
  if (results.every((r) => !r)) throw new HTTPException(502, { message: "AI không xử lý được transcript này — thử lại sau." });

  // Ghép kết quả AI theo chỉ số i (timestamp lấy từ đầu vào; AI hụt/lỗi thì giữ text gốc).
  const byId = new Map(results.flatMap((r) => r?.segments ?? []).map((s) => [s.i, s]));
  // A repair may fix punctuation or one misheard word; a reply that adds or drops words no longer
  // matches the audio, so the original line is kept.
  const sameWords = (a: string, b: string) => {
    const n = splitWords(a).length;
    return Math.abs(splitWords(b).length - n) <= Math.max(1, Math.round(n * 0.1));
  };
  const refined: VideoSegment[] = segments.map((s) => {
    const r = byId.get(s.i);
    const fixed = fixText ? r?.text?.trim() : null;
    // Numbers get one spelling in the text; the others are kept as accepted answers.
    const spelled = applyNumberSpellings(fixed && sameWords(s.text, fixed) ? fixed : s.text, r?.numbers);
    return {
      i: s.i,
      start: s.start,
      end: s.end,
      text: spelled.text,
      // A second run sees "2024" already in digits: keep what the first run accepted as well.
      alts: spelled.text === s.text ? mergeAlts(s.alts, spelled.alts) : spelled.alts,
      vi: r?.vi?.trim() || s.vi || null,
      ipa: r?.ipa ?? null,
      blanks: (r?.blanks || []).filter((n) => Number.isInteger(n) && n >= 0),
      words: s.words ?? null, // boundaries are untouched here → timings ride along as they are
    };
  });
  return c.json({ segments: refined });
});

// Gộp câu gửi AI mỗi lượt. Nhóm KHÔNG bắc qua ranh lô — mất vài chỗ nối ở biên, đổi lại lô lỗi
// chỉ hỏng phần của nó.
const GROUP_BATCH = 50;

/**
 * AI GỘP CÂU theo ngữ cảnh. AI chỉ chọn câu nào đi với câu nào; server tự nối text/bản dịch và
 * tính lại mốc giờ từ câu đầu/cuối mỗi nhóm — mốc giờ KHÔNG bao giờ do AI đặt.
 */
video.post("/ai-group", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { segments?: VideoSegment[]; level?: string | null };
  const segments = Array.isArray(body.segments) ? body.segments : [];
  if (segments.length < 2) throw new HTTPException(400, { message: "Cần ít nhất 2 đoạn để gộp" });
  if (segments.length > AI_MAX_SEGMENTS)
    throw new HTTPException(400, { message: `Quá nhiều đoạn (tối đa ${AI_MAX_SEGMENTS}) — hãy cắt bớt transcript.` });

  const batches: VideoSegment[][] = [];
  for (let i = 0; i < segments.length; i += GROUP_BATCH) batches.push(segments.slice(i, i + GROUP_BATCH));

  // Nhóm KHÔNG hợp lệ (thiếu/thừa/lộn xộn chỉ số) → giữ nguyên lô đó: thà không gộp còn hơn mất câu.
  const validate = (groups: number[][], batch: VideoSegment[]): number[][] | null => {
    const flat = groups.flat();
    if (flat.length !== batch.length) return null;
    for (let k = 0; k < batch.length; k++) if (flat[k] !== batch[k].i) return null;
    return groups.filter((g) => g.length > 0);
  };

  const results = await Promise.all(
    batches.map(async (batch) => {
      const out = await runAiTask<AiVideoGroupOutput>(c.env, "video_group", {
        level: body.level ?? "A2",
        segments: batch.map((s, k) => ({
          i: s.i,
          text: s.text,
          // An estimated start has no measured silence before it: sent as unknown, not as 0s.
          gap: k === 0 || s.estimated || batch[k - 1].estimated ? null : Math.round((s.start - batch[k - 1].end) * 10) / 10,
        })),
      }).catch(() => null);
      return (out && validate(out.groups ?? [], batch)) || batch.map((s) => [s.i]);
    }),
  );

  // TRẦN CỨNG cho một ô luyện. Prompt xin 8-16 từ nhưng model vẫn có lúc dồn 28 từ / 22 giây vào
  // một nhóm — mức Hard bắt gõ cả câu thì không ai chịu nổi. Cắt lại ngay tại ranh giới câu GỐC
  // (vẫn còn mốc giờ thật của từng câu) nên không phải nội suy gì.
  const MAX_WORDS = 20;
  const MAX_DUR = 16;
  const wc = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
  // When STT labelled the speakers, a group is also cut wherever the voice changes — the model
  // only guesses who is talking, the labels were heard.
  const voiceOf = (seg: VideoSegment) => {
    const v = new Set((seg.words ?? []).map((w) => w.sp).filter((n) => n != null));
    return v.size === 1 ? [...v][0] : null;
  };

  const byId = new Map(segments.map((s) => [s.i, s]));
  const chunks: VideoSegment[][] = [];
  for (const group of results.flat()) {
    const parts = group.map((i) => byId.get(i)).filter(Boolean) as VideoSegment[];
    let cur: VideoSegment[] = [];
    for (const p of parts) {
      const words = cur.reduce((n, x) => n + wc(x.text), 0) + wc(p.text);
      const dur = p.end - (cur[0]?.start ?? p.start);
      const prevVoice = cur.length ? voiceOf(cur[cur.length - 1]) : null;
      const turn = prevVoice != null && voiceOf(p) != null && voiceOf(p) !== prevVoice;
      if (cur.length && (words > MAX_WORDS || dur > MAX_DUR || turn)) { chunks.push(cur); cur = []; }
      cur.push(p);
    }
    if (cur.length) chunks.push(cur);
  }

  const merged: VideoSegment[] = chunks.map((parts, i) => ({
    i,
    start: parts[0].start,
    end: parts[parts.length - 1].end,
    text: parts.map((p) => p.text).join(" ").replace(/\s+/g, " ").trim(),
    vi: parts.map((p) => p.vi).filter(Boolean).join(" ").trim() || null,
    ipa: null,
    blanks: [], // chỉ số từ đã lệch sau khi gộp — trang luyện tự chọn ô khoét theo mức
    words: parts.flatMap((p) => p.words ?? []), // timings of the merged parts, still in order
    alts: joinAlts(parts),
    estimated: parts[0].estimated ?? null,
  }));
  return c.json({ segments: merged });
});

/**
 * Metadata video YouTube (oEmbed) — dùng để tự điền TIÊU ĐỀ bài khi cô dán link.
 * Gọi từ Worker (không phải trình duyệt) nên không vướng CORS; oEmbed không cần API key.
 */
video.get("/meta", async (c) => {
  const id = extractYoutubeId(c.req.query("url") || "");
  if (!id) throw new HTTPException(400, { message: "Link YouTube không hợp lệ" });
  const res = await fetch(`https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=${id}`);
  if (!res.ok) throw new HTTPException(404, { message: "Không lấy được thông tin video (video riêng tư hoặc đã xoá?)" });
  const data = (await res.json()) as { title?: string; author_name?: string };
  return c.json({ youtube_id: id, title: data.title ?? null, author: data.author_name ?? null });
});

export default video;
