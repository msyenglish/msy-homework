import type { ReactNode } from "react";

// Render văn bản "markdown nhẹ" của AI (báo cáo tháng, nhận xét bài) thành bố cục rõ ràng:
//  • Tách đoạn theo dòng trống, nhận diện tiêu đề mục ("Tiêu đề:" / "1. Tiêu đề").
//  • Gom gạch đầu dòng → danh sách; dòng đánh số → danh sách số.
//  • Inline: **đậm** và nhãn "Nhãn:" ở đầu câu được in đậm để nhấn mạnh.

// Cho phép TUỲ BIẾN cách render đoạn **đậm** (vd nhận xét đọc to tô màu từ theo điểm).
// Trả về ReactNode; nhận (nội dung bên trong **, key). Mặc định = in đậm thường.
export type RenderStrong = (inner: string, key: number) => ReactNode;

// Tô đoạn nằm trong "..." — ở nhận xét bài NÓI đây gần như luôn là TIẾNG ANH cần để ý
// (câu em nói sai vs câu nên nói, từ dùng tốt). Bật bằng prop highlightQuotes; mặc định TẮT
// để báo cáo tháng/nhận xét khác không bị tô lung tung. Nhận cả nháy thẳng "..." lẫn cong “...”.
function renderQuoted(text: string, key: number): ReactNode {
  const parts = text.split(/("[^"\n]+"|“[^”\n]+”)/g).filter(Boolean);
  if (parts.length === 1) return <span key={key}>{text}</span>;
  return (
    <span key={key}>
      {parts.map((p, i) =>
        /^["“][^"”]+["”]$/.test(p) ? (
          <b key={i} className="font-semibold text-indigo-700 dark:text-indigo-300">
            {p}
          </b>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

// Inline: hỗ trợ **đậm** ở bất kỳ đâu; nếu không có **, in đậm nhãn "Label:" đầu câu.
export function renderInline(text: string, renderStrong?: RenderStrong, quotes?: boolean): ReactNode {
  const plain = (s: string, key: number): ReactNode => (quotes ? renderQuoted(s, key) : <span key={key}>{s}</span>);
  if (text.includes("**")) {
    const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
    return (
      <>
        {parts.map((p, i) =>
          /^\*\*[^*]+\*\*$/.test(p) ? (
            renderStrong ? (
              renderStrong(p.slice(2, -2), i)
            ) : (
              <strong key={i} className="font-semibold text-slate-800 dark:text-slate-100">
                {p.slice(2, -2)}
              </strong>
            )
          ) : (
            plain(p, i)
          ),
        )}
      </>
    );
  }
  const m = text.match(/^([^:]{2,28}):\s+(.+)$/);
  if (m) {
    return (
      <>
        <span className="font-semibold text-slate-800 dark:text-slate-100">{m[1]}:</span> {plain(m[2], 0)}
      </>
    );
  }
  return quotes ? renderQuoted(text, 0) : text;
}

// Render các dòng trong một mục: gom gạch đầu dòng → <ul>, dòng đánh số → <ol>, còn lại → <p>.
export function renderLines(lines: string[], renderStrong?: RenderStrong, quotes?: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const L = list;
    out.push(
      <ul key={`l${out.length}`} className="space-y-1.5">
        {L.items.map((it, j) => (
          <li key={j} className="flex gap-2.5">
            {L.type === "ol" ? (
              <span className="shrink-0 font-bold text-cyan-600 dark:text-cyan-400">{j + 1}.</span>
            ) : (
              <span className="mt-[9px] size-1.5 shrink-0 rounded-full bg-cyan-500 dark:bg-cyan-400" />
            )}
            <span>{renderInline(it, renderStrong, quotes)}</span>
          </li>
        ))}
      </ul>,
    );
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const bullet = line.match(/^[-•*]\s+(.*)/);
    const num = line.match(/^\d+[.)]\s+(.*)/);
    if (bullet) {
      if (list?.type !== "ul") flush(), (list = { type: "ul", items: [] });
      list.items.push(bullet[1]);
    } else if (num) {
      if (list?.type !== "ol") flush(), (list = { type: "ol", items: [] });
      list.items.push(num[1]);
    } else {
      flush();
      out.push(<p key={`p${out.length}`}>{renderInline(line, renderStrong, quotes)}</p>);
    }
  }
  flush();
  return out;
}

// Tách văn bản thành các mục: dòng "Tiêu đề:" đứng riêng → tiêu đề phụ + nội dung có cấu trúc.
export function Narrative({
  content,
  className,
  renderStrong,
  highlightQuotes,
}: {
  content: string;
  className?: string;
  renderStrong?: RenderStrong;
  highlightQuotes?: boolean; // tô đậm + đổi màu các đoạn trong "..." (câu/từ tiếng Anh cần để ý)
}) {
  const blocks = content
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <div className={className ?? "space-y-4 text-[15px] leading-relaxed text-slate-700 dark:text-slate-300"}>
      {blocks.map((block, i) => {
        const nl = block.indexOf("\n");
        const head = (nl === -1 ? block : block.slice(0, nl)).trim();
        const rest = nl === -1 ? "" : block.slice(nl + 1);
        // Tiêu đề mục: dòng ngắn có nội dung theo sau, kết thúc bằng ':' HOẶC dạng "1. Tiêu đề"
        // (nhận cả báo cáo cũ dùng số thứ tự, lẫn báo cáo mới dùng dấu hai chấm).
        const isHeading =
          rest.trim().length > 0 && head.length <= 42 && (/:$/.test(head) || /^\d+[.)]\s+\S/.test(head));
        if (isHeading) {
          const title = head.replace(/^\d+[.)]\s+/, "").replace(/:$/, "");
          return (
            <section key={i} className="space-y-1.5">
              <h3 className="text-sm font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-400">{title}</h3>
              <div className="space-y-1.5">{renderLines(rest.split("\n"), renderStrong, highlightQuotes)}</div>
            </section>
          );
        }
        return (
          <div key={i} className="space-y-1.5">
            {renderLines(block.split("\n"), renderStrong, highlightQuotes)}
          </div>
        );
      })}
    </div>
  );
}
