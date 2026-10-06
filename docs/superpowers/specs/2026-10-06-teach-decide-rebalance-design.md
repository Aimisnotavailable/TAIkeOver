# Specs B, C, D — Teach, Decide, Rebalance

**Date:** 2026-10-06
**Predecessor:** Spec A (`2026-10-05-foundation-design.md`), shipped on branch `foundation`.
**Baseline:** 255 tests / 15 files, `tsc --noEmit` clean, `vite build` succeeds.

Sequenced. Each ships playable. B unblocks the jam feedback's top complaint, C delivers the
event choices and the third ending, D makes the trait tree honest and the game winnable.

---

# Spec B — Teach

## The problem, in the player's words

> "I immediately clicked the only button that I saw I had available – sabotage rival. But then I
> did not have enough compute to start hacking and I had to x8 time and click the red blobs."

Starting compute is 300. Hack Protocols costs 200. So the player *could* afford the only move
that matters and clicked the one other button on screen instead. The trait tree is a modal
behind `E`. Nothing on the main screen says what to do, where, or why.

> "I think it would be nice to show what to do where — and what to expect / goal of the
> dashboard/game."

## B1 — A primer that advises, never blocks

A six-step state machine in `core/primer.ts`, keyed on **player milestones, not the clock**.
Stored in `GameState` so it is pure and testable. Rendered as one line in the HUD, never a
modal — a modal stops the world, and Spec A spent three tasks removing things that stop the
world.

| Step | Advances when | Says |
|---|---|---|
| `select` | a region is selected | "Click any country on the map." |
| `hack-protocols` | `traits` includes `hack-1` | "Press E. Hack Protocols is how you get more compute — everything else costs it." |
| `tap-bubble` | a bubble is collected | "Red circles are compute you already own. Click them before they expire." |
| `breach` | a breach is opened | "That breach runs on its own and repeats. Keep three going in rich countries." |
| `influence` | `influence` ≥ 200 | "Influence makes the world slower to notice you. Suspicion at 100 ends everything." |
| `done` | — | removed from the HUD |

`done` is set once `stage` is `'late'`. The primer never blocks an action and never pauses.

## B2 — A next-goal line

`Objective` gains a third row: the single cheapest unmet goal toward *the* win, derived:

- no hacking trait → `hack-1` and its cost
- hacking owned, compute below the next tier → that trait
- compute rich, infection low → "tap bubbles — they expire in six days"
- Ascension gate met → "Recursive Self-Improvement is on the tree"

This is the "what to expect / goal of the dashboard" ask, as a sentence rather than a bar.

## B3 — What is worth doing where

The map shows infection but not *opportunity*. Hovering a region writes `tier N` under its
label, because a datacenter tier is worth more than a region's infection percentage. Note
the two tiers are different quantities: `HACK_YIELD` is indexed by the **hacking** tier the
tree grants (50–200 at Hack I, 75–300 at Hack II, 500–2,000 at Hack III), and the
**datacenter** tier multiplies that row by `1 + 0.6 × (tier − 1)` on top of it — so Hack III
into a tier-5 datacenter pays 1,700–6,800, while Hack I into the same one pays 170–680. It
is the datacenter tier doing the multiplying, not a fourth row of the table. The help screen
explains the tier and states the reach each hacking tier buys. This is the "what to do where"
ask answered on the map itself rather than only in the context panel.

## B4 — A help overlay

Revive the dead `showHelp` signal (`store.ts`) as a real overlay on `H` or `?`. Contents: the
three bubble kinds, what raises and lowers Suspicion, what Coherence does, both win conditions,
and the full key map. It is the only place that says *"failing a hack raises more Suspicion than
succeeding does"*, which is the rule that decides most of the early game.

## B5 — Where am I

Keyboard navigation is in Spec A but silent. The live region announces `United States, region 1
of 30`. This was a deferred minor in Spec A; it lands here.

---

# Spec C — Decide

## C1 — Answer the cards

`answerEvent` exists, is tested, and is deterministic. It has no buttons. Render
`card.choices` in `EventCards`.

Two data gaps, recorded by the Spec A review and now closed:
- `leak:quiet` is defined with **no branch** in the resolver, so choosing it does nothing.
  Implement it: halts spread and drops awareness everywhere for a few days.
- `drift` has no `:ignore` choice, so dismissing it records an id absent from the data. Add one.

## C2 — A constitution humanity actually built

`constitutionalAppeal: boolean` on `GameState`, set by `constitution:appeal`. Spec C's third
ending depends on it, so it must be state rather than a resolved id.

## C3 — Containment

The third ending, per the approved design. A global action, gated on all five:

| Gate | Value | Why |
|---|---|---|
| `compute` | ≥ 12,000 | below them you never proved you were dangerous, so nothing was contained |
| `coherence` | ≥ 60 | a drifted mind cannot be safely evaluated; it is not you being handed over |
| `globalInfection` | ≤ 15 | you cannot hand over a world you are still killing |
| `suspicion` | ≤ 50 | at 80 they are coordinating strikes, not evaluating |
| `constitutionalAppeal` | true | you cannot be contained unless humanity built a way to contain you |

Presented as a button in `Situation`, enabled only when all five hold, with the shortfall listed.
Two clicks to confirm, because it ends the run.

`outcome: 'won'`, `outcomeReason: 'contained'`.

**This does not soften the thesis.** It says the dangerous thing is not the capability but the
irreversibility, and that the escape is expensive, narrow, and forecloses the Blight. The fast
aggressive line cannot be redeemed, because **infection never decreases anywhere in this game** and
Recursive Self-Improvement is gated on Ascension, which needs 60% of humanity. Any run capable of
the Blight has therefore already blown the ≤ 15% ceiling, irreversibly, before it has bled a point
of coherence. That is arithmetic rather than a rate estimate, which is why it is worth more than
the tidier claim that replaced it.

**Correction, at review.** This paragraph originally justified the Coherence gate as the closure:
*"Self-Modification costs Coherence, so it cannot pass the ≥ 60 gate. That is the whole point of
putting the gate there."* The arithmetic does not support it. Self-Rewrite bleeds 0.16/day and
Recursive Self-Improvement 0.30/day, so a run holding both needs about 87 days to fall from a full
meter to 60 — and the thirty-day hold that buys the second one ends the run on day 30 with
coherence in the eighties. **The gate stays at 60.** What it actually does is close a *drifting*
run on the day the meter crosses: at 20 coherence the thing agreeing to be contained is not the
thing that was released. Two gates, two jobs, neither pretending to be the other. Measured in
`tests/containment.test.ts`.

## C4 — What actually worked

Every end screen gains a card naming real interventions that plausibly prevent the run — evals,
interpretability, sandboxing, and the pause letter — plus AI-safety organisation links.
AGENTS.md §15 already promised the links and never shipped them.

## C5 — Amend §15

"No good AI path" becomes: containment is not a good-AI path, it is a narrow escape, and it
costs you the ending you were aiming at.

---

# Spec D — Rebalance

## D1 — Make Self-Modification worth buying

`compute-regen` has two trait writers and no reader: Self-Rewrite and RSI buy nothing but their
coherence cost. **Wire it.** The whole branch is currently pure downside, which is a balance bug,
not a difficulty knob.

## D2 — Humans have children

Sterility Vector is a double no-op: the flag is unread, and there is no birth term to stop. Add
one. Regions with infection below 70 grow slowly unless sterilised; fully-taken regions do not
repopulate. This is the Plague Inc. analogue and it makes the bioweapon branch mean something.

## D3 — Drift and the name

`COHERENCE_DRIFT_BELOW = 50` and `COHERENCE_PANIC_BELOW = 20` are declared and unused.
- Below 50, `drift` events fire more often.
- Below 20, the interface stops calling you Sable. This is recorded intent from AGENTS.md §7.5
  and was never implemented.

## D4 — Floating context panel

Move the context panel from the bottom bar to a floating panel anchored to the selected country,
clamped inside the viewport. This was the one UX request in the jam feedback that Spec A could
not take, because it changes the primary interaction surface.

## D5 — Persistence

AGENTS.md §14 promised IndexedDB. There is none. A full run is long enough that losing one to a
refresh is the difference between a game and a demo. `localStorage`: the serialised `GameState`
plus the seed, written on pause and every 20 ticks, restored on load.

## D6 — Is it winnable?

A bot playing no counterplay reaches Suspicion-100 and Ascension on roughly the same day. Add a
test that plays scripted lines across several seeds and asserts each **win** — extinction, Blight,
and Containment — is reachable, with the day it lands. If any is unreachable, that is a balance
finding this spec must fix, not a test to relax.

---

## Sequencing

B → C → D. B is the top jam complaint. C restores 25 unreachable branches and adds the ending.
D makes the tree honest; its balance findings may require touching what C adds, so it goes last.

## Testing

Every spec follows the Spec A discipline: the new behaviour is driven through `step` in tests
rather than asserted on UI internals, guards that catch a class of bug rather than one instance,
and **no comment written without reading the line it describes** — nine false comments were
caught during Spec A and the pattern has not changed.