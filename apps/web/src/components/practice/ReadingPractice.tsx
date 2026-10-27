import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useLearningRefresh } from "../../lib/learningRefresh";
import {
  AlertTriangle,
  ArrowLeft,
  AudioLines,
  BookOpen,
  Check,
  Gamepad2,
  Gauge,
  History,
  Loader2,
  Medal,
  Mic,
  Minus,
  Plus,
  RotateCcw,
  Send,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";
import {
  DEFAULT_READER_PREFS,
  formatPoints,
  type IpaLine,
  type ReaderPrefs,
  wordAccuracy,
} from "@msyen/shared";
import { useWordSpeaker } from "../../lib/useWordSpeaker";
import { buildWordIpaMap } from "../../lib/wordIpa";
import { isSilentLevel, measureAudioLevel } from "../../lib/audioLevel";
import {
  type PublicExerciseResp,
  type ReadingHistoryItem,
  type ReadingJobStatus,
  type ReadingResult,
  type ReadingWordResult,
  type RecordApi,
} from "../../lib/api";
import {
  addRecordHistory,
  clearRecordHistory,
  getRecordHistory,
  type RecordEntry,
} from "../../lib/recordHistory";
import { AudioPlayer } from "../AudioPlayer";
import { AudioRecorder } from "../AudioRecorder";
import { assessInBrowser } from "../../lib/azureAssess";
import { toWav16k } from "../../lib/wav";
import { HeroDecor } from "../HeroDecor";
import { Narrative, type RenderStrong } from "../Narrative";
import ThemeToggle from "../ThemeToggle";
import { Button } from "../ui";
import { cn, recordFileName } from "../../lib/utils";
import { AttemptHistory } from "../AttemptHistory";
import { WeakPhonemeLine } from "./PhonemeBreakdown";
import {
  ACC_TIERS,
  accTier,
  ScoredPassage,
  ScoredWord,
  WordToolCtx,
} from "./ScoredPassage";
import { RecordingPanel } from "./RecordingPanel";
import { RecordPassage } from "./RecordPassage";
import { ScoreHero } from "./ScoreHero";
import { WaitingGame } from "./WaitingGame";
import { t, type TKey } from "../../i18n";

const MAX_SECONDS = 90;



// Chuẩn hoá 1 từ để so khớp (bỏ dấu câu, thường hoá) — dùng nối điểm với từ khoá trong nhận xét.
function normalizeWord(s: string): string {
  return s.toLowerCase().replace(/[^a-z']/g, "");
}


export function ReadingPractice({
  exercise,
  learnerName,
  api,
  backTo = "/u/library",
}: {
  exercise: PublicExerciseResp;
  learnerName: string;
  api: RecordApi<ReadingResult>;
  backTo?: string;
}) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Đang chấm (async): giai đoạn hiện tại để hiện màn chờ + % — null nghĩa là chưa nộp.
  const [gradeStage, setGradeStage] = useState<ReadingJobStatus | null>(null);
  const refreshLearning = useLearningRefresh();
  const submitting = gradeStage !== null && gradeStage !== "error"; // khóa nút khi đang chấm (không khóa lúc lỗi)
  const pollRef = useRef<number | null>(null);
  // Job hiện tại — giữ để "Chấm lại" (audio đã ở R2, không upload lại).
  const jobIdRef = useRef<string | null>(null);
  // Kết quả đã có nhưng em ĐANG CHƠI game chờ → giữ lại, hiện nút "Xem kết quả" thay vì
  // tự nhảy trang. `playedRef` bật khi em bắt đầu chơi.
  const [readyResult, setReadyResult] = useState<ReadingResult | null>(null);
  const playedRef = useRef(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ReadingResult | null>(null);
  // Báo cáo có URL ổn định (?kq=<submissionId>) → F5 vào thẳng báo cáo, không rớt về record.
  const [searchParams, setSearchParams] = useSearchParams();
  const kq = searchParams.get("kq");
  const [loadingResult, setLoadingResult] = useState(!!kq);
  // Kết quả lần trước (nếu đã từng làm) — để hiện nút "Xem điểm lần trước" trên trang record.
  const [lastResult, setLastResult] = useState<ReadingResult | null>(null);
  const latestFetchedRef = useRef(false);
  // Đang ghi âm? → teleprompter (Shadowing) tự chạy.
  const [recording, setRecording] = useState(false);
  // Mở lại game giải trí (từ trang kết quả) để chơi cho vui.
  const [showGame, setShowGame] = useState(false);
  // Cảnh báo bản ghi KHÔNG CÓ TIẾNG (đo ở client trước khi nộp) + cờ đang đo.
  const [silentWarn, setSilentWarn] = useState(false);
  const [checking, setChecking] = useState(false);
  // Từ đang được phát khi nghe lại "Bản ghi của em" — highlight đồng bộ trong đoạn đã chấm.
  // null = không phát / dữ liệu cũ (không có mốc thời gian).
  const [playbackWordIdx, setPlaybackWordIdx] = useState<number | null>(null);
  // Đổi key để remount AudioRecorder (nút "Ghi lại" đưa recorder về trạng thái đầu).
  const [recorderKey, setRecorderKey] = useState(0);
  // Các bản ghi cũ của bài này (lưu tạm localStorage) + trạng thái popover.
  const [history, setHistory] = useState<RecordEntry[]>(() =>
    getRecordHistory(exercise.exercise_id),
  );

  // Dữ liệu hỗ trợ đọc (tuỳ giáo viên đã sinh hay chưa).
  const hasCues = !!exercise.audio_cues && exercise.audio_cues.words.length > 0;
  const hasModelAudio = !!exercise.audio_url;

  // Tùy chọn đọc (teleprompter/IPA/tốc độ/số dòng) — lưu localStorage: prefs mang tính
  // THIẾT BỊ (cỡ chữ, tốc độ chạy chữ), không đáng đồng bộ qua server.
  const PREFS_LS_KEY = "reader-prefs";
  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_READER_PREFS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREFS_LS_KEY);
      if (raw) setPrefs({ ...DEFAULT_READER_PREFS, ...JSON.parse(raw) });
    } catch {
      /* bỏ qua */
    }
  }, []);
  // Đổi tùy chọn → cập nhật UI ngay + lưu localStorage, không chặn.
  function updatePrefs(patch: Partial<ReaderPrefs>) {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(PREFS_LS_KEY, JSON.stringify(next));
      } catch {
        /* bỏ qua */
      }
      return next;
    });
  }

  // Số từ + thời lượng ước lượng (đọc to ~100 từ/phút) cho hero.
  const wordCount = useMemo(
    () => (exercise.passage ?? "").trim().split(/\s+/).filter(Boolean).length,
    [exercise.passage],
  );
  const estMinutes = Math.max(1, Math.ceil(wordCount / 100));

  // Object URL để nghe lại bản ghi hiện tại trước khi nộp.
  useEffect(() => {
    if (!blob) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  // Ghi xong 1 bản MỚI → đặt làm bản hiện tại + lưu vào lịch sử localStorage.
  // (Chỉ lưu ở đây, KHÔNG lưu khi chọn lại bản cũ → tránh nhân đôi.)
  function handleRecorded(b: Blob | null) {
    setBlob(b);
    if (b)
      addRecordHistory(exercise.exercise_id, b)
        .then(setHistory)
        .catch(() => {});
  }

  // Chọn 1 bản ghi CŨ (từ lịch sử) làm bản để nộp: dataURL → Blob.
  async function useHistoryEntry(entry: RecordEntry) {
    try {
      const b = await (await fetch(entry.dataUrl)).blob();
      setBlob(b);
      setError("");
    } catch {
      /* bỏ qua */
    }
  }

  // "Ghi lại": xoá bản hiện tại + remount recorder về trạng thái đầu (hiện lại nút mic).
  function reRecord() {
    setBlob(null);
    setError("");
    setRecorderKey((k) => k + 1);
  }

  // Dọn timer poll khi rời trang.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  // Hiện báo cáo + ghim id lượt nộp vào URL (?kq=) để F5 vẫn vào thẳng báo cáo.
  function showResult(res: ReadingResult) {
    setResult(res);
    if (res.submission_id) {
      const sp = new URLSearchParams(searchParams);
      sp.set("kq", res.submission_id);
      setSearchParams(sp, { replace: true });
    }
  }

  // Vào trang có sẵn ?kq=<id> (F5 / mở link) → tải thẳng báo cáo của lượt nộp đó.
  useEffect(() => {
    if (!kq || result) return;
    let active = true;
    setLoadingResult(true);
    api
      .result(kq)
      .then((res) => active && setResult(res))
      .catch(() => {
        // id sai/không phải của mình → gỡ param, quay về trang record.
        if (!active) return;
        const sp = new URLSearchParams(searchParams);
        sp.delete("kq");
        setSearchParams(sp, { replace: true });
      })
      .finally(() => active && setLoadingResult(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kq]);

  // Mở trang record (không có ?kq) → lấy điểm LẦN TRƯỚC (nếu có) để hiện nút xem lại,
  // KHÔNG tự chuyển sang báo cáo (giữ ý định "Làm lại"). Chỉ gọi 1 lần.
  useEffect(() => {
    if (kq || latestFetchedRef.current) return;
    latestFetchedRef.current = true;
    api
      .latest(exercise.exercise_id)
      .then((r) => r && setLastResult(r))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // NỘP + POLL: upload nhanh lấy job_id → poll nền tới khi done/error. Kết quả hiện
  // TẠI CHỖ (không load lại). Bản ghi đã ở R2 nên mạng chập vẫn không mất bài.
  async function submit(force = false) {
    if (!blob) return;
    // Chặn NGAY tại client: bản ghi không có tiếng (mic tắt/chặn) → hiện modal cảnh báo,
    // KHÔNG gửi (đỡ tốn 1 lượt chấm ra 0 điểm). `force` = em bấm "Vẫn gửi" trong modal.
    if (!force) {
      setChecking(true);
      const lvl = await measureAudioLevel(blob);
      setChecking(false);
      if (lvl && isSilentLevel(lvl)) {
        setSilentWarn(true);
        return;
      }
    }
    setError("");
    setReadyResult(null);
    playedRef.current = false;
    setGradeStage("queued");
    let jobId: string;
    try {
      // Azure scores the take right here (Speech SDK, continuous mode); the server merges the raw
      // results. A preview (no learner session) skips straight to the stub api below.
      const segments = api.scoresInBrowser
        ? await assessInBrowser(await toWav16k(blob), exercise.passage ?? "")
        : undefined;
      jobId = await api.submit(exercise.exercise_id, blob, segments);
    } catch (e) {
      // Upload hỏng (chưa có job) → về màn ghi âm để bấm Nộp lại (audio chưa lên R2).
      setGradeStage(null);
      setError(
        e instanceof Error ? e.message : t("practice.reading.uploadFailed"),
      );
      return;
    }
    jobIdRef.current = jobId;
    runPoll(jobId);
  }

  // Vòng POLL job tới khi done/error. Tách khỏi submit để "Chấm lại" tái dùng (không upload lại).
  function runPoll(jobId: string) {
    if (pollRef.current) window.clearTimeout(pollRef.current);
    const started = Date.now();
    // Mốc BẮT ĐẦU chấm (rời "queued") — tách thời gian xếp hàng khỏi thời gian chấm thật:
    // xếp hàng lâu (server bận) không nên tính là "chấm quá lâu".
    let procStarted = 0;
    const poll = async () => {
      const now = Date.now();
      // Kẹt thật khi: đã chấm >3 phút, hoặc tổng thời gian (kể cả chờ hàng) >6 phút.
      if ((procStarted && now - procStarted > 180_000) || now - started > 360_000) {
        setGradeStage("error");
        setError(t("practice.reading.gradingTimeout"));
        return;
      }
      try {
        const r = await api.pollJob(jobId);
        if (r.status === "done" && r.result) {
          // Graded ASYNCHRONOUSLY: the score exists only now, so this is where the library
          // cards, the drip unlocks and the points badge become stale.
          refreshLearning();
          // Đang chơi game → giữ màn chờ + hiện nút "Xem kết quả"; nếu không → hiện luôn.
          if (playedRef.current) {
            setReadyResult(r.result);
            setGradeStage("done");
          } else {
            setGradeStage(null);
            showResult(r.result);
          }
          return;
        }
        if (r.status === "error") {
          setGradeStage("error");
          setError(r.error || t("practice.reading.gradingFailed"));
          return;
        }
        if (!procStarted && r.status !== "queued") procStarted = now; // đã rời hàng, bắt đầu chấm
        setGradeStage(r.status); // queued | assessing | feedback
        pollRef.current = window.setTimeout(poll, 1500);
      } catch {
        // Lỗi mạng tạm thời → thử lại (vẫn trong hạn 3 phút).
        pollRef.current = window.setTimeout(poll, 2500);
      }
    };
    poll();
  }

  // "Chấm lại" khi lỗi: audio đã ở R2 → gọi regrade (re-queue) rồi poll tiếp, KHÔNG upload lại.
  // Nếu adapter không hỗ trợ regrade (vd bản teacher) → chỉ poll lại (dành cho ca client tự timeout).
  async function retryGrade() {
    const jobId = jobIdRef.current;
    if (!jobId) return;
    setError("");
    setReadyResult(null);
    playedRef.current = false;
    setGradeStage("queued");
    try {
      await api.regrade?.(jobId);
    } catch (e) {
      // 409 = audio đã hết hạn lưu → phải thu lại.
      setGradeStage("error");
      setError(e instanceof Error ? e.message : t("practice.reading.regradeFailed"));
      return;
    }
    runPoll(jobId);
  }

  // Em bấm "Xem kết quả" (sau khi chơi game xong chờ) → hiện màn kết quả.
  function reveal() {
    if (readyResult) showResult(readyResult);
    setReadyResult(null);
    setGradeStage(null);
  }

  // Mở lại báo cáo 1 lượt đọc cũ (từ danh sách lịch sử) + cuộn lên đầu.
  function openAttempt(id: string) {
    api
      .result(id)
      .then((res) => {
        showResult(res);
        window.scrollTo({ top: 0, behavior: "smooth" });
      })
      .catch(() => {});
  }

  function tryAgain() {
    setResult(null);
    setBlob(null);
    setError("");
    // Gỡ ?kq= để quay lại trang record (F5 sẽ ra record, không phải báo cáo cũ).
    const sp = new URLSearchParams(searchParams);
    sp.delete("kq");
    setSearchParams(sp, { replace: true });
  }

  // Nghe lại "Bản ghi của em": mỗi lần audio báo thời gian (giây) → tìm từ đang phát
  // (cur*1000 ∈ [offsetMs, offsetMs+durationMs)). Bỏ qua từ không có mốc (offsetMs null).
  // Hết phát / về đầu (cur≈0) → bỏ highlight. Dữ liệu cũ (mọi offsetMs null) → luôn null.
  function handleRecordTime(cur: number) {
    const words = result?.words;
    if (!words || words.length === 0) {
      setPlaybackWordIdx(null);
      return;
    }
    if (cur <= 0) {
      setPlaybackWordIdx(null);
      return;
    }
    const ms = cur * 1000;
    const idx = words.findIndex((w) => {
      if (w.offsetMs == null || w.durationMs == null) return false;
      return ms >= w.offsetMs && ms < w.offsetMs + w.durationMs;
    });
    setPlaybackWordIdx(idx >= 0 ? idx : null);
  }

  // While the mic is live the page-level light/dark button (drawn by UserPracticePage, out in the
  // page margin on a wide screen) steps aside for the one this component puts inside the reading
  // area. A flag on <html> is the only channel: that button lives above this component.
  useEffect(() => {
    document.documentElement.dataset.recording = recording ? "1" : "";
    return () => { document.documentElement.dataset.recording = ""; };
  }, [recording]);

  // Hero dùng lại: trang KẾT QUẢ đặt hero BÊN TRONG vùng cuộn (để cuộn đi, không ghim);
  // các trạng thái khác đặt hero ở đỉnh (ghim). Ancestor mobile là h-[100dvh] overflow-hidden
  // nên vùng cuộn nội bộ (overflow-y-auto) BẮT BUỘC phải giữ, nếu không sẽ mất scroll.
  const hero = (
    <RecordHero
      title={exercise.title}
      studentName={learnerName}
      wordCount={wordCount}
      estMinutes={estMinutes}
      backTo={backTo}
    />
  );

  return (
    // KHUNG 1-MÀN chỉ cho state GHI ÂM / chờ chấm (reading giãn đầy + footer dính đáy).
    // Trang KẾT QUẢ → document-flow (block, cuộn theo TRANG): scrollbar ở mép ngoài, KHÔNG
    // vùng overflow nội bộ → tooltip 2 bên không bị cắt. (h trừ padding của PracticePage.)
    <div
      className={cn(
        "relative mx-auto max-w-3xl",
        !result &&
          "flex h-[100dvh] flex-col sm:h-[calc(100dvh-2rem)] lg:h-[calc(100dvh-3rem)]",
      )}
    >
      {/* Hero pinned at the top, except on the result page (there it scrolls with the content).
          While the mic is live it goes away on EVERY size: reading aloud is the one moment nothing
          else on screen matters, and a desktop hero pushed the running text into a letterbox. */}
      {!result && (
        <div className={cn(recording && "hidden")}>{hero}</div>
      )}

      {/* RECORDING: light/dark sits INSIDE the reading area (top-left), the same place a phone
          shows it. The page-level toggle is hidden meanwhile — see the effect above — otherwise
          desktop drew a second one out in the grey margin. */}
      {!result && recording && (
        <ThemeToggle className="absolute left-2 top-4 z-30 inline-flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10" />
      )}

      {/* RECORDING + teleprompter running: the speed control, right where the eye is. Shown on
          every size now — the config button lives in the card title bar, which recording hides. */}
      {!result && recording && prefs.shadowing && (
        <div className="absolute right-2 top-4 z-30 flex items-center">
          <button
            type="button"
            aria-label={t("practice.reading.scrollSlower")}
            onClick={() => updatePrefs({ speed: Math.max(1, prefs.speed - 1) })}
            disabled={prefs.speed <= 1}
            className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <Minus className="size-4" />
          </button>
          <span className="flex items-center gap-0.5 px-0.5 text-xs font-bold tabular-nums text-slate-500 dark:text-slate-300">
            <Gauge className="size-3.5 text-cyan-500" />
            {prefs.speed}
          </span>
          <button
            type="button"
            aria-label={t("practice.reading.scrollFaster")}
            onClick={() => updatePrefs({ speed: Math.min(7, prefs.speed + 1) })}
            disabled={prefs.speed >= 7}
            className="flex size-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 disabled:opacity-30 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <Plus className="size-4" />
          </button>
        </div>
      )}

      {/* Overlay CHƠI GAME (mở từ trang kết quả) — giải trí, không liên quan chấm điểm. */}
      {showGame && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={() => setShowGame(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
                <Gamepad2 className="size-4 text-cyan-500" /> {t("practice.reading.playForFun")}
              </p>
              <button
                type="button"
                onClick={() => setShowGame(false)}
                aria-label={t("practice.reading.closeGame")}
                className="flex size-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                <X className="size-4" />
              </button>
            </div>
            <WaitingGame />
          </div>
        </div>
      )}

      {/* CẢNH BÁO bản ghi không có tiếng — chặn nộp (đo ở client). Em thu lại, hoặc vẫn gửi. */}
      {silentWarn && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
          onClick={() => setSilentWarn(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              <AlertTriangle className="size-6" />
            </div>
            <p className="text-base font-bold text-slate-800 dark:text-white">
              {t("practice.reading.silentTitle")}
            </p>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {t("practice.reading.silentDesc")}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button
                size="lg"
                onClick={() => {
                  setSilentWarn(false);
                  reRecord();
                }}
              >
                <Mic className="size-4" /> {t("practice.reading.rerecord")}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setSilentWarn(false);
                  submit(true);
                }}
                className="text-xs font-medium text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
              >
                {t("practice.reading.sendAnyway")}
              </button>
            </div>
          </div>
        </div>
      )}

      {result ? (
        <>
          {/* Document-flow: hero + nội dung cuộn theo TRANG (không vùng overflow nội bộ →
              tooltip 2 bên hiện đầy đủ, scrollbar là của trang ở mép ngoài). */}
          {hero}
          <div className="mt-4 px-4 lg:px-0">
            <ReadingResultView
              result={result}
              activeWordIdx={playbackWordIdx}
              passageIpa={exercise.passage_ipa}
            />
            {/* Lịch sử các lần đọc — bung để xem lại từng lượt (best được đánh dấu). */}
            <ReadingHistoryList
              slug={exercise.exercise_id}
              fetchHistory={api.history}
              currentId={result.submission_id}
              onOpen={openAttempt}
              className="mt-4 mb-6"
            />
          </div>
          {/* Bản ghi + nút Quay lại · Chơi game · Đọc lại — DÍNH ĐÁY viewport khi cuộn. */}
          <div className="sticky bottom-0 z-30 space-y-2 border-t border-slate-200 bg-slate-100/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:px-0 lg:pb-3">
            <RecordingPanel
              url={result.audio_url}
              onTime={handleRecordTime}
              onCollapse={() => setPlaybackWordIdx(null)}
              downloadName={result.audio_url ? recordFileName(exercise.exercise_id, result.audio_url) : undefined}
            />
            <div className="flex gap-2">
              <BackButton to={backTo} />
              <button
                type="button"
                onClick={() => setShowGame(true)}
                aria-label={t("practice.reading.playGame")}
                title={t("practice.reading.playGameTitle")}
                className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                <Gamepad2 className="size-5" />
              </button>
              <Button
                variant="outline"
                className="flex-1"
                size="lg"
                onClick={tryAgain}
              >
                <Mic className="size-4" /> {t("practice.reading.readAgain")}
              </Button>
            </div>
          </div>
        </>
      ) : loadingResult ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 max-lg:min-h-0">
          <Loader2 className="size-7 animate-spin text-cyan-500" />
          <p className="text-sm text-slate-500">{t("practice.reading.openingReport")}</p>
        </div>
      ) : gradeStage ? (
        <GradingProgress
          stage={gradeStage}
          ready={!!readyResult}
          error={error}
          onRetry={retryGrade}
          onBack={() => {
            setGradeStage(null);
            setError("");
          }}
          onReveal={reveal}
          onPlay={() => {
            playedRef.current = true;
          }}
        />
      ) : (
        // Khung 1 màn cho MỌI cỡ: vùng đọc giãn đầy (flex-1), cụm ghi âm + nút dồn đáy.
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Đã làm rồi → nút xem lại điểm/kết quả lần trước (không chặn việc ghi lại). */}
          {lastResult && !blob && (
            <div
              className={cn(
                "shrink-0 px-4 pb-2 lg:px-0",
                recording && "hidden",
              )}
            >
              <button
                type="button"
                onClick={() => showResult(lastResult)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-cyan-200 bg-cyan-50/70 px-4 py-2.5 text-left transition hover:bg-cyan-100/70 dark:border-cyan-800 dark:bg-cyan-500/10 dark:hover:bg-cyan-500/20"
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-cyan-700 dark:text-cyan-300">
                  <Trophy className="size-4" /> {t("practice.reading.viewBestResult")}
                </span>
                {/* Điểm tô màu theo thang (nổi bật hơn) — dùng chung ACC_TIERS như đoạn văn. */}
                <span
                  className={cn(
                    "text-sm font-extrabold",
                    accTier(lastResult.pron_score).text,
                  )}
                >
                  {t("practice.reading.scoreWithArrow", { score: lastResult.pron_score })}
                </span>
              </button>
            </div>
          )}
          {/* ── Phần TRÊN: reading — GIÃN hết chiều cao còn lại (card tự cuộn bên trong) ── */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 lg:gap-4">
            <RecordPassage
              className="min-h-0"
              passage={exercise.passage ?? ""}
              ipaLines={exercise.passage_ipa}
              prefs={prefs}
              onPrefsChange={updatePrefs}
              recording={recording}
            />

            {/* Nghe cô đọc mẫu (nếu có). */}
            {hasModelAudio && (
              <div className="shrink-0 px-4 lg:px-0">
                <AudioPlayer
                  src={exercise.audio_url!}
                  cues={hasCues ? exercise.audio_cues : null}
                  label={t("practice.reading.listenModelAudio")}
                />
              </div>
            )}
          </div>

          {/* ── Footer dính đáy: recorder + nút gộp 1 CỤM, liền nền (không viền), chuẩn width ── */}
          <div className="mt-2 shrink-0 bg-slate-100/95 backdrop-blur dark:bg-slate-950/95">
            {/* Thu âm: icon micro TO + waveform cuộn + text. */}
            <div className="px-4 pt-2 lg:px-0">
              <AudioRecorder
                key={recorderKey}
                maxSeconds={MAX_SECONDS}
                disabled={submitting}
                onRecorded={handleRecorded}
                onRecordingChange={setRecording}
              />

              {/* Có bản ghi hiện tại HOẶC có bản đã lưu (kể cả sau F5) → hiện hàng này. */}
              {(previewUrl || history.length > 0) && (
                <div className="mt-3">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-slate-500">
                      {previewUrl
                        ? t("practice.reading.replayRecording")
                        : t("practice.reading.savedRecordingsDevice")}
                    </p>
                    {history.length > 0 && (
                      <RecordHistory
                        slug={exercise.exercise_id}
                        history={history}
                        onSelect={useHistoryEntry}
                        onClear={() => {
                          clearRecordHistory(exercise.exercise_id);
                          setHistory([]);
                        }}
                      />
                    )}
                  </div>
                  {previewUrl && (
                    <AudioPlayer
                      src={previewUrl}
                      downloadName={recordFileName(
                        exercise.exercise_id,
                        previewUrl,
                      )}
                    />
                  )}
                </div>
              )}

              {/* Lỗi dạng SECTION BOX (không phải dòng chữ trần) — đồng bộ với trang NÓI. */}
              {error && (
                <div className="mt-3 flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/60 dark:bg-rose-500/10">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-rose-500" />
                  <p className="text-sm leading-relaxed text-rose-700 dark:text-rose-300">
                    {error}
                  </p>
                </div>
              )}
            </div>

            {/* Nhóm nút Quay lại · (nền sáng/tối — chỉ mobile) · Ghi lại · Nộp bài (trong footer). */}
            <div className="flex gap-2 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 lg:px-0">
              <BackButton to={backTo} />
              {/* Nút đổi nền: ẩn ở hero trên mobile, dời xuống cạnh nút Quay lại. */}
              <ThemeToggle className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 md:hidden" />
              {blob && (
                <button
                  type="button"
                  onClick={reRecord}
                  disabled={submitting}
                  title={t("practice.reading.recordAgainTitle")}
                  className="flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <RotateCcw className="size-4" /> {t("practice.reading.recordAgain")}
                </button>
              )}
              <Button
                className="flex-1"
                size="lg"
                disabled={!blob || submitting || checking}
                onClick={() => submit()}
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> {t("practice.reading.gradingPronunciation")}
                  </>
                ) : checking ? (
                  <>
                    <Loader2 className="size-4 animate-spin" /> {t("practice.reading.checkingRecording")}
                  </>
                ) : (
                  <>
                    <Send className="size-4" /> {t("practice.reading.submit")}
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// "Xem lại các bản ghi" — nút mở popover LÊN TRÊN, liệt kê các bản ghi cũ (localStorage).
// Export: trang NÓI dùng chung y hệt (đừng chép lại).
export function RecordHistory({
  history,
  onSelect,
  onClear,
  slug,
}: {
  history: RecordEntry[];
  onSelect: (entry: RecordEntry) => void;
  onClear: () => void;
  slug: string; // dùng đặt tên file khi tải bản ghi cũ về máy
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Đóng khi bấm ra ngoài.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const fmtTime = (at: number) => {
    const d = new Date(at);
    return d.toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-cyan-600 transition hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-500/10"
      >
        <History className="size-3.5" /> Review recordings ({history.length})
      </button>

      {open && (
        <div className="absolute bottom-full right-0 z-50 mb-2 w-[min(26rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Saved recordings (this device)
            </p>
            <button
              type="button"
              onClick={onClear}
              className="text-[11px] font-semibold text-rose-500 hover:underline"
            >
              Clear all
            </button>
          </div>
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {history.map((h, i) => (
              <div
                key={h.id}
                className="rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-900/60"
              >
                <div className="mb-0.5 flex items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-400">
                    Take {history.length - i} · {fmtTime(h.at)}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(h);
                      setOpen(false);
                    }}
                    className="flex items-center gap-1 rounded-md bg-cyan-500 px-2 py-0.5 text-[11px] font-semibold text-white transition hover:bg-cyan-600"
                  >
                    <Check className="size-3" /> Use this one
                  </button>
                </div>
                <AudioPlayer
                  src={h.dataUrl}
                  downloadName={recordFileName(
                    slug,
                    h.dataUrl,
                    `-lan-${history.length - i}`,
                  )}
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute -right-2 -top-2 flex size-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

// Màn hình CHỜ CHẤM (async): thanh % chạy mượt theo giai đoạn job. Bản ghi đã nằm ở R2
// nên em cứ để yên; kết quả tự hiện khi xong. % chỉ mô phỏng tiến độ (Azure không trả %).
const GRADE_STAGE_META: Record<
  ReadingJobStatus,
  { pct: number; title: string; sub: string }
> = {
  queued: {
    pct: 25,
    title: "Got your recording",
    sub: "Queued for grading…",
  },
  assessing: {
    pct: 75,
    title: "Grading pronunciation",
    sub: "MSY English is listening carefully to every word…",
  },
  feedback: { pct: 93, title: "MSY English is writing feedback", sub: "Almost done…" },
  done: { pct: 100, title: "Done", sub: "" },
  error: { pct: 100, title: "Error", sub: "" },
};

// 3 bước hiển thị dạng stepper. "feedback" gộp vào bước "Chấm điểm" (vẫn đang chấm).
const GRADE_STEPS = ["Upload", "Grading", "Done"] as const;
type StepState = "done" | "active" | "error" | "pending";

// Trạng thái từng bước theo giai đoạn job. Ở màn này bản ghi đã lên R2 nên "Tải lên" luôn xong.
function stepStates(stage: ReadingJobStatus, ready: boolean): StepState[] {
  if (ready || stage === "done") return ["done", "done", "done"];
  if (stage === "error") return ["done", "error", "pending"];
  // queued | assessing | feedback → đang ở bước "Chấm điểm"
  return ["done", "active", "pending"];
}

// 1 nốt stepper: số / spinner / check / x theo trạng thái.
function StepNode({ index, state, label }: { index: number; state: StepState; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <div
        className={cn(
          "flex size-8 items-center justify-center rounded-full text-sm font-bold transition",
          state === "done" && "bg-cyan-500 text-white",
          state === "active" && "bg-cyan-500/15 text-cyan-600 ring-2 ring-cyan-500 dark:text-cyan-400",
          state === "error" && "bg-rose-500 text-white",
          state === "pending" && "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500",
        )}
      >
        {state === "done" ? (
          <Check className="size-4" />
        ) : state === "active" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : state === "error" ? (
          <X className="size-4" />
        ) : (
          index + 1
        )}
      </div>
      <span
        className={cn(
          "text-center text-[11px] font-medium leading-tight",
          state === "pending"
            ? "text-slate-400"
            : state === "error"
              ? "text-rose-600 dark:text-rose-400"
              : "text-slate-600 dark:text-slate-300",
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function GradingProgress({
  stage,
  ready,
  error,
  onRetry,
  onBack,
  onReveal,
  onPlay,
}: {
  stage: ReadingJobStatus;
  ready: boolean; // đã chấm xong (đang chờ em bấm xem vì đang chơi game)
  error?: string;
  onRetry?: () => void; // chấm lại từ audio đã ở R2 (không upload lại)
  onBack?: () => void; // thu lại (về màn ghi âm)
  onReveal: () => void;
  onPlay: () => void;
}) {
  const rawMeta = GRADE_STAGE_META[stage];
  const meta = rawMeta;
  const states = stepStates(stage, ready);
  const isError = stage === "error";

  return (
    // Rộng bằng hero (max-w-3xl của cha) → không còn box nhỏ lạc lõng. Cuộn được để
    // game cao (khung to gấp đôi) không bị tràn/che trong shell cố định.
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-6 pt-4 lg:px-0">
      {/* Stepper 1-2-3: Tải lên → Chấm điểm → Xong */}
      <div className="mb-4 flex items-start gap-1 px-2">
        {GRADE_STEPS.map((label, i) => (
          <div key={label} className="flex min-w-0 flex-1 items-start">
            <StepNode index={i} state={states[i]} label={label} />
            {i < GRADE_STEPS.length - 1 && (
              <div
                className={cn(
                  "mt-4 h-0.5 flex-1 rounded-full transition",
                  states[i] === "done" && states[i + 1] !== "pending"
                    ? "bg-cyan-500"
                    : "bg-slate-200 dark:bg-slate-700",
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Dòng trạng thái hiện tại */}
      {!isError && (
        <div className="mb-3 flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50">
          {ready ? (
            <Check className="size-5 shrink-0 text-cyan-500" />
          ) : (
            <Loader2 className="size-5 shrink-0 animate-spin text-cyan-500" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-800 dark:text-white">
              {ready ? "Result ready!" : meta?.title}
            </p>
            {!ready && meta?.sub && <p className="text-xs text-slate-500">{meta.sub}</p>}
          </div>
        </div>
      )}

      {/* Lỗi chấm → nút Chấm lại (dùng lại audio ở R2, KHÔNG upload lại) + Thu lại */}
      {isError && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-3 dark:border-rose-500/30 dark:bg-rose-500/10">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-500" />
            <p className="text-sm font-medium text-rose-700 dark:text-rose-300">
              {error || "Grading didn't finish. Please try again."}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-500/25 transition hover:brightness-105"
              >
                <RotateCcw className="size-4" /> Regrade
              </button>
            )}
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                <Mic className="size-4" /> Re-record
              </button>
            )}
          </div>
          <p className="mt-2 text-[11px] text-rose-600/80 dark:text-rose-400/70">
            Your recording is kept — regrading doesn't require recording again.
          </p>
        </div>
      )}

      {/* Đã chấm xong (đang chơi game) → nút xem kết quả, KHÔNG tự nhảy trang */}
      {ready && (
        <button
          type="button"
          onClick={onReveal}
          className="mt-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 px-4 py-3 text-base font-bold text-white shadow-lg shadow-cyan-500/25 transition hover:brightness-105"
        >
          <Check className="size-5" /> View result
        </button>
      )}

      {/* Trò chơi giết thời gian trong lúc chờ (ẩn khi lỗi) */}
      {!isError && (
        <div className="mt-5">
          <p className="mb-1.5 text-[11px] font-medium text-slate-400">
            {ready
              ? "Keep playing if you like — your result is ready on the button above."
              : "While you wait, play for fun:"}
          </p>
          <WaitingGame onPlay={onPlay} />
        </div>
      )}

      {!ready && !isError && (
        <p className="mt-3 text-center text-[11px] leading-relaxed text-slate-400">
          The result appears automatically when grading finishes. If you're
          playing, a “View result” button will appear so you're not interrupted.
        </p>
      )}
    </div>
  );
}

// Lịch sử các lượt đọc của bài — bung để xem lại từng lượt (best + lượt đang xem được
// đánh dấu). Bấm 1 lượt → mở báo cáo lượt đó. Ẩn nếu chỉ có 0–1 lượt.
/** Read-aloud attempt list — the shared widget, kept in English for the practice pages. */
export function ReadingHistoryList(props: {
  slug: string;
  fetchHistory: (slug: string) => Promise<ReadingHistoryItem[]>;
  currentId?: string;
  onOpen: (id: string) => void;
  className?: string;
}) {
  return <AttemptHistory {...props} lang="en" />;
}

// Nút quay lại — icon-only, đặt inline cạnh nút Nộp bài / Đọc lại.
function BackButton({ to }: { to: string }) {
  return (
    <Link
      to={to}
      aria-label={t("practice.reading.back")}
      className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      <ArrowLeft className="size-5" />
    </Link>
  );
}

// Hero RIÊNG cho trang Record (khác template reading/Quiz): mobile tràn viền + sát
// top + có khoảng cách với section đọc; nút dark/light nằm ngay trong hero.
function RecordHero({
  title,
  studentName,
  wordCount,
  estMinutes,
  backTo,
}: {
  title: string;
  studentName: string;
  wordCount: number;
  estMinutes: number;
  backTo: string;
}) {
  return (
    <header className="relative mb-3 overflow-hidden border-b border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-950 sm:mb-4 sm:rounded-2xl sm:border sm:p-6">
      <HeroDecor
        seed={title}
        className="text-cyan-500/15 dark:text-cyan-400/10"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 -top-16 size-48 rounded-full bg-cyan-500/10 blur-3xl"
      />

      <div className="relative flex items-start gap-4">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-teal-500 text-white shadow-lg shadow-cyan-500/30 sm:size-16">
          <BookOpen className="size-7 sm:size-8" />
        </div>
        <div className="min-w-0 flex-1">
          <h1
            title={title}
            className="truncate text-xl font-extrabold leading-tight text-slate-900 dark:text-white sm:text-2xl"
          >
            {title}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500 dark:text-white/70">
            <span className="font-semibold text-slate-700 dark:text-white/90">
              {studentName}
            </span>
            <span className="text-slate-300 dark:text-white/30">•</span>
            <span className="font-semibold text-cyan-600 dark:text-cyan-300">
              Record
            </span>
            <span className="text-slate-300 dark:text-white/30">•</span>
            <span>
              <span className="font-bold text-slate-700 dark:text-white/90">
                {wordCount}
              </span>{" "}
              {t("practice.reading.wordAndMinutes", { count: wordCount, minutes: estMinutes })}
            </span>
          </p>
        </div>
        {/* Nút Quay lại (chỉ ≥768px / iPad trở lên) + dark/light — cùng viền/nền để đồng bộ. */}
        <div className="flex shrink-0 items-center gap-2">
          <Link
            to={backTo}
            aria-label={t("practice.reading.back")}
            className="hidden h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 md:inline-flex"
          >
            <ArrowLeft className="size-4" /> {t("practice.reading.back")}
          </Link>
          {/* Nền sáng/tối: chỉ ≥768px (mobile đã dời nút này xuống footer cạnh Quay lại). */}
          <ThemeToggle className="hidden size-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 md:inline-flex" />
        </div>
      </div>
    </header>
  );
}

// 4 chỉ số thành phần — mỗi cái 1 icon + 1 họ màu riêng. Ăn theo THEME: light dùng
// sắc đậm -600 (đọc rõ nền sáng), dark dùng -400; ô icon nền/viền mờ cùng tông.
// key trỏ tới field trong ReadingResult; prosody có thể null → tự lược khi render.
const SCORE_METRICS: { key: string; label: TKey; icon: typeof BookOpen; tile: string; num: string }[] = [
  {
    key: "accuracy",
    label: "practice.reading.metricAccuracy",
    icon: BookOpen,
    tile: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:border-emerald-500/40 dark:text-emerald-400",
    num: "text-emerald-600 dark:text-emerald-400",
  },
  {
    key: "fluency",
    label: "practice.reading.metricFluency",
    icon: Gauge,
    tile: "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:border-cyan-500/40 dark:text-cyan-400",
    num: "text-cyan-600 dark:text-cyan-400",
  },
  {
    key: "completeness",
    label: "practice.reading.metricCompleteness",
    icon: Medal,
    tile: "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:border-violet-500/40 dark:text-violet-400",
    num: "text-violet-600 dark:text-violet-400",
  },
  {
    key: "prosody",
    label: "practice.reading.metricProsody",
    icon: AudioLines,
    tile: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:border-amber-500/40 dark:text-amber-400",
    num: "text-amber-600 dark:text-amber-400",
  },
] as const;

export function ReadingResultView({
  result,
  report = false,
  activeWordIdx = null,
  passageIpa = null,
}: {
  result: ReadingResult;
  report?: boolean; // report mode (read-only): hides the reward block, used on the /s/:id page
  activeWordIdx?: number | null; // word currently playing back (synced with the "Your recording" audio); null = none
  passageIpa?: IpaLine[] | null; // exercise's passage_ipa → per-word stressed IPA for the tooltip
}) {
  // Phát âm 1 từ (on-demand) + map IPA-có-trọng-âm cho tooltip từng-từ (qua WordToolCtx).
  const { play: speak, loading: speakLoading, speaking } = useWordSpeaker();
  const ipaMap = useMemo(() => buildWordIpaMap(passageIpa), [passageIpa]);
  // Giá trị từng chỉ số (prosody có thể null → lược khỏi hàng).
  const metricVals: Record<string, number | null | undefined> = {
    accuracy: result.accuracy,
    fluency: result.fluency,
    completeness: result.completeness,
    prosody: result.prosody,
  };
  const metrics = SCORE_METRICS.filter((m) => metricVals[m.key] != null).map(
    (m) => ({
      ...m,
      label: t(m.label),
      value: metricVals[m.key] as number,
    }),
  );
  // So tiến bộ với lần đọc trước (nếu có).
  const delta =
    result.previous_score != null
      ? Math.round(result.pron_score - result.previous_score)
      : null;
  // Tách 3 loại lỗi để KHÔNG gộp thành một con số dễ gây hiểu nhầm:
  //  · đọc thiếu (bỏ sót từ đề)  · đọc thừa/nhầm (đọc ra từ không có/lặp)  · phát âm chưa tròn (<80).
  const omitted = result.words.filter((w) => w.errorType === "Omission");
  const inserted = result.words.filter((w) => w.errorType === "Insertion");
  const mispron = result.words.filter(
    (w) =>
      w.errorType !== "Omission" &&
      w.errorType !== "Insertion" &&
      wordAccuracy(w) < 80,
  );
  const hasIssues = omitted.length + inserted.length + mispron.length > 0;

  // Bản đồ TỪ (chuẩn hoá) → cả object điểm → tô màu + tooltip ĐẦY ĐỦ cho từ khoá trong nhận xét.
  const wordScoreMap = useMemo(() => {
    const m = new Map<string, ReadingWordResult>();
    for (const w of result.words) {
      if (w.errorType === "Insertion") continue; // từ đọc thừa không thuộc đề
      const key = normalizeWord(w.word);
      if (key && !m.has(key)) m.set(key, w);
    }
    return m;
  }, [result.words]);
  // Render đoạn **đậm** trong nhận xét: nếu là từ trong đề → dùng CHÍNH ScoredWord (in đậm +
  // tô màu theo điểm + bấm ra tooltip đầy đủ như đoạn văn); còn lại giữ đậm thường.
  const renderFeedbackStrong: RenderStrong = (inner, key) => {
    const w = wordScoreMap.get(normalizeWord(inner));
    if (!w) {
      return (
        <strong
          key={key}
          className="font-semibold text-slate-800 dark:text-slate-100"
        >
          {inner}
        </strong>
      );
    }
    return (
      <ScoredWord
        key={key}
        word={w}
        className={cn(
          "font-bold underline decoration-dotted underline-offset-2",
          accTier(wordAccuracy(w)).text,
        )}
      >
        {inner}
      </ScoredWord>
    );
  };

  return (
    <WordToolCtx.Provider
      value={{ speak, loading: speakLoading, speaking, ipaMap }}
    >
      <div>
        {/* Cụm điểm HERO — dùng chung với bài NÓI (xem ScoreHero.tsx). */}
        <ScoreHero score={result.pron_score} metrics={metrics} />

        {/* Điểm THỰC nhận: chỉ cộng khi vượt kỷ lục cũ (làm lại thấp hơn → +0). Ẩn ở chế độ report. */}
        {!report &&
          (() => {
            const gained = result.points_gained ?? 0;
            const gainedText = t("practice.reading.pointsGained", { points: formatPoints(gained) });
            const isBest =
              (result.best_score ?? result.pron_score) <= result.pron_score;
            // Badge tiến bộ — dùng lại 2 chỗ: mobile inline ở dòng "Kỷ lục" (để dòng tiêu đề
            // không bị ép xuống dòng); desktop nằm bên phải.
            const progressBadge =
              delta != null ? (
                <span
                  title={t("practice.reading.comparedToLastTime")}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold",
                    delta > 0
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : delta < 0
                        ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300",
                  )}
                >
                  {delta > 0 ? (
                    <TrendingUp className="size-3.5" />
                  ) : delta < 0 ? (
                    <TrendingDown className="size-3.5" />
                  ) : (
                    <Minus className="size-3.5" />
                  )}
                  {t("practice.reading.deltaPoints", { delta: delta > 0 ? `+${delta}` : delta })}
                </span>
              ) : result.attempt_no === 1 ? (
                <span className="inline-flex items-center rounded-full bg-cyan-100 px-2.5 py-0.5 text-xs font-semibold text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">
                  {t("practice.reading.firstAttempt")}
                </span>
              ) : null;
            return (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 dark:border-amber-900/60 dark:from-amber-500/10 dark:to-yellow-500/10">
                <div className="flex items-start gap-3">
                  <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-400/25 text-2xl">
                    {gained > 0 ? "🎉" : "💪"}
                  </div>
                  <div className="min-w-0 flex-1">
                    {/* Tiêu đề rút gọn "Lần N" + badge INLINE cùng dòng (fit cả mobile, không ép xuống). */}
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-amber-700 dark:text-amber-300">
                      <span>
                        {result.attempt_no != null &&
                          t("practice.reading.attemptNo", { n: result.attempt_no })}
                        {gained > 0 ? t("practice.reading.youEarned") : t("practice.reading.noReward")}
                      </span>
                      {progressBadge}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-lg font-extrabold text-amber-600 dark:text-amber-400">
                        {gainedText}
                      </span>
                      {result.best_score != null && (
                        <>
                          <span className="text-slate-300 dark:text-slate-600">
                            ·
                          </span>
                          {/* Luật thưởng nằm ở TOOLTIP của "Kỷ lục" thay vì một dòng riêng (đỡ dài trang). */}
                          <span
                            title={
                              gained === 0 && !isBest
                                ? t("practice.reading.rewardRuleTooltip")
                                : t("practice.reading.bestScoreTooltip")
                            }
                            className="cursor-help text-sm text-slate-500 underline decoration-slate-300 decoration-dotted underline-offset-2 dark:decoration-slate-600"
                          >
                            {t("practice.reading.recordForThisExercise")}
                            <b className="text-slate-700 dark:text-slate-200">
                              {t("practice.reading.scorePts", { score: result.best_score })}
                            </b>
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

        {/* Đề bài đã tô màu theo điểm từng từ — "chấm chữa" chính (thay box "Máy nghe được"). */}
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
          <p className="mb-2 text-[11px] font-medium text-slate-400">
            {t("practice.reading.clickWordForDetails")}
          </p>
          <div className="text-lg leading-relaxed sm:text-xl">
            <ScoredPassage words={result.words} activeIdx={activeWordIdx} />
          </div>
          {/* Chú thích THANG MÀU — lấy TỪ ACC_TIERS để không lệch với màu chữ trong đoạn. */}
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-xs text-slate-500 dark:border-slate-800">
            <span className="font-medium text-slate-400">{t("practice.reading.colorByScore")}</span>
            {ACC_TIERS.map((t) => (
              <span key={t.min}>
                <span className={t.dot}>●</span> {t.label} ({t.range})
              </span>
            ))}
            <span className="text-slate-300 dark:text-slate-600">|</span>
            <span>
              <span className="text-slate-400">●</span> {t("practice.reading.omitted")}
            </span>
            <span>
              <span className="text-violet-500">●</span> {t("practice.reading.inserted")}
            </span>
          </div>
          {/* Tổng hợp cả bài: âm sai LẶP LẠI (hệ thống) — thứ word-average che mất; rỗng thì tự ẩn. */}
          <WeakPhonemeLine
            words={result.words}
            className="mt-2 border-t border-slate-100 pt-2 text-left dark:border-slate-800"
          />
        </div>

        {/* Chỗ cần luyện — TÁCH 3 nhóm (đọc thiếu / đọc thừa-nhầm / phát âm chưa tròn) thay vì
          gộp một con số, để em thấy rõ đâu là đọc SAI CHỮ, đâu chỉ là phát âm chưa tròn. */}
        {hasIssues && (
          <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            {omitted.length > 0 && (
              <div>
                <p className="mb-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {t("practice.reading.omittedHeader", { n: omitted.length })}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {omitted.map((w, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-medium text-slate-500 line-through decoration-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                    >
                      {w.word}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {inserted.length > 0 && (
              <div>
                <p className="mb-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {t("practice.reading.insertedHeader", { n: inserted.length })}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {inserted.map((w, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-lg border border-violet-200 bg-white px-2 py-1 text-sm font-medium italic text-violet-500 dark:border-violet-900 dark:bg-slate-900 dark:text-violet-400"
                    >
                      {w.word}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {mispron.length > 0 && (
              <div>
                <p className="mb-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {t("practice.reading.mispronHeader", { n: mispron.length })}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {mispron.map((w, i) => (
                    <span
                      key={i}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-lg border bg-white px-2 py-1 text-sm font-medium dark:bg-slate-900",
                        accTier(wordAccuracy(w)).chip,
                      )}
                    >
                      {w.word}
                      <span className="text-[10px] font-semibold opacity-70">
                        {Math.round(wordAccuracy(w))}%
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <p className="text-[11px] leading-relaxed text-slate-400">
              {t("practice.reading.penaltyNote")}
            </p>
          </div>
        )}

        {/* Teacher's comment */}
        {result.feedback ? (
          <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50/60 p-4 dark:border-cyan-900 dark:bg-cyan-500/10">
            <p className="mb-1 text-sm font-semibold text-cyan-700 dark:text-cyan-300">
              {t("practice.reading.teacherFeedback")}
            </p>
            <Narrative
              content={result.feedback}
              renderStrong={renderFeedbackStrong}
              className="space-y-3 text-[15px] leading-relaxed text-slate-700 dark:text-slate-200 sm:text-base"
            />
          </div>
        ) : null}
        {/* (Box "Máy nghe được" đã bỏ — chấm chữa nằm ở "Bấm vào từng từ" phía trên.
          Bản ghi + nút Quay lại/Đọc lại chuyển xuống thanh DÍNH ĐÁY ở component cha.) */}
      </div>
    </WordToolCtx.Provider>
  );
}
