import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronDown, ExternalLink, ImageUp, House, Server, KeyRound, Layers, Loader2, Mail, Palette, PanelBottom, Save, Send, Settings, Sparkles, Type, UserRound, Wand2, X, type LucideIcon } from "lucide-react";
import { DEFAULT_BRAND, FOOTER_LINK_KEYS, UI_LANGS, type Brand, type FooterLinks, type TeacherTitle, type UiLang } from "@msyen/shared";
import { LANG_LABEL, t, type TKey } from "../i18n";
import { auth, settingsApi, uploadImage } from "../lib/api";
import { setBrand } from "../lib/brand";
import Drawer from "./Drawer";
import { Button, Input, Select, Textarea } from "./ui";
import { ToggleRow } from "./ui/toggle";
import { cn } from "../lib/utils";
import { fmtAgo, fmtDay } from "../lib/format";

type SettingsTab = "brand" | "telegram" | "account";
const TABS: { key: SettingsTab; icon: LucideIcon; label: TKey }[] = [
  { key: "brand", icon: Palette, label: "teacherDrawers.settings.brandTitle" },
  { key: "telegram", icon: Send, label: "teacherDrawers.settings.telegramTitle" },
  { key: "account", icon: UserRound, label: "teacherDrawers.settings.tabAccount" },
];

const TG_STEPS: TKey[] = [
  "teacherDrawers.settings.tgStep1",
  "teacherDrawers.settings.tgStep2",
  "teacherDrawers.settings.tgStep3",
  "teacherDrawers.settings.tgStep4",
];

function genPassword(): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const arr = new Uint32Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr, (n) => chars[n % chars.length]).join("");
}

const FOOTER_LINK_LABEL: Record<keyof FooterLinks, TKey> = {
  website: "practice2.footer.website",
  facebook: "practice2.footer.facebook",
  youtube: "practice2.footer.youtube",
  zalo: "teacherDrawers.settings.footerZaloLabel",
  email: "practice2.footer.email",
};
const FOOTER_LINK_PLACEHOLDER: Record<keyof FooterLinks, string> = {
  website: "msyen.com",
  facebook: "facebook.com/your-page",
  youtube: "youtube.com/@your-channel",
  zalo: "0912 345 678",
  email: "hello@example.com",
};

export default function SettingsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: settingsApi.get, enabled: open });

  const [chatId, setChatId] = useState("");
  const [botToken, setBotToken] = useState("");
  const [tgEnabled, setTgEnabled] = useState(false);
  const [notifyFb, setNotifyFb] = useState(false);
  const [savingTg, setSavingTg] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sampling, setSampling] = useState(false);
  const { data: me } = useQuery({ queryKey: ["auth", "me"], queryFn: auth.me, enabled: open });
  const [newEmail, setNewEmail] = useState("");
  const [savingEmail, setSavingEmail] = useState(false);
  const [newPass, setNewPass] = useState("");
  const [savingPass, setSavingPass] = useState(false);
  const [brand, setBrandForm] = useState<Brand>(DEFAULT_BRAND);
  const [savingBrand, setSavingBrand] = useState(false);
  const [tab, setTab] = useState<SettingsTab>("brand");

  useEffect(() => {
    if (data) {
      setChatId(data.telegram_chat_id);
      setTgEnabled(data.telegram_enabled);
      setNotifyFb(data.telegram_feedback_notify);
      setBrandForm(data.brand);
      setBotToken("");
    }
  }, [data]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["settings"] });

  async function saveTelegram() {
    setSavingTg(true);
    try {
      await settingsApi.update({
        telegram_chat_id: chatId,
        telegram_enabled: tgEnabled,
        telegram_feedback_notify: notifyFb,
        ...(botToken.trim() ? { telegram_bot_token: botToken.trim() } : {}),
      });
      toast.success(t("teacherDrawers.settings.toastSavedTelegram"));
      setBotToken("");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherDrawers.settings.error"));
    } finally {
      setSavingTg(false);
    }
  }

  async function testTelegram() {
    setTesting(true);
    try {
      await settingsApi.telegramTest(botToken.trim() ? { telegram_bot_token: botToken.trim(), telegram_chat_id: chatId } : { telegram_chat_id: chatId });
      toast.success(t("teacherDrawers.settings.toastSentTest"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherDrawers.settings.error"));
    } finally {
      setTesting(false);
    }
  }

  async function saveBrand() {
    setSavingBrand(true);
    try {
      const next = { ...brand, name: brand.name.trim() || DEFAULT_BRAND.name, teacherName: brand.teacherName.trim() || DEFAULT_BRAND.teacherName };
      await settingsApi.update({ brand: { ...next, logoUrl: next.logoUrl ?? "", logoDarkUrl: next.logoDarkUrl ?? "", faviconUrl: next.faviconUrl ?? "" } });
      setBrand(next);
      toast.success(t("teacherDrawers.settings.toastSavedBrand"));
      setTimeout(() => location.reload(), 600);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherDrawers.settings.error"));
      setSavingBrand(false);
    }
  }

  async function sendSample() {
    setSampling(true);
    try {
      await settingsApi.telegramTestSample();
      toast.success(t("teacherDrawers.settings.toastSentSample"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherDrawers.settings.error"));
    } finally {
      setSampling(false);
    }
  }

  async function changeEmail() {
    setSavingEmail(true);
    try {
      const r = await settingsApi.changeEmail(newEmail.trim());
      toast.success(t("teacherDrawers.settings.toastEmailChanged", { email: r.email }));
      setNewEmail("");
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherDrawers.settings.error"));
    } finally {
      setSavingEmail(false);
    }
  }

  async function changePass() {
    if (newPass.length < 6) return toast.error(t("teacherDrawers.settings.toastMinPass"));
    setSavingPass(true);
    try {
      await settingsApi.changePassword(newPass);
      toast.success(t("teacherDrawers.settings.toastPassChanged"));
      setNewPass("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherDrawers.settings.error"));
    } finally {
      setSavingPass(false);
    }
  }

  const footer =
    tab === "brand" ? (
      <Button disabled={savingBrand} onClick={saveBrand}>
        <Save className="size-4" /> {savingBrand ? t("common.saving") : t("teacherDrawers.settings.saveBrandBtn")}
      </Button>
    ) : tab === "telegram" ? (
      <>
        <Button variant="neutral" disabled={testing} onClick={testTelegram}>
          <Send className="size-4" /> {testing ? t("teacherDrawers.settings.sending") : t("teacherDrawers.settings.testTelegramBtn")}
        </Button>
        <Button variant="neutral" disabled={sampling} onClick={sendSample}>
          <Sparkles className="size-4" /> {sampling ? t("teacherDrawers.settings.sending") : t("teacherDrawers.settings.sendSampleBtn")}
        </Button>
        <Button disabled={savingTg} onClick={saveTelegram}>
          <Save className="size-4" /> {savingTg ? t("common.saving") : t("common.save")}
        </Button>
      </>
    ) : undefined;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="max-w-xl"
      icon={<Settings className="size-5" />}
      iconTone="bg-slate-500/15 text-slate-600 dark:text-slate-300"
      title={t("common.settings")}
      description={t("teacherDrawers.settings.description")}
      footer={footer}
    >
      <div role="tablist" className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/60">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-semibold transition",
              tab === key
                ? "bg-white text-cyan-700 shadow-sm dark:bg-slate-900 dark:text-cyan-300"
                : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100",
            )}
          >
            <Icon className="size-4 shrink-0" /> <span className="truncate">{t(label)}</span>
          </button>
        ))}
      </div>

      {tab === "brand" && (
        <div className="space-y-4">
          <p className="text-xs text-slate-500">{t("teacherDrawers.settings.brandDesc")}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label={t("teacherDrawers.settings.appNameLabel")} value={brand.name} maxLength={60} onChange={(e) => setBrandForm({ ...brand, name: e.target.value })} placeholder={DEFAULT_BRAND.name} />
            <Select
              label={t("teacherDrawers.settings.defaultLangLabel")}
              value={brand.language}
              onChange={(v) => setBrandForm({ ...brand, language: v as UiLang })}
              options={UI_LANGS.map((l) => ({ value: l, label: LANG_LABEL[l] }))}
            />
            <Select
              label={t("teacherDrawers.settings.titleLabel")}
              value={brand.title}
              onChange={(v) => setBrandForm({ ...brand, title: v as TeacherTitle })}
              options={[
                // i18n-ignore-start: stored honorific values
                { value: "c\u00f4", label: t("teacherDrawers.settings.titleCo") },
                { value: "th\u1ea7y", label: t("teacherDrawers.settings.titleThay") },
                // i18n-ignore-end
              ]}
            />
            <Input
              label={t("teacherDrawers.settings.teacherNameLabel")}
              value={brand.teacherName}
              maxLength={40}
              onChange={(e) => setBrandForm({ ...brand, teacherName: e.target.value })}
              placeholder={t("teacherDrawers.settings.teacherNamePlaceholder")}
              hint={t("teacherDrawers.settings.teacherNameHint")}
            />
            <LogoField label={t("teacherDrawers.settings.logoLabel")} value={brand.logoUrl} onChange={(v) => setBrandForm({ ...brand, logoUrl: v })} />
            <LogoField label={t("teacherDrawers.settings.logoDarkLabel")} value={brand.logoDarkUrl} dark onChange={(v) => setBrandForm({ ...brand, logoDarkUrl: v })} />
            <LogoField
              label={t("teacherDrawers.settings.faviconLabel")}
              value={brand.faviconUrl}
              emptyLabel={brand.logoUrl ? t("teacherDrawers.settings.faviconFromLogo") : undefined}
              onChange={(v) => setBrandForm({ ...brand, faviconUrl: v })}
            />
          </div>
          <ToggleRow
            icon={<Type className="size-5" />}
            title={t("teacherDrawers.settings.showNameTitle")}
            desc={t("teacherDrawers.settings.showNameDesc")}
            checked={brand.showName}
            onChange={(v) => setBrandForm({ ...brand, showName: v })}
          />
          <ToggleRow
            icon={<House className="size-5" />}
            title={t("teacherDrawers.settings.homePageTitle")}
            desc={
              <>
                {t("teacherDrawers.settings.homePageDesc")}{" "}
                <a href="/home" target="_blank" rel="noreferrer" className="font-semibold text-cyan-600 hover:underline dark:text-cyan-400">
                  {t("teacherDrawers.settings.homePagePreview")}
                </a>
              </>
            }
            checked={brand.homePage}
            onChange={(v) => setBrandForm({ ...brand, homePage: v })}
          />

          <div className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <PanelBottom className="size-4 text-cyan-600 dark:text-cyan-400" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t("teacherDrawers.settings.footerTitle")}</p>
            </div>
            <p className="-mt-1 text-xs text-slate-500">{t("teacherDrawers.settings.footerDesc")}</p>
            <Input
              label={t("teacherDrawers.settings.footerTaglineLabel")}
              value={brand.footerTagline ?? ""}
              maxLength={200}
              onChange={(e) => setBrandForm({ ...brand, footerTagline: e.target.value })}
              placeholder={t("teacherDrawers.settings.footerTaglinePlaceholder", { name: brand.name.trim() || DEFAULT_BRAND.name })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              {FOOTER_LINK_KEYS.map((k) => (
                <Input
                  key={k}
                  label={t(FOOTER_LINK_LABEL[k])}
                  value={brand.footerLinks[k]}
                  maxLength={300}
                  onChange={(e) => setBrandForm({ ...brand, footerLinks: { ...brand.footerLinks, [k]: e.target.value } })}
                  placeholder={FOOTER_LINK_PLACEHOLDER[k]}
                />
              ))}
            </div>
            <Textarea
              label={t("teacherDrawers.settings.footerNoteLabel")}
              rows={2}
              maxLength={500}
              value={brand.footerNote ?? ""}
              onChange={(e) => setBrandForm({ ...brand, footerNote: e.target.value })}
              placeholder={t("teacherDrawers.settings.footerNotePlaceholder")}
            />
            <ToggleRow
              icon={<Layers className="size-5" />}
              title={t("teacherDrawers.settings.footerSkillsTitle")}
              desc={t("teacherDrawers.settings.footerSkillsDesc")}
              checked={brand.footerSkills}
              onChange={(v) => setBrandForm({ ...brand, footerSkills: v })}
            />
          </div>
          <p className="text-xs text-slate-500">{t("teacherDrawers.settings.brandNote")}</p>
        </div>
      )}

      {tab === "telegram" && (
        <div className="space-y-4">
          <ToggleRow icon={<Send className="size-5" />} title={t("teacherDrawers.settings.telegramTitle")} desc={t("teacherDrawers.settings.telegramDesc")} checked={tgEnabled} onChange={setTgEnabled} />
          <details className="group rounded-xl border border-slate-200 dark:border-slate-700">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700 select-none dark:text-slate-200">
              <ChevronDown className="size-4 text-slate-400 transition-transform group-open:rotate-180" />
              {t("teacherDrawers.settings.tgGuideTitle")}
            </summary>
            <ol className="list-decimal space-y-1.5 border-t border-slate-200 py-3 pr-3 pl-8 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
              {TG_STEPS.map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ol>
          </details>
          <Input label="Chat ID" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder={t("teacherDrawers.settings.chatIdPlaceholder")} />
          <Input
            label="Bot Token"
            className="font-mono"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            placeholder={data?.telegram_bot_token_set ? t("teacherDrawers.settings.botTokenSet", { hint: data.telegram_bot_token_hint }) : "123456:ABC-DEF…"}
          />
          <ToggleRow
            icon={<Sparkles className="size-5" />}
            tone="violet"
            title={t("teacherDrawers.settings.notifyFeedbackTitle")}
            desc={t("teacherDrawers.settings.notifyFeedbackDesc")}
            checked={notifyFb}
            onChange={setNotifyFb}
          />
          <InstallsCard open={open} />
        </div>
      )}

      {tab === "account" && (
        <div className="space-y-5">
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
              <Mail className="size-4 text-cyan-600" /> {t("teacherDrawers.settings.emailTitle")}
            </h3>
            <p className="text-xs text-slate-500">
              {t("teacherDrawers.settings.emailCurrent")} <span className="font-semibold text-slate-700 dark:text-slate-200">{me?.teacher.email ?? "…"}</span>
            </p>
            <div className="flex gap-2">
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newEmail.trim() && void changeEmail()}
                placeholder={t("teacherDrawers.settings.newEmailLabel")}
                aria-label={t("teacherDrawers.settings.newEmailLabel")}
              />
              <Button className="shrink-0" disabled={savingEmail || !newEmail.trim()} onClick={changeEmail}>
                <Check className="size-4" /> {savingEmail ? t("common.saving") : t("teacherDrawers.settings.changeEmailBtn")}
              </Button>
            </div>
          </section>

          <section className="space-y-2 border-t border-slate-200 pt-5 dark:border-slate-800">
            <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
              <KeyRound className="size-4 text-cyan-600" /> {t("teacherDrawers.settings.changePassTitle")}
            </h3>
            <p className="text-xs text-slate-500">
              {t("teacherDrawers.settings.changePassDesc")} {t("teacherDrawers.settings.minCharsHint")}
            </p>
            <div className="flex gap-2">
              <Input
                type="text"
                className="font-mono"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && newPass.length >= 6 && void changePass()}
                placeholder={t("teacherDrawers.settings.newPassLabel")}
                aria-label={t("teacherDrawers.settings.newPassLabel")}
                rightIcon={
                  <button
                    type="button"
                    onClick={() => setNewPass(genPassword())}
                    title={t("teacherDrawers.settings.genPassTitle")}
                    className="text-slate-400 transition hover:text-cyan-600 dark:hover:text-cyan-400"
                  >
                    <Wand2 className="size-4" />
                  </button>
                }
              />
              <Button className="shrink-0" disabled={savingPass || newPass.length < 6} onClick={changePass}>
                <Check className="size-4" /> {savingPass ? t("teacherDrawers.settings.changingPass") : t("teacherDrawers.settings.changePassBtn")}
              </Button>
            </div>
          </section>
        </div>
      )}
    </Drawer>
  );
}

/** Logo upload with preview; null = the built-in logo. */
function LogoField({ label, value, dark, emptyLabel, onChange }: { label: string; value: string | null; dark?: boolean; emptyLabel?: string; onChange: (v: string | null) => void }) {
  const [uploading, setUploading] = useState(false);
  async function pick(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadImage(file);
      onChange(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherDrawers.settings.toastUploadFailed"));
    } finally {
      setUploading(false);
    }
  }
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">{label}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Fixed height, width follows the image: a square mark stays square, a wordmark stays wide. */}
        <div
          className={`flex h-14 max-w-[180px] min-w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 p-1.5 dark:border-slate-700 ${dark ? "bg-slate-900" : "bg-white"}`}
        >
          {value ? <img src={value} alt="" className="h-full w-auto max-w-full object-contain" /> : <span className="px-1 text-center text-[10px] leading-tight text-slate-400">{emptyLabel ?? t("teacherDrawers.settings.defaultLogo")}</span>}
        </div>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />} {t("teacherDrawers.settings.uploadImage")}
          <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => void pick(e.target.files?.[0])} />
        </label>
        {value && (
          <button type="button" onClick={() => onChange(null)} aria-label={t("teacherDrawers.settings.removeLogoAria")} title={t("teacherDrawers.settings.useDefaultLogoTitle")} className="text-slate-400 transition hover:text-rose-500">
            <X className="size-4" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Install count — only the project site collects it, so the card stays hidden everywhere else. */
function InstallsCard({ open }: { open: boolean }) {
  const { data } = useQuery({ queryKey: ["settings", "installs"], queryFn: settingsApi.installs, enabled: open });
  if (!data?.hub) return null;
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-start gap-2">
        <Server className="mt-0.5 size-4 shrink-0 text-cyan-600 dark:text-cyan-400" />
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">{t("teacherDrawers.settings.installsTitle")}</h3>
          <p className="text-xs text-slate-500">{t("teacherDrawers.settings.installsDesc")}</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          ["teacherDrawers.settings.installsTotal", data.total],
          ["teacherDrawers.settings.installsActive", data.active7],
        ].map(([label, n]) => (
          <div key={label} className="rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/60">
            <p className="text-xs text-slate-500">{t(label as TKey)}</p>
            <p className="text-xl font-extrabold text-slate-900 tabular-nums dark:text-white">{n}</p>
          </div>
        ))}
      </div>
      {data.items.length ? (
        <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm dark:divide-slate-800">
          {data.items.map((it) => (
            <li key={it.url} className="py-2">
              <a href={it.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium break-all text-cyan-700 hover:underline dark:text-cyan-300">
                {it.url.replace(/^https:\/\//, "")} <ExternalLink className="size-3 shrink-0" />
              </a>
              <p className="text-xs text-slate-500">
                {t("teacherDrawers.settings.installsSeen", { first: fmtDay(it.firstSeenAt), last: fmtAgo(it.lastSeenAt) })}
                {it.version && <span className="ml-1 font-mono">· {it.version}</span>}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">{t("teacherDrawers.settings.installsEmpty")}</p>
      )}
    </section>
  );
}
