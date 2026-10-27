import { useEffect } from "react";
import { getBrand } from "./brand";

/**
 * Sets `document.title` per page with the app name as suffix, so the browser tab shows the context
 * instead of the static title in index.html. `null`/empty (e.g. still loading) → just the app name.
 */
export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    const { name } = getBrand();
    document.title = title ? `${title} · ${name}` : name;
  }, [title]);
}
