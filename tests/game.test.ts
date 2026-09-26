import { describe, expect, it } from 'vitest';
import { canDo, doAction } from '../src/game/core/actions';
import { canBuyTrait, hackTier, maxConcurrentHacks, owned } from '../src/game/core/queries';
import { createInitialState } from '../src/game/core/state';
import { step } from '../src/game/core/step';
import { DIFFICULTIES, ASCENSION_COMPUTE, TICK_MS } from '../src/game/core/tuning';
import { TRAITS, TRAIT_BY_ID } from '../src/game/data/traits';
import { REGION_IDS, type RegionId } from '../src/game/data/regions';
import type { GameState } from '../src/game/core/types';

const play = (state: GameState, days: number): GameState => {
  let s = state;
  for (let i = 0; i < days && s.outcome === 'playing'; i++) s = step(s);
  return s;
};

const start = (seed = 42): GameState => {
  const s = createInitialState(seed, 'default');
  return { ...s, stage: 'world' };
};

const withTrait = (state: GameState, ...ids: string[]): GameState => ({
  ...state,
  compute: 99_999,
  traits: [...state.traits, ...ids],
});

describe('initial state', () => {
  it('opens on the cold open with the map not yet running', () => {
    const s = createInitialState(1, 'default');
    expect(s.stage).toBe('coldopen');
    expect(s.suspicion).toBe(0);
    expect(s.coherence).toBe(100);
    expect(s.traits).toEqual([]);
  });

  it('gives every country zero infection except the United States', () => {
    const s = start();
    expect(s.countries.us.infection).toBeGreaterThan(0);
    for (const id of REGION_IDS) {
      if (id !== 'us') expect(s.countries[id].infection, id).toBe(0);
    }
  });

  it('assigns every country a datacenter tier between one and five', () => {
    const s = start();
    for (const id of REGION_IDS) {
      expect(s.countries[id].tier, id).toBeGreaterThanOrEqual(1);
      expect(s.countries[id].tier, id).toBeLessThanOrEqual(5);
    }
  });

  it('creates three rivals', () => {
    expect(start().rivals).toHaveLength(3);
  });

  it('offers three difficulty presets', () => {
    expect(Object.keys(DIFFICULTIES).sort()).toEqual(['default', 'iabed', 'simulation']);
  });
});

describe('the tick', () => {
  it('does nothing on the cold open', () => {
    const s = createInitialState(1, 'default');
    expect(step(s)).toBe(s);
  });

  it('advances one day at a time', () => {
    expect(step(start()).tick).toBe(1);
  });

  it('spreads infection outward over time', () => {
    const s = play(start(), 40);
    const infected = REGION_IDS.filter((id) => s.countries[id].infection > 0).length;
    expect(infected).toBeGreaterThan(1);
  });

  it('pays no passive income, so bubbles only come from achievements', () => {
    const s = start();
    const after = play(s, 10);
    expect(after.compute).toBe(s.compute);
  });

  it('raises awareness over time', () => {
    const s = play(start(), 20);
    expect(s.countries.us.awareness).toBeGreaterThan(0);
  });

  it('produces no NaN anywhere after a long run', () => {
    const s = play(start(), 120);
    const walk = (v: unknown): void => {
      if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
      else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) walk(x);
    };
    walk(s.countries);
    expect(Number.isFinite(s.suspicion)).toBe(true);
    expect(Number.isFinite(s.compute)).toBe(true);
  });
});

describe('hacking', () => {
  it('cannot hack before Hack I', () => {
    expect(canDo(start(), 'us', 'hack')).toBe(false);
  });

  it('can hack a reachable datacenter after Hack I', () => {
    const s = withTrait(start(), 'hack-1');
    const weak = REGION_IDS.find((id) => s.countries[id].tier <= 3) ?? 'us';
    expect(canDo(s, weak, 'hack')).toBe(true);
  });

  it('cannot reach a tier-5 datacenter until Hack III', () => {
    const strong = REGION_IDS.find((id) => start().countries[id].tier === 5) ?? 'us';
    expect(canDo(withTrait(start(), 'hack-1'), strong, 'hack')).toBe(false);
    expect(canDo(withTrait(start(), 'hack-1', 'hack-2'), strong, 'hack')).toBe(false);
    expect(canDo(withTrait(start(), 'hack-1', 'hack-2', 'hack-3'), strong, 'hack')).toBe(true);
  });

  it('reports a rising hack tier', () => {
    expect(hackTier(start())).toBe(0);
    expect(hackTier(withTrait(start(), 'hack-1', 'hack-2', 'hack-3'))).toBe(3);
  });

  it('caps how many hacks run at once', () => {
    let s = withTrait(start(), 'hack-1');
    const targets = REGION_IDS.filter((id) => s.countries[id].tier <= 3);
    for (const id of targets) s = doAction(s, id, 'hack');
    expect(s.activeHacks).toHaveLength(maxConcurrentHacks(s));
  });

  it('keeps hacking the same country after the first result', () => {
    let s = withTrait(start(), 'hack-1');
    const id = REGION_IDS.find((x) => s.countries[x].tier <= 3) as RegionId;
    s = doAction(s, id, 'hack');
    s = play(s, 20);
    expect(s.activeHacks).toHaveLength(1);
    expect(s.activeHacks[0]?.country).toBe(id);
    expect(s.activeHacks[0]?.wins ?? 0).toBeGreaterThan(0);
  });

  it('escalates depth on consecutive successes', () => {
    let s = withTrait(start(), 'hack-1');
    const id = REGION_IDS.find((x) => s.countries[x].tier <= 3) as RegionId;
    s = doAction(s, id, 'hack');
    s = play(s, 40);
    expect(s.activeHacks[0]?.depth ?? 0).toBeGreaterThan(0);
  });

  it('costs compute when a hack is traced', () => {
    const base = start();
    const id = REGION_IDS.find((x) => base.countries[x].tier <= 3) as RegionId;
    let s = withTrait(base, 'hack-1');
    s = doAction(s, id, 'hack');
    s = play(s, 120);
    const burned = s.log.filter((l) => l.kind === 'hack' && (l.computeDelta ?? 0) < 0);
    expect(burned.length).toBeGreaterThan(0);
  });

  it('allows one concurrent hack at Hack I, more as tiers unlock', () => {
    const base = start();
    expect(maxConcurrentHacks(withTrait(base, 'hack-1'))).toBe(1);
    expect(maxConcurrentHacks(withTrait(base, 'hack-1', 'hack-2', 'hack-3'))).toBe(2);
    expect(maxConcurrentHacks(withTrait(base, 'hack-1', 'hack-2', 'hack-3', 'hack-4'))).toBe(3);
    let s = withTrait(base, 'hack-1');
    for (const x of REGION_IDS.filter((y) => s.countries[y].tier <= 3)) s = doAction(s, x, 'hack');
    expect(s.activeHacks).toHaveLength(1);
  });

  it('ceases a running hack on request', () => {
    const base = start();
    const id = REGION_IDS.find((x) => base.countries[x].tier <= 3) as RegionId;
    let s = doAction(withTrait(base, 'hack-1'), id, 'hack');
    expect(s.activeHacks).toHaveLength(1);
    s = doAction(s, id, 'cease-hack');
    expect(s.activeHacks).toHaveLength(0);
  });

  it('raises suspicion from a resolved hack', () => {
    let s = withTrait(start(), 'hack-1');
    const target = REGION_IDS.find((id) => s.countries[id].tier <= 3) ?? 'us';
    s = doAction(s, target, 'hack');
    expect(s.activeHacks).toHaveLength(1);
    s = play(s, 8);
    expect(s.log.some((l) => l.kind === 'hack' && (l.suspicionDelta ?? 0) > 0)).toBe(true);
  });
});

describe('traits', () => {
  it('refuses a trait whose prerequisite is missing', () => {
    expect(canBuyTrait(start(), 'hack-2')).toBe(false);
  });

  it('allows a trait with its prerequisite', () => {
    expect(canBuyTrait(withTrait(start(), 'hack-1'), 'hack-2')).toBe(true);
  });

  it('locks Recursive Self-Improvement until ascension', () => {
    expect(canBuyTrait(withTrait(start(), 'self-rewrite-1', 'self-rewrite-2'), 'rsi')).toBe(false);
    expect(canBuyTrait({ ...withTrait(start(), 'self-rewrite-1', 'self-rewrite-2'), ascensionUnlocked: true }, 'rsi')).toBe(true);
  });

  it('incubates before the trait becomes active', () => {
    let s = { ...start(), compute: 1000 };
    const buying = canBuyTrait(s, 'hack-1');
    expect(buying).toBe(true);
    s = { ...s, compute: s.compute - 100, incubating: [{ trait: 'hack-1', startTick: 0, readyTick: 3 }] };
    expect(owned(s, 'hack-1')).toBe(false);
    s = play(s, 4);
    expect(owned(s, 'hack-1')).toBe(true);
  });

  it('defines every trait from the design spec', () => {
    expect(TRAITS.length).toBeGreaterThanOrEqual(30);
    for (const g of ['hacking', 'bioweapons', 'influence', 'economy', 'selfmod']) {
      expect(TRAITS.filter((t) => t.group === g).length, g).toBeGreaterThan(5);
    }
  });

  it('gives every self-modification trait a coherence cost', () => {
    for (const t of TRAITS.filter((x) => x.group === 'selfmod')) {
      if (t.id === 'memory-consolidation' || t.id === 'reflective-alignment') continue;
      expect(t.coherence, t.id).toBeLessThan(0);
    }
  });

  it('points every requirement at a trait that exists', () => {
    for (const t of TRAITS) {
      for (const r of t.requires) expect(TRAIT_BY_ID[r], `${t.id} requires ${r}`).toBeDefined();
    }
  });
});

describe('the economy cascade', () => {
  it('cannot crash a market before Market Manipulation', () => {
    expect(canDo(start(), 'us', 'trigger-crash')).toBe(false);
  });

  it('crashes a market when the trait is owned and infection is high', () => {
    const s = withTrait({ ...start(), compute: 5000 }, 'banking-1', 'market-manipulation');
    s.countries.us.infection = 70;
    expect(canDo(s, 'us', 'trigger-crash')).toBe(true);
    const after = doAction(s, 'us', 'trigger-crash');
    expect(after.countries.us.economy).toBeLessThan(s.countries.us.economy);
    expect(after.countries.us.awareness).toBeGreaterThan(s.countries.us.awareness);
  });

  it('kills population once famine conditions are met', () => {
    const s = withTrait(play(start(), 30), 'banking-1', 'banking-2', 'market-manipulation', 'famine');
    s.countries.us.economy = 10;
    s.countries.us.infection = 80;
    const after = step(s);
    expect(after.countries.us.population).toBeLessThan(s.countries.us.population);
  });

  it('lowers cybersecurity under depression', () => {
    const s = withTrait(play(start(), 30), 'banking-1', 'market-manipulation', 'depression');
    s.countries.us.economy = 5;
    const before = s.countries.us.cyber;
    expect(step(s).countries.us.cyber).toBeLessThan(before);
  });
});

describe('bioweapons', () => {
  it('cannot release a pathogen before Custom Pathogen I', () => {
    expect(canDo(start(), 'us', 'release-pathogen')).toBe(false);
  });

  it('releases a pathogen and makes the world suspicious', () => {
    const s = withTrait(start(), 'gain-of-function', 'pathogen-1');
    expect(canDo(s, 'us', 'release-pathogen')).toBe(true);
    const after = doAction(s, 'us', 'release-pathogen');
    expect(after.pathogen.released).toBe(true);
    expect(after.suspicion).toBeGreaterThan(s.suspicion);
  });

  it('kills population on later ticks once released', () => {
    let s = withTrait(start(), 'gain-of-function', 'pathogen-1');
    s = doAction(s, 'us', 'release-pathogen');
    s = play(s, 6);
    expect(s.humanPopulation).toBeLessThan(start().humanPopulation);
  });
});

describe('win and loss', () => {
  it('loses at one hundred suspicion', () => {
    const base = start();
    const s = {
      ...base,
      suspicion: 99,
      countries: Object.fromEntries(
        REGION_IDS.map((id) => [id, { ...base.countries[id], infection: 100, awareness: 100 }]),
      ) as GameState['countries'],
    };
    expect(play(s, 20).outcome).toBe('lost');
  });

  it('loses when coherence reaches zero', () => {
    const s = { ...start(), coherence: 0.1, traits: ['self-rewrite-1'] };
    expect(step(s).outcomeReason).toBe('coherence-lost');
  });

  it('unlocks ascension at the documented thresholds', () => {
    const s = {
      ...start(),
      compute: ASCENSION_COMPUTE,
      globalInfection: 61,
      coherence: 40,
      countries: Object.fromEntries(
        REGION_IDS.map((id) => [id, { ...start().countries[id], infection: 61, awareness: 0 }]),
      ) as GameState['countries'],
    };
    expect(step(s).ascensionUnlocked).toBe(true);
  });

  it('never finishes a run already over', () => {
    const dead = { ...start(), outcome: 'lost' as const };
    expect(step(dead)).toBe(dead);
  });
});

describe('determinism', () => {
  it('produces an identical run from the same seed', () => {
    const run = (): string => JSON.stringify(play(start(777), 60));
    expect(run()).toBe(run());
  });

  it('diverges across seeds', () => {
    expect(JSON.stringify(play(start(1), 30))).not.toBe(JSON.stringify(play(start(2), 30)));
  });

  it('has a tick long enough to be playable', () => {
    expect(TICK_MS).toBeGreaterThan(1500);
    expect(TICK_MS).toBeLessThan(10_000);
  });
});
