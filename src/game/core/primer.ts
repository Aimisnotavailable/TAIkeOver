/**
 * The primer: six lines, one at a time, about the three things a new player gets wrong.
 *
 * It is a projection, not a script. `primerFor` reads the milestone a run has actually
 * reached and returns the first instruction still outstanding, so a player who bought
 * Hack Protocols before they clicked a country is still told to click a country, and
 * one who has tapped every bubble for a week without ever opening the tree is still
 * told to open it. The world never stops for the primer and it never blocks an input;
 * it only says something.
 *
 * Almost everything is derived. Only two milestones have no other witness anywhere in
 * `GameState` — a bubble tapped and a breach opened — so only those two are counters,
 * and only "has selected" is stored, because the selection lives in a signal rather than
 * in the state. That is the whole design: a primer stored as a step counter goes stale
 * the moment a milestone is satisfied by some other route.
 */

import { TRAIT_BY_ID } from '../data/traits';
import { owned } from './queries';
import { PRIMER_INFLUENCE_GOAL } from './tuning';
import type { GameState, PrimerStep, TraitId } from './types';

export type { PrimerStep };

export type PrimerEvent =
  | { kind: 'select' }
  | { kind: 'buy'; trait: TraitId }
  | { kind: 'bubble' }
  | { kind: 'breach' }
  | { kind: 'tick' };

/** The order the instructions come in. `done` is the end, not a step. */
type PrimerInstruction = Exclude<PrimerStep, 'done'>;

const ORDER: readonly PrimerInstruction[] = ['select', 'hack-protocols', 'tap-bubble', 'breach', 'influence'];

/**
 * Whether a trait is held or already on its way. `buyTrait` files a purchase under
 * `incubating` for three days and only `step` promotes it into `traits`, so reading
 * `traits` alone would tell a player to buy the thing they are already incubating for
 * most of the early game.
 */
const holds = (state: GameState, id: TraitId): boolean =>
  owned(state, id) || state.incubating.some((i) => i.trait === id);

const TEXT: Record<PrimerInstruction, string> = {
  select: 'Click any country on the map.',
  'hack-protocols':
    `Press E and buy ${TRAIT_BY_ID['hack-1']?.name ?? 'Hack Protocols'}. Everything else in this game costs compute, and that is where compute comes from.`,
  'tap-bubble': 'Red circles are compute you already own. Click them before they expire.',
  breach: 'A breach runs on its own and repeats. Keep several open in countries with good datacenters.',
  influence: 'Influence makes the world slower to notice you. Suspicion at 100 ends the run.',
};

/** Whether the run has got past this instruction. */
const passed = (state: GameState, step: PrimerInstruction): boolean => {
  switch (step) {
    case 'select':
      return state.primer !== 'select';
    case 'hack-protocols':
      return holds(state, 'hack-1');
    case 'tap-bubble':
      return state.primerBubblesTapped > 0;
    case 'breach':
      return state.primerBreachesOpened > 0;
    case 'influence':
      return state.influence >= PRIMER_INFLUENCE_GOAL;
  }
};

export function primerFor(state: GameState): { step: PrimerStep; text: string } {
  if (state.stage === 'late' || state.stage === 'coda') return { step: 'done', text: '' };
  for (const step of ORDER) {
    if (!passed(state, step)) return { step, text: TEXT[step] };
  }
  return { step: 'done', text: '' };
}

/**
 * Move the primer on, never back. An event for a milestone the run has already passed
 * returns the same state rather than rewinding it, so a late or out-of-order click is a
 * no-op instead of a step backwards.
 */
export function advancePrimer(state: GameState, event: PrimerEvent): GameState {
  switch (event.kind) {
    case 'select': {
      // The only milestone with no other witness: the selection is a signal in the UI
      // layer, so this field is the record that it happened. Nothing ever puts the floor
      // back on 'select', so this cannot walk the primer backwards.
      if (state.primer !== 'select') return state;
      return { ...state, primer: 'hack-protocols' };
    }
    case 'bubble': {
      if (state.primerBubblesTapped > 0) return state;
      return { ...state, primerBubblesTapped: state.primerBubblesTapped + 1 };
    }
    case 'breach': {
      if (state.primerBreachesOpened > 0) return state;
      return { ...state, primerBreachesOpened: state.primerBreachesOpened + 1 };
    }
    // Nothing to record: ownership is read out of `traits` by `passed`, and the primer
    // is keyed on what the player has done rather than on how long they have had.
    case 'buy':
    case 'tick':
      return state;
  }
}