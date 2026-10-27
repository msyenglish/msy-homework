// Teacher sign-in. Same shell as the learner page: a branded panel on the left (large screens)
// and the form on the right; phones get the form alone under a compact logo.
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, BarChart3, CheckCheck, ClipboardCheck, Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { auth } from "../lib/api";
import ThemeToggle from "../components/ThemeToggle";
import { BrandLogo, Logo } from "../components/Logo";
import { Button, Input } from "../components/ui";
import { DevQuickLogin } from "../components/DevQuickLogin";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { getBrand } from "../lib/brand";
import { t } from "../i18n";

/** Left panel: brand, a short pitch and what the teacher area does. Decorative only. */
function TeacherPanel() {
  const features = [
    { Icon: Sparkles, title: t("userPages.teacherLogin.featureComposeTitle"), sub: t("userPages.teacherLogin.featureComposeSub") },
    { Icon: ClipboardCheck, title: t("userPages.teacherLogin.featureGradeTitle"), sub: t("userPages.teacherLogin.featureGradeSub") },
    { Icon: BarChart3, title: t("userPages.teacherLogin.featureReportTitle"), sub: t("userPages.teacherLogin.featureReportSub") },
  ];
  return (
    <section className="relative hidden overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-800 via-slate-900 to-blue-950 p-10 text-white shadow-2xl shadow-slate-900/20 ring-1 ring-white/5 lg:flex lg:flex-col xl:p-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-blue-400/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="relative flex items-center">
        <BrandLogo height={52} on="dark" />
      </div>

      <div className="relative my-auto py-10">
        <h1 className="max-w-md text-4xl font-extrabold leading-[1.1] tracking-tight xl:text-5xl">
          {t("userPages.teacherLogin.panelHeadingMain")}
          <span className="text-cyan-300">{t("userPages.teacherLogin.panelHeadingHighlight")}</span>
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-white/80">{t("userPages.teacherLogin.panelDescription")}</p>

        <ul className="mt-8 space-y-3">
          {features.map(({ Icon, title, sub }) => (
            <li key={title} className="flex items-center gap-3.5 rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-inset ring-white/15 backdrop-blur-sm">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                <Icon className="size-5" />
              </span>
              <span>
                <span className="block font-bold">{title}</span>
                <span className="block text-sm text-white/70">{sub}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* A glimpse of the dashboard, tilted for a bit of life. */}
      <div className="relative ml-auto w-64 rotate-[-3deg] rounded-2xl bg-white p-4 text-slate-800 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("userPages.teacherLogin.previewTitle")}</span>
          <span className="flex size-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCheck className="size-3.5" />
          </span>
        </div>
        <p className="mt-2 font-bold">{t("userPages.teacherLogin.previewBody")}</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-4/5 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500" />
        </div>
      </div>
    </section>
  );
}

export default function LoginPage() {
  useDocumentTitle(t("userPages.teacherLogin.pageTitle"));
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const canSubmit = email.trim() !== "" && password !== "" && !loading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setErr("");
    try {
      await auth.login(email.trim(), password);
      await qc.invalidateQueries({ queryKey: ["auth", "me"] });
      navigate("/teacher", { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("userPages.teacherLogin.loginError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-slate-950">
      <ThemeToggle className="absolute right-4 top-4 z-10" />
      <main className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 p-4 sm:p-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:p-8">
        <TeacherPanel />

        <section className="flex items-center justify-center py-8 lg:py-0">
          <div className="w-full max-w-[26rem]">
            <div className="mb-8 flex justify-center lg:hidden">
              <Logo size="lg" />
            </div>

            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-600 dark:text-cyan-400">{t("userPages.teacherLogin.kicker")}</p>
            <h2 className="mt-1.5 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t("userPages.teacherLogin.welcome")}</h2>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{t("userPages.teacherLogin.subtitle")}</p>

            <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
              <Input
                label="Email"
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leftIcon={<Mail className="size-4" />}
                placeholder="you@example.com"
              />
              <Input
                label={t("userPages.teacherLogin.passwordLabel")}
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                leftIcon={<Lock className="size-4" />}
                className="pr-11"
                placeholder="••••••••"
                rightSlot={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? t("userPages.login.hidePassword") : t("userPages.login.showPassword")}
                    className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                }
              />

              {err && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{err}</p>}

              <Button type="submit" size="lg" disabled={!canSubmit} className="h-12">
                {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                {loading ? t("userPages.teacherLogin.loggingIn") : t("userPages.teacherLogin.submit")}
                {!loading && <ArrowRight className="size-4" />}
              </Button>
            </form>

            <DevQuickLogin className="mt-6" />

            <p className="mt-10 flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
              <ShieldCheck className="size-3.5" />
              {t("userPages.teacherLogin.footer", { brand: getBrand().name })}
            </p>
            <p className="mt-2 text-center text-xs text-slate-400">
              {t("userPages.teacherLogin.isLearner")}{" "}
              <Link to="/u/login" className="font-semibold text-slate-500 hover:text-cyan-600 dark:text-slate-300 dark:hover:text-cyan-400">
                {t("userPages.teacherLogin.learnerLink")}
              </Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
