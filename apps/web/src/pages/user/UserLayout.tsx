// Shell cho khu USER CÔNG KHAI: header (logo, điểm, đăng xuất) + nav (Thư viện / Tài khoản).
// Bọc trong RequireUser ở App.tsx nên chắc chắn đã đăng nhập.
import { useEffect, useRef } from "react";
import { Navigate, Outlet, useLocation, useOutletContext } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { PublicUser } from "@msyen/shared";
import { accountApi } from "../../lib/api";
import UserTopNav, { USER_NAV_ITEMS } from "../../components/UserTopNav";
import { PracticeFooter } from "../../components/practice/PracticeFooter";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import { adoptAccountVoiceGender } from "../../lib/voiceGender";
import { adoptAccountTheme } from "../../lib/theme";

export interface UserCtx {
  user: PublicUser;
}
export function usePublicUser() {
  return useOutletContext<UserCtx>();
}

export default function UserLayout() {
  const { pathname } = useLocation();

  const { data: me } = useQuery({ queryKey: ["account", "me"], queryFn: accountApi.me, retry: false });
  const user = me?.user;

  // Vùng cuộn nội bộ: header nằm ngoài → tràn viền, scrollbar chỉ chạy dưới header.
  const scrollRef = useRef<HTMLElement>(null);

  // Bật chế độ shell khung cố định (tắt gutter html) khi ở khu user; tắt khi rời đi.
  useEffect(() => {
    document.documentElement.classList.add("shell-fixed");
    return () => document.documentElement.classList.remove("shell-fixed");
  }, []);

  // Đồng bộ giọng đọc ưa thích từ tài khoản → localStorage (để mọi nút Nghe đọc đúng giọng).
  useEffect(() => {
    adoptAccountVoiceGender(user?.voice_gender, user?.voice_gender_sentence);
  }, [user?.voice_gender, user?.voice_gender_sentence]);

  // Giao diện sáng/tối cũng theo tài khoản — máy khác vào vẫn đúng lựa chọn của em.
  useEffect(() => {
    adoptAccountTheme(user?.theme);
  }, [user?.theme]);

  // Chưa chọn cấp độ (user mới, nhất là qua Google) → bắt buộc onboarding trước.
  if (user && !user.level_id) return <Navigate to="/u/onboarding" replace />;

  // "Nhận xét của cô" chỉ dành cho thành viên lớp — gõ thẳng URL khi ngoài lớp → về Thư viện.
  if (user && !user.in_class && pathname.startsWith("/u/reports"))
    return <Navigate to="/u/library" replace />;

  // Tiêu đề tab trình duyệt theo trang đang xem.
  const active = USER_NAV_ITEMS.find((t) => pathname.startsWith(t.to));
  useDocumentTitle(active?.label);

  return (
    // `app-shell` pins the column to the viewport with inset instead of a dvh height — see index.css.
    <div className="app-shell flex flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
      <UserTopNav />

      {/* Vùng cuộn: full-width (scrollbar sát mép phải, dưới header); nội dung căn giữa bên trong.
          scrollbar-gutter:stable → luôn chừa chỗ scrollbar nên đổi tab dài↔ngắn KHÔNG giật ngang. */}
      <main ref={scrollRef} data-scroll-root className="flex flex-1 flex-col overflow-y-auto [scrollbar-gutter:stable]">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-6">
          {user ? <Outlet context={{ user } satisfies UserCtx} /> : null}
        </div>
        {/* mt-auto inside the flex column pins the footer to the bottom of short pages. */}
        <PracticeFooter className="mt-auto" />
      </main>
    </div>
  );
}
