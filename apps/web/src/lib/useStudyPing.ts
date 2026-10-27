// Heartbeat that keeps the study clock running while a learner READS or LISTENS — the two things
// that make no API calls of their own. Everything else (answering, saving, scoring) already pings
// the server by doing its job, and the stitching in requireUser turns those gaps into minutes.
//
// Three guards, because an open tab must never bank time:
//   · the tab has to be VISIBLE (a backgrounded tab is not study),
//   · there has to have been real input recently (typing, tapping, scrolling, playing audio),
//   · the server still caps any single gap at 10 minutes.
import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { accountApi } from "./api";

/** How often to beat. Must stay under the server's 5-minute throttle to keep slices tight. */
const BEAT_MS = 60_000;
/** No interaction for this long and the learner has walked away — stop beating. */
const IDLE_MS = 120_000;

/** SPA path -> study area, mirroring areaOf() on the server. */
export function areaOfPath(path: string): string {
  if (path.includes("/vocabulary") || path.includes("/vocab")) return "vocab";
  if (path.includes("/grammar")) return "grammar";
  if (path.includes("/speak") || path.includes("/ipa")) return "speaking";
  if (path.includes("/video")) return "video";
  if (path.includes("/writing")) return "writing";
  if (path.includes("/library") || path.includes("/practice")) return "library";
  return "other";
}

export function useStudyPing(enabled: boolean) {
  const { pathname } = useLocation();
  const lastActive = useRef(Date.now());
  const area = useRef(areaOfPath(pathname));
  area.current = areaOfPath(pathname);

  useEffect(() => {
    if (!enabled) return;
    const touch = () => { lastActive.current = Date.now(); };
    const events = ["pointerdown", "keydown", "scroll", "wheel", "touchstart", "play"] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true, capture: true });
    // Coming back to the tab counts as activity: the learner is here again.
    const onVisible = () => { if (document.visibilityState === "visible") touch(); };
    document.addEventListener("visibilitychange", onVisible);

    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastActive.current > IDLE_MS) return;
      void accountApi.studyPing(area.current);
    }, BEAT_MS);

    return () => {
      clearInterval(id);
      for (const e of events) window.removeEventListener(e, touch, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled]);
}
