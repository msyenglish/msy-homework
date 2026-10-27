import { useEffect, useRef, useState } from "react";
import { Captions, CaptionsOff, Pin, PinOff } from "lucide-react";
import type { AudioCuesResp } from "../../lib/api";
import { AudioPlayer } from "../AudioPlayer";
import { Tooltip } from "../Tooltip";
import { cn } from "../../lib/utils";
import { t, type TKey } from "../../i18n";

// Lời nhắc khi HS bật gợi ý — khuyến khích tự nghe để luyện tai.
const HINT_REMINDER: TKey = "practice2.audio.hintReminder";

// Toggle GỢI Ý cho thanh STICKY (mobile/iPad): text + icon, KHÔNG viền/nền, màu vàng (amber
// = gợi ý), căn giữa — tránh trùng khối với nút play tròn cạnh bên.
function StickyHintToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-label={t(on ? "practice2.audio.disableHint" : "practice2.audio.enableHint")}
      aria-pressed={on}
      onClick={onToggle}
      className={cn(
        "flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-amber-600 transition dark:text-amber-400",
        on ? "font-bold" : "font-medium opacity-80 hover:opacity-100",
      )}
    >
      {on ? <Captions className="size-3.5" /> : <CaptionsOff className="size-3.5" />}
      {t(on ? "practice2.audio.hintOn" : "practice2.audio.hintOff")}
    </button>
  );
}

// Nút bật/tắt GỢI Ý (phụ đề chạy theo audio) — bản DESKTOP: icon + CHỮ "Gợi ý" cho dễ thấy.
function HintButton({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <Tooltip label={on ? t("practice2.audio.disableHint") : t("practice2.audio.hintAudio")}>
      <button
        type="button"
        aria-label={t(on ? "practice2.audio.disableHint" : "practice2.audio.enableHint")}
        aria-pressed={on}
        onClick={onToggle}
        className={cn(
          "flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold transition",
          on
            ? "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400"
            : "border-slate-200 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800",
        )}
      >
        {on ? <Captions className="size-3.5" /> : <CaptionsOff className="size-3.5" />}
        {t(on ? "practice2.audio.disableHint" : "practice2.audio.hint")}
      </button>
    </Tooltip>
  );
}

// Thanh nghe ghi âm.
//  • sticky=true  → DOCK cố định đáy màn hình (mobile), gọn, bỏ khung trong (bare).
//  • sticky=false → thẻ trên desktop; có nút GHIM (mặc định bật) để dính TOP khi cuộn.
//  • hint         → có phụ đề (cues) để bật "gợi ý"; mặc định ẨN, HS chủ động bật mới thấy.
//    Phụ đề chỉ hiện khi hint && hintOn (client gate — không lộ đáp án trước khi nộp).
export function AudioBar({
  src,
  cues,
  sticky,
  className,
  onHeight,
  hint = false,
  hintOn = false,
  onToggleHint,
}: {
  src: string;
  cues?: AudioCuesResp | null;
  sticky?: boolean;
  className?: string;
  // Báo chiều cao thật của thanh dock (mobile) để cha chừa đúng padding đáy → footer sát thanh.
  onHeight?: (h: number) => void;
  hint?: boolean;
  hintOn?: boolean;
  onToggleHint?: () => void;
}) {
  // Chỉ truyền cues xuống player khi HS đã bật gợi ý — mặc định giấu (bài nghe không lộ script).
  const shownCues = hint && hintOn ? cues : null;
  // Sticky (mobile) dùng toggle text amber căn giữa; desktop dùng nút icon có viền cạnh nút ghim.
  const stickyToggle = hint && onToggleHint ? <StickyHintToggle on={hintOn} onToggle={onToggleHint} /> : null;
  const hintBtn = hint && onToggleHint ? <HintButton on={hintOn} onToggle={onToggleHint} /> : null;
  if (sticky) return <StickyAudioBar src={src} cues={shownCues} hintToggle={stickyToggle} hintOn={hint && hintOn} onHeight={onHeight} />;
  return <DesktopAudioBar src={src} cues={shownCues} hintBtn={hintBtn} hintOn={hint && hintOn} className={className} />;
}

// fixed (không sticky): sticky-bottom là phần tử cuối cột nên không có chỗ trượt →
// khi cuộn tới đáy sẽ hở. fixed luôn dán đáy viewport; chừa safe-area cho máy notch.
// Đo offsetHeight bằng ResizeObserver để cha (Quiz) chừa padding đáy đúng bằng chiều
// cao thanh — footer không bị che, cũng không hở. Trên desktop lg:hidden → height 0.
function StickyAudioBar({
  src,
  cues,
  hintToggle,
  hintOn,
  onHeight,
}: {
  src: string;
  cues?: AudioCuesResp | null;
  hintToggle?: React.ReactNode;
  hintOn?: boolean;
  onHeight?: (h: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Reserve paddingBottom cho cha = chiều cao NỀN (waveform + nút + toggle), KHÔNG tính phần
  // phụ đề. Nhờ vậy bật gợi ý (thanh cao lên) KHÔNG đội layout gây scroll khi vốn đang vừa màn —
  // phụ đề nở lên phủ khoảng trống phía trên dock. Chốt chiều cao nền lúc CHƯA bật phụ đề.
  const baseRef = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || !onHeight) return;
    const report = () => {
      const h = el.offsetHeight;
      if (!hintOn) baseRef.current = h;
      onHeight(hintOn ? baseRef.current || h : h);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => {
      ro.disconnect();
      onHeight(0);
    };
  }, [onHeight, hintOn]);

  return (
    <div
      ref={ref}
      className="fixed inset-x-0 bottom-0 z-30 overflow-hidden border-t border-slate-200 bg-white/95 px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95"
    >
      {/* Họa tiết full-bleed cho CẢ thanh (phủ tới mép/padding); AudioPlayer noMotif để khỏi trùng */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-cyan-50 via-transparent to-transparent dark:from-cyan-950/40"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 text-cyan-500/15 dark:text-cyan-400/10"
        style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)", backgroundSize: "11px 11px" }}
      />
      {/* Toggle gợi ý CĂN GIỮA phía trên (không viền/nền, màu vàng) — không đè nút play;
          toggle đã truyền tải lời nhắc nên KHÔNG lặp lại dòng HINT_REMINDER ở đây (đỡ cao). */}
      {hintToggle && <div className="relative z-10 mb-1 flex justify-center">{hintToggle}</div>}
      {/* bare = bỏ 1 lớp box bên trong cho rộng chỗ. */}
      <AudioPlayer src={src} cues={cues} bare noMotif className="relative z-10" />
    </div>
  );
}

function DesktopAudioBar({
  src,
  cues,
  hintBtn,
  hintOn,
  className,
}: {
  src: string;
  cues?: AudioCuesResp | null;
  hintBtn?: React.ReactNode;
  hintOn?: boolean;
  className?: string;
}) {
  const [pinned, setPinned] = useState(true); // mặc định ghim để không mất khi cuộn

  // Nút Ghim/Bỏ ghim — đặt inline cuối dòng label (không còn absolute).
  const pinBtn = (
    <Tooltip label={t(pinned ? "practice2.audio.unpin" : "practice2.audio.pin")}>
      <button
        type="button"
        aria-label={t(pinned ? "practice2.audio.unpin" : "practice2.audio.pin")}
        aria-pressed={pinned}
        onClick={() => setPinned((v) => !v)}
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg border transition",
          pinned
            ? "border-cyan-200 bg-cyan-50 text-cyan-600 dark:border-cyan-500/30 dark:bg-cyan-500/15 dark:text-cyan-400"
            : "border-slate-200 text-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-500 dark:hover:bg-slate-800",
        )}
      >
        {pinned ? <Pin className="size-3.5" /> : <PinOff className="size-3.5" />}
      </button>
    </Tooltip>
  );

  // 1 box duy nhất (bare = AudioPlayer không tự vẽ khung); ghim → dính top-0 sát mép,
  // bo góc trên vuông lại cho giống thanh bar (phải là con trực tiếp của cột cao để trượt).
  // Nút gợi ý đứng TRƯỚC nút ghim (cạnh nhau) ở cuối dòng label.
  return (
    <AudioPlayer
      src={src}
      cues={cues}
      bare
      label={t("practice2.audio.recording")}
      hint={hintOn ? t(HINT_REMINDER) : undefined}
      labelAction={
        <div className="flex items-center gap-1.5">
          {hintBtn}
          {pinBtn}
        </div>
      }
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900",
        pinned && "sticky top-0 z-20 rounded-t-none shadow-md",
        className,
      )}
    />
  );
}
