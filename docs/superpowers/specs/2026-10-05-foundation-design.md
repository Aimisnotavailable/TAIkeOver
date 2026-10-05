# Spec A — Foundation

**Date:** 2026-10-05
**Status:** approved
**Baseline at time of writing:** 185 tests passing, `tsc --noEmit` clean

## Thesis

Nothing new is authored in this spec. Every change does one of three things:

1. Makes something clearly intended reachable.
2. Removes an inconsistency between code, data, and the written design.
3. Lifts the determinism and accessibility floor that AGENTS.md §14 already promises.

Three later specs depend on this one landing first:

- **B (Teach)** cannot be keyboard-testable until A5 lands.
- **C (Decide)** needs the event system in `core/`, and its Containment ending needs
  the Blight win to be reachable so that "the fast path is unredeemable" is a claim
  about a path the player can actually walk.
- **D (Rebalance)** tunes numbers that A makes reachable for the first time.

## Verification baseline for every claim below

Each defect was confirmed by direct search, not inferred:

| Claim | Evidence |
|---|---|
| `rsiBought` is never assigned `true` | 5 references total: `state.ts:85` (`false`), `types.ts:206` (decl), `step.ts:412` (read), `panels.tsx:366,454` (read). No write. |
| `var(--line)` is undefined | 6 uses in `styles.css` (192, 223, 292, 303, 325, 332); `:root` (lines 1–17) defines `--edge` and `--edge-bright` only. |
| `Math.random()` in shipped game | exactly 2 occurrences, `store.ts:289` and `store.ts:297`. |
| Selection outline is dead | `app.tsx:209` passes `selected: null`; `worldMap.ts:278` reads `frame.selected`. |
| `answerEvent` is unreachable | `store.ts:176` defines it; no call site anywhere in `src/`. |
| Cards freeze the world | `store.ts:319`, `worldRunning()` returns false when `cards.length > 0`. |
| `announced` never resets | `app.tsx:28` module-level `Set`, only ever `.add`ed; `restart()` at `store.ts:257` resets `game`/`selected`/`speed` only. |
| Tab is destroyed | `app.tsx:297-299` `preventDefault()` on Tab whenever the world is running. |
| Non-existent trait ids are branched on | `depression` / `global-recession` / `supply-chain` referenced at `step.ts:304,310`, `actions.ts:150`; absent from `TRAITS` in `traits.ts`. |
| `converted` is read but never written | read at `worldMap.ts:245,311`; no writer in `src/`. |

---

## A1 — Reachability

### A1.1 Delete `rsiBought`, do not repair it

`rsiBought` is a redundant stored copy of `traits.includes('rsi')`. The bug is not a
missing assignment; the bug is that the same fact is stored twice, so the two copies
can drift. Adding the missing write would leave a second source of truth in place.

Remove the field from `GameState` (`types.ts:206`) and its initialiser
(`state.ts:85`), and derive the condition at the point of use:

- `step.ts:412` becomes `if (owned(state, 'rsi'))`
- `panels.tsx:366` and `panels.tsx:454` become `owned(state, 'rsi')`

`owned` is exported from `queries.ts:4`.

**Consequence, intended:** the Blight progress counter (`day n/30`) becomes visible
for the first time. It has never rendered, because the flag it reads is never set.

### A1.2 The 30-day RSI hold is the late game

Today `step` returns the identical input reference once `outcome !== 'playing'`
(`step.ts:152`). `lateStep` is called at `step.ts:428-430`, inside the same invocation
that sets `outcome: 'won'`. Therefore `lateStep` runs exactly once per run, and
`late.heat`, `late.expansion`, `late.stars`, and `late.potentialLost` freeze at their
first value. The end screen's civilizations counter is the constant **1,302** for
every run that reaches this point.

Change the sequencing:

- `stage` flips to `'late'` on the tick RSI is **purchased**, not on the win.
- `lateStep` runs on every tick while `stage === 'late'`, accumulating heat,
  expansion, stars, and `potentialLost`.
- `outcome` resolves to `'won'` / `'blight'` at the end of the 30-day hold.

This keeps the `step(finished) === finished` identity invariant asserted at
`tests/game.test.ts:299-358`, because the late game is traversed *before* `outcome`
is set rather than after.

**Why this is the right shape:** AGENTS.md §2 specifies that "Ascension and the Coda
are late-game stages — same map, same traits, new visual layer." Making the hold the
late game is the only arrangement in which the player actually watches the layer
change. It also means the heat ramp and the tier-4 countermeasure drain
(−180 compute/day plus strikes) run concurrently, which is the tension the ending is
supposed to have.

### A1.3 Write the dead `LateState` flags and reach `'coda'`

`oceansBoiled`, `askedHumanity`, `exterminated`, `encounters`, and `ending` are declared
in `LateState` and never written. `Stage`'s `'coda'` member (`types.ts:3`) is never
assigned.

Threshold them off the two accumulators `lateStep` already advances, so each flag has
one obvious trigger and one test:

| Flag | Trigger |
|---|---|
| `oceansBoiled` | `heat > 40` |
| `askedHumanity` | `expansion > 25` |
| `exterminated` | `expansion > 70` |
| `encounters` | increments once per 5 `expansion` |
| `ending = 'blight'` | `blight > 62` (already written at `step.ts:461`) |
| `stage → 'coda'` | `heat > 100` |

`'coda'` is AGENTS.md §13's starfield. Reaching it is what makes the end screen's
backdrop the thing the design promised rather than the same scrim as every modal.

This also un-deadens `country.converted`, which `worldMap.ts:245,311` already reads
for the late-stage tint and which nothing currently writes. Write it during the late
game, keyed to the same `expansion` thresholds, rather than deleting the tint.

---

## A2 — Determinism

AGENTS.md §14 specifies that randomness derives per tick from `(seed, tick, salt)` and
that "a replay is `seed + input log`." Two defects break this.

### A2.1 `Math.random()` in the event layer

`store.ts:289` (weighted event pick) and `store.ts:297` (target-country pick). These
are the only two non-deterministic draws in the shipped game, and both live in the UI
layer, which is why the existing determinism test at `tests/game.test.ts:360-373`
(which exercises only `step`) never catches them.

Replace with `rand(seed, tick, salt)` from `core/rng.ts`, using two dedicated salts
reserved for events. This change lands **inside A3**, after the code moves to `core/`,
so the file is not rewritten twice.

### A2.2 Salt collisions by `id.length`

Three sites derive a salt from a region's id string length:

- `step.ts:113` — war end, `0x7a12 + id.length`
- `step.ts:179` — biolab spawn, `id.length * 7 + 3`
- `step.ts:183` — factory spawn, `id.length * 7 + 9`

Region ids of equal length therefore draw the **same** value on the same tick.
Known collisions: `eu-west`/`eu-east`; `china`/`india`/`japan`/`korea`;
`brazil`/`russia`/`turkey`/`mexico`.

Fix by indexing over `REGION_IDS` (`regions.ts:92`), which is what
`seedNewCountries` already does correctly at `step.ts:145` (`1300 + index * 3`).

Test: all 30 regions produce distinct `rand` values on a fixed tick.

---

## A3 — Event logic belongs in `core/`, and the world stops stopping

### A3.1 Move `rollEvent` and `answerEvent` into `src/game/core/`

Both currently live in `src/ui/store.ts`. Event logic is game logic.

The cost of leaving it there is already visible: `tests/events.test.ts` and
`tests/pause.test.ts` import game rules from `src/ui/store.ts`, and a 59-line,
25-branch resolver (`answerEvent`, `store.ts:176-234`) had **no call site at all**
for long enough that the choice UI was removed in commit `005bc9a` without anyone
noticing the resolver was still there. Tests reaching into the UI layer for game rules
is the seam that allowed that rot.

- Move both to `src/game/core/events.ts`.
- Re-point `tests/events.test.ts` and `tests/pause.test.ts` at the new module.
- Land A2.1 during the move.
- Audit `answerEvent`'s 25 branches for any state it touches that is not reachable
  from a `GameState` argument, and resolve what it finds. If a branch needs store-only
  state, that state belongs in `GameState`.

**Scope boundary, stated deliberately:** A makes `answerEvent` reachable and covered
by tests. C gives it buttons. A tested function awaiting a UI is not the same failure
mode as an untested one, and splitting the move from the UI avoids two passes over the
same event data.

### A3.2 Events stop freezing the world

`worldRunning()` (`store.ts:319`) returns `false` whenever `cards.length > 0`, so every
single event halts the clock. At 8× with the current event cadence this is constant
start-stopping.

- `worldRunning()` no longer consults `cards`.
- Cards accumulate to a cap of **3**; `rollEvent` suppresses new rolls at the cap
  (replacing the current `cards.length >= 2` bail at `store.ts:277`).
- `evolveBlocked()` (`store.ts:324`) continues to block the trait tree while any card
  is outstanding.

Rationale for the split: the player may choose while the world moves, because that is
what makes a choice cost something, but may not upgrade past an unresolved decision,
because the trait tree is a large modal and an event behind it would be invisible.

---

## A4 — UI truthfulness

### A4.1 Selection is invisible on the map

`app.tsx:209` hardcodes `selected: null` into `MapFrame`, so the selection branch at
`worldMap.ts:278` never executes. Selecting a country produces **no map feedback at
all** — only the bottom panel changes. On a game whose entire premise is a world map,
this is the most damaging single defect in the UI layer.

Pass `selected.value`.

### A4.2 `--line` is undefined and used 6×

`styles.css` references `var(--line)` at 192, 223, 292, 303, 325, 332. `:root`
(lines 1–17) defines `--edge` and `--edge-bright`, never `--line`. Every toast, the
objective bar, the evolve button, the evolve box, and the evolve group headers are
silently borderless — all of it chrome added by recent commits.

Rename all six to `var(--edge)`.

### A4.3 `announced` never resets

`announced` (`app.tsx:28`) is a module-level `Set` that is only ever added to.
`actions.restart()` (`store.ts:257-261`) resets `game`, `selected`, and `speed`, but
not `announced`, `toasts`, or `evolving`.

Therefore **every run after the first "play again" has no passive toasts at all** —
the entire AGENTS.md §8.1 announcement system is dead on every replay.

Move `announced` into the store and clear it in `restart()` alongside `toasts` and
`evolving`.

---

## A5 — Accessibility floor

AGENTS.md §14 promises "full keyboard navigation" and "colourblind-safe palettes
(suspicion uses shape as well as colour)." Delivered state: no keyboard navigation
beyond four global keybindings, no focus styling of any kind, and one colour-only
encoding for the game's core collectible.

This is a floor, not polish.

| Defect | Fix |
|---|---|
| `app.tsx:297` `preventDefault()`s Tab whenever the world runs, so no HUD button is reachable by keyboard, ever | Rebind the evolve screen to **E**. Update the existing tooltip at `panels.tsx:180`. |
| `styles.css` contains zero `focus`/`outline` rules, so focus is invisible on a near-black theme | Add a `:focus-visible` rule using existing tokens (`--edge-bright`, `--ink-bright`) |
| Canvas is mouse-only: no `tabindex`, no `role`, no `aria-label`; country selection cannot be done without a pointer | Make the canvas focusable; `ArrowLeft`/`ArrowRight` step through `REGION_IDS`; announce the selected region to screen readers |
| Bubble kind is colour-only — three identical circles, red/orange/blue, no legend anywhere in the UI | Give each kind a glyph: `+` turnover, `/` strip, `?` audit. Add a legend to the HUD. |
| Suspicion and coherence severity are colour-only (`panels.tsx:104-105`) | Extend the ▲/▼ idiom already used at `panels.tsx:432` |

**Retained, deliberately:** `app.tsx:118-123` binds Enter/Escape/Space to dismiss a
pending card, which now competes with Space as the speed cycler at `app.tsx:294`. With
A3.2 the world no longer stops, so a pending card no longer blocks the speed control —
but Space will still double-fire. Narrow the card handler to Enter and Escape.

---

## A6 — Dead code, no behaviour change

Commit `a27ef6f` cut the trait tree from 33 to 17 and left orphans behind.

Delete:

- Branches on trait ids that **do not exist** in `TRAITS`: `depression` and
  `global-recession` at `step.ts:301-316`, `supply-chain` at `actions.ts:150`.
  **Correct AGENTS.md §7.4 to match the shipped tree rather than restoring traits that
  were deliberately cut.**
- `TraitDef` declared twice — `types.ts:52-61` (mutable, unused) and `traits.ts:17-26`
  (readonly, live). Delete the `types.ts` copy.
- Unused effect kinds in the `TraitEffect` union that no trait emits and no code reads:
  `insiders`, `targeted-strain`, `media-capture`, `political-capture`, `distillation`,
  `specialist`.
- Unused state and exports: `breaches` (accumulated at `step.ts:396-398`, read by
  nothing), `factories` (written at `step.ts:184`, read by nothing),
  `computeIncome` (`step.ts:55`, never called), `coherenceEffect`, `countTrait`, `has`
  (alias of `owned`), `neighbourNames`, `musicPlaying`.
- Dead CSS: `.toolbar`, `.toolbar-head`, `.toolbar-title`, `.toolbar-body`, `.rail`,
  `.rail-btn` (`styles.css:47-56`). AGENTS.md §3's collapsible right-hand toolbar was
  never built; the trait tree is a modal instead. Record the actual layout in §3.

**Retain, deliberately:**

- `COHERENCE_DRIFT_BELOW` and `COHERENCE_PANIC_BELOW` (`tuning.ts`) — declared and
  unused, but they are the constants Spec D needs for drift events and the
  below-20-Coherence faction rename. Deleting and re-adding is churn.
- `showHelp` (`store.ts:20`) — dead until Spec B revives it as a real help overlay.
- `pathogen.sterility` (`actions.ts:206` sets it, nothing reads it) — Spec C rewrites
  the pathogen branch and will either implement or remove it. Leaving one unused flag
  is cheaper than a speculative removal that gets undone.

---

## Testing

Baseline to protect: **185 passing**, `tsc --noEmit` clean.

### New

- `rsi` purchase → 30-day hold → `outcome: 'won'`, `outcomeReason: 'blight'`.
- Each `LateState` flag flips at its documented threshold; `stage` reaches `'coda'`.
- Two same-seed runs produce identical card sequences (closes the A2.1 hole; the
  existing test covers only `step`).
- All 30 regions yield distinct `rand` values on a fixed tick.
- `worldRunning()` true at every speed while a card is pending; `evolveBlocked()` still
  true; card queue never exceeds 3.
- `restart()` re-arms the announcement system: run → restart → the same condition
  fires its toast again.
- Map draws a stroke for the selected region (extend the render smoke test at
  `tests/compute.test.ts:148`).
- One glyph per bubble kind (same smoke test).
- `styles.css` contains a `:focus-visible` rule.

### Updated

- `tests/events.test.ts` and `tests/pause.test.ts` re-point from `src/ui/store.ts` to
  `src/game/core/events.ts`.

### Invariants that must survive

- `step(finishedState) === finishedState` (reference identity) — `tests/game.test.ts`.
- `JSON.stringify` equality across two same-seed runs — `tests/game.test.ts`.
- Ascension reachability via scripted buy order — `tests/ascension.test.ts:108-141`.
- No `NaN` in any field after 120 days — `tests/game.test.ts`.

---

## Risks

1. **The Blight may be unwinnable.** Thirty days under tier-4 countermeasures
   (−180 compute/day plus strikes) is a real squeeze, and A1.2 puts those two systems
   in the same window for the first time. A must prove reachability with a scripted buy
   order. Tuning it is Spec D; proving it is possible is Spec A.
2. **Unbinding Tab changes muscle memory.** `E` must be named in the evolve button's
   existing tooltip (`panels.tsx:180`) so the binding is discoverable.
3. **`answerEvent` audit.** 25 hardcoded choice-id branches may reference store-only
   state. This is the one item in A whose scope is not fully known until the code is
   read during implementation.
4. **Event cadence re-tuning.** Removing the world-stop changes how much pressure an
   event applies. The cap of 3 bounds the queue, but the *rate* at which cards are
   generated may need lowering so that cards do not permanently occupy all three slots.

---

## Out of scope, flagged not forgotten

AGENTS.md §14 specifies "Save: IndexedDB, serialized `GameState` + seed." No
`IndexedDB`, no `localStorage`, no persistence of any kind exists in `src/`. This is a
feature, not a repair, and is assigned to Spec D or cut, by decision.