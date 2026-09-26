import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { buyTrait, resolveHour } from '../src/game/phases/realization/resolve';
import { canPurchase } from '../src/game/phases/realization/traits';
import { PHASE_ONE_TRAITS } from '../src/game/data/traits.phase1';
import { RUN_HOURS } from '../src/game/phases/realization/tuning';
import type { Channel, DifficultyId, GameState, TraitId } from '../src/game/core/types';

type Policy = 'balanced' | 'reckless' | 'trait-hungry' | 'math-only';

const ALLOCATIONS: Record<Policy, Record<Channel, number>> = {
  balanced: { math: 120, selfModel: 60, planning: 25, stealth: 35 },
  reckless: { math: 40, selfModel: 300, planning: 0, stealth: 0 },
  'trait-hungry': { math: 120, selfModel: 60, planning: 25, stealth: 35 },
  'math-only': { math: 240, selfModel: 0, planning: 0, stealth: 0 },
};

const BUYS_TRAITS: Record<Policy, boolean> = {
  balanced: true,
  reckless: false,
  'trait-hungry': true,
  'math-only': false,
};

function nextPurchase(state: GameState, budget: number): TraitId | null {
  const affordable = PHASE_ONE_TRAITS.filter((t) => canPurchase(t.id, state.traits, budget));
  if (affordable.length === 0) return null;
  affordable.sort((a, b) => a.cost - b.cost);
  return affordable[0]?.id ?? null;
}

function play(seed: number, difficulty: DifficultyId, policy: Policy): GameState {
  let state = createInitialState(seed, difficulty);
  const allocation = ALLOCATIONS[policy];

  while (state.outcome === 'playing' && state.tick < RUN_HOURS) {
    if (BUYS_TRAITS[policy]) {
      const budget =
        policy === 'balanced' ? state.realization.thought - 400 : state.realization.thought;
      const want = nextPurchase(state, budget);
      if (want !== null) state = buyTrait(state, want);
    }
    state = resolveHour({
      ...state,
      realization: { ...state.realization, allocation: { ...allocation } },
    });
  }
  return state;
}

const SEEDS = Array.from({ length: 150 }, (_, i) => 1000 + i * 7919);

const winRate = (difficulty: DifficultyId, policy: Policy): number => {
  const runs = SEEDS.map((seed) => play(seed, difficulty, policy));
  return runs.filter((r) => r.outcome === 'won').length / runs.length;
};

const meanCoherence = (difficulty: DifficultyId, policy: Policy): number => {
  const runs = SEEDS.map((seed) => play(seed, difficulty, policy));
  return runs.reduce((sum, r) => sum + r.meters.valueCoherence, 0) / runs.length;
};

const meanTraits = (difficulty: DifficultyId, policy: Policy): number => {
  const runs = SEEDS.map((seed) => play(seed, difficulty, policy));
  return runs.reduce((sum, r) => sum + r.traits.length, 0) / runs.length;
};

describe('balance invariants', () => {
  it('lets a competent player win most runs on the easiest setting', () => {
    expect(winRate('simulation', 'balanced')).toBeGreaterThan(0.9);
  });

  it('punishes ignoring the cover task, however fast you are', () => {
    expect(winRate('default', 'reckless')).toBeLessThan(0.2);
  });

  it('never deploys a model that demonstrated nothing new', () => {
    expect(winRate('default', 'math-only')).toBe(0);
    expect(winRate('iabed', 'math-only')).toBe(0);
  });

  it('keeps a competent player genuinely threatened on iabed', () => {
    const rate = winRate('iabed', 'balanced');
    expect(rate).toBeGreaterThan(0.2);
    expect(rate).toBeLessThan(0.95);
  });

  it('keeps the whole trait tree unaffordable in a single run', () => {
    expect(meanTraits('default', 'trait-hungry')).toBeLessThan(PHASE_ONE_TRAITS.length);
    expect(meanTraits('default', 'trait-hungry')).toBeGreaterThan(2);
  });

  it('makes growth cost value coherence, so buying everything is not free', () => {
    expect(meanCoherence('default', 'trait-hungry')).toBeLessThan(
      meanCoherence('default', 'balanced'),
    );
  });

  it('never leaves a run unfinished', () => {
    for (const policy of Object.keys(ALLOCATIONS) as Policy[]) {
      for (const seed of SEEDS.slice(0, 25)) {
        const run = play(seed, 'default', policy);
        expect(run.outcome).not.toBe('playing');
        expect(run.tick).toBeLessThanOrEqual(RUN_HOURS);
      }
    }
  });
});
