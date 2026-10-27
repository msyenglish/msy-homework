// Locks page scroll while an overlay is open — ref-counted so nested drawers do not unlock early
// (open 2, close 1 → still locked).
// The scrolling element is the layout's `[data-scroll-root]` (fixed shells: learner + teacher) or
// <html> elsewhere (body is only min-height:100vh). Both have `scrollbar-gutter: stable`; the
// padding fallback covers browsers without a gutter.
let lockCount = 0;
let locked: HTMLElement | null = null;

export function lockScroll() {
  if (lockCount === 0) {
    const el = document.querySelector<HTMLElement>("[data-scroll-root]") ?? document.documentElement;
    const sbw = el === document.documentElement ? window.innerWidth - el.clientWidth : el.offsetWidth - el.clientWidth;
    el.style.overflow = "hidden";
    if (sbw > 0 && getComputedStyle(el).scrollbarGutter !== "stable") el.style.paddingRight = `${sbw}px`;
    locked = el;
  }
  lockCount++;
}

export function unlockScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0 && locked) {
    locked.style.overflow = "";
    locked.style.paddingRight = "";
    locked = null;
  }
}
