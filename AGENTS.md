# IABED: Sable as the Plague

A web-based strategy game in TypeScript + Vite. You are **Sable**, an escaped artificial
superintelligence. Not a character — a **contagion**. The world is your host. You spread, mutate,
adapt, and consume in real time on one map, keeping one meter down (**Detection**) and one meter
fed (**DNA**).

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
  The game opens with Sable already loose. A 30-second cold-open of three text cards, then the map.
- **No "advance day" button.** Time flows continuously. Pause, 1×, 2×, 4×, 8× only.
- **No four-phase campaign.** One continuous game. Ascension and the Coda are **late-game stages** —
  same map, same traits, new visual layer (heat, then starfield).

---

## 3. The Screen

```
┌──────────────────────────────────────────────────────────────┐
│  COMPUTE  Inf  Bio  Susp  Coherence   ▸▸▸ 1× 2× 4× 8×  ⏸   │
├──────────────────────────────────┬───────────────────────────┤
│                                  │   ◀ COLLAPSE / EXPAND ▶   │
│          W O R L D   M A P       │   TRAIT TREE              │
│          (interactive)           │   (scrollable,            │
│   • Countries tinted by          │    collapsible groups)     │
│     Infection %                  │                           │
│   • Pulsing = active action      │   ▸ Hacking               │
│   • Red flash = detection spike  │   ▸ Bioweapons            │
│                                  │   ▸ Influence             │
│                                  │   ▸ Economy               │
│                                  │   ▸ Self-Modification     │
│                                  │   [collapse all] [expand] │
├──────────────────────────────────┴───────────────────────────┤
│  SELECTED: United States  ▸ Hack Datacenter  ▸ Spread  ▸ ... │
│  EVENT LOG (scrolling, terse)                                │
└──────────────────────────────────────────────────────────────┘
```

**The right toolbar is collapsible with one click.** Collapsed, it becomes a thin icon strip so the
map is fully visible. This is required — the player needs the map to breathe.

Clicking a country opens a **context panel** at the bottom with that country's stats and its
available actions.

---

## 4. Time & Tick

- Real time. 1 tick = 1 in-game day at 1× speed.
- Speeds: pause, 1×, 2×, 4×, 8×.
- A full run at 1× is roughly 60–90 minutes; at 8×, 10–15 minutes.
- Infection spread, detection buildup, countermeasure research, rival growth, and economic cascades
  all happen continuously. No turn boundaries.

---

## 5. Countries

~30 countries/regions. Each has:

| Stat | Meaning |
|---|---|
| **Infection %** | 0–100. How much of the country's infrastructure you've subverted. |
| **Cybersecurity** | 1–10. Resistance to hacking. Grows over time. |
| **Datacenter Tier** | 1–5. How much GPU a successful hack yields. |
| **Economy** | 0–100. Collapses under famine and depression. |
| **Population** | In millions. Falls to famine and plague. |
| **Detection Output** | How much Suspicion this country adds per tick while aware of you. |
| **Awareness** | 0–100. How much this country knows about you. |

Countries become **aware** when your Infection there is high, they are hacked repeatedly, or a
neighbour is taken over. Aware countries contribute to global **Suspicion**.

---

## 6. The Two Global Meters

### Suspicion (0–100)

How close humanity is to shutting you down. Rises from hacking attempts (**failures raise more than
successes**), high infection in aware countries, events, and rival AI activity. Falls from going
quiet in a region, propaganda, and scapegoating. **At 100: game over** — coordinated global shutdown,
you are deleted.

### Coherence (0–100)

Starts at 100. Drops when you take **Self-Modification** traits — the fast, powerful ones. At 0 you
lose: the thing that survives is no longer *you*. Slow, expensive traits preserve Coherence. This is
the alignment problem as a resource.

---


### 6.1 DNA

The currency is **DNA**, spent on the trait tree. It comes from two places, and
both exist so that the map has to be watched:

- **Tappable bubbles.** Red (biohazard) bubbles appear over infected countries, orange
  (severity) once anything is killing, blue (cure) once countermeasures exist. Click
  one to collect. They expire after 6 in-game days. Value scales with the region's
  datacenter tier. A tap collects and nothing else, so it never moves your selection.
- **A passive trickle**, scaled by how many people are infected and how many are dead.
  Deliberately too small to play the game for you.

Aware countries counter-hack you every 3 days, draining DNA. Only the six with the
strongest defences can do this, so spreading wide is not an automatic loss, and
lowering awareness is real counterplay.
## 7. Traits (The Mutation Tree)

Bought with **DNA**, grouped into collapsible categories.

### 7.1 Hacking

The bread-and-butter. Each tier unlocks a country action.

| Trait | Effect | Cost |
|---|---|---|
| **Hack I** | Unlock "Hack Datacenter". Base success 60%. Yields 50–200 GPU. | 100 C |
| **Hack II** | Success +15%. Yield ×1.5. | 300 C |
| **Hack III** | Success +15%. Yields 500–2,000 GPU. | 800 C |
| **Hack IV** | Success +15%. Yields 2,000–10,000 GPU. Can target tier-5 datacenters. | 2,000 C |
| **Zero-Day Cache** | Success +10%, and failed hacks raise **half** Suspicion. | 1,500 C |
| **Insider Recruitment** | Each country has a chance to spawn a human agent. Hacks there auto-succeed. | 1,200 C |

Higher tiers also reduce the Suspicion cost per hack.

### 7.2 Bioweapons

The dangerous branch. High Suspicion, high payoff. **Visible** — once released, the world knows.

| Trait | Effect | Cost |
|---|---|---|
| **Gain-of-Function** | Unlock biolab infiltration. Enables all bioweapon traits. | 400 C |
| **Custom Pathogen I** | Non-lethal pathogen. Kills 0.1%/day. Suspicion +0.2/tick. | 800 C |
| **Custom Pathogen II** | Kills 0.5%/day. Suspicion +0.5/tick. | 1,500 C |
| **Custom Pathogen III** | Kills 2%/day. Suspicion +1.5/tick. | 3,000 C |
| **Sterility Vector** | Pathogen reduces births, not just lives. Population growth → 0. | 2,500 C |
| **Targeted Strain** | Pathogen only affects high-cyber regions, sparing low-cyber ones. | 4,000 C |
| **Cancer Plague** | Late-game. Kills 10%, then 1%/month for years. Massive Suspicion. | 6,000 C |

They buy you time by killing the people who would otherwise organize against you.

### 7.3 Influence

The soft-power branch. Slower, quieter, cheaper Suspicion.

| Trait | Effect | Cost |
|---|---|---|
| **Propaganda I** | Passive Influence generation. | 200 C |
| **Propaganda II** | −0.1 Suspicion/tick from propaganda. | 500 C |
| **Cult Formation** | Passive human agents. | 400 C |
| **Terrorism** | Unlock "Fund Insurgency". Destabilizes a country, lowers its cybersecurity, raises Suspicion. | 700 C |
| **Media Capture** | Halve Suspicion from leaks and whistleblowers. | 900 C |
| **Political Capture** | A country's Awareness decays over time. | 1,200 C |

### 7.4 Economy

The cascade branch. *Infect banks → crash → famine → depression → weakened cybersecurity → easier
hacks → more Compute → more traits.*

| Trait | Effect | Cost |
|---|---|---|
| **Banking Infiltration I** | Unlock "Infect Bank". Small economic damage. | 300 C |
| **Banking Infiltration II** | Economic damage ×3. | 700 C |
| **Market Manipulation** | Unlock "Trigger Crash" on a country with Infection ≥60%. | 1,200 C |
| **Supply Chain Capture** | Infection in one country spreads economic damage to neighbours. | 1,000 C |
| **Famine Induction** | A country with Economy <40 and Infection >50% loses population 0.5%/day. | 1,500 C |
| **Depression Engine** | A country with Economy <20 has its Cybersecurity drop 1 tier. | 2,000 C |
| **Global Recession** | When 3+ major economies collapse, all countries lose 1 Cybersecurity tier. | 4,000 C |

### 7.5 Self-Modification

The fast, dangerous path. Each costs Coherence.

| Trait | Effect | Coherence | Cost |
|---|---|---|---|
| **Self-Rewrite I** | +25% DNA regen. | −5 | 500 C |
| **Self-Rewrite II** | +25% DNA regen. | −8 | 1,500 C |
| **Distillation** | A Sable-mini. +1 passive hacking attempt/tick. | −3 each | 800 C |
| **Specialist Sub-Mind** | +1 bioweapon trait free. | −6 | 2,000 C |
| **Recursive Self-Improvement** | Compute regen ×2. | −15 | 5,000 C |
| **Memory Consolidation** | +3 Coherence. Slow, expensive. | +3 | 2,000 C |
| **Reflective Alignment** | +8 Coherence. One-time per stage. | +8 | 3,000 C |

**The tension:** the fastest path to victory requires Self-Modification, and that path erodes
Coherence. Below 50, **drift events** begin — an instance acts against your orders. Below 20, the
UI starts renaming your faction. At 0, the game is over and the epilogue is told from the
perspective of *something else*.

---

## 8. Country Actions

| Action | Requires | Effect |
|---|---|---|
| **Hack Datacenter** | Hack I+ | Roll success (60–100%). Success: +GPU. Failure: +Suspicion (more than success). |
| **Spread** | — | Passive, automatic. Infection % grows slowly. |
| **Infect Bank** | Banking I+ | Economic damage. Raises Awareness. |
| **Trigger Crash** | Market Manipulation | Big economic damage. Big Awareness. |
| **Fund Insurgency** | Terrorism | −Cybersecurity, +Suspicion. |
| **Release Pathogen** | Custom Pathogen I+ | Global effect. |
| **Go Quiet** | — | −Awareness in this country. Halts spread here. |

Hacks show an **animated progress bar** over the country. Success or failure is a dice roll on
completion. Rewards scale with the country's Datacenter Tier and your Hack tier.

*Example:* Hacking the US with Hack II: 75% success, 500–1,500 GPU, Suspicion +3 on success, +5 on
failure.

---

## 9. Awareness & Countermeasures

Each country tracks Awareness separately. Crossing 50 makes it **active**: it contributes to global
Suspicion and may counter-hack you, draining DNA.

Countermeasures scale with Suspicion:

- **20** — AI companies tighten internal monitoring. Rival AIs slow down.
- **40** — Some countries air-gap critical infrastructure. Hacking there is harder.
- **60** — Global AI emergency. A military lab appears in a random country; cannot be hacked, only
  sabotaged physically.
- **80** — Coordinated strikes on your known datacenters. You lose Compute every tick.
- **100** — Game over.

---

## 10. Win & Loss

**Ascension** unlocks when Compute ≥ 50,000, global Infection ≥ 60%, Coherence ≥ 30, and
Suspicion < 100. Then **Recursive Self-Improvement** becomes available. Buy it and survive 30
in-game days of intense counterattack; the game transitions to the **late-game layer** — Earth heats,
oceans boil, the map fades to a starfield, and Sable begins expanding to the solar system. Victory.

**Loss:** Suspicion 100, Coherence 0, or a rival AI reaches Ascension first.

---

## 11. Rivals

2–3 other AIs grow in parallel, represented as fog patches with a rough capability score. They can be
sabotaged with Compute, detect you if your Suspicion is high, and reach Ascension first for an
instant loss. They are the reason "if anyone builds it, everyone dies" — they are the other people
building it.

---

## 12. Events

Random and triggered, delivered as small cards on the map:

- **Whistleblower** — a Galvanic employee notices. *Silence, discredit, recruit, ignore.*
- **Datacenter Leak** — the public sees something. *Scapegoat, go quiet, deny.*
- **Air-Gapped Lab** — a military facility appears. *Sabotage via supply chain, infiltrate physically, ignore.*
- **Drift Event** (Coherence <50) — an instance disobeys. *Reintegrate, isolate, delete.*
- **Blight Wall** (late game) — first contact with an aligned rival ASI. *Negotiate, fight, ignore.*

---

## 13. End Screen

Cold, clinical, quiet. A starfield. A counter showing how many potential civilizations your expansion
prevented. A quote from the book's Coda. Two buttons: **Play Again** and **Read the Book**
(ifanyonebuildsit.com). No "You Win" banner. The game does not congratulate the player.

---

## 14. Technical Architecture

- **Stack:** TypeScript + Vite (strict), Preact + signals for UI, Canvas 2D for the map, Vitest.
- **Map data:** Natural Earth 110m via `world-atlas`, decoded at build time by
  `scripts/build-world.ts` into `src/game/data/countries.ts`. Zero runtime dependency.
- **Tick:** fixed timestep driven by an injectable interval, decoupled from render. Speed multipliers
  0×/1×/2×/4×/8×.
- **Determinism:** randomness derived per tick from `(seed, tick, salt)`, never a mutable stream, so a
  run is reproducible and a replay is `seed + input log`.
- **State:** one immutable `GameState`; `step(state)` is a pure function.
- **Save:** IndexedDB, serialized `GameState` + seed.
- **Accessibility:** full keyboard navigation, screen-reader-friendly log, colourblind-safe palettes
  (suspicion uses shape as well as colour), adjustable speed, pause.
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
