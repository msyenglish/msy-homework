import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Download, Headphones, Pause, Play } from "lucide-react";
import type { AudioCuesResp } from "../lib/api";
import { cn } from "../lib/utils";
import { t } from "../i18n";

// Điều khiển ngoài (LessonPanel) dùng để tua + đọc thời gian phát của player.
export type AudioPlayerHandle = { seek: (t: number) => void; toggle: () => void };

// Số cột sóng — nhiều cột mảnh cho cảm giác chuyên nghiệp (kiểu Voice Recorder).
const BARS = 88;

// Trình phát audio "chuyên nghiệp": SÓNG mảnh đối xứng theo biên độ (giải mã thật
// bằng Web Audio) + đường giữa + đầu đọc (playhead); bấm/kéo trên sóng để tua.
// Nút phát nằm bên PHẢI cho thuận tay. Có thể kèm caption (label + hint) cho dễ hiểu.
type AudioPlayerProps = {
  src: string;
  className?: string;
  label?: string;
  hint?: string;
  cues?: AudioCuesResp | null;
  /** true = bỏ khung (viền/nền/padding) — dùng khi đã có box bọc ngoài (thanh dính đáy mobile). */
  bare?: boolean;
  /** Node hiển thị inline cuối dòng label (vd nút Ghim của thanh audio desktop). */
  labelAction?: React.ReactNode;
  /** true = KHÔNG tự vẽ họa tiết (khi wrapper ngoài đã vẽ full-bleed — thanh dock mobile). */
  noMotif?: boolean;
  /** Báo thời gian phát ra ngoài (LessonPanel karaoke trên đoạn văn). */
  onTime?: (cur: number, dur: number) => void;
  /** Tên file khi tải về → hiện nút tải. Chỉ cho bản ghi của chính người học. */
  downloadName?: string;
};

export const AudioPlayer = forwardRef<AudioPlayerHandle, AudioPlayerProps>(function AudioPlayer(
  { src, className = "", label, hint, cues, bare = false, labelAction, noMotif = false, onTime, downloadName },
  handleRef,
) {
  const ref = useRef<HTMLAudioElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLSpanElement>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  // Thời lượng THẬT từ buffer đã giải mã — dự phòng khi element báo duration = Infinity/NaN
  // (bản ghi webm từ MediaRecorder rất hay bị) → playhead/sóng đứng yên khi phát.
  const [bufDur, setBufDur] = useState(0);
  const [peaks, setPeaks] = useState<number[] | null>(null);

  // Cho phép LessonPanel tua (bấm 1 từ trên đoạn văn) + phát/dừng.
  useImperativeHandle(handleRef, () => ({ seek: (t: number) => seekTo(t), toggle: () => toggle() }), []);

  // Tải + giải mã audio → biên độ đỉnh mỗi cột (sóng theo mức âm lượng).
  useEffect(() => {
    let alive = true;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    fetch(src)
      .then((r) => r.arrayBuffer())
      .then((buf) => ac.decodeAudioData(buf))
      .then((audio) => {
        if (!alive) return;
        const data = audio.getChannelData(0);
        const block = Math.max(1, Math.floor(data.length / BARS));
        const out: number[] = [];
        let max = 0;
        for (let i = 0; i < BARS; i++) {
          let peak = 0;
          const start = i * block;
          for (let j = 0; j < block; j++) {
            const v = Math.abs(data[start + j] || 0);
            if (v > peak) peak = v;
          }
          out.push(peak);
          if (peak > max) max = peak;
        }
        // Chuẩn hoá theo đỉnh CỦA CHÍNH bản ghi để rõ HÌNH DẠNG, nhưng nhân thêm "độ to thật"
        // (đỉnh so với mức tham chiếu REF) → bản ghi IM LẶNG / mic lỗi hiện thanh THẤP thay vì
        // bị kéo giãn thành các thanh đều tầm trung. REF ≈ đỉnh của giọng đọc bình thường.
        const REF = 0.18;
        const loud = Math.min(1, max / REF); // ~0 khi im lặng, 1 khi đủ to
        setPeaks(out.map((p) => (max ? (p / max) * loud : 0)));
        if (isFinite(audio.duration) && audio.duration > 0) setBufDur(audio.duration);
      })
      .catch(() => {
        /* Không giải mã được → dùng thanh tiến trình thường (fallback). */
      })
      .finally(() => ac.close().catch(() => {}));
    return () => {
      alive = false;
    };
  }, [src]);

  function toggle() {
    const a = ref.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }
  function fmt(s: number) {
    if (!isFinite(s) || s < 0) return "0:00";
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, "0")}`;
  }
  // Thời lượng dùng để vẽ/tua: ưu tiên element (nếu hợp lệ), nếu không dùng buffer.
  const effDur = isFinite(dur) && dur > 0 ? dur : bufDur;
  const frac = effDur ? cur / effDur : 0;

  function seekTo(t: number) {
    const a = ref.current;
    if (!a) return;
    a.currentTime = t;
    setCur(t);
  }

  // Từ đang phát: từ CUỐI CÙNG có mốc bắt đầu ≤ thời điểm hiện tại (từ sắp xếp tăng).
  const activeIdx = useMemo(() => {
    const words = cues?.words;
    if (!words || !words.length) return -1;
    let lo = 0;
    let hi = words.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (words[mid].t <= cur + 0.02) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }, [cues, cur]);

  // (Bỏ auto-scroll từ đang phát: khung chỉ hiện 1 CÂU nên từ luôn thấy được;
  //  scrollIntoView trước đây kéo cả trang → không cuộn tay được, chữ nhảy lên.)

  // Ranh giới câu trong transcript — chỉ hiện CÂU đang phát (không lộ cả bài).
  const sentences = useMemo(() => {
    const text = cues?.text;
    if (!text) return [] as { s: number; e: number }[];
    const out: { s: number; e: number }[] = [];
    let start = 0;
    for (let i = 0; i < text.length; i++) {
      if (".!?…".includes(text[i])) {
        let e = i + 1;
        while (e < text.length && "\"')]”’".includes(text[e])) e++; // gộp dấu đóng
        out.push({ s: start, e });
        while (e < text.length && /\s/.test(text[e])) e++; // bỏ khoảng trắng sang câu sau
        start = e;
        i = e - 1;
      }
    }
    if (start < text.length) out.push({ s: start, e: text.length });
    return out;
  }, [cues]);
  // Câu chứa từ đang phát (mặc định câu đầu khi chưa phát).
  const curPos = activeIdx >= 0 && cues ? cues.words[activeIdx].s : 0;
  const activeSent = sentences.find((r) => curPos >= r.s && curPos < r.e) ?? sentences[0] ?? null;

  // Tua theo vị trí X trên dải sóng (bấm hoặc kéo).
  function seekAt(clientX: number) {
    const el = waveRef.current;
    const a = ref.current;
    if (!el || !a || !effDur) return;
    const rect = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    a.currentTime = f * effDur;
    setCur(f * effDur);
  }
  // Fallback: tua trên thanh tiến trình thường.
  function seekBar(e: React.MouseEvent<HTMLDivElement>) {
    const a = ref.current;
    if (!a || !effDur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - rect.left) / rect.width) * effDur;
  }

  // Nút tải bản ghi về máy. <a download> chạy được cả blob: lẫn URL same-origin.
  const downloadBtn = downloadName ? (
    <a
      href={src}
      download={downloadName}
      title={t("shared.audio.download")}
      aria-label={t("shared.audio.download")}
      className="relative flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-cyan-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
    >
      <Download className="size-4" />
    </a>
  ) : null;

  const playBtn = (
    <div className="relative shrink-0">
      {playing && (
        <>
          <span
            aria-hidden
            className="absolute -inset-1 animate-ping rounded-full border-2 border-cyan-400/40"
            style={{ animationDuration: "1.8s" }}
          />
          <span
            aria-hidden
            className="absolute -inset-2.5 animate-ping rounded-full border border-cyan-400/25"
            style={{ animationDuration: "2.4s" }}
          />
        </>
      )}
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? t("shared.audio.pause") : t("shared.audio.play")}
        className="relative flex size-11 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 text-white shadow-lg shadow-cyan-500/30 transition hover:from-cyan-300 hover:to-teal-400"
      >
        {playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-0.5" />}
      </button>
    </div>
  );

  return (
    <div
      className={cn(
        "relative overflow-hidden",
        !bare && "rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 dark:border-slate-700 dark:bg-slate-800/60",
        className,
      )}
    >
      {/* Nền + họa tiết chấm cho TOÀN section audio — đồng bộ nhận diện với bài đọc
          (PassagePanel). Chỉ là lớp trang trí phía sau; nội dung ở z-10 phía trên.
          noMotif = wrapper ngoài đã vẽ full-bleed (thanh dock mobile) → không vẽ lại. */}
      {!noMotif && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-50 via-transparent to-transparent dark:from-cyan-950/40"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 text-cyan-500/15 dark:text-cyan-400/10"
            style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)", backgroundSize: "11px 11px" }}
          />
        </>
      )}
      <audio
        ref={ref}
        src={src}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => {
          setCur(e.currentTarget.currentTime);
          onTime?.(e.currentTarget.currentTime, e.currentTarget.duration || dur);
        }}
        onLoadedMetadata={(e) => {
          setDur(e.currentTarget.duration);
          onTime?.(e.currentTarget.currentTime, e.currentTarget.duration);
        }}
      />

      {/* Caption (tùy chọn) — cho dễ hiểu */}
      {(label || hint || cues || labelAction) && (
        <div className="relative z-10 mb-2.5">
          {(label || labelAction) && (
            <div className="flex items-center gap-2">
              {label ? (
                <>
                  {/* Badge icon kiểu bài đọc (PassagePanel) để đồng bộ nhận diện */}
                  <span className="flex size-6 items-center justify-center rounded-md bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
                    <Headphones className="size-3.5" />
                  </span>
                  <span className="flex-1 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    {label}
                  </span>
                </>
              ) : (
                <span className="flex-1" />
              )}
              {labelAction}
            </div>
          )}
          {hint && <p className="mt-0.5 text-[11px] leading-snug text-slate-400 dark:text-slate-500">{hint}</p>}
          {/* Phụ đề đồng bộ — chỉ hiện CÂU đang phát (không lộ cả bài); từ đang
              phát nổi bật; bấm 1 từ để tua tới đó. */}
          {cues && cues.words.length > 0 && activeSent && (
            <div className="relative z-10 mt-1.5 flex min-h-[3.25rem] items-center rounded-lg bg-white/80 px-3.5 py-2.5 text-base leading-relaxed shadow-sm sm:text-lg dark:bg-slate-900/60">
              <p>
                {(() => {
                  const { text, words } = cues;
                  const { s: S, e: E } = activeSent;
                  const nodes: React.ReactNode[] = [];
                  let pos = S;
                  words.forEach((w, i) => {
                    if (w.e <= S || w.s >= E) return; // từ ngoài câu đang phát
                    if (w.s > pos) nodes.push(<span key={`g${i}`}>{text.slice(pos, w.s)}</span>);
                    const on = i === activeIdx;
                    const past = i < activeIdx;
                    nodes.push(
                      <span
                        key={`w${i}`}
                        ref={on ? activeRef : undefined}
                        onClick={() => seekTo(w.t)}
                        className={cn(
                          "cursor-pointer rounded transition-colors",
                          on
                            ? "bg-cyan-500 px-0.5 font-medium text-white"
                            : past
                              ? "text-slate-700 hover:bg-cyan-100 dark:text-slate-200 dark:hover:bg-cyan-500/20"
                              : "text-slate-400 hover:bg-cyan-100 dark:text-slate-500 dark:hover:bg-cyan-500/20",
                        )}
                      >
                        {text.slice(w.s, w.e)}
                      </span>,
                    );
                    pos = w.e;
                  });
                  if (pos < E) nodes.push(<span key="tail">{text.slice(pos, E)}</span>);
                  return nodes;
                })()}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Sóng (trái, co giãn) + nút phát (phải) — canh đều nhau trên dưới */}
      <div className="relative z-10 flex items-center gap-3.5">
        {peaks ? (
          <div
            ref={waveRef}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              seekAt(e.clientX);
            }}
            onPointerMove={(e) => e.buttons === 1 && seekAt(e.clientX)}
            className="relative flex h-11 flex-1 cursor-pointer touch-none items-center gap-px"
          >
            {/* Đường giữa mờ (kiểu Voice Recorder) */}
            <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-slate-200/80 dark:bg-slate-600/50" />
            {peaks.map((p, i) => {
              const played = i / BARS <= frac;
              return (
                <span
                  key={i}
                  className={cn(
                    "relative z-10 min-h-[2px] w-full flex-1 rounded-full transition-colors",
                    played ? "bg-cyan-500 dark:bg-cyan-400" : "bg-slate-300 dark:bg-slate-600",
                  )}
                  style={{ height: `${Math.max(6, p * 92)}%` }}
                />
              );
            })}
            {/* Đầu đọc (playhead) */}
            {effDur > 0 && (
              <span
                aria-hidden
                style={{ left: `${frac * 100}%` }}
                className="pointer-events-none absolute inset-y-0 z-20 w-0.5 -translate-x-1/2 rounded-full bg-cyan-600 dark:bg-cyan-300"
              />
            )}
          </div>
        ) : (
          // Fallback: thanh tiến trình mảnh khi chưa/không giải mã được sóng.
          <div onClick={seekBar} className="h-2 flex-1 cursor-pointer rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-teal-500 transition-[width]"
              style={{ width: `${frac * 100}%` }}
            />
          </div>
        )}

        {downloadBtn}
        {playBtn}
      </div>

      {/* Thời gian — cùng lưới cột với hàng sóng/nút: hiện tại canh dưới sóng,
          tổng thời lượng canh CHÍNH GIỮA dưới nút phát (w-11 khớp size-11). */}
      <div className="relative z-10 mt-1.5 flex items-center gap-3.5 font-mono text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
        <span className="flex-1">{fmt(cur)}</span>
        <span className="w-11 shrink-0 text-center">{fmt(effDur)}</span>
      </div>
    </div>
  );
});
