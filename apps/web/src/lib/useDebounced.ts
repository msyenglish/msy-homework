// Trả bản TRỄ của một giá trị (đợi `delay` ms yên mới đổi) — dùng cho ô tìm kiếm gọi API,
// để mỗi phím gõ không bắn 1 request. Đổi giá trị liên tục → chỉ lần cuối (sau khi ngừng) mới có hiệu lực.
import { useEffect, useState } from "react";

export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
