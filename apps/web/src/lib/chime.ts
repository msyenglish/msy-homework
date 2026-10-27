// Short right/wrong tones for typing drills, synthesised with WebAudio so there is no asset to
// download and nothing to preload. Modelled on the cheer in the video practice page.
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = ctx || new AC();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Bright rising arpeggio for a correct answer. */
function chimeRight(ac: AudioContext) {
  const now = ac.currentTime;
  [587.33, 880, 1174.66].forEach((f, i) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "triangle";
    o.frequency.value = f;
    const t = now + i * 0.085;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + 0.36);
  });
}

/**
 * A flat, buzzing two-note fall for a wrong answer — the "wrong answer" buzzer, not a soft chime.
 * Sawtooth through a lowpass so it reads as unpleasant without being harsh, and quieter than the
 * correct tone: getting it wrong should not be the loudest thing in the room.
 */
function chimeWrong(ac: AudioContext) {
  const now = ac.currentTime;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  filter.connect(ac.destination);
  [196, 155.56].forEach((f, i) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sawtooth";
    o.frequency.value = f;
    const t = now + i * 0.16;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.015);
    g.gain.setValueAtTime(0.1, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(filter);
    o.start(t);
    o.stop(t + 0.24);
  });
}

export function playChime(kind: "right" | "wrong") {
  try {
    const ac = audio();
    if (!ac) return;
    if (kind === "right") chimeRight(ac);
    else chimeWrong(ac);
  } catch {
    // Audio is a nicety; a browser that blocks it must not break the drill.
  }
}
