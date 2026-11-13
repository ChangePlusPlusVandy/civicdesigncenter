// Little synthesized sounds, so there are no audio files to load. Quiet by
// design: a classroom may have 30 devices playing at once. Students can mute
// (remembered per device).

export type Sound =
  | "build"
  | "upgrade"
  | "coin"
  | "trade"
  | "goal"
  | "error"
  | "notify"
  | "bell"
  | "warning";

type Note = [
  frequency: number,
  start: number,
  length: number,
  type?: OscillatorType,
];

const SOUNDS: Record<Sound, Note[]> = {
  build: [
    [523, 0, 0.12, "triangle"],
    [784, 0.08, 0.18, "triangle"],
  ],
  upgrade: [
    [523, 0, 0.1, "triangle"],
    [659, 0.08, 0.1, "triangle"],
    [988, 0.16, 0.22, "triangle"],
  ],
  coin: [
    [1319, 0, 0.06, "square"],
    [1760, 0.05, 0.12, "square"],
  ],
  trade: [
    [587, 0, 0.12, "sine"],
    [880, 0.1, 0.16, "sine"],
  ],
  goal: [
    [523, 0, 0.12, "triangle"],
    [659, 0.1, 0.12, "triangle"],
    [784, 0.2, 0.12, "triangle"],
    [1047, 0.3, 0.35, "triangle"],
  ],
  error: [[180, 0, 0.18, "sawtooth"]],
  notify: [
    [880, 0, 0.1, "sine"],
    [1175, 0.12, 0.14, "sine"],
  ],
  bell: [
    [659, 0, 0.6, "sine"],
    [988, 0, 0.5, "sine"],
  ],
  warning: [
    [440, 0, 0.18, "square"],
    [330, 0.2, 0.25, "square"],
  ],
};

const MUTE_KEY = "citysettlers:muted";
const VOLUME = 0.08;

let context: AudioContext | null = null;
let mutedNow = readMuted();

export function isMuted(): boolean {
  return mutedNow;
}

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // Storage blocked: the toggle still works until a refresh.
  }
  mutedNow = muted;
}

export function play(sound: Sound): void {
  if (mutedNow || typeof AudioContext === "undefined") return;
  try {
    context ??= new AudioContext();
    // Browsers start audio suspended until the page has been tapped.
    if (context.state === "suspended") void context.resume();
    const now = context.currentTime;
    for (const [frequency, start, length, type = "sine"] of SOUNDS[sound]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(VOLUME, now + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + length);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(now + start);
      oscillator.stop(now + start + length + 0.05);
    }
  } catch {
    // No audio on this device; the game works without it.
  }
}
