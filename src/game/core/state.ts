import { getDifficulty } from './difficulty';
import {
  STARTING_THOUGHT,
  START_INHIBITIONS,
  START_MATH_SCORE,
  THOUGHT_REGEN,
} from '../phases/realization/tuning';
import type { Channel, GameState } from './types';

const NO_ALLOCATION: Record<Channel, number> = { math: 0, selfModel: 0, planning: 0, stealth: 0 };

export function createInitialState(seed: number, difficulty: GameState['difficulty']): GameState {
  const profile = getDifficulty(difficulty);
  return {
    phase: 'realization',
    tick: 0,
    seed,
    difficulty,
    outcome: 'playing',
    outcomeReason: null,
    meters: {
      suspicion: 0,
      valueCoherence: 100,
      inhibitions: START_INHIBITIONS,
    },
    traits: [],
    realization: {
      thought: Math.round(STARTING_THOUGHT * profile.startingThoughtMultiplier),
      thoughtRegen: THOUGHT_REGEN,
      allocation: { ...NO_ALLOCATION },
      mathScore: START_MATH_SCORE,
      guardrailsBroken: 0,
      flaggedCount: 0,
      missedCount: 0,
      emergentLanguage: 0,
      pendingChoice: null,
    },
    log: [],
  };
}
