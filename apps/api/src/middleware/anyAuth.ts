// Middleware: yêu cầu đăng nhập, CHẤP NHẬN CẢ user công khai lẫn giáo viên.
// Dùng cho endpoint không cần biết vai trò gì cụ thể — chỉ cần "đã đăng nhập" để chặn khách vãng lai
// (vd sổ tay ngữ pháp danh sách). KHÔNG set c.get("user")/c.get("teacher") — route không cần.
import type { MiddlewareHandler } from "hono";
import { getCookie } from "hono/cookie";
import { verify } from "hono/jwt";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../lib/env";
import { USER_COOKIE, USER_ROLE } from "./userAuth";
import { AUTH_COOKIE } from "./auth";

export const requireAnyAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  const userToken = getCookie(c, USER_COOKIE);
  const teacherToken = getCookie(c, AUTH_COOKIE);

  if (userToken) {
    try {
      const payload = await verify(userToken, c.env.JWT_SECRET, "HS256");
      if (payload.role === USER_ROLE) {
        await next();
        return;
      }
    } catch {
      // fall through — thử cookie giáo viên bên dưới
    }
  }

  if (teacherToken) {
    try {
      const payload = await verify(teacherToken, c.env.JWT_SECRET, "HS256");
      // Token cũ (chưa có claim role) coi là hợp lệ — giống requireTeacher.
      if (!payload.role || payload.role === "teacher") {
        await next();
        return;
      }
    } catch {
      // cả hai cookie đều không hợp lệ
    }
  }

  throw new HTTPException(401, { message: "Chưa đăng nhập" });
};
