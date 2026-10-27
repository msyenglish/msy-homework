import { useState } from "react";
import { AudioLines, ChevronDown } from "lucide-react";
import { AudioPlayer } from "../AudioPlayer";
import { cn } from "../../lib/utils";
import { t } from "../../i18n";

/**
 * Collapsed row "Nghe lại bản ghi" that expands into the recording player.
 * Shared by the practice result screen and the public report page (/s/:id) so both
 * keep the same compact bottom-bar behaviour.
 */
export function RecordingPanel({
  url,
  downloadName,
  onTime,
  onCollapse,
  className,
}: {
  url: string | null | undefined;
  downloadName?: string;
  onTime?: (cur: number) => void;
  onCollapse?: () => void; // thu lại → dọn highlight từ đang phát
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!url) return null;
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() =>
          setOpen((v) => {
            if (v) onCollapse?.();
            return !v;
          })
        }
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-left transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700/70"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <AudioLines className="size-4 text-cyan-500" /> {t("practice2.audio.replayRecording")}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          {t("practice2.audio.recordingTitle")}
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && (
        <div className="mt-2">
          <AudioPlayer src={url} onTime={onTime} downloadName={downloadName} />
        </div>
      )}
    </div>
  );
}
