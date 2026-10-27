// Ảnh minh hoạ dùng chung trong trang làm bài (đề, thẻ ghép cặp/phân loại).
export function QImage({ src, className }: { src?: string | null; className?: string }) {
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      className={className ?? "mb-3 max-h-52 rounded-xl border border-slate-200 object-contain dark:border-slate-700"}
    />
  );
}
