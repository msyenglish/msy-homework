// Đặt lại mật khẩu bằng token trong link email (/u/reset-password?token=…).
// Thành công → server đăng nhập luôn; chuyển vào /u/library (guard lo onboarding nếu thiếu cấp độ).
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, LockKeyhole } from "lucide-react";
import { accountApi } from "../../lib/api";
import ThemeToggle from "../../components/ThemeToggle";
import { Logo } from "../../components/Logo";
import { Button, Input } from "../../components/ui";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { t } from "../../i18n";

export default function UserResetPasswordPage() {
  useDocumentTitle(t("userPages.resetPassword.pageTitle"));
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = password.trim().length >= 6 && password === confirm && !loading;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) {
      setError(t("userPages.resetPassword.invalidLinkMissingToken"));
      return;
    }
    if (password !== confirm) {
      setError(t("userPages.resetPassword.mismatch"));
      return;
    }
    setLoading(true);
    setError("");
    try {
      await accountApi.resetPassword(token, password);
      await qc.invalidateQueries({ queryKey: ["account", "me"] });
      navigate("/u/library", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("userPages.resetPassword.defaultError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-slate-100 px-4 py-10 dark:bg-slate-950">
      <ThemeToggle className="absolute right-4 top-4" />
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-xl shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900 dark:shadow-none">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo />
          <div>
            <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{t("userPages.resetPassword.title")}</h1>
            <p className="mt-1 text-sm text-slate-500">{t("userPages.resetPassword.subtitle")}</p>
          </div>
        </div>

        {token ? (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <Input
              label={t("userPages.resetPassword.newPasswordLabel")}
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<LockKeyhole className="size-4" />}
              placeholder={t("userPages.login.passwordMinLength")}
            />
            <Input
              label={t("userPages.resetPassword.confirmPasswordLabel")}
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              leftIcon={<KeyRound className="size-4" />}
              placeholder={t("userPages.resetPassword.confirmPasswordPlaceholder")}
            />
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button type="submit" size="lg" disabled={!canSubmit}>
              {loading ? t("userPages.resetPassword.resetting") : t("userPages.resetPassword.submit")}
            </Button>
          </form>
        ) : (
          <div className="text-center">
            <p className="text-sm text-rose-600">{t("userPages.resetPassword.invalidTokenMessage")}</p>
            <button
              type="button"
              onClick={() => navigate("/u/login", { replace: true })}
              className="mt-4 text-sm font-semibold text-cyan-600 hover:underline dark:text-cyan-400"
            >
              {t("userPages.resetPassword.backToLogin")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
