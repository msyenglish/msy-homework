// One-click sign-in buttons for local testing. Rendered only in `vite dev` builds; the API side
// answers 404 unless DEV_QUICK_LOGIN=1 on localhost.
// i18n-ignore-file — a developer tool that never ships in a production build, so it is not translated.
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { GraduationCap, Loader2, UserRound, Zap } from "lucide-react";
import { devApi } from "../lib/api";
import { cn } from "../lib/utils";

const TARGETS = {
  teacher: { label: "Giáo viên", to: "/teacher", Icon: GraduationCap },
  user: { label: "Học viên", to: "/u/library", Icon: UserRound },
} as const;

export function DevQuickLogin({ className }: { className?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<keyof typeof TARGETS | null>(null);
  if (!import.meta.env.DEV) return null;

  const go = async (role: keyof typeof TARGETS) => {
    setBusy(role);
    try {
      const r = await devApi.quickLogin(role);
      await qc.invalidateQueries();
      toast.success(`Dev: đã vào ${r.email}`);
      navigate(TARGETS[role].to, { replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Đăng nhập nhanh lỗi — thêm DEV_QUICK_LOGIN=1 vào apps/api/.dev.vars");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn("rounded-2xl border border-dashed border-amber-300 bg-amber-50/70 p-3 dark:border-amber-500/40 dark:bg-amber-500/5", className)}>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
        <Zap className="size-3.5" /> Dev · đăng nhập nhanh
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(Object.keys(TARGETS) as (keyof typeof TARGETS)[]).map((role) => {
          const { label, Icon } = TARGETS[role];
          return (
            <button
              key={role}
              type="button"
              disabled={busy !== null}
              onClick={() => go(role)}
              className="flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white text-sm font-semibold text-slate-700 transition hover:border-amber-400 hover:bg-amber-50 disabled:opacity-60 dark:border-amber-500/30 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {busy === role ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />} {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
