import { useEffect, useRef, useState } from "react";

// Panel sticky (bài đọc / bài học): vào trang MỞ RỘNG; khi cuộn khiến panel DÍNH top
// → tự THU GỌN để thấy câu hỏi; cuộn về đầu → tự mở lại.
//
// Chống NHẢY/che câu hỏi mà KHÔNG đụng vị trí cuộn (không scrollBy — thứ đánh nhau với
// thao tác cuộn của người dùng): khi thu gọn, DÀNH đúng khoảng trống bằng chiều cao panel
// lúc mở (đo bằng ResizeObserver). Nhờ vậy tổng chiều cao không đổi → câu 1 đứng yên;
// phần trống chính là "gap" giữa panel thu gọn và câu hỏi.
//
// Auto-collapse dựa trên IntersectionObserver của 1 sentinel ĐẶT NGAY TRƯỚC wrapper.
//  • enabled=false → tắt tự động (user tự chủ động thu gọn).
//  • reserveRatio → dành BAO NHIÊU phần chiều cao lúc mở làm "gap" khi thu gọn (0..1).
//    Dành đủ để câu hỏi không bị che, KHÔNG dành hết (tránh khoảng trống quá rộng).
export function useStuckCollapse({
  enabled = true,
  initial = true,
  reserveRatio = 0.45,
}: { enabled?: boolean; initial?: boolean; reserveRatio?: number } = {}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(initial);
  const [fullHeight, setFullHeight] = useState(0);

  // Đo chiều cao panel KHI ĐANG MỞ → để dành đúng khoảng đó lúc thu gọn.
  useEffect(() => {
    if (!expanded) return;
    const el = panelRef.current;
    if (!el) return;
    const measure = () => setFullHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [expanded]);

  // Tự thu gọn/mở theo sentinel (KHÔNG đụng vị trí cuộn).
  useEffect(() => {
    if (!enabled) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setExpanded(e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [enabled]);

  // Chiều cao dành chỗ khi thu gọn = 1 PHẦN chiều cao lúc mở (undefined khi mở).
  const reservedHeight = !expanded && fullHeight ? Math.round(fullHeight * reserveRatio) : undefined;
  return { sentinelRef, panelRef, expanded, setExpanded, reservedHeight };
}
