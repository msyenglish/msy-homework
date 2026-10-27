// ============================================================
//  AI gateway (teacher): route tasks to models, manage the model list and provider keys, costs.
//  Everything is stored in D1, so changes apply immediately without a deploy.
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  AudioLines,
  BarChart3,
  Boxes,
  ChevronDown,
  Coins,
  Cpu,
  Eraser,
  KeyRound,
  Loader2,
  Mic,
  RotateCcw,
  Route,
  Save,
  Scale,
  Info,
  Search,
  X,
  XCircle,
} from "lucide-react";
import {
  aiGatewayApi,
  type AiConfig,
  type AiModelInfo,
  type AiProviderId,
  type AiRoute,
  type AiTaskInfo,
} from "../../lib/api";
import { HeroDecor } from "../../components/HeroDecor";
import { confirmAsk } from "../../components/confirm";
import { Button, Card, CardContent, Input, Select } from "../../components/ui";
import { useUrlState } from "../../lib/navState";
import { cn } from "../../lib/utils";
import { t, type TKey } from "../../i18n";
import { AiModelsTab } from "../../components/ai/AiModelsTab";
import { AiKeysTab } from "../../components/ai/AiKeysTab";
import { AiVoiceTab } from "../../components/ai/AiVoiceTab";
import { money, num, ProviderLogo, ProviderSelect } from "../../components/ai/shared";

type Tab = "routes" | "models" | "keys" | "voice" | "cost";

function pricingText(m: AiModelInfo): string {
  const base = t("teacherAi.pricing.base", { input: money(m.inPrice), output: money(m.outPrice) });
  if (!m.pricing) return base;
  const cache = t("teacherAi.pricing.cache", { read: money(m.pricing.cachedInput), write: money(m.pricing.cacheWrite) });
  const long = m.pricing.longContext;
  if (!long) return `${base} · ${cache}`;
  return `${base} · ${cache} | ${t("teacherAi.pricing.long", { threshold: num(long.thresholdTokens), input: money(long.inPrice), output: money(long.outPrice) })}`;
}

const sameRoute = (a: AiRoute, b: AiRoute) => a.provider === b.provider && a.model === b.model;

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\u0111/g, "d").toLowerCase();

interface TaskGroupDef {
  key: string;
  nameKey: TKey;
  hintKey: TKey;
}

const TASK_GROUPS: TaskGroupDef[] = [
  { key: "audio", nameKey: "teacherAi.routes.groupTitle.audio", hintKey: "teacherAi.routes.group.audio" },
  { key: "grading", nameKey: "teacherAi.routes.groupTitle.grading", hintKey: "teacherAi.routes.group.grading" },
  { key: "auto", nameKey: "teacherAi.routes.groupTitle.auto", hintKey: "teacherAi.routes.group.auto" },
  { key: "parent", nameKey: "teacherAi.routes.groupTitle.parent", hintKey: "teacherAi.routes.group.parent" },
  { key: "generate", nameKey: "teacherAi.routes.groupTitle.generate", hintKey: "teacherAi.routes.group.generate" },
  { key: "misc", nameKey: "teacherAi.routes.groupTitle.misc", hintKey: "teacherAi.routes.group.misc" },
];

function resolveGroupKey(rawGroup: string): string {
  const g = fold(rawGroup);
  if (g.includes("audio")) return "audio";
  if (g.includes("cham")) return "grading";
  if (g.includes("tu dong") || g.includes("nop")) return "auto";
  if (g.includes("huynh")) return "parent";
  if (g.includes("sinh")) return "generate";
  return "misc";
}

export default function AiGatewayPage() {
  const qc = useQueryClient();
  // Tab lives in the URL (?tab=) — switching tabs is a step the teacher expects Back to undo.
  const [tabParam, setTabParam] = useUrlState("tab", "routes", { push: true });
  const tab: Tab = (["models", "keys", "voice", "cost"] as const).find((t) => t === tabParam) ?? "routes";
  const setTab = (v: Tab) => setTabParam(v);
  // Cost window as ?days= — changing it is a filter step Back should undo.
  const [daysParam, setDaysParam] = useUrlState("days", "30", { push: true });

  const { data: cfg, isLoading } = useQuery({ queryKey: ["ai-config"], queryFn: aiGatewayApi.config, retry: false });

  // Bản nháp đang sửa (null = chưa đụng gì → hiện đúng dữ liệu server).
  const [draft, setDraft] = useState<{ default: AiRoute; routes: Record<string, AiRoute> } | null>(null);
  const cur = draft ?? (cfg ? { default: cfg.default, routes: cfg.routes } : null);
  const dirty = !!draft && !!cfg && JSON.stringify(draft) !== JSON.stringify({ default: cfg.default, routes: cfg.routes });

  const save = useMutation({
    mutationFn: () => aiGatewayApi.saveConfig(cur!),
    onSuccess: () => {
      toast.success(t("teacherAi.gateway.saved"));
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["ai-config"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !cfg || !cur) {
    return <div className="mx-auto max-w-[1200px] px-4 py-7 text-slate-500">{t("common.loading")}</div>;
  }

  const TABS: { id: Tab; label: string; icon: typeof Cpu }[] = [
    { id: "routes", label: t("teacherAi.gateway.routes"), icon: Route },
    { id: "models", label: t("teacherAi.gateway.models"), icon: Boxes },
    { id: "keys", label: t("teacherAi.gateway.keys"), icon: KeyRound },
    { id: "voice", label: t("teacherAi.gateway.voice"), icon: AudioLines },
    { id: "cost", label: t("teacherAi.gateway.cost"), icon: Coins },
  ];

  const overrideCount = Object.keys(cur.routes).length;

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-7 pb-24">
      <header className="relative mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <HeroDecor seed="teacher-ai-gateway" className="text-cyan-500/20 dark:text-cyan-400/15" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-500 text-white shadow-lg shadow-cyan-500/30 sm:size-16">
            <Cpu className="size-7 sm:size-8" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">AI Gateway</h1>
            <p className="mt-1 text-sm text-slate-500">
              {t("teacherAi.gateway.hero")}
            </p>
          </div>
          {tab === "cost" && (
            <Select
              fullWidth={false}
              className="min-w-44"
              menuPortal
              value={daysParam}
              onChange={setDaysParam}
              options={[
                { value: "7", label: t("teacherAi.cost.days7") },
                { value: "30", label: t("teacherAi.cost.days30") },
                { value: "90", label: t("teacherAi.cost.days90") },
              ]}
            />
          )}
        </div>
      </header>

      <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
        {TABS.map((tTab) => (
          <button
            key={tTab.id}
            onClick={() => setTab(tTab.id)}
            className={cn(
              "flex flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition",
              tab === tTab.id
                ? "bg-cyan-500 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
            )}
          >
            <tTab.icon className="size-4" /> {tTab.label}
          </button>
        ))}
      </div>

      {tab === "routes" && <RoutesTab cfg={cfg} cur={cur} setDraft={setDraft} onGoKeys={() => setTab("keys")} />}
      {tab === "models" && <AiModelsTab cfg={cfg} onGoKeys={() => setTab("keys")} />}
      {tab === "keys" && <AiKeysTab />}
      {tab === "voice" && <AiVoiceTab onGoKeys={() => setTab("keys")} />}
      {tab === "cost" && <CostTab days={Number(daysParam) || 30} />}

      {/* Sticky save bar at bottom. */}
      {dirty && (
        <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center justify-between gap-3 px-4 py-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {t("teacherAi.gateway.unsaved")}
              <span className="ml-2 font-normal text-slate-500">
                {overrideCount > 0
                  ? t("teacherAi.gateway.overrides", { n: overrideCount, model: cur.default.model })
                  : t("teacherAi.gateway.allDefault", { model: cur.default.model })}
              </span>
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDraft(null)}>
                {t("common.cancel")}
              </Button>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="size-4" /> {save.isPending ? t("common.saving") : t("teacherAi.gateway.saveChanges")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 1: Điều phối ─────────────────────────────────────────────────────────

type View = "" | "override" | "default";

function RoutesTab({
  cfg,
  cur,
  setDraft,
  onGoKeys,
}: {
  cfg: AiConfig;
  cur: { default: AiRoute; routes: Record<string, AiRoute> };
  setDraft: (d: { default: AiRoute; routes: Record<string, AiRoute> }) => void;
  onGoKeys: () => void;
}) {

  /** Model chọn được cho 1 task: cùng provider + thoả ràng buộc audio. */
  const modelsFor = (provider: AiProviderId, task?: AiTaskInfo): AiModelInfo[] =>
    cfg.catalog.filter((m) => m.provider === provider && (!task?.needs_audio || m.audio));

  /** Provider chọn được: đã có key + (nếu task cần audio) có ít nhất 1 model nghe được. */
  const providersFor = (task?: AiTaskInfo) =>
    cfg.providers.filter((p) => p.keyCount > 0 && modelsFor(p.id, task).length > 0);
  /** Picker options: every provider with a fitting model; those without a key are tagged, not hidden. */
  const choicesFor = (task?: AiTaskInfo) =>
    cfg.providers.filter((p) => modelsFor(p.id, task).length > 0).map((p) => ({ id: p.id, label: p.label, ready: p.keyCount > 0 }));

  const setRoute = (task: AiTaskInfo, route: AiRoute | null) => {
    const routes = { ...cur.routes };
    // Trùng mặc định → bỏ khỏi ai_routes để danh sách ghi đè luôn gọn.
    if (!route || sameRoute(route, cur.default)) delete routes[task.name];
    else routes[task.name] = route;
    setDraft({ default: cur.default, routes });
  };

  // Matches by Vietnamese title or shortcode (e.g. "refine_reading_prompt").
  // Spaces and underscores are treated the same — nobody remembers exactly where the underscore goes.
  // Kept in the URL (?q=) so it survives Back/reload; each keystroke replaces (not push).
  const [q, setQ] = useUrlState("q", "");
  const needle = q.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const [view, setView] = useUrlState("view", "");
  const match = (task: AiTaskInfo) =>
    (!view || (view === "override") === !!cur.routes[task.name]) &&
    (!needle ||
    task.label.toLowerCase().replace(/[\s_-]+/g, "").includes(needle) ||
    task.name.toLowerCase().replace(/[\s_-]+/g, "").includes(needle));

  const groups = useMemo(() => {
    const m = new Map<string, AiTaskInfo[]>();
    for (const task of cfg.tasks.filter(match)) {
      const gk = resolveGroupKey(task.group);
      m.set(gk, [...(m.get(gk) ?? []), task]);
    }
    return TASK_GROUPS.filter((g) => m.has(g.key)).map((g) => ({
      def: g,
      tasks: m.get(g.key)!,
    }));
  }, [cfg.tasks, needle, view, cur.routes]);

  const hitCount = groups.reduce((n, g) => n + g.tasks.length, 0);
  const overrideCount = Object.keys(cur.routes).length;

  return (
    <div className="space-y-5">
      {/* Global default */}
      <Card>
        <CardContent className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white">{t("teacherAi.routes.default")}</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {t("teacherAi.routes.defaultDescription")}{" "}
                {overrideCount > 0 ? (
                  <span className="font-semibold text-cyan-600 dark:text-cyan-400">{t("teacherAi.routes.overriding", { n: overrideCount })}</span>
                ) : (
                  t("teacherAi.routes.noOverrides")
                )}
              </p>
            </div>
            {overrideCount > 0 && (
              <Button
                variant="ghost"
                onClick={async () => {
                  const ok = await confirmAsk({
                    title: t("teacherAi.routes.resetTitle"),
                    message: t("teacherAi.routes.resetMessage", { n: overrideCount, model: cur.default.model }),
                    confirmText: t("teacherAi.routes.reset"),
                  });
                  if (ok) setDraft({ default: cur.default, routes: {} });
                }}
              >
                <RotateCcw className="size-4" /> {t("teacherAi.routes.resetAll")}
              </Button>
            )}
          </div>
          <RoutePicker
            route={cur.default}
            providers={choicesFor()}
            models={modelsFor(cur.default.provider)}
            catalog={cfg.catalog}
            onChange={(r) => setDraft({ default: r, routes: cur.routes })}
            onProviderChange={(p) => {
              const first = modelsFor(p)[0];
              if (first) setDraft({ default: { provider: p, model: first.id }, routes: cur.routes });
            }}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-52 flex-1">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onClear={() => setQ("")}
            placeholder={t("teacherAi.routes.search")}
            leftIcon={<Search className="size-4" />}
          />
        </div>
        <Select
          fullWidth={false}
          className="min-w-52 flex-1 sm:flex-none"
          value={view}
          onChange={(v) => setView(v as View)}
          options={[
            { value: "", label: t("teacherAi.routes.viewAll", { n: cfg.tasks.length }) },
            { value: "override", label: t("teacherAi.routes.viewOverride", { n: overrideCount }) },
            { value: "default", label: t("teacherAi.routes.viewDefault", { n: cfg.tasks.length - overrideCount }) },
          ]}
        />
      </div>
      {(needle || view) && !hitCount && <p className="rounded-xl border border-dashed border-slate-300 py-8 text-center text-sm text-slate-400 dark:border-slate-700">{t("teacherAi.routes.noMatch")}</p>}

      {groups.map(({ def, tasks }) => (
        <Card key={def.key}>
          <CardContent className="p-5">
            <h2 className="mb-1 font-bold text-slate-900 dark:text-white">{t(def.nameKey)}</h2>
            <p className="mb-4 text-sm text-slate-500">{t(def.hintKey)}</p>
            <div className="space-y-4">
              {tasks.map((taskItem) => {
                const route = cur.routes[taskItem.name] ?? cur.default;
                const isOverride = !!cur.routes[taskItem.name];
                const locked = taskItem.needs_audio && providersFor(taskItem).length <= 1;
                return (
                  <div
                    key={taskItem.name}
                    className="rounded-xl border border-slate-200 p-3 dark:border-slate-800"
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{taskItem.label}</span>
                      <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">{taskItem.name}</code>
                      {taskItem.needs_audio && (
                        <Badge tone="amber" icon={Mic}>
                          {t("teacherAi.routes.geminiOnly")}
                        </Badge>
                      )}
                      {taskItem.graded && (
                        <Badge tone="rose" icon={Scale}>
                          {t("teacherAi.routes.changesScore")}
                        </Badge>
                      )}
                      {isOverride ? (
                        <>
                          <Badge tone="cyan">{t("teacherAi.routes.overridingBadge")}</Badge>
                          {/* "Reset to default" sits right next to the override badge */}
                          <button
                            type="button"
                            onClick={() => setRoute(taskItem, null)}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 transition-colors hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-400"
                          >
                            <RotateCcw className="size-3" /> {t("teacherAi.routes.reset")}
                          </button>
                        </>
                      ) : (
                        <span className="text-[11px] text-slate-400">{t("teacherAi.routes.defaultBadge")}</span>
                      )}
                    </div>
                    <RoutePicker
                      route={route}
                      providers={choicesFor(taskItem)}
                      models={modelsFor(route.provider, taskItem)}
                      catalog={cfg.catalog}
                      disabled={locked}
                      onChange={(r) => setRoute(taskItem, r)}
                      onProviderChange={(p) => {
                        const first = modelsFor(p, taskItem)[0];
                        if (first) setRoute(taskItem, { provider: p, model: first.id });
                      }}
                      warn={
                        taskItem.graded && isOverride
                          ? t("teacherAi.routes.scoreWarning")
                          : undefined
                      }
                    />
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      {cfg.providers.some((p) => p.keyCount === 0) && (
        <p className="text-sm text-slate-500">
          {t("teacherAi.routes.noKey")}{" "}
          <button type="button" onClick={onGoKeys} className="font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
            {t("teacherAi.routes.addKey")}
          </button>
          {" "}{t("teacherAi.routes.addModelHint")}
        </p>
      )}
    </div>
  );
}

function Badge({
  children,
  tone,
  icon: Icon,
}: {
  children: React.ReactNode;
  tone: "amber" | "rose" | "cyan";
  icon?: typeof Mic;
}) {
  const tones = {
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400",
    cyan: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", tones[tone])}>
      {Icon && <Icon className="size-3" />}
      {children}
    </span>
  );
}

// Select dạng TEXT TRẦN: bỏ viền/nền/chiều cao cố định, chỉ còn chữ nhỏ + mũi tên.
// `cn` của repo là twMerge nên các lớp này đè được lớp mặc định của <button> trong Select.
// fullWidth={false} để wrapper co theo chữ (mặc định wrapper là w-full → chiếm trọn hàng).
const BARE_SELECT =
  "h-auto w-auto rounded-md border-0 bg-transparent px-1.5 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-800";
// Nút co theo chữ → menu (mặc định w-full) sẽ hẹp và cắt nhãn dài; nới rộng + neo mép phải.
const BARE_MENU = "w-72 right-0";

function RoutePicker({
  route,
  providers,
  models,
  catalog,
  disabled,
  warn,
  onChange,
  onProviderChange,
}: {
  route: AiRoute;
  providers: { id: AiProviderId; label: string; ready?: boolean }[];
  models: AiModelInfo[];
  catalog: AiModelInfo[];
  disabled?: boolean;
  warn?: string;
  onChange: (r: AiRoute) => void;
  onProviderChange: (p: AiProviderId) => void;
}) {
  const info = catalog.find((m) => m.id === route.model);
  return (
    // TRÁI: giá (trên) → chú thích model (dưới). PHẢI: provider + model, ngoài cùng.
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
      <div className="min-w-0 flex-1 space-y-0.5">
        {info && (
          <p className="text-[11px] text-slate-500">
            {pricingText(info)}
            {info.free && <span className="ml-1 font-semibold text-emerald-600 dark:text-emerald-400">{t("teacherAi.pricing.freeTier")}</span>}
          </p>
        )}
        {info?.note && (
          <p className="flex items-start gap-1 text-[11px] text-slate-400">
            <AlertTriangle className="mt-px size-3 shrink-0 text-amber-500" />
            {info.note}
          </p>
        )}
        {warn && (
          <p className="flex items-start gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
            <AlertTriangle className="mt-px size-3 shrink-0" />
            {warn}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <ProviderSelect
          fullWidth={false}
          className={BARE_SELECT}
          menuClassName={BARE_MENU}
          value={route.provider}
          disabled={disabled}
          onChange={(v) => onProviderChange(v as AiProviderId)}
          providers={providers}
        />
        <span className="text-slate-300 dark:text-slate-700">·</span>
        {/* A plain dropdown of 300+ OpenRouter models is unusable — switch to a search box. */}
        {models.length > SEARCHABLE_FROM ? (
          <ModelCombo
            models={models}
            value={route.model}
            disabled={disabled}
            onChange={(v) => onChange({ provider: route.provider, model: v })}
          />
        ) : (
          <Select
            fullWidth={false}
            className={BARE_SELECT}
            menuClassName={BARE_MENU}
            value={route.model}
            disabled={disabled}
            onChange={(v) => onChange({ provider: route.provider, model: v })}
            options={models.map((m) => ({ value: m.id, label: m.label }))}
          />
        )}
      </div>
    </div>
  );
}

/** Above this many models the dropdown becomes a search box instead. */
const SEARCHABLE_FROM = 25;

/** How many hits to render — the list is long enough that the DOM cost is real. */
const COMBO_LIMIT = 50;

function ModelCombo({
  models,
  value,
  disabled,
  onChange,
}: {
  models: AiModelInfo[];
  value: string;
  disabled?: boolean;
  onChange: (model: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Esc, same as the design-system Select.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const needle = q.trim().toLowerCase();
  const hits = useMemo(() => {
    const list = needle
      ? models.filter((m) => m.id.toLowerCase().includes(needle) || m.label.toLowerCase().includes(needle))
      : models;
    return { total: list.length, rows: list.slice(0, COMBO_LIMIT) };
  }, [models, needle]);

  const current = models.find((m) => m.id === value);

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setQ("");
          setOpen((v) => !v);
        }}
        className={cn(
          "flex max-w-[240px] items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800",
        )}
      >
        <span className="truncate">{current?.label ?? value}</span>
        <ChevronDown className="size-3.5 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-1 w-[min(26rem,80vw)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 p-2 dark:border-slate-800">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onClear={() => setQ("")}
              placeholder={t("teacherAi.models.searchRouter")}
              leftIcon={<Search className="size-4" />}
            />
          </div>
          <div className="max-h-72 overflow-y-auto">
            {hits.rows.length === 0 && <p className="p-4 text-center text-sm text-slate-400">{t("teacherAi.models.noneMatch")}</p>}
            {hits.rows.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800",
                  m.id === value && "bg-cyan-50 dark:bg-cyan-500/10",
                )}
              >
                <span className="flex w-full items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {m.label}
                  </span>
                  {m.free && (
                    <span className="shrink-0 text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400">
                      free
                    </span>
                  )}
                  {m.audio && <Mic className="size-3 shrink-0 text-amber-500" aria-hidden />}
                </span>
                <span className="flex w-full items-center gap-2 text-[11px] text-slate-400">
                  <code className="min-w-0 flex-1 truncate">{m.id}</code>
                  <span className="shrink-0 tabular-nums">
                    {money(m.inPrice)}/{money(m.outPrice)}
                  </span>
                </span>
              </button>
            ))}
            {hits.total > hits.rows.length && (
              <p className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400 dark:border-slate-800">
                {t("teacherAi.models.remaining", { n: hits.total - hits.rows.length })}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab 3: Chi phí ───────────────────────────────────────────────────────────

function CostTab({ days }: { days: number }) {
  const from = useMemo(() => new Date(Date.now() - days * 86_400_000).toISOString(), [days]);
  const { data, isLoading } = useQuery({
    queryKey: ["ai-usage", days],
    queryFn: () => aiGatewayApi.usage(from),
    retry: false,
  });

  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["ai-usage"] });
  const clearAll = useMutation({
    mutationFn: () => aiGatewayApi.clearErrors(from),
    onSuccess: (r) => {
      toast.success(t("teacherAi.cost.cleared", { n: r.removed }));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const clearOne = useMutation({
    mutationFn: (id: string) => aiGatewayApi.clearError(id),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading || !data) return <p className="text-slate-500">{t("common.loading")}</p>;

  const tCost = data.total;
  const pct = (c: number) => (tCost.costUsd > 0 ? Math.round((c / tCost.costUsd) * 100) : 0);

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Activity} label={t("teacherAi.cost.calls")} value={num(tCost.calls)} />
            <Stat icon={ArrowDownToLine} label={t("teacherAi.cost.input")} value={num(tCost.inputTokens)} />
            <Stat icon={ArrowUpFromLine} label={t("teacherAi.cost.output")} value={num(tCost.outputTokens)} />
            <Stat icon={Coins} label={t("teacherAi.cost.paid")} value={money(tCost.costUsd)} accent />
          </div>
          <p className="mt-4 flex items-start gap-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
            <Info className="mt-px size-3.5 shrink-0 text-slate-400" />
            <span>{t("teacherAi.cost.note")}</span>
          </p>
          {tCost.failed > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
              {t("teacherAi.cost.failed", { failed: tCost.failed, calls: tCost.calls, percent: Math.round((tCost.failed / Math.max(tCost.calls, 1)) * 100) })}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h2 className="mb-1 font-bold text-slate-900 dark:text-white">{t("teacherAi.cost.byTask")}</h2>
          <p className="mb-4 text-sm text-slate-500">{t("teacherAi.cost.byTaskDesc")}</p>
          {data.byTask.length === 0 ? (
            <Empty />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-800">
                    <th className="pb-2 font-semibold">{t("teacherAi.cost.task")}</th>
                    <th className="pb-2 text-right font-semibold">{t("teacherAi.cost.call")}</th>
                    <th className="pb-2 text-right font-semibold">{t("teacherAi.cost.input")}</th>
                    <th className="pb-2 text-right font-semibold">{t("teacherAi.cost.output")}</th>
                    <th className="pb-2 text-right font-semibold">{t("teacherAi.gateway.cost")}</th>
                    <th className="pb-2 text-right font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byTask.map((row) => (
                    <tr key={row.task} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <td className="py-2">
                        <code className="text-xs text-slate-600 dark:text-slate-300">{row.task}</code>
                        {row.failed > 0 && <span className="ml-2 text-xs text-rose-500">{t("teacherAi.cost.failedCount", { n: row.failed })}</span>}
                      </td>
                      <td className="py-2 text-right text-slate-600 dark:text-slate-300">{num(row.calls)}</td>
                      <td className="py-2 text-right text-slate-600 dark:text-slate-300">{num(row.inputTokens)}</td>
                      <td className="py-2 text-right text-slate-600 dark:text-slate-300">{num(row.outputTokens)}</td>
                      <td className="py-2 text-right font-semibold text-slate-800 dark:text-slate-100">{money(row.costUsd)}</td>
                      <td className="py-2 text-right text-slate-400">{pct(row.costUsd)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h2 className="mb-4 font-bold text-slate-900 dark:text-white">{t("teacherAi.cost.byModel")}</h2>
          {data.byModel.length === 0 ? (
            <Empty />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400 dark:border-slate-800">
                    <th className="pb-2 font-semibold">{t("teacherAi.gateway.models")}</th>
                    <th className="pb-2 text-right font-semibold">{t("teacherAi.cost.call")}</th>
                    <th className="pb-2 text-right font-semibold">{t("teacherAi.cost.error")}</th>
                    <th className="pb-2 text-right font-semibold">{t("teacherAi.gateway.cost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byModel.map((row) => (
                    <tr key={`${row.provider}/${row.model}`} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                      <td className="py-2">
                        <span className="flex items-center gap-2">
                          <ProviderLogo id={row.provider} />
                          <code className="text-xs text-slate-600 dark:text-slate-300">{row.model}</code>
                        </span>
                      </td>
                      <td className="py-2 text-right text-slate-600 dark:text-slate-300">{num(row.calls)}</td>
                      <td className="py-2 text-right text-slate-600 dark:text-slate-300">{row.failed}</td>
                      <td className="py-2 text-right font-semibold text-slate-800 dark:text-slate-100">{money(row.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {data.recentErrors.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="mb-4 flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <h2 className="font-bold text-slate-900 dark:text-white">{t("teacherAi.cost.recentErrors")}</h2>
                <p className="mt-0.5 text-sm text-slate-500">{t("teacherAi.cost.recentErrorsDesc")}</p>
              </div>
              <Button
                variant="neutral"
                disabled={clearAll.isPending}
                onClick={async () => {
                  if (await confirmAsk({
                    title: t("teacherAi.cost.clearAllTitle", { n: tCost.failed }),
                    message: t("teacherAi.cost.clearAllMessage"),
                    confirmText: t("teacherAi.cost.clearAll"),
                    danger: true,
                  })) clearAll.mutate();
                }}
              >
                {clearAll.isPending ? <Loader2 className="size-4 animate-spin" /> : <Eraser className="size-4" />} {t("teacherAi.cost.clearAll")}
              </Button>
            </div>
            <div className="space-y-2">
              {data.recentErrors.map((e) => (
                <div key={e.id} className="flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50/50 p-2.5 text-xs dark:border-rose-900/50 dark:bg-rose-950/20">
                  <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-500">
                      <span>{new Date(e.createdAt).toLocaleString()}</span>
                      <code className="text-slate-600 dark:text-slate-300">{e.task}</code>
                      <span className="inline-flex items-center gap-1">
                        <ProviderLogo id={e.provider} className="size-3" /> {e.model}
                      </span>
                    </div>
                    <p className="mt-1 break-words text-rose-700 dark:text-rose-400">{e.error}</p>
                  </div>
                  <button
                    type="button"
                    aria-label={t("teacherAi.cost.clearOne")}
                    title={t("teacherAi.cost.clearOne")}
                    disabled={clearOne.isPending}
                    onClick={() => clearOne.mutate(e.id)}
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-500/15"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
            {tCost.failed > data.recentErrors.length && (
              <p className="mt-2 text-xs text-slate-400">{t("teacherAi.cost.moreErrors", { n: tCost.failed - data.recentErrors.length })}</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent }: { icon: typeof Coins; label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-800">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", accent ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400")}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="text-xs text-slate-500">{label}</div>
        <div className={cn("text-xl font-extrabold tabular-nums", accent ? "text-cyan-600 dark:text-cyan-400" : "text-slate-900 dark:text-white")}>{value}</div>
      </div>
    </div>
  );
}

const Empty = () => (
  <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
    <BarChart3 className="size-8 text-slate-300 dark:text-slate-600" />
    <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">{t("teacherAi.cost.emptyTitle")}</p>
    <p className="mt-0.5 max-w-sm text-xs text-slate-500">{t("teacherAi.cost.empty")}</p>
  </div>
);
