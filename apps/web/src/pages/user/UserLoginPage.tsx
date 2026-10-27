// Learner sign-in / sign-up. Large screens split in two: a branded welcome panel on the left and
// the form on the right; phones get the form alone under a compact logo. The email form is shown
// straight away (Google, when configured, sits above it). Forgot-password replaces the form.
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Flame, Loader2, Lock, Mail, Mic, PenLine, Route, UserRound } from "lucide-react";
import { accountApi, googleOauthUrl } from "../../lib/api";
import ThemeToggle from "../../components/ThemeToggle";
import { BrandLogo, Logo } from "../../components/Logo";
import { Button, Input } from "../../components/ui";
import { DevQuickLogin } from "../../components/DevQuickLogin";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { getBrand } from "../../lib/brand";
import { cn } from "../../lib/utils";
import { t, type TKey } from "../../i18n";

const OAUTH_ERRORS: Record<string, TKey> = {
  oauth_state: "userPages.login.oauthState",
  oauth_exchange: "userPages.login.oauthExchange",
  oauth_profile: "userPages.login.oauthProfile",
  account_locked: "userPages.login.accountLocked",
};

type Mode = "login" | "register" | "forgot";

/** Official four-colour Google mark. */
function GoogleLogo({ className = "size-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

/** Left panel: brand, a short welcome and what the learner gets. Decorative only. */
function WelcomePanel() {
  const { teacherName } = getBrand();
  const features = [
    { Icon: Route, title: t("userPages.login.featureRouteTitle"), sub: t("userPages.login.featureRouteSub") },
    { Icon: Mic, title: t("userPages.login.featureMicTitle"), sub: t("userPages.login.featureMicSub") },
    { Icon: PenLine, title: t("userPages.login.featurePenTitle"), sub: t("userPages.login.featurePenSub") },
  ];
  return (
    <section className="relative hidden overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-800 via-slate-900 to-cyan-950 p-10 text-white shadow-2xl shadow-slate-900/20 ring-1 ring-white/5 lg:flex lg:flex-col xl:p-12">
      {/* Dot texture + soft glows */}
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-cyan-400/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-teal-400/10 blur-3xl" />

      <div className="relative flex items-center">
        <BrandLogo height={52} on="dark" />
      </div>

      <div className="relative my-auto py-10">
        <h1 className="max-w-md text-4xl font-extrabold leading-[1.1] tracking-tight xl:text-5xl">
          {t("userPages.login.welcomeHeadingMain")}<span className="text-cyan-300">{t("userPages.login.welcomeHeadingHighlight")}</span>
        </h1>
        <p className="mt-4 max-w-md text-base leading-relaxed text-white/80">
          {t("userPages.login.welcomeDescription", { teacherName })}
        </p>

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

      {/* "Today" card — a preview of the learner's home, tilted for a bit of life. */}
      <div className="relative ml-auto w-64 rotate-[-3deg] rounded-2xl bg-white p-4 text-slate-800 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{t("userPages.login.today")}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-600">
            <Flame className="size-3.5" /> {t("userPages.login.daysCount", { n: 7 })}
          </span>
        </div>
        <p className="mt-2 font-bold">{t("userPages.login.tasksDone", { done: 3, total: 5 })}</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-3/5 rounded-full bg-gradient-to-r from-cyan-500 to-teal-500" />
        </div>
      </div>
    </section>
  );
}

export default function UserLoginPage() {
  useDocumentTitle(t("userPages.login.pageTitle"));
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const next = params.get("next") || "/u/library";

  // `?mode=register` (the home page's "Start learning") opens on the sign-up tab.
  const [mode, setMode] = useState<Mode>(() => (params.get("mode") === "register" ? "register" : "login"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const oauthErrKey = OAUTH_ERRORS[params.get("error") || ""];
  const [error, setError] = useState(oauthErrKey ? t(oauthErrKey) : "");
  const [forgotSent, setForgotSent] = useState(false);

  const { data: config } = useQuery({ queryKey: ["account", "config"], queryFn: accountApi.config, retry: false });
  // Already signed in → straight in (the guard sends them to onboarding when the level is missing).
  const { data: me } = useQuery({ queryKey: ["account", "me"], queryFn: accountApi.me, retry: false });
  useEffect(() => {
    if (me?.user) navigate(next, { replace: true });
  }, [me, next, navigate]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError("");
    setForgotSent(false);
  };

  const canSubmit = email.trim() !== "" && (mode === "forgot" || password.trim() !== "") && !loading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");
    try {
      if (mode === "forgot") {
        await accountApi.forgotPassword(email.trim());
        setForgotSent(true);
      } else if (mode === "register") {
        // Level, age and gender are asked on the onboarding screen.
        await accountApi.register({ email, password, name: name.trim() || null });
        await qc.invalidateQueries({ queryKey: ["account", "me"] });
        navigate("/u/onboarding", { replace: true });
      } else {
        await accountApi.login(email, password);
        await qc.invalidateQueries({ queryKey: ["account", "me"] });
        navigate(next, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("userPages.login.defaultError"));
    } finally {
      setLoading(false);
    }
  }

  const heading =
    mode === "login"
      ? { kicker: t("userPages.login.heading.loginKicker"), h: t("userPages.login.heading.loginTitle"), p: t("userPages.login.heading.loginSubtitle") }
      : mode === "register"
        ? { kicker: t("userPages.login.heading.registerKicker"), h: t("userPages.login.heading.registerTitle"), p: t("userPages.login.heading.registerSubtitle") }
        : { kicker: t("userPages.login.heading.forgotKicker"), h: t("userPages.login.heading.forgotTitle"), p: t("userPages.login.heading.forgotSubtitle") };

  return (
    <div className="relative min-h-screen bg-slate-50 dark:bg-slate-950">
      <ThemeToggle className="absolute right-4 top-4 z-10" />
      <main className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 p-4 sm:p-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:p-8">
        <WelcomePanel />

        <section className="flex items-center justify-center py-8 lg:py-0">
          <div className="w-full max-w-[26rem]">
            <div className="mb-8 flex justify-center lg:hidden">
              <Logo size="lg" />
            </div>

            <p className="text-xs font-bold uppercase tracking-[0.16em] text-cyan-600 dark:text-cyan-400">{heading.kicker}</p>
            <h2 className="mt-1.5 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">{heading.h}</h2>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">{heading.p}</p>

            {mode !== "forgot" && (
              <div className="mt-6 grid grid-cols-2 rounded-2xl bg-slate-200/70 p-1 dark:bg-slate-800/80">
                {(
                  [
                    ["login", t("userPages.login.tabLogin")],
                    ["register", t("userPages.login.tabRegister")],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => switchMode(m)}
                    className={cn(
                      "rounded-xl py-2 text-sm font-bold transition",
                      mode === m
                        ? "bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {mode !== "forgot" && config?.google && (
              <>
                <a
                  href={googleOauthUrl}
                  className="mt-5 flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:shadow dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:border-slate-600"
                >
                  <GoogleLogo /> {t("userPages.login.googleContinue")}
                </a>
                <a
                  href={`${googleOauthUrl}?switch=1`}
                  className="mt-1.5 block text-center text-xs font-semibold text-slate-400 transition hover:text-cyan-600 dark:hover:text-cyan-400"
                >
                  {t("userPages.login.googleSwitch")}
                </a>
                <div className="my-5 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" /> {t("userPages.login.orEmail")}
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
                </div>
              </>
            )}

            {mode === "forgot" && forgotSent ? (
              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-500/10">
                <p className="font-bold text-emerald-700 dark:text-emerald-300">{t("userPages.login.checkEmailTitle")}</p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {t("userPages.login.checkEmailBodyPrefix")}<b>{email.trim()}</b>{t("userPages.login.checkEmailBodySuffix")}
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className={cn("flex flex-col gap-4", !(mode !== "forgot" && config?.google) && "mt-6")}>
                {mode === "register" && (
                  <Input label={t("userPages.login.nameLabel")} value={name} onChange={(e) => setName(e.target.value)} leftIcon={<UserRound className="size-4" />} placeholder={t("userPages.login.namePlaceholder")} />
                )}
                <Input
                  label="Email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  leftIcon={<Mail className="size-4" />}
                  placeholder="ban@example.com"
                />
                {mode !== "forgot" && (
                  <Input
                    label={t("userPages.login.passwordLabel")}
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    leftIcon={<Lock className="size-4" />}
                    className="pr-11"
                    placeholder={mode === "register" ? t("userPages.login.passwordMinLength") : "••••••••"}
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
                )}

                {mode === "login" && (
                  <button
                    type="button"
                    onClick={() => switchMode("forgot")}
                    className="-mt-2 self-end text-sm font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
                  >
                    {t("userPages.login.forgotPasswordLink")}
                  </button>
                )}

                {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">{error}</p>}

                <Button type="submit" size="lg" disabled={!canSubmit} className="h-12">
                  {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                  {mode === "login" ? t("userPages.login.tabLogin") : mode === "register" ? t("userPages.login.heading.registerTitle") : t("userPages.login.sendResetLink")}
                  {!loading && <ArrowRight className="size-4" />}
                </Button>
              </form>
            )}

            {mode === "forgot" && (
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 transition hover:text-cyan-600 dark:text-slate-400 dark:hover:text-cyan-400"
              >
                <ArrowLeft className="size-4" /> {t("userPages.login.backToLogin")}
              </button>
            )}

            <DevQuickLogin className="mt-6" />

            <p className="mt-10 text-center text-xs text-slate-400">
              {t("userPages.login.isTeacher")}{" "}
              <Link to="/teacher/login" className="font-semibold text-slate-500 hover:text-cyan-600 dark:text-slate-300 dark:hover:text-cyan-400">
                {t("userPages.login.teacherLoginLink")}
              </Link>
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
