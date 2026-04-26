let audioCtx: AudioContext | null = null;

function ctx(): AudioContext {
  if (typeof window === "undefined") throw new Error("no window");
  if (!audioCtx) {
    const C = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    audioCtx = new (C || AudioContext)();
  }
  return audioCtx;
}

function beep(
  start: number,
  duration: number,
  freq: number,
  type: OscillatorType,
  gain: number
): void {
  const c = ctx();
  if (c.state === "suspended") void c.resume();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime + start);
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + duration);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + duration + 0.02);
}

/** Tornado / take-cover style */
export function playUrgentChime(): void {
  beep(0, 0.2, 880, "sine", 0.2);
  beep(0.2, 0.2, 660, "sine", 0.18);
  beep(0.45, 0.32, 520, "square", 0.12);
  beep(0.8, 0.35, 400, "square", 0.1);
}

/** Warnings / high attention */
export function playWarningChime(): void {
  beep(0, 0.16, 720, "sine", 0.16);
  beep(0.2, 0.22, 480, "sine", 0.14);
}

/** Precip / informational */
export function playInfoPing(): void {
  beep(0, 0.1, 620, "sine", 0.1);
  beep(0.1, 0.14, 820, "sine", 0.08);
}
