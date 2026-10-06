import { describe, expect, it } from 'vitest';
import { endingCue, setAudioEnabled, startMusic, TONES, unlockAudio } from '../src/ui/sound';

describe('the cue a run ends on', () => {
  it('plays the win cue for the two victories', () => {
    expect(endingCue('won', 'extinction')).toBe('win');
    expect(endingCue('won', 'blight')).toBe('win');
  });

  it('plays the lose cue for every loss', () => {
    for (const r of ['coordinated-shutdown', 'coherence-lost', 'outcompeted']) {
      expect(endingCue('lost', r), r).toBe('lose');
    }
  });

  it('plays neither, for containment, because it is an escape and not a triumph', () => {
    // `outcome` is `won` here by design — the game counts Containment as a way out rather
    // than a failure — and the win cue is a rising major arpeggio. That is an audible
    // celebration of the one ending that must not be celebrated, and it was playing because
    // `contain` hardcoded `play('win')` while `tick` made its own separate decision.
    const cue = endingCue('won', 'contained');
    expect(cue).not.toBe('win');
    expect(cue).not.toBe('lose');
    expect(cue).toBeTruthy();
    expect(TONES[cue]).toBeTruthy();
  });

  it('rises nowhere, so the cue cannot quietly become a fanfare again', () => {
    // Mechanical rather than aesthetic: the whole difference between the three end cues is the
    // shape of the motion, so it is asserted on the notes rather than on taste. `win` climbs,
    // `lose` falls away, and Containment holds one note and stops.
    const freqs = (cue: keyof typeof TONES): readonly number[] => TONES[cue].map((t) => t.freq);
    expect(freqs('contained')).toHaveLength(1);
    expect(Math.max(...freqs('contained'))).toBeLessThanOrEqual(Math.min(...freqs('contained')));
    // And the control: the win cue does climb, so the assertion above is not vacuous.
    expect(Math.max(...freqs('win'))).toBeGreaterThan(Math.min(...freqs('win')));
  });

  it('is quieter than either, which is the other half of not celebrating', () => {
    const peak = (cue: keyof typeof TONES): number => Math.max(...TONES[cue].map((t) => t.gain));
    expect(peak('contained')).toBeLessThan(peak('win'));
    expect(peak('contained')).toBeLessThan(peak('lose'));
  });
});

describe('music', () => {
  // The audio layer is browser-only, so these guard the module against crashing
  // outside a browser and against the pause decision reaching it at all.
  it('survives being asked to play with no DOM', () => {
    expect(() => startMusic(true)).not.toThrow();
    expect(() => startMusic(false)).not.toThrow();
  });

  it('survives an unlock attempt with no DOM', () => {
    expect(() => unlockAudio()).not.toThrow();
  });

  it('survives the mute toggle with no DOM', () => {
    expect(() => setAudioEnabled(false)).not.toThrow();
    expect(() => setAudioEnabled(true)).not.toThrow();
  });

  it('can be told to stop and start repeatedly', () => {
    for (let i = 0; i < 5; i++) {
      expect(() => startMusic(i % 2 === 0)).not.toThrow();
    }
    startMusic(false);
  });
});
