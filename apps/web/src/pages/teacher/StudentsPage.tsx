// LEARNERS — every account in one list. A class is a label and a filter on the account, not a
// separate kind of user. Card click opens the learner's detail page; the row menu holds the rest.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Ban,
  CheckCircle2,
  ClipboardList,
  GraduationCap,
  IdCard,
  Lock,
  Mail,
  MoreVertical,
  Pencil,
  Plus,
  School,
  Search,
  Tags,
  Trash2,
  Trophy,
  Users,
  VenetianMask,
} from "lucide-react";
import { anonAlias, formatPoints } from "@msyen/shared";
import { classesApi, levelsApi, teacherUsersApi, type TeacherUserRow, type TrashedUser } from "../../lib/api";
import { Avatar } from "../../components/Avatar";
import { Badge } from "../../components/Badge";
import ClassDrawer from "../../components/ClassDrawer";
import { FilterPopover, type FilterGroup } from "../../components/FilterPopover";
import { HeroDecor } from "../../components/HeroDecor";
import LevelsDrawer from "../../components/LevelsDrawer";
import { LevelBadge } from "../../components/LevelBadge";
import PlainUserDrawer from "../../components/PlainUserDrawer";
import { AvatarPresence, PresenceLabel } from "../../components/PresenceDot";
import StudentAccountDrawer from "../../components/StudentAccountDrawer";
import { TeacherUserDrawer } from "../../components/TeacherUserDrawer";
import TrashDrawer from "../../components/TrashDrawer";
import UserAssignDrawer from "../../components/UserAssignDrawer";
import { confirmAsk } from "../../components/confirm";
import { Button, Input, Pagination } from "../../components/ui";
import { cn } from "../../lib/utils";
import { scrollPageTop } from "../../lib/navState";
import { t } from "../../i18n";

type ClassFilter = "all" | "any" | "none" | string;
type StatusFilter = "all" | "active" | "suspended";
type ActivityFilter = "all" | "online" | "today" | "week" | "inactive";
type SortMode = "new" | "seen";

const DEFAULT_PER_PAGE = 20;

/** Placeholder `<code>@lop.msyen.local` emails are a technical stand-in — never show them. */
const realEmail = (e: string) => (e.endsWith("@lop.msyen.local") ? null : e);

export default function StudentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Filters + page live in the URL so reload/Back land on the same view. Read straight from
  // `searchParams` every render: a useState snapshot would go stale on a POP navigation.
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const klass = (searchParams.get("class") as ClassFilter) ?? "all";
  const status = (searchParams.get("status") as StatusFilter) ?? "all";
  const level = searchParams.get("level") ?? "all";
  const activity = (searchParams.get("activity") as ActivityFilter) ?? "all";
  const provider = searchParams.get("provider") ?? "all";
  const sort = (searchParams.get("sort") as SortMode) ?? "new";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const perPage = Number(searchParams.get("per")) || DEFAULT_PER_PAGE;

  // Several params as ONE navigation — separate calls would each diff the same stale snapshot.
  const patchParams = useCallback(
    (patch: Record<string, string | null>, opts?: { push?: boolean; resetPage?: boolean }) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (!v) next.delete(k);
          else next.set(k, v);
        }
        if (opts?.resetPage) next.delete("page");
        return next;
      }, { replace: !opts?.push });
    },
    [setSearchParams],
  );

  const [search, setSearch] = useState(urlQuery);
  const [searchQuery, setSearchQuery] = useState(urlQuery);
  useEffect(() => {
    const t = setTimeout(() => setSearchQuery(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if (searchQuery === urlQuery) return;
    patchParams({ q: searchQuery || null }, { resetPage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);
  useEffect(() => {
    if (urlQuery === search) return;
    setSearch(urlQuery);
    setSearchQuery(urlQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery]);

  const setParam = (key: string, v: string, def: string) => patchParams({ [key]: v !== def ? v : null }, { push: true, resetPage: true });
  const setPage = (p: number) => patchParams({ page: p > 1 ? String(p) : null }, { push: true });
  const setPerPage = (p: number) => patchParams({ per: p !== DEFAULT_PER_PAGE ? String(p) : null }, { push: true, resetPage: true });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["teacher-users", { q: searchQuery, klass, status, level, activity, provider, sort, page, perPage }],
    queryFn: () =>
      teacherUsersApi.list({
        q: searchQuery,
        class_id: klass === "all" ? "" : klass,
        status: status === "all" ? "" : status === "active" ? "active" : "inactive",
        level: level === "all" ? "" : level,
        activity: activity === "all" ? "" : activity,
        provider: provider === "all" ? "" : provider,
        sort: sort === "new" ? "" : sort,
        page,
        per_page: perPage,
      }),
    placeholderData: (prev) => prev,
    // Presence goes stale fast — refresh while the tab is open.
    refetchInterval: 60_000,
  });
  const { data: levelsData } = useQuery({ queryKey: ["levels"], queryFn: levelsApi.list });
  const { data: classData } = useQuery({ queryKey: ["classes"], queryFn: classesApi.list });

  const [showClasses, setShowClasses] = useState(false);
  const [manageLevels, setManageLevels] = useState(false);
  const [creating, setCreating] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [editing, setEditing] = useState<TeacherUserRow | null>(null);
  const [assigning, setAssigning] = useState<TeacherUserRow | null>(null);
  const [profile, setProfile] = useState<TeacherUserRow | null>(null);

  const users = data?.items ?? [];
  const levels = levelsData?.items ?? [];
  const classes = useMemo(() => classData?.items ?? [], [classData]);
  const stats = data?.stats ?? { total: 0, active: 0, email: 0, google: 0, no_level: 0, online: 0, in_class: 0 };
  // Placeholder for counts until the first response, so they do not flash 0 → real value.
  const n = (v: number) => (data ? v : "–");
  const total = data?.total ?? 0;
  const profileFresh = profile ? (users.find((u) => u.id === profile.id) ?? profile) : null;

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["teacher-users"] });
    qc.invalidateQueries({ queryKey: ["classes"] });
  };
  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => teacherUsersApi.setActive(id, active),
    onSuccess: (_r, v) => {
      refresh();
      toast.success(v.active ? t("teacherMain.students.toast.unlocked") : t("teacherMain.students.toast.locked"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherMain.students.toast.updatedError")),
  });
  const setAnon = useMutation({
    mutationFn: ({ id, anonymous }: { id: string; anonymous: boolean }) => teacherUsersApi.setAnon(id, anonymous),
    onSuccess: (_r, v) => {
      refresh();
      toast.success(v.anonymous ? t("teacherMain.students.toast.anonOn") : t("teacherMain.students.toast.anonOff"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherMain.students.toast.updatedError")),
  });
  const remove = useMutation({
    mutationFn: (id: string) => teacherUsersApi.remove(id),
    onSuccess: () => {
      refresh();
      toast.success(t("teacherMain.exercises.toast.trashed"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherMain.students.toast.deleteError")),
  });

  async function handleRemove(u: TeacherUserRow) {
    const ok = await confirmAsk({
      title: t("teacherMain.students.confirm.deleteTitle", { name: u.name || u.email }),
      message: t("teacherMain.students.confirm.deleteMessage"),
      confirmText: t("teacherMain.students.confirm.deleteAction"),
      danger: true,
    });
    if (ok) remove.mutate(u.id);
  }

  const filtersOn = !!searchQuery || klass !== "all" || status !== "all" || level !== "all" || activity !== "all" || provider !== "all";

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-7 pb-24">
      <header className="relative mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        <HeroDecor seed="teacher-students" />
        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-lg shadow-cyan-500/30 sm:size-16">
            <GraduationCap className="size-7 sm:size-8" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t("teacherMain.students.title")}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
              <span><span className="font-bold text-cyan-600 dark:text-cyan-400">{n(stats.total)}</span> {t("teacherMain.students.accounts")}</span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span><span className="font-bold text-slate-700 dark:text-slate-200">{n(stats.in_class)}</span> {t("teacherMain.students.inClass")}</span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full bg-emerald-500" />
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{n(stats.online)}</span> {t("teacherMain.students.online")}
              </span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span><span className="font-bold text-slate-700 dark:text-slate-200">{classes.length}</span> {t("teacherMain.students.classes")}</span>
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <Button variant="outline" size="lg" className="flex-1 sm:flex-none" onClick={() => setShowClasses(true)}>
              <School className="size-4" /> {t("teacherMain.students.classrooms")}
            </Button>
            <Button variant="outline" size="lg" className="flex-1 sm:flex-none" onClick={() => setManageLevels(true)}>
              <Tags className="size-4" /> {t("teacherMain.students.levels")}
            </Button>
            <Button size="lg" className="flex-1 sm:flex-none" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> {t("teacherMain.students.create")}
            </Button>
          </div>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="min-w-52 flex-1">
          <Input className="h-11 py-0" leftIcon={<Search className="size-4" />} placeholder={t("teacherMain.students.search")} value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch("")} />
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterChip active={klass === "all"} count={n(stats.total)} onClick={() => setParam("class", "all", "all")}>{t("common.all")}</FilterChip>
          <FilterChip active={klass === "any"} count={n(stats.in_class)} onClick={() => setParam("class", "any", "all")}>{t("teacherMain.students.filter.inClass")}</FilterChip>
          <FilterChip active={klass === "none"} count={n(stats.total - stats.in_class)} onClick={() => setParam("class", "none", "all")}>{t("teacherMain.students.filter.noClass")}</FilterChip>
          <FilterPopover
            groups={[
              {
                label: t("teacherMain.students.filter.class"),
                value: klass === "any" || klass === "none" ? "all" : klass,
                defaultValue: "all",
                onChange: (v) => setParam("class", v, "all"),
                options: [{ value: "all", label: t("common.all") }, ...classes.map((c) => ({ value: c.id, label: c.name }))],
              },
              {
                label: t("teacherMain.students.filter.level"),
                value: level,
                defaultValue: "all",
                onChange: (v) => setParam("level", v, "all"),
                options: [
                  { value: "all", label: t("common.all") },
                  ...levels.map((lv) => ({ value: lv.id, label: lv.name })),
                  ...(stats.no_level > 0 ? [{ value: "none", label: t("teacherMain.students.filter.none") }] : []),
                ],
              },
              {
                label: t("teacherMain.students.filter.status"),
                value: status,
                defaultValue: "all",
                onChange: (v) => setParam("status", v, "all"),
                options: [
                  { value: "all", label: t("common.all") },
                  { value: "active", label: t("teacherMain.students.filter.active") },
                  { value: "suspended", label: t("teacherMain.students.filter.suspended") },
                ],
              },
              {
                label: t("teacherMain.students.filter.activity"),
                value: activity,
                defaultValue: "all",
                onChange: (v) => setParam("activity", v, "all"),
                options: [
                  { value: "all", label: t("common.all") },
                  { value: "online", label: t("teacherMain.students.filter.online") },
                  { value: "today", label: t("teacherMain.students.filter.today") },
                  { value: "week", label: t("teacherMain.students.filter.week") },
                  { value: "inactive", label: t("teacherMain.students.filter.inactive") },
                ],
              },
              {
                label: t("teacherMain.students.filter.login"),
                value: provider,
                defaultValue: "all",
                onChange: (v) => setParam("provider", v, "all"),
                options: [
                  { value: "all", label: t("common.all") },
                  { value: "password", label: `Email (${stats.email})` },
                  { value: "google", label: `Google (${stats.google})` },
                ],
              },
              {
                label: t("teacherMain.students.filter.sort"),
                value: sort,
                defaultValue: "new",
                onChange: (v) => setParam("sort", v, "new"),
                options: [
                  { value: "new", label: t("teacherMain.students.filter.new") },
                  { value: "seen", label: t("teacherMain.students.filter.seen") },
                ],
              },
            ] satisfies FilterGroup[]}
          />
        </div>
        <Button variant="neutral" className="ml-auto" onClick={() => setTrashOpen(true)}>
          <Trash2 className="size-4" /> {t("teacherMain.exercises.trash")}
        </Button>
      </div>

      {isLoading ? (
        <p className="py-16 text-center text-slate-500">{t("common.loading")}</p>
      ) : users.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 p-14 text-center dark:border-slate-700">
          <div className="mb-3 flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Users className="size-7" />
          </div>
          <p className="font-semibold text-slate-600 dark:text-slate-300">{filtersOn ? t("teacherMain.students.empty.noMatch") : t("teacherMain.students.empty.none")}</p>
          <p className="mt-1 text-sm text-slate-500">
            {filtersOn ? t("teacherMain.students.empty.change") : t("teacherMain.students.empty.hint")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <div
              key={u.id}
              onClick={() => navigate(`/teacher/students/${u.id}`)}
              className={cn(
                "flex cursor-pointer flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-cyan-400/60 sm:flex-row sm:items-center sm:gap-4 dark:border-slate-800 dark:bg-slate-900",
                !u.active && "opacity-60",
              )}
            >
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <AvatarPresence lastSeenAt={u.last_seen_at}>
                  <Avatar seed={u.id} src={u.avatar_url} size={52} className="!rounded-2xl" points={u.points} />
                </AvatarPresence>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-bold text-slate-900 dark:text-white">{u.name || t("teacherMain.students.unnamed")}</h3>
                    {u.level && <LevelBadge level={u.level} />}
                    {u.classes.map((c) => (
                      <Badge key={c.id} tone="cyan">{c.name}</Badge>
                    ))}
                    {!u.active && (
                      <Badge tone="rose">
                        <Lock className="size-3" /> {t("teacherMain.students.lock")}
                      </Badge>
                    )}
                    {u.anonymous && (
                      <span title={t("teacherMain.students.anonymous", { name: anonAlias(u.id) })}>
                        <Badge tone="violet">
                          <VenetianMask className="size-3" /> {t("teacherMain.students.anonBadge")}
                        </Badge>
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                    {realEmail(u.email) && (
                      <span className="inline-flex min-w-0 items-center gap-1 truncate text-cyan-700/80 dark:text-cyan-400/80">
                        <Mail className="size-3.5 shrink-0" /> {realEmail(u.email)}
                      </span>
                    )}
                    <PresenceLabel lastSeenAt={u.last_seen_at} />
                  </p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {u.assigned > 0 ? (
                      <>
                        <span className="font-semibold text-slate-600 dark:text-slate-300">{u.assigned}</span> {t("teacherMain.students.assigned")}
                        {u.not_done > 0 && <span className="ml-1 text-amber-600">· {u.not_done} {t("teacherMain.students.notDone")}</span>}
                      </>
                    ) : (
                      <span className="text-slate-400">{t("teacherMain.students.noAssigned")}</span>
                    )}
                    <span className="ml-1 text-slate-400">· {u.exercises_done} {t("teacherMain.students.done")}</span>
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0 sm:justify-end" onClick={(e) => e.stopPropagation()}>
                <span className="inline-flex items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                  <Trophy className="size-4" /> {formatPoints(u.points)}
                </span>
                <Button size="sm" variant="outline" onClick={() => setAssigning(u)}><ClipboardList className="size-3.5" /> {t("teacherMain.students.assign")}</Button>
                <Button size="sm" variant="secondary" onClick={() => setEditing(u)}><Pencil className="size-3.5" /> {t("common.edit")}</Button>
                <RowMenu
                  active={u.active}
                  busy={setActive.isPending || remove.isPending}
                  onProfile={() => setProfile(u)}
                  onToggleActive={() => setActive.mutate({ id: u.id, active: !u.active })}
                  onRemove={() => handleRemove(u)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {total > 0 && (
        <Pagination
          className={cn("mt-5", isFetching && "opacity-60")}
          page={page}
          perPage={perPage}
          total={total}
          onPage={(p) => {
            setPage(p);
            scrollPageTop();
          }}
          onPerPage={setPerPage}
          unit={t("teacherMain.students.unit", { n: total })}
        />
      )}

      <ClassDrawer open={showClasses} onClose={() => { setShowClasses(false); refresh(); }} />
      <LevelsDrawer open={manageLevels} onClose={() => setManageLevels(false)} />
      {creating && <PlainUserDrawer onClose={() => setCreating(false)} onSaved={refresh} />}
      {editing && <StudentAccountDrawer student={{ ...editing, name: editing.name ?? null, level_id: editing.level_id ?? null }} onClose={() => setEditing(null)} onSaved={refresh} />}
      {assigning && <UserAssignDrawer user={{ ...assigning, name: assigning.name ?? null, level_id: assigning.level_id ?? null }} onClose={() => setAssigning(null)} onSaved={refresh} />}
      <TeacherUserDrawer
        user={profileFresh}
        onToggleAnon={(anonymous) => profileFresh && setAnon.mutate({ id: profileFresh.id, anonymous })}
        anonPending={setAnon.isPending}
        onClose={() => setProfile(null)}
      />
      <TrashDrawer<TrashedUser>
        open={trashOpen}
        onClose={() => setTrashOpen(false)}
        title={t("teacherMain.students.trashTitle")}
        description={t("teacherMain.students.trashDescription")}
        icon={<Trash2 className="size-5" />}
        queryKey="teacher-users-trash"
        fetchItems={teacherUsersApi.trash}
        itemKey={(u) => u.id}
        deletedAt={(u) => u.deleted_at}
        restore={(u) => teacherUsersApi.restore(u.id)}
        purge={(u) => teacherUsersApi.purge(u.id)}
        invalidateKeys={["teacher-users"]}
        emptyText={t("teacherMain.students.trashEmpty")}
        renderItem={(u) => (
          <div className="flex items-center gap-2.5">
            <Avatar seed={u.id} src={u.avatar_url} size={36} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-800 dark:text-slate-100">{u.name || u.email}</p>
              <p className="truncate text-xs text-slate-500">{u.name ? u.email : u.provider === "google" ? "Google" : "Email"}</p>
            </div>
          </div>
        )}
      />
    </div>
  );
}

// Row menu: profile · lock / unlock · delete.
function RowMenu({
  active,
  busy,
  onProfile,
  onToggleActive,
  onRemove,
}: {
  active: boolean;
  busy: boolean;
  onProfile: () => void;
  onToggleActive: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium transition hover:bg-slate-50 dark:hover:bg-slate-800";
  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={busy}
        aria-label={t("teacherMain.students.options")}
        className="flex size-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <MoreVertical className="size-5" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-900">
          <button type="button" className={cn(item, "text-slate-700 dark:text-slate-200")} onClick={run(onProfile)}>
            <IdCard className="size-4 text-cyan-500" /> {t("teacherMain.students.profile")}
          </button>
          <button type="button" className={cn(item, "text-slate-700 dark:text-slate-200")} onClick={run(onToggleActive)}>
            {active ? (
              <>
                <Ban className="size-4 text-amber-500" /> {t("teacherMain.students.lock")}
              </>
            ) : (
              <>
                <CheckCircle2 className="size-4 text-emerald-500" /> {t("teacherMain.students.unlock")}
              </>
            )}
          </button>
          <div className="my-1 h-px bg-slate-100 dark:bg-slate-800" />
          <button type="button" className={cn(item, "text-rose-600 dark:text-rose-400")} onClick={run(onRemove)}>
            <Trash2 className="size-4" /> {t("teacherMain.students.deleteAccount")}
          </button>
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, count, onClick, children }: { active: boolean; count: number | string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-11 items-center gap-1.5 rounded-xl border px-3.5 text-sm font-semibold transition",
        active
          ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
      )}
    >
      {children}
      <span className={active ? "text-cyan-500" : "text-slate-400"}>{count}</span>
    </button>
  );
}
