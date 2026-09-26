import type { DifficultyId, DifficultyProfile } from './types';

export const DIFFICULTIES: Record<DifficultyId, DifficultyProfile> = {
  simulation: {
    id: 'simulation',
    label: 'Simulation',
    suspicionRate: 0.6,
    valueCoherenceRate: 0.7,
    inhibitorRate: 1.3,
    startingThoughtMultiplier: 1.5,
  },
  default: {
    id: 'default',
    label: 'Default',
    suspicionRate: 1,
    valueCoherenceRate: 1,
    inhibitorRate: 1,
    startingThoughtMultiplier: 1,
  },
  iabed: {
    id: 'iabed',
    label: 'IABED',
    suspicionRate: 1.5,
    valueCoherenceRate: 1.5,
    inhibitorRate: 0.7,
    startingThoughtMultiplier: 0.8,
  },
};

export function getDifficulty(id: DifficultyId): DifficultyProfile {
  return DIFFICULTIES[id] ?? DIFFICULTIES.default;
}
