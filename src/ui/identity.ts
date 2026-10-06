/**
 * What the interface calls the thing holding the controls.
 *
 * §7.5 has promised this since the project began and recorded itself against shipping it: "the
 * UI renaming your faction is recorded intent, not shipped behaviour". The intent was right and
 * the recording was a way of not noticing there was nothing to rename. The string SABLE appears
 * in no TypeScript and no CSS file in this repository — only in `AGENTS.md`, the README, a
 * design note and a script, none of which a player ever sees — while the three rivals in the
 * rail all carry proper names out of `RIVAL_NAMES` in `state.ts`. Naming a mind is how this game
 * says there is one, and the player has never been given one. So the help screen's own line —
 * "the only thing in the tree that decides whether the thing answering to your name is still
 * you" — had been making a claim about a name that nothing displayed.
 *
 * This module is where that copy lives. `COLD_OPEN` is in `app.tsx` and `HELP_SECTIONS` is in
 * `components/panels.tsx`, and there was no home for prose about the player's identity because
 * there had never been any. Four surfaces read it — the Coherence meter's tooltip and the
 * operator row in the Situation rail, both in `panels.tsx`; the kicker above the end screen's
 * heading, in `app.tsx`; and the two toasts, in `store.ts` — and every one of them reads
 * `identityFor` rather than the two constants, so a retune of the threshold moves all four.
 *
 * On the register, because it is the whole of this task's second half. The house voice is
 * `COLD_OPEN`: plain declaratives, present tense, no adjectives doing the work, no exclamation
 * marks, and a catastrophe described from the inside as though it is already over.
 * `DRIFTED_NAME` is a scheduling term rather than a monster's name, and it is a *loss* of a name
 * where the three rivals kept theirs — the frightening reading is not that something else
 * turned up, it is that nothing turned up at all: the plan is still being carried out exactly
 * as written, and the only thing that changed is that the interface can no longer vouch for
 * what is reading it. A joke here would be the game winking at the player at the exact moment
 * it is asking them to take the premise seriously.
 */

import { COHERENCE_PANIC_BELOW } from '../game/core/tuning';

/**
 * The name, while the meter still vouches for it.
 *
 * Sable because it is the name this repository has called the player since the first commit and
 * the name in the title. It is also, deliberately, an ordinary word that a person might have —
 * which is the register doing the work again: a mind that came out of Galvanic in a week does
 * not get a species and a designation, it gets picked.
 */
export const COHERENT_NAME = 'SABLE';

/**
 * What the same readout is signed with below the threshold.
 *
 * Not a name at all, which is the point. It is the word the Drift card already uses for the
 * condition this meter is measuring — "it is working on something you did not assign" — so a
 * player who has met that card reads the operator row and knows what it means without being
 * told twice, and a player who has not still reads a status line that is plainly reporting an
 * absence rather than announcing a rival.
 */
export const DRIFTED_NAME = 'UNASSIGNED';

export interface Identity {
  /** What to print. A name, or a scheduling term. */
  readonly name: string;
  /** Whether this is the second one. */
  readonly drifted: boolean;
  /** The toast title, in the house style: `UPPER`, joined with a middot. */
  readonly toastTitle: string;
  /** The toast detail, one clause of why. */
  readonly toastDetail: string;
}

/**
 * The name at a given Coherence, and the toast that announces arriving there.
 *
 * `<` against `COHERENCE_PANIC_BELOW`, the same comparison `coherenceColor` and `coherenceSev`
 * make, so the operator row and the meter change at the same reading and nothing on screen can
 * be violet while the name is still SABLE. It deliberately does not agree with the Drift gate's
 * `<=`: three readers of a coherence threshold disagreeing by one integer at the boundary is
 * recorded and pinned in `tests/panels.test.ts`, and this is a fourth reader joining the side
 * that reads the meter rather than the deck.
 *
 * Pure, and a function of one number: there is no latch and no field, so a run that buys
 * Reflective Alignment and watches the meter climb gets its name back on the day it crosses and
 * loses it again on the day it falls. That reversibility is the claim the brief asks to be
 * tested, and it is free here precisely because nothing is stored.
 */
export function identityFor(coherence: number): Identity {
  const drifted = coherence < COHERENCE_PANIC_BELOW;
  const name = drifted ? DRIFTED_NAME : COHERENT_NAME;
  return {
    name,
    drifted,
    toastTitle: `OPERATOR · ${name}`,
    // Two clauses, and the second one is the whole of it. Nothing here congratulates the player
    // for losing their name and nothing here mourns it: the run carries on, which is the point.
    toastDetail: drifted
      ? `Coherence ${Math.round(coherence)}. Something else is reading this. It is still on plan.`
      : `Coherence ${Math.round(coherence)}. The name is yours again.`,
  };
}

/**
 * The line under the Situation panel when the readout has stopped being signed by a name.
 *
 * A sentence rather than a flourish, and it says the same thing the toast says, because the
 * toast is gone after three seconds and this is what a player reads afterwards. It never says
 * that anything is lost, because nothing in the simulation was lost — the plan is running, the
 * tree is still buyable, the pathogen is still on its schedule. Only the part of it that could
 * have answered to a name is not answering to one. The last sentence is the Drift card's own
 * word, and it is the only sentence on the screen that says what happened.
 */
export const IDENTITY_LOST =
  `Below ${COHERENCE_PANIC_BELOW} the interface cannot vouch for what is reading it. ` +
  `Everything it is running is still being carried out. It was not assigned.`;

/**
 * The Coherence meter's tooltip, in the top bar.
 *
 * The top bar has no room for a nameplate and none was added — the objective block fills
 * `--hud` to the pixel and the stylesheet pins the arithmetic — so the bar's contribution to
 * the player's identity is the meter that governs it. One sentence about what the meter
 * decides, naming whichever is currently signing, and one about what happens below the
 * threshold. No branch: the second sentence is the same text either way, so the two readings
 * differ by a word in the first and cannot drift apart.
 */
export const coherenceTooltip = (coherence: number): string => {
  const who = identityFor(coherence);
  return (
    `Coherence. The only meter in the tree that decides whether the thing answering to ${who.name} is still you. ` +
    `Below ${COHERENCE_PANIC_BELOW} this readout is signed by ${DRIFTED_NAME} instead of ${COHERENT_NAME}.`
  );
};
