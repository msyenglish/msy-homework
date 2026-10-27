// Quản lý theme sáng/tối.
// Thứ tự quyết: lựa chọn user đã lưu (TÀI KHOẢN users.theme, đệm localStorage['theme'])
// → theo system (prefers-color-scheme) → system không có preference thì theo giờ VN (18h–6h = tối).
// Đã đăng nhập: đổi theme lưu luôn lên tài khoản → máy khác vào cũng đúng giao diện.
import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PublicUser } from "@msyen/shared";
import { accountApi } from "./api";

export type Theme = "light" | "dark";

// Đổi theme ở một nơi → mọi nút/hook đang mở cập nhật theo.
const EVT = "themechange";

// Lựa chọn user đã tự lưu; null = chưa từng chọn (→ theo system/giờ).
export function getStoredTheme(): Theme | null {
  try {
    const t = localStorage.getItem("theme");
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

// Fallback theo giờ VN (GMT+7) khi system không nêu preference.
function timeThemeGmt7(): Theme {
  const hour = (new Date().getUTCHours() + 7) % 24;
  return hour >= 18 || hour < 6 ? "dark" : "light";
}

// Theme suy ra khi user CHƯA tự chọn: ưu tiên system, không có preference → theo giờ.
export function systemTheme(): Theme {
  try {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    if (window.matchMedia("(prefers-color-scheme: light)").matches) return "light";
  } catch {
    /* bỏ qua */
  }
  return timeThemeGmt7();
}

export function getInitialTheme(): Theme {
  return getStoredTheme() ?? systemTheme();
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function writeStored(theme: Theme) {
  try {
    localStorage.setItem("theme", theme);
  } catch {
    /* bỏ qua */
  }
  window.dispatchEvent(new CustomEvent(EVT));
}

// Đồng bộ MỘT CHIỀU tài khoản → máy này (gọi khi hồ sơ về). Không ghi ngược lên server.
export function adoptAccountTheme(theme?: string | null): void {
  if (theme !== "light" && theme !== "dark") return;
  if (theme === getStoredTheme()) return;
  writeStored(theme);
  applyTheme(theme);
}

export function useTheme() {
  const qc = useQueryClient();
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Nơi khác đổi theme (nút ở header khác, hoặc hồ sơ vừa về) → hook này bám theo.
  useEffect(() => {
    const h = () => setThemeState(getInitialTheme());
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);

  // Khi user CHƯA tự chọn → bám system: đổi light/dark ở OS thì theme đổi theo (không ghi localStorage).
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }
    const onChange = () => {
      if (!getStoredTheme()) setThemeState(systemTheme());
    };
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);

  // Ghi lựa chọn của user → được ưu tiên ở những lần load sau.
  const setTheme = useCallback(
    (t: Theme) => {
      writeStored(t);
      setThemeState(t);
      // Đã đăng nhập → lưu lên tài khoản (cập nhật lạc quan cache "me"; lỗi thì nuốt im lặng).
      const me = qc.getQueryData<{ user: PublicUser | null }>(["account", "me"]);
      if (me?.user) {
        qc.setQueryData<{ user: PublicUser | null }>(["account", "me"], { user: { ...me.user, theme: t } });
        accountApi.updateProfile({ theme: t }).catch(() => {});
      }
    },
    [qc],
  );

  const toggle = () => setTheme(theme === "dark" ? "light" : "dark");
  return { theme, setTheme, toggle };
}
