// GRAMMAR MAP (demo) — the handbook as a graph: one column per CEFR band, edges from `related`,
// each node tinted by the learner's mastery so gaps are visible at a glance. Picking a node opens
// the FAST-THINKING chart for that point: signals -> which form -> what it is confused with.
// Deliberately NOT a decorative radial mind map: for grammar the useful shape is a decision path.
// Route: /u/grammar/map.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CornerDownRight, Info, Loader2, Map as MapIcon, Sparkles, TriangleAlert } from "lucide-react";
import { CEFR_BANDS, type Cefr, type GrammarMastery } from "@msyen/shared";
import { accountApi, publicGrammarMap, publicGrammarOne, type GrammarMapNode } from "../../../lib/api";
import { useDocumentTitle } from "../../../lib/useDocumentTitle";
import { Button, Card } from "../../../components/ui";
import { BAND_COLOR, CATEGORY_STYLE } from "../../../lib/cefr";
import { cn } from "../../../lib/utils";
import { useGoBack } from "../../../lib/navState";
import { t, type TKey } from "../../../i18n";

// Mastery 0..100 -> node tint. Grey means "never drilled", which is the whole point of the map.
function tint(m?: GrammarMastery): { fill: string; labelKey: TKey } {
  if (!m || m.tier === 0) return { fill: "#cbd5e1", labelKey: "userVideoProfile.grammarMap.statusUnlearned" };
  if (m.due) return { fill: "#f59e0b", labelKey: "userVideoProfile.grammarMap.statusDue" };
  if (m.mastery >= 80) return { fill: "#10b981", labelKey: "userVideoProfile.grammarMap.statusMastered" };
  if (m.mastery >= 50) return { fill: "#06b6d4", labelKey: "userVideoProfile.grammarMap.statusSolid" };
  return { fill: "#38bdf8", labelKey: "userVideoProfile.grammarMap.statusFamiliar" };
}

const COL_W = 190;
const ROW_H = 34;
const PAD_T = 44;

type Placed = GrammarMapNode & { x: number; y: number; w: number };

export default function GrammarMapPage() {
  const [cat, setCat] = useState<string>("all");
  const [pickedId, setPickedId] = useState<string | null>(null);
  const goBack = useGoBack("/u/grammar");
  useDocumentTitle(t("userVideoProfile.grammarMap.title"));

  const { data: map, isLoading } = useQuery({ queryKey: ["grammar-map"], queryFn: publicGrammarMap });
  const { data: state } = useQuery({ queryKey: ["grammar-state"], queryFn: accountApi.grammarState });
  const { data: point, isFetching: pointLoading } = useQuery({
    queryKey: ["grammar-one", pickedId],
    queryFn: () => publicGrammarOne(pickedId!),
    enabled: !!pickedId,
  });

  const mastery = useMemo(() => new Map((state?.items ?? []).map((i) => [i.grammar_id, i])), [state]);
  const categories = useMemo(() => [...new Set((map?.items ?? []).map((i) => i.category))], [map]);

  // One column per band; a node's row is its order inside the band after filtering.
  const { placed, height } = useMemo(() => {
    const items = (map?.items ?? []).filter((i) => cat === "all" || i.category === cat);
    const perBand = new Map<string, GrammarMapNode[]>();
    for (const i of items) perBand.set(i.cefr, [...(perBand.get(i.cefr) ?? []), i]);
    const out: Placed[] = [];
    CEFR_BANDS.forEach((band, bi) => {
      (perBand.get(band) ?? []).forEach((node, ri) => {
        out.push({ ...node, x: bi * COL_W + 12, y: PAD_T + ri * ROW_H, w: COL_W - 26 });
      });
    });
    const tallest = Math.max(1, ...[...perBand.values()].map((v) => v.length));
    return { placed: out, height: PAD_T + tallest * ROW_H + 16 };
  }, [map, cat]);

  const byId = useMemo(() => new Map(placed.map((p) => [p.id, p])), [placed]);
  const width = CEFR_BANDS.length * COL_W;
  const picked = pickedId ? byId.get(pickedId) : null;

  // Only edges whose BOTH ends survive the filter — a half-drawn edge points nowhere.
  const edges = useMemo(() => {
    const out: { a: Placed; b: Placed; on: boolean }[] = [];
    for (const p of placed) {
      for (const r of p.related) {
        const t = byId.get(r);
        if (!t || t.id <= p.id) continue; // one line per pair
        out.push({ a: p, b: t, on: pickedId === p.id || pickedId === t.id });
      }
    }
    return out;
  }, [placed, byId, pickedId]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-3 py-4 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-cyan-600 dark:text-slate-400"
        >
          <ArrowLeft className="size-4" /> {t("userVideoProfile.grammarMap.backToHandbook")}
        </button>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
          <Info className="size-3" /> {t("userVideoProfile.grammarMap.beta")}
        </span>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
              <MapIcon className="size-5 text-cyan-500" /> {t("userVideoProfile.grammarMap.title")}
            </h1>
            <p className="text-sm text-slate-500">{t("userVideoProfile.grammarMap.subtitle", { n: placed.length })}</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
            {[
              { c: "#cbd5e1", k: "userVideoProfile.grammarMap.statusUnlearned" as const },
              { c: "#38bdf8", k: "userVideoProfile.grammarMap.statusFamiliar" as const },
              { c: "#06b6d4", k: "userVideoProfile.grammarMap.statusSolid" as const },
              { c: "#10b981", k: "userVideoProfile.grammarMap.statusMastered" as const },
              { c: "#f59e0b", k: "userVideoProfile.grammarMap.statusDue" as const },
            ].map((l) => (
              <span key={l.k} className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: l.c }} /> {t(l.k)}
              </span>
            ))}
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCat("all")}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium",
              cat === "all" ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300" : "border-slate-200 text-slate-500 dark:border-slate-700",
            )}
          >
            {t("userVideoProfile.grammarMap.allCategories")}
          </button>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCat(c)}
              className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", cat === c ? "text-white" : "border-slate-200 text-slate-500 dark:border-slate-700")}
              style={cat === c ? { background: CATEGORY_STYLE[c]?.color ?? "#0891b2", borderColor: CATEGORY_STYLE[c]?.color ?? "#0891b2" } : undefined}
            >
              {c}
            </button>
          ))}
        </div>
      </Card>

      {isLoading && (
        <Card className="flex items-center justify-center gap-2 py-16 text-slate-400">
          <Loader2 className="size-5 animate-spin" /> {t("userVideoProfile.grammarMap.loading")}
        </Card>
      )}

      {map && (
        <Card className="overflow-x-auto p-2">
          <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="max-w-none" role="img" aria-label={t("userVideoProfile.grammarMap.title")}>
            {/* band headers */}
            {CEFR_BANDS.map((b, i) => (
              <g key={b}>
                <rect x={i * COL_W + 12} y={8} width={COL_W - 26} height={22} rx={11} fill={BAND_COLOR[b as Cefr]} fillOpacity={0.14} />
                <text x={i * COL_W + 12 + (COL_W - 26) / 2} y={23} textAnchor="middle" className="text-[12px] font-bold" fill={BAND_COLOR[b as Cefr]}>
                  {b}
                </text>
              </g>
            ))}

            {/* related edges — drawn under the nodes, highlighted for the picked point */}
            {edges.map((e, i) => (
              <path
                key={i}
                d={`M ${e.a.x + e.a.w} ${e.a.y + 12} C ${e.a.x + e.a.w + 40} ${e.a.y + 12}, ${e.b.x - 40} ${e.b.y + 12}, ${e.b.x} ${e.b.y + 12}`}
                fill="none"
                stroke={e.on ? "#0891b2" : "#94a3b8"}
                strokeWidth={e.on ? 2 : 1}
                strokeOpacity={e.on ? 0.9 : 0.22}
              />
            ))}

            {/* points */}
            {placed.map((p) => {
              const m = mastery.get(p.id);
              const tone = tint(m);
              const on = pickedId === p.id;
              return (
                <g key={p.id} transform={`translate(${p.x} ${p.y})`} onClick={() => setPickedId(on ? null : p.id)} className="cursor-pointer">
                  <rect
                    width={p.w}
                    height={25}
                    rx={7}
                    className={cn("fill-white dark:fill-slate-900", on && "fill-cyan-50 dark:fill-cyan-950")}
                    stroke={on ? "#0891b2" : CATEGORY_STYLE[p.category]?.color ?? "#94a3b8"}
                    strokeWidth={on ? 2 : 1}
                    strokeOpacity={on ? 1 : 0.55}
                  />
                  <circle cx={11} cy={12.5} r={4} fill={tone.fill} />
                  <text x={22} y={17} className="fill-slate-700 text-[11.5px] dark:fill-slate-200">
                    {p.title.length > 24 ? `${p.title.slice(0, 23)}…` : p.title}
                  </text>
                </g>
              );
            })}
          </svg>
        </Card>
      )}

      {/* ---- FAST-THINKING chart for the picked point ---- */}
      {picked && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="size-4 text-cyan-500" />
            <h2 className="font-bold text-slate-800 dark:text-slate-100">{t("userVideoProfile.grammarMap.fastThinking", { title: picked.title })}</h2>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-500 dark:bg-slate-800">{picked.cefr}</span>
            <Link to={`/u/grammar?open=${picked.id}`} className="ml-auto">
              <Button variant="secondary">
                {t("userVideoProfile.grammarMap.openHandbook")} <ArrowRight className="size-4" />
              </Button>
            </Link>
          </div>

          {pointLoading && (
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="size-4 animate-spin" /> {t("common.loading")}
            </p>
          )}

          {point && (
            <div className="grid gap-3 md:grid-cols-3">
              {/* step 1: what tips you off */}
              <div className="rounded-xl border border-cyan-200 bg-cyan-50/60 p-3 dark:border-cyan-900 dark:bg-cyan-950/30">
                <p className="text-[11px] font-bold uppercase tracking-wide text-cyan-700 dark:text-cyan-300">{t("userVideoProfile.grammarMap.step1")}</p>
                {point.signals?.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {point.signals.map((s) => (
                      <span key={s} className="rounded-md bg-white px-1.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                        {s}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-1.5 text-sm text-slate-500">{point.summary}</p>
                )}
              </div>

              {/* step 2: the formula to reach for */}
              <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("userVideoProfile.grammarMap.step2")}</p>
                <div className="mt-1.5 space-y-1.5">
                  {point.forms.slice(0, 4).map((f) => (
                    <div key={f.label} className="flex items-start gap-1.5 text-sm">
                      <CornerDownRight className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
                      <span>
                        <span className="text-slate-400">{f.label}: </span>
                        <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{f.formula}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* step 3: the confusable neighbours — the actual reason learners pick wrong */}
              <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 dark:border-rose-900 dark:bg-rose-950/20">
                <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-rose-600 dark:text-rose-300">
                  <TriangleAlert className="size-3" /> {t("userVideoProfile.grammarMap.step3")}
                </p>
                {point.compare?.length ? (
                  <ul className="mt-1.5 space-y-1.5 text-sm">
                    {point.compare.slice(0, 4).map((cp) => (
                      <li key={cp.with}>
                        <button
                          type="button"
                          onClick={() => byId.has(cp.with) && setPickedId(cp.with)}
                          className={cn("font-semibold", byId.has(cp.with) ? "text-rose-700 underline decoration-dotted dark:text-rose-300" : "text-slate-600 dark:text-slate-300")}
                        >
                          {cp.with}
                        </button>
                        <span className="text-slate-600 dark:text-slate-300"> — {cp.note}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1.5 text-sm text-slate-500">{t("userVideoProfile.grammarMap.rarelyConfused")}</p>
                )}
              </div>
            </div>
          )}
        </Card>
      )}

      <p className="pb-6 text-center text-xs text-slate-400">
        {t("userVideoProfile.grammarMap.footerNote")}
      </p>
    </div>
  );
}
