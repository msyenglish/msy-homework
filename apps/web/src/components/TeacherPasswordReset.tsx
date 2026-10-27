// Teacher-set password for one account — the only reset path that works for class kids,
// whose email address is a placeholder no mailbox answers. The new password is shown ONCE
// (the server never stores plaintext), together with a ready-to-send message for the parent.
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, KeyRound, Loader2, RefreshCw } from "lucide-react";
import { teacherUsersApi } from "../lib/api";
import { Button, Input } from "./ui";
import { cn } from "../lib/utils";
import { t } from "../i18n";

/** Message the teacher forwards to the learner or parent. */
function loginNote(name: string | null, email: string, password: string): string {
  return [
    t("teacherWidgets.passwordReset.noteHeader", { name: name || t("teacherWidgets.passwordReset.noteLearnerDefault") }),
    t("teacherWidgets.passwordReset.notePortal", { url: `${window.location.origin}/u/login` }),
    t("teacherWidgets.passwordReset.noteEmail", { email }),
    t("teacherWidgets.passwordReset.notePassword", { password }),
    t("teacherWidgets.passwordReset.noteFooter"),
  ].join("\n");
}

export function TeacherPasswordReset({
  userId,
  name,
  email,
  className,
}: {
  userId: string;
  name: string | null;
  email: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [issued, setIssued] = useState<string | null>(null);

  const reset = useMutation({
    mutationFn: (password?: string) => teacherUsersApi.setPassword(userId, password),
    onSuccess: (r) => {
      setIssued(r.password);
      setTyped("");
      toast.success(t("teacherWidgets.passwordReset.toastSaved"));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherWidgets.passwordReset.toastError")),
  });

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(() => toast.success(label));
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <KeyRound className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t("teacherWidgets.passwordReset.title")}</p>
          <p className="text-xs text-slate-500">{t("teacherWidgets.passwordReset.description")}</p>
        </div>
        <Button variant={open ? "secondary" : "ghost"} size="sm" onClick={() => setOpen(!open)}>
          {open ? t("common.close") : t("teacherWidgets.passwordReset.resetAction")}
        </Button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-700">
          {issued ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-500">
                {t("teacherWidgets.passwordReset.issuedNotice")}
              </p>
              <button
                type="button"
                onClick={() => copy(issued, t("teacherWidgets.passwordReset.toastCopiedPassword"))}
                className="flex w-full items-center justify-between gap-2 rounded-lg bg-amber-500/10 px-3 py-2.5 font-mono text-lg font-bold tracking-wide text-amber-700 transition hover:bg-amber-500/20 dark:text-amber-300"
              >
                {issued}
                <Copy className="size-4 shrink-0" />
              </button>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => copy(loginNote(name, email, issued), t("teacherWidgets.passwordReset.toastCopiedNote"))}>
                  <Copy className="size-4" /> {t("teacherWidgets.passwordReset.copyNote")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setIssued(null); setOpen(false); }}>
                  <Check className="size-4" /> {t("teacherWidgets.passwordReset.done")}
                </Button>
              </div>
            </div>
          ) : (
            <>
              <Input
                label={t("teacherWidgets.passwordReset.newPasswordLabel")}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={t("teacherWidgets.passwordReset.placeholder")}
                leftIcon={<KeyRound className="size-4" />}
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" variant="secondary" disabled={reset.isPending} onClick={() => reset.mutate(undefined)}>
                  {reset.isPending && !typed ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  {t("teacherWidgets.passwordReset.generatePassword")}
                </Button>
                <Button size="sm" disabled={typed.trim().length < 6 || reset.isPending} onClick={() => reset.mutate(typed.trim())}>
                  {reset.isPending && !!typed ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {t("teacherWidgets.passwordReset.setThisPassword")}
                </Button>
              </div>
              <p className="text-xs text-slate-400">{t("teacherWidgets.passwordReset.hint")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
