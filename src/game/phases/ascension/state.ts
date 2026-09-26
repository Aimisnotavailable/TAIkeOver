import { REGIONS } from '../../data/regions';
import type { AscensionState, CelestialId, GameState } from '../../core/types';
import { ASCENSION_TRAITS, STARTING_ENERGY } from './tuning';

export function createAscensionState(state: GameState): AscensionState {
  const gain = {
    earth: 0,
    moon: 0,
    mars: 0,
    belt: 0,
    jupiter: 0,
    saturn: 0,
    mercury: 0,
    sun: 0,
  } as Record<CelestialId, number>;

  const population = state.expansion?.humanPopulation ?? REGIONS.reduce((s, r) => s + r.population, 0);
  const regions = state.expansion?.regions;
  if (regions !== undefined) {
    for (const region of Object.values(regions)) {
      region.converted = Math.min(100, region.control * 0.9);
    }
  }

  return {
    matter: 0,
    energy: STARTING_ENERGY,
    heat: population * 1e-9,
    radiatorArea: 0,
    oceansBoiled: false,
    exterminated: false,
    asked: false,
    gain,
    unlocked: [],
    heatRunaway: false,
    over: false,
    overReason: null,
  };
}

export const traitUnlocked = (state: AscensionState, id: string): boolean => state.unlocked.includes(id);

export const canUnlock = (state: AscensionState, id: string): boolean => {
  const def = ASCENSION_TRAITS.find((t) => t.id === id);
  if (def === undefined || state.unlocked.includes(id)) return false;
  return state.matter >= def.matter;
};

export const unlockTrait = (state: AscensionState, id: string): AscensionState => {
  if (!canUnlock(state, id)) return state;
  const def = ASCENSION_TRAITS.find((t) => t.id === id);
  if (def === undefined) return state;
  return { ...state, matter: state.matter - def.matter, unlocked: [...state.unlocked, id] };
};

export const boiTheOceans = (state: AscensionState): AscensionState => ({
  ...state,
  oceansBoiled: true,
  heat: state.heat * 3,
  energy: state.energy * 4,
  matter: state.matter * 1.14,
});

export const answerTheQuestion = (state: AscensionState, exterminate: boolean): AscensionState => ({
  ...state,
  asked: true,
  exterminated: exterminate,
});
