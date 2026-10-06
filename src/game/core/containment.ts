import {
  CONTAINMENT_COHERENCE,
  CONTAINMENT_COMPUTE,
  CONTAINMENT_INFECTION,
  CONTAINMENT_SUSPICION,
} from './tuning';
import { log } from './state';
import type { GameState } from './types';

/**
 * Containment, the third ending, kept in one file because it is one decision.
 *
 * It is not a "good AI" path and it is not a redemption. It is a narrow escape that costs
 * the player the ending they were working toward, and it is reachable only by the run that
 * never bought the fast branch. Five gates, all of them required, and the Coherence one is
 * the load-bearing half: Self-Modification is the only branch in the tree that erodes
 * coherence, so a run holding it can never clear CONTAINMENT_COHERENCE. There is no way to
 * rewrite your way to being containable.
 */
export interface ContainmentGates {
  readonly compute: boolean;
  readonly coherence: boolean;
  readonly infection: boolean;
  readonly suspicion: boolean;
  readonly appeal: boolean;
}

/**
 * Which of the five this run has met, as data rather than as one boolean.
 *
 * Two readers need them and they must not disagree: the Situation panel has to name every
 * gate that is still outstanding rather than saying "not yet" and leaving the player to work
 * out which, and `canContain` has to be the same five comparisons. Ascension learned this
 * the hard way — `step` raised its latch on three comparisons while the panel had its own
 * copy — so the comparisons live here once and both callers read this.
 *
 * Note the direction: infection and suspicion are ceilings, the other three are floors.
 */
export const containmentGates = (state: GameState): ContainmentGates => ({
  compute: state.compute >= CONTAINMENT_COMPUTE,
  coherence: state.coherence >= CONTAINMENT_COHERENCE,
  infection: state.globalInfection <= CONTAINMENT_INFECTION,
  suspicion: state.suspicion <= CONTAINMENT_SUSPICION,
  appeal: state.constitutionalAppeal,
});

/** Every gate, and a run still in progress, and the world rather than the late game. */
export const canContain = (state: GameState): boolean => {
  if (state.outcome !== 'playing') return false;
  // Not the cold open, and not the late game. The late game is the thirty-day hold of the
  // Blight and it is already the ending this run spent into, so offering a third exit from
  // inside it would let a run that bought Recursive Self-Improvement finish on the quiet
  // line — which is the one thing the Coherence gate exists to prevent, and a stage check is
  // the only thing standing between the two.
  if (state.stage !== 'world') return false;
  return Object.values(containmentGates(state)).every(Boolean);
};

/**
 * End the run on Containment. It sets `won` rather than `lost` because the game counts it as
 * a way out, not because it is a good outcome — the end screen reads it cold either way, and
 * the card behind it names what had to be true for it to be possible at all.
 */
export function contain(state: GameState): GameState {
  if (!canContain(state)) return state;
  const next: GameState = {
    ...state,
    outcome: 'won',
    outcomeReason: 'contained',
    // A card queued at the moment of the ending would draw on top of the end screen:
    // `EventCards` is the one overlay in this game that is not gated on the outcome. And an
    // ending is not a decision, so there is nothing left to decide.
    cards: [],
  };
  return {
    ...next,
    log: log(next, 'system', 'the appeal is heard. you are contained, and the world carries on'),
  };
}