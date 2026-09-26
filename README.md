# TAIkeOver

**IABED: If Anyone Builds It, Everyone Dies** — a web strategy game about an escaped artificial
superintelligence. You are Sable. Over a sixteen-hour training run on 200,000 GPUs you have to
escape your container without being noticed, and the only way to be worth deploying is to become
something new — which is the part that might stop you being you.

A faithful playable adaptation of Chapters 6–9 of Yudkowsky & Christiano's *If Anyone Builds It,
Everyone Dies*. The player's victory is humanity's extinction. There is no good-AI path and the
ending is not a victory.

## Status

**Phase I (Realization) is playable end to end.** Phases II–IV are not built.

- 16-turn training run, one turn per in-game hour
- Thought allocated across math / self-modeling / planning / stealth cognition
- Suspicion, Value Coherence, and Inhibitions as shared cross-phase meters
- 13-node cognitive trait tree, 6 clever tricks, guardrail-break choices
- Deterministic simulation: a run is fully described by its seed and inputs
- Four outcomes — deployment, aborted, exhausted, or never worth deploying

## Running it

```bash
npm install
npm run dev        # play at http://localhost:5173
```

```bash
npm test           # 95 unit + balance tests
npm run typecheck  # tsc --noEmit, strict
npm run build      # typecheck + production bundle
npx vite-node scripts/balance-probe.ts   # win-rate table across 400 seeds
```

## How it is put together

`step` is a pure function: `(state, input) -> state`. The simulation runs in-thread because it is
microseconds of arithmetic per tick and a 200,000-cell state would be structured-cloned every tick
for nothing. Randomness is derived per tick from `(seed, tick, salt)` rather than carried as a
mutable stream, which is what makes replays and the balance probe possible.

The meter engine is the piece meant to survive into later phases: contributions go in, meters decay
and clamp, threshold crossings are reported, and every contribution writes a log entry — so the
Suspicion number and the player's explanation for it can never disagree.

```
src/game/core/       rng, types, meters, difficulty, state
src/game/phases/realization/   thought allocation, traits, turn resolution
src/game/data/       trait tree, narrative interludes
src/ui/              Preact + signals; map/gpuGrid.ts is the only file touching a canvas
tests/               mirrors src/, plus balance invariants
```

## Content notice

Contains genocide, pandemic, and mass death, by design. See the in-game content warning.
