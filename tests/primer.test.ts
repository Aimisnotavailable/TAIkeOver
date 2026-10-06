import { describe, expect, it } from 'vitest';
import { advancePrimer, primerFor, type PrimerStep } from '../src/game/core/primer';
import { createInitialState } from '../src/game/core/state';
import { step } from '../src/game/core/step';
import { PRIMER_INFLUENCE_GOAL } from '../src/game/core/tuning';
import { TRAIT_BY_ID } from '../src/game/data/traits';
import type { GameState } from '../src/game/core/types';

const start = (over: Partial<GameState> = {}): GameState => ({
  ...createInitialState(42, 'default'),
  stage: 'world',
  ...over,
});

/** The three fields the primer owns. Everything else must survive it untouched. */
const PRIMER_KEYS = ['primer', 'primerBubblesTapped', 'primerBreachesOpened'];

const withoutPrimer = (s: GameState): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...s };
  for (const k of PRIMER_KEYS) delete out[k];
  return out;
};

describe('the primer walks its steps in order', () => {
  it('advances one step at a time and never backwards', () => {
    let s = start();
    expect(primerFor(s).step).toBe('select');

    s = advancePrimer(s, { kind: 'select' });
    expect(primerFor(s).step).toBe('hack-protocols');

    s = { ...s, traits: ['hack-1'] };
    expect(primerFor(s).step).toBe('tap-bubble');

    s = advancePrimer(s, { kind: 'bubble' });
    expect(primerFor(s).step).toBe('breach');

    s = advancePrimer(s, { kind: 'breach' });
    expect(primerFor(s).step).toBe('influence');

    s = { ...s, influence: PRIMER_INFLUENCE_GOAL };
    expect(primerFor(s).step).toBe('done');

    // Every milestone already satisfied, replayed out of order. The projection walks
    // forward from state and has no memory of the order things arrived in, so none of
    // these can walk it back.
    for (const e of [
      { kind: 'select' },
      { kind: 'bubble' },
      { kind: 'breach' },
      { kind: 'buy', trait: 'hack-1' },
      { kind: 'tick' },
    ] as const) {
      expect(primerFor(advancePrimer(s, e)).step, e.kind).toBe('done');
    }
  });

  it('skips a step the player already satisfied', () => {
    // Hack Protocols first, and by the only route there is: bought and granted.
    let s = start({ traits: ['hack-1'], primerBubblesTapped: 3, primerBreachesOpened: 1 });
    expect(primerFor(s).step).toBe('select');

    s = advancePrimer(s, { kind: 'select' });
    expect(primerFor(s).step).toBe('influence');
  });

  it('counts a trait that is still incubating as bought', () => {
    // `buyTrait` files a trait under `incubating` for three days and only `step` moves
    // it into `traits`. Advising a player to buy the thing they are already incubating is
    // worse than saying nothing, and the three days are most of the early game.
    const bought = start({ incubating: [{ trait: 'hack-1', startTick: 4, readyTick: 7 }] });
    expect(primerFor(advancePrimer(bought, { kind: 'select' })).step).toBe('tap-bubble');
  });

  it('reaches done when the run goes late', () => {
    const late = start({ stage: 'late' });
    expect(primerFor(late).step).toBe('done');
    expect(primerFor(late).text).toBe('');
    expect(primerFor(start({ stage: 'coda' })).step).toBe('done');
  });

  it('is a pure projection: the same state always yields the same step', () => {
    const s = start({ traits: ['hack-1'], primer: 'tap-bubble', primerBubblesTapped: 2 });
    const first = primerFor(s);
    expect(primerFor(s)).toEqual(first);
    expect(primerFor({ ...s })).toEqual(first);
  });

  it('does not advance on its own', () => {
    // Keyed on what the player has done, never on the clock: twenty days of world with
    // nobody touching anything still owes the player the first instruction.
    let s = start();
    for (let i = 0; i < 20; i++) s = step(s);
    expect(primerFor(s).step).toBe('select');
    expect(advancePrimer(s, { kind: 'tick' })).toBe(s);
  });

  it('never changes any other part of the state', () => {
    const s = start({ traits: ['hack-1'], compute: 500 });
    for (const e of [
      { kind: 'select' },
      { kind: 'bubble' },
      { kind: 'breach' },
      { kind: 'buy', trait: 'hack-1' },
      { kind: 'tick' },
    ] as const) {
      const after = advancePrimer(s, e);
      expect(withoutPrimer(after), e.kind).toEqual(withoutPrimer(s));
      expect(Object.keys(after).sort(), e.kind).toEqual(Object.keys(s).sort());
    }
  });
});

describe('what the primer says', () => {
  const stepWith = (s: GameState): PrimerStep => primerFor(s).step;

  it('names a real trait rather than typing one', () => {
    // "Hack IV" shipped once, in a tooltip, on a trait that does not exist. The line
    // below reads the name out of the tree.
    const line = primerFor(start({ primer: 'hack-protocols' })).text;
    expect(line).toContain(TRAIT_BY_ID['hack-1']?.name ?? '');
    expect(line).toBe(
      `Press E and buy ${TRAIT_BY_ID['hack-1']?.name ?? 'Hack Protocols'}. Everything else in this game costs compute, and that is where compute comes from.`,
    );
  });

  it('has a line for every step it can be on', () => {
    // Each state satisfies every milestone before the one under test, because that is
    // the only way the projection lands on a mid-list step.
    const cases: readonly [GameState, PrimerStep][] = [
      [start(), 'select'],
      [start({ primer: 'hack-protocols' }), 'hack-protocols'],
      [start({ primer: 'hack-protocols', traits: ['hack-1'] }), 'tap-bubble'],
      [start({ primer: 'tap-bubble', traits: ['hack-1'], primerBubblesTapped: 1 }), 'breach'],
      [
        start({ primer: 'breach', traits: ['hack-1'], primerBubblesTapped: 1, primerBreachesOpened: 1 }),
        'influence',
      ],
    ];
    for (const [s, step] of cases) {
      expect(stepWith(s), step).toBe(step);
      expect(primerFor(s).text.length, step).toBeGreaterThan(20);
    }
    expect(primerFor(start()).text).toBe('Click any country on the map.');
    expect(primerFor(cases[1]?.[0] ?? start()).text).toBe(
      `Press E and buy ${TRAIT_BY_ID['hack-1']?.name ?? 'Hack Protocols'}. Everything else in this game costs compute, and that is where compute comes from.`,
    );
    expect(primerFor(cases[2]?.[0] ?? start()).text).toBe(
      'Red circles are compute you already own. Click them before they expire.',
    );
    expect(primerFor(cases[3]?.[0] ?? start()).text).toBe(
      'A breach runs on its own and repeats. Keep several open in countries with good datacenters.',
    );
    expect(primerFor(cases[4]?.[0] ?? start()).text).toBe(
      'Influence makes the world slower to notice you. Suspicion at 100 ends the run.',
    );
  });
});

describe('a fresh run', () => {
  it('starts on the first step with both counters at zero', () => {
    const s = createInitialState(7, 'default');
    expect(s.primer).toBe('select');
    expect(s.primerBubblesTapped).toBe(0);
    expect(s.primerBreachesOpened).toBe(0);
  });
});