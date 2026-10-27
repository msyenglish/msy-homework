// Install-level branding: app name, logo, and how the teacher refers to themselves.
// Stored in the `settings` table, read publicly through GET /api/v1/brand.

export type TeacherTitle = "cô" | "thầy";
export type UiLang = "vi" | "en";
export const UI_LANGS: UiLang[] = ["vi", "en"];
export const isUiLang = (v: unknown): v is UiLang => v === "vi" || v === "en";

export interface Brand {
  /** App name shown in the header, tab title, emails. */
  name: string;
  /** Pronoun the teacher uses with learners: the female or the male teacher form. */
  title: TeacherTitle;
  /** English persona shown in learner-facing English copy, e.g. "MSY English", "Mr Nam". */
  teacherName: string;
  /** Custom logo mark (square). Null → the built-in mark. */
  logoUrl: string | null;
  /** Optional dark-mode variant of the logo. Null → `logoUrl` in both themes. */
  logoDarkUrl: string | null;
  /** Show the app name as text next to the logo (off when the logo already contains it). */
  showName: boolean;
  /** Browser tab icon. Null → `logoUrl`, then the built-in icon. */
  faviconUrl: string | null;
  /** "/" shows the public home page; off → "/" goes straight to the learner sign-in. */
  homePage: boolean;
  /** Default interface language for everyone; each person can still switch for themselves. */
  language: UiLang;
  /** Learner footer: one-line intro under the logo. Null → the built-in sentence. */
  footerTagline: string | null;
  /** Learner footer: free text under the links (address, opening hours…). */
  footerNote: string | null;
  /** Learner footer: contact links shown as icons; empty ones are hidden. */
  footerLinks: FooterLinks;
  /** Learner footer: show the "Grammar · Reading · …" line. */
  footerSkills: boolean;
}

export type FooterLinks = { website: string; facebook: string; youtube: string; zalo: string; email: string };
export const FOOTER_LINK_KEYS = ["website", "facebook", "youtube", "zalo", "email"] as const;
const EMPTY_LINKS: FooterLinks = { website: "", facebook: "", youtube: "", zalo: "", email: "" };

export const DEFAULT_BRAND: Brand = {
  name: "MSYen Homework",
  title: "cô",
  teacherName: "MSY English",
  logoUrl: null,
  logoDarkUrl: null,
  showName: true,
  faviconUrl: null,
  homePage: true,
  language: "vi",
  footerTagline: null,
  footerNote: null,
  footerLinks: EMPTY_LINKS,
  footerSkills: true,
};

export const BRAND_SETTING_KEYS = {
  name: "brand_name",
  title: "brand_teacher_title",
  teacherName: "brand_teacher_name",
  logoUrl: "brand_logo_url",
  logoDarkUrl: "brand_logo_dark_url",
  showName: "brand_show_name",
  faviconUrl: "brand_favicon_url",
  homePage: "brand_home_page",
  language: "brand_language",
  footerTagline: "brand_footer_tagline",
  footerNote: "brand_footer_note",
  footerLinks: "brand_footer_links",
  footerSkills: "brand_footer_skills",
} as const;

/** Parses the stored footer links JSON, keeping only known string fields. */
export function parseFooterLinks(raw: string | null | undefined): FooterLinks {
  try {
    const v = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const out = { ...EMPTY_LINKS };
    for (const k of FOOTER_LINK_KEYS) if (typeof v[k] === "string") out[k] = (v[k] as string).trim().slice(0, 300);
    return out;
  } catch {
    return { ...EMPTY_LINKS };
  }
}

export const isTeacherTitle = (v: unknown): v is TeacherTitle => v === "cô" || v === "thầy";

/** Builds a Brand from raw `settings` values, falling back to the defaults. */
export function brandFromSettings(get: (key: string) => string | null | undefined): Brand {
  const title = get(BRAND_SETTING_KEYS.title);
  return {
    name: get(BRAND_SETTING_KEYS.name)?.trim() || DEFAULT_BRAND.name,
    title: isTeacherTitle(title) ? title : DEFAULT_BRAND.title,
    teacherName: get(BRAND_SETTING_KEYS.teacherName)?.trim() || DEFAULT_BRAND.teacherName,
    logoUrl: get(BRAND_SETTING_KEYS.logoUrl)?.trim() || null,
    logoDarkUrl: get(BRAND_SETTING_KEYS.logoDarkUrl)?.trim() || null,
    showName: get(BRAND_SETTING_KEYS.showName) !== "0",
    faviconUrl: get(BRAND_SETTING_KEYS.faviconUrl)?.trim() || null,
    homePage: get(BRAND_SETTING_KEYS.homePage) !== "0",
    language: isUiLang(get(BRAND_SETTING_KEYS.language)) ? (get(BRAND_SETTING_KEYS.language) as UiLang) : DEFAULT_BRAND.language,
    footerTagline: get(BRAND_SETTING_KEYS.footerTagline)?.trim() || null,
    footerNote: get(BRAND_SETTING_KEYS.footerNote)?.trim() || null,
    footerLinks: parseFooterLinks(get(BRAND_SETTING_KEYS.footerLinks)),
    footerSkills: get(BRAND_SETTING_KEYS.footerSkills) !== "0",
  };
}

const L = "\\p{L}\\p{M}";
// Compounds where the pronoun does not mean the teacher (little girl, she, madam, lonely…).
const NOT_TEACHER = `\\s+(?:nàng|bé|gái|dâu|ấy|đơn|đọng|lập|đặc|chú)(?![${L}])`;
const WORD = new RegExp(`(?<![${L}])(?<!quý\\s)(cô|thầy)(?![${L}])(?!${NOT_TEACHER})`, "giu");

function withCase(sample: string, word: string): string {
  if (sample === sample.toUpperCase()) return word.toUpperCase();
  if (sample[0] === sample[0].toUpperCase()) return word[0].toUpperCase() + word.slice(1);
  return word;
}

/**
 * Rewrites Vietnamese copy written in the default (female teacher) voice for the configured title.
 * Swaps the two pronouns as whole words in both directions, keeping case, so a prompt line that
 * forbids the other pronoun flips along with the rest.
 */
export function applyTeacherTitle(text: string, title: TeacherTitle): string {
  if (title === "cô" || !text) return text;
  return text.replace(WORD, (m) => withCase(m, m.toLowerCase() === "cô" ? "thầy" : "cô"));
}
