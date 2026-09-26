import { describe, expect, it } from 'vitest';
import { musicPlaying, setAudioEnabled, startMusic, unlockAudio } from '../src/ui/sound';

describe('music', () => {
  // The audio layer is browser-only, so these guard the module against crashing
  // outside a browser and against the pause decision reaching it at all.
  it('survives being asked to play with no DOM', () => {
    expect(() => startMusic(true)).not.toThrow();
    expect(() => startMusic(false)).not.toThrow();
  });

  it('reports not playing when there is no audio element', () => {
    startMusic(false);
    expect(musicPlaying()).toBe(false);
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
