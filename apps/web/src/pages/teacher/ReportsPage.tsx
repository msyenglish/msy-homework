import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ClipboardPaste, Copy, FileText, Layers, Link2, Plus, Save, Search, Sparkles, Trash2 } from "lucide-react";
import { reportsApi, studentsApi, teacherUsersApi, type SavedReport } from "../../lib/api";
import { buildReportPrompt } from "../../lib/reportPrompt";
import { fmtDate } from "../../lib/format";
import { useHistoryState, useUrlState } from "../../lib/navState";
import Drawer from "../../components/Drawer";
import { HeroDecor } from "../../components/HeroDecor";
import { BatchReportDrawer } from "../../components/report/BatchReportDrawer";
import { Button, Card, CardContent, MonthPicker, Select, Textarea } from "../../components/ui";
import { t } from "../../i18n";

function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1)).toISOString();
  const to = new Date(Date.UTC(y, m, 1)).toISOString();
  return { from, to };
}

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  return t("teacherMain.reports.month", { month: Number(mo), year: y });
}

// Bóc JSON từ text dán vào (chịu được ```json fences và chữ thừa quanh JSON).
function parseLoose(text: string): any | null {
  const t = text.trim();
  if (!t) return null;
  const stripped = t
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    /* thử tìm khối {…} */
  }
  const a = stripped.indexOf("{");
  const b = stripped.lastIndexOf("}");
  if (a >= 0 && b > a) {
    try {
      return JSON.parse(stripped.slice(a, b + 1));
    } catch {
      /* bỏ qua */
    }
  }
  return null;
}

// Ngữ cảnh 1 báo cáo đang xem/soạn trong drawer (mới tạo hoặc mở từ mục đã lưu).
// `ownerKey` mã hóa CẢ hai thế giới trong một chuỗi: "u:<id>" = thành viên lớp (users),
// còn lại = học sinh cũ (students, dữ liệu lịch sử).
type ActiveReport = { id?: string; slug?: string | null; ownerKey: string; studentName: string; month: string; content: string };

const isUserKey = (k: string) => k.startsWith("u:");
const rawId = (k: string) => (isUserKey(k) ? k.slice(2) : k);
/** Thân báo cáo gửi lên server: đúng một trong student_id / user_id. */
const ownerBody = (k: string) => (isUserKey(k) ? { user_id: rawId(k) } : { student_id: k });

export default function ReportsPage() {
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const { data: studentsData } = useQuery({ queryKey: ["students"], queryFn: studentsApi.list });
  // Thành viên lớp — nay là người nhận báo cáo chính; học sinh cũ chỉ còn là lịch sử.
  const { data: usersData } = useQuery({ queryKey: ["teacher-users"], queryFn: () => teacherUsersApi.list() });
  const students = studentsData?.items ?? [];

  const { data: savedData } = useQuery({ queryKey: ["reports"], queryFn: () => reportsApi.list() });
  const saved = savedData?.items ?? [];

  const [studentId, setStudentId] = useState(params.get("student") || "");
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [teacherNote, setTeacherNote] = useState("");
  const [prompt, setPrompt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<ActiveReport | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Create-report form — collapsed by default, toggled from the hero button. Throw-away view
  // state (not worth a URL) that should still come back on Back, hence useHistoryState.
  const [showForm, setShowForm] = useHistoryState("showForm", false);
  // Saved-reports filters — shareable via the query string; typing in the search box only
  // replaces the entry, changing a filter pushes one (Back undoes it), same as ExercisesPage.
  const [q, setQ] = useUrlState("q");
  const [filterStudent, setFilterStudent] = useUrlState("fstudent", "", { push: true });
  const [filterYear, setFilterYear] = useUrlState("fyear", "", { push: true });

  // Import báo cáo từ AI ngoài (dán JSON hoặc text).
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importStudentId, setImportStudentId] = useState("");
  const [importMonth, setImportMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [importing, setImporting] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);

  // Tự nhận diện học sinh/tháng từ JSON dán vào.
  useEffect(() => {
    const p = parseLoose(importText);
    if (p && typeof p === "object") {
      if (typeof p.month === "string" && /^\d{4}-\d{2}$/.test(p.month)) setImportMonth(p.month);
      if (typeof p.student_id === "string" && students.some((s) => s.id === p.student_id)) {
        setImportStudentId(p.student_id);
      }
    }
  }, [importText, students]);

  const users = usersData?.items ?? [];
  const options = [
    { value: "", label: t("teacherMain.reports.selectLearner") },
    ...users.map((u) => ({ value: `u:${u.id}`, label: u.name || u.email })),
    ...students.map((s) => ({ value: s.id, label: t("teacherMain.reports.legacyStudent", { name: s.name }) })),
  ];
  /** Tên hiển thị của người đang chọn — tra bên users trước, rồi students. */
  const ownerName = (k: string) =>
    isUserKey(k)
      ? (() => {
          const u = users.find((x) => x.id === rawId(k));
          return u ? u.name || u.email : "";
        })()
      : students.find((s) => s.id === k)?.name ?? "";

  // Danh sách năm & học sinh có trong báo cáo đã lưu (cho bộ lọc).
  const years = [...new Set(saved.map((r) => r.month.slice(0, 4)))].sort().reverse();
  // Khóa lọc gộp cả hai thế giới (xem `ownerKey`) để một dropdown lọc được cả hai.
  const savedStudents = [
    ...new Map(saved.map((r) => [r.userId ? `u:${r.userId}` : r.studentId ?? "", r.studentName])).entries(),
  ].filter(([k]) => k);
  const yearOptions = [{ value: "", label: t("teacherMain.reports.allYears") }, ...years.map((y) => ({ value: y, label: y }))];
  const studentFilterOptions = [
    { value: "", label: t("teacherMain.reports.allLearners") },
    ...savedStudents.map(([id, name]) => ({ value: id, label: name })),
  ];

  const filteredSaved = saved.filter((r) => {
    if (filterStudent && (r.userId ? `u:${r.userId}` : r.studentId ?? "") !== filterStudent) return false;
    if (filterYear && !r.month.startsWith(filterYear)) return false;
    if (q.trim()) {
      const s = q.trim().toLowerCase();
      if (!r.studentName.toLowerCase().includes(s) && !r.content.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  async function generate() {
    if (!studentId) return toast.error(t("teacherMain.reports.selectRequired"));
    const name = ownerName(studentId);
    if (!name) return;
    setLoading(true);
    try {
      const { from, to } = monthRange(month);
      const { mistakes } = isUserKey(studentId)
        ? await teacherUsersApi.mistakes(rawId(studentId), from, to)
        : await studentsApi.mistakes(studentId, from, to);
      setPrompt(buildReportPrompt({ studentId: rawId(studentId), studentName: name, month, mistakes, teacherNote }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherMain.reports.error"));
    } finally {
      setLoading(false);
    }
  }

  async function generateAi() {
    if (!studentId) return toast.error(t("teacherMain.reports.selectRequired"));
    const name = ownerName(studentId);
    if (!name) return;
    setAiLoading(true);
    try {
      const { from, to } = monthRange(month);
      const args = { from, to, month, teacher_note: teacherNote.trim() || undefined };
      const { report: text } = isUserKey(studentId)
        ? await teacherUsersApi.aiReport(rawId(studentId), args)
        : await studentsApi.aiReport(studentId, args);
      setActive({ ownerKey: studentId, studentName: name, month, content: text });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherMain.reports.createError"));
    } finally {
      setAiLoading(false);
    }
  }

  async function saveReport() {
    if (!active?.content.trim()) return;
    setSaving(true);
    try {
      await reportsApi.save({ ...ownerBody(active.ownerKey), month: active.month, content: active.content });
      toast.success(t("teacherMain.reports.saved"));
      qc.invalidateQueries({ queryKey: ["reports"] });
      setActive(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherMain.reports.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function doImport() {
    const p = parseLoose(importText);
    const content =
      p && typeof p === "object" && (p.report || p.content)
        ? String(p.report || p.content)
        : importText.trim();
    if (!content.trim()) return toast.error(t("teacherMain.reports.noContent"));
    if (!importStudentId) return toast.error(t("teacherMain.reports.selectStudent"));
    if (!/^\d{4}-\d{2}$/.test(importMonth)) return toast.error(t("teacherMain.reports.invalidMonth"));
    setImporting(true);
    try {
      await reportsApi.save({ student_id: importStudentId, month: importMonth, content: content.trim() });
      toast.success(t("teacherMain.reports.imported"));
      qc.invalidateQueries({ queryKey: ["reports"] });
      setImportOpen(false);
      setImportText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherMain.reports.importError"));
    } finally {
      setImporting(false);
    }
  }

  async function removeSaved(rep: SavedReport) {
    if (!confirm(t("teacherMain.reports.confirmDelete", { month: monthLabel(rep.month), name: rep.studentName }))) return;
    try {
      await reportsApi.remove(rep.id);
      toast.success(t("teacherMain.reports.deleted"));
      qc.invalidateQueries({ queryKey: ["reports"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherMain.reports.error"));
    }
  }

  function copyText(text: string, ok: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(ok),
      () => toast.error(t("teacherMain.reports.copyBlocked")),
    );
  }

  const reportUrl = (rep: { slug?: string | null; id?: string }) =>
    `${window.location.origin}/r/${rep.slug || rep.id}`;

  // Nội dung sẽ lưu khi import (bóc từ JSON hoặc dùng text thô).
  const importParsed = parseLoose(importText);
  const importContent =
    importParsed && typeof importParsed === "object" && (importParsed.report || importParsed.content)
      ? String(importParsed.report || importParsed.content)
      : importText.trim();

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-7 pb-24">
      {/* Hero header */}
      <header className="relative mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5 shadow-sm sm:p-6 dark:border-slate-800 dark:from-slate-900 dark:to-slate-950">
        {/* decorative dot-grid + hexagon */}
        <HeroDecor seed="teacher-reports" className="text-violet-500/20 dark:text-violet-400/15" />

        <div className="relative flex flex-wrap items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-500 text-white shadow-lg shadow-violet-500/30 sm:size-16">
            <FileText className="size-7 sm:size-8" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">{t("teacherMain.reports.title")}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-500">
              <span>{t("teacherMain.reports.hero")} <span className="font-bold text-slate-700 dark:text-slate-200">{users.length + students.length}</span> {t("teacherMain.reports.studentsMonth")}</span>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <span className="inline-flex items-center gap-1"><Sparkles className="size-3.5 text-violet-500" /> {t("teacherMain.reports.auto")}</span>
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button size="lg" variant="outline" onClick={() => setImportOpen(true)}>
              <ClipboardPaste className="size-4" /> Import
            </Button>
            <Button size="lg" variant="outline" onClick={() => setBatchOpen(true)}>
              <Layers className="size-4" /> {t("teacherMain.reports.batch.open")}
            </Button>
            <Button size="lg" onClick={() => setShowForm((v) => !v)}>
              {showForm ? (
                <>
                  <ChevronDown className="size-4" /> {t("teacherMain.reports.collapse")}
                </>
              ) : (
                <>
                  <Plus className="size-4" /> {t("teacherMain.reports.create")}
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {showForm && (
        <Card className="mb-2">
          <CardContent className="space-y-4 p-6">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label={t("teacherMain.reports.learner")} options={options} value={studentId} onChange={setStudentId} />
              <MonthPicker label={t("teacherMain.reports.monthLabel")} value={month} onChange={setMonth} max={new Date().toISOString().slice(0, 7)} />
            </div>
            <Textarea label={t("teacherMain.reports.note")} rows={2} value={teacherNote} onChange={(e) => setTeacherNote(e.target.value)} placeholder={t("teacherMain.reports.notePlaceholder")} />
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="lg" disabled={aiLoading || !studentId} onClick={generateAi}>
                <Sparkles className="size-4" /> {aiLoading ? t("teacherMain.reports.aiWriting") : t("teacherMain.reports.aiCreate")}
              </Button>
              <Button size="lg" variant="outline" disabled={loading || !studentId} onClick={generate}>
                <FileText className="size-4" /> {loading ? t("teacherMain.reports.summarizing") : t("teacherMain.reports.exportPrompt")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Báo cáo đã lưu */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {t("teacherMain.reports.savedReports")}
            {saved.length > 0 && (
              <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {saved.length}
              </span>
            )}
          </h2>
        </div>

        {saved.length > 0 && (
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t("teacherMain.reports.search")}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-sm text-slate-800 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex-1 sm:w-56 sm:flex-none">
                <Select options={studentFilterOptions} value={filterStudent} onChange={setFilterStudent} />
              </div>
              <div className="flex-1 sm:w-40 sm:flex-none">
                <Select options={yearOptions} value={filterYear} onChange={setFilterYear} />
              </div>
            </div>
          </div>
        )}

        {saved.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-slate-500">
              {t("teacherMain.reports.empty")} <span className="font-semibold">{t("common.save")}</span>.
            </CardContent>
          </Card>
        ) : filteredSaved.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-slate-500">
              {t("teacherMain.reports.noMatch")}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredSaved.map((rep) => (
              <Card key={rep.id} className="flex flex-col border border-slate-200/70 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() =>
                    setActive({ id: rep.id, slug: rep.slug, ownerKey: rep.userId ? `u:${rep.userId}` : rep.studentId ?? "", studentName: rep.studentName, month: rep.month, content: rep.content })
                  }
                  className="flex-1 rounded-t-2xl p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <span className="truncate font-bold text-slate-800 dark:text-slate-100">{rep.studentName}</span>
                    <span className="shrink-0 rounded-md bg-violet-50 px-1.5 py-0.5 text-xs font-semibold text-violet-600 dark:bg-violet-500/10 dark:text-violet-300">
                      {monthLabel(rep.month)}
                    </span>
                  </div>
                  <p className="line-clamp-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{rep.content}</p>
                </button>
                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 dark:border-slate-800">
                  <span className="text-[11px] text-slate-400">{fmtDate(rep.updatedAt)}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => copyText(reportUrl(rep), t("teacherMain.reports.copiedParent"))}
                      title={t("teacherMain.reports.copyParent")}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-500/10 dark:hover:text-violet-300"
                    >
                      <Link2 className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => copyText(rep.content, t("teacherMain.reports.copiedReport"))}
                      title={t("teacherMain.reports.copyContent")}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                    >
                      <Copy className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSaved(rep)}
                      title={t("common.delete")}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Prompt để dán web ngoài */}
      <Drawer
        open={!!prompt}
        onClose={() => setPrompt(null)}
        width="max-w-2xl"
        icon={<Sparkles className="size-5" />}
        title={t("teacherMain.reports.promptTitle")}
        description={t("teacherMain.reports.promptDescription")}
        footer={
          <Button onClick={() => copyText(prompt || "", t("teacherMain.reports.copiedPrompt"))}>
            <Copy className="size-4" /> Copy prompt
          </Button>
        }
      >
        <Textarea rows={22} className="font-mono text-xs" value={prompt || ""} readOnly />
      </Drawer>

      {/* Báo cáo AI — xem / sửa / lưu */}
      <Drawer
        open={!!active}
        onClose={() => setActive(null)}
        width="max-w-2xl"
        icon={<FileText className="size-5" />}
        title={active ? `${t("teacherMain.reports.report")} — ${active.studentName}` : t("teacherMain.reports.report")}
        description={active ? t("teacherMain.reports.reportDescription", { month: monthLabel(active.month) }) : undefined}
        footer={
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => copyText(active?.content || "", t("teacherMain.reports.copiedReport"))}>
                <Copy className="size-4" /> Copy
              </Button>
              {active?.id && (
                <Button variant="outline" onClick={() => copyText(reportUrl(active), t("teacherMain.reports.copiedParent"))}>
                  <Link2 className="size-4" /> Link
                </Button>
              )}
            </div>
            <Button disabled={saving || !active?.content.trim()} onClick={saveReport}>
              <Save className="size-4" /> {saving ? t("common.saving") : t("teacherMain.reports.saveReport")}
            </Button>
          </div>
        }
      >
        <Textarea
          rows={24}
          className="text-sm leading-relaxed"
          value={active?.content || ""}
          onChange={(e) => setActive((a) => (a ? { ...a, content: e.target.value } : a))}
        />
      </Drawer>

      <BatchReportDrawer open={batchOpen} onClose={() => setBatchOpen(false)} users={users} saved={saved} />

      {/* Import báo cáo từ AI ngoài */}
      <Drawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        width="max-w-2xl"
        icon={<ClipboardPaste className="size-5" />}
        title={t("teacherMain.reports.importTitle")}
        description={t("teacherMain.reports.importDescription")}
        footer={
          <Button disabled={importing || !importContent.trim() || !importStudentId} onClick={doImport}>
            <Save className="size-4" /> {importing ? t("common.saving") : t("teacherMain.reports.importAction")}
          </Button>
        }
      >
        <div className="space-y-4">
          <Textarea
            label={t("teacherMain.reports.jsonLabel")}
            rows={12}
            className="font-mono text-xs"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder={t("teacherMain.reports.jsonPlaceholder")}
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select label={t("teacherMain.reports.learner")} options={options} value={importStudentId} onChange={setImportStudentId} />
            <MonthPicker label={t("teacherMain.reports.monthLabel")} value={importMonth} onChange={setImportMonth} max={new Date().toISOString().slice(0, 7)} />
          </div>
          {importContent.trim() ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/40">
              <p className="mb-1 text-xs font-semibold text-slate-500">{t("teacherMain.reports.preview")}</p>
              <p className="line-clamp-4 whitespace-pre-wrap text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                {importContent}
              </p>
            </div>
          ) : (
            <p className="text-xs text-slate-400">{t("teacherMain.reports.noPreview")}</p>
          )}
        </div>
      </Drawer>
    </div>
  );
}
