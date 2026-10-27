// Library tab of /u/vocabulary: the teachers' sets as a grid; a card opens the set detail page.
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, GraduationCap, Layers, Search } from "lucide-react";
import { accountApi, type VocabSetSummary } from "../../../lib/api";
import { Input } from "../../../components/ui";
import { HeroDecor } from "../../../components/HeroDecor";
import { useDebounced } from "../../../lib/useDebounced";
import { cn } from "../../../lib/utils";

export default function VocabLibraryView() {
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 250);
  const { data, isLoading } = useQuery({ queryKey: ["vocab-sets", dq], queryFn: () => accountApi.vocabSets({ q: dq || undefined }) });
  const sets = data?.items ?? [];

  return (
    <div>
      <div className="mb-4">
        <Input value={q} onChange={(e) => setQ(e.target.value)} onClear={() => setQ("")} placeholder="Search sets…" leftIcon={<Search className="size-4" />} />
      </div>
      {isLoading ? (
        <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
      ) : !sets.length ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
          <Layers className="mb-3 size-8 text-slate-300" />
          <p className="font-semibold text-slate-600 dark:text-slate-300">{dq ? "No matching sets" : "No word sets yet"}</p>
          <p className="mt-1 text-sm text-slate-500">{dq ? "Try another keyword." : "Your teacher has not published any word set yet."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sets.map((s) => {
            const pct = s.wordCount ? Math.round((s.learned / s.wordCount) * 100) : 0;
            return (
              <Link
                key={s.id}
                to={`/u/vocabulary/set/${s.slug}`}
                className="group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-cyan-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-700"
              >
                <SetCover set={s} />
                <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-slate-900 group-hover:text-cyan-700 dark:text-white dark:group-hover:text-cyan-300">{s.name}</p>
                    {s.level && <p className="text-xs font-semibold text-slate-400">{s.level.name}</p>}
                  </div>
                </div>
                <div className="mt-auto">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1"><BookOpen className="size-3.5" /> {s.wordCount} words</span>
                    <span className="inline-flex items-center gap-1"><GraduationCap className="size-3.5" /> {s.learned} learned</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

const COVER_TONES = [
  "from-cyan-500 to-blue-600",
  "from-violet-500 to-fuchsia-600",
  "from-emerald-500 to-teal-600",
  "from-amber-500 to-orange-600",
  "from-rose-500 to-pink-600",
  "from-indigo-500 to-sky-600",
];

function toneOf(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return COVER_TONES[h % COVER_TONES.length];
}

/** Card cover: a collage of the set's word images, or a tinted banner with its first words. */
function SetCover({ set }: { set: VocabSetSummary }) {
  const imgs = set.images.slice(0, 4);
  if (imgs.length) {
    return (
      <div className={cn("grid h-28 gap-px bg-slate-100 dark:bg-slate-800", imgs.length > 1 && "grid-cols-2", imgs.length > 2 && "grid-rows-2")}>
        {imgs.map((src, i) => (
          <img
            key={src + i}
            src={src}
            alt=""
            loading="lazy"
            className={cn("size-full object-cover", imgs.length === 3 && i === 0 && "row-span-2")}
          />
        ))}
      </div>
    );
  }
  return (
    <div className={cn("relative flex h-28 flex-wrap content-center items-center justify-center gap-1.5 overflow-hidden bg-gradient-to-br px-4", toneOf(set.slug))}>
      <HeroDecor seed={set.slug} className="text-white/20" mobile />
      {set.sample.length ? (
        set.sample.map((w, i) => (
          <span
            key={w + i}
            className={cn(
              "relative rounded-lg bg-white/90 px-2 py-0.5 text-xs font-bold text-slate-700 shadow-sm dark:bg-slate-900/80 dark:text-slate-100",
              i % 2 ? "rotate-2" : "-rotate-2",
            )}
          >
            {w}
          </span>
        ))
      ) : (
        <Layers className="relative size-8 text-white/80" />
      )}
    </div>
  );
}
