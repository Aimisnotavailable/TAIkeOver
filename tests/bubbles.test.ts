import { describe, expect, it } from 'vitest';
import { BUBBLE_UNIT, COUNTRY_BUBBLES, WORLD_BUBBLES } from '../src/game/core/bubbles';
import { createInitialState } from '../src/game/core/state';
import { step } from '../src/game/core/step';
import { COMPUTE_CEILING } from '../src/game/core/tuning';
import { TRAITS } from '../src/game/data/traits';
import type { GameState } from '../src/game/core/types';

const start = (): GameState => ({ ...createInitialState(42, 'default'), stage: 'world' });
const play = (s: GameState, days: number): GameState => {
  let n = s;
  for (let i = 0; i < days && n.outcome === 'playing'; i++) n = step(n);
  return n;
};

const TREE_COST = TRAITS.reduce((sum, t) => sum + t.cost, 0);

describe('bubbles are earned, not accrued', () => {
  it('pays nothing for merely existing', () => {
    const before = start();
    const after = step(before);
    expect(after.compute).toBe(before.compute);
  });

  it('pays nothing on a day with no achievements', () => {
    const s = play(start(), 30);
    const again = step(s);
    expect(again.compute).toBe(s.compute);
  });

  it('cannot clear the whole trait tree even on a full clear', () => {
    const perCountry = COUNTRY_BUBBLES.reduce((a, b) => a + b.bubbles, 0);
    const world = WORLD_BUBBLES.reduce((a, b) => a + b.bubbles, 0);
    const theoreticalMax = (perCountry * 30 + world) * BUBBLE_UNIT + COMPUTE_CEILING;
    expect(theoreticalMax).toBeLessThan(TREE_COST * 2);
    expect(theoreticalMax).toBeGreaterThan(TREE_COST);
  });

  it('caps the pool at the ceiling no matter how long you sit on a deep breach', () => {
    let s: GameState = {
      ...start(),
      compute: 0,
      traits: ['hack-1', 'hack-2', 'hack-3', 'hack-4'],
      activeHacks: [
        { key: 0, country: 'canada', startTick: 0, resolveTick: 1, duration: 1, tier: 4, auto: true, depth: 8, wins: 40, losses: 0 },
      ],
    };
    for (let i = 0; i < 200; i++) s = step(s);
    expect(s.compute).toBeLessThanOrEqual(COMPUTE_CEILING);
  });

  it('logs which achievement paid, so the player can see the source', () => {
    let s = start();
    s = { ...s, countries: { ...s.countries, us: { ...s.countries.us, infection: 30 } } };
    s = step(s);
    expect(s.log.some((l) => l.text.includes('+'))).toBe(true);
    expect(s.awarded.length).toBeGreaterThan(0);
  });

  it('never awards the same achievement twice', () => {
    let s = start();
    s = { ...s, countries: { ...s.countries, us: { ...s.countries.us, infection: 30 } } };
    const first = step(s);
    const second = step(first);
    expect(second.awarded.length).toBe(first.awarded.length);
    expect(second.compute).toBe(first.compute);
  });

  it('scales the award pool with the number of countries you work', () => {
    const wide = { ...start(), countries: { ...start().countries, us: { ...start().countries.us, infection: 99, agents: 20 } } };
    const narrow = { ...start(), countries: { ...start().countries, us: { ...start().countries.us, infection: 26 } } };
    expect(play(wide, 4).awarded.length).toBeGreaterThan(play(narrow, 4).awarded.length);
  });
});