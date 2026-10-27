import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, FolderOpen, Loader2, Save, Trash2 } from "lucide-react";
import { genTemplatesApi } from "../lib/api";
import { Button, buttonClass } from "./ui";
import { Popover } from "./ui/popover";
import { t } from "../i18n";

// Lưu/nạp TOÀN BỘ lựa chọn AI Composer thành "template" trên CLOUD (bảng gen_templates)
// → dùng chung mọi thiết bị. Bao gồm tất tật các trường qua getConfig()/applyConfig().
export function GenTemplatesBar({
  getConfig,
  applyConfig,
  side = "up",
}: {
  getConfig: () => Record<string, unknown>;
  applyConfig: (c: Record<string, unknown>) => void;
  /** Which way the save/load panels open; "down" anchors them to the right edge. */
  side?: "up" | "down";
}) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["gen-templates"], queryFn: genTemplatesApi.list });
  const list = data?.items ?? [];
  const [name, setName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Panels are portaled Popovers, so a hero with `overflow-hidden` cannot clip them.
  const align = side === "down" ? "right" : "left";

  const refresh = () => qc.invalidateQueries({ queryKey: ["gen-templates"] });
  const saveMut = useMutation({
    mutationFn: () => genTemplatesApi.save(name.trim(), getConfig()),
    onSuccess: () => {
      toast.success(t("teacherWidgets.genTemplatesBar.savedToast", { name: name.trim() }));
      setName("");
      refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t("teacherWidgets.genTemplatesBar.saveError")),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => genTemplatesApi.remove(id),
    onSuccess: () => {
      setConfirmId(null);
      refresh();
    },
  });

  return (
    <div className="flex items-center gap-2">
      <Popover
        align={align}
        side={side}
        triggerClassName={buttonClass("neutral")}
        panelClassName="w-72 rounded-xl p-3"
        trigger={
          <>
            <Save className="size-4 text-cyan-600 dark:text-cyan-400" /> {t("teacherWidgets.genTemplatesBar.save")}
          </>
        }
      >
        {(close) => (
          <>
            <p className="mb-2 text-xs font-semibold text-slate-500">{t("teacherWidgets.genTemplatesBar.saveTitle")}</p>
            <div className="flex gap-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && name.trim() && saveMut.mutate(undefined, { onSuccess: close })}
                placeholder={t("teacherWidgets.genTemplatesBar.namePlaceholder")}
                className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/40 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <Button size="sm" onClick={() => saveMut.mutate(undefined, { onSuccess: close })} disabled={!name.trim() || saveMut.isPending}>
                {saveMut.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              </Button>
            </div>
          </>
        )}
      </Popover>
      <Popover
        align={align}
        side={side}
        triggerClassName={buttonClass("neutral")}
        panelClassName="max-h-72 w-72 overflow-auto rounded-xl p-1.5"
        trigger={
          <>
            <FolderOpen className="size-4 text-amber-500" /> {t("teacherWidgets.genTemplatesBar.load")}
          </>
        }
      >
        {(close) =>
          list.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-slate-400">{t("teacherWidgets.genTemplatesBar.empty")}</p>
          ) : (
            list.map((tItem) => (
              <div key={tItem.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    applyConfig(tItem.config);
                    close();
                    toast.success(t("teacherWidgets.genTemplatesBar.loadedToast", { name: tItem.name }));
                  }}
                  className="flex-1 truncate rounded-lg px-2.5 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  {tItem.name}
                </button>
                {/* Two-step delete: the first click arms it, the second removes the template. */}
                {confirmId === tItem.id ? (
                  <button
                    type="button"
                    onClick={() => delMut.mutate(tItem.id)}
                    disabled={delMut.isPending}
                    className="shrink-0 rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700"
                  >
                    {t("teacherWidgets.genTemplatesBar.confirmDelete")}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(tItem.id)}
                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                    aria-label={t("teacherWidgets.genTemplatesBar.deleteAria")}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))
          )
        }
      </Popover>
    </div>
  );
}
