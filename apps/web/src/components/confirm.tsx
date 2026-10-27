import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./ui";
import { t } from "../i18n";

// Hộp thoại xác nhận chuyên nghiệp — gọi imperative: await confirmAsk({...}).
export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

type Pending = { opts: ConfirmOptions; resolve: (v: boolean) => void };

let openFn: ((opts: ConfirmOptions) => Promise<boolean>) | null = null;

export function confirmAsk(opts: ConfirmOptions): Promise<boolean> {
  if (!openFn) return Promise.resolve(window.confirm(opts.message || opts.title));
  return openFn(opts);
}

export function ConfirmRoot() {
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    openFn = (opts) => new Promise<boolean>((resolve) => setPending({ opts, resolve }));
    return () => {
      openFn = null;
    };
  }, []);

  useEffect(() => {
    if (!pending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
      if (e.key === "Enter") close(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  function close(v: boolean) {
    pending?.resolve(v);
    setPending(null);
  }

  if (!pending) return null;
  const { opts } = pending;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => close(false)} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        style={{ animation: "fade-in 0.15s ease-out" }}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex size-11 shrink-0 items-center justify-center rounded-full ${
              opts.danger ? "bg-rose-100 text-rose-600 dark:bg-rose-500/15" : "bg-cyan-100 text-cyan-600 dark:bg-cyan-500/15"
            }`}
          >
            <AlertTriangle className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">{opts.title}</h3>
            {opts.message && <p className="mt-1 text-sm text-slate-500">{opts.message}</p>}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => close(false)}>
            {opts.cancelText || t("shared.confirm.cancel")}
          </Button>
          <Button variant={opts.danger ? "danger" : "primary"} onClick={() => close(true)}>
            {opts.confirmText || t("shared.confirm.confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}
