// Chọn GIỌNG PHÁT ÂM nam/nữ cho các nút nghe từ/câu on-demand
// (KHÔNG đổi giọng audio bài đọc/nghe đã gen sẵn — audio đó cố định theo bài).
// Lưu theo tài khoản (đệm localStorage) nên đổi ở một nơi là mọi nút phát âm dùng giọng mới.
import { Check } from "lucide-react";
import { cn } from "../../lib/utils";
import { useVoiceGender, type VoiceKind } from "../../lib/voiceGender";
import { Popover, PopoverItem } from "./popover";
import { t } from "../../i18n";

// Venus/Mars vẽ bằng SVG (lucide bản này chưa có) → render nhất quán mọi nền, KHÔNG lệch baseline
// như glyph ♀/♂ (iOS coi là emoji, đội xuống dưới), và tuân quy ước không emoji.
type IconProps = { className?: string };
function VenusIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="12" cy="9" r="5" />
      <path d="M12 14v7" />
      <path d="M9 18h6" />
    </svg>
  );
}
function MarsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M16 3h5v5" />
      <path d="m21 3-6.75 6.75" />
      <circle cx="10" cy="14" r="6" />
    </svg>
  );
}

// Hai lựa chọn giọng — icon tô màu (nữ hồng · nam xanh) để nhìn là biết ngay giọng đang dùng.
const VOICE_OPTS = [
  { id: "female" as const, label: "Female", Icon: VenusIcon, tone: "text-rose-500 dark:text-rose-400" },
  { id: "male" as const, label: "Male", Icon: MarsIcon, tone: "text-sky-500 dark:text-sky-400" },
];

export function VoiceGenderToggle({ className, kind = "word" }: { className?: string; kind?: VoiceKind }) {
  const [gender, setGender] = useVoiceGender(kind);
  const opts = [
    { id: "female" as const, label: t("shared.voiceGender.female"), Icon: VenusIcon },
    { id: "male" as const, label: t("shared.voiceGender.male"), Icon: MarsIcon },
  ];
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800",
        className,
      )}
      role="radiogroup"
      aria-label={t("shared.voiceGender.label")}
    >
      {opts.map(({ id, label, Icon }) => {
        const active = gender === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setGender(id)}
            className={cn(
              "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition",
              // Active: primary fill (cyan) for clear contrast.
              active
                ? "bg-cyan-500 text-white shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300",
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// Nút chọn giọng dạng POPOVER — trigger là icon ♀/♂ tô màu theo giọng đang chọn.
// "Mode dễ": chọn 1 giọng ở đây áp cho CẢ đọc-từ lẫn đọc-câu (đỡ nhầm 2 setting rời);
// ai cần tách riêng thì chỉnh ở trang hồ sơ. Dùng ở hero Vocabulary + chi tiết bộ + deck.
export function VoiceGenderPicker({ triggerClassName }: { triggerClassName?: string; kind?: VoiceKind }) {
  const [gender, setWord] = useVoiceGender("word");
  const [, setSentence] = useVoiceGender("sentence");
  const pick = (g: "female" | "male") => {
    setWord(g);
    setSentence(g); // áp luôn cho câu ví dụ → 1 lựa chọn = toàn bộ phát âm
  };
  const cur = VOICE_OPTS.find((o) => o.id === gender) ?? VOICE_OPTS[0];
  return (
    <Popover
      ariaLabel="Pronunciation voice"
      align="right"
      triggerClassName={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white transition hover:border-cyan-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-cyan-700",
        triggerClassName,
      )}
      trigger={<cur.Icon className={cn("size-5", cur.tone)} />}
    >
      {(close) => (
        <>
          <p className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Pronunciation voice</p>
          {VOICE_OPTS.map((o) => (
            <PopoverItem key={o.id} active={gender === o.id} onClick={() => { pick(o.id); close(); }}>
              <o.Icon className={cn("size-4", o.tone)} />
              {o.label}
              {gender === o.id && <Check className="ml-auto size-3.5" />}
            </PopoverItem>
          ))}
        </>
      )}
    </Popover>
  );
}
