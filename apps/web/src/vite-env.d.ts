// Static image imports → Vite returns the URL (string).
declare module "*.svg" {
  const src: string;
  export default src;
}
declare module "*.png" {
  const src: string;
  export default src;
}
declare module "*.webp" {
  const src: string;
  export default src;
}
declare module "*.jpg" {
  const src: string;
  export default src;
}

/** Root package.json version, injected by vite.config.ts. */
declare const __APP_VERSION__: string;

// Only the Vite env flags the app reads (vite/client is not in `types`).
interface ImportMetaEnv {
  readonly DEV: boolean;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
  /** Vite's build-time file import (used by the teacher guide to bundle docs/guide). */
  glob(pattern: string, options?: { query?: string; import?: string; eager?: boolean }): Record<string, unknown>;
}
