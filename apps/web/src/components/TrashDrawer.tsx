// Thùng rác dùng chung cho Thư viện bài tập & Tài khoản user. Xóa mềm ở nơi khác đưa item
// vào đây; giáo viên tự KHÔI PHỤC (an toàn, 1 nhịp) hoặc DỌN HẲN (xóa thật, xác nhận tại chỗ).
// Render nội dung mỗi dòng qua render prop `renderItem` để 2 loại (bài / user) khác nhau.
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RotateCcw, Trash2 } from "lucide-react";
import Drawer from "./Drawer";
import { Button } from "./ui";
import { IconConfirmButton } from "./IconConfirmButton";
import { fmtDateTime } from "../lib/format";
import { t } from "../i18n";

interface TrashDrawerProps<T> {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: React.ReactNode;
  /** Query key riêng cho thùng rác (khác key danh sách chính). */
  queryKey: string;
  fetchItems: () => Promise<{ items: T[] }>;
  /** Khóa React ổn định + id/slug dùng cho khôi phục/dọn. */
  itemKey: (item: T) => string;
  deletedAt: (item: T) => string;
  restore: (item: T) => Promise<unknown>;
  purge: (item: T) => Promise<unknown>;
  renderItem: (item: T) => React.ReactNode;
  /** Query danh sách chính cần làm mới sau khi khôi phục/dọn. */
  invalidateKeys: string[];
  emptyText: string;
}

export default function TrashDrawer<T>({
  open,
  onClose,
  title,
  description,
  icon,
  queryKey,
  fetchItems,
  itemKey,
  deletedAt,
  restore,
  purge,
  renderItem,
  invalidateKeys,
  emptyText,
}: TrashDrawerProps<T>) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: fetchItems,
    enabled: open,
  });
  const items = data?.items ?? [];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: [queryKey] });
    for (const k of invalidateKeys) qc.invalidateQueries({ queryKey: [k] });
  };

  async function doRestore(item: T) {
    try {
      await restore(item);
      toast.success(t("teacherWidgets.trashDrawer.restoredToast"));
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  async function doPurge(item: T) {
    try {
      await purge(item);
      toast.success(t("teacherWidgets.trashDrawer.purgedToast"));
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      icon={icon}
      iconTone="bg-rose-500/12 text-rose-600 ring-1 ring-rose-500/20 dark:text-rose-400"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 p-12 text-center dark:border-slate-700">
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Trash2 className="size-6" />
          </div>
          <p className="text-sm font-medium text-slate-500">{emptyText}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={itemKey(item)}
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="min-w-0 flex-1">
                {renderItem(item)}
                <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">
                  {t("teacherWidgets.trashDrawer.deletedAt", { time: fmtDateTime(deletedAt(item)) })}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="outline" onClick={() => doRestore(item)}>
                  <RotateCcw className="size-3.5" /> {t("teacherWidgets.trashDrawer.restore")}
                </Button>
                <IconConfirmButton
                  icon={Trash2}
                  title={t("teacherWidgets.trashDrawer.purge")}
                  confirmTitle={t("teacherWidgets.trashDrawer.confirmPurge")}
                  onConfirm={() => doPurge(item)}
                  className="text-slate-400 hover:bg-rose-500/10 hover:text-rose-500"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Drawer>
  );
}
