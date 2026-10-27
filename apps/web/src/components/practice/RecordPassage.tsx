import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Gauge,
  Mic,
  Minus,
  Palette,
  Pause,
  Play,
  Plus,
  ScrollText,
  Settings2,
  Speech,
  SunDim,
  Type,
  Volume2,
} from "lucide-react";
import type { IpaLine, ReaderBg, ReaderPrefs } from "@msyen/shared";
import { BG_FG, READER_BG_LIST, getReaderBg, isPlainBg, type BgTheme } from "../../lib/readerBgs";
import { BrandWordmark } from "../Logo";
import { cn } from "../../lib/utils";
import { useWordSpeaker } from "../../lib/useWordSpeaker";
import { t } from "../../i18n";

// Tốc độ shadowing theo mức 1..7 → PX/giây cuộn (kiểu credits phim, đều & liên tục).
// Mức 1 = rất chậm (đọc kỹ), tăng dần tới 7 = nhanh. Cỡ chữ đồng đều, không zoom.
const SPEED_PX = [0, 8, 12, 18, 26, 38, 55, 80];

// Head-start: nhấc dòng đầu lên khỏi đáy 2 dòng chữ (theo cỡ chữ, không theo % khung).
const HEAD_START_LINES = 2;
const LINE_HEIGHT = 1.625; // khớp leading-relaxed của dòng chữ lúc chạy

// Chặn trần 35% khung cho màn hình rất thấp.
function headStartPx(fontRem: number, viewH: number) {
  return Math.min(fontRem * 16 * LINE_HEIGHT * HEAD_START_LINES, viewH * 0.35);
}

// Cỡ chữ bài đọc theo mức 1..7 → rem (mức 3 = mặc định). Dải rộng, có mức NHỎ hẳn
// (mức 1) cho ai muốn chữ gọn. Thông số CHUẨN cho mobile; iPad/PC nhân nhẹ (xem dưới).
const FONT_REM = [0, 0.75, 0.9375, 1.125, 1.3125, 1.5, 1.6875, 1.875];
function fontRemOf(level: number) {
  return FONT_REM[level] ?? 1.125;
}

// Nhân cỡ chữ theo thiết bị: mobile ×1 · iPad/PC (≥640) ×1.4 (đọc xa cần to hơn CHÚT).
function useDeviceFontMult() {
  const [m, setM] = useState(1);
  useEffect(() => {
    const compute = () => setM(window.innerWidth >= 640 ? 1.4 : 1);
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);
  return m;
}

// Thanh cuộn mảnh, bo tròn, tách khỏi mép (mobile vuốt tay là chính) — dùng cho vùng
// đọc cuộn được. Mẹo border trong suốt + bg-clip-content để thumb thon, có đệm 2 bên;
// [scrollbar-color] lo cho Firefox. Sáng lên khi hover.
const SCROLL_THIN =
  "[scrollbar-width:thin] [scrollbar-color:rgb(203_213_225)_transparent] " +
  "[&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-track]:bg-transparent " +
  "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-[3px] " +
  "[&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent " +
  "[&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-thumb]:bg-clip-content " +
  "hover:[&::-webkit-scrollbar-thumb]:bg-slate-400 " +
  "dark:[scrollbar-color:rgb(71_85_105)_transparent] dark:[&::-webkit-scrollbar-thumb]:bg-slate-600 " +
  "dark:hover:[&::-webkit-scrollbar-thumb]:bg-slate-500";

// Lớp chữ + màu IPA theo nền. Nền tự chọn: chữ thừa kế màu từ wrapper (set inline).
function bgText(bg: BgTheme) {
  const plain = isPlainBg(bg);
  const fg = bg.dark ? BG_FG.dark : BG_FG.light;
  return {
    plain,
    textCls: plain ? "text-slate-800 dark:text-slate-100" : "",
    ipaCls: plain ? "text-cyan-600 dark:text-cyan-400" : "",
    ipaStyle: plain ? undefined : { color: fg.ipa },
    // Bóng chữ chỉ cần khi nền là ảnh; phông chroma phẳng thì không.
    shadow: bg.image ? { textShadow: bg.dark ? "0 1px 6px rgba(0,0,0,.75)" : "0 1px 6px rgba(255,255,255,.85)" } : undefined,
  };
}

// Tách bài đọc thành các ĐOẠN (theo dòng trống), mỗi đoạn thành các CÂU.
function splitParagraphs(passage: string): string[][] {
  return passage
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((para) => {
      const sentences = para.match(/[^.!?…]+[.!?…]*\s*/g);
      return sentences && sentences.length ? sentences : [para];
    });
}

// Danh sách CÂU phẳng (kèm IPA nếu có) — dùng cho teleprompter & chế độ IPA.
function toLines(passage: string, ipaLines?: IpaLine[] | null): { text: string; ipa: string; vi?: string | null }[] {
  if (ipaLines && ipaLines.length) return ipaLines.map((l) => ({ text: l.text, ipa: l.ipa, vi: l.vi ?? null }));
  return splitParagraphs(passage)
    .flat()
    .map((t) => ({ text: t.trim(), ipa: "" }))
    .filter((l) => l.text);
}

/**
 * Bảng đoạn văn cho trang RECORD (đọc to) — tách riêng khỏi PassagePanel (Quiz).
 * Header có nút cấu hình ⚙️ (popover: Shadowing · IPA · tốc độ · số dòng).
 * Thân: chế độ thường (tách câu, bấm nổi bật) hoặc teleprompter (text chạy từ dưới lên).
 */
export function RecordPassage({
  passage,
  ipaLines,
  prefs,
  onPrefsChange,
  recording = false,
  className,
}: {
  passage: string;
  ipaLines?: IpaLine[] | null;
  prefs: ReaderPrefs;
  onPrefsChange: (patch: Partial<ReaderPrefs>) => void;
  /** true khi đang ghi âm → teleprompter (Shadowing) tự chạy. */
  recording?: boolean;
  className?: string;
}) {
  const hasIpaData = !!ipaLines && ipaLines.length > 0;
  const showIpa = prefs.ipa && hasIpaData;
  const lines = useMemo(() => toLines(passage, ipaLines), [passage, ipaLines]);
  const fontRem = fontRemOf(prefs.fontSize) * useDeviceFontMult();

  // "Chạy thử" (không ghi âm) — teleprompter tự chạy khi ghi âm HOẶC bấm chạy thử.
  const [preview, setPreview] = useState(false);

  // Nền tự chọn cho vùng chữ (quay màn hình làm video). `auto` = giữ nền thẻ theo sáng/tối.
  const bg = getReaderBg(prefs.bg);
  const fg = bg.dark ? BG_FG.dark : BG_FG.light;
  const bgStyle = isPlainBg(bg)
    ? undefined
    : {
        color: fg.text,
        ...(bg.color ? { backgroundColor: bg.color } : {}),
        ...(bg.image
          ? { backgroundImage: `url(${bg.image})`, backgroundSize: "cover", backgroundPosition: "center" }
          : {}),
      };

  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden border-y border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900",
        "sm:rounded-2xl sm:border",
        // Khung 1 màn (mọi cỡ): card đọc GIÃN đầy chiều cao còn lại; text dài / có IPA /
        // đang chạy teleprompter đều cuộn TRONG card (giữ cụm ghi âm + nút dính đáy).
        "min-h-0 flex-1",
        className,
      )}
    >
      {/* Title bar: mic icon + label + config button. Hidden while recording, on every size. */}
      <div
        className={cn(
          "relative flex w-full shrink-0 items-center gap-2 overflow-hidden border-b border-slate-200 bg-gradient-to-r from-cyan-50 via-white to-white px-4 py-3 dark:border-slate-700/70 dark:from-cyan-950/50 dark:via-slate-800/70 dark:to-slate-800/70",
          recording && "hidden",
        )}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 text-cyan-500/15 dark:text-cyan-400/10"
          style={{
            backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)",
            backgroundSize: "11px 11px",
          }}
        />
        <span className="relative flex size-6 items-center justify-center rounded-md bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
          <Mic className="size-3.5" />
        </span>
        <span className="relative flex-1 text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          {t("practice.record.titleBar")}
        </span>
        <ConfigButton prefs={prefs} onChange={onPrefsChange} hasIpaData={hasIpaData} />
      </div>

      {/* Thân: teleprompter (Shadowing) hoặc đoạn văn thường. Nền tự chọn phủ ở ĐÂY
          (không phủ thanh tiêu đề) — đúng "phần chạy chữ" mà video cần. */}
      <div className="relative flex min-h-0 flex-1 flex-col" style={bgStyle}>
        {/* Lớp phủ làm dịu ảnh; tắt được qua prefs.bgOverlay. */}
        {bg.image && prefs.bgOverlay && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 z-0"
            style={{ backgroundColor: bg.dark ? "rgba(2,6,23,0.55)" : "rgba(255,255,255,0.62)" }}
          />
        )}
        {/* z-10: phải nằm trên lớp phủ, không thì bị che mất chữ. */}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          {prefs.shadowing ? (
            <Teleprompter
              lines={lines}
              showIpa={showIpa}
              speed={prefs.speed}
              fontRem={fontRem}
              recording={recording}
              preview={preview}
              onPreviewChange={setPreview}
              bg={bg}
            />
          ) : showIpa ? (
            <IpaBody lines={lines} fontRem={fontRem} bg={bg} recording={recording} />
          ) : (
            <PlainBody passage={passage} fontRem={fontRem} bg={bg} recording={recording} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Nút cấu hình + popover ────────────────────────────────────────────────────
function ConfigButton({
  prefs,
  onChange,
  hasIpaData,
}: {
  prefs: ReaderPrefs;
  onChange: (patch: Partial<ReaderPrefs>) => void;
  hasIpaData: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setOpen(true);
  }

  // Đóng khi cuộn (tránh popover lệch vị trí — dùng fixed theo toạ độ nút).
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={t("practice.record.configAria")}
        aria-expanded={open}
        className={cn(
          "relative flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs font-semibold transition",
          open || prefs.shadowing || prefs.ipa
            ? "border-cyan-300 bg-cyan-50 text-cyan-600 dark:border-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400",
        )}
      >
        <Settings2 className="size-4" />
        <span>{t("practice.record.options")}</span>
      </button>

      {open && pos && (
        <>
          {/* Nền bắt click ra ngoài để đóng */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            style={{ position: "fixed", top: pos.top, right: pos.right }}
            className="z-50 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-800"
          >
            <p className="mb-1 px-1 text-xs font-bold uppercase tracking-wider text-slate-400">
              {t("practice.record.readingConfig")}
            </p>
            <Switch
              icon={<ScrollText className="size-3.5 text-slate-400" />}
              label={t("practice.record.shadowingLabel")}
              hint={t("practice.record.shadowingHint")}
              on={prefs.shadowing}
              onChange={(v) => onChange({ shadowing: v })}
            />
            <Switch
              icon={<Speech className="size-3.5 text-slate-400" />}
              label={t("practice.record.ipaLabel")}
              hint={hasIpaData ? t("practice.record.ipaHintActive") : t("practice.record.ipaHintUnavailable")}
              on={prefs.ipa}
              disabled={!hasIpaData}
              onChange={(v) => onChange({ ipa: v })}
            />
            <div className="my-2 border-t border-slate-100 dark:border-slate-700" />
            <Stepper
              icon={<Gauge className="size-4 text-slate-400" />}
              label={t("practice.record.scrollSpeed")}
              value={prefs.speed}
              min={1}
              max={7}
              onChange={(v) => onChange({ speed: v })}
            />
            <Stepper
              icon={<Type className="size-4 text-slate-400" />}
              label={t("practice.record.fontSize")}
              value={prefs.fontSize}
              min={1}
              max={7}
              onChange={(v) => onChange({ fontSize: v })}
            />
            <div className="my-2 border-t border-slate-100 dark:border-slate-700" />
            <BgPicker
              value={prefs.bg}
              overlay={prefs.bgOverlay}
              onChange={(v) => onChange({ bg: v })}
              onOverlayChange={(v) => onChange({ bgOverlay: v })}
            />
          </div>
        </>
      )}
    </>
  );
}

// ── Chọn nền vùng chữ ─────────────────────────────────────────────────────────
function BgPicker({
  value,
  overlay,
  onChange,
  onOverlayChange,
}: {
  value: ReaderBg;
  overlay: boolean;
  onChange: (v: ReaderBg) => void;
  onOverlayChange: (v: boolean) => void;
}) {
  const cur = getReaderBg(value);
  return (
    <div className="px-1 py-1.5">
      <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
        <Palette className="size-4 text-slate-400" /> {t("practice.record.bgTheme")}
      </span>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-400">
        {cur.hint ?? t("practice.record.bgHintDefault")}
      </p>
      <div className="mt-2 grid grid-cols-6 gap-1.5">
        {READER_BG_LIST.map((b) => {
          const on = b.id === value;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => onChange(b.id)}
              title={b.label}
              aria-label={b.label}
              aria-pressed={on}
              className={cn(
                "relative flex aspect-[9/16] items-center justify-center overflow-hidden rounded-md border-2 transition",
                on ? "border-cyan-500" : "border-slate-200 hover:border-slate-300 dark:border-slate-600",
              )}
              // `auto` → ô chia đôi sáng/tối.
              style={
                b.color
                  ? { backgroundColor: b.color }
                  : b.thumb
                    ? { backgroundImage: `url(${b.thumb})`, backgroundSize: "cover", backgroundPosition: "center" }
                    : { backgroundImage: "linear-gradient(135deg, #ffffff 50%, #0f172a 50%)" }
              }
            >
              {on && (
                <Check
                  className="size-3.5 drop-shadow"
                  style={{ color: isPlainBg(b) ? "#0ea5e9" : b.dark ? "#ffffff" : "#0f172a" }}
                />
              )}
            </button>
          );
        })}
      </div>
      {/* Chỉ có nghĩa với nền ảnh. */}
      {cur.image && (
        <div className="mt-1">
          <Switch
            icon={<SunDim className="size-3.5 text-slate-400" />}
            label={t("practice.record.overlayLabel")}
            hint={t("practice.record.overlayHint")}
            on={overlay}
            onChange={onOverlayChange}
          />
        </div>
      )}
    </div>
  );
}

function Switch({
  icon,
  label,
  hint,
  on,
  onChange,
  disabled,
}: {
  icon?: React.ReactNode;
  label: string;
  hint?: string;
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1.5 text-left transition hover:bg-slate-50 disabled:opacity-50 dark:hover:bg-slate-700/50"
    >
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
          {icon ?? <Type className="size-3.5 text-slate-400" />} {label}
        </span>
        {hint && <span className="mt-0.5 block text-[11px] leading-snug text-slate-400">{hint}</span>}
      </span>
      <span
        className={cn(
          "relative h-6 w-10 shrink-0 rounded-full transition-colors",
          on ? "bg-cyan-500" : "bg-slate-300 dark:bg-slate-600",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
            on ? "left-[1.125rem]" : "left-0.5",
          )}
        />
      </span>
    </button>
  );
}

function Stepper({
  icon,
  label,
  value,
  min,
  max,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const btn =
    "flex size-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200";
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-1.5">
      <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
        {icon} {label}
      </span>
      <div className="flex items-center gap-1.5">
        <button type="button" className={btn} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Minus className="size-4" />
        </button>
        <span className="w-5 text-center text-sm font-bold tabular-nums text-slate-800 dark:text-slate-100">
          {value}
        </span>
        <button type="button" className={btn} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

// Logo watermark at the top of the frame while text scrolls. Picked by BACKGROUND, not by theme —
// image/chroma backgrounds keep their colours in both themes.
function ReaderWatermark({ bg }: { bg: BgTheme }) {
  const common = "opacity-40 drop-shadow-[0_1px_4px_rgba(0,0,0,0.5)]";
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center">
      {isPlainBg(bg) ? (
        <>
          <BrandWordmark height={44} className={cn(common, "flex dark:hidden")} />
          <BrandWordmark height={44} onDark className={cn(common, "hidden dark:flex")} />
        </>
      ) : (
        <BrandWordmark height={44} onDark={bg.dark} className={common} />
      )}
    </div>
  );
}

// ── Thân: teleprompter (text chạy từ dưới lên) ────────────────────────────────
// Mặc định hiện TOÀN BỘ bài (để đọc trọn trước). Chỉ CHẠY (cuộn từ dưới lên) khi
// đang ghi âm (`recording`) hoặc khi học sinh bấm "Chạy thử" (`preview`).
function Teleprompter({
  lines,
  showIpa,
  speed,
  fontRem,
  recording,
  preview,
  onPreviewChange,
  bg,
}: {
  lines: { text: string; ipa: string }[];
  showIpa: boolean;
  speed: number;
  fontRem: number;
  recording: boolean;
  preview: boolean; // "Chạy thử" (không ghi âm) — quản lý ở cha để card biết co/giãn
  onPreviewChange: (v: boolean) => void;
  bg: BgTheme;
}) {
  const { plain, textCls, ipaCls, ipaStyle, shadow } = bgText(bg);
  const viewRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | undefined>(undefined);
  const lastRef = useRef<number | null>(null);
  const offsetRef = useRef(0);
  // Cuộn kiểu CREDITS phim: text trôi đều từ dưới lên. `offset` = đã cuộn bao nhiêu px.
  const [offset, setOffset] = useState(0);
  const [viewH, setViewH] = useState(0);
  const [contentH, setContentH] = useState(0);

  const running = recording || preview;
  const pxPerSec = SPEED_PX[speed] ?? 24;
  const ipaRem = (fontRem * 0.72).toFixed(3);
  // Phát âm 1 từ khi bấm (chỉ dùng ở trạng thái xem tĩnh — lúc chạy credits không bấm).
  const { play, loading, speaking } = useWordSpeaker();

  // Cuộn hết khi dòng cuối trôi qua khỏi đỉnh (đã đệm trên/dưới = 1 khung).
  const maxOffset = viewH + contentH;

  // Đo khung + chiều cao nội dung khi bắt đầu chạy / đổi nội dung / cỡ chữ.
  useLayoutEffect(() => {
    if (!running) return;
    const vh = viewRef.current?.clientHeight ?? 0;
    setViewH(vh);
    setContentH(contentRef.current?.clientHeight ?? 0);
    offsetRef.current = headStartPx(fontRem, vh); // dòng đầu nhô sẵn khỏi đáy ~2 dòng
    setOffset(offsetRef.current);
    lastRef.current = null;
  }, [running, lines, showIpa, fontRem]);

  // Bắt đầu GHI THẬT (kể cả khi đang "chạy thử") → kết thúc chạy thử & cuộn LẠI TỪ ĐẦU.
  // (running vẫn = true khi preview→recording nên effect trên không tự reset.)
  useLayoutEffect(() => {
    if (!recording) return;
    onPreviewChange(false);
    const vh = viewRef.current?.clientHeight ?? viewH;
    offsetRef.current = headStartPx(fontRem, vh);
    setOffset(offsetRef.current);
    lastRef.current = null;
  }, [recording]);

  // Cập nhật kích thước khi khung/nội dung đổi (xoay/đổi cỡ).
  useEffect(() => {
    if (!running) return;
    const measure = () => {
      setViewH(viewRef.current?.clientHeight ?? 0);
      setContentH(contentRef.current?.clientHeight ?? 0);
    };
    const ro = new ResizeObserver(measure);
    if (viewRef.current) ro.observe(viewRef.current);
    if (contentRef.current) ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [running]);

  // Vòng lặp cuộn ĐỀU (px/giây) — mượt, liên tục theo dòng (không nhảy câu).
  useEffect(() => {
    if (!running) {
      lastRef.current = null;
      return;
    }
    const step = (t: number) => {
      const last = lastRef.current;
      lastRef.current = t;
      if (last != null) {
        const dt = Math.min(0.05, (t - last) / 1000);
        offsetRef.current += pxPerSec * dt;
        setOffset(offsetRef.current);
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastRef.current = null;
    };
  }, [running, pxPerSec]);

  // Chạy thử trôi hết → tự dừng (về lại xem full).
  useEffect(() => {
    if (preview && !recording && maxOffset > 0 && offset >= maxOffset) onPreviewChange(false);
  }, [preview, recording, offset, maxOffset, onPreviewChange]);

  // Xem full: căn GIỮA cho ĐỒNG BỘ với lúc chạy (thống nhất 1 kiểu căn giữa).
  // Mỗi TỪ bấm được để nghe phát âm (chỉ ở trạng thái tĩnh, không lúc đang chạy credits).
  const rows = lines.map((ln, i) => (
    <div key={i} className="pb-3 text-center">
      <p className={cn("leading-snug", textCls)} style={{ fontSize: `${fontRem}rem`, ...shadow }}>
        <ClickableWords text={ln.text} play={play} speaking={speaking} loading={loading} />
      </p>
      {showIpa && ln.ipa && (
        <p className={cn("mt-0.5 font-ipa", ipaCls)} style={{ fontSize: `${ipaRem}rem`, ...ipaStyle, ...shadow }}>
          {ln.ipa}
        </p>
      )}
    </div>
  ));

  // ── Trạng thái XEM FULL (chưa chạy): CO theo nội dung; bài dài mới cuộn. ──
  // Vùng cuộn TRÀN viền (không padding ngang) để thanh cuộn nằm sát mép phải;
  // chữ được thụt vào bằng padding của `rows` bên trong → cách xa thanh cuộn.
  if (!running) {
    return (
      <div className="flex min-h-0 flex-1 flex-col pt-4">
        <div className={cn("min-h-0 flex-1 overflow-y-auto", SCROLL_THIN)}>
          <div className="px-4 pb-1">{rows}</div>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-1 pb-3 pt-2">
          <button
            type="button"
            onClick={() => onPreviewChange(true)}
            className="flex items-center gap-1.5 rounded-full border border-cyan-300 bg-cyan-50 px-4 py-1.5 text-sm font-semibold text-cyan-600 transition hover:bg-cyan-100 dark:border-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300 dark:hover:bg-cyan-500/25"
          >
            <Play className="size-4" /> {t("practice.record.previewPlay")}
          </button>
          <p
            className={cn("flex items-center gap-1 text-[11px]", plain && "text-slate-400")}
            style={plain ? undefined : { opacity: 0.75, ...shadow }}
          >
            {t("practice.record.clickWordToHear")} <Volume2 className="size-3.5" aria-hidden /> · {t("practice.record.textAutoScrolls")}
          </p>
        </div>
      </div>
    );
  }

  // ── Trạng thái ĐANG CHẠY: cuộn CREDITS đều từ dưới lên (theo dòng). ──
  // Đệm trên = 1 khung → dòng đầu bắt đầu ở đáy khung rồi trôi lên; đệm dưới = 1 khung.
  const translateY = viewH - offset;
  // Che trên/dưới bằng NỀN thẻ (mask cho chữ tan dần vào nền — tối/sáng tùy mode).
  // Vệt mờ đáy hẹp hơn đỉnh (8% vs 16%) vì dòng đầu nằm sát đáy.
  const maskCss = "linear-gradient(to bottom, transparent 0, #000 16%, #000 92%, transparent 100%)";

  const runRows = lines.map((ln, i) => (
    <div key={i} className="pb-2 text-center">
      <p className={cn("font-medium leading-relaxed", textCls)} style={{ fontSize: `${fontRem}rem`, ...shadow }}>
        {ln.text}
      </p>
      {showIpa && ln.ipa && (
        <p className={cn("mt-0.5 font-ipa", ipaCls)} style={{ fontSize: `${ipaRem}rem`, ...ipaStyle, ...shadow }}>
          {ln.ipa}
        </p>
      )}
    </div>
  ));

  return (
    <div className="relative flex h-full flex-col px-4 pt-2">
      <ReaderWatermark bg={bg} />
      {/* Giãn đầy card (mọi cỡ) để credits có nhiều dòng hiển thị. */}
      <div
        ref={viewRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ maskImage: maskCss, WebkitMaskImage: maskCss }}
      >
        <div
          ref={innerRef}
          className="will-change-transform"
          style={{ transform: `translateY(${translateY.toFixed(1)}px)` }}
        >
          <div ref={contentRef}>{runRows}</div>
        </div>
      </div>

      {/* Chỉ hiện nút khi CHẠY THỬ (đang ghi âm thì mic điều khiển, không cần nút). */}
      {preview && !recording && (
        <div className="flex shrink-0 items-center justify-center py-3">
          <button
            type="button"
            onClick={() => onPreviewChange(false)}
            className="flex items-center gap-1.5 rounded-full bg-slate-600 px-4 py-1.5 text-sm font-semibold text-white shadow transition hover:bg-slate-700"
          >
            <Pause className="size-4" /> {t("practice.record.stopPreview")}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Thân: chế độ IPA (câu + phiên âm dưới) ────────────────────────────────────
function IpaBody({
  lines,
  fontRem,
  bg,
  recording = false,
}: {
  lines: { text: string; ipa: string; vi?: string | null }[];
  fontRem: number;
  bg: BgTheme;
  recording?: boolean;
}) {
  const ipaRem = (fontRem * 0.78).toFixed(3);
  const { play, loading, speaking } = useWordSpeaker();
  const { textCls, ipaCls, ipaStyle, shadow } = bgText(bg);
  return (
    // Đang ghi (shadowing tắt) → logo MSY English ghim đỉnh như teleprompter; text đẩy xuống.
    <div className="relative flex min-h-0 flex-1 flex-col">
      {recording && <ReaderWatermark bg={bg} />}
      <div className={cn("min-h-0 flex-1 overflow-y-auto px-5 pb-4", recording ? "pt-16" : "pt-4", SCROLL_THIN)}>
      <div className="space-y-3">
        {lines.map((ln, i) => (
          <div key={i}>
            <p className={cn("leading-relaxed", textCls)} style={{ fontSize: `${fontRem}rem`, ...shadow }}>
              <ClickableWords text={ln.text} play={play} speaking={speaking} loading={loading} />
            </p>
            {ln.ipa && (
              <p className={cn("mt-0.5 font-ipa", ipaCls)} style={{ fontSize: `${ipaRem}rem`, ...ipaStyle, ...shadow }}>
                {ln.ipa}
              </p>
            )}
            {ln.vi && (
              <p className={cn("mt-0.5 italic opacity-80", ipaCls)} style={{ fontSize: `${ipaRem}rem`, ...ipaStyle, ...shadow }}>
                {ln.vi}
              </p>
            )}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

// ── Thân: đoạn văn thường — mỗi TỪ bấm được để NGHE PHÁT ÂM (TTS on-demand). ─
// Thay cho việc phải gen audio cả bài: học sinh thấy từ nào khó thì bấm để nghe từ đó.
function PlainBody({
  passage,
  fontRem,
  bg,
  recording = false,
}: {
  passage: string;
  fontRem: number;
  bg: BgTheme;
  recording?: boolean;
}) {
  const paragraphs = useMemo(() => splitParagraphs(passage), [passage]);
  const { play, loading, speaking } = useWordSpeaker();
  const { plain, shadow } = bgText(bg);

  return (
    // Đang ghi (shadowing tắt) → thay gợi ý "bấm từ để nghe" bằng logo MSY English ghim đỉnh
    // (như teleprompter), text đẩy xuống — đỡ rối lúc đang thu, giữ thương hiệu khi quay màn.
    <div className="relative flex min-h-0 flex-1 flex-col">
      {recording && <ReaderWatermark bg={bg} />}
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto px-5 pb-4 leading-loose",
          recording ? "pt-16" : "pt-4",
          plain && "text-slate-700 dark:text-slate-200",
          SCROLL_THIN,
        )}
        style={{ fontSize: `${fontRem}rem`, ...shadow }}
      >
        {!recording && (
          <p
            className={cn("mb-2 flex items-center justify-center gap-1", plain && "text-slate-400")}
            style={{ fontSize: "0.75rem", ...(plain ? undefined : { opacity: 0.75 }) }}
          >
            {t("practice.record.clickAnyWordToHear")} <Volume2 className="size-3.5" aria-hidden />
          </p>
        )}
        {paragraphs.map((sentences, pi) => (
          <p key={pi} className="mb-3 last:mb-0">
            {sentences.map((s, si) => (
              <ClickableWords key={si} text={s} play={play} speaking={speaking} loading={loading} />
            ))}
          </p>
        ))}
      </div>
    </div>
  );
}

// Tách 1 đoạn text thành TỪ (bấm để nghe) + phần còn lại (dấu câu/space giữ nguyên).
// split có capture group → phần tử index chẵn = ngoài-từ, lẻ = TỪ.
function ClickableWords({
  text,
  play,
  speaking,
  loading = null,
}: {
  text: string;
  play: (w: string) => void;
  speaking: string | null;
  loading?: string | null;
}) {
  const parts = text.split(/([A-Za-z][A-Za-z'’-]*)/);
  return (
    <>
      {parts.map((part, i) => {
        if (i % 2 === 0) return part ? <span key={i}>{part}</span> : null;
        const key = part.toLowerCase();
        const active = speaking === key || loading === key; // sáng ngay cả khi đang tải
        return (
          <span
            key={i}
            role="button"
            tabIndex={0}
            onClick={() => play(part)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && play(part)}
            className={cn(
              "cursor-pointer rounded px-0.5 transition-colors",
              active
                ? "bg-cyan-200 text-cyan-800 dark:bg-cyan-500/40 dark:text-cyan-100"
                : "hover:bg-cyan-50 hover:text-cyan-700 dark:hover:bg-cyan-500/15 dark:hover:text-cyan-200",
            )}
          >
            {part}
          </span>
        );
      })}
    </>
  );
}
