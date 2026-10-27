// Vietnamese translation of a suggested outline, on demand. Shared by the speaking and writing
// practice screens — both read the outline from `speaking_framework`, so both use this endpoint.
//
// Order of preference: the baked translation shipped with the exercise (`framework.outlineVi`) →
// localStorage → one AI call. The AI call is the last resort and its result is cached both places.
import { useState } from "react";
import { libraryApi } from "../../lib/api";

export function useOutlineVi(slug: string, baked?: string[] | null) {
  const key = `outline-vi:${slug}`;
  const [vi, setVi] = useState<string[] | null>(() => {
    if (baked && baked.length) return baked;
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      return null;
    }
  });
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setError("");
    if (vi) {
      setShow((v) => !v);
      return;
    }
    setLoading(true);
    try {
      const r = await libraryApi.outlineVi(slug);
      setVi(r.vi);
      setShow(true);
      try {
        localStorage.setItem(key, JSON.stringify(r.vi));
      } catch {
        /* out of quota → fine, translate again next time */
      }
    } catch {
      setError("Couldn't translate, please try again.");
    } finally {
      setLoading(false);
    }
  }
  return { vi: show ? vi : null, loading, error, toggle, on: show };
}
