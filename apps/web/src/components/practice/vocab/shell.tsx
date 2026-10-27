// UI primitives dùng chung cho MỌI template dạng luyện từ vựng — để các thẻ trông
// như một hệ thống thay vì mỗi dạng một kiểu.
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, ChevronLeft, ChevronRight, Loader2, Volume2, X } from "lucide-react";
import { useWordSpeaker } from "../../../lib/useWordSpeaker";
import { getVoiceGender, type VoiceKind } from "../../../lib/voiceGender";
import { Button } from "../../ui";
import { Tooltip } from "../../Tooltip";
import { KeyCombo, isTypingTarget } from "./hotkeys";
import { playChime } from "../../../lib/chime";
import { cn } from "../../../lib/utils";
import { t } from "../../../i18n";

/** Điều hướng thẻ (tiến/lùi) do DECK cấp — CardShell đặt nút ở HAI BÊN nút hành động (Kiểm tra). */
export type DeckNavValue = { pos: number; total: number; onPrev: () => void; onNext: () => void };
export const DeckNavContext = createContext<DeckNavValue | null>(null);

/** Sự kiện "phát lại audio thẻ" — hotkey bắn, SpeakButton autoPlay nghe rồi tự đọc lại. */
export const REPLAY_EVENT = "vocab:replay-audio";

/**
 * Hotkey của deck (gắn ở CardShell nên có trên mọi thẻ):
 *  • Ctrl/⌘ + → : thẻ sau · Ctrl/⌘ + ← : thẻ trước (điều hướng thủ công, không chấm)
 *  • Ctrl/⌘ + Space : phát lại audio thẻ hiện tại
 *  Chọn A/B/C/D vẫn do useChoiceKeys lo (phím trơn, không kèm Ctrl).
 */
export function useDeckHotkeys(nav: DeckNavValue | null) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (e.key === "ArrowRight") {
        if (nav && nav.pos < nav.total - 1) { e.preventDefault(); nav.onNext(); }
      } else if (e.key === "ArrowLeft") {
        if (nav && nav.pos > 0) { e.preventDefault(); nav.onPrev(); }
      } else if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        window.dispatchEvent(new Event(REPLAY_EVENT));
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [nav]);
}

/**
 * Kiểu khung đang dùng:
 *  • `drill` — tự luyện (/u/vocabulary): thẻ nổi, tự mang huy hiệu + câu dẫn.
 *  • `exercise` — LÀM BÀI TẬP (/u/practice): khung ngoài đã vẽ số thứ tự + đề bài như
 *    mọi dạng câu khác, nên CardShell bỏ hết vỏ của mình để khỏi lồng hai lớp thẻ.
 * Nhờ vậy 8 module dạng luyện KHÔNG phải sửa gì.
 */
export type DeckChrome = "drill" | "exercise";
export const DeckChromeContext = createContext<DeckChrome>("drill");
export const useDeckChrome = () => useContext(DeckChromeContext);

/** Standard card frame: activity badge + prompt + body + footer. */
export function CardShell({
  Icon, label, hint, tone, children, footer, hideNav = false,
}: {
  Icon: LucideIcon; label: string; hint: string; tone: string;
  children: React.ReactNode; footer?: React.ReactNode;
  /** Card builds its OWN prev/next buttons (Flashcard) → drop the shell's default nav. */
  hideNav?: boolean;
}) {
  const nav = useContext(DeckNavContext);
  useDeckHotkeys(nav); // Ctrl+arrows move between cards, Ctrl+Space replays the audio
  const showNav = !!nav && nav.total > 1 && !hideNav;
  // Footer row: [Back] [ action button / result ] [Next] — prev/next INLINE, same height as the action.
  const footerBar = footer || showNav ? (
    <div className="flex items-center gap-2">
      {showNav && (
        <Tooltip label={<span className="inline-flex items-center gap-1">{t("practice2.hotkeys.previous")} <KeyCombo keys={["Ctrl", "←"]} /></span>} hoverOnly>
          <Button variant="outline" size="lg" disabled={nav!.pos <= 0} onClick={nav!.onPrev} aria-label="Previous card">
            <ChevronLeft className="size-4" /><span className="hidden sm:inline">Back</span>
          </Button>
        </Tooltip>
      )}
      <div className="min-w-0 flex-1">{footer}</div>
      {showNav && (
        <Tooltip label={<span className="inline-flex items-center gap-1">{t("practice2.hotkeys.next")} <KeyCombo keys={["Ctrl", "→"]} /></span>} hoverOnly>
          <Button variant="outline" size="lg" disabled={nav!.pos >= nav!.total - 1} onClick={nav!.onNext} aria-label="Next card">
            <span className="hidden sm:inline">Next</span> <ChevronRight className="size-4" />
          </Button>
        </Tooltip>
      )}
    </div>
  ) : null;

  if (useDeckChrome() === "exercise") {
    return (
      <div className="flex w-full flex-col">
        {/* min-h keeps the height from jumping too much when switching between activities. */}
        <div className="flex min-h-[300px] flex-1 flex-col justify-center">{children}</div>
        {footerBar && <div className="mt-4">{footerBar}</div>}
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
        <span className={cn("flex size-7 items-center justify-center rounded-lg", tone)}>
          <Icon className="size-4" />
        </span>
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      <div className="flex min-h-[300px] flex-1 flex-col px-5 py-5">
        <p className="mb-4 text-center text-sm font-medium text-slate-500 dark:text-slate-400">{hint}</p>
        {children}
      </div>
      {footerBar && <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-800">{footerBar}</div>}
    </div>
  );
}

/** Cột sóng âm nhấp nhô khi đang phát (thay icon loa) — gợi ý "đang đọc". `compact` = khe hẹp (inline). */
function SoundBars({ lg, color = "bg-white", compact = false }: { lg: boolean; color?: string; compact?: boolean }) {
  const bars = [40, 70, 100, 70, 40];
  return (
    <span className={cn("flex items-end justify-center", compact ? "gap-0.5" : "gap-1 sm:gap-1.5")} style={{ height: lg ? 34 : 16 }}>
      {bars.map((h, i) => (
        <span
          key={i}
          className={cn("animate-bounce rounded-full", color, lg ? "w-1.5 sm:w-2" : "w-1")}
          style={{ height: `${h}%`, animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}

/**
 * Nút nghe. `size="lg"` cho thẻ lấy audio làm đề. `autoPlay` = tự phát khi thẻ hiện ra.
 * `variant="inline"` = icon trần cỡ chữ, đặt CẠNH từ khoá — TRUNG TÍNH khi rảnh, chỉ sáng
 * lúc đang phát (không giữ màu chính sau khi phát xong).
 */
export function SpeakButton({ word, size = "sm", autoPlay = false, variant = "solid", audio, kind = "word" }: {
  word: string; size?: "sm" | "md" | "lg"; autoPlay?: boolean; variant?: "solid" | "inline" | "framed";
  /** Pre-gen audio URLs by gender — play instantly, skip on-demand TTS. */
  audio?: { female?: string | null; male?: string | null };
  /** Voice track: "word" (default) or "sentence" — picks the matching account voice + audio variant. */
  kind?: VoiceKind;
}) {
  const { play, loading, speaking } = useWordSpeaker();
  const k = word.toLowerCase();
  const busy = loading === k;
  const on = speaking === k;
  const dim = size === "lg" ? "size-20" : size === "md" ? "size-14" : "size-10";
  const icon = size === "lg" ? "size-8" : size === "md" ? "size-6" : "size-4";
  const bigBars = size !== "sm";
  // Resolve the pre-gen URL for the CURRENT voice at call time (so live voice switches take effect).
  const speak = () => {
    const src = (getVoiceGender(kind) === "male" ? audio?.male : audio?.female) || undefined;
    // A sentence must never fall back to /word/speak (validates a single word) — no src → skip.
    if (kind === "sentence" && !src) return;
    play(word, { src });
  };
  // Tự phát khi thẻ mới hiện (đổi word = thẻ khác). Trễ 800ms để không "hụt" đầu từ + cho người
  // học kịp nhìn thẻ; hủy nếu thẻ lật/đổi trước khi kịp phát (khỏi đọc đè lên mặt kia).
  useEffect(() => {
    if (!autoPlay) return;
    const t = setTimeout(speak, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, word]);
  // Nút audio CHÍNH của thẻ (autoPlay) phát lại khi bấm hotkey Ctrl+Space.
  useEffect(() => {
    if (!autoPlay) return;
    const h = () => speak();
    window.addEventListener(REPLAY_EVENT, h);
    return () => window.removeEventListener(REPLAY_EVENT, h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlay, word, audio, kind]);
  // Hide a sentence speaker with no pre-gen audio (fallback path is word-only).
  if (kind === "sentence" && !audio?.male && !audio?.female) return null;

  // Tooltip on every speaker: what it does, plus the replay shortcut when this is the card's
  // main audio (the one Ctrl+Space targets).
  const tip = autoPlay ? (
    <span className="inline-flex items-center gap-1">{t("practice2.speech.replay")} <KeyCombo keys={["Ctrl", "Space"]} /></span>
  ) : (t("practice2.speech.replayPronunciation") as React.ReactNode);

  if (variant === "framed") {
    // Vòng gradient mảnh + TÂM TRẮNG (dark: nền tối) + quầng sáng — thanh lịch, không phủ đặc.
    return (
      <Tooltip label={tip} hoverOnly>
      <button type="button" onClick={speak} aria-label="Play audio" className="group relative z-10 shrink-0">
        <span aria-hidden className="absolute -inset-1.5 rounded-full bg-gradient-to-br from-cyan-400 to-teal-500 opacity-40 blur-lg transition group-hover:opacity-70" />
        <span className="relative block rounded-full bg-gradient-to-br from-cyan-400 via-cyan-500 to-teal-500 p-[2px] shadow-xl shadow-cyan-900/25">
          <span className="flex size-14 items-center justify-center rounded-full bg-white text-cyan-600 transition group-hover:bg-slate-50 dark:bg-slate-950 dark:text-cyan-300 dark:group-hover:bg-slate-900 sm:size-16">
            {busy ? <Loader2 className="size-6 animate-spin sm:size-7" /> : on ? <SoundBars lg color="bg-cyan-500 dark:bg-cyan-400" /> : <Volume2 className="size-6 sm:size-7" />}
          </span>
        </span>
      </button>
      </Tooltip>
    );
  }
  if (variant === "inline") {
    // Khung CỐ ĐỊNH size-8: icon và sóng âm cùng chiếm 1 ô → đổi qua lại KHÔNG xô chữ bên cạnh.
    return (
      <Tooltip label={tip} hoverOnly>
        <button
          type="button"
          onClick={speak}
          aria-label="Play audio"
          className={cn("inline-flex size-7 shrink-0 items-center justify-center align-middle transition",
            on ? "text-cyan-600 dark:text-cyan-400" : "text-slate-400 hover:text-cyan-600 dark:text-slate-500 dark:hover:text-cyan-400")}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : on ? <SoundBars lg={false} compact color="bg-cyan-500 dark:bg-cyan-400" /> : <Volume2 className="size-4" />}
        </button>
      </Tooltip>
    );
  }
  // NHẸ hơn (bỏ nền gradient đặc): vòng tròn tint cyan + icon cyan. Đang phát → dải SÓNG lan toả
  // (ping) + viền sáng, để "đơn giản mà vẫn nổi bật", không phủ kín màu chính.
  return (
    <span className={cn("relative inline-flex shrink-0 items-center justify-center", dim)}>
      {on && (
        <>
          <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-cyan-400/25" />
          <span className="pointer-events-none absolute inset-0 animate-ping rounded-full bg-cyan-400/15" style={{ animationDelay: "500ms" }} />
        </>
      )}
      <Tooltip label={tip} hoverOnly className="size-full">
      <button
        type="button"
        onClick={speak}
        aria-label="Play audio"
        className={cn(
          "relative flex size-full items-center justify-center rounded-full border transition active:scale-95",
          "border-cyan-200 bg-cyan-50 text-cyan-600 shadow-sm hover:bg-cyan-100 hover:shadow",
          "dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300 dark:hover:bg-cyan-500/20",
          on && "ring-2 ring-cyan-300/70 dark:ring-cyan-500/40",
        )}
      >
        {busy ? <Loader2 className={cn("animate-spin", icon)} /> : on ? <SoundBars lg={bigBars} color="bg-cyan-500 dark:bg-cyan-400" /> : <Volume2 className={icon} />}
      </button>
      </Tooltip>
    </span>
  );
}

/**
 * Từ khoá + loa INLINE: TỪ luôn căn giữa thẻ, loa "treo" absolute ở mép PHẢI của từ (không nằm
 * cùng nhóm căn giữa nên không kéo lệch trái). stopPropagation để bấm loa không kích hoạt vùng bao.
 */
/** Pre-gen word audio URLs by gender — forwarded to SpeakButton to skip on-demand TTS. */
export type WordAudio = { female?: string | null; male?: string | null };

export function WordHead({ word, ipa, pos, autoPlay = false, audio }: { word: string; ipa?: string | null; pos?: string | null; autoPlay?: boolean; audio?: WordAudio }) {
  return (
    <div className="text-center">
      <span className="relative inline-block">
        <span className="text-3xl font-extrabold leading-tight text-slate-900 dark:text-white">{word}</span>
        <span className="absolute left-full top-1/2 ml-2 -translate-y-1/2" onClick={(e) => e.stopPropagation()}>
          <SpeakButton word={word} autoPlay={autoPlay} variant="inline" audio={audio} />
        </span>
      </span>
      {(pos || ipa) && (
        <p className="mt-1 flex items-center justify-center gap-2 text-sm">
          {pos && <span className="text-slate-400">({pos})</span>}
          {ipa && <span className="font-ipa text-cyan-600 dark:text-cyan-400">{ipa}</span>}
        </p>
      )}
    </div>
  );
}

// Sóng nền: nhiều cột flex-1 (trải đều mép-đến-mép), cao thấp hữu cơ theo sin.
const WAVE = Array.from({ length: 56 }, (_, i) => {
  const v = Math.abs(Math.sin(i * 1.7) * 0.55 + Math.sin(i * 0.55) * 0.45);
  return 16 + 84 * v;
});
// Màu từng cột: nội suy cyan(6,182,212) → teal(20,184,166) ngang dải (đúng tông thương hiệu).
function waveColor(t: number): string {
  const r = Math.round(6 + (20 - 6) * t), g = Math.round(182 + (184 - 182) * t), b = Math.round(212 + (166 - 212) * t);
  return `rgb(${r} ${g} ${b})`;
}

/**
 * "Bệ" phát âm (học theo dải audio bài video dictation): nền gradient DỊU + chấm bi mờ +
 * SÓNG chìm (mờ, blur nhẹ, fade hai mép) + nút play kiểu framed. Trang trí, không chói.
 */
export function AudioPrompt({ word, autoPlay = false, className, audio }: { word: string; autoPlay?: boolean; className?: string; audio?: WordAudio }) {
  return (
    <div className={cn("relative flex items-center justify-center overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-br from-cyan-50/70 via-white to-teal-50/50 py-7 dark:border-slate-800/70 dark:from-cyan-950/40 dark:via-slate-900 dark:to-teal-950/30", className)}>
      {/* chấm bi mờ */}
      <span aria-hidden className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(148,163,184,0.13)_1px,transparent_1.5px)] [background-size:15px_15px]" />
      {/* sóng — cột flex-1, fade hai mép, mờ */}
      <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center gap-[5px] px-5 blur-[0.3px] [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)] sm:gap-[6px]">
        {WAVE.map((h, i) => (
          <span key={i} className="flex-1 rounded-full" style={{ height: `${h}%`, backgroundColor: waveColor(i / (WAVE.length - 1)), opacity: 0.05 + 0.12 * (h / 100) }} />
        ))}
      </span>
      <SpeakButton word={word} autoPlay={autoPlay} variant="framed" audio={audio} />
    </div>
  );
}

/** Từ hiển thị to ở giữa thẻ (kèm IPA nếu có). */
export function WordDisplay({ word, ipa, pos, sub }: {
  word: string; ipa?: string | null; pos?: string | null; sub?: string;
}) {
  return (
    <div className="text-center">
      <p className="text-3xl font-extrabold leading-tight text-slate-900 dark:text-white">{word}</p>
      <p className="mt-1 flex items-center justify-center gap-2 text-sm">
        {pos && <span className="text-slate-400">({pos})</span>}
        {ipa && <span className="font-ipa text-cyan-600 dark:text-cyan-400">{ipa}</span>}
      </p>
      {sub && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  );
}

type OptState = "idle" | "correct" | "wrong" | "muted";
/** 1 lựa chọn trắc nghiệm (có phím tắt A/B/C/D). */
export function ChoiceRow({ index, text, state, disabled, onClick }: {
  index: number; text: string; state: OptState; disabled?: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border-2 px-4 py-3 text-left text-[15px] leading-snug transition",
        state === "idle" && "border-slate-200 hover:border-cyan-300 hover:bg-cyan-50/50 dark:border-slate-700 dark:hover:border-cyan-700 dark:hover:bg-cyan-500/10",
        state === "correct" && "border-emerald-400 bg-emerald-50 font-semibold text-emerald-700 dark:border-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300",
        state === "wrong" && "border-rose-400 bg-rose-50 font-semibold text-rose-700 dark:border-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
        state === "muted" && "border-slate-200 opacity-45 dark:border-slate-700",
      )}
    >
      <span className={cn(
        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold",
        state === "correct" ? "border-emerald-400 bg-emerald-400 text-white"
          : state === "wrong" ? "border-rose-400 bg-rose-400 text-white"
          : "border-slate-200 text-slate-400 dark:border-slate-600",
      )}>
        {state === "correct" ? <Check className="size-4" /> : state === "wrong" ? <X className="size-4" /> : "ABCD"[index] ?? index + 1}
      </span>
      <span className="min-w-0 flex-1 break-words pt-0.5">{text}</span>
    </button>
  );
}

/**
 * Ô điền TỪNG CHỮ (học theo Dictation câu): mỗi ký tự 1 ô, gõ tới đâu xanh/đỏ tới đó. Ký tự
 * KHÔNG phải chữ/số (khoảng trắng, '-', ') tự hiện, không cần gõ. `hint` lộ chữ CÁI đầu.
 * Input trong suốt phủ trên (giữ caret + bàn phím); overlay hiện các ô, căn theo letter-spacing chung.
 */
export function LetterBoxes({
  target, value, onChange, state, hint = false, autoFocus = false, onEnter,
}: {
  target: string; value: string; onChange: (v: string) => void;
  state: "idle" | "correct" | "wrong"; hint?: boolean; autoFocus?: boolean; onEnter?: () => void;
}) {
  const core = target;
  const typable = (ch: string) => /[A-Za-z0-9]/.test(ch);
  const maxLetters = Array.from(core).filter(typable).length;
  // Cờ ĐANG SOẠN của IME (Unikey/gõ tiếng Việt): trong lúc soạn KHÔNG viết đè `value` để bộ gõ
  // không lệch buffer (nếu không → gõ sai xoá không hết, lùi không được). Đồng bộ khi soạn xong.
  const composing = useRef(false);
  // Dựng value bám cấu trúc core: user chỉ gõ CHỮ/SỐ, ký tự phụ (space, ', -) tự chèn đúng chỗ.
  // BỎ DẤU trước (NFD → gỡ dấu tổ hợp): gõ dưới bộ tiếng Việt "ê/ô…" vẫn về "e/o" thay vì mất chữ.
  const clean = (v: string) => {
    const ls = v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]/g, "").split("");
    let out = "", li = 0;
    for (const ch of core) {
      if (typable(ch)) { if (li >= ls.length) break; out += ls[li++]; }
      else if (li < ls.length) out += ch; else break;
    }
    return out;
  };
  // Chữ đã gõ (ASCII) rút từ value hiện tại — để xử lý phím trực tiếp.
  const letters = () => Array.from(value).filter(typable);

  // Gõ ASCII qua keydown + preventDefault: khi bộ gõ TV TẮT, ký tự đi thẳng, KHÔNG để Unikey gộp
  // ("oo"->"ô" làm mất chữ). Khi IME đang soạn (keyCode 229 / isComposing) thì để bộ gõ tự lo —
  // ta chỉ đồng bộ ở onChange/compositionEnd (đỡ kẹt buffer).
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const ime = composing.current || e.nativeEvent.isComposing || e.keyCode === 229;
    if (e.key === "Enter") {
      if (!ime && state === "idle" && onEnter) { e.preventDefault(); onEnter(); }
      return;
    }
    if (state !== "idle" || ime || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Backspace") {
      e.preventDefault();
      onChange(clean(letters().slice(0, -1).join("")));
    } else if (e.key.length === 1 && /[A-Za-z0-9]/.test(e.key)) {
      e.preventDefault();
      const ls = letters();
      if (ls.length < maxLetters) onChange(clean([...ls, e.key].join("")));
    }
  };

  const cells = Array.from({ length: core.length }, (_, i) => {
    const c = core[i];
    if (!typable(c)) return <span key={i} className="text-slate-400 dark:text-slate-500">{c === " " ? " " : c}</span>;
    if (i < value.length) {
      const good = value[i].toLowerCase() === c.toLowerCase();
      return <span key={i} className={good ? "text-emerald-500" : "text-rose-500"}>{value[i]}</span>;
    }
    const reveal = hint && i === 0;
    return <span key={i} className={reveal ? "text-amber-400" : "text-slate-300 dark:text-slate-600"}>{reveal ? c : "•"}</span>;
  });
  const LS = "0.4em"; // khoảng cách giữa các ô — cùng giá trị cho input & overlay để caret khớp
  return (
    <div className="flex justify-center">
      <div className="relative inline-block">
        <input
          autoFocus={autoFocus}
          value={value}
          readOnly={state !== "idle"}
          onKeyDown={onKeyDown}
          onCompositionStart={() => { composing.current = true; }}
          onCompositionEnd={(e) => { composing.current = false; onChange(clean(e.currentTarget.value)); }}
          onChange={(e) => { if (!composing.current) onChange(clean(e.target.value)); }}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          inputMode="text"
          lang="en"
          style={{ width: `calc(${core.length}ch + ${core.length} * ${LS})`, letterSpacing: LS }}
          className="block bg-transparent py-2 text-left font-mono text-3xl font-bold text-transparent caret-cyan-500 outline-none"
        />
        <span aria-hidden style={{ letterSpacing: LS }} className="pointer-events-none absolute inset-0 flex items-center font-mono text-3xl font-bold">{cells}</span>
        <span aria-hidden className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-[2px] rounded-full transition",
          state === "correct" ? "bg-emerald-500" : state === "wrong" ? "bg-rose-500" : "bg-gradient-to-r from-cyan-500 to-cyan-300")} />
      </div>
    </div>
  );
}

/**
 * Compact result pill sized to replace the Check button in the footer (Back | result | Next) —
 * for batch-graded cards (match pairs, sort) so the verdict doesn't add a full-width bar.
 */
export function FooterResult({ ok, answer }: { ok: boolean; answer?: React.ReactNode }) {
  return (
    <div className={cn(
      "flex h-11 w-full items-center justify-center gap-2 truncate rounded-xl px-3 text-sm font-bold",
      ok ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
         : "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    )}>
      {ok ? <><Check className="size-4" /> Correct!</> : <><X className="size-4 shrink-0" /> {answer}</>}
    </div>
  );
}

/** Hotkeys 1..9 / a..d for multiple-choice cards. */
export function useChoiceKeys(count: number, onPick: (i: number) => void, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const h = (e: KeyboardEvent) => {
      // Never while typing, and never as half of a deck shortcut.
      if (e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const n = Number(e.key);
      if (n >= 1 && n <= count) return onPick(n - 1);
      const i = "abcd".indexOf(e.key.toLowerCase());
      if (i >= 0 && i < count) onPick(i);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [count, onPick, active]);
}

/**
 * Short pause before moving on, so the learner can read the verdict.
 * Every activity gets EXTRA_DWELL_MS on top of the delay it asks for: the cards were flipping past
 * before the answer had been read. One place to tune, rather than eleven call sites.
 */
const EXTRA_DWELL_MS = 1000;
/** Let the verdict tone land before the word is spoken over it. */
const CHIME_GAP_MS = 450;

export function useAutoNext() {
  const [pending, setPending] = useState(false);
  const { play } = useWordSpeaker();

  /**
   * `chime` plays the right/wrong tone at once. `say` then speaks the word itself and waits for it
   * to finish before the card's own dwell starts — on a card where the learner WROTE the word,
   * hearing it right after is the moment the spelling and the sound get tied together.
   */
  const run = (
    fn: () => void,
    ms: number,
    opts?: { chime?: "right" | "wrong"; say?: { word: string; audio?: WordAudio } },
  ) => {
    setPending(true);
    if (opts?.chime) playChime(opts.chime);
    const go = () => { setPending(false); fn(); };
    if (!opts?.say) {
      setTimeout(go, ms + EXTRA_DWELL_MS);
      return;
    }
    const { word, audio } = opts.say;
    setTimeout(() => {
      const src = (getVoiceGender("word") === "male" ? audio?.male : audio?.female) || undefined;
      void play(word, { src, until: "end" }).then(() => setTimeout(go, ms));
    }, CHIME_GAP_MS);
  };
  return { pending, run };
}
