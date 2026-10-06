import { describe, expect, it } from 'vitest';
import {
  coherenceColor,
  coherenceSev,
  nextGoal,
  suspicionColor,
  suspicionSev,
  SUSPICION_CRITICAL,
  SUSPICION_ELEVATED,
} from '../src/ui/components/panels';
import { ASCENSION_COMPUTE, COHERENCE_DRIFT_BELOW, COHERENCE_PANIC_BELOW, RSI_SURVIVE_DAYS } from '../src/game/core/tuning';
import { TRAIT_BY_ID, TRAITS } from '../src/game/data/traits';
import { createInitialState } from '../src/game/core/state';
import { traitForecast } from '../src/game/core/forecast';
import { step } from '../src/game/core/step';
import type { GameState } from '../src/game/core/types';
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

  it('moves coherence on the two thresholds it imports, not on either side of them', () => {
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

describe('the trait card and the meter move together', () => {
  const start = (traits: string[]): GameState => ({
    ...createInitialState(42, 'default'),
    stage: 'world',
    traits,
  });

  it('shows the figure a real tick actually moves', () => {
    // The card printed `coherence -8` where the meter moved 0.16 a day, under a docs
    // column headed Coherence/day. Both sides now call coherencePerDay, and this holds
    // them to it by running the tick rather than trusting either number alone.
    for (const id of ['self-rewrite', 'rsi', 'reflective-alignment']) {
      const before = 60;
      const moved = step({ ...start([id]), coherence: before }).coherence - before;
      expect(moved, id).toBeCloseTo(traitForecast(start([id]), id).coherence, 6);
    }
  });

  it('labels the number as a daily rate', () => {
    // The label is what stops a reader treating the figure as a one-off cost, and it has
    // to sit on the converted number rather than the magnitude it used to print.
    expect(panelSource).toContain('toFixed(2)}/day');
    expect(panelSource).not.toMatch(/`\+\$\{f\.coherence\}`/);
  });
});

/**
 * Every capitalised word the next-goal line is allowed to use.
 *
 * Trait names come out of the tree, so the words a real trait is made of are allowed.
 * Everything else is prose, and each of those words is listed here: a word that is not
 * a trait word and not on this list is something somebody typed, and a Spec A review
 * already caught a disabled-button tooltip telling players to buy "Hack IV" on a trait
 * that does not exist. Splitting on anything that is not a letter is what lets
 * "Self-Improvement" contribute three words, and matching every capitalised run rather
 * than every two-word phrase is what stops a one-word trait name from walking past.
 */
const TRAIT_WORDS = new Set(TRAITS.flatMap((t) => t.name.split(/[^A-Za-z]+/).filter(Boolean)));
const PROSE_WORDS = new Set([
  'Ascension', 'Buy', 'E', 'Hold', 'Raise', 'Spread', 'Survive', 'Tap', 'They', 'You',
]);

const unlisted = (s: string): string[] =>
  [...s.matchAll(/[A-Z][A-Za-z]*/g)]
    .map((m) => m[0])
    .filter((w) => !TRAIT_WORDS.has(w) && !PROSE_WORDS.has(w));

describe('the next-goal line', () => {
  const at = (over: Partial<GameState> = {}): GameState => ({
    ...createInitialState(42, 'default'),
    stage: 'world',
    ...over,
  });

  /** The eight states, one per branch, in the order the branches are tried. */
  const BRANCHES: readonly (readonly [string, GameState])[] = [
    ['late', at({ stage: 'late' })],
    ['rsi', at({ traits: ['rsi'], surviveTicks: 12 })],
    ['ascensionUnlocked', at({ ascensionUnlocked: true })],
    ['compute met, gate shut', at({ compute: ASCENSION_COMPUTE + 5_000, globalInfection: 20 })],
    ['no hack-1', at()],
    ['cannot afford hack-2', at({ traits: ['hack-1'], compute: 100 })],
    ['infection short', at({ traits: ['hack-1', 'hack-2'], compute: 10_000, globalInfection: 12 })],
    ['nothing left to chase', at({ traits: ['hack-1', 'hack-2'], compute: 10_000, globalInfection: 70 })],
  ];

  it('reaches every branch', () => {
    expect(nextGoal(BRANCHES[0]?.[1] ?? at()).text).toBe('Hold the world.');
    expect(nextGoal(BRANCHES[1]?.[1] ?? at()).text).toBe(
      `Survive ${RSI_SURVIVE_DAYS - 12} more days.`,
    );
    expect(nextGoal(BRANCHES[2]?.[1] ?? at()).text).toBe(
      `${TRAIT_BY_ID.rsi?.name ?? 'rsi'} is on the tree.`,
    );
    expect(nextGoal(BRANCHES[3]?.[1] ?? at()).text).toBe(
      'You have the compute for Ascension. Raise infection.',
    );
    expect(nextGoal(BRANCHES[4]?.[1] ?? at()).text).toContain(TRAIT_BY_ID['hack-1']?.name ?? '');
    expect(nextGoal(BRANCHES[5]?.[1] ?? at()).text).toContain(TRAIT_BY_ID['hack-2']?.name ?? '');
    expect(nextGoal(BRANCHES[6]?.[1] ?? at()).text).toBe('Spread further.');
    expect(nextGoal(BRANCHES[7]?.[1] ?? at()).text).toBe('Tap bubbles. They expire in six days.');
  });

  it('orders the branches, so an early one wins over a later one', () => {
    // Every branch's state has to survive every earlier branch's condition, or the list
    // above would pass against a function that checked them in a different order.
    expect(nextGoal(at({ stage: 'late', traits: ['rsi'], ascensionUnlocked: true })).text).toBe('Hold the world.');
    expect(nextGoal(at({ traits: ['rsi'], ascensionUnlocked: true })).text).toBe(
      `Survive ${RSI_SURVIVE_DAYS} more days.`,
    );
    expect(nextGoal(at({ ascensionUnlocked: true, compute: ASCENSION_COMPUTE, globalInfection: 99 })).text).toBe(
      `${TRAIT_BY_ID.rsi?.name ?? 'rsi'} is on the tree.`,
    );
    expect(nextGoal(at({ compute: ASCENSION_COMPUTE, globalInfection: 1 })).text).toBe(
      'You have the compute for Ascension. Raise infection.',
    );
    expect(nextGoal(at({ traits: ['hack-1'], compute: 100, globalInfection: 1 })).text).toContain(
      TRAIT_BY_ID['hack-2']?.name ?? '',
    );
  });

  it('names the real shortfall when compute is not the one that is short', () => {
    // The headline is about infection because that is what is short in every run that
    // reaches it, but coherence can be the blocker instead, and then the detail has to
    // say so rather than let the headline stand on its own.
    const coherence = nextGoal(at({ compute: ASCENSION_COMPUTE, globalInfection: 99, coherence: 10 }));
    expect(coherence.text).toBe('You have the compute for Ascension. Raise infection.');
    expect(coherence.detail).toContain('coherence');
  });

  it('never runs the hold backwards', () => {
    // A finished run has surviveTicks at the ceiling and one past it. Counting down to a
    // negative number of days is the one way this line can lie about the endgame.
    expect(nextGoal(at({ traits: ['rsi'], surviveTicks: RSI_SURVIVE_DAYS })).text).toBe(
      'Survive 0 more days.',
    );
    expect(nextGoal(at({ traits: ['rsi'], surviveTicks: RSI_SURVIVE_DAYS + 5 })).text).toBe(
      'Survive 0 more days.',
    );
  });

  it('says what is still missing, and whether it is affordable now', () => {
    // The reported jam: 300 starting compute, 300 spent sabotaging a rival, and the one
    // move that matters is behind a key. This is the line that has to answer it.
    const broke = nextGoal(at({ compute: 0 }));
    expect(broke.text).toBe(`Buy ${TRAIT_BY_ID['hack-1']?.name ?? ''}.`);
    expect(broke.detail).toContain('200');
    expect(broke.detail).toContain('short');
    expect(nextGoal(at()).detail).toContain('affordable now');
    expect(nextGoal(at({ traits: ['hack-1'], compute: 100 })).detail).toContain(
      String(TRAIT_BY_ID['hack-2']?.cost ?? 0),
    );
    // Branch six only exists while the price is out of reach, so "affordable now" is
    // never the honest wording there. Pinned so a retune cannot quietly make it a lie.
    expect(nextGoal(at({ traits: ['hack-1'], compute: 100 })).detail).not.toContain('affordable now');
    expect(nextGoal(at({ traits: ['hack-1'], compute: 900 })).text).toBe('Spread further.');
  });

  it('never returns empty text', () => {
    for (const [name, s] of BRANCHES) {
      expect(nextGoal(s).text.trim().length, name).toBeGreaterThan(0);
      expect(nextGoal(s).detail.trim().length, name).toBeGreaterThan(0);
    }
  });

  it('names no trait that is not in the tree', () => {
    for (const [name, s] of BRANCHES) {
      const goal = nextGoal(s);
      expect(unlisted(`${goal.text} ${goal.detail}`), name).toEqual([]);
    }
  });

  it('would catch a trait name of any length', () => {
    // The guard itself, not the lines it guards. The Spec A version of this check
    // matched two-word phrases, so a one-word name slipped straight through; these pin
    // both shapes, and the all-caps one is the exact string that shipped.
    expect(unlisted(`Buy ${TRAIT_BY_ID['hack-1']?.name ?? ''}.`)).toEqual([]);
    expect(unlisted('Buy Hack Protocols IV.')).toEqual(['IV']);
    expect(unlisted('Buy Subversion.')).toEqual(['Subversion']);
    expect(unlisted('Buy Self-Rewrite II.')).toEqual(['II']);
  });

  it('reads names and prices out of the tree rather than typing them', () => {
    // If a name were typed in, renaming the trait would leave this line naming a trait
    // that no longer exists and the guard above would have nothing to catch it against.
    for (const [name, s] of BRANCHES) {
      expect(nextGoal(s).text, name).not.toMatch(/Hack IV|Hack 4|Hack-4/);
    }
    expect(nextGoal(at()).text).toBe(`Buy ${TRAIT_BY_ID['hack-1']?.name ?? ''}.`);
    expect(nextGoal(at()).detail).toContain(String(TRAIT_BY_ID['hack-1']?.cost ?? 0));
  });
});
