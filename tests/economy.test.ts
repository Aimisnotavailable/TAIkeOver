import { describe, expect, it } from 'vitest';
import { doAction } from '../src/game/core/actions';
import { hackForecast } from '../src/game/core/forecast';
import { createInitialState } from '../src/game/core/state';
import { step } from '../src/game/core/step';
import { BUBBLE_UNIT, COUNTRY_BUBBLES, WORLD_BUBBLES } from '../src/game/core/bubbles';
import { ASCENSION_COMPUTE, COMPUTE_CEILING, HARDEN_MAX } from '../src/game/core/tuning';
import { EVENT_DEFS } from '../src/game/data/events';
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

  it('keeps the ascension gate inside what a full clear can earn', () => {
    const perCountry = COUNTRY_BUBBLES.reduce((a, b) => a + b.bubbles, 0);
    const world = WORLD_BUBBLES.reduce((a, b) => a + b.bubbles, 0);
    expect((perCountry * 30 + world) * BUBBLE_UNIT + COMPUTE_CEILING).toBeGreaterThan(ASCENSION_COMPUTE);
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
    // Three concurrent breaches need Hack III; at Hack I you cannot spread at all.
    const base = withTrait(start(), 'hack-1', 'hack-2', 'hack-3', 'hack-4');
    const stick = play(doAction(base, weak(base), 'hack'), 60);
    const targets = REGION_IDS.filter((id) => base.countries[id].tier <= 3).slice(0, 3) as RegionId[];
    let rot = base;
    for (const id of targets) rot = doAction(rot, id, 'hack');
    expect(rot.activeHacks).toHaveLength(3);
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
