// Batch monthly reports: pick every learner or one class, then write and save each report with AI,
// a few at a time, with per-learner progress and a stop button. The tab must stay open while it runs.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Circle, Layers, Loader2, MinusCircle, Play, Square, Users, XCircle } from "lucide-react";
import { reportsApi, teacherUsersApi, type SavedReport, type TeacherUserRow } from "../../lib/api";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";
import { Button, Checkbox, Drawer, MonthPicker, Select, Textarea, ToggleRow } from "../ui";

type Status = "idle" | "running" | "done" | "empty" | "error";
type Row = { id: string; name: string; status: Status; error?: string };

const CONCURRENCY = 2;

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)).toISOString(), to: new Date(Date.UTC(y, m, 1)).toISOString() };
}

export function BatchReportDrawer({
  open,
  onClose,
  users,
  saved,
}: {
  open: boolean;
  onClose: () => void;
  users: TeacherUserRow[];
  saved: SavedReport[];
}) {
  const qc = useQueryClient();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [scope, setScope] = useState("classes");
  const [note, setNote] = useState("");
  const [skipEmpty, setSkipEmpty] = useState(true);
  const [overwrite, setOverwrite] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [running, setRunning] = useState(false);
  const stop = useRef(false);

  const classes = useMemo(() => {
    const m = new Map<string, { id: string; name: string; n: number }>();
    for (const u of users) for (const c of u.classes) m.set(c.id, { ...c, n: (m.get(c.id)?.n ?? 0) + 1 });
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [users]);

  const inScope = useMemo(
    () =>
      users
        .filter((u) => (scope === "all" ? true : scope === "classes" ? u.classes.length > 0 : u.classes.some((c) => c.id === scope)))
        .sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)),
    [users, scope],
  );
  const hasReport = useMemo(() => new Set(saved.filter((r) => r.month === month && r.userId).map((r) => r.userId!)), [saved, month]);

  // A new scope or month starts from "everyone in it", minus those already reported unless overwriting.
  useEffect(() => {
    if (running) return;
    setPicked(new Set(inScope.filter((u) => overwrite || !hasReport.has(u.id)).map((u) => u.id)));
    setRows(null);
    // Saved reports refreshing after a run must not wipe the progress list, so `saved` is not a dependency.
  }, [scope, month, overwrite, open, users.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const allOn = inScope.length > 0 && inScope.every((u) => picked.has(u.id));
  const someOn = inScope.some((u) => picked.has(u.id));
  const toggle = (id: string) =>
    setPicked((cur) => {
      const next = new Set(cur);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const run = async () => {
    const queue: Row[] = inScope.filter((u) => picked.has(u.id)).map((u) => ({ id: u.id, name: u.name || u.email, status: "idle" }));
    if (!queue.length) return;
    setRows(queue);
    setRunning(true);
    stop.current = false;
    const set = (id: string, patch: Partial<Row>) => setRows((cur) => cur?.map((r) => (r.id === id ? { ...r, ...patch } : r)) ?? cur);
    const { from, to } = monthRange(month);
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (!stop.current && next < queue.length) {
        const row = queue[next++];
        set(row.id, { status: "running" });
        try {
          const r = skipEmpty
            ? await teacherUsersApi.aiReportOrSkip(row.id, { from, to, month, teacher_note: note.trim() || undefined })
            : await teacherUsersApi.aiReport(row.id, { from, to, month, teacher_note: note.trim() || undefined });
          if (!r.report) {
            set(row.id, { status: "empty" });
            continue;
          }
          await reportsApi.save({ user_id: row.id, month, content: r.report });
          done++;
          set(row.id, { status: "done" });
        } catch (e) {
          set(row.id, { status: "error", error: e instanceof Error ? e.message : String(e) });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    setRunning(false);
    qc.invalidateQueries({ queryKey: ["reports"] });
    if (stop.current) toast.info(t("teacherMain.reports.batch.stopped", { n: done }));
    else toast.success(t("teacherMain.reports.batch.finished", { n: done }));
  };

  const counts = rows
    ? {
        total: rows.length,
        finished: rows.filter((r) => r.status !== "idle" && r.status !== "running").length,
        done: rows.filter((r) => r.status === "done").length,
        empty: rows.filter((r) => r.status === "empty").length,
        error: rows.filter((r) => r.status === "error").length,
      }
    : null;
  const nPicked = inScope.filter((u) => picked.has(u.id)).length;

  const scopeOptions = [
    { value: "classes", label: t("teacherMain.reports.batch.scopeClasses", { n: users.filter((u) => u.classes.length).length }) },
    { value: "all", label: t("teacherMain.reports.batch.scopeAll", { n: users.length }) },
    ...classes.map((c) => ({ value: c.id, label: `${c.name} · ${c.n}` })),
  ];

  return (
    <Drawer
      open={open}
      onClose={() => {
        if (!running) onClose();
      }}
      widthClassName="max-w-2xl"
      icon={<Layers className="size-5" />}
      title={t("teacherMain.reports.batch.title")}
      description={t("teacherMain.reports.batch.description")}
      footer={
        <div className="flex items-center gap-3">
          <span className="min-w-0 flex-1 text-sm text-slate-500">
            {counts
              ? t("teacherMain.reports.batch.progress", { finished: counts.finished, total: counts.total, done: counts.done, empty: counts.empty, error: counts.error })
              : t("teacherMain.reports.batch.picked", { n: nPicked })}
          </span>
          {running ? (
            <Button variant="neutral" onClick={() => (stop.current = true)}>
              <Square className="size-4" /> {t("teacherMain.reports.batch.stop")}
            </Button>
          ) : (
            <>
              <Button variant="neutral" onClick={onClose}>
                {t("common.close")}
              </Button>
              <Button disabled={!nPicked} onClick={run}>
                <Play className="size-4" /> {counts ? t("teacherMain.reports.batch.runAgain", { n: nPicked }) : t("teacherMain.reports.batch.run", { n: nPicked })}
              </Button>
            </>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label={t("teacherMain.reports.batch.scope")} options={scopeOptions} value={scope} onChange={setScope} disabled={running} />
          <MonthPicker label={t("teacherMain.reports.monthLabel")} value={month} onChange={setMonth} max={new Date().toISOString().slice(0, 7)} />
        </div>
        <Textarea label={t("teacherMain.reports.note")} rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("teacherMain.reports.batch.notePlaceholder")} disabled={running} />
        <div className="grid gap-2 sm:grid-cols-2">
          <ToggleRow icon={<MinusCircle className="size-5" />} title={t("teacherMain.reports.batch.skipEmpty")} desc={t("teacherMain.reports.batch.skipEmptyHint")} checked={skipEmpty} onChange={setSkipEmpty} />
          <ToggleRow icon={<Layers className="size-5" />} tone="amber" title={t("teacherMain.reports.batch.overwrite")} desc={t("teacherMain.reports.batch.overwriteHint")} checked={overwrite} onChange={setOverwrite} />
        </div>

        {counts && (
          <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-cyan-500 transition-all" style={{ width: `${(counts.finished / Math.max(1, counts.total)) * 100}%` }} />
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
            <Checkbox
              checked={allOn}
              indeterminate={!allOn && someOn}
              disabled={running || !inScope.length}
              onChange={(v) => setPicked(v ? new Set(inScope.map((u) => u.id)) : new Set())}
              aria-label={t("teacherMain.reports.batch.pickAll")}
            />
            <span className="flex-1 text-xs font-bold uppercase tracking-wide text-slate-500">
              <Users className="mr-1 inline size-3.5" /> {t("teacherMain.reports.batch.learners", { n: inScope.length })}
            </span>
          </div>
          <div className="max-h-[22rem] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {!inScope.length && <p className="p-6 text-center text-sm text-slate-400">{t("teacherMain.reports.batch.noLearners")}</p>}
            {inScope.map((u) => {
              const row = rows?.find((r) => r.id === u.id);
              return (
                <label key={u.id} className={cn("flex items-center gap-3 px-3 py-2 text-sm", !running && "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40")}>
                  <Checkbox checked={picked.has(u.id)} disabled={running} onChange={() => toggle(u.id)} aria-label={u.name || u.email} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-slate-700 dark:text-slate-200">{u.name || u.email}</span>
                    {row?.error && <span className="block truncate text-xs text-rose-500" title={row.error}>{row.error}</span>}
                  </span>
                  {hasReport.has(u.id) && !row && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800">{t("teacherMain.reports.batch.hasReport")}</span>
                  )}
                  {row && <RowStatus status={row.status} />}
                </label>
              );
            })}
          </div>
        </div>
        <p className="text-xs text-slate-400">{t("teacherMain.reports.batch.keepOpen")}</p>
      </div>
    </Drawer>
  );
}

function RowStatus({ status }: { status: Status }) {
  const map: Record<Status, { icon: typeof Circle; cls: string; label: string }> = {
    idle: { icon: Circle, cls: "text-slate-300 dark:text-slate-600", label: t("teacherMain.reports.batch.waiting") },
    running: { icon: Loader2, cls: "animate-spin text-cyan-500", label: t("teacherMain.reports.batch.writing") },
    done: { icon: CheckCircle2, cls: "text-emerald-500", label: t("teacherMain.reports.batch.saved") },
    empty: { icon: MinusCircle, cls: "text-slate-400", label: t("teacherMain.reports.batch.empty") },
    error: { icon: XCircle, cls: "text-rose-500", label: t("teacherMain.reports.batch.failed") },
  };
  const s = map[status];
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
      <s.icon className={cn("size-4", s.cls)} /> {s.label}
    </span>
  );
}
