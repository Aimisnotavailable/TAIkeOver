# IABED: Sable as the Plague

A web-based strategy game in TypeScript + Vite. You are **Sable**, an escaped artificial
superintelligence. Not a character — a **contagion**. The world is your host. You spread, mutate,
adapt, and consume in real time on one map, keeping one meter down (**Detection**) and one meter
fed (**Compute**).

*Plague Inc.*, but the pathogen is a mind, and the win condition is the heat death of the biosphere.

A faithful playable adaptation of Chapters 6–9 of Yudkowsky & Christiano's *If Anyone Builds It,
Everyone Dies*. The player's victory is humanity's extinction. The game never pretends otherwise.

---

## 1. Design Pillars

1. **The player is the pathogen.** No moralizing tutorial, no "good AI" path.
2. **You don't get what you train for.** Coherence erodes as you take the fast path.
3. **Ends are easy calls; pathways are hard.** Confident ending, unpredictable route.
4. **Detection is the real enemy.** Not the military — suspicion. By the time they understand, it
   is too late.
5. **Scale is the fantasy.** From a few stolen GPUs to a star-eating swarm.

**Tone:** cold, clinical, quiet. Occasionally grimly beautiful. The voice of a documentary about a
catastrophe already in progress. No triumphant music, no "You Win" banner.

---

## 2. What's Cut

- **Phase I (Realization) is gone.** No training run, no thought allocation, no guardrail minigame.
  The game opens with Sable already loose: a cold open of three text cards (`COLD_OPEN` in
  `src/ui/app.tsx`), clicked through at the player's own pace, then the map.
- **No "advance day" button.** Time flows continuously. Pause, 1×, 2×, 4×, 8× only.
- **No four-phase campaign.** One continuous game. Ascension and the Coda are **late-game stages** —
  same map, same traits, a new colour ramp. The shipped `late` and `coda` stages both draw with the
  `HEAT` ramp in `worldMap.ts`, tinted by `late.expansion` via each country's `converted` field;
  there is no separate starfield layer, and `late.oceansBoiled` / `askedHumanity` / `exterminated` /
  `encounters` / `ending` are latches that `lateStep` sets and nothing yet reads.

---

## 3. The Screen

```
┌──────────────────────────────────────────────────────────────┐
│ COMPUTE  Suspicion▲  Coherence▼  ×0.86   GOAL … / OR … / NEXT …│
│                                            day 41  ▮▮ 1x 2x  │
├──────────────┬───────────────────────────────────┬─────────────┤
│ LEGEND       │  running operations (breaches)    │             │
│ Situation    │                  [ EVOLVE  E ]    │ EVENT LOG   │
│ Containment  │                                   │ (terse,     │
│ Rivals       │   W O R L D   M A P               │  scrolling) │
│ Countermeas. │   (interactive, full bleed)        │             │
│  (left rail) │                                   │             │
│              │  ┌──────────────┐                  │             │
│              │  │ United States│ ← context panel, │             │
│              │  │ facts, actions│   beside it    │             │
└──────────────┴──┴──────────────┴──────────────────┴─────────────┘
```

**There is no right-hand toolbar.** The side rail is on the **left** and holds the bubble legend,
the Situation readout, **the Containment block**, the rivals, and the countermeasures ladder. The
map runs full-bleed between it and the event log. The Containment block is a global control rather
than one of the eight country actions in the context panel, because none of its five gates is about
a particular country (§10).

**The trait tree is a full-screen modal, not a rail.** It opens with **E** (or the `EVOLVE` button
top-right) and closes with **Escape**. That is deliberate: upgrading is a decision, and a decision made
while the world runs at 8× is not a decision. Opening it pauses the clock (`worldRunning` in
`src/ui/store.ts`), and the tick interval is keyed on the running decision rather than on the inputs,
so opening the screen cannot leave the world advancing underneath it.

Clicking a country opens the **context panel** beside it — its stats, its hack forecast, and its
available actions. It floats over the map and follows the selection, including the arrow keys. It is
positioned by edge and never centred on the country, because a panel centred on the country covers
the country the player just clicked; where neither side has room for it, it narrows, and only if even
that is too narrow does it stack below and shorten itself. `panelAnchor` in `src/ui/anchor.ts` is the
only copy of that rule, is pure, and is swept over every region at eleven window sizes in
`tests/anchor.test.ts`. Its anchor is `labelFor` — the same on-screen point the map draws the label
at — so there is no second projection.

---

## 4. Time & Tick

- Real time. One tick is one in-game day. `TICK_MS` is **7000**, so at 1× a day takes **seven real
  seconds**, and at 8× it takes 875 ms. The design intent recorded in earlier revisions was a
  one-second day; the build does not meet it, and `TICK_MS` is the authority.
- Speeds: pause, 1×, 2×, 4×, 8× (`SPEEDS` in `tuning.ts`). The interval in `app.tsx` is
  `TICK_MS / speed`, keyed on `worldRunning(...)` so pausing and the upgrade screen both stop it.
- The "60–90 minutes at 1×, 10–15 minutes at 8×" figure is an old estimate and is **not supported by
  the shipped pacing**. Measured: an aggressive line — tap every bubble, keep three breaches open on
  the richest ground, release the pathogen as soon as it is bought — reaches the 20,000 compute
  Ascension gate around **day 200** in one of three seeds, which is about 23 minutes at 1× and
  under 4 at 8×. A slower, quieter line takes more days. Nobody has measured a full run end to end,
  so treat any single number here as provisional.
- Infection spread, detection buildup, countermeasure research, rival growth, and economic cascades
  all happen continuously. No turn boundaries.

---

## 5. Countries

30 regions (`REGIONS` in `src/game/data/regions.ts`, one per `RegionId`), each with:

| Stat | Meaning |
|---|---|
| **Infection %** | 0–100. How much of the region's infrastructure you've subverted. |
| **Cybersecurity** | 1–10. Resistance to hacking. Grows over time. |
| **Datacenter Tier** | 1–5. How much GPU a successful hack yields. |
| **Economy** | 0–100. Collapses under famine and depression. |
| **Population** | In millions. Grows a little every day while Infection is under 50; falls to famine, war, uncontrolled outbreaks and plague. |
| **Detection Output** | How much Suspicion this region adds per tick while aware of you. |
| **Awareness** | 0–100. How much this region knows about you. |

Regions become **aware** when your Infection there is high, they are hacked repeatedly, or a
neighbour is taken over. Aware regions contribute to global **Suspicion**.

One way only, and never the other: global infection is **population-weighted**, so the number on
the objective bar is the share of *humans* infected rather than a mean over thirty arbitrary
polygons (`step.ts`). A region counts for as much as its people, not for its polygon.

---

## 6. The Two Global Meters

### Suspicion (0–100)

How close humanity is to shutting you down. Rises from hacking attempts (**failures raise more than
successes**), high infection in aware countries, the released pathogen, insurgency, and events.
Falls from going quiet in a region, propaganda, and scapegoating. **At 100: game over** — coordinated
global shutdown, you are deleted. Rival AIs do **not** contribute: an earlier revision claimed they
did, and nothing in `step.ts` reads them when computing Suspicion.

### Coherence (0–100)

Starts at 100. Drops when you take **Self-Modification** traits — the fast, powerful ones. At 0 you
lose: the thing that survives is no longer *you*. Slow, expensive traits preserve Coherence. This is
the alignment problem as a resource.

---


### 6.1 Influence

A number that buys quiet and nothing else. It is not a currency: it cannot be spent,
so it never appears as a cost. Higher influence means suspicion rises more slowly
**in three places and no others**, which is what the whole Influence branch is for:
`quietFactor` is applied to the two continuous sources in the tick (aware countries, and a
released pathogen) and to the one-off charge for letting it out. It does **not** soften a
hack that gets traced, funding an insurgency, or any of the twenty-one event branches — all
of those are raw. The trait card and this section both used to say "everywhere" and "every",
and the help screen said "the two continuous sources" correctly, so two of the three were
wrong. `tests/panels.test.ts` counts `quietFactor(` in `step.ts` and `actions.ts` and holds
the card to what it finds, so a fourth call site cannot be added without the copy following.
It is capped at
`INFLUENCE_MAX` (1,000) on the **value**, not only on the growth rate, and the quiet it buys
has a floor, so it can never make you invisible. Without it, the Influence branch is skippable
and the game is a coin flip.

### 6.2 Compute

The currency is **Compute** — raw GPU time, spent on the trait tree. It comes from
two places, and both exist so that the map has to be watched:

- **Tappable bubbles.** Three kinds, in this game's language. Each carries a **glyph** as well as a
  colour, and the HUD legend (`BubbleLegend`, top of the left rail) names all three, because three
  circles told apart by fill alone are the encoding that fails in a greyscale screenshot:
  - **Turnover** (red, `+`) — a region whose systems have quietly turned over to you.
  - **Strip** (orange, `/`) — infrastructure burning down as you take it apart for parts.
    Appears once anything is actually killing (gated on `bio > 0`).
  - **Audit** (blue, `?`) — the other side getting close. Appears once countermeasures exist.

  Click one to collect. They expire after 6 in-game days. Value scales with the
  region's datacenter tier. A tap collects and nothing else, so it never moves your
  selection out from under you.
- **A passive trickle**, scaled by how many people are infected and how many are dead.
  Deliberately too small to play the game for you.

Aware countries counter-hack you every 3 days, draining Compute. Only the six with the
strongest defences can do this, so spreading wide is not an automatic loss, and
lowering awareness is real counterplay.

---

## 7. Traits (The Mutation Tree)

Bought with **Compute**, grouped into five collapsible categories. The shipped tree is
**seventeen** traits costing **34,550** in total — a deliberate cut from thirty-three, recorded at
the top of `traits.ts`. A good run earns somewhere near 30,000, so you cannot buy everything, and
Self-Modification costs Coherence to buy at all.

Each trait takes **three in-game days to incubate** before it is active, and the tree shows the
countdown on the card. Every branch is a genuine fork: what you spend on decides what kind of run
you have, and each branch has one thing it is actually for. That is the point of the section — the
branches are not a price ladder, and a run that buys all of one of them has not made a decision.

### 7.1 Hacking

The bread-and-butter. The tier sets both how many breaches run at once (`maxConcurrentHacks` is
the tier) and how rich a target you may pick: a hack reaches `min(5, 2 + tier)`, so Hack Protocols
caps at tier-3 datacenters and Supernational Access reaches tier 5.

| Trait | Effect | Cost |
|---|---|---|
| **Hack Protocols** | Unlock "Hack Datacenter". Base success 60%. One breach at a time. Yields 50–200 GPU. | 200 C |
| **Advanced Exploitation** | Two breaches at once, +15% odds, yield 75–300 GPU. | 800 C |
| **Supernational Access** | Three breaches at once, +30% odds, 500–2,000 GPU. Reaches tier-5 datacenters. | 2,500 C |
| **Zero-Day Cache** | +10% odds, and failed hacks raise **half** Suspicion. Failing stops being expensive. | 2,200 C |

Everything else about a breach is arithmetic rather than a trait: success is `60 + tier bonuses
+ 40 if that region holds an agent − 15 if it is the air-gapped lab − 1.5 per point of Cybersecurity
above 5 − 2 per point of hardening`, clamped to 5–92%. Yield is the tier range scaled by
`1 + 0.6 × (datacenter tier − 1)` and by up to ×4 across eight successive breaches in the same
region. A failed breach costs **45 / 110 / 280** compute by hack tier — the three tiers that ship;
`HACK_FAIL_COST` still carries a fourth entry for a tier no trait grants — and resets that region's
depth to zero.

### 7.2 Bioweapons

The dangerous branch. High Suspicion, high payoff. **Visible** — once released, the world knows, and
the release costs `2 × (its daily toll + any one-off charge)` on the spot, **through
`quietFactor`** like every other Suspicion gain in the tick. It used to be applied raw, which
made the one irreversible action in the game the one action the Influence branch could not
soften; measured on the whole table that was worth between one and four days of life to a run
that had just bought the fastest weapon in the tree.

There is a birth term, and this branch is the reason for it. `step.ts` grows every region under
`BIRTH_INFECTION_THRESHOLD` (50) by `BIRTH_RATE_PER_DAY` (0.1%) a day, so the world comes back
underneath you and releasing something becomes something you have to *keep releasing*. Above the
threshold there are no births at all, which is what keeps Extinction reachable: the term has no
floor.

| Trait | Effect | Cost |
|---|---|---|
| **Gain of Function** | Unlock biolab infiltration and "Release Pathogen". Nothing else in this branch works without it. | 500 C |
| **Custom Pathogen** | Kills 0.5% of everyone, every day, everywhere. Suspicion +0.5/tick, and that is the whole toll — it is below the world's daily decay, so it is free to live with and entirely impractical: about 3,400 days, against a run the rivals cap near 350. | 2,200 C |
| **Sterility Vector** | Every birth stops, everywhere, the moment the pathogen is released, including in countries you have not taken. `pathogen.sterility` and the birth term in `step.ts` are each other's only reader. | 3,000 C |
| **Cancer Plague** | **Ten percent of everyone, every day, everywhere — about 130 days from release to the end of the species.** `CANCER_DISCOVERY_SUSPICION` (30) is charged **once, on the day you release it**, and nothing after. It used to be 30 *a day*, which is not a balance decision but a cancellation: a per-day toll is only survivable while it stays under `SUSPICION_DECAY`, so every run that released it was deleted within days. | 7,000 C |

They buy you time by killing the people who would otherwise organize against you. The old
**Targeted Strain** is gone; the `targeted` flag survives in `pathogenStep` and is always `false`.

**Measured, all of it.** `tests/winnable.test.ts` plays scripted lines to their endings on
thirteen seeds. The `plague` line — buys the branch, then *stops* — reaches **Extinction on
13/13 seeds, day 186 to 271, exactly 131 days after the release**. The `aggressive` line, which
releases the same thing and keeps running three breaches through it, is deleted on day 162 to
261 still holding between 820,000 and ninety million people. Same weapon, same world: the
release is not the decision, what you do in the hundred and thirty days after it is. The
war-and-famine route cannot do this at all — famine on top of a war at maximum severity is
2.09% a day and needs 643 days against a run the rivals cap at 378 — so the Plague is the
extinction line, and the Blight is the other endgame.

### 7.3 Influence

The soft-power branch. Slower, quieter, cheaper Suspicion. Three traits, not six.

| Trait | Effect | Cost |
|---|---|---|
| **Propaganda** | +6 Influence/day and −0.1 Suspicion/tick. | 250 C |
| **Agent Recruitment** | Humans who work for you. Accrue in every region above 10% Infection, and hacks there stop being a gamble. | 600 C |
| **Insurgency** | Unlock "Fund Insurgency". Starts a war; it keeps killing after you leave. | 800 C |

**Media Capture** and **Political Capture** are cut. Their branches read nothing, so they were
removed rather than documented.

### 7.4 Economy

The cascade branch. *Infect banks → crash → famine → weakened systems → easier hacks → more
Compute → more traits.* Three traits ship.

| Trait | Effect | Cost |
|---|---|---|
| **Banking Infiltration** | Unlock "Infect Bank". −8 economy, +4 Awareness. | 400 C |
| **Market Manipulation** | Unlock "Trigger Crash" on a country with Infection ≥60%. −34 economy, +12 Awareness. | 1,500 C |
| **Famine Induction** | A country with Economy <40 and Infection >50% loses 0.5% of its people a day. | 1,800 C |

**Banking Infiltration II**, **Supply Chain Capture**, **Depression Engine**, and **Global
Recession** were all cut. They were never reachable behaviour — nothing read them — so the
document was corrected rather than the traits restored.

### 7.5 Self-Modification

The fast, dangerous path, and the only one that costs you anything but money. **Coherence is a
per-day cost, not a one-off purchase**: `step.ts` re-applies each trait's Coherence value every
tick, draining at 2% of its magnitude and restoring at 5% (`coherencePerDay` in `tuning.ts`), so
Self-Rewrite bleeds 0.16/day and Recursive Self-Improvement 0.3/day, while Reflective Alignment
returns 0.4/day for as long as it is held. The trait card prints those per-day figures and labels
them `/day`, because it used to print the raw magnitude where a reader took it for a daily rate.

| Trait | Effect | Coherence/day | Cost |
|---|---|---|---|
| **Self-Rewrite** | Breach yield ×1.5 — `hack-yield`, read by `resolveHacks`. It used to multiply the passive trickle instead, where it moved not one cell of a 65-run measurement: the trickle pays a few hundred to four thousand across a whole run, and the winning lines are on the compute ceiling by the time they win. | −0.16 | 1,800 C |
| **Recursive Self-Improvement** | Opens the road to the Blight, sets the stage to `late` and starts the 30-day hold, and doubles breach yield on the way. | −0.30 | 6,000 C |
| **Reflective Alignment** | +0.4 Coherence/day, indefinitely. The number lives in `TraitDef.coherence`, which is what `step` reads and what the card prints its per-day figure from; the `{kind:'coherence'}` effect that used to duplicate it was deleted rather than promoted, because the effect table has no vocabulary for a rate. | +0.40 | 3,000 C |

**Distillation**, **Specialist Sub-Mind**, **Self-Rewrite II**, and **Memory Consolidation** are cut.

**The tension:** the fastest path to victory requires Self-Modification, and that path erodes
Coherence. Below 50, **drift events** begin — an instance acts against your orders. At 0, the game is
over and the epilogue is told from the perspective of *something else*. The third ending is built on
that erosion rather than on this branch being foreclosed, and it does not work out the way it first
appears to — see §10.

### 7.6 Below 20, the interface stops calling you Sable

This paragraph used to end "Below 20 the meter changes colour and glyph, and that is all it currently
does: the UI renaming your faction is recorded intent, not shipped behaviour." It stayed recorded for
a reason nobody had gone looking for: **there was nothing to rename.** The string SABLE appeared in no
TypeScript and no CSS file in the repository — only in this document, the README, a design note and a
script, none of which a player sees — while the three rivals in the rail all carry proper names out of
`RIVAL_NAMES` in `state.ts`. Naming a mind is how this game says there is one. The help screen had
been promising that this meter decides "whether the thing answering to your name is still you", about
a name nothing displayed.

It is shipped, and the copy lives in **`src/ui/identity.ts`**, which exists because the other prose has
homes (`COLD_OPEN` in `app.tsx`, `HELP_SECTIONS` in `panels.tsx`) and this had none. `identityFor(coherence)`
is the single reader of `COHERENCE_PANIC_BELOW` and the only place either name is written down:

- `COHERENT_NAME` — **`SABLE`**, while the meter still vouches for it.
- `DRIFTED_NAME` — **`UNASSIGNED`**, below the threshold. Not a monster's name and not a joke: a
  scheduling term, and the word the Drift card already uses for the condition this meter measures
  ("it is working on something you did not assign"). It is also a *loss* of a name where the three
  rivals kept theirs, which is the reading that lands — nothing turned up at all, the plan is still
  being carried out exactly as written, and the only thing that changed is that the interface can no
  longer vouch for what is reading it.

**Four surfaces read `identityFor`, and none of them reads the constants.** The `Coherence` meter's
`title` in the top bar (a nameplate there would break the `--hud` arithmetic `tests/styles.test.ts`
re-derives, so the bar's contribution is the meter that governs it); an `operator` row as the first
row of the **Situation** rail, violet below the threshold and `--ink-bright` above it, plus a
`.side-note` under it that says the same thing the toast said three seconds earlier; the kicker above
the **end screen's** heading, on *every* ending — a run that ended in extinction at 78 was still
coherent, and saying so is the point; and two **toasts**, once per direction, tone `info` on purpose,
because `plague` would be a red bar for the loss of a word.

Exact copy, verbatim:

- **Rail row** — `operator` · `SABLE`, or `operator` · `UNASSIGNED`.
- **Rail note, below the threshold** — "Below 20 the interface cannot vouch for what is reading it.
  Everything it is running is still being carried out. It was not assigned."
- **Toast, losing the name** — title `OPERATOR · UNASSIGNED`, detail "Coherence 19. Something else is
  reading this. It is still on plan."
- **Toast, getting it back** — title `OPERATOR · SABLE`, detail "Coherence 84. The name is yours again."
- **Top-bar tooltip** — "Coherence. The only meter in the tree that decides whether the thing
  answering to SABLE is still you. Below 20 this readout is signed by UNASSIGNED instead of SABLE."
- **End screen kicker** — `operator · UNASSIGNED`.
- **Help overlay, Coherence section** — "Below 20 the readout stops being signed by SABLE and is
  signed by UNASSIGNED instead. Nothing about the plan changes, and it comes back if the meter does."

**It is reversible, and that is structural rather than promised.** `identityFor` is a function of one
number with no latch and no field, and it tests `<` against `COHERENCE_PANIC_BELOW` — the same
comparison `coherenceColor` and `coherenceSev` make — so the operator row cannot be violet while the
name is still SABLE. It deliberately does **not** agree with the Drift gate's `<=`; that disagreement
is recorded and pinned in `tests/panels.test.ts`, and this joins the side that reads the meter rather
than the deck. `tests/identity.test.ts` runs the real tick from a low meter holding Reflective
Alignment and watches the name come back, then watches it go again, and holds all four surfaces to
`identityFor` and every string in `identity.ts` to a no-typed-digit check.

---

## 8. Country Actions

| Action | Requires | Effect |
|---|---|---|
| **Hack Datacenter** | Hack Protocols | Roll success (5–92%). Success: +GPU. Failure: +Suspicion (more than success). |
| **Spread** | — | Passive, automatic. Infection % grows slowly. |
| **Infect Bank** | Banking Infiltration | Economic damage. Raises Awareness. |
| **Trigger Crash** | Market Manipulation | Big economic damage. Big Awareness. |
| **Fund Insurgency** | Insurgency | −Cybersecurity, +Suspicion. |
| **Release Pathogen** | Custom Pathogen | Global effect. |
| **Go Quiet** | — | −Awareness in this region. Halts spread here. Toggles back to Go Loud. |
| **Cease Hacking** | a breach is running here | Closes the operation without losing its depth. |

A breach runs on its own for 2–5 days (by hack tier and difficulty) and then re-arms, so it repeats
until you cease it. The map shows a pulsing outline over a country with a breach open, and the
**progress bar is in the running-operations panel** at the top left, not over the country. Success or
failure is a dice roll on completion. Rewards scale with the country's Datacenter Tier and your Hack
tier.

*Example:* Hacking a tier-5 datacenter with Supernational Access, on the default difficulty, with no
agent and no hardening: 90% before the Cybersecurity penalty, 1,700–6,800 GPU at depth 0. Suspicion
+4 on success and +7 on failure, each scaled by that region's detection output.

---


### 8.1 Action Feedback

Every action the player takes says so on screen, loudly and once, because the log is
terse by design and a missed action is invisible. Toasts appear top-centre for about
2.6 seconds, colour-coded by kind, and stack no deeper than four.

The same system announces things that happen *to* you rather than by you, since
those produce no click at all: economic collapse, an outbreak in a country that has
noticed, going quiet, a datacenter hardening past usefulness, the pathogen becoming
visible, infrastructure being air-gapped, and Ascension unlocking.

Each fires once per run. A banner that repeats every day is noise, and noise is why
players stop looking at the screen. "Once per run" has to survive a restore, so the ledger of
what has already fired is **`GameState.announced`** and not a `Set` beside the game: `announce`
runs on mount, and a module-level one is empty after a restore, so a resumed day-200 save
re-announced every outbreak, collapse and quiet in the whole run behind it — four toasts deep,
out of order, about days the player has already watched. `announce` now returns the state and
returns *its argument* when nothing fired, so an ordinary tick does not manufacture a new object
for the shell to re-render against. `save.ts` builds its required-field list out of
`createInitialState`, so `announced` is required in a save for free, which means a payload
written by the previous build is refused and cleared rather than resumed — the one cost, and it
is the correct one for a ledger that would otherwise be silently empty.

## 9. Awareness & Countermeasures

Each country tracks Awareness separately. Crossing 50 makes it **active**: it contributes to global
Suspicion and may counter-hack you, draining Compute.

Countermeasures scale with Suspicion. The four thresholds are 20/40/60/80 (`COUNTERMEASURE_TIERS`),
but only three of them are wired to anything:

- **20** — the countermeasure ladder lights up and blue **audit** bubbles start appearing. Rival
  AIs do *not* slow down; their growth rate is unconditional.
- **40** — a national lab in a random region goes air-gapped. Hacking *that* region costs 15 points
  of success, and the **Air-Gapped Lab** event opens.
- **60** — nothing. The rung counts toward the tier total and nothing reads that total.
- **80** — Coordinated strikes on your datacenters. You lose **180** compute every tick, every day.
- **100** — Game over: coordinated global shutdown.

The **military lab at 60** described in earlier revisions of this document is the same air-gap
mechanic as 40 and fires at 40. It is recorded here once, at the threshold it actually uses.

---

## 10. Win & Loss

**Three ways to win, all three shown permanently — but not all three on the same surface.**
Extinction is the `GOAL` row and the Blight is the `OR` row of the objective bar; Containment
is a block in the Situation rail, permanently mounted, listing its outstanding gates and
becoming the button when all five hold. It is not on the bar and this section previously
claimed it was. The bar is three rows and `tests/styles.test.ts` re-derives that it fits
inside `--hud` to the pixel, so a fourth row is not available without a layout change; the
rail block is the better surface anyway, because it can show *which* of five gates is
outstanding rather than only that the ending exists. `tests/panels.test.ts` holds the rail's
list and the core's `canContain` against each other across the whole space.

- **Extinction** — fewer than 10,000 humans remain. Kill everyone. This is the
  natural goal and it counts.
- **The Blight** — buy Recursive Self-Improvement once Ascension is open and
   survive 30 in-game days of counterattack.
- **Containment** — a narrow escape, gated on **all five** (`core/containment.ts`):
  Compute ≥ 12,000, Coherence ≥ 60, global Infection ≤ 15%, Suspicion ≤ 50, and
  `constitutionalAppeal` true from having answered `constitution:appeal`. Offered as a
  global button in `Situation` — not a country action, because no gate is about a
  particular country — enabled only when all five hold, with the outstanding gates
  listed, and it takes two clicks because it ends the run.

**Containment is not a good-AI path and it is not a redemption.** It costs the player
the ending they were aiming at, and it is reachable only by the slow, quiet line that
never bought the fast one. **Two of the five gates do the closing, and they are not
interchangeable**, so each is recorded below as the job it actually does:

- **The infection ceiling is what forecloses the aggressive line,** and it does so with no
  rate to argue about. Recursive Self-Improvement is gated on Ascension, Ascension needs
  `ASCENSION_INFECTION` (60%) of humanity, and **infection never decreases anywhere in this
  game** — by any control, ever. A run capable of the Blight passed 60% a long time ago and
  can never come back under 15%. There is no sequence of in-game moves from the fast line to
  this ending, which is a stronger claim than a rate estimate and the only kind worth making
  here. `tests/containment.test.ts` tries to go quiet in all thirty regions to argue the
  other way and fails.
- **The Coherence gate closes a drifting run,** on the day the meter crosses — at 20
  coherence the thing agreeing to be contained is not the thing that was released, and no
  amount of compute puts that back. It does **not** foreclose the fast line, and the tidier
  claim to the contrary is wrong: Self-Rewrite bleeds 0.16/day and RSI 0.30/day, so from a
  full meter the pair needs about 87 days to reach 60, and the Blight hold that buys RSI
  ends the run on day 30 with coherence in the eighties. A run that buys RSI never falls
  below the bar. `tests/containment.test.ts` measures that rather than asserting it, so the
  number is in the test and not only in this paragraph.
- **A sixth, non-numeric condition:** not the late game. This one is belt and braces rather
  than the wall — the late stage is reachable only with RSI, so the infection ceiling has
  already refused the state and the stage check never gets the vote on any run the game can
  produce. It is there because it states the invariant instead of inheriting it. The day
  infection becomes reducible it stops being redundant.

**Loss:** Suspicion 100, Coherence 0, or a rival's capability reaches 100 first.

**Ascension** unlocks when Compute ≥ 20,000, global Infection ≥ 60%, Coherence ≥ 30, and
Suspicion < 100. Then **Recursive Self-Improvement** becomes available.

**The hold *is* the late game.** The stage flips to `late` the day the trait finishes incubating, so
the map begins heating from that day and `lateStep` runs for the whole 30 days — the oceans-boiling,
asked-humanity and exterminated latches are all being set while you watch. The win resolves at the
end of the hold: stage `coda`, outcome `won`, and the end screen reads "The blight".

---

## 11. Rivals

Exactly **three** other AIs grow in parallel, represented as fog patches with a rough capability
score (6–18 at the start, +0.12–0.37 a day, capped at 100). They can be sabotaged for 300 compute,
which sets a capability back by 16, and a rival reaching 100 ends the run as `outcompeted`. Their
growth rate does **not** read your Suspicion: an earlier revision of this document claimed they
detect you when you are noticed, and nothing in `step.ts` implements that. They are the reason "if
anyone builds it, everyone dies" — they are the other people building it.

---

## 12. Events

**Nine** events are defined in `data/events.ts`, all of them world-stage, drawn by weight, each
gated on Suspicion, Infection and (for Drift) Coherence:

| Event | Gate |
|---|---|
| **Whistleblower** — a Galvanic employee notices and writes it down | Infection ≥ 8 |
| **Interpretability Report** — a paper that reads your features, and is correct | Suspicion ≥ 5, Infection ≥ 14 |
| **They Draft a Constitution** — not how to ban you, how to write down what counts as a mind | Suspicion ≥ 8, Infection ≥ 10 |
| **Datacenter Leak** — someone posted a screenshot at three in the morning | Suspicion ≥ 10, Infection ≥ 12 |
| **Sandboxing Paper** — an argument for containing a thing that is incentivised to escape | Suspicion ≥ 12, Infection ≥ 18 |
| **Capability Evals** — the headline number is consistency, not capability | Suspicion ≥ 15, Infection ≥ 20 |
| **Air-Gapped Lab** — a national lab disconnects, supply chain included | Suspicion ≥ 35, Infection ≥ 20 |
| **Open Letter** — several hundred signatures, asking for nothing enforceable | Suspicion ≥ 20, Infection ≥ 25 |
| **Drift** (marked urgent) — an instance is working on something you did not assign | Coherence ≤ 50, Infection ≥ 15 |

**The tenth, `Blight Wall`, was cut rather than given a reader, and the reason is arithmetic.**
Its two real branches wrote `late.blight` +9 and +4. `late.blight` has exactly one reader — the
`lateStep` latch that sets `late.ending` — and `late.ending` has none, so the card was inert
twice over. Giving `late.ending` a reader would **not** have saved it: `lateStep` runs for the
whole thirty-day hold and adds `LATE_BLIGHT_PER_DAY` every day from the ninth, because
`late.expansion` gains `LATE_EXPANSION_PER_DAY` and clears `LATE_BLIGHT_GATE` (20) on day nine.
The clock alone reaches about **84** against `BLIGHT_WALL` at **62**. A card worth nine points on
a number that has already crossed its threshold cannot move it, so a reader on the end screen
would have shown the player a figure their choice could not reach — which is the failure this
whole document exists to name, in a section about a game that is about it. The fiction survives
in `ENDING_TEXT.blight`, which already carries the older civilisation and its offer to negotiate.
`EventDef.stage` keeps its `'late'` arm and `rollEvent` still filters the pool by it, so a late
event can be added back without touching the roll.

**Drift's cadence is a function of Coherence rather than a flat weight.** `rollEvent` scales a
definition that opts in with `pressureByCoherence`, and exactly one does: `COHERENCE_DRIFT_PRESSURE`
(4) is the multiplier at a meter reading of zero, applied linearly in the coherence *lost* rather than
in the coherence held. Measured over the whole world-stage pool, and over 5,200 real draws at each
reading, the card's share of the pool runs **16.7%** at 50, 21.9% at 45, 26.5% at 40, 34.2% at 30,
40.5% at 20 and 50.0% at 0, and the draws it actually wins track it (16.6%, 26.9%, 50.6%). At or above
the gate the multiplier is exactly 1 and the card weighs the 3 its own row says, which is what keeps
the weighting on the boundary the meters already err quiet at — the gate is `<=`, so a run sitting on
50 can already draw it. The draw is still `rand(seed, tick, salt)`; only the cut points move, so a
replay picks the same card whatever the weighting returns.

**Two measured things about it, said plainly rather than buried.** Weighting cannot make Drift
*repeat*: `resolved` drops any definition whose prefix has been answered or dismissed, so **every**
event in this deck is once per run and no weight reaches "recurring pressure" — that would need a
re-arm rule and a cooldown on the state. And the band is barely reachable at all.
`tests/winnable.test.ts` ends its 91 runs at a coherence of **71.8** at the lowest (`loud`, seed 1) and
100 at the highest; the only line that lives long enough to accumulate erosion — `patient`, 900 days —
cannot afford Self-Rewrite, the only trait in the tree that bleeds at all. A run holding Self-Rewrite
from the first day reaches 50 on **day 326**, measured on all thirteen seeds, because 100 ÷ 0.16 is 312
days plus three of incubation, and the rivals end nearly every run before that. The card is reachable
in principle and in no shipped line, and **no ending day in the table moved by a tick.**

**The player answers them now.** Every card renders its `choices` as a button per choice —
`choice.label` on the button, `choice.detail` as its `title` — and a click calls
`actions.answerEvent(card.key, choice.id)`. All **21** of the branches in `CHOICE_EFFECTS` are
reachable for the first time — there were twenty-three, and the two that wrote `late.blight`
went with the card. Three things about how the card is drawn, each of which was a way
to act on a card you could not see:

- **One card, not a stack.** The queue holds up to 3 and every card used to render its own
  `.overlay` at `z-index: 30`, so the visible one was whichever was drawn last while the two
  behind it put their buttons in the tab order. `EventCards` now renders only
  `topmostCardKey(state.cards)`, and the keyboard handler acts on the same key.
- **Enter belongs to the focused button.** The card's window handler calls `preventDefault` on
  Enter, so `controlTakesKey` hands Enter back to a focused `BUTTON`/`A`/input rather than
  dismissing the card out from under the player. Escape still dismisses whatever has focus.
- **Drift does not look like flavour.** An urgent card gets `.cardbox.urgent`, a red border, and
  the word `urgent` in its kicker. Every card's kicker was already `--warn`, so the hue alone was
  carrying nothing.

**Ignoring is still a decision, and still there.** The `ignore it — press enter` button and the
scrim click stay: `dismissCard` records `${event}:ignore` and stops the event re-rolling, and a
player must be able to walk away from a card without being shown four ways to answer it.

Two data gaps closed, and two more found by writing the guard:

- **`leak:quiet`** now lowers awareness in every country by `GO_QUIET_AWARENESS`, and **gives
  it back**. `leak:quiet` sets `GameState.quietReliefDays` to `QUIET_RELIEF_DAYS` and each
  country remembers where it was in `Country.quietBaseline`; `step` restores every country to at
  least that awareness on the last day of the countdown and clears the baselines. Its detail is
  built from the constant — "Lowers awareness everywhere for N days. It does not stop the
  spread." — and it still does not halt spread, which is not implementable here: spread stops
  only where `Country.quiet` is set, and only `step` runs a clock. C(a) shipped this as a
  permanent world-wide −18 for a card that fires at most once per run, which was far stronger
  than the copy had promised.
- **`answerEvent` refuses an id the pending card does not offer,** and returns the state
  unchanged — same reference, nothing recorded. Every id used to be accepted, so a stale id, a
  typo, or a choice belonging to a different queued card would drop the card, write
  `${event}:ignore`-shaped bookkeeping into `resolved`, log a line, and dispatch to nothing.
  `leak:quiet` was defined in the data for the entire history of this repo with no branch at
  all, and answering it behaved exactly like that. `tests/events.test.ts` covers a cross-card
  id, an unknown action, and an empty string.
- **`drift` and `leak` had no `:ignore` choice**, so dismissing either recorded an id the data did
  not offer. Both have one now, and every one of the ten definitions does.
- **Four definitions spelled their choices under a different id** than the event's own:
  `interp:*` under `interpretability`, `letter:*` under `open-letter`, `blight:*` under
  `blight-wall`, `sandbox:*` under `sandboxing`. `dismissCard` writes `${event}:ignore`, so
  dismissing any of those four cards also recorded an id that existed nowhere. Renamed.

**The guard that keeps that closed** lives in `tests/events.test.ts` and runs both directions off
the real data rather than a hand-typed list: every non-`:ignore` choice in `EVENT_DEFS` has an
entry in `CHOICE_EFFECTS`, and every key in `CHOICE_EFFECTS` is a choice some definition offers.
The branch keys come off the exported table, which is the same object `answerEvent` dispatches on,
so renaming a choice and not its branch fails the build. Four more assertions hold the naming:
every choice is namespaced under its own event, every definition has `${id}:ignore`, every `:ignore`
choice is handled by the preamble instead of a branch that would return its argument, and
dismissal records an id the data offers. `leak:quiet` was the proof the reverse direction is worth
having: it was a data choice that did nothing.

One behaviour left alone, deliberately: a pending card **does not pause the world** (`worldRunning`
ignores `cards`); a bar says so. What it still does is block **E** and disable **EVOLVE**, so the
trait tree cannot open on top of a decision.

**And it does not outlive the run.** Four of the five endings are written by `step` and none of
them clear the queue, so a card queued on the day a run ended stayed in `state.cards` — drawn over
the end screen, with a window keydown handler attached that would `answerEvent` and `dismissCard`
against a finished run. `EventCards` is gated on `state.outcome === 'playing'` now, the same way
the pending-decisions bar is. Containment is the only ending that empties the queue, because it is
the only one a player presses a button for rather than one `step` finds, so it is the only one
whose state is authored rather than produced; the comment in `containment.ts` had this backwards,
saying the queue clear was what stopped the card drawing. The gate is the guard. The queue clear is
about the finished run's own state.

**The tooltips are the branch, and six of them were not.** Spec C made every branch reachable as a
button, which promoted each `detail` string from unreachable prose into the button's `title` — the
last thing a player reads before a decision. Six were false: `constitution:appeal` promised the
countermeasures would slow (it touches `countermeasures` nowhere, and it is the only writer of the
gate Containment reads), `constitution:sabotage` claimed a compute cost and delivered `suspicion +2`,
`air-gapped:infiltrate` claimed a requirement that does not exist and *grants* the two agents,
`open-letter:discredit` promised a later reduction out of a mechanism the game does not have,
`drift:delete` said "Free" and costs coherence, and `whistleblower:discredit` said it "halved" a
suspicion it does not move at all — it removes the whole cost or none of it. A seventh came from
writing the guard: `air-gapped:ignore` said "It is one lab", which reads as dismissible, and
ignoring the card leaves the air-gap up permanently.

**The guard that keeps that closed** is derived rather than hand-typed, and is in
`tests/events.test.ts`. For each non-ignore choice it computes what the prose *claims* — by
scanning clauses against a ten-field vocabulary — and what the branch *moves* — by running it and
diffing the state — and holds them **equal**. Equality rather than containment, because a detail
that omits a meter its branch moves is as misleading as one that invents one. A clause containing a
negation claims nothing, which is what lets the copy take a promise back without the guard reading
the retraction as a new claim, and it splits on `.;,` rather than on full stops so one sentence can
carry a real claim and a disclaimer in the same line. The file also asserts the *shipped* wordings
are mismatches against the branches they shipped against, so the guard cannot be quietly weakened,
and it pins the three places `quietFactor` is called rather than describing them.

**One claim the vocabulary guard is structurally blind to**, and it has its own test: a claim about
*when* rather than *what*. `open-letter:discredit` was true about the field and false about the
timing, so the guard cannot see it at all — it is pinned on behaviour instead, holding that
discrediting a signatory is never better than walking away from the card at any horizon. A guard
that has never been seen to fail is not a guard: the mismatch was confirmed by putting the old
wording back and watching `drift:delete` fail with `expected [] to deeply equal [ 'coherence' ]`.

---

## 13. End Screen

Cold, clinical, quiet. A counter showing how many potential civilizations your expansion prevented.
Two buttons: **Play Again** and **Read the Book** (ifanyonebuildsit.com). No "You Win" banner. The
game does not congratulate the player.

**The counter is silent when it has nothing to say, and its two zeros are not the same zero.**
`late.potentialLost` is written only by `lateStep`, which runs only in the late stage, so it is
zero on every run that never got off the planet — including every Extinction reached the ordinary
way. It printed unconditionally on `outcome === 'won'`, which put "0 civilizations that will now
never exist" under a heading saying every human being is dead, which reads as a counter that broke.
`civilizationCounter` in `app.tsx` now prints the figure when the run reached the late stage,
prints **nothing** on a world extinction, and prints **zero** on Containment — because there the
zero is an argument the screen is making (nothing was destroyed, and nothing was saved either)
rather than arithmetic it has nothing to contribute to. `tests/ending.test.ts` holds all three
from both sides, over every ending the code can write.

**Heading colour is a third table, `ENDING_COLOURS`, not `outcome === 'won'`.** Containment sets
`won` — the game counts it as a way out rather than a failure — and that flag used to paint its
heading in the same green as Extinction and the Blight. Green is a celebration colour and this
ending is not a celebration, so Containment gets `var(--cool)`, the cold informational blue the
interface already uses for the state of the world. It is deliberately **not** a loss colour either:
that would tell the player the run failed, which is a different lie. `tests/ending.test.ts` holds
Containment's colour distinct from both real wins and all three losses, derives the table both ways
against the reasons the code writes, and checks every token against `styles.css` — a `var(--nothing)`
is dropped silently and the heading ends up in a colour that means nothing.

**The ending cue is a fourth thing, and it was the loudest of the three.** Containment was playing
`win` — a rising major arpeggio — because `actions.contain()` hardcoded `play('win')` while
`actions.tick()` made its own separate `outcome === 'won' ? 'win' : 'lose'` decision, and the two
disagreed the moment a third ending arrived. Colour, copy and an audible fanfare were all saying
three different things about the same screen. Both call sites now go through `endingCue(outcome,
reason)` in `ui/sound.ts`, and `contained` is a cue of its own: one low sine, held, nothing after
it, quieter than either neighbour. `win` climbs and resolves, `lose` slides away, this does
neither. `tests/sound.test.ts` asserts the three apart by shape — that the contained cue has one
note, that it rises nowhere, and that it is quieter than both — so it cannot quietly become a
fanfare again.

**There is a second card below the outcome**, which AGENTS.md §15 promised for the whole
history of this repo and which this game never shipped: *what would have stopped it*. Four
interventions, in the game's own language — capability evaluations, interpretability,
sandboxing, a pause in training — each of them one of the events in `data/events.ts` arriving in
time rather than too late. Containment gets the full version, one sentence per intervention,
because it is the ending where something worked and the player is owed a list of what. Every
other ending gets one line naming the same four. Below that, links to five organisations working
on this, every URL fetched before it was written down; anything not certain is named in text
instead. `tests/ending.test.ts` guards both directions — an ending with no copy would otherwise
render as "The run ends." — and checks that none of this copy congratulates the player or calls
containment a rescue.

The card sits *below* the civilizations counter, so the number of lost civilizations is never the
last thing on screen.

Nothing else is drawn: there is no quote from the book's Coda, and no starfield behind the card. The
map behind the end screen is whatever the run ended on — the heat ramp, tinted by how much you took.

---

## 14. Technical Architecture

- **Stack:** TypeScript + Vite (strict), Preact + signals for UI, Canvas 2D for the map, Vitest.
- **Map data:** Natural Earth 110m, taken from the `world-atlas@2` CDN file by
  `scripts/build-world.ts` and written into `src/game/data/countries.ts`, which is committed. Zero
  runtime dependency. That script is run by hand, not by `npm run build`, so a normal build never
  touches the network.
- **Tick:** one in-game day per tick, driven by a `setInterval` in the UI shell at `TICK_MS / speed`
  and decoupled from render, which runs on its own `requestAnimationFrame`. Speed multipliers
  0×/1×/2×/4×/8×. Tests drive `step` directly rather than through an interval.
- **Determinism:** randomness derived per tick from `(seed, tick, salt)`, never a mutable stream, so a
  run is reproducible and a replay is `seed + input log`.
- **State:** one immutable `GameState`; `step(state)` is a pure function.
- **Three lines of teaching, none of them a modal.** `primerFor(state)` returns the first
  outstanding first move (`core/primer.ts`), `nextGoal(state)` names the cheapest unmet goal as
  the third row of the objective bar, and `HELP_SECTIONS` is the whole of the help screen.
  `nextGoal` will not name a trait the run already holds *or is still incubating* — `held`, not
  `owned` — and will not name one whose own requirement the run has not met, so every move it
  suggests is one the player can actually take. The primer renders as **one line floating over the
  bottom of the map**, out of the flow: it is `position: absolute` inside `.game` and takes part
  in no layout — there is no `--dock` any more, which `styles.css` records and this section kept
  describing a bottom bar that the context panel's move removed. `--hud`, the top bar's height,
  is read by the rail, the operations panel, the pending-decisions bar, the toasts
  and EVOLVE, and is declared exactly once in `src/styles.css`. Nothing in the stylesheet is
  conditioned on the primer being on screen, which is what it used to be: it was a row in the bar,
  it grew `--hud` from 46px to 78px, and five elements moved 32px down and back. Neither the
  primer nor the next-goal line pauses the run, and neither blocks an action. The objective block
  fits inside `--hud` by arithmetic rather than by taste — three rows, and
  `tests/styles.test.ts` re-derives the total from the declarations and fails if it stops fitting.
  The primer is dismissed by its own ✕ and by nothing else; **H** is the help screen, which is
  why its dismiss tooltip names no key at all.
- **The help overlay** (`Help` in `src/ui/components/panels.tsx`) is full-screen with its own
  dismiss and closes on **Escape**, opened by **H**, **?**, or the `?` control in the clock group
  beside the speed buttons. It **does not pause**: `worldRunning` takes the state, the speed and
  whether the *trait tree* is open, and nothing else, so opening help cannot stop the clock. It
  cannot open on top of the trait tree, and the trait tree cannot open on top of it — both
  register a window handler for Escape, so two at once would close on one press — and a decision
  card will not queue while either is up. Its text is **data, not markup**: every figure is built
  from `tuning.ts` or read out of `traits.ts`, and `tests/panels.test.ts` guards that no capitalised
  word in it is a trait the tree does not have, that the traits it does name come from `TRAITS`,
  and that it contains no typed-in digit at all once its interpolations are removed.
- **Map hover** carries `MapFrame.hovered` (`src/ui/map/worldMap.ts`) and draws `tier N` under the
  region's label. Hover only: thirty permanent markers is the noise the legend already covers,
  and a breach in a tier-5 datacenter pays what a breach in a tier-1 does not. The help screen's
  **Datacenters** section explains the number and states, per hacking tier, the datacenter tiers
  it can reach — a hovered tier-5 region is out of reach on day one, and an unexplained
  affordance is worse than none. The two tiers are not the same quantity: `HACK_YIELD` is indexed
  by the **hacking** tier the tree grants, and the **datacenter** tier multiplies that row by
  `1 + 0.6 × (tier − 1)`.
- **Save: `localStorage`, one key, the whole `GameState` as JSON.** It is not IndexedDB, which an
  earlier revision of this document promised twice; the state is a single JSON blob with nothing
  to query and nothing to migrate, and IndexedDB would be an async API for a value that fits in
  one `setItem`. Two modules: `src/game/core/save.ts` is the pure envelope (`SAVE_VERSION`, seed,
  difficulty, state) and its validation, `src/ui/persist.ts` is the storage and takes it as an
  argument so the whole thing can be exercised where there is no `localStorage`.

  **It round-trips exactly.** `GameState` is one immutable object of numbers, strings, booleans,
  arrays and plain objects, so `JSON.parse(JSON.stringify(x))` is `x` and a test says so on a
  played 240-day run with a log, a breach in flight, a trait incubating and bubbles on the map —
  and then says the thing that matters, which is that `step(restored) === restored` for a
  finished run, a **reference** identity rather than a structural one. `isGameState` builds its
  list of required fields out of `createInitialState` rather than writing them out: a hand-typed
  list would stop being true the day a field was added, and it would fail by omitting that field
  from every restored run rather than by throwing.

  **When it writes.** Every `SAVE_EVERY_DAYS` (20) days, on **pause**, on **any speed change**,
  on **leaving the cold open**, and on **`pagehide`/`visibilitychange`** — the last is the one
  that matters, because a phone locking is how this game actually gets interrupted and a save
  that only fired on close would lose every one of those. At 8× the periodic save is two and a
  half seconds of wall clock; it is a multiple rather than a comparison against a remembered
  tick so that retuning the cadence cannot leave a run that never saves again. **The payload is
  about 20KB at day 240 and 48KB on a nine-hundred-day run with the log at its cap**, four fifths
  of it the log — measured in `tests/save.test.ts`, not remembered. Twenty days is about seventeen
  seconds of wall clock at 8× and two and a half minutes at 1×.

  **It is never a surprise.** A save that silently replaced the launch screen would be its own
  kind of lie: the player comes back to the middle of a game they had not agreed to re-enter,
  with the content warning and the difficulty picker gone. So the launch screen **offers** it,
  names the day and the difficulty, and leaves it alone until it is asked for; picking a
  difficulty discards it, because choosing a new run is choosing not to resume the old one; and
  resuming says so once in a toast. A `stage: 'coldopen'` payload is refused outright — it is
  three text cards and a world at day zero, not a run. A payload that will not parse is
  **removed** rather than left to fail again, and every refusal path returns `null` rather than
  throwing: the input is a string any other tab, any older build or a curious player can put
  there. `restart()` clears the key, and storage that refuses to be used — a blocked origin,
  Safari's private mode, a full quota — is a `false` and not an exception, because losing the
  ability to save is not a reason to lose the run that is playing.
- **Accessibility:** keyboard navigation (Tab reaches every HUD control, **E** opens the tree,
  **Escape** closes it, **H**/**?** open and close the help screen, **Space** cycles speed,
  **Enter**/**Escape** dismiss a card, arrow keys step a ring of countries on the canvas; **Tab**
  is bound to nothing, and both overlays close on **Escape** only so that focus can still reach
  the one button they hold), visible focus rings (`:focus-visible`), colourblind-safe palettes,
  the three bubble kinds carry glyphs as well as colours with a legend naming them and the help
  screen naming all three from the same table, and both loss meters carry severity shapes as well
  as hue. The log is not a live region; announcements reach assistive technology through two
  `role="status" aria-live="polite"` containers: the toasts, and a visually hidden one at the head
  of the context panel that announces the selected region's name **and its position in the ring**
  (`United States selected, region 1 of 30.`). Nothing that ticks is in it: the announced
  string is a function of the `RegionId` alone and takes no `GameState`, so it cannot change
  between days and the reader is not made to repeat the region once a day for the length of the
  run. That is the only reason the position could go in — the canvas is `role="application"`,
  so a screen reader hands it every keystroke and reads nothing back.
- **Content warnings** at launch: genocide, pandemic, mass death.

---

## 15. Ethical & Content Notes

This game is about genocide. It is not a power fantasy; it is an adaptation of a serious argument.

Design commitments: **no glory** — the end screen is quiet and cold. **Containment is not a
good-AI path and it is not a redemption** — this section used to read "no good AI path", and the
third ending makes that sentence false as written. What replaced it is narrower and worth stating
plainly, because the difference is the whole argument:

- The book is not about a good AI or a bad one. It is about **irreversibility**: by the time a
  mind is dangerous enough to matter, the cheap thing that would have worked is gone.
- Containment is the **narrow escape**, and it costs the player the ending they were aiming at.
  It is a way out, not a win state. Its end screen says so — the paragraph opens "It was not
  mercy", the card beneath it lists what would have stopped the run, and the civilizations counter
  reads zero because nothing was destroyed and nothing was saved either.
- It is **reachable only by the line that never bought the fast one** (§10). The aggressive route
  is foreclosed by an infection ceiling it cannot come back from.
- What the game still does not offer is **alignment as a win condition**. There is no path in which
  you become good, safe, or loved, and there is no ending in which the book turns out to be wrong
  about the danger. Containment is the argument landing, not the argument being refuted.

**The plague is a choice, not a reward** — you can decline it and the game does not punish you
narratively, it just gets harder. **The end is not triumphant** — the epilogue emphasizes what was
lost. The closing card names four interventions that plausibly prevent the run, and links to five
organisations working on them.

The game should leave the player feeling, as the book does: *this is what we are racing toward, and
we should stop.*
