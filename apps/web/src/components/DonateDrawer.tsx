// Donate drawer: VietQR code plus the bank details, each copyable.
import { Coffee, Copy, HandHeart, Heart, Sparkles } from "lucide-react";
import Drawer from "./Drawer";
import { CopyButton } from "./CopyButton";
import { DONATE_BANK, donateQrUrl } from "../lib/project";
import { t } from "../i18n";

const MEMO = "UNG HO ENGLISH HOMEWORK"; // i18n-ignore: bank memo, ASCII only

export default function DonateDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const rows = [
    { label: t("teacherDrawers.donate.bank"), value: DONATE_BANK.label, copy: false },
    { label: t("teacherDrawers.donate.account"), value: DONATE_BANK.account, copy: true },
    { label: t("teacherDrawers.donate.holder"), value: DONATE_BANK.name, copy: true },
    { label: t("teacherDrawers.donate.memo"), value: MEMO, copy: true },
  ];
  return (
    <Drawer
      open={open}
      onClose={onClose}
      icon={<HandHeart className="size-5" />}
      iconTone="bg-rose-500/15 text-rose-600 dark:text-rose-400"
      title={t("teacherDrawers.donate.title")}
      description={t("teacherDrawers.donate.description")}
    >
      <div className="space-y-4">
        <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 to-amber-50 p-4 dark:border-rose-500/30 dark:from-rose-500/10 dark:to-amber-500/5">
          <p className="flex items-center gap-2 font-bold text-rose-700 dark:text-rose-300">
            <Heart className="size-4 fill-current" /> {t("teacherDrawers.donate.pitchTitle")}
          </p>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">{t("teacherDrawers.donate.pitchBody")}</p>
          <ul className="mt-3 space-y-1.5 text-sm text-slate-700 dark:text-slate-200">
            <li className="flex items-start gap-2">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-500" /> {t("teacherDrawers.donate.pitchFeatures")}
            </li>
            <li className="flex items-start gap-2">
              <Coffee className="mt-0.5 size-4 shrink-0 text-amber-600" /> {t("teacherDrawers.donate.pitchServers")}
            </li>
            <li className="flex items-start gap-2">
              <HandHeart className="mt-0.5 size-4 shrink-0 text-rose-500" /> {t("teacherDrawers.donate.pitchFree")}
            </li>
          </ul>
        </div>
        <div className="mx-auto w-full max-w-[260px] rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700">
          <img src={donateQrUrl(MEMO)} alt={t("teacherDrawers.donate.qrAlt")} className="aspect-square w-full" loading="lazy" />
        </div>
        <p className="text-center text-xs text-slate-500">{t("teacherDrawers.donate.scanHint")}</p>
        <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3 px-3 py-2">
              <dt className="w-28 shrink-0 text-xs text-slate-500">{r.label}</dt>
              <dd className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-slate-800 dark:text-slate-100">{r.value}</dd>
              {r.copy && <CopyButton value={r.value} icon={Copy} ghost title={t("teacherDrawers.donate.copy")} className="size-8" />}
            </div>
          ))}
        </dl>
        <p className="text-sm text-slate-600 dark:text-slate-300">{t("teacherDrawers.donate.thanks")}</p>
      </div>
    </Drawer>
  );
}
