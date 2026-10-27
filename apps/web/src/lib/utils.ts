import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Tên file tải bản ghi: `<slug>-ban-ghi.<ext>`; blob:/data: không có đuôi → webm. */
export function recordFileName(slug: string, src: string, suffix = "") {
  const ext = /\.(webm|mp3|m4a|wav|ogg)(?:\?|$)/i.exec(src)?.[1]?.toLowerCase() ?? "webm";
  return `${slug}-ban-ghi${suffix}.${ext}`;
}
