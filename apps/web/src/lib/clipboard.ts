// Clipboard helpers that also work outside a secure context (e.g. the dev server opened by LAN IP),
// where `navigator.clipboard` is undefined.

/** Copies text; resolves true on success. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the legacy path.
  }
  return copyTextSync(text);
}

/** Synchronous copy (legacy execCommand) — use it right before opening a new tab, which steals focus. */
export function copyTextSync(text: string): boolean {
  try {
    const el = document.createElement("textarea");
    el.value = text;
    el.setAttribute("readonly", "");
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

/** Reads text from the clipboard; null when the browser does not allow it. */
export async function readText(): Promise<string | null> {
  try {
    return navigator.clipboard?.readText ? await navigator.clipboard.readText() : null;
  } catch {
    return null;
  }
}
