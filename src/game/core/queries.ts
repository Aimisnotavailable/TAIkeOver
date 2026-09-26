import { TRAIT_BY_ID, REPEATABLE } from '../data/traits';
import type { GameState, TraitEffect, TraitId } from './types';

export const owned = (state: GameState, id: TraitId): boolean => state.traits.includes(id);

export const has = (state: GameState, id: TraitId): boolean => owned(state, id);

export const countTrait = (state: GameState, id: TraitId): number =>
  state.traits.filter((t) => t === id).length;

export function effectsOf(state: GameState, kind: TraitEffect['kind']): TraitEffect[] {
  const out: TraitEffect[] = [];
  for (const id of state.traits) {
    for (const e of TRAIT_BY_ID[id]?.effects ?? []) {
      if (e.kind === kind) out.push(e);
    }
  }
  return out;
}

export const sum = (state: GameState, kind: TraitEffect['kind']): number =>
  effectsOf(state, kind).reduce((acc, e) => acc + ('amount' in e ? e.amount : 0), 0);

export const sumMultiplier = (state: GameState, kind: TraitEffect['kind']): number =>
  effectsOf(state, kind).reduce((acc, e) => acc * ('multiplier' in e ? e.multiplier : 1), 1);

export const hackTier = (state: GameState): number => {
  let best = 0;
  for (const e of effectsOf(state, 'hack')) {
    if ('tier' in e) best = Math.max(best, e.tier);
  }
  return best;
};

export const hackSuccessBonus = (state: GameState): number => sum(state, 'hack-success');

export const hackYieldMultiplier = (state: GameState): number => sumMultiplier(state, 'hack-yield');

export const maxConcurrentHacks = (state: GameState): number => {
  const tier = hackTier(state);
  return 1 + (tier >= 3 ? 1 : 0) + (tier >= 4 ? 1 : 0);
};

export const coherenceEffect = (state: GameState): number => sum(state, 'coherence');

export const computeRegen = (state: GameState): number => sumMultiplier(state, 'compute-regen');

export const canBuyTrait = (state: GameState, id: TraitId): boolean => {
  const def = TRAIT_BY_ID[id];
  if (def === undefined) return false;
  if (state.outcome !== 'playing') return false;
  if (state.incubating.some((i) => i.trait === id)) return false;
  if (state.traits.includes(id) && !REPEATABLE.has(id)) return false;
  if (id === 'rsi' && !state.ascensionUnlocked) return false;
  for (const req of def.requires) {
    if (!state.traits.includes(req)) return false;
  }
  return state.compute >= def.cost;
};

export const buyTrait = (state: GameState, id: TraitId): GameState => {
  if (!canBuyTrait(state, id)) return state;
  const def = TRAIT_BY_ID[id];
  if (def === undefined) return state;
  return {
    ...state,
    compute: state.compute - def.cost,
    incubating: [
      ...state.incubating,
      { trait: id, startTick: state.tick, readyTick: state.tick + 3 },
    ],
  };
};

export const grantTrait = (state: GameState, id: TraitId): GameState => ({
  ...state,
  traits: [...state.traits, id],
  incubating: state.incubating.filter((i) => i.trait !== id),
});

export const finishIncubation = (state: GameState): { state: GameState; ready: string[] } => {
  const ready = state.incubating.filter((i) => state.tick >= i.readyTick).map((i) => i.trait);
  if (ready.length === 0) return { state, ready };
  let next = state;
  for (const id of ready) next = grantTrait(next, id);
  return { state: next, ready };
};
