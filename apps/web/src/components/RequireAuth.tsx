import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate } from "react-router-dom";
import { auth } from "../lib/api";
import { PageLoading } from "./PageLoading";

export default function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: auth.me,
    retry: false,
  });

  if (isLoading) {
    return <PageLoading full />;
  }
  if (isError || !data) {
    return <Navigate to="/teacher/login" replace />;
  }
  return <>{children}</>;
}
