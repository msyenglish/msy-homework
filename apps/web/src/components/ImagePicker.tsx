import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ImageIcon, Images, Loader2, Pencil, Search, Trash2, Upload } from "lucide-react";
import { mediaApi, uploadImage, type AudioAsset, type ImageHit } from "../lib/api";
import Drawer from "./Drawer";
import { cn } from "../lib/utils";
import { t } from "../i18n";

// Chọn/đổi/xoá ảnh cho 1 trường: dropzone kéo-thả + preview to + Thư viện ảnh (quản lý mọi ảnh dự án).
export function ImagePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const [libOnline, setLibOnline] = useState(false); // mở thẳng chế độ tìm online
  const inputRef = useRef<HTMLInputElement>(null);

  async function doUpload(file: File | undefined | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error(t("teacherWidgets.imagePicker.onlyImageFiles"));
      return;
    }
    setUploading(true);
    try {
      const { url } = await uploadImage(file);
      onChange(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherWidgets.imagePicker.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  const hiddenInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        doUpload(f);
      }}
    />
  );

  const openLib = (online: boolean) => {
    setLibOnline(online);
    setLibOpen(true);
  };
  const drawer = (
    <MediaDrawer
      open={libOpen}
      initialOnline={libOnline}
      onClose={() => setLibOpen(false)}
      currentUrl={value}
      onPick={(url) => {
        onChange(url);
        setLibOpen(false);
      }}
      onUploadClick={() => inputRef.current?.click()}
      uploading={uploading}
    />
  );

  // ĐÃ có ảnh → preview TO + hàng nút.
  if (value) {
    // Ảnh TRÁI (chiếm phần lớn) + cột nút PHẢI ~28%. Mobile xếp dọc cho đỡ bóp ảnh.
    const btn =
      "inline-flex w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700";
    return (
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-950">
          <img src={value} alt={t("teacherWidgets.imagePicker.selectedImageAlt")} className="mx-auto max-h-80 w-auto max-w-full object-contain" />
        </div>
        <div className="flex flex-wrap gap-2 sm:w-[28%] sm:shrink-0 sm:flex-col">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className={btn}>
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {t("teacherWidgets.imagePicker.changeImage")}
          </button>
          <button type="button" onClick={() => openLib(false)} className={btn}>
            <Images className="size-4" /> {t("teacherWidgets.imagePicker.library")}
          </button>
          <button type="button" onClick={() => openLib(true)} className={btn}>
            <Search className="size-4" /> {t("teacherWidgets.imagePicker.searchOnline")}
          </button>
          <button
            type="button"
            onClick={() => onChange("")}
            className="inline-flex w-full items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 dark:border-rose-900 dark:hover:bg-rose-500/10"
          >
            <Trash2 className="size-4" /> {t("teacherWidgets.imagePicker.deleteImage")}
          </button>
        </div>
        {hiddenInput}
        {drawer}
      </div>
    );
  }

  // CHƯA có ảnh → dropzone viền đứt.
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          doUpload(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition",
          drag
            ? "border-cyan-400 bg-cyan-50 dark:border-cyan-500 dark:bg-cyan-500/10"
            : "border-slate-300 bg-slate-50/60 hover:border-cyan-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-cyan-700 dark:hover:bg-slate-800/70",
        )}
      >
        <div className="flex size-12 items-center justify-center rounded-2xl bg-cyan-500/15 text-cyan-600 dark:text-cyan-400">
          {uploading ? <Loader2 className="size-6 animate-spin" /> : <ImageIcon className="size-6" />}
        </div>
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {uploading ? t("teacherWidgets.imagePicker.uploading") : t("teacherWidgets.imagePicker.dropOrClick")}
        </p>
        <p className="text-xs text-slate-400">{t("teacherWidgets.imagePicker.hint")}</p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openLib(false);
          }}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <Images className="size-3.5" /> {t("teacherWidgets.imagePicker.chooseFromLibrary")}
        </button>
      </div>
      {hiddenInput}
      {drawer}
    </div>
  );
}

// Drawer THƯ VIỆN ẢNH — 2 chế độ: ảnh dự án (đã upload) + TÌM ẢNH online (Pexels/Pixabay).
function MediaDrawer({
  open,
  onClose,
  currentUrl,
  onPick,
  onUploadClick,
  uploading,
  initialOnline,
}: {
  open: boolean;
  onClose: () => void;
  currentUrl: string;
  onPick: (url: string) => void;
  onUploadClick: () => void;
  uploading: boolean;
  initialOnline?: boolean; // true → mở thẳng ở chế độ tìm ảnh online
}) {
  const [items, setItems] = useState<AudioAsset[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // key đang xoá
  // Tìm ảnh online.
  const [query, setQuery] = useState("");
  // Ô tìm có 2 CHẾ ĐỘ tách bạch: "local" lọc ảnh dự án tức thì · "online" gọi Pexels/Pixabay khi bấm.
  const [searchMode, setSearchMode] = useState<"local" | "online">("local");
  const [results, setResults] = useState<ImageHit[] | null>(null); // null = đang xem thư viện; [] = đã tìm, rỗng
  const [searching, setSearching] = useState(false);
  const [source, setSource] = useState<"Pexels" | "Pixabay" | null>(null);
  const [importing, setImporting] = useState<string | null>(null); // id ảnh đang nhập
  // Đặt tiêu đề cho ảnh (bảng media_titles) — tên file uuid vô nghĩa, có tiêu đề mới tìm lại được.
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  async function saveTitle(key: string) {
    const title = editTitle.trim();
    setEditKey(null);
    try {
      await mediaApi.rename(key, title);
      setItems((prev) => (prev ? prev.map((i) => (i.key === key ? { ...i, title: title || null } : i)) : prev));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherWidgets.imagePicker.renameFailed"));
    }
  }

  function refresh() {
    setItems(null);
    mediaApi
      .images()
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
  }

  // Nạp lại thư viện mỗi lần mở (bắt cả ảnh vừa upload xong).
  useEffect(() => {
    if (open) refresh();
  }, [open, uploading]);

  // Mỗi lần MỞ: về mode theo initialOnline (nút "Tìm online" mở thẳng chế độ online).
  useEffect(() => {
    if (open) {
      setSearchMode(initialOnline ? "online" : "local");
      setResults(null);
      setQuery("");
    }
  }, [open, initialOnline]);

  async function remove(key: string) {
    setBusy(key);
    try {
      await mediaApi.remove(key);
      setItems((prev) => (prev ? prev.filter((i) => i.key !== key) : prev));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherWidgets.imagePicker.deleteFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function doSearch() {
    const q = query.trim();
    if (!q) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const r = await mediaApi.search(q);
      setResults(r.items);
      setSource(r.source);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherWidgets.imagePicker.searchFailed"));
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  // Chọn 1 ảnh online → tải về R2 rồi dùng URL same-origin.
  async function useOnline(hit: ImageHit) {
    setImporting(hit.id);
    try {
      const { url } = await mediaApi.importImage(hit.full);
      onPick(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("teacherWidgets.imagePicker.importFailed"));
    } finally {
      setImporting(null);
    }
  }

  const showingSearch = results !== null;
  // Ô tìm kiêm 2 việc: gõ tới đâu LỌC thư viện tới đó; bấm Tìm mới gọi ảnh online.
  const localHits = (items ?? []).filter((it) => {
    const q = query.trim().toLowerCase();
    return !q || (it.title ?? "").toLowerCase().includes(q) || it.name.toLowerCase().includes(q);
  });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("teacherWidgets.imagePicker.drawerTitle")}
      description={t("teacherWidgets.imagePicker.drawerDescription")}
      icon={<Images className="size-5" />}
      width="max-w-2xl"
      footer={
        <button
          type="button"
          onClick={onUploadClick}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-40"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {t("teacherWidgets.imagePicker.uploadNew")}
        </button>
      }
    >
      {/* Chuyển chế độ: Trong dự án (lọc tại chỗ) ↔ Tìm online (Pexels/Pixabay) */}
      <div className="mb-2 inline-flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
        {([
          { v: "local" as const, label: t("teacherWidgets.imagePicker.tabLocal") },
          { v: "online" as const, label: t("teacherWidgets.imagePicker.tabOnline") },
        ]).map((m) => (
          <button
            key={m.v}
            type="button"
            onClick={() => {
              setSearchMode(m.v);
              setResults(null);
              setQuery("");
            }}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition",
              searchMode === m.v
                ? "bg-white text-cyan-600 shadow-sm dark:bg-slate-900 dark:text-cyan-400"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* Ô tìm — local: lọc ngay khi gõ · online: bấm/Enter mới gọi Pexels/Pixabay */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (searchMode === "online") doSearch();
        }}
        className="mb-3 flex gap-2"
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              searchMode === "online"
                ? t("teacherWidgets.imagePicker.searchOnlinePlaceholder")
                : t("teacherWidgets.imagePicker.searchLocalPlaceholder")
            }
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-cyan-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        {searchMode === "online" && (
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-cyan-500 px-3 text-sm font-semibold text-white transition hover:bg-cyan-600 disabled:opacity-40"
          >
            {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} {t("teacherWidgets.imagePicker.searchBtn")}
          </button>
        )}
      </form>

      {showingSearch ? (
        // ── KẾT QUẢ TÌM ẢNH ONLINE ──
        searching ? (
          <div className="flex justify-center py-16">
            <Loader2 className="size-6 animate-spin text-cyan-500" />
          </div>
        ) : results.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-500">
            {t("teacherWidgets.imagePicker.notFoundOnline", { query })}
          </div>
        ) : (
          <>
            {source && (
              <p className="mb-2 text-[11px] text-slate-400">
                {t("teacherWidgets.imagePicker.sourcePrefix")} <b>{source}</b> {t("teacherWidgets.imagePicker.sourceSuffix")}
              </p>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {results.map((hit) => (
                <button
                  key={hit.id}
                  type="button"
                  onClick={() => useOnline(hit)}
                  disabled={!!importing}
                  title={hit.alt || hit.author}
                  className="group relative block aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-950"
                >
                  <img src={hit.thumb} alt={hit.alt || ""} className="size-full object-cover transition group-hover:opacity-90" loading="lazy" />
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {hit.source}
                  </span>
                  {importing === hit.id && (
                    <span className="absolute inset-0 flex items-center justify-center bg-white/60 dark:bg-slate-900/60">
                      <Loader2 className="size-6 animate-spin text-cyan-600" />
                    </span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-2 py-1 text-left text-[10px] text-white/90">
                    {hit.author}
                  </span>
                </button>
              ))}
            </div>
          </>
        )
      ) : items === null ? (
        <div className="flex justify-center py-16">
          <Loader2 className="size-6 animate-spin text-cyan-500" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-500">
          {t("teacherWidgets.imagePicker.emptyLocal")}
        </div>
      ) : localHits.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-500">
          {t("teacherWidgets.imagePicker.noMatchLocal", { query: query.trim() })}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {localHits.map((it) => {
            const active = it.url === currentUrl;
            return (
              <div
                key={it.key}
                className={cn(
                  "group relative overflow-hidden rounded-xl border bg-slate-50 dark:bg-slate-950",
                  active ? "border-cyan-400 ring-2 ring-cyan-300 dark:ring-cyan-700" : "border-slate-200 dark:border-slate-800",
                )}
              >
                <button type="button" onClick={() => onPick(it.url)} className="block aspect-square w-full">
                  <img src={it.url} alt={it.name} className="size-full object-cover transition group-hover:opacity-90" />
                </button>
                {active && (
                  <span className="absolute left-1.5 top-1.5 rounded-md bg-cyan-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {t("teacherWidgets.imagePicker.inUse")}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => remove(it.key)}
                  disabled={busy === it.key}
                  title={t("teacherWidgets.imagePicker.deleteImage")}
                  className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-lg bg-white/90 text-rose-600 opacity-0 shadow transition hover:bg-rose-50 group-hover:opacity-100 disabled:opacity-40 dark:bg-slate-800/90"
                >
                  {busy === it.key ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                </button>
                {editKey === it.key ? (
                  <input
                    autoFocus
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => saveTitle(it.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveTitle(it.key);
                      if (e.key === "Escape") setEditKey(null);
                    }}
                    placeholder={t("teacherWidgets.imagePicker.titlePlaceholder")}
                    className="w-full border-t border-cyan-400 bg-white px-2 py-1.5 text-[13px] outline-none dark:bg-slate-900 dark:text-white"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditKey(it.key);
                      setEditTitle(it.title ?? "");
                    }}
                    title={it.title ? t("teacherWidgets.imagePicker.titleEditHint", { title: it.title }) : t("teacherWidgets.imagePicker.titleSetHint", { name: it.name })}
                    className="flex w-full items-center gap-1 px-2 py-1.5 text-left"
                  >
                    <span className={cn("truncate text-[13px] font-medium", it.title ? "text-slate-700 dark:text-slate-200" : "text-slate-400 italic")}>
                      {it.title || t("teacherWidgets.imagePicker.setTitle")}
                    </span>
                    <Pencil className="size-3 shrink-0 text-slate-400" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Drawer>
  );
}
