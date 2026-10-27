// Install branding (app name, logo, teacher title) for the whole SPA. Loaded once before the first
// render; the last value is kept in localStorage so later boots never wait on the network.
import { applyTeacherTitle, DEFAULT_BRAND, type Brand } from "@msyen/shared";

const STORE_KEY = "brand_v1";
let current: Brand = readStored() ?? DEFAULT_BRAND;

function readStored(): Brand | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? { ...DEFAULT_BRAND, ...(JSON.parse(raw) as Partial<Brand>) } : null;
  } catch {
    return null;
  }
}

async function fetchBrand(timeoutMs: number): Promise<Brand | null> {
  try {
    const res = await fetch("/api/v1/brand", { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return { ...DEFAULT_BRAND, ...((await res.json()) as Partial<Brand>) };
  } catch {
    return null;
  }
}

function adopt(b: Brand) {
  current = b;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(b));
  } catch {
    /* storage unavailable — the in-memory value still applies */
  }
  document.title = b.name;
  setFavicon(b.faviconUrl ?? b.logoUrl);
}

/** Points the tab icon at the brand's favicon (or logo); null restores the built-in icon. */
function setFavicon(url: string | null) {
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) return;
  link.href = url ?? "/favicon.svg";
  if (url) link.removeAttribute("type");
  else link.type = "image/svg+xml";
}

/** Call before rendering: waits for the network only on a first visit. */
export async function bootBrand(): Promise<void> {
  if (readStored()) {
    document.title = current.name;
    setFavicon(current.faviconUrl ?? current.logoUrl);
    void fetchBrand(5000).then((b) => b && adopt(b)); // refresh for the next render/boot
    return;
  }
  const b = await fetchBrand(2500);
  adopt(b ?? DEFAULT_BRAND);
}

/** Applies freshly saved branding (the caller reloads the page so every screen picks it up). */
export function setBrand(b: Brand) {
  adopt(b);
}

export function getBrand(): Brand {
  return current;
}

/**
 * Rewrites UI copy written with the default persona: "MSY English" becomes the configured teacher name
 * and the Vietnamese teacher pronoun follows the configured title.
 */
export function tt(text: string): string {
  return applyTeacherTitle(text.replaceAll(DEFAULT_BRAND.teacherName, current.teacherName), current.title);
}
