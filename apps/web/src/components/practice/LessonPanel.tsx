import { useEffect, useMemo, useState } from "react";
import { BookOpen, ChevronDown, Headphones, Languages, SpellCheck2 } from "lucide-react";
import type { IpaLine } from "@msyen/shared";
import type { AudioCuesResp } from "../../lib/api";
import { AudioPlayer } from "../AudioPlayer";
import { useStuckCollapse } from "../../lib/useStuckCollapse";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";
import { confirmAsk } from "../confirm";

// Nhớ lựa chọn tab Đọc/Nghe của bài học (giữ qua F5).
const MODE_KEY = "lesson:mode";

// Tách câu + khớp IPA/dịch (đồng bộ PassagePanel): bỏ nhãn vai, chuẩn hoá còn chữ+số thường.
const SPEAKER_LABEL_RE = /^\s*[A-Za-z][\w .'()-]{0,22}:\s+/;
const normSent = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const splitSentences = (p: string) => (p.match(/[^.!?…\n]+[.!?…]*/g) ?? []).map((s) => s.trim()).filter(Boolean);

// Bài học "read-along" (skill=mixed): MỘT đoạn văn = nguồn cho cả ĐỌC lẫn NGHE.
//  • Nghe (mặc định) → AUDIO là chính; text co về caption 1 dòng chạy theo keyword
//    (phụ đề karaoke của AudioPlayer). Thu gọn ở tab này do USER tự bấm (không tự động).
//  • Đọc → hiện full đoạn văn; sticky dính top thì TỰ thu gọn để thấy câu hỏi.
// Bất biến: cues.text === passage.
export function LessonPanel({
  passage,
  audioUrl,
  cues,
  className,
  ipaLines,
  onUseTranslation,
}: {
  passage: string;
  audioUrl?: string | null;
  cues?: AudioCuesResp | null;
  className?: string;
  ipaLines?: IpaLine[] | null;
  onUseTranslation?: () => void;
}) {
  const canListen = !!audioUrl;
  // Tab ĐỌC: công tắc IPA (tự do) + DỊCH (opt-in TRỪ điểm — bài tổng hợp là checkpoint). Như PassagePanel.
  const infoByText = useMemo(() => {
    const m = new Map<string, { ipa: string; vi?: string | null }>();
    for (const l of ipaLines ?? []) {
      const key = normSent(l.text.replace(SPEAKER_LABEL_RE, ""));
      if (key && !m.has(key)) m.set(key, { ipa: l.ipa, vi: l.vi });
    }
    return m;
  }, [ipaLines]);
  const hasIpa = useMemo(() => (ipaLines ?? []).some((l) => l.ipa), [ipaLines]);
  const hasVi = useMemo(() => (ipaLines ?? []).some((l) => l.vi), [ipaLines]);
  const sentences = useMemo(() => splitSentences(passage), [passage]);
  const [showIpa, setShowIpa] = useState(false);
  const [showVi, setShowVi] = useState(false);
  // Mặc định TAB NGHE là chính (nếu có audio); nhớ qua localStorage.
  const [mode, setMode] = useState<"read" | "listen">(() => {
    if (typeof localStorage !== "undefined" && localStorage.getItem(MODE_KEY) === "read") return "read";
    return canListen ? "listen" : "read";
  });
  const listening = mode === "listen" && canListen;
  // Tự thu gọn khi dính top CHỈ ở chế độ Đọc; Nghe thì user tự chủ động (enabled=false).
  const { sentinelRef, panelRef, expanded, setExpanded, reservedHeight } = useStuckCollapse({ enabled: !listening });

  function pickMode(m: "read" | "listen") {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* bỏ qua nếu bị chặn */
    }
    if (m === "listen") setExpanded(true); // Nghe mặc định mở
  }
  // Nếu bài không có audio mà localStorage lưu "listen" → ép về read.
  useEffect(() => {
    if (!canListen && mode === "listen") setMode("read");
  }, [canListen, mode]);

  return (
    <>
      {/* Mốc phát hiện dính-sticky — con TRỰC TIẾP của cột cao (như panel) */}
      <div ref={sentinelRef} aria-hidden className="h-0" />
      <div
        ref={panelRef}
        className={cn(
          "sticky top-0 z-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-md dark:border-slate-800 dark:bg-slate-900",
          "max-sm:-mx-3 max-sm:rounded-none max-sm:border-x-0 max-sm:border-t-0 max-sm:shadow-none",
          className,
        )}
      >
        {/* Thanh tiêu đề: badge · (phải) nút thu gọn + toggle Đọc/Nghe */}
        <div
          className={cn(
            "relative flex items-center gap-2 overflow-hidden bg-gradient-to-r from-cyan-50 via-white to-white px-4 py-3 dark:from-cyan-950/50 dark:via-slate-800/70 dark:to-slate-800/70",
            expanded && "border-b border-slate-200 dark:border-slate-700/70",
          )}
        >
          {/* Họa tiết chấm mờ */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 text-cyan-500/15 dark:text-cyan-400/10"
            style={{ backgroundImage: "radial-gradient(currentColor 1px, transparent 1px)", backgroundSize: "11px 11px" }}
          />
          <span className="relative flex size-6 items-center justify-center rounded-md bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
            {listening ? <Headphones className="size-3.5" /> : <BookOpen className="size-3.5" />}
          </span>
          <span className="relative text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            {t("practice2.lesson.title")}
          </span>

          {/* Cụm phải: nút thu gọn (áp cả 2 tab) · toggle Đọc/Nghe — thứ tự ổn định */}
          <div className="relative ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="flex h-9 shrink-0 items-center gap-1 rounded-xl px-3 text-xs font-semibold text-cyan-600 transition hover:bg-cyan-50 dark:text-cyan-400 dark:hover:bg-cyan-500/10"
            >
              {expanded ? t("practice2.lesson.collapse") : t("practice2.lesson.expand")}
              <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} />
            </button>

            {canListen && (
              <div className="inline-flex h-9 shrink-0 items-center rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900">
                {(
                  [
                    ["listen", t("practice2.lesson.listen"), <Headphones key="l" className="size-4" />],
                    ["read", t("practice2.lesson.read"), <BookOpen key="r" className="size-4" />],
                  ] as const
                ).map(([v, lbl, ic]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => pickMode(v)}
                    className={cn(
                      "inline-flex h-7 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition",
                      mode === v
                        ? "bg-cyan-500 text-white shadow-sm shadow-cyan-500/30"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
                    )}
                  >
                    {ic} {lbl}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Chế độ NGHE: audio là chính + caption 1 dòng chạy theo keyword */}
        {expanded && listening && audioUrl && (
          <div className="px-4 py-3">
            <AudioPlayer src={audioUrl} cues={cues} bare noMotif />
          </div>
        )}

        {/* Chế độ ĐỌC: full đoạn văn; chữ to, giữ đoạn, cuộn riêng nếu dài. Có công tắc IPA/Dịch. */}
        {expanded && !listening && (
          <div className="max-h-[46vh] overflow-auto px-5 py-4 text-base leading-loose text-slate-700 sm:text-lg dark:text-slate-200">
            {(hasIpa || hasVi) && (
              <div className="mb-3 flex items-center gap-2">
                {hasIpa && (
                  <button
                    type="button"
                    onClick={() => setShowIpa((v) => !v)}
                    aria-pressed={showIpa}
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition",
                      showIpa
                        ? "border border-cyan-300 bg-cyan-50 text-cyan-700 dark:border-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                        : "text-slate-500 hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-300",
                    )}
                  >
                    <SpellCheck2 className="size-3.5" /> IPA
                  </button>
                )}
                {hasVi && (
                  <button
                    type="button"
                    onClick={async () => {
                      if (showVi) return; // MỘT CHIỀU: bật rồi không tắt (chống bật-tắt lách điểm)
                      const ok = await confirmAsk({
                        title: t("practice2.lesson.translationTitle"),
                        message: t("practice2.lesson.translationMessage"),
                        confirmText: t("practice2.lesson.enableTranslation"),
                        cancelText: t("practice2.lesson.no"),
                        danger: true,
                      });
                      if (!ok) return;
                      onUseTranslation?.();
                      setShowVi(true);
                    }}
                    aria-pressed={showVi}
                    className={cn(
                      "flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition",
                      showVi
                        ? "cursor-default border border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
                        : "text-slate-500 hover:text-amber-600 dark:text-slate-400 dark:hover:text-amber-300",
                    )}
                  >
                    <Languages className="size-3.5" /> {t(showVi ? "practice2.lesson.translating" : "practice2.lesson.translate")}
                  </button>
                )}
              </div>
            )}
            {showIpa || showVi ? (
              <div className="space-y-2">
                {sentences.map((s, i) => {
                  const info = infoByText.get(normSent(s.replace(SPEAKER_LABEL_RE, "")));
                  return (
                    <div key={i}>
                      <span className="text-slate-800 dark:text-slate-100">{s}</span>
                      {showIpa && info?.ipa && (
                        <span className="mt-0.5 block font-ipa text-sm text-cyan-600 dark:text-cyan-400">{info.ipa}</span>
                      )}
                      {showVi && info?.vi && (
                        <span className="mt-0.5 block text-sm italic text-amber-700/90 dark:text-amber-300/90">{info.vi}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="whitespace-pre-wrap">{passage}</p>
            )}
          </div>
        )}
      </div>
      {/* Spacer DÀNH CHỖ khi thu gọn — SIBLING (không bọc panel → sticky vẫn trượt) */}
      {reservedHeight ? <div aria-hidden style={{ height: reservedHeight }} /> : null}
    </>
  );
}
