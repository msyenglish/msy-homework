// Luyện NGHE–CHÉP từng câu. Học sinh chọn ĐỘ KHÓ ngay lúc làm (easy 3 chỗ · medium 5 chỗ · hard cả
// câu) — đổi mức tức thì, khoét lồng nhau. Điền tới đâu CHẤM tới đó (so hash tại chỗ, đáp án không rời
// server), không giới hạn lượt, không ép nộp: mỗi câu điền đúng hết = 1 điểm, điểm = % câu hoàn thành.
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Volume2, RotateCcw, Lightbulb, Check, ArrowLeft, ArrowRight, Loader2, Send } from "lucide-react";
import {
  DICTATION_BLANKS,
  normalize,
  stripPunct,
  type DictationLevel,
  type DictationWord,
} from "@msyen/shared";
import type { GradeResp, PublicExerciseResp } from "../../lib/api";
import { boxNavKeyDown, focusBox } from "../../lib/boxNav";
import { cn } from "../../lib/utils";
import { PracticeHero } from "./PracticeHero";
import { PracticeFooter } from "./PracticeFooter";
import ThemeToggle from "../ThemeToggle";
import { t, type TKey } from "../../i18n";

// Khoá so khớp GIỐNG server (lib/dictation.ts): chuẩn hoá + bỏ dấu câu → hash SHA-256 hex.
const answerKey = (s: string) => stripPunct(normalize(s));
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Chỉ số các từ bị KHOÉT ở 1 mức = top-k từ dài nhất (đồng hạng → vị trí trước). Lồng nhau: easy⊂medium⊂hard.
function blankIndices(words: DictationWord[], level: DictationLevel): Set<number> {
  const ranked = words
    .map((w, i) => ({ i, len: w.mask }))
    .filter((x) => x.len > 0)
    .sort((a, b) => b.len - a.len || a.i - b.i);
  const count = level === "hard" ? ranked.length : DICTATION_BLANKS[level];
  return new Set(ranked.slice(0, count).map((x) => x.i));
}

const LEVELS: { id: DictationLevel; label: TKey; hint: TKey }[] = [
  { id: "easy", label: "practice.dictation.levelEasy", hint: "practice.dictation.levelEasyHint" },
  { id: "medium", label: "practice.dictation.levelMedium", hint: "practice.dictation.levelMediumHint" },
  { id: "hard", label: "practice.dictation.levelHard", hint: "practice.dictation.levelHardHint" },
];

type CorrectMap = Record<number, Record<number, boolean>>;
type InputMap = Record<number, Record<number, string>>;

/**
 * What is worth restoring of an unfinished attempt. `correct` is NOT stored: it is derived by
 * re-hashing the typed boxes, so a tampered draft cannot mark a sentence done.
 */
export type DictationDraft = {
  level: DictationLevel;
  idx: number;
  inputs: InputMap;
  hintUsed: boolean;
};

export function DictationPractice({
  exercise,
  learnerName = t("practice.learner.defaultName"),
  backTo,
  onGrade,
  initialDraft,
  onDraftChange,
}: {
  exercise: PublicExerciseResp;
  learnerName?: string;
  backTo: string;
  onGrade: (
    answers: Record<string, string>,
    meta?: { hintUsed?: boolean; hintPositions?: number[] },
  ) => Promise<GradeResp>;
  /** Unfinished attempt to continue (null = start fresh). */
  initialDraft?: DictationDraft | null;
  /** Called on every typed box so the host can autosave. */
  onDraftChange?: (state: DictationDraft, answered: number, total: number) => void;
}) {
  const nav = useNavigate();
  const sentences = exercise.dictation!.sentences;
  const total = sentences.length;
  const questions = exercise.questions;

  const [level, setLevel] = useState<DictationLevel>(initialDraft?.level ?? "medium");
  const [idx, setIdx] = useState(initialDraft?.idx ?? 0);
  const [inputs, setInputs] = useState<InputMap>(initialDraft?.inputs ?? {});
  const [correct, setCorrect] = useState<CorrectMap>({});
  const [hintOn, setHintOn] = useState(false);
  const [hintUsed, setHintUsed] = useState(initialDraft?.hintUsed ?? false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const sent = sentences[idx];
  const blankSet = useMemo(() => blankIndices(sent.words, level), [sent, level]);
  // Blank word indices in reading order — the order the keyboard walks them in.
  const blanks = useMemo(() => [...blankSet].sort((a, b) => a - b), [blankSet]);

  const audioRef = useRef<HTMLAudioElement>(null);
  // Boxes keyed by word index; only blanked words have one.
  const cellRefs = useRef<Record<number, HTMLInputElement | null>>({});

  /** Step to the blank before/after `wi`; a no-op at either end of the sentence. */
  function stepBox(wi: number, dir: -1 | 1) {
    const at = blanks.indexOf(wi);
    const to = blanks[at + dir];
    if (to == null) return;
    focusBox(cellRefs.current[to], dir === -1 ? "end" : "start");
  }

  // Số câu ĐÃ hoàn thành ở mức hiện tại → tiến độ + điểm ước lượng.
  const doneCount = useMemo(
    () =>
      sentences.reduce((n, s, si) => {
        const bs = blankIndices(s.words, level);
        const cm = correct[si] ?? {};
        return n + ([...bs].length > 0 && [...bs].every((wi) => cm[wi]) ? 1 : 0);
      }, 0),
    [sentences, level, correct],
  );
  const doneCurrent = useMemo(() => [...blankSet].every((wi) => correct[idx]?.[wi]), [blankSet, correct, idx]);

  // Restored attempt → re-grade the typed boxes locally (hash compare, answers stay on the server).
  const rehydrated = useRef(false);
  useEffect(() => {
    if (rehydrated.current || !initialDraft?.inputs) return;
    rehydrated.current = true;
    let alive = true;
    (async () => {
      const next: CorrectMap = {};
      for (const [si, row] of Object.entries(initialDraft.inputs)) {
        const words = sentences[Number(si)]?.words;
        if (!words) continue;
        for (const [wi, val] of Object.entries(row)) {
          const w = words[Number(wi)];
          if (!w || !val?.trim()) continue;
          const ok = (await sha256Hex(answerKey(val))) === w.hash;
          (next[Number(si)] ??= {})[Number(wi)] = ok;
        }
      }
      if (alive) setCorrect(next);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave after every change so leaving mid-exercise never costs the sentences already typed.
  useEffect(() => {
    if (!onDraftChange) return;
    onDraftChange({ level, idx, inputs, hintUsed }, doneCount, total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level, idx, inputs, hintUsed, doneCount, total]);

  // Mỗi câu mới: reset gợi ý + tự phát audio câu đó + focus ô đầu.
  useEffect(() => {
    setHintOn(false);
    setError("");
    const t = setTimeout(() => {
      playSentence();
      cellRefs.current[blanks[0]]?.focus();
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  // Xong câu → tự nhẹ nhàng sang câu kế (luyện nhanh); câu cuối thì để học sinh chủ động nộp.
  useEffect(() => {
    if (doneCurrent && idx < total - 1) {
      const t = setTimeout(() => setIdx((i) => (i === idx ? i + 1 : i)), 900);
      return () => clearTimeout(t);
    }
  }, [doneCurrent, idx, total]);

  // Phát RIÊNG câu đang làm: tua tới audioStart, dừng ở audioEnd (guard onTimeUpdate).
  function playSentence() {
    const a = audioRef.current;
    if (!a || !exercise.audio_url) return;
    a.currentTime = sent.audioStart || 0;
    a.play().catch(() => {});
  }
  function onTimeUpdate() {
    const a = audioRef.current;
    if (!a) return;
    if (sent.audioEnd > 0 && a.currentTime >= sent.audioEnd) a.pause();
  }

  // Gõ tới đâu chấm tới đó: hash ô vừa gõ so với hash đáp án của TỪ (không lộ đáp án).
  async function onType(wi: number, value: string) {
    setInputs((p) => ({ ...p, [idx]: { ...p[idx], [wi]: value } }));
    const ok = value.trim() !== "" && (await sha256Hex(answerKey(value))) === sent.words[wi].hash;
    setCorrect((p) => ({ ...p, [idx]: { ...p[idx], [wi]: ok } }));
  }

  function useHint() {
    setHintOn(true);
    setHintUsed(true);
  }

  // Dựng lại câu (từ hiện sẵn + ô đã gõ) để server chấm THẬT → điểm = % câu đúng hết.
  function reconstruct(si: number): string {
    const words = sentences[si].words;
    const bs = blankIndices(words, level);
    const inp = inputs[si] ?? {};
    return words
      .map((w, wi) => (bs.has(wi) ? inp[wi] ?? "" : w.text ?? ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const answers: Record<string, string> = {};
      questions.forEach((q, qi) => (answers[String(q.position ?? qi)] = reconstruct(qi)));
      const r = await onGrade(answers, { hintUsed: hintUsed || level !== "hard" });
      if (r.submission_id) nav(`/s/${r.submission_id}`);
      else nav(backTo);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("practice.dictation.submitFailed"));
      setSubmitting(false);
    }
  }

  const isLast = idx === total - 1;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <audio ref={audioRef} src={exercise.audio_url ?? undefined} preload="auto" onTimeUpdate={onTimeUpdate} className="hidden" />

      <PracticeHero
        title={exercise.title}
        studentName={learnerName}
        skill={exercise.skill ?? "listening"}
        total={total}
        actions={
          <>
            <button
              onClick={() => nav(backTo)}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <ArrowLeft className="size-4" /> {t("practice.dictation.library")}
            </button>
            <ThemeToggle />
            <button
              onClick={submit}
              disabled={submitting}
              className="ml-auto inline-flex h-10 items-center gap-1.5 rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-cyan-400 disabled:opacity-50 sm:ml-0"
            >
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {t("practice.dictation.submit")}
            </button>
          </>
        }
      />

      <div className="px-3 sm:px-0">
        {/* Tiến độ theo câu + số câu hoàn thành (mỗi câu = 1 điểm). */}
        <div className="mb-4 flex items-center gap-3">
          <div className="flex flex-1 items-center gap-1.5">
            {sentences.map((s, i) => {
              const bs = blankIndices(s.words, level);
              const done = [...bs].length > 0 && [...bs].every((wi) => correct[i]?.[wi]);
              return (
                <button
                  key={i}
                  onClick={() => setIdx(i)}
                  title={t("practice.dictation.sentenceTitle", { n: i + 1 })}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-all",
                    done ? "bg-emerald-500" : i === idx ? "bg-cyan-500" : "bg-slate-200 dark:bg-slate-700",
                  )}
                />
              );
            })}
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-500 dark:text-slate-400">
            <span className="text-emerald-600 dark:text-emerald-400">{doneCount}</span>/{t("practice.dictation.sentenceTotal", { n: total })}
          </span>
        </div>

        {/* Bộ chọn độ khó — đổi tức thì, gợi ý nhanh: dễ → điền ít, khó → điền cả câu. */}
        <div className="mb-4 flex items-center gap-2">
          <span className="text-sm font-medium text-slate-500 dark:text-slate-400">{t("practice.dictation.difficultyLabel")}</span>
          <div className="inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
            {LEVELS.map((lv) => (
              <button
                key={lv.id}
                onClick={() => setLevel(lv.id)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                  level === lv.id
                    ? "bg-white text-cyan-600 shadow-sm dark:bg-slate-700 dark:text-cyan-300"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white",
                )}
              >
                {t(lv.label)}
                <span className="ml-1 hidden text-xs font-normal opacity-60 sm:inline">· {t(lv.hint)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Thẻ audio: nghe RIÊNG câu đang làm. */}
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-cyan-200/60 bg-gradient-to-br from-cyan-50 to-white p-4 shadow-sm dark:border-cyan-500/20 dark:from-cyan-500/10 dark:to-slate-900">
          <button
            onClick={playSentence}
            aria-label={t("practice.dictation.playSentenceAria", { n: idx + 1 })}
            className="inline-flex size-14 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-white shadow-lg shadow-cyan-500/30 transition hover:scale-105 hover:bg-cyan-400 active:scale-95"
          >
            <Volume2 className="size-6" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-slate-800 dark:text-white">{t("practice.dictation.sentenceNumber", { n: idx + 1 })}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{t("practice.dictation.playSentenceHint")}</div>
          </div>
          <button
            onClick={playSentence}
            title={t("practice.dictation.replayTitle")}
            className="inline-flex size-10 items-center justify-center rounded-xl bg-white/70 text-cyan-600 transition hover:bg-white dark:bg-slate-800 dark:text-cyan-300 dark:hover:bg-slate-700"
          >
            <RotateCcw className="size-5" />
          </button>
        </div>

        {/* Vùng chép câu: từ hiện sẵn = chữ · chỗ khoét = ô nhập (gõ đúng → xanh). */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:bg-slate-900">
          <SentenceInput
            words={sent.words}
            blankSet={blankSet}
            inputs={inputs[idx] ?? {}}
            correct={correct[idx] ?? {}}
            hintOn={hintOn}
            refCb={(wi, el) => { cellRefs.current[wi] = el; }}
            onStep={stepBox}
            onType={onType}
          />

          {doneCurrent && (
            <p className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              <Check className="size-4" /> {t("practice.dictation.correctPrefix")}{isLast ? t("practice.dictation.submitWhenReady") : t("practice.dictation.nextSentenceEllipsis")}
            </p>
          )}
          {error && <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        </div>

        {/* Hàng nút: gợi ý chữ đầu · điều hướng câu. */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={useHint}
            disabled={hintOn}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-amber-100 px-4 text-sm font-semibold text-amber-700 transition hover:bg-amber-200 disabled:opacity-40 dark:bg-amber-500/15 dark:text-amber-300"
          >
            <Lightbulb className="size-4" /> {t("practice.dictation.firstLetterHint")}
          </button>

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setIdx((i) => Math.max(0, i - 1))}
              disabled={idx === 0}
              className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <ArrowLeft className="size-4" /> {t("practice.dictation.prev")}
            </button>
            {isLast ? (
              <button
                onClick={submit}
                disabled={submitting}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-cyan-500 px-6 text-sm font-semibold text-white transition hover:bg-cyan-400 disabled:opacity-50"
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} {t("practice.dictation.submit")}
              </button>
            ) : (
              <button
                onClick={() => setIdx((i) => Math.min(total - 1, i + 1))}
                className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-slate-900 px-5 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                {t("practice.dictation.next")} <ArrowRight className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      <PracticeFooter />
    </div>
  );
}

// Một câu: render từng từ inline — từ hiện sẵn là chữ; từ bị khoét là ô nhập cỡ theo độ dài.
function SentenceInput({
  words,
  blankSet,
  inputs,
  correct,
  hintOn,
  refCb,
  onStep,
  onType,
}: {
  words: DictationWord[];
  blankSet: Set<number>;
  inputs: Record<number, string>;
  correct: Record<number, boolean>;
  hintOn: boolean;
  refCb: (wi: number, el: HTMLInputElement | null) => void;
  onStep: (wi: number, dir: -1 | 1) => void;
  onType: (wi: number, value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-3 text-lg leading-relaxed text-slate-800 dark:text-slate-100">
      {words.map((w, i) => {
        if (!blankSet.has(i)) return <span key={i}>{w.text ?? ""}</span>;
        const val = inputs[i] ?? "";
        const ok = correct[i];
        const len = Math.max(w.mask, 2);
        return (
          <input
            key={i}
            ref={(el) => refCb(i, el)}
            value={val}
            onChange={(e) => onType(i, e.target.value)}
            onKeyDown={(e) => boxNavKeyDown(e, { prev: () => onStep(i, -1), next: () => onStep(i, 1) })}
            spellCheck={false}
            autoComplete="off"
            placeholder={hintOn ? `${w.initial}${"·".repeat(Math.max(0, w.mask - 1))}` : "•".repeat(w.mask)}
            style={{ width: `${len + 2}ch` }}
            className={cn(
              "rounded-lg border-b-2 px-1.5 py-0.5 text-center font-mono outline-none transition",
              ok
                ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "border-cyan-400 bg-cyan-50/40 text-cyan-800 focus:border-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-100",
            )}
          />
        );
      })}
    </div>
  );
}
