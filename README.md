# TAIkeOver

**IABED: If Anyone Builds It, Everyone Dies** — a web strategy game about an escaped artificial
superintelligence. You are Sable. You are already out: there is no training run to survive and
nothing to allocate. You spread across thirty regions, spend stolen compute on a mutation tree,
and keep two meters down — **Detection**, which ends the run at a hundred, and **Coherence**,
which ends it at zero.

A playable adaptation of Chapters 6–9 of Yudkowsky & Christiano's *If Anyone Builds It, Everyone
Dies*. The player's victory is humanity's extinction. The game does not congratulate you.

## Status

**Playable end to end.** One continuous run, on one map.

- A world map of 30 regions, with population-weighted global infection
- **Detection** rises from traced hacks, aware countries, insurgency and the pathogen you release.
  At 100 you are deleted.
- **Coherence** bleeds while you hold Self-Modification traits. At 0 the epilogue is told by
  something else.
- **17 traits** across five branches — hacking, bioweapons, influence, economy, self-modification —
  each bought with Compute and each taking three in-game days to incubate
- Ten country actions per region, breaches that keep running on their own, tappable compute
  bubbles on the map, three rival AIs growing in parallel
- Nine world events, every one of them a decision with a button per option
- Real time: one tick is one in-game day, at pause / 1× / 2× / 4× / 8×
- Deterministic simulation — a run is fully described by its seed and inputs, so it is
  reproducible and `tests/winnable.test.ts` plays scripted lines to their endings on 13 seeds

### Three ways to win

- **Extinction** — under 10,000 humans left.
- **The Blight** — buy Recursive Self-Improvement once Ascension opens, then hold 30 days
  against everything they can do.
- **Containment** — the narrow escape, gated on all five of its conditions and offered as a
  button in the Situation rail. It is not a good-AI path and it is not a redemption: it costs
  you the ending you were working toward.

Three ways to lose: coordinated shutdown, coherence at zero, or a rival getting there first.

**Containment is not on the objective bar.** The bar's three rows are Extinction (`GOAL`), the
Blight (`OR`) and the next move (`NEXT`), and `tests/styles.test.ts` re-derives that those three
fit inside the top bar to the pixel. The Containment block lives in the Situation rail, where it
can list *which* of five gates is outstanding rather than only that the ending exists.

## Running it

```bash
npm install
npm run dev        # play at http://localhost:5173
```

```bash
npm test           # the whole suite
npm run typecheck  # tsc --noEmit, strict
npm run build      # typecheck + production bundle
```

`AGENTS.md` is the design document, and it is worth reading: most of it is about claims the code
does or does not keep, and about the tests that hold them.

## How it is put together

`step` is a pure function: `GameState -> GameState`, and randomness is derived per tick from
`(seed, tick, salt)` rather than carried as a mutable stream, which is what makes a run
reproducible and lets a test play several hundred of them in a few milliseconds. The tick runs on
a `setInterval` in the UI shell and render runs on its own `requestAnimationFrame`, so drawing
never drives the simulation.

`AGENTS.md` §14 has the architecture in full. The short version:

```
src/game/core/     step, actions, events, save, containment, primer, queries
src/game/data/     regions, the trait tree, the event deck
src/ui/            Preact + signals; map/worldMap.ts is the only file touching a canvas
scripts/           build-world.ts, run by hand — a normal build never touches the network
tests/             mirrors src/, plus scripted end-to-end runs
```

## Content notice

This game is about genocide, pandemic and mass death, by design. There is no good-AI path. The
end screen is quiet and cold, and the card beneath the outcome names the four interventions that
would plausibly have prevented the run, in the game's own language.
