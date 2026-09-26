import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { step } from '../src/game/core/step';
import { doAction } from '../src/game/core/actions';
import {
  ASCENSION_COMPUTE,
  ASCENSION_COHERENCE,
  ASCENSION_INFECTION,
  COMPUTE_CEILING,
} from '../src/game/core/tuning';
import { REGION_IDS } from '../src/game/data/regions';
import { TRAIT_BY_ID } from '../src/game/data/traits';
import type { GameState } from '../src/game/core/types';

const start = (over: Partial<GameState> = {}): GameState => ({
  ...createInitialState(42, 'default'),
  stage: 'world',
  ...over,
});

/** Infect the first n regions completely and leave the rest untouched. */
const infectN = (n: number): GameState => {
  const s = start();
  const countries = Object.fromEntries(
    REGION_IDS.map((id, i) => [id, { ...s.countries[id], infection: i < n ? 100 : 0 }]),
  ) as GameState['countries'];
  return { ...s, countries };
};

const humansInfected = (s: GameState): number => {
  let infected = 0;
  let total = 0;
  for (const id of REGION_IDS) {
    const c = s.countries[id];
    if (c === undefined) continue;
    total += c.population;
    infected += (c.population * c.infection) / 100;
  }
  return total === 0 ? 0 : (infected / total) * 100;
};

describe('global infection is a share of people, not a mean of regions', () => {
  // The bug: a plain mean over thirty regions read 60% when only 47% of humans
  // were infected, so the number shown to the player was not the number it meant.
  it('agrees with the real share of humans at every spread', () => {
    for (const n of [1, 5, 10, 18, 25, 30]) {
      const s = infectN(n);
      // step also moves populations, so allow a little drift rather than exactness.
      expect(step(s).globalInfection, `${n} regions`).toBeCloseTo(humansInfected(s), 0);
    }
  });

  it('does not read 60% before most people are actually infected', () => {
    const s = step(infectN(18));
    expect(s.globalInfection).toBeLessThan(ASCENSION_INFECTION);
    expect(humansInfected(s)).toBeLessThan(60);
  });

  it('reads above 60% once most of humanity is infected', () => {
    expect(step(infectN(25)).globalInfection).toBeGreaterThan(ASCENSION_INFECTION);
  });

  it('is 0 on a clean world', () => {
    const s = start();
    const clean: GameState = {
      ...s,
      countries: Object.fromEntries(
        REGION_IDS.map((id) => [id, { ...s.countries[id], infection: 0 }]),
      ) as GameState['countries'],
    };
    expect(step(clean).globalInfection).toBe(0);
  });
});

describe('ascension', () => {
  // step recomputes globalInfection from the countries, so the infection has to be
  // real rather than asserted on the field.
  const ready = (over: Partial<GameState> = {}): GameState => ({
    ...infectN(25),
    compute: ASCENSION_COMPUTE,
    coherence: 100,
    ...over,
  });

  it('unlocks when every threshold is met', () => {
    expect(step(ready()).ascensionUnlocked).toBe(true);
  });

  it('needs the compute', () => {
    expect(step(ready({ compute: ASCENSION_COMPUTE - 500 })).ascensionUnlocked).toBe(false);
  });

  it('needs enough of humanity', () => {
    const s = start({ compute: ASCENSION_COMPUTE, coherence: 100, countries: infectN(18).countries });
    expect(step(s).ascensionUnlocked).toBe(false);
  });

  it('needs coherence to survive the rewrite', () => {
    expect(step(ready({ coherence: ASCENSION_COHERENCE - 1 })).ascensionUnlocked).toBe(false);
  });

  it('stays unlocked once earned', () => {
    const once = step(ready());
    expect(step({ ...once, compute: 0, globalInfection: 0 }).ascensionUnlocked).toBe(true);
  });

  // The whole point of the fix: this used to be unreachable in a normal run.
  it('is reachable in a real run', () => {
    // Buys a few things and taps the map. Not a naive spammer, which just burns
    // compute on failed breaches and never gets off the floor.
    const order = ['hack-1', 'propaganda-1', 'hack-2', 'cult', 'banking-1', 'hack-3', 'famine', 'zero-day'];
    let s = start({ compute: 400 });
    let next = 0;
    let sawAscension = false;
    for (let i = 0; i < 400 && s.outcome === 'playing'; i++) {
      s = step(s);
      for (const id of REGION_IDS) {
        if (s.activeHacks.length >= 3) break;
        if (s.countries[id]?.tier !== undefined && s.countries[id].tier <= 3 && !s.activeHacks.some((h) => h.country === id)) {
          s = doAction(s, id, 'hack');
        }
      }
      for (const b of [...s.computeBubbles]) {
        s = { ...s, compute: s.compute + b.value, computeBubbles: s.computeBubbles.filter((x) => x.id !== b.id) };
      }
      if (s.incubating.length === 0 && next < order.length) {
        const id = order[next]!;
        const cost = TRAIT_BY_ID[id]?.cost ?? Infinity;
        if (s.compute >= cost) {
          s = {
            ...s,
            compute: s.compute - cost,
            incubating: [...s.incubating, { trait: id, startTick: s.tick, readyTick: s.tick + 2 }],
          };
          next += 1;
        }
      }
      if (s.ascensionUnlocked) sawAscension = true;
    }
    expect(sawAscension).toBe(true);
  });
});

describe('the compute ceiling leaves room for ascension', () => {
  it('holds more than the ascension gate needs', () => {
    expect(COMPUTE_CEILING).toBeGreaterThan(ASCENSION_COMPUTE);
  });
});
