import { describe, expect, it } from 'vitest';
import {
  coherenceColor,
  coherenceSev,
  suspicionColor,
  suspicionSev,
  SUSPICION_CRITICAL,
  SUSPICION_ELEVATED,
} from '../src/ui/components/panels';
import { COHERENCE_DRIFT_BELOW, COHERENCE_PANIC_BELOW, RSI_SURVIVE_DAYS } from '../src/game/core/tuning';
import { TRAIT_BY_ID } from '../src/game/data/traits';
import panelSource from '../src/ui/components/panels.tsx?raw';
import traitsSource from '../src/game/data/traits.ts?raw';

/**
 * Two metres, two channels. Shape is ranked here so hue can be held against it: ▲ is one
 * step worse than ▼, ▲▲ is two, and a colour that disagrees with the shape is a meter
 * giving two different answers to the same question.
 */
const band = (glyph: string): number => {
  const g = glyph.trim();
  return g === '▲▲' ? 2 : g === '▲' ? 1 : 0;
};

const SUSPICION_BAND: Record<string, number> = {
  'var(--ink-dim)': 0,
  'var(--warn)': 1,
  'var(--bad)': 2,
};

const COHERENCE_BAND: Record<string, number> = {
  'var(--cool)': 0,
  'var(--warn)': 1,
  'var(--violet)': 2,
};

describe('severity glyphs', () => {
  it('reads up-is-worse for suspicion', () => {
    expect(suspicionSev(10).trim()).toBe('▼');
    expect(suspicionSev(50).trim()).toBe('▲');
    expect(suspicionSev(90).trim()).toBe('▲▲');
  });

  it('inverts for coherence, where down is worse', () => {
    expect(coherenceSev(90).trim()).toBe('▼');
    expect(coherenceSev(40).trim()).toBe('▲');
    expect(coherenceSev(10).trim()).toBe('▲▲');
  });
});

describe('severity thresholds', () => {
  it('moves suspicion on the thresholds it exports, not on either side of them', () => {
    // Each band is `> threshold`, so the threshold itself is still in the band below it.
    expect(suspicionSev(SUSPICION_ELEVATED).trim()).toBe('▼');
    expect(suspicionSev(SUSPICION_ELEVATED + 0.01).trim()).toBe('▲');
    expect(suspicionSev(SUSPICION_CRITICAL).trim()).toBe('▲');
    expect(suspicionSev(SUSPICION_CRITICAL + 0.01).trim()).toBe('▲▲');
  });

  it('reads coherence off the two thresholds the simulation itself uses', () => {
    // COHERENCE_DRIFT_BELOW is 50, the same value the Drift event's own maxCoherence
    // gate is written with, and COHERENCE_PANIC_BELOW is 20, which nothing else reads.
    // The glyph has to move where those two numbers are, or it is warning about something
    // that has not happened yet.
    expect(coherenceSev(COHERENCE_DRIFT_BELOW).trim()).toBe('▼');
    expect(coherenceSev(COHERENCE_DRIFT_BELOW - 0.01).trim()).toBe('▲');
    expect(coherenceSev(COHERENCE_PANIC_BELOW).trim()).toBe('▲');
    expect(coherenceSev(COHERENCE_PANIC_BELOW - 0.01).trim()).toBe('▲▲');
  });

  it('has no meter threshold written as a bare number', () => {
    // The suspicion thresholds were bare numbers: 70 at four sites (this glyph, the
    // metre, and Situation's word and its colour) and 45 at two of those, so the word
    // ELEVATED and the meter's amber could disagree with nothing catching it. Scoped to
    // the two meters and their helper parameters: a trait's own coherence cost
    // (`f.coherence > 0`) is a different quantity and is not what this is about.
    const literals = panelSource.match(/(?:state\.(?:suspicion|coherence)|\bv)\s*(?:<|<=|>|>=)\s*\d+(?!\w)/g) ?? [];
    expect(literals).toEqual([]);
  });
});

describe('severity colour', () => {
  it('puts coherence on the same two thresholds as its glyph', () => {
    expect(coherenceColor(100)).toBe('var(--cool)');
    expect(coherenceColor(COHERENCE_DRIFT_BELOW)).toBe('var(--cool)');
    expect(coherenceColor(COHERENCE_DRIFT_BELOW - 1)).toBe('var(--warn)');
    expect(coherenceColor(COHERENCE_PANIC_BELOW)).toBe('var(--warn)');
    expect(coherenceColor(COHERENCE_PANIC_BELOW - 1)).toBe('var(--violet)');
  });

  it('never lets hue and shape disagree across the whole range', () => {
    // Loops rather than samples: a band that contradicts the other channel anywhere in
    // 0-100 is the defect, and sampling three points per meter cannot see it.
    for (let v = 0; v <= 100; v += 0.5) {
      expect(band(suspicionSev(v))).toBe(SUSPICION_BAND[suspicionColor(v)]);
      expect(band(coherenceSev(v))).toBe(COHERENCE_BAND[coherenceColor(v)]);
    }
  });
});

describe('the RSI hold is stated once', () => {
  it('reads the day count in the trait description from the constant', () => {
    // The trait's description is the only place the player reads what buying it costs
    // them in days, and it is the one place still holding a typed-in 30. That 30 happens
    // to be right today, so the assertion on the words alone would pass against the
    // hardcode and only fail once someone retunes one side; this checks the string is
    // built from the constant in the first place.
    expect(TRAIT_BY_ID.rsi?.description).toContain(`Hold the world for ${RSI_SURVIVE_DAYS} days`);
    expect(traitsSource).toMatch(/description:\s*`[^`]*\$\{RSI_SURVIVE_DAYS\}[^`]*`/);
  });
});
