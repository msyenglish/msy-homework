import { useEffect, useRef, useState } from "react";
import { Check, Loader2, type LucideIcon } from "lucide-react";
import { Tooltip } from "./Tooltip";
import { cn } from "../lib/utils";
import { t } from "../i18n";

// Nút icon xác nhận NGAY TẠI CHỖ (không popup):
//  click 1 → chuyển sang ✓ (chờ xác nhận), click 2 → spinner (chạy) → xong.
// Tự huỷ trạng thái "chờ" sau ~2.5s nếu không bấm tiếp.
export function IconConfirmButton({
  icon: Icon,
  onConfirm,
  title,
  confirmTitle = t("shared.iconConfirm.pressAgain"),
  className,
}: {
  icon: LucideIcon;
  onConfirm: () => Promise<unknown> | void;
  title: string;
  confirmTitle?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "armed" | "loading">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const alive = useRef(true);
  useEffect(() => {
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  function arm() {
    setState("armed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => alive.current && setState("idle"), 2500);
  }

  async function click() {
    if (state === "loading") return;
    if (state === "idle") return arm();
    // armed → thực thi
    clearTimeout(timer.current);
    setState("loading");
    try {
      await onConfirm();
    } finally {
      if (alive.current) setState("idle");
    }
  }

  const Cmp = state === "loading" ? Loader2 : state === "armed" ? Check : Icon;

  return (
    <Tooltip label={state === "armed" ? confirmTitle : title}>
      <button
        type="button"
        onClick={click}
        aria-label={title}
        className={cn(
          "flex size-9 items-center justify-center rounded-lg transition",
          state === "armed"
            ? "bg-rose-500 text-white"
            : "text-slate-400 hover:bg-rose-500/10 hover:text-rose-500",
          className,
        )}
      >
        <Cmp className={cn("size-4", state === "loading" && "animate-spin")} />
      </button>
    </Tooltip>
  );
}
