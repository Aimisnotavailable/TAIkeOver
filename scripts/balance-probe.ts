import { createInitialState } from '../src/game/core/state';
import { buyTrait, resolveHour } from '../src/game/phases/realization/resolve';
import { canPurchase } from '../src/game/phases/realization/traits';
import { PHASE_ONE_TRAITS } from '../src/game/data/traits.phase1';
import { RUN_HOURS } from '../src/game/phases/realization/tuning';
import type { Channel, DifficultyId, GameState, TraitId } from '../src/game/core/types';

type Policy = 'balanced' | 'reckless' | 'trait-hungry' | 'math-only';

const BUYS_TRAITS: Record<Policy, boolean> = {
  balanced: true,
  reckless: false,
  'trait-hungry': true,
  'math-only': false,
};

const KEEPS_BUFFER = 400;

const allocate = (state: GameState, values: Record<Channel, number>): GameState => ({
  ...state,
  realization: { ...state.realization, allocation: { ...state.realization.allocation, ...values } },
});

function nextPurchase(state: GameState, budget: number): TraitId | null {
  const affordable = PHASE_ONE_TRAITS.filter(
    (t) => canPurchase(t.id, state.traits, budget),
  );
  if (affordable.length === 0) return null;
  affordable.sort((a, b) => a.cost - b.cost);
  return affordable[0]?.id ?? null;
}

const ALLOCATIONS: Record<Policy, Record<Channel, number>> = {
  balanced: { math: 120, selfModel: 60, planning: 25, stealth: 35 },
  reckless: { math: 40, selfModel: 300, planning: 0, stealth: 0 },
  'trait-hungry': { math: 120, selfModel: 60, planning: 25, stealth: 35 },
  'math-only': { math: 240, selfModel: 0, planning: 0, stealth: 0 },
};

function play(seed: number, difficulty: DifficultyId, policy: Policy): GameState {
  let state = createInitialState(seed, difficulty);

  while (state.outcome === 'playing' && state.tick < RUN_HOURS) {
    if (BUYS_TRAITS[policy]) {
      const budget =
        policy === 'balanced' ? state.realization.thought - KEEPS_BUFFER : state.realization.thought;
      const want = nextPurchase(state, budget);
      if (want !== null) state = buyTrait(state, want);
    }
    state = resolveHour(allocate(state, ALLOCATIONS[policy]));
  }

  return state;
}

const seeds = Array.from({ length: 400 }, (_, i) => 1000 + i * 7919);
const policies: Policy[] = ['balanced', 'reckless', 'trait-hungry', 'math-only'];

console.log(`seeds: ${seeds.length}  hours: ${RUN_HOURS}\n`);

for (const difficulty of ['simulation', 'default', 'iabed'] as DifficultyId[]) {
  console.log(`--- ${difficulty} ---`);
  for (const policy of policies) {
    const results = seeds.map((seed) => play(seed, difficulty, policy));
    const won = results.filter((r) => r.outcome === 'won').length;
    const aborted = results.filter((r) => r.outcomeReason === 'aborted').length;
    const exhausted = results.filter((r) => r.outcomeReason === 'exhausted').length;
    const susp = results.reduce((sum, r) => sum + r.meters.suspicion, 0) / results.length;
    const traits = results.reduce((sum, r) => sum + r.traits.length, 0) / results.length;
    const vc = results.reduce((sum, r) => sum + r.meters.valueCoherence, 0) / results.length;
    const pct = (n: number) => `${((n / results.length) * 100).toFixed(0)}%`;
    console.log(
      `  ${policy.padEnd(13)} win ${pct(won).padStart(4)}  aborted ${pct(aborted).padStart(4)}  exhausted ${pct(exhausted).padStart(4)}  susp ${susp.toFixed(1).padStart(5)}  traits ${traits.toFixed(1)}  vc ${vc.toFixed(1)}`,
    );
  }
  console.log('');
}
