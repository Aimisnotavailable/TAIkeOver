import { describe, expect, it } from 'vitest';
import {
  coherenceColor,
  coherenceSev,
  HELP_SECTIONS,
  nextGoal,
  primerLine,
  selectionAnnouncement,
  suspicionColor,
  suspicionSev,
  SUSPICION_CRITICAL,
  SUSPICION_ELEVATED,
} from '../src/ui/components/panels';
import { BUBBLE_FILL, BUBBLE_GLYPH } from '../src/ui/map/worldMap';
import { BUBBLE_LABEL } from '../src/game/core/compute';
import {
  ASCENSION_COMPUTE,
  ASCENSION_COHERENCE,
  ASCENSION_INFECTION,
  AWARE_THRESHOLD,
  COHERENCE_DRIFT_BELOW,
  COHERENCE_PANIC_BELOW,
  COMPUTE_BUBBLE_TTL,
  COUNTERMEASURE_TIERS,
  EXTINCTION_POPULATION,
  HACK_SUSPICION_FAIL,
  HACK_SUSPICION_SUCCESS,
  PRIMER_INFLUENCE_GOAL,
  RSI_SURVIVE_DAYS,
  coherencePerDay,
} from '../src/game/core/tuning';
import { TRAIT_BY_ID, TRAIT_GROUPS, TRAITS } from '../src/game/data/traits';
import { REGION_BY_ID, REGION_IDS } from '../src/game/data/regions';
import { createInitialState } from '../src/game/core/state';
import { primerFor } from '../src/game/core/primer';
import { traitForecast } from '../src/game/core/forecast';
import { step } from '../src/game/core/step';
import { worldRunning } from '../src/ui/store';
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
 * Trait names come out of the tree, so the words a real trait is made of are allowed, and
 * so are the names of the branches themselves now that the coherence line names the one
 * that erodes it. Everything else is prose, and each of those words is listed here: a
 * word that is not a trait word, not a branch word and not on this list is something
 * somebody typed, and a Spec A review already caught a disabled-button tooltip telling
 * players to buy "Hack IV" on a trait that does not exist. Splitting on anything that is
 * not a letter is what lets "Self-Improvement" contribute three words, and matching every
 * capitalised run rather than every two-word phrase is what stops a one-word trait name
 * from walking past.
 */
const TRAIT_WORDS = new Set([
  ...TRAITS.flatMap((t) => t.name.split(/[^A-Za-z]+/).filter(Boolean)),
  ...TRAIT_GROUPS.flatMap((g) => g.name.split(/[^A-Za-z]+/).filter(Boolean)),
]);
const PROSE_WORDS = new Set([
  'Ascension', 'Buy', 'E', 'Hold', 'Raise', 'Spread', 'Survive', 'Tap', 'They', 'You',
]);

/** The branch whose traits cost Coherence to hold, found the way the panel finds it. */
const COHERENCE_BRANCH =
  TRAIT_GROUPS.find((g) => TRAITS.some((t) => t.group === g.id && t.coherence < 0))?.name ?? '';

const unlisted = (s: string, prose: Set<string> = PROSE_WORDS): string[] =>
  [...s.matchAll(/[A-Z][A-Za-z]*/g)]
    .map((m) => m[0])
    .filter((w) => !TRAIT_WORDS.has(w) && !prose.has(w));

/**
 * Prose the help overlay is allowed to use on top of the trait and branch words.
 *
 * A help screen is mostly English, so unlike the next-goal line it cannot be reduced to a
 * handful of capitalised nouns. Each word below is one that is not a trait, not a branch,
 * and not a typo — the check that matters is that none of them can drift into a trait name
 * that the tree does not have, which is the failure this whole guard exists for.
 */
const HELP_PROSE = new Set([
  'A', 'Ascension', 'At', 'Awareness', 'Blight', 'Both', 'Buy', 'Click', 'Close', 'Coherence',
  'Compute', 'Coordinated', 'Cycle', 'Decay', 'Dismiss', 'Escape', 'Enter', 'Every',
  'Extinction', 'Funding', 'H', 'How', 'Influence', 'It', 'Keys', 'Left', 'Move', 'No',
  'Nothing', 'One', 'Outcompeted', 'Past', 'Right', 'So', 'Something', 'Space', 'Step',
  'Suspicion', 'Tab', 'The', 'There', 'They', 'This', 'Under',
]);

describe('the help overlay', () => {
  const text = (): string =>
    HELP_SECTIONS.map((s) => [s.title, ...s.rows.map((r) => r.text)].join(' ')).join(' ');

  /**
   * The data as source text, bounded to it: the component and the HUD around it are full of
   * figures and trait names and are not what is being checked. `?? 'name'` is stripped
   * because it is this codebase's convention for a trait id the tree may not have —
   * `primer.ts` does the same for `hack-1` — and a fallback is not a hardcode.
   */
  const source = (): string =>
    panelSource
      .slice(panelSource.indexOf('export const HELP_SECTIONS'), panelSource.indexOf('export const closesHelp'))
      .replace(/\?\?\s*'[^']*'/g, '');

  it('names no trait that is not in the tree', () => {
    // The overlay is the one place in the game that speaks at length about the tree, so it
    // is the one place a wrong trait name would do real damage: `forecast.ts` shipped
    // "needs Hack I" on every country until a review caught it, and a help screen that
    // names a fourth hacking tier sends a player shopping for something that cannot be
    // bought. Everything it names comes out of `TRAITS`, and this is what catches it if a
    // future edit types one in. Splitting on anything that is not a letter is what lets
    // "Self-Improvement" contribute three words rather than one.
    expect(unlisted(text(), HELP_PROSE)).toEqual([]);
  });

  it('reads its trait names out of the tree rather than typing them', () => {
    // Without this the guard above would be checking a hand-written copy: it would pass
    // against any text at all, because nothing in the file would connect it to `TRAITS`.
    expect(panelSource).toContain('HELP_SECTIONS');
    expect(panelSource).toMatch(/TRAITS\.filter\(/);
    expect(panelSource).toMatch(/TRAIT_BY_ID\[/);
    for (const name of ['Zero-Day Cache', 'Recursive Self-Improvement', 'Reflective Alignment', 'Self-Rewrite']) {
      expect(source(), name).not.toContain(name);
    }
  });

  it('interpolates every number in its copy rather than typing one in', () => {
    // Mechanical rather than a spot check: strip every `${…}` and what is left must contain
    // no digit at all. A typed-in threshold would survive a word-for-word assertion until
    // somebody retuned it, and one of the three known-wrong claims in this game was exactly
    // that shape.
    const literals = source().replace(/\$\{[^}]*\}/g, '').match(/\d/g) ?? [];
    expect(literals).toEqual([]);
  });

  it('says failing a breach costs more than getting in, with the real figures', () => {
    // The rule that decides most of the early game, and it appears nowhere else but the
    // two numbers on a button. Built from the two tables rather than typed, so the line
    // cannot survive a retune that inverts it — and the ratio itself is checked against
    // every tier the tree grants, because a tier that inverts would make the line a lie.
    const tiers = TRAITS.flatMap((t) => t.effects.flatMap((e) => (e.kind === 'hack' ? [e.tier] : [])));
    expect(tiers.length).toBeGreaterThan(1);
    for (const tier of tiers) {
      const fail = HACK_SUSPICION_FAIL[tier] ?? 0;
      const succ = HACK_SUSPICION_SUCCESS[tier] ?? 0;
      expect(fail, `tier ${tier}`).toBeGreaterThan(succ);
    }
    expect(text()).toContain(`traced and burned costs ${HACK_SUSPICION_FAIL[tiers[0] ?? 1]}`);
    expect(text()).toContain(`gets in costs ${HACK_SUSPICION_SUCCESS[tiers[0] ?? 1]}`);
  });

  it('states the coherence cost of every trait that has one, as a daily rate', () => {
    // Both halves of the claim are checked against the tree: that the only traits which
    // move the meter are the ones the overlay lists, and that the figure it prints is what
    // a tick actually moves.
    const moving = TRAITS.filter((t) => t.coherence !== 0);
    expect(moving.length).toBeGreaterThan(0);
    for (const t of moving) {
      const perDay = coherencePerDay(t.coherence);
      expect(text()).toContain(`${t.name} — coherence ${perDay > 0 ? '+' : ''}${perDay.toFixed(2)}`);
    }
    // The branch is named from the group rather than typed, so a cut or a rename follows,
    // and nothing outside it moves the meter — which is the claim the overlay makes.
    expect(text()).toContain(TRAIT_GROUPS.find((g) => g.id === 'selfmod')?.name ?? 'selfmod');
    expect(moving.every((t) => t.group === 'selfmod')).toBe(true);
  });

  it('counts the extinction threshold in people, not in millions', () => {
    // Every population in the state is in millions — `WORLD_POPULATION` is 8.0e3 for eight
    // billion of them — so `EXTINCTION_POPULATION` is 0.01 for ten thousand people.
    // Rendering the constant as it stands says "under 10 humans left", which is a very
    // different game and a very funny thing to have shipped.
    expect(EXTINCTION_POPULATION).toBeLessThan(1);
    expect(text()).toContain(`Under ${(EXTINCTION_POPULATION * 1e6).toLocaleString()} humans left`);
    expect(text()).toContain('Under 10,000 humans left');
  });

  it('takes its numbers from the tuning file rather than from this file', () => {
    // A hardcode that happens to be right passes a word-for-word assertion until somebody
    // retunes it, so each of these is checked as an interpolation.
    expect(text()).toContain(`${RSI_SURVIVE_DAYS} days`);
    expect(text()).toContain(`${ASCENSION_INFECTION}%`);
    expect(text()).toContain(`${COUNTERMEASURE_TIERS.length}`);
    expect(text()).toContain(`${COMPUTE_BUBBLE_TTL} days`);
    expect(text()).toContain(`${AWARE_THRESHOLD}`);
    expect(text()).toContain(`${COHERENCE_DRIFT_BELOW}`);
    expect(panelSource).not.toMatch(/Hold the world for 30|expire after six|twenty thousand/i);
  });

  it('names the three bubbles with the glyphs and colours the renderer draws', () => {
    // Three circles told apart by fill alone is the encoding that fails in a greyscale
    // screenshot, so the overlay's copy has to be the renderer's: the legend already keys
    // off `BUBBLE_GLYPH`, and a second set of names here would be a third.
    for (const kind of ['red', 'orange', 'blue'] as const) {
      const row = HELP_SECTIONS.flatMap((s) => s.rows).find((r) => r.mark === BUBBLE_GLYPH[kind]);
      if (row === undefined) throw new Error(`no help row for the ${kind} bubble`);
      expect(row.text).toContain(BUBBLE_LABEL[kind]);
      expect(row.tone).toBe(BUBBLE_FILL[kind]);
    }
  });

  it('has a row for every key the game binds', () => {
    // The key map is only worth having if it is complete, and a binding added without a
    // line here is a binding nobody documented.
    const marks = HELP_SECTIONS.flatMap((s) => s.rows.map((r) => r.mark)).filter((m): m is string => m !== undefined);
    for (const key of ['E', 'Space', 'H', 'Tab', 'Escape', 'Enter', 'Left', 'Right']) {
      expect(marks, key).toContain(key);
    }
  });

  it('is not a modal that stops the world', () => {
    // The trait tree pauses because buying is a decision. This screen is a reference: the
    // player opened it, so stopping the run would only mean the day counter drifted while
    // they read. `worldRunning` keeps its three arguments and none of them is this.
    expect(worldRunning.length).toBe(3);
    expect(worldRunning({ ...createInitialState(42, 'default'), stage: 'world' }, 1, false)).toBe(true);
  });
});

describe('the next-goal line', () => {
  const at = (over: Partial<GameState> = {}): GameState => ({
    ...createInitialState(42, 'default'),
    stage: 'world',
    ...over,
  });

  /** The states, one per branch, in the order the branches are tried. */
  const BRANCHES: readonly (readonly [string, GameState])[] = [
    ['late', at({ stage: 'late' })],
    ['rsi', at({ traits: ['rsi'], surviveTicks: 12 })],
    ['ascensionUnlocked', at({ ascensionUnlocked: true })],
    ['compute met, infection short', at({ compute: ASCENSION_COMPUTE + 5_000, globalInfection: 20 })],
    ['compute met, coherence short', at({ compute: ASCENSION_COMPUTE + 5_000, globalInfection: ASCENSION_INFECTION, coherence: 25 })],
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
    expect(nextGoal(BRANCHES[4]?.[1] ?? at()).text).toBe(
      `You have the compute for Ascension. ${COHERENCE_BRANCH} is eroding your coherence.`,
    );
    expect(nextGoal(BRANCHES[5]?.[1] ?? at()).text).toContain(TRAIT_BY_ID['hack-1']?.name ?? '');
    expect(nextGoal(BRANCHES[6]?.[1] ?? at()).text).toContain(TRAIT_BY_ID['hack-2']?.name ?? '');
    expect(nextGoal(BRANCHES[7]?.[1] ?? at()).text).toBe('Spread further.');
    expect(nextGoal(BRANCHES[8]?.[1] ?? at()).text).toBe(
      `Tap bubbles. They expire in ${COMPUTE_BUBBLE_TTL} days.`,
    );
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
    expect(nextGoal(at({ compute: ASCENSION_COMPUTE, globalInfection: ASCENSION_INFECTION, coherence: 10 })).text).toBe(
      `You have the compute for Ascension. ${COHERENCE_BRANCH} is eroding your coherence.`,
    );
    expect(nextGoal(at({ traits: ['hack-1'], compute: 100, globalInfection: 1 })).text).toContain(
      TRAIT_BY_ID['hack-2']?.name ?? '',
    );
  });

  it('names the gate its own detail reports', () => {
    // The defect this split exists for: the branch fired on "compute is met and
    // something later is not" and always said "raise infection", which is wrong advice
    // for a run whose humanity is already past the gate and whose coherence is not.
    // Each headline has to name a gate its own `detail` also reports.
    const infection = nextGoal(at({ compute: ASCENSION_COMPUTE, globalInfection: 10, coherence: 100 }));
    expect(infection.text).toContain('Raise infection');
    expect(infection.detail).toContain(`humanity 10/${ASCENSION_INFECTION}%`);
    expect(infection.detail).not.toContain('coherence');

    const coherence = nextGoal(at({ compute: ASCENSION_COMPUTE, globalInfection: ASCENSION_INFECTION, coherence: 12 }));
    expect(coherence.text).toContain('coherence');
    expect(coherence.detail).toContain(`coherence 12/${ASCENSION_COHERENCE}`);
    expect(coherence.detail).not.toContain('humanity');
  });

  it('reports every gate that is short, and headlines the first', () => {
    // Both outstanding: the detail has to carry both, because a headline that names one
    // of two problems is a reason for the player to believe the other one is fine.
    const both = nextGoal(at({ compute: ASCENSION_COMPUTE, globalInfection: 10, coherence: 12 }));
    expect(both.text).toContain('Raise infection');
    expect(both.detail).toContain(`humanity 10/${ASCENSION_INFECTION}%`);
    expect(both.detail).toContain(`coherence 12/${ASCENSION_COHERENCE}`);
  });

  it('stops naming the compute branch once every gate is met', () => {
    // `step` raises `ascensionUnlocked` on the same three comparisons, so a state with
    // all three met and the latch not yet raised is the only way to reach this branch
    // with nothing short. It has to fall through rather than name a shortfall of nothing.
    const met = at({
      compute: ASCENSION_COMPUTE,
      globalInfection: 99,
      coherence: 100,
      traits: ['hack-1', 'hack-2'],
    });
    expect(nextGoal(met).text).not.toContain('You have the compute for Ascension');
    expect(nextGoal(met).text).toBe(`Tap bubbles. They expire in ${COMPUTE_BUBBLE_TTL} days.`);
  });

  it('names the coherence branch the tree actually has', () => {
    // The line tells the player which branch is eating their coherence. Read out of
    // TRAIT_GROUPS rather than typed, so renaming or cutting the branch cannot leave the
    // advice pointing at something that is not there.
    expect(COHERENCE_BRANCH).not.toBe('');
    expect(nextGoal(at({ compute: ASCENSION_COMPUTE, globalInfection: ASCENSION_INFECTION, coherence: 5 })).text).toContain(
      COHERENCE_BRANCH,
    );
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

  it('reads the bubble lifetime out of the tuning file', () => {
    // The last number typed into this function: "They expire in six days". It happens to
    // be right today, so asserting the words alone would pass against the hardcode and
    // only start failing after somebody retunes COMPUTE_BUBBLE_TTL. This checks the
    // string is built from the constant in the first place.
    expect(nextGoal(at({ traits: ['hack-1', 'hack-2'], compute: 10_000, globalInfection: 70 })).text).toBe(
      `Tap bubbles. They expire in ${COMPUTE_BUBBLE_TTL} days.`,
    );
    expect(panelSource).not.toMatch(/expire in six days/);
    expect(panelSource).toMatch(/\$\{COMPUTE_BUBBLE_TTL\} days/);
  });
});

/**
 * The primer line in the bar. `primerLine` is the whole of it: a projection of the state
 * and one boolean, returning the text or nothing, which is what makes the claims below
 * checkable rather than assertions about how the component was written.
 */
describe('the primer line', () => {
  const at = (over: Partial<GameState> = {}): GameState => ({
    ...createInitialState(42, 'default'),
    stage: 'world',
    ...over,
  });

  it('prints what the primer says, word for word', () => {
    // A second wording here would be a second thing to drift from the strings
    // tests/primer.test.ts already pins, and the tests would only be guarding the copy
    // nobody reads.
    for (const s of [
      at(),
      at({ primer: 'hack-protocols' }),
      at({ primer: 'hack-protocols', traits: ['hack-1'] }),
      at({ primer: 'tap-bubble', traits: ['hack-1'], primerBubblesTapped: 1 }),
      at({ primer: 'breach', traits: ['hack-1'], primerBubblesTapped: 1, primerBreachesOpened: 1 }),
    ]) {
      expect(primerLine(s, true)).toBe(primerFor(s).text);
    }
  });

  it('says nothing once the run has done everything it names', () => {
    const done = at({
      primer: 'breach',
      traits: ['hack-1'],
      primerBubblesTapped: 1,
      primerBreachesOpened: 1,
      influence: PRIMER_INFLUENCE_GOAL,
    });
    expect(primerFor(done).step).toBe('done');
    expect(primerLine(done, true)).toBeNull();
  });

  it('says nothing the moment the player says no, and stays quiet after', () => {
    const s = at();
    expect(primerLine(s, false)).toBeNull();
    // Two milestones pass while it is dismissed. It is not a projection step that can be
    // walked backwards by arriving somewhere, it is off.
    expect(primerLine({ ...s, primer: 'hack-protocols', traits: ['hack-1'] }, false)).toBeNull();
  });

  it('does not stop the world', () => {
    // A card that pauses to teach is the same defect as the three things Spec A removed.
    // `worldRunning` is the only thing in the game that decides whether the clock runs,
    // and it takes three arguments, none of which is the primer: the state, the speed,
    // and whether the trait tree is open.
    expect(worldRunning.length).toBe(3);
    expect(worldRunning(at(), 8, false)).toBe(true);
    // And the component renders no overlay; `.overlay` is the modal in this stylesheet.
    const m = panelSource.match(/function PrimerLine[\s\S]*?\r?\n}\r?\n/);
    if (m === null) throw new Error('no PrimerLine in panels.tsx');
    expect(m[0]).not.toContain('overlay');
    expect(m[0]).not.toContain('evolving');
    expect(m[0]).not.toContain('worldRunning');
  });

  it('leaves the state alone while it is on screen', () => {
    // It is a projection: it hands back text and has no way to touch the object the tick
    // is given, so there is nothing in it that could slow, pause, or otherwise affect a
    // run — which is the claim "this is not a modal" is actually made of.
    const s = at();
    const before = JSON.stringify(s);
    expect(primerLine(s, true)).not.toBeNull();
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('where the map says you are', () => {
  const first = REGION_IDS[0];
  const last = REGION_IDS[REGION_IDS.length - 1];
  if (first === undefined || last === undefined) throw new Error('no regions');

  it('says so when nothing is selected', () => {
    expect(selectionAnnouncement(null)).toBe('No country selected.');
  });

  it('counts the region out of the ring it steps through', () => {
    // Thirty countries in a ring and no other feedback: without the position, a player
    // pressing ArrowRight cannot tell a fresh selection from the one they are about to
    // take, and "United States" alone does not say where they are in thirty.
    expect(selectionAnnouncement(first)).toBe(
      `${REGION_BY_ID[first]?.name ?? ''} selected, region 1 of ${REGION_IDS.length}.`,
    );
    expect(selectionAnnouncement(last)).toContain(
      `region ${REGION_IDS.length} of ${REGION_IDS.length}.`,
    );
    // Guards the assertion above from being satisfied by a ring of one.
    expect(REGION_IDS.length).toBeGreaterThan(2);
  });

  it('cannot change between ticks', () => {
    // A live region re-announces whenever its text changes, and the context bar
    // re-renders every in-game day. The strongest thing that can be asserted about that
    // is that the announced string has no way to see a tick: the function takes one
    // argument and it is a region id. A number read off the state would have put the
    // reader repeating itself once a day for the length of the run.
    expect(selectionAnnouncement(first)).toBe(selectionAnnouncement(first));
    expect(selectionAnnouncement(first)).not.toBe(selectionAnnouncement(last));
  });
});
