// Soạn phần NỘI DUNG cho type "Dictation & Shadowing": nguồn (Audio/Video) + đoạn luyện.
//  • VIDEO (YouTube): link + transcript (cached Deepgram transcript, uploaded audio, or pasted SRT/VTT) → segments.
//  • AUDIO: TTS (dán câu → giọng đọc + phụ đề) HOẶC upload file thật → STT tách câu.
// Dùng chung 1 mô hình segment {start,end,text,vi,blanks}. Nhúng trong ExerciseEditorPage.
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Sparkles, Wand2, Trash2, Plus, Copy, Check, Youtube, Headphones, Volume2, Upload, Combine, ChevronDown } from "lucide-react";
import { extractYoutubeId, splitWords, type AudioCues, type PracticeMode, type PracticeSource, type VideoSegment } from "@msyen/shared";
import { Button, buttonClass, Card, Input, Select, Textarea } from "../ui";
import { audioApi, teacherReadingApi, videoTeacherApi } from "../../lib/api";
import YouTubePlayer, { type YouTubePlayerHandle } from "../video/YouTubePlayer";
import { t, type TKey } from "../../i18n";

// Giá trị bền (đồng bộ ngược lên form của editor cha).
export interface PracticeValue {
  media_source: PracticeSource;
  youtube_id: string; // "" nếu chưa có
  audio_url: string; // "" nếu chưa có
  audio_cues: AudioCues | null;
  audio_voice: string | null;
  segments: VideoSegment[];
  modes: PracticeMode[];
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, "0")}`;

const srtTime = (s: number) => {
  const ms = Math.round(s * 1000);
  const p = (n: number, l = 2) => n.toString().padStart(l, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}`;
};
const toSrt = (segs: VideoSegment[]) =>
  segs.map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.text}`).join("\n\n");

// AUDIO: script (mỗi dòng 1 câu) + phụ đề word-level → suy đoạn [start,end] theo chỉ số ký tự.
function segmentsFromCues(script: string, cues: AudioCues): VideoSegment[] {
  const lines = script.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const full = cues.text ?? "";
  const segs: VideoSegment[] = [];
  let cursor = 0;
  lines.forEach((line, idx) => {
    let start = full.indexOf(line, cursor);
    if (start < 0) start = cursor;
    const end = start + line.length;
    cursor = end;
    const inWords = cues.words.filter((w) => w.s >= start && w.s < end);
    const prevEnd = segs.length ? segs[segs.length - 1].end : 0;
    const t0 = inWords.length ? inWords[0].t : prevEnd;
    const lastW = inWords[inWords.length - 1];
    const t1 = lastW ? +(lastW.t + lastW.d).toFixed(2) : +(t0 + 1.2).toFixed(2);
    segs.push({ i: idx, start: +t0.toFixed(2), end: t1, text: line, blanks: [] });
  });
  return segs;
}

// Tách phần dịch tùy chọn "english | tiếng việt" trên mỗi dòng.
function splitLineVi(line: string): { text: string; vi: string | null } {
  const at = line.indexOf(" | ");
  if (at < 0) return { text: line.trim(), vi: null };
  return { text: line.slice(0, at).trim(), vi: line.slice(at + 3).trim() || null };
}

type BuildStep = "transcribe" | "classify" | "group" | "refine";
const STEP_LABEL: Record<BuildStep, TKey> = {
  transcribe: "teacherMain.segments.step.transcribe",
  classify: "teacherMain.segments.step.classify",
  group: "teacherMain.segments.step.group",
  refine: "teacherMain.segments.step.refine",
};

/** "1:30" / "1:02:05" / "90" → seconds; "" → 0; anything else → NaN. */
function parseClock(v: string): number {
  const s = v.trim();
  if (!s) return 0;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(s)) return NaN;
  return s.split(":").reduce((acc, p) => acc * 60 + Number(p), 0);
}

// Manual blank picking is hidden for now: the practice page picks its gaps by level (longest words).
const SHOW_BLANK_PICKER = false;

/** "2024 = twenty twenty four / two thousand twenty-four · …" for the editor hint line. */
const altsLabel = (words: string[], alts: Record<string, string[]>) =>
  Object.entries(alts)
    .map(([k, v]) => `${words[Number(k)] ?? "?"} = ${v.join(" / ")}`)
    .join(" · ");

export default function PracticeSegmentsEditor({
  value,
  onChange,
  title,
  level,
  editing = false,
  onTitleSuggest,
  onMeta,
}: {
  value: PracticeValue;
  onChange: (v: PracticeValue) => void;
  title?: string;
  level?: string | null;
  editing?: boolean;
  /** Dán link YouTube → gợi ý tiêu đề video (cha tự quyết có điền vào ô Tiêu đề không). */
  onTitleSuggest?: (title: string) => void;
  /** After a build: AI's level / topic / clean title (the parent fills only what is still empty). */
  onMeta?: (m: { level: string | null; topic_id: string | null; title: string; rawTitle: string }) => void;
}) {
  // Bền (đồng bộ lên cha)
  const [source, setSource] = useState<PracticeSource>(value.media_source);
  const [youtubeUrl, setYoutubeUrl] = useState(value.youtube_id ? `https://youtu.be/${value.youtube_id}` : "");
  const [audioUrl, setAudioUrl] = useState(value.audio_url);
  const [audioCues, setAudioCues] = useState<AudioCues | null>(value.audio_cues);
  const [audioVoice, setAudioVoice] = useState<string | null>(value.audio_voice);
  const [segments, setSegments] = useState<VideoSegment[]>(value.segments);
  const [modes, setModes] = useState<PracticeMode[]>(value.modes?.length ? value.modes : ["dictation", "shadowing"]);
  // Làm việc (không lưu). `raw` LUÔN soi chiếu các câu đang có (dựng lại SRT) — mở lại bài
  // là thấy nguyên transcript để đọc/copy, thay vì ô trống như thể chưa có gì. Muốn thay nội
  // dung thì dán đè rồi bấm "Tách đoạn".
  const [raw, setRaw] = useState(() => (value.segments.length ? toSrt(value.segments) : ""));
  const [audioScript, setAudioScript] = useState(() => value.segments.map((s) => (s.vi ? `${s.text} | ${s.vi}` : s.text)).join("\n"));
  const [gender, setGender] = useState<"female" | "male">("female");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // One-click build: optional stretch of the video, the step running now, and the "no transcriber" fallback.
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [step, setStep] = useState<BuildStep | null>(null);
  const [needAudio, setNeedAudio] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [cmdCopied, setCmdCopied] = useState(false);
  const videoTitleRef = useRef("");

  const playerRef = useRef<YouTubePlayerHandle>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const audioStopRef = useRef<number | null>(null);
  const youtubeId = useMemo(() => extractYoutubeId(youtubeUrl) || "", [youtubeUrl]);

  // Dán link hợp lệ → hỏi YouTube tiêu đề video (oEmbed qua Worker) và gợi lên cha MỘT LẦN
  // cho mỗi video. Lỗi mạng/video riêng tư thì im lặng bỏ qua — tiêu đề vẫn gõ tay được.
  const titleAskedRef = useRef<string>("");
  useEffect(() => {
    if (!youtubeId || !onTitleSuggest || titleAskedRef.current === youtubeId) return;
    titleAskedRef.current = youtubeId;
    videoTeacherApi
      .meta(`https://youtu.be/${youtubeId}`)
      .then((r) => {
        if (!r.title) return;
        videoTitleRef.current = r.title;
        onTitleSuggest(r.title);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [youtubeId]);

  // Câu thay đổi (tách đoạn · AI chuẩn hoá · lấy tự động) → dựng lại ô soạn cho khớp, để ô
  // luôn là ảnh phản chiếu của các câu đang lưu (đọc/copy được, và thấy ngay bản dịch AI vừa thêm).
  useEffect(() => {
    if (!segments.length) return;
    setRaw(toSrt(segments));
    setAudioScript(segments.map((s) => (s.vi ? `${s.text} | ${s.vi}` : s.text)).join("\n"));
  }, [segments]);

  // Đồng bộ giá trị bền lên cha mỗi khi đổi (onChange qua ref để không lặp).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current({ media_source: source, youtube_id: youtubeId, audio_url: audioUrl, audio_cues: audioCues, audio_voice: audioVoice, segments, modes });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, youtubeId, audioUrl, audioCues, audioVoice, segments, modes]);

  const errRef = useRef<HTMLDivElement>(null);
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr((e as Error).message);
      // Báo lỗi nằm ở đầu khối soạn, mà nút bấm thường ở cuối trang → cuộn tới, không thì
      // cô bấm xong thấy "không có gì xảy ra".
      setTimeout(() => errRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
    } finally {
      setBusy(null);
    }
  };

  // ── VIDEO ──
  const parseTranscript = () =>
    run("parse", async () => {
      const r = await videoTeacherApi.transcript(raw, youtubeUrl);
      setSegments(r.segments);
      if (r.youtube_id && !youtubeId) setYoutubeUrl(`https://youtu.be/${r.youtube_id}`);
      if (!r.has_timing) setErr(t("teacherMain.segments.error.noTiming"));
    });
  // Gộp câu bằng AI: luật số-từ + khoảng-lặng không biết ai đang nói nên hay dính hai lượt thoại
  // của hai người vào một ô. AI đọc được ngữ cảnh thì cắt đúng chỗ hơn nhiều.
  const packAi = () =>
    run("pack", async () => {
      const r = await videoTeacherApi.aiGroup(segments, level || null);
      if (r.segments.length === segments.length) throw new Error(t("teacherMain.segments.error.alreadyGood"));
      setSegments(r.segments);
      setErr(t("teacherMain.segments.error.packed", { old: segments.length, new: r.segments.length }));
    });
  // Paste a link → one click: transcript (cache) → level + topic → AI regroup →
  // AI gloss + numbers. Each AI step is best effort: a failure keeps the lines it was given.
  const readRange = () => {
    const [start, end] = [parseClock(rangeFrom), parseClock(rangeTo)];
    if (Number.isNaN(start) || Number.isNaN(end) || (end && end <= start)) throw new Error(t("teacherMain.segments.error.range"));
    return { start, end };
  };
  const finishBuild = async (heard: VideoSegment[]) => {
    let segs = heard;
    let lvl = level || "";
    if (onMeta) {
      setStep("classify");
      const rawTitle = videoTitleRef.current;
      const m = await videoTeacherApi.classify(title?.trim() || rawTitle || "YouTube video", segs).catch(() => null);
      if (m) {
        lvl = lvl || m.level || "";
        onMeta({ level: m.level, topic_id: m.topic_id, title: m.title, rawTitle });
      }
    }
    if (segs.length >= 2) {
      setStep("group");
      segs = (await videoTeacherApi.aiGroup(segs, lvl || null).catch(() => null))?.segments ?? segs;
    }
    setStep("refine");
    const refined = await videoTeacherApi.aiSegment(segs, lvl || null, SHOW_BLANK_PICKER).catch(() => null);
    setSegments(refined?.segments ?? segs);
    setErr(refined ? t("teacherMain.segments.built", { n: segs.length }) : t("teacherMain.segments.error.refineFailed"));
  };
  const buildLesson = () =>
    run("build", async () => {
      if (!youtubeId) throw new Error(t("teacherMain.segments.error.youtube"));
      const range = readRange();
      setNeedAudio(false);
      try {
        setStep("transcribe");
        let heard: VideoSegment[];
        try {
          heard = (await videoTeacherApi.transcribeUrl(youtubeUrl, "en", range)).segments;
        } catch (e) {
          // No transcript cached for this stretch: the audio has to come from the teacher.
          if ((e as { status?: number }).status === 501) {
            setNeedAudio(true);
            return;
          }
          throw e;
        }
        await finishBuild(heard);
      } finally {
        setStep(null);
      }
    });
  const videoAudio = (file: File) =>
    run("build", async () => {
      if (!youtubeId) throw new Error(t("teacherMain.segments.error.youtube"));
      const range = readRange();
      try {
        setStep("transcribe");
        const r = await videoTeacherApi.transcribeFile(file, "en", youtubeUrl, range);
        if (!r.segments.length) throw new Error(t("teacherMain.segments.error.noSegments"));
        setNeedAudio(false);
        await finishBuild(r.segments);
      } finally {
        setStep(null);
      }
    });
  const cliCommand = () => {
    const range = [rangeFrom.trim() && `--from ${rangeFrom.trim()}`, rangeTo.trim() && `--to ${rangeTo.trim()}`].filter(Boolean).join(" ");
    return `pnpm video:transcribe ${youtubeUrl.trim() || "<link>"}${range ? ` ${range}` : ""}`;
  };

  // ── AUDIO ──
  const genAudio = () =>
    run("tts", async () => {
      const lines = audioScript.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      if (!lines.length) throw new Error(t("teacherMain.segments.error.noLines"));
      const parts = lines.map(splitLineVi);
      const script = parts.map((p) => p.text).join("\n");
      const r = await teacherReadingApi.modelAudio(script, gender, title?.trim() || undefined);
      if (!r.cues) throw new Error(t("teacherMain.segments.error.noCues"));
      setAudioUrl(r.url);
      setAudioCues(r.cues);
      setAudioVoice(r.voiceInfo ?? r.ttsLabel ?? null);
      setSegments(segmentsFromCues(script, r.cues).map((s, i) => ({ ...s, vi: parts[i]?.vi ?? null })));
    });
  const uploadAudio = (file: File) =>
    run("upload", async () => {
      const [up, tr] = await Promise.all([audioApi.upload(file), videoTeacherApi.transcribeFile(file, "en")]);
      setAudioUrl(up.url);
      setAudioCues(null);
      setAudioVoice(t("teacherMain.segments.voice.real"));
      if (!tr.segments.length) throw new Error(t("teacherMain.segments.error.noSegments"));
      setSegments(tr.segments.map((s, i) => ({ ...s, i, blanks: [] })));
      setAudioScript(tr.segments.map((s) => s.text).join("\n"));
    });

  const aiRefine = () =>
    run("ai", async () => {
      const r = await videoTeacherApi.aiSegment(segments, level || null, SHOW_BLANK_PICKER);
      setSegments(r.segments);
    });

  const playSeg = (s: VideoSegment) => {
    if (source === "video") { playerRef.current?.playSegment(s.start, s.end); return; }
    const a = audioRef.current;
    if (!a || s.end <= s.start) return;
    a.currentTime = s.start;
    void a.play();
    if (audioStopRef.current) clearTimeout(audioStopRef.current);
    audioStopRef.current = window.setTimeout(() => a.pause(), Math.max(200, (s.end - s.start) * 1000));
  };
  // Editing the text moves its words, so the accepted spellings keyed by word index are dropped.
  const setSeg = (i: number, patch: Partial<VideoSegment>) =>
    setSegments((prev) =>
      prev.map((s) => (s.i === i ? { ...s, ...patch, ...(patch.text != null && patch.text !== s.text ? { alts: null } : {}) } : s)),
    );
  const removeSeg = (i: number) => setSegments((prev) => prev.filter((s) => s.i !== i).map((s, idx) => ({ ...s, i: idx })));
  const toggleMode = (m: PracticeMode) => setModes((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));

  const SOURCES: { id: PracticeSource; label: string; icon: typeof Youtube }[] = [
    { id: "video", label: "Video (YouTube)", icon: Youtube },
    { id: "audio", label: t("teacherMain.segments.source.audio"), icon: Headphones },
  ];

  return (
    <div className="space-y-4">
      {err && (
        <div ref={errRef} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">{err}</div>
      )}

      {/* Nguồn */}
      <div>
        <div className="mb-1.5 text-sm font-medium text-slate-600 dark:text-slate-300">{t("teacherMain.segments.source")}</div>
        <div className="flex flex-wrap gap-2">
          {SOURCES.map((s) => {
            const Icon = s.icon;
            const on = source === s.id;
            return (
              <button
                key={s.id}
                type="button"
                disabled={editing}
                onClick={() => setSource(s.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50 ${
                  on ? "border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300" : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                }`}
              >
                <Icon className="h-4 w-4" /> {s.label}
              </button>
            );
          })}
          {editing && <span className="self-center text-xs text-slate-400">{t("teacherMain.segments.noChangeSource")}</span>}
        </div>
      </div>

      {source === "video" ? (
        <>
          <div className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_6.5rem_auto]">
            <div className="col-span-2 sm:col-span-1">
              <Input label="Link YouTube" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://youtu.be/…" />
            </div>
            <Input label={t("teacherMain.segments.from")} value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} placeholder="0:00" inputMode="numeric" />
            <Input label={t("teacherMain.segments.to")} value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} placeholder={t("teacherMain.segments.toPlaceholder")} inputMode="numeric" />
            <Button variant="primary" onClick={buildLesson} disabled={busy === "build" || !youtubeId} className="col-span-2 sm:col-span-1">
              <Sparkles className="mr-1.5 h-4 w-4" /> {step ? t(STEP_LABEL[step]) : t("teacherMain.segments.build")}
            </Button>
          </div>
          <p className="truncate text-xs text-slate-400" title={t("teacherMain.segments.buildHint")}>
            {t("teacherMain.segments.buildHint")}
          </p>

          {needAudio && (
            <Card className="space-y-3 border-amber-300 bg-amber-50/60 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
              <div>
                <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t("teacherMain.segments.needAudio")}</h3>
                <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-300/80">{t("teacherMain.segments.needAudioHint")}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label className={`shrink-0 cursor-pointer ${buttonClass("outline", "md")}`}>
                  <input type="file" accept="audio/*,video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) videoAudio(f); e.currentTarget.value = ""; }} />
                  <Upload className="h-4 w-4" /> {t("teacherMain.segments.videoAudio")}
                </label>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(cliCommand()).then(() => { setCmdCopied(true); setTimeout(() => setCmdCopied(false), 1500); })}
                  className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-amber-200 bg-white px-3 text-left font-mono text-xs text-slate-600 dark:border-amber-500/30 dark:bg-slate-900 dark:text-slate-300"
                  title={t("teacherMain.segments.copyAll")}
                >
                  <span className="min-w-0 flex-1 truncate">{cliCommand()}</span>
                  {cmdCopied ? <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500" /> : <Copy className="h-3.5 w-3.5 shrink-0" />}
                </button>
              </div>
            </Card>
          )}

          {youtubeId && <YouTubePlayer ref={playerRef} videoId={youtubeId} />}

          {/* Manual tools: paste SRT/VTT, split, run one AI step again, upload the audio. */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setAdvanced((v) => !v)}
              className="flex w-full items-center gap-1.5 px-4 py-3 text-sm font-medium text-slate-600 transition hover:text-cyan-600 dark:text-slate-300 dark:hover:text-cyan-400"
            >
              <ChevronDown className={`size-4 shrink-0 transition-transform ${advanced ? "" : "-rotate-90"}`} />
              {t("teacherMain.segments.advanced")}
              <span className="truncate font-normal text-slate-400">· {t("teacherMain.segments.advancedHint")}</span>
            </button>
            {advanced && (
              <div className="space-y-3 border-t border-slate-200 p-4 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-700 dark:text-slate-200">Transcript</h3>
                  {raw.trim() ? (
                    <button
                      type="button"
                      onClick={() => navigator.clipboard?.writeText(raw).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}
                      className="flex items-center gap-1 text-xs text-cyan-600 hover:underline dark:text-cyan-400"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? t("teacherMain.segments.copied") : t("teacherMain.segments.copyAll")}
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">{t("teacherMain.segments.srtHint")}</span>
                  )}
                </div>
                <p className="text-xs text-slate-400">
                  {segments.length ? t("teacherMain.segments.hasSegments", { n: segments.length }) : t("teacherMain.segments.manual")}
                </p>
                <Textarea rows={6} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder={"1\n00:00:01,000 --> 00:00:04,000\nHello and welcome back."} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={parseTranscript} disabled={busy === "parse" || !raw.trim()}>
                    <Wand2 className="mr-1.5 h-4 w-4" /> {busy === "parse" ? t("teacherMain.segments.parsing") : t("teacherMain.segments.parse")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={packAi} disabled={busy === "pack" || segments.length < 2}>
                    <Combine className="mr-1.5 h-4 w-4" /> {busy === "pack" ? t("teacherMain.segments.packing") : t("teacherMain.segments.pack")}
                  </Button>
                  <Button variant="outline" size="sm" onClick={aiRefine} disabled={busy === "ai" || !segments.length}>
                    <Sparkles className="mr-1.5 h-4 w-4" /> {busy === "ai" ? t("teacherMain.segments.aiLoading") : t("teacherMain.segments.ai")}
                  </Button>
                  <label className={`cursor-pointer ${buttonClass("outline", "sm")} ${youtubeId ? "" : "pointer-events-none opacity-50"}`} title={t("teacherMain.segments.videoAudioHint")}>
                    <input type="file" accept="audio/*,video/*" className="hidden" disabled={!youtubeId} onChange={(e) => { const f = e.target.files?.[0]; if (f) videoAudio(f); e.currentTarget.value = ""; }} />
                    <Upload className="h-4 w-4" /> {t("teacherMain.segments.videoAudio")}
                  </label>
                </div>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="flex items-end gap-2">
            <Select label={t("teacherMain.segments.voice")} value={gender} onChange={(v) => setGender(v as "female" | "male")} options={[{ value: "female", label: t("teacherMain.segments.female") }, { value: "male", label: t("teacherMain.segments.male") }]} />
            {audioVoice && <span className="pb-2 text-xs text-slate-400">{audioVoice}</span>}
          </div>
          {audioUrl && (
            <audio ref={audioRef} src={audioUrl} controls className="w-full">
              <track kind="captions" />
            </audio>
          )}
          <Card className="space-y-3 p-4">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200">{t("teacherMain.segments.sentences")}</h3>
            <p className="text-xs text-slate-400">{t("teacherMain.segments.sentenceHint")}</p>
            <Textarea rows={6} value={audioScript} onChange={(e) => setAudioScript(e.target.value)} placeholder={t("teacherMain.segments.scriptPlaceholder")} />
            <div className="flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={genAudio} disabled={busy === "tts" || !audioScript.trim()}>
                <Volume2 className="mr-1.5 h-4 w-4" /> {busy === "tts" ? t("teacherMain.segments.ttsLoading") : t("teacherMain.segments.tts")}
              </Button>
              <Button variant="outline" size="sm" onClick={aiRefine} disabled={busy === "ai" || !segments.length}>
                <Sparkles className="mr-1.5 h-4 w-4" /> {busy === "ai" ? t("teacherMain.segments.aiLoading") : t("teacherMain.segments.ai")}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <label className="cursor-pointer">
                <input type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAudio(f); e.currentTarget.value = ""; }} />
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800">
                  <Upload className="h-4 w-4" /> {busy === "upload" ? t("teacherMain.segments.uploading") : t("teacherMain.segments.upload")}
                </span>
              </label>
              <span className="text-xs text-slate-400">{t("teacherMain.segments.sttHint")}</span>
            </div>
          </Card>
        </>
      )}

      {/* Đoạn luyện */}
      {segments.length > 0 && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-slate-700 dark:text-slate-200">{t("teacherMain.segments.title", { n: segments.length })}</h3>
            <div className="flex gap-3 text-sm">
              {(["dictation", "shadowing"] as PracticeMode[]).map((m) => (
                <label key={m} className="flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={modes.includes(m)} onChange={() => toggleMode(m)} className="accent-cyan-500" />
                  {m === "dictation" ? t("teacherMain.segments.dictation") : "Shadowing"}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {segments.map((s) => {
              const words = splitWords(s.text);
              return (
                <div key={s.i} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => playSeg(s)}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500/10 text-cyan-600 hover:bg-cyan-500/20 disabled:opacity-40"
                      disabled={s.end <= s.start || (source === "video" ? !youtubeId : !audioUrl)}
                      title={t("teacherMain.segments.play")}
                    >
                      <Play className="h-4 w-4" />
                    </button>
                    <span className="w-16 shrink-0 text-center text-xs tabular-nums text-slate-400">{fmt(s.start)}–{fmt(s.end)}</span>
                    <Input value={s.text} onChange={(e) => setSeg(s.i, { text: e.target.value })} className="flex-1" />
                    <button type="button" onClick={() => removeSeg(s.i)} className="text-slate-400 hover:text-rose-500" title={t("teacherMain.segments.delete")}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-1.5 pl-10">
                    <Input value={s.vi ?? ""} onChange={(e) => setSeg(s.i, { vi: e.target.value || null })} placeholder={t("teacherMain.segments.translationPlaceholder")} className="text-sm" />
                  </div>
                  {modes.includes("dictation") && !!s.alts && Object.keys(s.alts).length > 0 && (
                    <div className="mt-1 truncate pl-10 text-xs text-slate-400" title={altsLabel(words, s.alts)}>
                      {t("teacherMain.segments.alts", { list: altsLabel(words, s.alts) })}
                    </div>
                  )}
                  {SHOW_BLANK_PICKER && modes.includes("dictation") && (
                    <div className="mt-1.5 flex flex-wrap gap-1 pl-10">
                      {words.map((w, wi) => {
                        const on = (s.blanks ?? []).includes(wi);
                        return (
                          <button
                            key={wi}
                            type="button"
                            onClick={() => setSeg(s.i, { blanks: on ? (s.blanks ?? []).filter((b) => b !== wi) : [...(s.blanks ?? []), wi].sort((a, b) => a - b) })}
                            className={`rounded px-1.5 py-0.5 text-xs transition ${on ? "bg-cyan-500 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400"}`}
                            title={t("teacherMain.segments.blank")}
                          >
                            {w}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setSegments((prev) => [...prev, { i: prev.length, start: 0, end: 0, text: "", vi: null, blanks: [] }])}>
            <Plus className="mr-1.5 h-4 w-4" /> {t("teacherMain.segments.addManual")}
          </Button>
        </Card>
      )}
    </div>
  );
}
