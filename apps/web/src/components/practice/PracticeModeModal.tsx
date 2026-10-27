// Modal chọn cách luyện cho bài Nghe & Nói (mở từ card thư viện): 2 chế độ dạng icon-thumb + title + mô tả.
// Bấm Dictation → step chọn độ khó (Easy/Medium/Hard); Shadowing → vào thẳng.
import { useState } from "react";
import { PenLine, Mic, ChevronRight, ArrowLeft, X } from "lucide-react";
import type { VideoMode } from "@msyen/shared";

export type DictLevel = "easy" | "medium" | "hard" | "hardest";
const LEVELS: { id: DictLevel; label: string; hint: string; cls: string }[] = [
  { id: "easy", label: "Easy", hint: "2 blanks", cls: "border-emerald-200 bg-emerald-50/60 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20" },
  { id: "medium", label: "Medium", hint: "4 blanks", cls: "border-amber-200 bg-amber-50/60 text-amber-700 hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300 dark:hover:bg-amber-500/20" },
  { id: "hard", label: "Hard", hint: "whole line", cls: "border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20" },
  { id: "hardest", label: "Hardest", hint: "type it all", cls: "border-fuchsia-200 bg-fuchsia-50/60 text-fuchsia-700 hover:bg-fuchsia-100 dark:border-fuchsia-500/30 dark:bg-fuchsia-500/10 dark:text-fuchsia-300 dark:hover:bg-fuchsia-500/20" },
];

export default function PracticeModeModal({
  title, modes, onStart, onClose,
}: {
  title: string;
  modes: VideoMode[];
  onStart: (mode: VideoMode, level?: DictLevel) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"mode" | "level">("mode");
  const hasDict = modes.includes("dictation");
  const hasShadow = modes.includes("shadowing");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        {/* Header — chỉ title + phụ đề bước */}
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-slate-800 dark:text-white">{title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">{step === "mode" ? "Choose how to practice" : "Pick a difficulty"}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"><X className="h-4 w-4" /></button>
        </div>

        {step === "mode" ? (
          <div className="space-y-2.5">
            {hasDict && (
              <button type="button" onClick={() => setStep("level")} className="flex w-full items-center gap-3 rounded-xl border-2 border-cyan-200 p-3 text-left transition hover:border-cyan-400 hover:bg-cyan-50/60 dark:border-cyan-500/30 dark:hover:bg-cyan-500/10">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-300"><PenLine className="size-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-slate-800 dark:text-white">Dictation</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">Listen and type each line — correct letters turn green instantly.</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-slate-400" />
              </button>
            )}
            {hasShadow && (
              <button type="button" onClick={() => onStart("shadowing")} className="flex w-full items-center gap-3 rounded-xl border-2 border-violet-200 p-3 text-left transition hover:border-violet-400 hover:bg-violet-50/60 dark:border-violet-500/30 dark:hover:bg-violet-500/10">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-600 dark:text-violet-300"><Mic className="size-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-slate-800 dark:text-white">Shadowing</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">Say the line back — pronunciation scored word by word.</span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-slate-400" />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {LEVELS.map((lv) => (
                <button key={lv.id} type="button" onClick={() => onStart("dictation", lv.id)} className={`rounded-xl border-2 px-2 py-3 text-center transition ${lv.cls}`}>
                  <div className="text-sm font-bold">{lv.label}</div>
                  <div className="text-[11px] opacity-70">{lv.hint}</div>
                </button>
              ))}
            </div>
            <button type="button" onClick={(e) => { e.stopPropagation(); setStep("mode"); }} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300"><ArrowLeft className="size-3.5" /> Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
