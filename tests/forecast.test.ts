import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { hackForecast, traitForecast, whyNot } from '../src/game/core/forecast';
import { REGION_IDS } from '../src/game/data/regions';
import { TRAITS, TRAIT_BY_ID } from '../src/game/data/traits';
import type { ActionKind } from '../src/game/core/actions';
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
    const three = hackForecast(withTrait(base, 'hack-1', 'hack-2', 'hack-3'), weak(base)).chance;
    expect(three).toBeGreaterThan(one);
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

  it('blocks a second concurrent hack at Hack I and says so', () => {
    let s = withTrait(start(), 'hack-1');
    const targets = REGION_IDS.filter((id) => s.countries[id].tier <= 3);
    s = doHack(s, targets[0] ?? 'us');
    const f = hackForecast(s, targets[1] ?? 'us');
    expect(f.available).toBe(false);
    expect(f.reason).toContain('one breach');
  });
});

function doHack(s: GameState, id: RegionId): GameState {
  return { ...s, activeHacks: [...s.activeHacks, { key: s.hackCounter, country: id, startTick: s.tick, resolveTick: s.tick + 3, duration: 3, tier: 1, auto: false, depth: 0, wins: 0, losses: 0 }] };
}

describe('action reasons', () => {
  it('returns null when an action is allowed', () => {
    const s = withTrait(start(), 'hack-1');
    expect(whyNot(s, weak(s), 'hack')).toBeNull();
  });

  it('names the missing trait when one is required', () => {
    expect(whyNot(start(), 'us', 'infect-bank')).toContain('Banking');
    expect(whyNot(start(), 'us', 'trigger-crash')).toContain('Market Manipulation');
    expect(whyNot(start(), 'us', 'fund-insurgency')).toContain('Insurgency');
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
    expect(f.name).toBe('Advanced Exploitation');
    expect(f.cost).toBe(800);
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

  it('shows the coherence cost or gain per day, not the raw magnitude', () => {
    // The card used to print `coherence -8` directly under a docs column headed
    // Coherence/day, while the meter moved 0.16. Both sides now call the one function
    // step.ts applies, so the card cannot be read as a daily figure it is not.
    expect(traitForecast(start(), 'self-rewrite').coherence).toBeCloseTo(-0.16, 6);
    expect(traitForecast(start(), 'rsi').coherence).toBeCloseTo(-0.3, 6);
    expect(traitForecast(start(), 'reflective-alignment').coherence).toBeCloseTo(0.4, 6);
  });
});

/**
 * Every reason string the game can hand a player, built from the tree rather than listed,
 * so a rename or a cut reaches them and a test that hardcoded the strings would not notice.
 */
const openHack = (s: GameState, country: RegionId): GameState => ({
  ...s,
  activeHacks: [
    ...s.activeHacks,
    { key: s.activeHacks.length, country, startTick: s.tick, resolveTick: s.tick + 3, duration: 3, tier: 1, auto: false, depth: 0, wins: 0, losses: 0 },
  ],
});

const HACK_SETS: readonly (readonly string[])[] = [
  [],
  ['hack-1'],
  ['hack-1', 'hack-2'],
  ['hack-1', 'hack-2', 'hack-3'],
];

const ALL_ACTIONS: readonly ActionKind[] = [
  'hack', 'infect-bank', 'trigger-crash', 'fund-insurgency', 'go-quiet', 'release-pathogen', 'sabotage-rival',
];

/** Reasons for every combination of hack tier and open breach count, over every region. */
const breachReasons = (traits: readonly string[]): string[] => {
  const base = withTrait(start(), ...traits);
  const out: string[] = [];
  for (let open = 0; open <= 3; open++) {
    let s = base;
    for (let i = 0; i < open; i++) s = openHack(s, REGION_IDS[i % REGION_IDS.length] as RegionId);
    for (const id of REGION_IDS) out.push(hackForecast(s, id).reason);
  }
  return out;
};

const allReasons = (): string[] => {
  const out: string[] = [hackForecast(start(), 'nowhere' as RegionId).reason];
  for (const traits of HACK_SETS) {
    out.push(...breachReasons(traits));
    const s = withTrait(start(), ...traits);
    for (const kind of ALL_ACTIONS) for (const id of REGION_IDS) out.push(whyNot(s, id, kind) ?? '');
  }
  return out;
};

describe('reason strings name real traits', () => {
  const NAMES = new Set(TRAITS.map((t) => t.name));

  it('sweeps every reason the game can produce', () => {
    // A guard on the guard: an enumeration that silently matched nothing would leave the
    // assertions below passing against a list of zero strings.
    const reasons = allReasons();
    expect(reasons.length).toBeGreaterThan(500);
    expect(reasons).toContain(`needs ${TRAIT_BY_ID['hack-1']?.name}`);
    expect(reasons.filter((r) => r.startsWith('locked: datacenter tier')).length).toBeGreaterThan(0);
    expect(reasons.filter((r) => r.includes('already running')).length).toBeGreaterThan(0);
  });

  it('never tells the player to buy a trait that is not in the tree', () => {
    // The whole class of bug: a hand-typed trait name that the tree cut or renamed out
    // from under. Every `needs <Name>` clause has to resolve to a real TraitDef name.
    const mentioned = new Set<string>();
    for (const r of allReasons()) {
      for (const m of r.matchAll(/\bneeds ((?:[A-Z][\w'-]* )+[A-Z][\w'-]*)/g)) {
        mentioned.add((m[1] ?? '').trim());
      }
    }
    expect([...mentioned].filter((n) => !NAMES.has(n))).toEqual([]);
  });

  it('has retired the Hack I–IV vocabulary the four-tier tree used', () => {
    // Those names are how this bug announced itself: `needs Hack I` on every country
    // before hacking is bought, and a "Hack IV" that was never purchasable.
    expect(allReasons().filter((r) => /\bHack (?:I|II|III|IV|V)\b/.test(r))).toEqual([]);
  });

  it('names the trait that lifts the breach cap, and admits when none does', () => {
    const at = (traits: readonly string[], open: number): string => {
      const base = withTrait(start(), ...traits);
      let s = base;
      for (let i = 0; i < open; i++) s = openHack(s, REGION_IDS[i % REGION_IDS.length] as RegionId);
      return hackForecast(s, REGION_IDS[REGION_IDS.length - 1] as RegionId).reason;
    };
    // Cap 1 -> the tier-2 trait; cap 2 -> the tier-3 trait; cap 3 -> nothing left to buy.
    expect(at(['hack-1'], 1)).toContain(TRAIT_BY_ID['hack-2']?.name);
    expect(at(['hack-1', 'hack-2'], 2)).toContain(TRAIT_BY_ID['hack-3']?.name);
    const top = at(['hack-1', 'hack-2', 'hack-3'], 3);
    expect(top).toContain('no trait opens another');
    for (const t of TRAITS) expect(top).not.toContain(t.name);
  });

  it('reaches the right trait for each out-of-reach datacenter', () => {
    const s = withTrait(start(), 'hack-1');
    const tier4 = REGION_IDS.find((id) => s.countries[id].tier === 4) as RegionId;
    expect(hackForecast(s, tier4).reason).toContain(TRAIT_BY_ID['hack-2']?.name);
    const tier5 = REGION_IDS.find((id) => s.countries[id].tier === 5) as RegionId;
    expect(hackForecast(s, tier5).reason).toContain(TRAIT_BY_ID['hack-3']?.name);
  });
});
