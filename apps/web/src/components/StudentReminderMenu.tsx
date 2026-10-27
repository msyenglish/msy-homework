import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlarmClock,
  ChevronDown,
  ClipboardList,
  Layers,
  TrendingDown,
} from "lucide-react";
import type { AssignmentItem } from "../lib/api";
import { Button } from "./ui";
import { t } from "../i18n";

const LOW_THRESHOLD = 40;

// Dropdown "Nhắc học sinh": copy tin nhắn bài chưa làm / bài điểm thấp / cả hai.
export default function StudentReminderMenu({
  student,
  assignments,
}: {
  // Only the name is needed — accepts any learner shape without a cast.
  student: { name: string | null };
  assignments: AssignmentItem[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const origin = window.location.origin;
  const pctOf = (a: AssignmentItem) =>
    a.lastTotal ? Math.round(((a.lastScore ?? 0) / a.lastTotal) * 100) : 0;
  const notDone = assignments.filter((a) => !a.done);
  const low = assignments.filter((a) => a.done && pctOf(a) < LOW_THRESHOLD);

  function line(a: AssignmentItem, withPct = false) {
    const p = withPct ? ` (${pctOf(a)}%)` : "";
    return `- ${a.title}${p}: ${origin}/u/practice/${a.exercise_id}`;
  }
  const loginLine = t("teacherWidgets.studentReminderMenu.loginLine", { origin });

  function msgNotDone(): string | null {
    if (!notDone.length) return null;
    return [
      t("teacherWidgets.studentReminderMenu.greetingNotDone", { name: student.name ?? "", count: notDone.length }),
      ...notDone.map((a) => line(a)),
      "",
      loginLine,
    ].join("\n");
  }
  function msgLow(): string | null {
    if (!low.length) return null;
    return [
      t("teacherWidgets.studentReminderMenu.greetingLow", { name: student.name ?? "", threshold: LOW_THRESHOLD }),
      ...low.map((a) => line(a, true)),
      "",
      loginLine,
    ].join("\n");
  }
  function msgBoth(): string | null {
    if (!notDone.length && !low.length) return null;
    const parts: string[] = [t("teacherWidgets.studentReminderMenu.greetingBoth", { name: student.name ?? "" })];
    if (notDone.length) {
      parts.push(
        "",
        t("teacherWidgets.studentReminderMenu.headerNotDone", { count: notDone.length }),
        ...notDone.map((a) => line(a)),
      );
    }
    if (low.length) {
      parts.push(
        "",
        t("teacherWidgets.studentReminderMenu.headerLow", { threshold: LOW_THRESHOLD, count: low.length }),
        ...low.map((a) => line(a, true)),
      );
    }
    parts.push("", loginLine);
    return parts.join("\n");
  }

  function copy(build: () => string | null, label: string) {
    setOpen(false);
    const text = build();
    if (!text) {
      toast.info(t("teacherWidgets.studentReminderMenu.noneToast", { label }));
      return;
    }
    navigator.clipboard.writeText(text).then(
      () => toast.success(t("teacherWidgets.studentReminderMenu.copiedToast", { label })),
      () => toast.error(t("teacherWidgets.studentReminderMenu.clipboardBlocked")),
    );
  }

  return (
    <div ref={ref} className="relative">
      <Button size="sm" variant="secondary" onClick={() => setOpen((o) => !o)}>
        <AlarmClock className="size-4" /> {t("teacherWidgets.studentReminderMenu.button")}{" "}
        <ChevronDown
          className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
          <Item
            icon={ClipboardList}
            label={t("teacherWidgets.studentReminderMenu.itemNotDone")}
            count={notDone.length}
            onClick={() => copy(msgNotDone, t("teacherWidgets.studentReminderMenu.labelNotDone"))}
          />
          <Item
            icon={TrendingDown}
            label={t("teacherWidgets.studentReminderMenu.itemLow", { threshold: LOW_THRESHOLD })}
            count={low.length}
            onClick={() => copy(msgLow, t("teacherWidgets.studentReminderMenu.labelLow"))}
          />
          <Item
            icon={Layers}
            label={t("teacherWidgets.studentReminderMenu.itemBoth")}
            count={notDone.length + low.length}
            onClick={() => copy(msgBoth, t("teacherWidgets.studentReminderMenu.labelBoth"))}
          />
        </div>
      )}
    </div>
  );
}

function Item({
  icon: Icon,
  label,
  count,
  onClick,
}: {
  icon: typeof ClipboardList;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <Icon className="size-4 shrink-0 text-slate-400" />
      <span className="flex-1 whitespace-nowrap">{label}</span>
      <span className="rounded-full bg-slate-100 px-1.5 text-xs font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
        {count}
      </span>
    </button>
  );
}
