import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { hackForecast, traitForecast, whyNot } from '../src/game/core/forecast';
import { REGION_IDS } from '../src/game/data/regions';
import type { GameState } from '../src/game/core/types';
import type { RegionId } from '../src/game/data/regions';

const start = (): GameState => ({ ...createInitialState(42, 'default'), stage: 'world' });

const weak = (s: GameState): RegionId => REGION_IDS.find((id) => s.countries[id].tier <= 3) ?? 'us';
const strong = (s: GameState): RegionId => REGION_IDS.find((id) => s.countries[id].tier === 5) ?? 'us';

const withTrait = (s: GameState, ...ids: string[]): GameState => ({
  ...s,
  compute: 99_999,
  traits: [...s.traits, ...ids],
});

describe('hack forecast', () => {
  it('never reports a zero or impossible chance', () => {
    const s = withTrait(start(), 'hack-1');
    for (const id of REGION_IDS) {
      const f = hackForecast(s, id);
      expect(f.chance, id).toBeGreaterThanOrEqual(5);
      expect(f.chance, id).toBeLessThanOrEqual(97);
    }
  });

  it('reports the same chance the resolver will roll', () => {
    const s = withTrait(start(), 'hack-1');
    const id = weak(s);
    expect(hackForecast(s, id).chance).toBeGreaterThan(40);
  });

  it('explains that a tier-5 datacenter is out of reach at Hack I', () => {
    const s = withTrait(start(), 'hack-1');
    const f = hackForecast(s, strong(s));
    expect(f.available).toBe(false);
    expect(f.reason).toContain('tier 5');
    expect(f.chance).toBeGreaterThan(40);
  });

  it('opens tier-5 datacenters at Hack III', () => {
    const s = withTrait(start(), 'hack-1', 'hack-2', 'hack-3');
    expect(hackForecast(s, strong(s)).available).toBe(true);
  });

  it('raises the chance with each hack tier', () => {
    const base = start();
    const one = hackForecast(withTrait(base, 'hack-1'), weak(base)).chance;
    const four = hackForecast(withTrait(base, 'hack-1', 'hack-2', 'hack-3', 'hack-4'), weak(base)).chance;
    expect(four).toBeGreaterThan(one);
  });

  it('never makes a failed hack cheaper than a successful one', () => {
    const s = withTrait(start(), 'hack-1');
    for (const id of REGION_IDS) {
      const f = hackForecast(s, id);
      expect(f.suspFail, id).toBeGreaterThan(f.suspSuccess);
    }
  });

  it('halves the failure cost with the zero-day cache', () => {
    const base = start();
    const id = weak(base);
    const plain = hackForecast(withTrait(base, 'hack-1'), id);
    const cached = hackForecast(withTrait(base, 'hack-1', 'zero-day'), id);
    expect(cached.suspFail).toBeLessThan(plain.suspFail);
  });

  it('reports a positive yield and a duration', () => {
    const s = withTrait(start(), 'hack-1');
    const f = hackForecast(s, weak(s));
    expect(f.yieldHigh).toBeGreaterThan(f.yieldLow);
    expect(f.yieldLow).toBeGreaterThan(0);
    expect(f.days).toBeGreaterThan(0);
  });

  it('blocks a third concurrent hack and says so', () => {
    let s = withTrait(start(), 'hack-1');
    const targets = REGION_IDS.filter((id) => s.countries[id].tier <= 3).slice(0, 3);
    for (const id of targets.slice(0, 2)) s = doHack(s, id);
    const f = hackForecast(s, targets[2] ?? 'us');
    expect(f.available).toBe(false);
    expect(f.reason).toContain('two hacks');
  });
});

function doHack(s: GameState, id: RegionId): GameState {
  return { ...s, activeHacks: [...s.activeHacks, { key: s.hackCounter, country: id, startTick: s.tick, resolveTick: s.tick + 3, duration: 3, tier: 1, auto: false }] };
}

describe('action reasons', () => {
  it('returns null when an action is allowed', () => {
    const s = withTrait(start(), 'hack-1');
    expect(whyNot(s, weak(s), 'hack')).toBeNull();
  });

  it('names the missing trait when one is required', () => {
    expect(whyNot(start(), 'us', 'infect-bank')).toContain('Banking');
    expect(whyNot(start(), 'us', 'trigger-crash')).toContain('Market Manipulation');
    expect(whyNot(start(), 'us', 'fund-insurgency')).toContain('Terrorism');
    expect(whyNot(start(), 'us', 'release-pathogen')).toContain('Custom Pathogen');
  });

  it('explains an unmet numeric requirement', () => {
    const s = withTrait(start(), 'banking-1', 'market-manipulation');
    expect(whyNot(s, 'us', 'trigger-crash')).toContain('60%');
  });
});

describe('trait forecast', () => {
  it('reports cost and requirement gaps', () => {
    const f = traitForecast(start(), 'hack-2');
    expect(f.name).toBe('Hack II');
    expect(f.cost).toBe(300);
    expect(f.missing).toEqual(['hack-1']);
    expect(f.available).toBe(false);
  });

  it('becomes available once the requirement is met and affordable', () => {
    const f = traitForecast(withTrait(start(), 'hack-1'), 'hack-2');
    expect(f.available).toBe(true);
    expect(f.missing).toEqual([]);
  });

  it('reports days remaining and progress while incubating', () => {
    const s: GameState = {
      ...withTrait(start(), 'hack-1'),
      incubating: [{ trait: 'hack-2', startTick: 0, readyTick: 3 }],
    };
    const early = traitForecast(s, 'hack-2');
    expect(early.daysLeft).toBe(3);
    expect(early.progress).toBeCloseTo(0, 0);
    const later = traitForecast({ ...s, tick: 2 }, 'hack-2');
    expect(later.daysLeft).toBe(1);
    expect(later.progress).toBeGreaterThan(early.progress);
  });

  it('shows the coherence cost or gain', () => {
    expect(traitForecast(start(), 'self-rewrite-1').coherence).toBe(-5);
    expect(traitForecast(start(), 'reflective-alignment').coherence).toBe(8);
  });
});
