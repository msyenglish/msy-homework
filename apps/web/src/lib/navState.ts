// ============================================================
//  NAVIGATION STATE — what the Back button is supposed to bring back.
//
//  Three separate problems, three tools.
//
//  1. `useScrollMemory` — where the page was scrolled to. React Router's <ScrollRestoration> only
//     works with a data router (createBrowserRouter); this app mounts <BrowserRouter>, and the
//     browser's own restoration cannot help either: at popstate the SPA has fetched nothing yet, so
//     the document is 0px tall and there is nowhere to scroll to.
//  2. `useHistoryState` — throw-away view state that is not worth a URL (how many rows are loaded,
//     which accordion is open). Without it, Back rebuilds a 12-row list and the scroll memory has
//     nothing to scroll to.
//  3. `useUrlState` — state a link should carry (tab, filter, search). Belongs in the query string
//     so it survives a reload and can be shared.
// ============================================================
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useNavigationType, useSearchParams } from "react-router-dom";

const STORE_KEY = "msyen:nav";
/** Live copy of the per-history-entry store; sessionStorage is only the backup across reloads. */
let store: Record<string, Record<string, unknown>> = {};
let loaded = false;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    store = JSON.parse(sessionStorage.getItem(STORE_KEY) || "{}");
  } catch { store = {}; }
}
function persist() {
  try {
    // Keep the store small: only the most recent entries can still be reached by Back.
    const keys = Object.keys(store);
    if (keys.length > 40) for (const k of keys.slice(0, keys.length - 40)) delete store[k];
    sessionStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch { /* private mode / full quota — memory copy still works for this session */ }
}
function readEntry(key: string, field: string): unknown {
  load();
  return store[key]?.[field];
}
function writeEntry(key: string, field: string, value: unknown) {
  load();
  (store[key] ??= {})[field] = value;
}

/**
 * The element that actually scrolls. The learner shell (UserLayout) is a fixed-height flex column
 * whose <main> scrolls, NOT the document — reading window.scrollY there always answered 0, which is
 * why the first version of this module restored nothing. A layout marks its scroller with
 * `data-scroll-root`; everything else falls back to the document.
 */
const scroller = () => document.querySelector<HTMLElement>("[data-scroll-root]");
const scrollTopOf = () => scroller()?.scrollTop ?? window.scrollY;
const scrollToY = (y: number) => {
  const el = scroller();
  if (el) el.scrollTo(0, y);
  else window.scrollTo(0, y);
};
/** Smooth-scrolls the active scroll root (or the document) back to the top. */
export const scrollPageTop = () => (scroller() ?? window).scrollTo({ top: 0, behavior: "smooth" });
const maxScroll = () => {
  const el = scroller();
  if (el) return Math.max(0, el.scrollHeight - el.clientHeight);
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
};

if (typeof window !== "undefined") {
  // Ours to restore, not the browser's — see the header comment.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  window.addEventListener("pagehide", persist);
}

/**
 * Remembers the scroll position of every history entry and puts it back on Back/Forward.
 * Mount ONCE, inside the router.
 *
 * Restoring is a loop rather than a single scrollTo: the list is still loading when the pop
 * happens, so the target position does not exist yet. Each frame re-applies it until the page is
 * tall enough (or the budget runs out) — which also keeps the view pinned while rows stream in.
 */
export function useScrollMemory() {
  const loc = useLocation();
  const navType = useNavigationType();
  const key = loc.key;

  // Record where this entry is being left. The listener is the ONLY writer: saving again on
  // cleanup overwrote the good value with 0, because by then the next page had already mounted and
  // clamped the scroll back to the top.
  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        writeEntry(key, "scrollY", scrollTopOf());
      });
    };
    const target: HTMLElement | Window = scroller() ?? window;
    target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      target.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
      persist();
    };
  }, [key]);

  // Only a move to a DIFFERENT page starts at the top. Opening a drawer or flipping a filter
  // pushes an entry at the same path, and yanking the page to the top under an open panel is the
  // very jump this module exists to stop.
  const lastPath = useRef(loc.pathname);
  useLayoutEffect(() => {
    const samePage = lastPath.current === loc.pathname;
    lastPath.current = loc.pathname;
    const saved = navType === "POP" ? (readEntry(key, "scrollY") as number | undefined) : undefined;
    if (!saved) {
      // PUSH or REPLACE onto another page starts at the top (a redirect must not keep the old scroll).
      if (navType !== "POP" && !samePage) scrollToY(0);
      return;
    }
    let raf = 0;
    let tries = 0;
    const tick = () => {
      const max = maxScroll();
      scrollToY(Math.min(saved, max));
      // Done once the page is tall enough to hold the position — or after ~1.5s of waiting for data.
      if (max >= saved - 2 || tries++ > 90) return;
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/**
 * useState whose value comes back when the learner returns to THIS history entry.
 * For view state that would be noise in the URL: how many rows are loaded, which section is open.
 */
export function useHistoryState<T>(field: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  // Keyed by the URL, not by location.key: an open drawer pushes a fresh entry at the same URL, and
  // a key-based store would answer "nothing saved" there and collapse the list behind the panel.
  const loc = useLocation();
  const key = loc.pathname + loc.search;
  const [value, setValue] = useState<T>(() => (readEntry(key, field) as T | undefined) ?? initial);
  const ref = useRef(value);
  ref.current = value;

  const set = useCallback((v: T | ((prev: T) => T)) => {
    const next = typeof v === "function" ? (v as (p: T) => T)(ref.current) : v;
    ref.current = next;
    writeEntry(key, field, next);
    setValue(next);
  }, [key, field]);

  return [value, set];
}

/**
 * A string in the query string. `push: false` (the default) REPLACES the entry — a filter typed
 * letter by letter must not bury the page under a dozen history steps. Pass `push` for a step the
 * learner would expect Back to undo, such as switching tab.
 */
export function useUrlState(key: string, fallback = "", opts?: { push?: boolean }): [string, (v: string) => void] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? fallback;
  const set = useCallback((v: string) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (!v || v === fallback) next.delete(key);
      else next.set(key, v);
      return next;
    }, { replace: !opts?.push });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, fallback, opts?.push, setParams]);
  return [value, set];
}

/**
 * "Back" that means one step, like the browser's own — falling back to a sensible page when there
 * is no step to take (the link was opened straight from Zalo, a notification, a new tab).
 * `history.state.idx` is React Router's own counter: 0 means this entry is the first of the session.
 */
export function useGoBack(fallback: string) {
  const nav = useNavigate();
  return useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) nav(-1);
    else nav(fallback, { replace: true });
  }, [nav, fallback]);
}
