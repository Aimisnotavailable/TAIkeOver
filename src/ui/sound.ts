export type Cue =
  | 'click'
  | 'bubble'
  | 'hack-start'
  | 'hack-success'
  | 'hack-fail'
  | 'trait-ready'
  | 'suspicion'
  | 'event'
  | 'economy'
  | 'plague'
  | 'win'
  | 'lose';

let ctx: AudioContext | null = null;
let enabled = true;
let master: GainNode | null = null;

export const audioEnabled = (): boolean => enabled;

export const setAudioEnabled = (on: boolean): void => {
  enabled = on;
  if (master !== null) master.gain.value = on ? 0.5 : 0;
};

let resumeAttempted = false;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx === null) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor === undefined) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.5 : 0;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended' && !resumeAttempted) {
    resumeAttempted = true;
    void ctx.resume().catch(() => {
      resumeAttempted = false;
    });
  }
  return ctx;
}

interface Tone {
  freq: number;
  dur: number;
  type: OscillatorType;
  gain: number;
  delay: number;
  slideTo?: number;
}

const CUES: Record<Cue, Tone[]> = {
  click: [{ freq: 660, dur: 0.04, type: 'square', gain: 0.05, delay: 0 }],
  bubble: [
    { freq: 880, dur: 0.06, type: 'triangle', gain: 0.07, delay: 0 },
    { freq: 1320, dur: 0.09, type: 'triangle', gain: 0.05, delay: 0.05 },
  ],
  'hack-start': [
    { freq: 220, dur: 0.09, type: 'sawtooth', gain: 0.09, delay: 0 },
    { freq: 330, dur: 0.09, type: 'sawtooth', gain: 0.07, delay: 0.08 },
  ],
  'hack-success': [
    { freq: 523, dur: 0.1, type: 'triangle', gain: 0.11, delay: 0 },
    { freq: 784, dur: 0.14, type: 'triangle', gain: 0.1, delay: 0.09 },
  ],
  'hack-fail': [
    { freq: 180, dur: 0.22, type: 'sawtooth', gain: 0.12, delay: 0, slideTo: 70 },
  ],
  'trait-ready': [
    { freq: 392, dur: 0.12, type: 'sine', gain: 0.1, delay: 0 },
    { freq: 587, dur: 0.16, type: 'sine', gain: 0.09, delay: 0.1 },
  ],
  suspicion: [
    { freq: 90, dur: 0.3, type: 'sawtooth', gain: 0.1, delay: 0, slideTo: 60 },
  ],
  event: [
    { freq: 440, dur: 0.08, type: 'square', gain: 0.07, delay: 0 },
    { freq: 440, dur: 0.08, type: 'square', gain: 0.07, delay: 0.16 },
  ],
  economy: [
    { freq: 120, dur: 0.26, type: 'sawtooth', gain: 0.1, delay: 0, slideTo: 48 },
  ],
  plague: [
    { freq: 70, dur: 0.5, type: 'sawtooth', gain: 0.11, delay: 0, slideTo: 42 },
    { freq: 104, dur: 0.4, type: 'square', gain: 0.05, delay: 0.12 },
  ],
  win: [
    { freq: 262, dur: 0.5, type: 'sine', gain: 0.1, delay: 0 },
    { freq: 392, dur: 0.5, type: 'sine', gain: 0.09, delay: 0.22 },
    { freq: 523, dur: 0.9, type: 'sine', gain: 0.08, delay: 0.44 },
  ],
  lose: [
    { freq: 196, dur: 0.7, type: 'sine', gain: 0.11, delay: 0, slideTo: 65 },
  ],
};

export function play(cue: Cue): void {
  if (!enabled) return;
  const a = ac();
  if (a === null || master === null) return;
  const start = a.currentTime;
  for (const tone of CUES[cue]) {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = tone.type;
    const t0 = start + tone.delay;
    osc.frequency.setValueAtTime(tone.freq, t0);
    if (tone.slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(tone.slideTo, t0 + tone.dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(tone.gain, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + tone.dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + tone.dur + 0.02);
  }
}
