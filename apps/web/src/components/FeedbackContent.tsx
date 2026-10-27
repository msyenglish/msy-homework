import { Fragment, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Dumbbell, Rocket } from "lucide-react";
import { cn } from "../lib/utils";

// Nhận xét của cô — render giàu định dạng từ text markdown-NHẸ mà prompt sinh ra:
//  • **đậm**  → chip màu (thường là TỪ/CẤU TRÚC tiếng Anh cô nhấn) để mắt bắt ngay.
//  • dòng nhãn "Cần sửa:" / "Luyện tiếp:" / "Làm tốt:" / "Thử thách…:" → tiêu đề có icon + màu.
//  • dòng bắt đầu "- " → gạch đầu dòng.
// KHÔNG dùng dangerouslySetInnerHTML / HTML thô từ AI (tránh XSS) — chỉ nhận diện cú pháp an toàn.

type Tone = "amber" | "emerald" | "cyan" | "violet";

const TONE: Record<Tone, { heading: string; dot: string }> = {
  amber: { heading: "text-amber-700 dark:text-amber-400", dot: "bg-amber-400" },
  emerald: { heading: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-400" },
  cyan: { heading: "text-cyan-700 dark:text-cyan-300", dot: "bg-cyan-400" },
  violet: { heading: "text-violet-700 dark:text-violet-400", dot: "bg-violet-400" },
};

const LABELS: { re: RegExp; icon: typeof AlertTriangle; tone: Tone }[] = [
  { re: /^(c\u1ea7n s\u1eeda|c\u1ea7n ch\u00fa \u00fd|l\u1ed7i c\u1ea7n s\u1eeda)\s*:/i, icon: AlertTriangle, tone: "amber" },
  { re: /^(l\u00e0m t\u1ed1t|\u0111i\u1ec3m m\u1ea1nh|l\u00e0m r\u1ea5t t\u1ed1t)\s*:/i, icon: CheckCircle2, tone: "emerald" },
  { re: /^(luy\u1ec7n ti\u1ebfp|g\u1ee3i \u00fd luy\u1ec7n t\u1eadp|luy\u1ec7n t\u1eadp)\s*:/i, icon: Dumbbell, tone: "cyan" },
  { re: /^(th\u1eed th\u00e1ch[^:]*)\s*:/i, icon: Rocket, tone: "violet" },
];

/** Tách **đậm** thành chip màu; phần còn lại là text thường. */
function renderInline(text: string, key: string): ReactNode {
  const parts = text.split(/\*\*(.+?)\*\*/g); // odd index = nội dung trong **…**
  return parts.map((p, i) =>
    i % 2 === 1 ? (
      <strong
        key={`${key}-b${i}`}
        className="rounded bg-cyan-100/70 px-1 font-semibold text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
      >
        {p}
      </strong>
    ) : (
      <Fragment key={`${key}-t${i}`}>{p}</Fragment>
    ),
  );
}

export function FeedbackContent({ text, className }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n{2,}/);

  return (
    <div className={cn("space-y-3 text-[15px] leading-relaxed text-slate-700 dark:text-slate-100", className)}>
      {blocks.map((block, bi) => {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        if (!lines.length) return null;

        // Nhãn dẫn đầu block (Cần sửa / Luyện tiếp …) → tiêu đề có icon + màu.
        const first = lines[0];
        const label = LABELS.find((l) => l.re.test(first));
        const tone = label?.tone ?? "cyan";
        let body = lines;
        let heading: ReactNode = null;
        if (label) {
          const Icon = label.icon;
          const m = first.match(/^([^:]+:)\s*(.*)$/);
          heading = (
            <div className={cn("flex items-center gap-1.5 font-bold", TONE[tone].heading)}>
              <Icon className="size-4 shrink-0" />
              <span>{m?.[1] ?? first}</span>
            </div>
          );
          const rest = m?.[2]?.trim();
          body = rest ? [rest, ...lines.slice(1)] : lines.slice(1);
        }

        const bullets = body.filter((l) => /^[-•]\s+/.test(l));
        const paras = body.filter((l) => !/^[-•]\s+/.test(l));

        return (
          <div key={`fb-${bi}`} className={label ? "space-y-1.5" : undefined}>
            {heading}
            {paras.map((p, pi) => (
              <p key={`fb-${bi}-p${pi}`}>{renderInline(p, `fb-${bi}-p${pi}`)}</p>
            ))}
            {bullets.length > 0 && (
              <ul className="space-y-1">
                {bullets.map((b, li) => (
                  <li key={`fb-${bi}-l${li}`} className="flex gap-2">
                    <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", TONE[tone].dot)} />
                    <span>{renderInline(b.replace(/^[-•]\s+/, ""), `fb-${bi}-l${li}`)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
