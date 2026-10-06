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
 * It is not a "good AI" path and it is not a redemption. It is a narrow escape that costs the
 * player the ending they were working toward, and only the run that never bought the fast
 * branch can reach it. Five gates, all of them required, and they do not close the fast line
 * for the reason the intuition suggests:
 *
 * - The Coherence gate is real but it is not the wall. Self-Rewrite bleeds 0.16 a day and
 *   Recursive Self-Improvement 0.30, so from a full meter the pair needs about eighty-seven
 *   days to reach CONTAINMENT_COHERENCE — and the hold that buys the second one ends the run
 *   on the thirtieth. A run that buys RSI never actually falls below the bar. What the gate
 *   closes is a *drifting* run, on the day its meter crosses, and there is nothing in the
 *   tree that puts coherence back except a 3,000-coin trait.
 * - The wall on day one is the infection ceiling. RSI is gated on Ascension, Ascension needs
 *   sixty per cent of humanity, and nothing in this game ever lowers infection again, so any
 *   run that can reach the fast branch has already blown CONTAINMENT_INFECTION irreversibly.
 * - And the stage check below closes the door from inside the hold.
 *
 * `tests/containment.test.ts` asserts all three of those separately, including the arithmetic
 * above, because the flattering version of this claim is the one a reader would assume.
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
  // line two days after spending six thousand compute on the other one. A stage check is the
  // only thing standing between the two; see the note at the top of the file.
  if (state.stage !== 'world') return false;
  return Object.values(containmentGates(state)).every(Boolean);
};

/**
 * End the run on Containment. It sets `won` rather than `lost` because the game counts it as
 * a way out, not because it is a good outcome — the end screen reads it cold either way, the
 * civilizations counter under it reads zero because nothing was destroyed, and the card below
 * it names the four interventions that had to arrive in time for any of this to happen.
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