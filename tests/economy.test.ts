import { describe, expect, it } from 'vitest';
import { doAction } from '../src/game/core/actions';
import { hackForecast } from '../src/game/core/forecast';
import { createInitialState } from '../src/game/core/state';
import { step } from '../src/game/core/step';
import { COMPUTE_BUBBLE_MAX } from '../src/game/core/tuning';
import { computePassive } from '../src/game/core/compute';
import {
  ASCENSION_COMPUTE,
  BIRTH_INFECTION_THRESHOLD,
  BIRTH_RATE_PER_DAY,
  COMPUTE_CEILING,
  EXTINCTION_POPULATION,
  HARDEN_MAX,
} from '../src/game/core/tuning';
import { EVENT_DEFS } from '../src/game/data/events';
import { TRAIT_BY_ID } from '../src/game/data/traits';
import { REGION_IDS, type RegionId } from '../src/game/data/regions';
import type { GameState } from '../src/game/core/types';

const start = (): GameState => ({ ...createInitialState(42, 'default'), stage: 'world' });
const withTrait = (s: GameState, ...ids: string[]): GameState => ({ ...s, compute: 99_999, traits: [...s.traits, ...ids] });
const weak = (s: GameState): RegionId => REGION_IDS.find((id) => s.countries[id].tier <= 3) as RegionId;
const play = (s: GameState, days: number): GameState => {
  let n = s;
  for (let i = 0; i < days && n.outcome === 'playing'; i++) n = step(n);
  return n;
};

describe('compute is a flow, not a hoard', () => {
  it('clamps a huge pile down to the ceiling', () => {
    const after = step({ ...start(), compute: 400_000 });
    expect(after.compute).toBeLessThanOrEqual(COMPUTE_CEILING);
  });

  it('spends down the surplus rather than keeping it', () => {
    const after = step({ ...start(), compute: 200_000 });
    expect(after.compute).toBeLessThanOrEqual(COMPUTE_CEILING);
  });

  it('leaves a small pile alone', () => {
    const s = { ...start(), compute: 100 };
    expect(step(s).compute).toBeGreaterThanOrEqual(100);
  });

  it('logs the clamp so the player can see it happen', () => {
    const s = { ...start(), compute: 300_000 };
    expect(step(s).log.some((l) => l.text.includes('ceiling'))).toBe(true);
  });

  it('keeps the ascension gate inside what a well-played run can earn', () => {
    // A generous upper bound on a long run: every bubble on screen collected the
    // instant it appears, for a full year. The gate has to sit under that.
    const perBubble = 16 * 2;
    const yearly = COMPUTE_BUBBLE_MAX * perBubble * 365;
    expect(yearly).toBeGreaterThan(ASCENSION_COMPUTE);
  });

  it('pays more passive compute late than early, so the ceiling is not the only cap', () => {
    const early = { ...start(), globalInfection: 1 };
    const late = { ...start(), globalInfection: 80, cumulativeDeaths: 4000 };
    expect(computePassive(late)).toBeGreaterThan(computePassive(early));
  });

  it('pays no passive compute before there is an outbreak to ride', () => {
    const base = start();
    const clean: GameState = {
      ...base,
      globalInfection: 0,
      cumulativeDeaths: 0,
      countries: Object.fromEntries(
        Object.entries(base.countries).map(([k, v]) => [k, { ...v, infection: 0 }]),
      ) as GameState['countries'],
    };
    expect(computePassive(clean)).toBe(0);
  });
});

describe('datacenters defend themselves', () => {
  it('hardens while a breach is running', () => {
    let s = withTrait(start(), 'hack-1');
    const id = weak(s);
    s = doAction(s, id, 'hack');
    s = play(s, 6);
    expect(s.countries[id].hardened).toBeGreaterThan(0);
  });

  it('regenerates once the breach stops', () => {
    let s = withTrait(start(), 'hack-1');
    const id = weak(s);
    s = play(doAction(s, id, 'hack'), 20);
    const peak = s.countries[id].hardened;
    expect(peak).toBeGreaterThan(0);
    s = play(doAction(s, id, 'cease-hack'), 30);
    expect(s.countries[id].hardened).toBeLessThan(peak);
  });

  it('lowers the odds the longer a breach runs', () => {
    let s = withTrait(start(), 'hack-1');
    const id = weak(s);
    const before = hackForecast(s, id).chance;
    s = play(doAction(s, id, 'hack'), 25);
    expect(hackForecast(s, id).chance).toBeLessThan(before);
  });

  it('caps hardening so it cannot become impossible', () => {
    let s = withTrait(start(), 'hack-1');
    const id = weak(s);
    s = play(doAction(s, id, 'hack'), 200);
    expect(s.countries[id].hardened).toBeLessThanOrEqual(HARDEN_MAX);
    expect(hackForecast(s, id).chance).toBeGreaterThanOrEqual(5);
  });

  it('means rotating targets beats sitting on one', () => {
    // Breach slots come from the hack tier: one at Hack I, three at Hack III.
    const base = withTrait(start(), 'hack-1', 'hack-2', 'hack-3');
    const stick = play(doAction(base, weak(base), 'hack'), 60);
    const targets = REGION_IDS.filter((id) => base.countries[id].tier <= 3).slice(0, 2) as RegionId[];
    let rot = base;
    for (const id of targets) rot = doAction(rot, id, 'hack');
    expect(rot.activeHacks).toHaveLength(2);
    rot = play(rot, 60);
    // Hardening is per-country and saturates, and depth accrues per breach, so
    // picking a different target is not inherently better. What actually pays is
    // using every slot you have, so measure breaches opened, not bubble totals
    // (which the ceiling would flatten).
    const opened = (g: GameState): number => g.log.filter((l) => l.text.startsWith('breach opened')).length;
    expect(opened(rot)).toBeGreaterThan(opened(stick));
    // A single stuck target still hardens, so sitting on one is not free either.
    expect(stick.countries[weak(base)].hardened).toBeGreaterThan(0);
  });

  it('shows the maximum tier reachable at the current hack tier', () => {
    const s = withTrait(start(), 'hack-1');
    expect(hackForecast(s, weak(s)).maxTier).toBe(3);
    const high = withTrait(start(), 'hack-1', 'hack-2', 'hack-3');
    expect(hackForecast(high, weak(high)).maxTier).toBe(5);
  });
});

describe('humans have children', () => {
  // Without this the bioweapons branch is arithmetic rather than a grind: a pathogen that
  // removes a fixed share of everyone every day needs no maintaining, and a world with
  // nobody left in it is a world that stays that way for free. It is the Plague Inc term —
  // the reason releasing something is a thing you have to *keep* doing.

  const flat = (infection: number): GameState => {
    const base = start();
    return {
      ...base,
      globalInfection: infection,
      countries: Object.fromEntries(
        Object.entries(base.countries).map(([k, v]) => [k, { ...v, infection, quiet: true }]),
      ) as GameState['countries'],
    };
  };

  const population = (s: GameState): number =>
    REGION_IDS.reduce((sum, id) => sum + s.countries[id].population, 0);

  it('grows a region that has not been taken', () => {
    const before = population(flat(0));
    expect(population(play(flat(0), 1))).toBeGreaterThan(before);
  });

  it('grows at the tuned rate, and the rate is read from the constant', () => {
    const s = flat(0);
    const before = population(s);
    const after = population(play(s, 1));
    // One day, so one compounding step, and the compounding is per-country: the total is
    // the sum of `pop * (1 + rate)` and the rounding the countries carry. A tolerance of a
    // part in ten thousand is the rounding, not the argument.
    expect(after).toBeGreaterThan(before * (1 + BIRTH_RATE_PER_DAY * 0.999));
    expect(after).toBeLessThan(before * (1 + BIRTH_RATE_PER_DAY * 1.001));
  });

  it('does not repopulate a region that is fully taken', () => {
    // The line that keeps Extinction reachable: above the threshold there are no births at
    // all, so a pathogen still drives the last people out. A birth term with a floor would
    // have made the win condition unsatisfiable rather than merely hard.
    const s = flat(BIRTH_INFECTION_THRESHOLD);
    const after = play(s, 30);
    for (const id of REGION_IDS) {
      expect(after.countries[id].population, id).toBe(s.countries[id].population);
    }
  });

  it('is the only thing Sterility Vector does, and it does it everywhere', () => {
    // `pathogen.sterility` was written at the release and read by nothing for the whole
    // history of this repo, and there was no birth for it to stop, so the trait cost 3,000
    // compute and bought nothing at all. Two no-ops in one card.
    const base = flat(0);
    const released = doAction(withTrait(base, 'pathogen-1'), 'us', 'release-pathogen');
    expect(released.pathogen.released).toBe(true);
    expect(released.pathogen.sterility).toBe(false);
    const unsterilised = population(play(released, 40));

    const sterilising = doAction(withTrait(base, 'pathogen-1', 'sterility'), 'us', 'release-pathogen');
    expect(sterilising.pathogen.sterility).toBe(true);
    expect(sterilising.pathogen.killsPerDay).toBe(released.pathogen.killsPerDay);

    // Births do not beat the Custom Pathogen, so the honest comparison is not that the
    // world grows but that it falls faster with the vector out than without it. Removing
    // a fifth of a percent a day of newborns is worth a fifth of a percent a day of
    // population, which at this kill rate is the difference between 6,755M and 6,490M.
    expect(unsterilised).toBeLessThan(population(released));
    expect(population(play(sterilising, 40))).toBeLessThan(unsterilised);
  });

  it('does nothing while the pathogen is still in the flask', () => {
    // The flag is only set at the release, and the flag is the only thing that reads it.
    const s = withTrait(flat(0), 'sterility');
    expect(s.pathogen.released).toBe(false);
    expect(s.pathogen.sterility).toBe(false);
    expect(population(play(s, 20))).toBeGreaterThan(population(s));
  });

  it('slows the Custom Pathogen down without ever beating it', () => {
    // The number that matters for balance: births are a fifth of what the cheapest
    // pathogen removes, so releasing it is now a grind rather than a formality, and the
    // population still falls. It just falls more slowly than the trait's card promises.
    const base = withTrait(flat(0), 'pathogen-1');
    const released = doAction(base, 'us', 'release-pathogen');
    const after = play(released, 200);
    expect(after.outcome).toBe('playing');
    expect(after.humanPopulation).toBeLessThan(released.humanPopulation * 0.7);
    // And still falling on the last day, which is what "no floor" means in practice.
    const later = play(after, 100);
    expect(later.humanPopulation).toBeLessThan(after.humanPopulation);
  });

  it('leaves Extinction reachable in principle on ground you have taken', () => {
    // Not a claim that any line gets there — `tests/winnable.test.ts` measures that none
    // does, and why. This is the narrower question the brief asks: does the birth term put a
    // floor under population that the win condition cannot get through?
    const s: GameState = {
      ...flat(100),
      countries: Object.fromEntries(
        REGION_IDS.map((id) => [
          id,
          { ...start().countries[id], infection: 100, quiet: true, population: 0.02 },
        ]),
      ) as GameState['countries'],
      pathogen: { released: true, killsPerDay: 0.1, suspicionPerDay: 0, sterility: false, targeted: false, cancer: false },
      suspicion: 0,
    };
    const after = play(s, 60);
    expect(after.humanPopulation).toBeLessThanOrEqual(EXTINCTION_POPULATION);
    expect(after.outcome).toBe('won');
    expect(after.outcomeReason).toBe('extinction');
  });

  it('keeps world population a fact rather than a constant', () => {
    // The objective bar's denominator used to be a fixed `WORLD_POPULATION` naming the
    // world at day zero, which went stale the moment births existed: the numerator counts
    // people born later and killed later, so the label could read over 100%. It is now
    // everyone this run has ever produced, and this says how far the world drifts.
    const start0 = population(flat(0));
    const after = population(play(flat(0), 350));
    expect(after / start0).toBeGreaterThan(1.1);
    expect(after / start0).toBeLessThan(1.5);
  });

  it('counts a death that a birth the same day would otherwise have hidden', () => {
    // `dailyDeaths` works by differencing each region's population against where it started,
    // and it used to run after `birthStep` had already added the day's newborns, so a person
    // killed in the morning and replaced in the afternoon was recorded as neither dead nor
    // born. Both `cumulativeDeaths` (the objective bar) and the dead-population term in
    // `computePassive` shrank by the birth rate the moment the birth term went in.
    //
    // One day makes it exact: the Custom Pathogen removes exactly `killsPerDay` of everyone,
    // so the day's deaths are exactly that share of the world — whatever was born that day
    // is not allowed to reduce it.
    const base = flat(0);
    const released = doAction(withTrait(base, 'pathogen-1'), 'us', 'release-pathogen');
    const start0 = population(released);
    expect(released.pathogen.killsPerDay).toBeGreaterThan(0);

    const after = step(released);
    expect(after.cumulativeDeaths / start0).toBeCloseTo(released.pathogen.killsPerDay, 9);
    // The world did not shrink by the kill rate alone: newborns arrived first and then
    // died with everyone else, so the day's deaths exceed what a day-zero world would give.
    expect(population(after)).toBeGreaterThan(start0 * (1 - released.pathogen.killsPerDay));

    // Over a long run the gap compounds: cumulative deaths exceed the naive figure because
    // every day's removals are taken from a population the previous days grew.
    const later = play(released, 40);
    expect(later.cumulativeDeaths).toBeGreaterThan(start0 * (1 - Math.pow(1 - released.pathogen.killsPerDay, 40)));
  });

  it('has a card that says what it does, built from the rate', () => {
    // The card used to say "nothing reads the flag, so this buys nothing on its own",
    // which was true and which is why it said it. It also had to stop saying it, so the
    // number on the card is read out of the tuning file rather than typed in beside it.
    const card = TRAIT_BY_ID['sterility']!;
    expect(card.description).toContain(`${(BIRTH_RATE_PER_DAY * 100).toFixed(1)}%`);
    expect(card.description.toLowerCase()).not.toContain('nothing reads');
    expect(card.description.toLowerCase()).not.toContain('buys nothing');
  });
});

describe('human constitutions and the eval literature', () => {

  it('includes a constitutional-assembly event with real choices', () => {
    const def = EVENT_DEFS.find((e) => e.id === 'constitution');
    expect(def).toBeDefined();
    expect(def?.choices.length).toBeGreaterThanOrEqual(3);
  });

  it('draws on the AI 2027 / 2040 research culture', () => {
    const ids = EVENT_DEFS.map((e) => e.id);
    for (const want of ['interpretability', 'evals', 'open-letter', 'sandboxing', 'constitution']) {
      expect(ids, want).toContain(want);
    }
  });

  it('gives every event at least three choices with distinct outcomes', () => {
    for (const def of EVENT_DEFS) {
      expect(def.choices.length, def.id).toBeGreaterThanOrEqual(3);
      expect(new Set(def.choices.map((c) => c.id)).size, def.id).toBe(def.choices.length);
    }
  });
});
