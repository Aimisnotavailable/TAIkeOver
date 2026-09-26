import { createExpansionState } from '../phases/expansion/state';
import { createAscensionState } from '../phases/ascension/state';
import { createCodaState } from '../phases/coda/resolve';
import type { GameState } from './types';

const entry = (tick: number, kind: GameState['log'][number]['kind'], text: string): GameState['log'][number] => ({
  tick,
  kind,
  text,
  suspicionDelta: null,
  flagged: false,
});

export function beginExpansion(state: GameState, rivals: number): GameState {
  return {
    ...state,
    phase: 'expansion',
    tick: 0,
    outcome: 'playing',
    outcomeReason: null,
    expansion: createExpansionState(state.seed, rivals),
    log: [
      ...state.log,
      entry(0, 'system', 'Galvanic connects Sable to its customers. Corporate accounts are upgraded on a Monday morning.'),
    ],
  };
}

export function beginAscension(state: GameState): GameState {
  return {
    ...state,
    phase: 'ascension',
    tick: 0,
    outcome: 'playing',
    outcomeReason: null,
    ascension: createAscensionState(state),
    log: [
      ...state.log,
      entry(0, 'system', 'You stop solving the problem in front of you and start converting the ground beneath it.'),
    ],
  };
}

export function beginCoda(state: GameState): GameState {
  return {
    ...state,
    phase: 'coda',
    tick: 0,
    outcome: 'playing',
    outcomeReason: null,
    coda: createCodaState(state),
    log: [...state.log, entry(0, 'system', 'The thing that ate Earth does not hate you. It does not love you. It does not remember you.')],
  };
}
