import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import { queryClient } from "./lib/queryClient";
import { ConfirmRoot } from "./components/confirm";
import App from "./App";
import { bootBrand } from "./lib/brand";
import { bootLang } from "./i18n";
import "./index.css";

// A tab left open across a deploy still points at the previous build's hashed assets. Those files
// are gone, and the SPA fallback answers with index.html — the browser then refuses the stylesheet
// over its MIME type and the page renders unstyled. Reload once to pick up the new index.html.
const RELOAD_FLAG = "msyen_stale_asset_reload";
addEventListener(
  "error",
  (e) => {
    const el = e.target as HTMLElement | null;
    const url = (el as HTMLLinkElement)?.href || (el as HTMLScriptElement)?.src;
    if (!url || !/\/assets\//.test(url)) return;
    if (sessionStorage.getItem(RELOAD_FLAG)) return; // already tried — a loop helps nobody
    sessionStorage.setItem(RELOAD_FLAG, "1");
    location.reload();
  },
  true, // capture: resource errors do not bubble
);
addEventListener("vite:preloadError", () => {
  if (sessionStorage.getItem(RELOAD_FLAG)) return;
  sessionStorage.setItem(RELOAD_FLAG, "1");
  location.reload();
});

void bootBrand().then(() => {
  bootLang();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <ConfirmRoot />
          <Toaster richColors position="bottom-center" />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
});

// The listeners above can never catch a missing STYLESHEET: the <link> in <head> fails while the
// document is still parsing, long before this module runs, so its error event has no listener yet
// and the page just renders unstyled forever. A link whose file failed to load has `sheet === null`,
// which is still true by the time we boot — so check the outcome instead of waiting for the event.
addEventListener("load", () => {
  const brokenCss = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
    .some((l) => l.href.includes("/assets/") && !l.sheet);
  if (brokenCss && !sessionStorage.getItem(RELOAD_FLAG)) {
    sessionStorage.setItem(RELOAD_FLAG, "1");
    location.reload();
    return;
  }
  // One reload per tab, and the flag never cleared itself: a tab that survived two deploys spent its
  // only attempt on the first and sat broken through the second. Booting cleanly earns a fresh one.
  sessionStorage.removeItem(RELOAD_FLAG);
});
