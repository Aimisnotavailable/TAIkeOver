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
 * branch can reach it.
 *
 * What closes the fast line is the infection ceiling, and it closes it with no rate to argue
 * about. Recursive Self-Improvement is gated on Ascension; Ascension needs
 * `ASCENSION_INFECTION` of humanity; and infection never decreases anywhere in this game, by
 * any control, ever. So a run capable of the Blight passed sixty per cent a long time ago and
 * can never come back under `CONTAINMENT_INFECTION`. There is no sequence of in-game moves
 * from the fast line to this ending, which is a stronger claim than a rate estimate and the
 * only kind worth making here.
 *
 * The Coherence gate is a different gate doing a different job, and it used to be described as
 * if it were doing this one. It does not: Self-Rewrite bleeds 0.16 a day and Recursive
 * Self-Improvement 0.30, so a run holding both needs about eighty-seven days to fall from a
 * full meter to `CONTAINMENT_COHERENCE`, and the thirty-day hold that buys the second ends the
 * run first with coherence in the eighties. What it closes is a *drifting* run on the day its
 * meter crosses — at 20 coherence the thing agreeing to be contained is not the thing that was
 * released, and no amount of compute puts that back. There is exactly one thing in the tree
 * that restores coherence, and it costs more than most runs earn.
 *
 * `tests/containment.test.ts` holds all three of these apart, including the arithmetic that
 * rules the first version out, because the flattering version of this claim is the one a
 * reader would otherwise assume.
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
  // Not the cold open, and not the late game. The late game is the Blight's thirty-day hold,
  // and it is already the ending this run spent into.
  //
  // This is belt and braces rather than the wall, and the honest version of the comment says
  // so: the late stage is reachable only with Recursive Self-Improvement, which needs
  // Ascension, which needs infection past a threshold that never falls — so the infection
  // ceiling has already refused this state and the stage check never gets the vote on any run
  // the game can actually produce. It is here because it states the invariant instead of
  // inheriting it. The day infection becomes reducible, this stops being redundant and the
  // `tests/containment.test.ts` case that pins it is the one that says the door stays shut.
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
    // The queue is emptied here, and it is worth being precise about why, because the
    // comment that used to sit on this line had it backwards. It claimed `EventCards` was
    // "the one overlay in this game that is not gated on the outcome" and that clearing the
    // queue was therefore what stopped a card drawing over the end screen. `EventCards` *is*
    // gated on the outcome now, and has been since the four endings `step` writes were found
    // leaving a live keydown handler on a finished run — so the gate is the general guard and
    // this line is not what does the protecting.
    //
    // What it does do is stop the finished run's own state from carrying an unanswered
    // decision. Containment is the only ending a player presses a button for rather than one
    // `step` finds, so it is the only one whose state is authored at the moment the run ends,
    // and an ending is not a decision. The saved run then has nothing left to decide either.
    cards: [],
  };
  return {
    ...next,
    log: log(next, 'system', 'the appeal is heard. you are contained, and the world carries on'),
  };
}