// Cổng đăng nhập cho USER CÔNG KHAI (public self-serve) — tương tự RequireAuth (giáo viên)
// nhưng kiểm phiên qua /account/me (cookie msyen_user).
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, useLocation } from "react-router-dom";
import { accountApi } from "../lib/api";
import { PageLoading } from "./PageLoading";

export default function RequireUser({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["account", "me"],
    queryFn: accountApi.me,
    retry: false,
  });

  if (isLoading) {
    return <PageLoading full />;
  }
  if (isError || !data?.user) {
    return <Navigate to={`/u/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }
  return <>{children}</>;
}
