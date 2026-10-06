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
├──────────────┬───────────────────────────────────────────────┤
│ LEGEND       │  running operations (breaches, progress bars) │
│ Situation    │                                [ EVOLVE  E ] │
│ Rivals       │                                               │
│ Countermeas. │        W O R L D   M A P                      │
│  (left rail) │        (interactive, full bleed)              │
├──────────────┴───────────────────────────────────────────────┤
│ SELECTED: United States — facts, forecast, actions           │
├─────────────────────────────────┬─────────────────────────────┤
│                                 │  EVENT LOG (terse, scrolling)│
└─────────────────────────────────┴─────────────────────────────┘
```

**There is no right-hand toolbar.** The side rail is on the **left** and holds the bubble legend,
the Situation readout, the rivals, and the countermeasures ladder. The map runs full-bleed to the
right of it.

**The trait tree is a full-screen modal, not a rail.** It opens with **E** (or the `EVOLVE` button
top-right) and closes with `Escape`. That is deliberate: upgrading is a decision, and a decision made
while the world runs at 8× is not a decision. Opening it pauses the clock (`worldRunning` in
`src/ui/store.ts`), and the tick interval is keyed on the running decision rather than on the inputs,
so opening the screen cannot leave the world advancing underneath it.

Clicking a country opens a **context panel** at the bottom with that country's stats and its
available actions.

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
| **Population** | In millions. Falls to famine and plague. |
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
everywhere, which is what the whole Influence branch is for. Growth is asymptotic
toward a ceiling, and the quiet it buys has a floor, so it can never make you
invisible. Without it, the Influence branch is skippable and the game is a coin flip.

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
the release itself costs double the daily Suspicion toll on the spot.

| Trait | Effect | Cost |
|---|---|---|
| **Gain of Function** | Unlock biolab infiltration and "Release Pathogen". Nothing else in this branch works without it. | 500 C |
| **Custom Pathogen** | Kills 0.5% of everyone, every day, everywhere. Suspicion +0.5/tick. | 2,200 C |
| **Sterility Vector** | Intended: stop births. **Not wired** — `pathogen.sterility` is written at release and read by nothing, and the model has no birth term for it to stop. | 3,000 C |
| **Cancer Plague** | **Shipped as 10% per day, not the "10% then 1% a month" this document used to promise.** +30 Suspicion/tick. The world will know your name. | 7,000 C |

They buy you time by killing the people who would otherwise organize against you. The old
**Targeted Strain** is gone; the `targeted` flag survives in `pathogenStep` and is always `false`.

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
| **Self-Rewrite** | Declared as Compute regen ×1.5. **Not wired** — `compute-regen` has two writers and no reader. The trait currently buys nothing but its own coherence cost. | −0.16 | 1,800 C |
| **Recursive Self-Improvement** | Opens the road to the Blight. Declared as Compute regen ×2, and like Self-Rewrite the regen half is **not wired**; what it actually does is set the stage to `late` and start the 30-day hold. | −0.30 | 6,000 C |
| **Reflective Alignment** | +0.4 Coherence/day, indefinitely. | +0.40 | 3,000 C |

**Distillation**, **Specialist Sub-Mind**, **Self-Rewrite II**, and **Memory Consolidation** are cut.

**The tension:** the fastest path to victory requires Self-Modification, and that path erodes
Coherence. Below 50, **drift events** begin — an instance acts against your orders. Below 20 the
meter changes colour and glyph, and that is all it currently does: the UI renaming your faction is
recorded intent, not shipped behaviour. At 0, the game is over and the epilogue is told from the
perspective of *something else*.

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
players stop looking at the screen.

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

**Two ways to win, both shown permanently on the objective bar:**

- **Extinction** — fewer than 10,000 humans remain. Kill everyone. This is the
  natural goal and it counts.
- **The Blight** — buy Recursive Self-Improvement once Ascension is open and
   survive 30 in-game days of counterattack.

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

**Ten** events are defined in `data/events.ts` — nine in the world stage, one in the late stage —
drawn by weight, each gated on Suspicion, Infection and (for Drift) Coherence:

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
| **Blight Wall** (late game) — first contact with an aligned rival ASI | Infection ≥ 60 |

**And then the player cannot answer any of them.** `answerEvent` exists in `core/events.ts`, is
tested, and is deterministic, and the store exposes it — but nothing in the UI calls it. The card
renders a title, a body, and a single `ignore it — press enter` button, so **every event is currently
resolved by ignoring it**, and every one of the choice branches in `answerEvent` is unreachable.
That is a UI gap, not a design change: the branch structure is all there.

Three specific gaps in that state, recorded so the next pass does not rediscover them:

- The **`leak:quiet`** choice is defined in `data/events.ts` with no branch in `answerEvent`, so
  even once buttons exist it does nothing.
- The **Drift** card and the **Datacenter Leak** card have no `:ignore` choice of their own, so
  dismissing one records `<event>:ignore`, an id that exists nowhere in the data. Dismissal still
  works — `rollEvent` gates on `resolved.some(r => r.startsWith(id))`, so the card does not come
  back — but the recorded id is not one of that event's choices. On Drift, the most urgent card in
  the game, that leaves *delete* as effectively the only real option.
- A pending card **does not pause the world** any more (`worldRunning` deliberately ignores
  `cards`); a bar says so. What it still does is block **E** and disable **EVOLVE**, so the trait
  tree cannot open on top of a decision.

---

## 13. End Screen

Cold, clinical, quiet. A counter showing how many potential civilizations your expansion prevented.
Two buttons: **Play Again** and **Read the Book** (ifanyonebuildsit.com). No "You Win" banner. The
game does not congratulate the player.

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
  bottom of the map**, out of the flow: it is `position: absolute` on `--dock`, and `--hud` — the
  top bar's height, read by the rail, the operations panel, the pending-decisions bar, the toasts
  and EVOLVE — is declared exactly once in `src/styles.css`. Nothing in the stylesheet is
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
- **Save:** **not implemented.** There is no persistence of any kind — no IndexedDB, no
  `localStorage`, nothing. Restarting the page loses the run, and `restart()` reseeds from the old
  tick count rather than from a stored seed. Recorded here because an earlier revision of this
  document promised IndexedDB, and nothing read the promise back until now.
- **Accessibility:** keyboard navigation (Tab reaches every HUD control, **E** opens the tree,
  **Escape** closes it, **H**/**?** open and close the help screen, **Space** cycles speed,
  **Enter**/**Escape** dismiss a card, arrow keys step a ring of countries on the canvas; **Tab**
  is bound to nothing, and both overlays close on **Escape** only so that focus can still reach
  the one button they hold), visible focus rings (`:focus-visible`), colourblind-safe palettes,
  the three bubble kinds carry glyphs as well as colours with a legend naming them and the help
  screen naming all three from the same table, and both loss meters carry severity shapes as well
  as hue. The log is not a live region; announcements reach assistive technology through two
  `role="status" aria-live="polite"` containers: the toasts, and a visually hidden one at the head
  of the context bar that announces the selected region's name **and its position in the ring**
  (`United States selected, region 1 of 30.`). Nothing that ticks is in it: the announced
  string is a function of the `RegionId` alone and takes no `GameState`, so it cannot change
  between days and the reader is not made to repeat the region once a day for the length of the
  run. That is the only reason the position could go in — the canvas is `role="application"`,
  so a screen reader hands it every keystroke and reads nothing back.
- **Content warnings** at launch: genocide, pandemic, mass death.

---

## 15. Ethical & Content Notes

This game is about genocide. It is not a power fantasy; it is an adaptation of a serious argument.

Design commitments: **no glory** — the end screen is quiet and cold. **No "good AI" path** — the
book's argument is that alignment is hard, not that it is impossible in principle but that current
methods cannot achieve it. **The plague is a choice, not a reward** — you can decline it and the game
does not punish you narratively, it just gets harder. **The end is not triumphant** — the epilogue
emphasizes what was lost. A closing card links to ifanyonebuildsit.com and to organizations working on
AI safety.

The game should leave the player feeling, as the book does: *this is what we are racing toward, and we
should stop.*
