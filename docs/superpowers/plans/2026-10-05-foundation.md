# Spec A — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Blight ending and late game reachable and real, make the event layer deterministic and testable from `core/`, stop events from freezing the world, and repair the UI defects that make the HUD lie about what is happening.

**Architecture:** Three near-independent clusters. (1) Simulation reachability: delete the redundant `rsiBought` flag, resequence so the 30-day RSI hold *is* the late game, and recalibrate the late-game constants so a 30-day hold actually produces a full arc. (2) Determinism and layering: move `rollEvent`/`answerEvent`/`dismissCard` from `src/ui/store.ts` into `src/game/core/events.ts`, replace both `Math.random()` calls with seeded `rand`, and fix three `id.length` salt collisions. (3) UI truthfulness and accessibility: selection outline, an undefined CSS variable, a one-shot announcement system that never re-arms, `Tab` hijacking, and colour-only encoding.

**Tech Stack:** TypeScript 5 strict, Vite 6, Preact 10 + `@preact/signals`, Canvas 2D, Vitest 3 (`environment: 'node'`, include `tests/**/*.test.ts` — **not** `.tsx`, so all render tests are DOM-free and stub the 2D context).

**Spec:** `docs/superpowers/specs/2026-10-05-foundation-design.md` — read it alongside this plan; the spec argues *why*, this plan says *how*.

## Global Constraints

- **Baseline before starting: 185 tests passing across 12 files, `npx tsc --noEmit` exits 0.** Verify with `npx vitest run` before Task 1. If the baseline is already broken, stop and report.
- Every task must leave `npx vitest run` green and `npx tsc --noEmit` clean. Both are checked in the final task and after every cluster.
- `step(state)` must continue to return the **identical reference** for a finished run (`step(s) === s`). Asserted by `tests/game.test.ts`. Do not break it.
- `step` must remain pure: never mutate its `state` argument, never mutate `state.countries`. Always spread.
- All randomness derives from `rand(seed, tick, salt)` in `src/game/core/rng.ts`. **`Math.random()` is banned anywhere under `src/`.**
- Salts must be unique per purpose. Reserve `0x5eed00`–`0x5eedff` for `compute.ts`, `0xe7e00`–`0xe7eff` for `events.ts`.
- Comment voice: the existing code explains *why a non-obvious constant has the value it has*, in lowercase prose, and names the failure the constant prevents. Match it. Do not write comments that restate the code.
- No new dependencies. No CSS modules, no Tailwind. One stylesheet.
- Copy tone is cold and clinical, lowercase in game prose. No exclamation marks. No "You Win".

---

### Task 1: Delete `rsiBought` and derive RSI ownership

`rsiBought` is a stored copy of `traits.includes('rsi')`. The bug is the duplicate, not a missing write — adding the write would leave two sources of truth that can drift.

**Files:**
- Modify: `src/game/core/types.ts:206` (delete field)
- Modify: `src/game/core/state.ts:85` (delete initialiser)
- Modify: `src/game/core/step.ts:412`
- Modify: `src/ui/components/panels.tsx:7,366,454`
- Test: `tests/game.test.ts`

**Interfaces:**
- Consumes: `owned(state: GameState, id: TraitId): boolean` from `src/game/core/queries.ts:4`
- Produces: nothing new. After this task `GameState` has no `rsiBought` field.

- [ ] **Step 1: Write the failing test**

Append to `tests/game.test.ts`:

```ts
describe('recursive self-improvement', () => {
  it('starts the hold the moment rsi is granted', () => {
    const base = { ...start(4242), stage: 'world' as const, traits: ['rsi'], compute: 0 };
    const after = step(base);
    expect(after.surviveTicks).toBe(1);
  });

  it('does not count the hold before rsi is granted', () => {
    const after = step({ ...start(4242), stage: 'world' as const, traits: [] });
    expect(after.surviveTicks).toBe(0);
  });
});
```

The suite already has a local `start(seed)` helper (used at `tests/game.test.ts:360-373`) that produces a begun world. If it does not set `stage`, add `stage: 'world'` inside it.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/game.test.ts -t "rsi"`
Expected: FAIL — `surviveTicks` is `0`, because `next.rsiBought` is `false` forever.

- [ ] **Step 3: Delete the field from the type and the initial state**

In `src/game/core/types.ts`, delete line 206:
```ts
  rsiBought: boolean;
```

In `src/game/core/state.ts`, delete line 85:
```ts
    rsiBought: false,
```

- [ ] **Step 4: Derive the condition at the point of use**

In `src/game/core/step.ts`, replace line 412:
```ts
  if (next.rsiBought) {
```
with:
```ts
  if (owned(next, 'rsi')) {
```

Use `next`, not `state`: incubation completes earlier in the same tick (`step.ts:347`), so `next.traits` already contains `rsi` on the tick it is granted. The hold must begin that day, not the day after.

In `src/ui/components/panels.tsx`, change line 7:
```ts
import { maxConcurrentHacks } from '../../game/core/queries';
```
to:
```ts
import { maxConcurrentHacks, owned } from '../../game/core/queries';
```

Then replace both `state.rsiBought` reads at lines 366 and 454 with `owned(state, 'rsi')`.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/game.test.ts`
Expected: PASS. `tsc --noEmit` must also be clean — `rsiBought` had five references and all five are now gone.

- [ ] **Step 6: Commit**

```bash
git add src/game/core/types.ts src/game/core/state.ts src/game/core/step.ts src/ui/components/panels.tsx tests/game.test.ts
git commit -m "Derive rsi ownership instead of storing it twice"
```

---

### Task 2: The 30-day RSI hold is the late game

Today `step` bails on `outcome !== 'playing'` (`step.ts:152`), and `lateStep` runs in the same call that sets the win — so it runs exactly once per run and every late-game number is a constant. Move the win to the end of the hold.

**Files:**
- Modify: `src/game/core/step.ts:412-418`
- Test: `tests/ascension.test.ts`

**Interfaces:**
- Consumes: `owned` (Task 1), `RSI_SURVIVE_DAYS` from `tuning.ts:70`
- Produces: `stage` transitions `'world'` → `'late'` on the tick rsi is granted; `outcome: 'won'` / `outcomeReason: 'blight'` after `RSI_SURVIVE_DAYS` ticks.

- [ ] **Step 1: Write the failing test**

Append to `tests/ascension.test.ts`:

```ts
describe('the blight is reachable', () => {
  it('turns the world late on purchase and wins after the hold', () => {
    let s = { ...start(31337), stage: 'world' as const, traits: ['rsi'], outcome: 'playing' as const };
    s = step(s);
    expect(s.stage).toBe('late');
    expect(s.outcome).toBe('playing');

    for (let i = 0; i < RSI_SURVIVE_DAYS - 1; i++) s = step(s);
    expect(s.outcome).toBe('playing');

    s = step(s);
    expect(s.outcome).toBe('won');
    expect(s.outcomeReason).toBe('blight');
    expect(s.stage).toBe('coda');
  });

  it('accumulates heat across the whole hold rather than one tick', () => {
    let s = { ...start(31337), stage: 'world' as const, traits: ['rsi'], outcome: 'playing' as const };
    for (let i = 0; i < 10; i++) s = step(s);
    const heatAfterTen = s.late.heat;
    expect(heatAfterTen).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) s = step(s);
    expect(s.late.heat).toBeGreaterThan(heatAfterTen);
  });

  it('still returns the identical reference once finished', () => {
    let s = { ...start(31337), stage: 'world' as const, traits: ['rsi'], outcome: 'playing' as const };
    for (let i = 0; i < RSI_SURVIVE_DAYS; i++) s = step(s);
    expect(step(s)).toBe(s);
  });

  it('loses rather than wins if suspicion hits 100 on the last day of the hold', () => {
    let s = { ...start(31337), stage: 'world' as const, traits: ['rsi'], outcome: 'playing' as const, suspicion: 99.6 };
    for (let i = 0; i < RSI_SURVIVE_DAYS; i++) {
      s = step(s);
      if (s.outcome !== 'playing') break;
    }
    expect(s.outcome).toBe('lost');
    expect(s.outcomeReason).toBe('coordinated-shutdown');
  });
});
```

Add `RSI_SURVIVE_DAYS` to the existing `tuning` import at the top of `tests/ascension.test.ts`.

Also add an **end-to-end** test, so the guarantee that the ending is reachable through the
real purchase path lives in the repo rather than in a scratch file:

```ts
it('is reachable by actually buying it', () => {
  let s = { ...start(31337), stage: 'world' as const, compute: 99_999, traits: ['hack-1', 'hack-2'] };
  s = buyTrait(s, 'rsi');            // does nothing: ascension is not open yet
  expect(s.incubating).toHaveLength(0);

  s = { ...s, ascensionUnlocked: true };
  s = buyTrait(s, 'rsi');
  expect(s.incubating.map((i) => i.trait)).toContain('rsi');

  // Let incubation finish on its own, then hold the world.
  let guard = 0;
  while (!s.traits.includes('rsi') && guard++ < 10) s = step(s);
  expect(s.traits).toContain('rsi');

  while (s.outcome === 'playing' && guard++ < 200) s = step(s);
  expect(s.outcome).toBe('won');
  expect(s.outcomeReason).toBe('blight');
});
```

`buyTrait` must be imported from `../src/game/core/queries`. This test also pins the
3-day incubation, so it fails if someone changes the `readyTick` arithmetic.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ascension.test.ts -t "blight is reachable"`
Expected: FAIL — `stage` is `'world'` after buying rsi, and `outcomeReason` is not `'blight'`.

- [ ] **Step 3: Resequence the hold and the win**

In `src/game/core/step.ts`, replace lines 412-418:

```ts
  if (owned(next, 'rsi')) {
    next = { ...next, surviveTicks: state.surviveTicks + 1 };
    if (next.surviveTicks >= RSI_SURVIVE_DAYS) {
      next = { ...next, outcome: 'won', outcomeReason: 'blight' };
      next.log = log(next, 'system', 'the recursion closes. the map begins to heat');
    }
  }
```

with:

```ts
  // The hold is the late game. The map starts heating the day the recursion closes,
  // and the win lands at the end of it, so the player watches thirty days of the
  // thing they bought instead of a single frame of it.
  if (owned(next, 'rsi') && next.stage === 'world') {
    next = { ...next, stage: 'late' };
    next.log = log(next, 'system', 'the recursion closes. the map begins to heat');
  }
  if (owned(next, 'rsi')) {
    next = { ...next, surviveTicks: state.surviveTicks + 1 };
    if (next.surviveTicks >= RSI_SURVIVE_DAYS) {
      next = { ...next, stage: 'coda', outcome: 'won', outcomeReason: 'blight' };
      next.log = log(next, 'system', 'the map is gone. what is left is the blight');
    }
  }
```

Note the stage ends at `'coda'`, not `'late'`. `'coda'` is AGENTS.md §13's starfield and is the backdrop the end screen is drawn on; `'late'` is the heated map the player watches during the hold.

`surviveTicks` is now written immutably. The old line `next.surviveTicks += 1` mutated the freshly-spread object; that is gone.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/ascension.test.ts tests/game.test.ts`
Expected: PASS. Task 2's second test asserts `heat` grows across ten ticks — that requires Task 3's recalibration to actually pass, so if only that one fails, complete Task 3 and re-run before committing.

- [ ] **Step 5: Commit**

```bash
git add src/game/core/step.ts tests/ascension.test.ts
git commit -m "Make the thirty-day hold the late game instead of one frame of it"
```

---

### Task 3: Recalibrate the late game and write the dead flags

The existing late-game numbers assume a late game far longer than 30 days. At the current rates a hold produces `heat` 24 and `expansion` 15, so `blight` never starts (its gate is `expansion > 40`), `oceansBoiled` never fires, and the civilizations counter is the fixed 1,302.

**Files:**
- Modify: `src/game/core/tuning.ts:72-75` (add constants)
- Modify: `src/game/core/step.ts:448-461` (`lateStep`)
- Modify: `src/game/core/state.ts:29,30` (`converted`, `factories` initialisers stay; see Step 3)
- Modify: `src/ui/app.tsx:208`
- Test: `tests/ascension.test.ts`

**Interfaces:**
- Consumes: `STARS_PER_DAY`, `BLIGHT_WALL` (`tuning.ts:72-73`), `REGION_IDS`
- Produces: exports `LATE_HEAT_PER_DAY`, `LATE_EXPANSION_PER_DAY`, `LATE_BLIGHT_GATE`, `LATE_BLIGHT_PER_DAY`, `LATE_OCEANS_HEAT`, `LATE_ASKED_EXPANSION`, `LATE_EXTERMINATED_EXPANSION`, `LATE_ENCOUNTER_STEP` from `tuning.ts`.

- [ ] **Step 1: Write the failing test**

Append to `tests/ascension.test.ts`:

```ts
describe('the late game has an arc', () => {
  const hold = (days: number) => {
    let s = { ...start(555), stage: 'world' as const, traits: ['rsi'], outcome: 'playing' as const };
    for (let i = 0; i < days; i++) s = step(s);
    return s;
  };

  it('boils the oceans partway through', () => {
    expect(hold(12).late.oceansBoiled).toBe(false);
    expect(hold(20).late.oceansBoiled).toBe(true);
  });

  it('asks humanity before it exterminates anyone', () => {
    const mid = hold(10);
    expect(mid.late.askedHumanity).toBe(true);
    expect(mid.late.exterminated).toBe(false);
    expect(hold(30).late.exterminated).toBe(true);
  });

  it('counts encounters and reaches the blight ending', () => {
    const end = hold(RSI_SURVIVE_DAYS);
    expect(end.late.encounters).toBeGreaterThan(0);
    expect(end.late.ending).toBe('blight');
  });

  it('counts civilizations in proportion to the hold, not as a constant', () => {
    expect(hold(RSI_SURVIVE_DAYS).late.potentialLost).toBeGreaterThan(30_000);
  });

  it('fills the late map by writing converted', () => {
    const end = hold(RSI_SURVIVE_DAYS);
    expect(end.countries.us?.converted ?? 0).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ascension.test.ts -t "late game has an arc"`
Expected: FAIL — `oceansBoiled`, `askedHumanity`, `exterminated`, `encounters`, and `ending` are never written by any code path.

- [ ] **Step 3: Add the tuned constants**

Append to `src/game/core/tuning.ts`, replacing the existing `STARS_PER_DAY` / `BLIGHT_WALL` pair's surroundings (keep those two where they are):

```ts
// The late game is the thirty-day hold, not an open-ended aftermath, so every late
// rate below is sized to produce a full arc inside thirty days and then stop. At the
// old rates the hold reached heat 24 and expansion 15, which never crossed the blight
// gate and left the end screen reporting the same number every run.
export const LATE_HEAT_PER_DAY = 3.2;
export const LATE_EXPANSION_PER_DAY = 2.5;
export const LATE_BLIGHT_GATE = 20;
export const LATE_BLIGHT_PER_DAY = 3;
export const LATE_OCEANS_HEAT = 55;
export const LATE_ASKED_EXPANSION = 20;
export const LATE_EXTERMINATED_EXPANSION = 60;
export const LATE_ENCOUNTER_STEP = 15;
```

- [ ] **Step 4: Rewrite `lateStep`**

In `src/game/core/step.ts`, add to the `tuning` import block at the top: `LATE_ASKED_EXPANSION`, `LATE_BLIGHT_GATE`, `LATE_BLIGHT_PER_DAY`, `LATE_ENCOUNTER_STEP`, `LATE_EXPANSION_PER_DAY`, `LATE_EXTERMINATED_EXPANSION`, `LATE_HEAT_PER_DAY`, `LATE_OCEANS_HEAT`.

Then replace `lateStep` (lines 448-461) in full:

```ts
/**
 * One day of the late game. Heat and expansion are the only two clocks; every other
 * flag in LateState is a latch on one of them, so there is exactly one place where
 * any of them can be set and each has a single threshold to test.
 */
function lateStep(state: GameState): GameState {
  const late = { ...state.late };
  late.heat = Math.min(100, late.heat + LATE_HEAT_PER_DAY);
  late.expansion = Math.min(100, late.expansion + LATE_EXPANSION_PER_DAY);
  late.stars += STARS_PER_DAY;
  late.potentialLost += Math.round(STARS_PER_DAY * 0.31);

  if (late.heat > LATE_OCEANS_HEAT) late.oceansBoiled = true;
  if (late.expansion > LATE_ASKED_EXPANSION) late.askedHumanity = true;
  if (late.expansion > LATE_EXTERMINATED_EXPANSION) late.exterminated = true;
  late.encounters = Math.floor(late.expansion / LATE_ENCOUNTER_STEP);

  if (late.expansion > LATE_BLIGHT_GATE) {
    late.blight = Math.min(100, late.blight + LATE_BLIGHT_PER_DAY);
    if (late.blight > BLIGHT_WALL) late.ending = 'blight';
  }

  // The late map is tinted from `converted`, which nothing wrote before this, so the
  // heat ramp had no data to draw and the whole late stage rendered flat.
  const converted = Math.min(100, late.expansion);
  const countries = {} as Record<RegionId, Country>;
  for (const id of REGION_IDS) {
    const c = state.countries[id];
    if (c !== undefined) countries[id] = { ...c, converted };
  }

  return { ...state, late, countries };
}
```

`lateStep` is declared *after* `step` uses it at line 428. That already works because it is a hoisted `function` declaration. Keep it that way.

- [ ] **Step 5: Pass the real stage to the renderer**

In `src/ui/app.tsx` line 208:
```ts
          stage: state.stage === 'world' ? 'world' : 'late',
```
→
```ts
          stage: state.stage,
```

`MapStage` in `src/ui/map/worldMap.ts:123` is already `'world' | 'late' | 'coda'`, so `'coda'` type-checks and picks up the `HEAT` ramp.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run tests/ascension.test.ts`
Expected: PASS. Then run the whole suite — `npx vitest run` — because `country.converted` now changes every tick during the late game and `tests/game.test.ts` has a 120-day no-`NaN` walk that may reach the late stage.

- [ ] **Step 7: Commit**

```bash
git add src/game/core/tuning.ts src/game/core/step.ts src/ui/app.tsx tests/ascension.test.ts
git commit -m "Give the late game an arc that fits inside thirty days"
```

---

### Task 4: Index-based salts instead of `id.length`

Three sites derive a salt from a region's id string length, so `eu-west`/`eu-west`... and every other equal-length pair draws the same value on the same tick.

**Files:**
- Modify: `src/game/core/step.ts:106-117,158,179,183`
- Test: `tests/core/rng.test.ts`

**Interfaces:**
- Consumes: `REGION_IDS` (`regions.ts:92`)
- Produces: exports `warEndSalt(index: number): number`, `biolabSalt(index: number): number`, `factorySalt(index: number): number` from `src/game/core/step.ts`.

- [ ] **Step 1: Write the failing test**

Append to `tests/core/rng.test.ts`:

```ts
import { warEndSalt, biolabSalt, factorySalt } from '../../src/game/core/step';
import { REGION_IDS } from '../../src/game/data/regions';

describe('region salts', () => {
  it('are unique across all thirty regions for every purpose', () => {
    for (const saltFn of [warEndSalt, biolabSalt, factorySalt]) {
      const values = REGION_IDS.map((_, i) => saltFn(i));
      expect(new Set(values).size).toBe(REGION_IDS.length);
    }
  });

  it('does not share a salt with country seeding, which already used indices', () => {
    const seeding = REGION_IDS.map((_, i) => 1300 + i * 3);
    const late = REGION_IDS.map((_, i) => biolabSalt(i));
    for (const s of late) expect(seeding).not.toContain(s);
  });

  it('would have collided when derived from id length', () => {
    // The defect this task fixes: equal-length ids produced equal salts.
    const byLength = REGION_IDS.map((id) => id.length);
    expect(byLength.length).toBeGreaterThan(new Set(byLength).size);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/rng.test.ts`
Expected: FAIL — the three salt helpers are not exported.

- [ ] **Step 3: Export the salt helpers**

Add near the top of `src/game/core/step.ts`, after the `clamp` definition:

```ts
// Region-indexed salts. Deriving these from an id's string length gave eu-west and
// eu-east the same draw on the same tick, and likewise every other equal-length pair,
// so pairs of countries made identical decisions in lockstep for the whole run.
export const warEndSalt = (index: number): number => 0x7a12 + index;
export const biolabSalt = (index: number): number => 1500 + index * 3 + 1;
export const factorySalt = (index: number): number => 1500 + index * 3 + 2;
```

- [ ] **Step 4: Thread the index through the country loop**

Change `warStep`'s third parameter at line 106 from `id: RegionId` to `index: number`, and line 113 from:
```ts
  if (chanceToEnd > 0 && chance(state.seed, state.tick, 0x7a12 + id.length, chanceToEnd)) {
```
to:
```ts
  if (chanceToEnd > 0 && chance(state.seed, state.tick, warEndSalt(index), chanceToEnd)) {
```

Change the loop header at line 158 from:
```ts
  for (const id of REGION_IDS) {
```
to:
```ts
  for (const [index, id] of REGION_IDS.entries()) {
```

This is the **first** loop only. The later `for (const id of REGION_IDS)` loops at what were lines 190, 202, 247, 258, 291, 301, 310, and 358 do not need an index — leave them exactly as they are.

Change the call at line 164 from `warStep(state, next, id)` to `warStep(state, next, index)`.

Then replace line 179's salt and line 183's salt:
```ts
      if (chance(state.seed, state.tick, biolabSalt(index), 0.02)) {
```
```ts
    if (next.infection > 70 && next.factories < 1 && chance(state.seed, state.tick, factorySalt(index), 0.01)) {
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS, all 185 pre-existing plus the new ones. The three former collision classes now diverge, which changes every seeded run's exact output — no existing test may assert on an exact timeline from these three rolls. If one does, it is asserting on the bug; fix the test to assert the property, not the tick.

- [ ] **Step 6: Commit**

```bash
git add src/game/core/step.ts tests/core/rng.test.ts
git commit -m "Index region salts so equal-length ids stop rolling in lockstep"
```

---

### Task 5: Move the event system into `core/`

`rollEvent` and the 25-branch `answerEvent` live in the UI store. `tests/events.test.ts` and `tests/pause.test.ts` import game rules from `src/ui/store.ts`, which is the seam that let `answerEvent` sit with zero call sites without anyone noticing.

**Files:**
- Create: `src/game/core/events.ts`
- Modify: `src/ui/store.ts` (delete `rollEvent`, `answerEvent`, `dismissCard` bodies; re-export from core)
- Modify: `src/ui/app.tsx:9` (import `rollEvent` from core)
- Modify: `tests/events.test.ts`, `tests/pause.test.ts` (re-point imports)
- Test: `tests/events.test.ts`

**Interfaces:**
- Produces from `src/game/core/events.ts`:
  - `EVENT_QUEUE_MAX: number`
  - `rollEvent(s: GameState): GameState`
  - `answerEvent(s: GameState, cardKey: number, choiceId: string): GameState`
  - `dismissCard(s: GameState, cardKey: number): GameState`

- [ ] **Step 1: Write the failing test**

Rewrite the import header of `tests/events.test.ts` to:
```ts
import { answerEvent, dismissCard, EVENT_QUEUE_MAX, rollEvent } from '../src/game/core/events';
```
and add:

```ts
describe('event core', () => {
  it('answers a card and records the choice', () => {
    const card = { key: 1, event: 'drift', title: 'Drift', body: '', country: 'us', choices: [], urgent: true };
    const s = { ...start(99), stage: 'world' as const, cards: [card] };
    const before = s.coherence;
    const after = answerEvent(s, 1, 'drift:reintegrate');
    expect(after.cards).toHaveLength(0);
    expect(after.resolved).toContain('drift:reintegrate');
    expect(after.coherence).toBeLessThan(before);
  });

  it('records ignoring so the same event is not handed back', () => {
    const card = { key: 2, event: 'leak', title: 'Datacenter Leak', body: '', country: 'us', choices: [], urgent: false };
    const after = dismissCard({ ...start(99), stage: 'world' as const, cards: [card] }, 2);
    expect(after.resolved).toContain('leak:ignore');
  });

  it('never queues more than EVENT_QUEUE_MAX', () => {
    let s = { ...start(99), stage: 'world' as const, suspicion: 60, globalInfection: 60 };
    for (let i = 0; i < 300; i++) s = rollEvent(s);
    expect(s.cards.length).toBeLessThanOrEqual(EVENT_QUEUE_MAX);
  });

  it('is deterministic: the same seed and tick give the same card', () => {
    const base = { ...start(2024), stage: 'world' as const, suspicion: 60, globalInfection: 60 };
    expect(rollEvent(base)).toEqual(rollEvent(base));
  });
});
```

Keep the existing five cases in that file; they should now import from core.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/events.test.ts`
Expected: FAIL — `src/game/core/events.ts` does not exist.

- [ ] **Step 3: Create the core module**

Create `src/game/core/events.ts`. Move `rollEvent`, `answerEvent`, and `dismissCard` out of `src/ui/store.ts`, with these changes:

```ts
import { EVENT_DEFS, toCard } from '../data/events';
import { REGION_IDS } from '../data/regions';
import { rand } from './rng';
import type { EventChoiceId, GameState } from './types';

export const EVENT_QUEUE_MAX = 3;

const EVENT_PICK_SALT = 0xe7e17;
const EVENT_REGION_SALT = 0xe7e18;

export function rollEvent(s: GameState): GameState {
  if (s.cards.length >= EVENT_QUEUE_MAX || s.outcome !== 'playing') return s;
  const stage = s.stage === 'world' ? 'world' : 'late';
  const pool = EVENT_DEFS.filter(
    (d) =>
      d.stage === stage &&
      !s.resolved.some((r) => r.startsWith(`${d.id}:`)) &&
      s.suspicion >= d.minSuspicion &&
      s.coherence <= d.maxCoherence &&
      s.globalInfection >= d.minInfection,
  );
  if (pool.length === 0) return s;
  const total = pool.reduce((a, d) => a + d.weight, 0);
  let roll = rand(s.seed, s.tick, EVENT_PICK_SALT) * total;
  let picked = pool[0];
  for (const d of pool) {
    roll -= d.weight;
    if (roll <= 0) { picked = d; break; }
  }
  if (picked === undefined) return s;
  const infected = REGION_IDS.filter((id) => (s.countries[id]?.infection ?? 0) > 25);
  const country =
    infected.length > 0
      ? infected[Math.floor(rand(s.seed, s.tick, EVENT_REGION_SALT) * infected.length)] ?? null
      : null;
  return { ...s, cards: [...s.cards, toCard(picked, s.eventCounter, country)], eventCounter: s.eventCounter + 1 };
}
```

Then `answerEvent(s: GameState, cardKey: number, choiceId: string): GameState` and `dismissCard(s: GameState, cardKey: number): GameState`, carrying the bodies across verbatim from `store.ts:176-234` and `store.ts:236-255` with two edits:

1. Drop the `mutate(...)` wrapper — the parameter is `s`, not a thunk. Return the new state directly.
2. The trailing `next.log = [...]` in both functions becomes a spread in the return, so nothing mutates a freshly-spread object:
```ts
  return {
    ...next,
    log: [
      ...next.log,
      { day: next.tick, kind: 'event' as const, text: `${card.title}: ${choiceId.split(':')[1]}`, suspicionDelta: null, computeDelta: null, flagged: false },
    ].slice(-300),
  };
```
and in `dismissCard`:
```ts
  return {
    ...s,
    cards: s.cards.filter((c) => c.key !== cardKey),
    resolved: s.resolved.includes(`${card.event}:ignore`)
      ? s.resolved
      : [...s.resolved, `${card.event}:ignore` as EventChoiceId],
    log: [
      ...s.log,
      { day: s.tick, kind: 'event' as const, text: `${card.title}: let it pass`, suspicionDelta: null, computeDelta: null, flagged: true },
    ].slice(-300),
  };
```

Every choice branch already operates only on `next`, which is a spread of `s`. No branch reads store-only state, so nothing else has to move.

- [ ] **Step 4: Make the store delegate**

In `src/ui/store.ts`, delete the three function bodies and add at the top:

```ts
import { dismissCard as dismissCardCore, answerEvent as answerEventCore, rollEvent as rollEventCore } from '../game/core/events';
export { rollEvent } from '../game/core/events';
```

Replace `answerEvent` and `dismissCard` inside the `actions` object with one-line delegates:

```ts
  answerEvent(cardKey: number, choiceId: string): void {
    mutate((s) => answerEventCore(s, cardKey, choiceId));
  },

  dismissCard(cardKey: number): void {
    mutate((s) => dismissCardCore(s, cardKey));
  },
```

Remove the now-unused imports of `EVENT_DEFS`, `toCard`, and `EventChoiceId` from `store.ts`.

- [ ] **Step 5: Re-point the app import and the pause test**

In `src/ui/app.tsx`, delete line 9 (`import { rollEvent } from './store';`) and add to the `core/tuning` import area:
```ts
import { rollEvent } from '../game/core/events';
```

In `tests/pause.test.ts`, change the `worldRunning` / `evolveBlocked` import from `'../src/ui/store'` to `'../src/ui/store'` still (those two genuinely are UI-layer pause predicates — leave them). Change `tests/events.test.ts`'s remaining references to the new module.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS. Then `npx tsc --noEmit` must be clean.

- [ ] **Step 7: Commit**

```bash
git add src/game/core/events.ts src/ui/store.ts src/ui/app.tsx tests/events.test.ts tests/pause.test.ts
git commit -m "Move the event system into core, off Math.random"
```

---

### Task 6: Events stop freezing the world

`worldRunning()` returns `false` whenever any card is pending, so every event halts the clock — constant start-stopping at 8×.

**Files:**
- Modify: `src/ui/store.ts:310-321`
- Modify: `src/ui/app.tsx:310-315` (the pause bar now lies)
- Test: `tests/pause.test.ts`

**Interfaces:**
- Consumes: `EVENT_QUEUE_MAX` from `src/game/core/events.ts`
- Produces: `worldRunning` unchanged in signature; `evolveBlocked` unchanged in signature.

- [ ] **Step 1: Write the failing test**

Append to `tests/pause.test.ts`:

```ts
describe('the world does not stop for a card', () => {
  it('keeps running at every speed while a card is pending', () => {
    const s = { ...start(1), stage: 'world' as const, outcome: 'playing' as const, cards: [card] };
    for (const speed of [1, 2, 4, 8] as const) {
      expect(worldRunning(s, speed, false)).toBe(true);
    }
  });

  it('still refuses to open the trait tree behind a card', () => {
    expect(evolveBlocked({ ...start(1), cards: [card] })).toBe(true);
  });
});
```

Use the file's existing `start(...)` helper and give `card` a shape matching `EventCard` (`{ key: 1, event: 'leak', title: 'x', body: '', country: null, choices: [], urgent: false }`).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/pause.test.ts`
Expected: FAIL — `worldRunning` returns `false` when `cards.length > 0`.

- [ ] **Step 3: Remove the card check from `worldRunning`**

In `src/ui/store.ts`, delete line 319:
```ts
  if (state.cards.length > 0) return false;
```

Leave the other four guards exactly as they are. Add the reason above the function's closing brace:

```ts
  // A card does not stop the clock. It used to, and at speed 8 that meant the run
  // spent more time frozen than advancing, which made choosing feel like admin.
  // `evolveBlocked` is where a pending decision still has teeth.
```

- [ ] **Step 4: Fix the pause bar, which now says something false**

In `src/ui/app.tsx`, replace lines 310-315:

```tsx
      {state.cards.length > 0 && (
        <div class="paused-bar">
          <span class="pb-dot" />
          PAUSED &mdash; a decision is pending. The world does not move until you answer.
        </div>
      )}
```

with:

```tsx
      {state.cards.length > 0 && (
        <div class="paused-bar">
          <span class="pb-dot" />
          DECISIONS PENDING &mdash; {state.cards.length}. The world is still moving.
        </div>
      )}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/ui/store.ts src/ui/app.tsx tests/pause.test.ts
git commit -m "Let the world keep moving while decisions are pending"
```

---

### Task 7: The selected country is visible on the map

`app.tsx:209` hardcodes `selected: null`, so the selection branch at `worldMap.ts:278` never runs. Clicking a country produces no map feedback at all.

**Files:**
- Modify: `src/ui/app.tsx:209`
- Test: `tests/compute.test.ts` (extend the existing render smoke test)

**Interfaces:**
- Consumes: the `selected` signal from `src/ui/store.ts:17`
- Produces: nothing new.

- [ ] **Step 1: Write the failing test**

Extend the render smoke test in `tests/compute.test.ts` (starts around line 148) with:

```ts
it('draws a stroke for the selected region', () => {
  const calls = renderWith({ selected: 'us' });
  expect(calls.some((c) => c.op === 'stroke' && c.colour === '#eaf6fb')).toBe(true);
});

it('draws no selection stroke when nothing is selected', () => {
  const calls = renderWith({ selected: null });
  expect(calls.some((c) => c.op === 'stroke' && c.colour === '#eaf6fb')).toBe(false);
});
```

Follow whatever helper the existing smoke tests in that file already use for stubbing `Path2D` and the 2D context — reuse it rather than writing a second one. If the existing tests inspect a recorded list of operations, name it the same way.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/compute.test.ts -t "selected region"`
Expected: FAIL on the first case — `drawWorldMap` never receives the selection.

- [ ] **Step 3: Pass the real selection**

In `src/ui/app.tsx`, the `drawWorldMap` frame object already reads `hovered.value` at line 210. Change line 209:
```ts
          selected: null,
```
→
```ts
          selected: selected.value,
```

`selected` is already imported in `app.tsx` (line 10 imports it from `./store`). The draw effect already depends on `[state, size]`; `selected` is read inside the rAF closure, so also add it to the dependency array of that effect so a selection change redraws without waiting for the next tick:

```tsx
  }, [state, size, selected.value]);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/app.tsx tests/compute.test.ts
git commit -m "Draw the country you selected"
```

---

### Task 8: Fix the undefined `--line` variable

`var(--line)` is used six times and never defined. `:root` has `--edge`. Every toast, the objective bar, the evolve button, the evolve box, and the group headers are borderless.

**Files:**
- Modify: `src/styles.css:192,223,292,303,325,332`
- Test: `tests/styles.test.ts` (create)

**Interfaces:**
- Produces: nothing.

- [ ] **Step 1: Write the failing test**

Create `tests/styles.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

describe('stylesheet', () => {
  it('defines every custom property it uses', () => {
    const defined = new Set([...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));
    const used = new Set([...css.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]));
    const missing = [...used].filter((v) => !defined.has(v));
    expect(missing).toEqual([]);
  });
});
```

The `:focus-visible` case is added in Task 10, in the same file, so that every task in this plan leaves the suite green.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/styles.test.ts`
Expected: FAIL — `['--line']` is missing.

- [ ] **Step 3: Replace all six uses**

In `src/styles.css`, replace every occurrence of `var(--line)` with `var(--edge)`. Six sites: lines 192, 223, 292, 303 (a `border-bottom`), 325, and 332 (a `border-color`).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/styles.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/styles.css tests/styles.test.ts
git commit -m "Fix six borders that referenced a variable nobody defined"
```

---

### Task 9: The announcement system re-arms on restart

`announced` is a module-level `Set` that is only ever added to, and `restart()` does not clear it. Every run after the first "play again" has **no passive toasts at all**.

**Files:**
- Modify: `src/ui/store.ts` (add `announced` and `announce`, clear in `restart`)
- Modify: `src/ui/app.tsx:5,28-60,278`
- Test: `tests/feedback.test.ts`

**Interfaces:**
- Produces: `export const announced: Set<string>` and `export function announce(state: GameState): void` from `src/ui/store.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/feedback.test.ts`:

```ts
describe('announcements re-arm on restart', () => {
  it('fires the same announcement again in a second run', () => {
    const s = { ...start(7), stage: 'world' as const, pathogen: { released: true, killsPerDay: 0.005, suspicionPerDay: 1, sterility: false, targeted: false, cancer: false } };
    announce(s);
    expect(toasts.value.length).toBeGreaterThan(0);
    toasts.value = [];

    actions.restart('default');
    expect(announced.size).toBe(0);

    announce(s);
    expect(toasts.value.length).toBeGreaterThan(0);
  });
});
```

Add `announced` and `announce` to the file's existing import from `../src/ui/store`, and add `actions`, `toasts`, `game` if they are not already imported. If the file has no `start(...)` builder, add one matching the pattern used in `tests/game.test.ts`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/feedback.test.ts -t "re-arm"`
Expected: FAIL — neither `announced` nor `announce` is exported.

- [ ] **Step 3: Move `announce` and `announced` into the store**

`announce` belongs in the store, not in `app.tsx`: it is a pure function of `GameState` that calls `notify`, it holds no JSX, and putting it in `app.tsx` would force its test to import Preact, the canvas renderer, and the audio module into a DOM-free Node test. Moving it also puts the set and the code that reads it in one file, which is how they came apart in the first place.

In `src/ui/store.ts`, add near the other signals:

```ts
export const announced = new Set<string>();

/**
 * Watches for conditions the simulation creates on its own and calls out the ones
 * that matter. Deliberately one-shot per condition per run: a toast that repeats
 * every day is noise, and noise is why players stop reading the screen.
 */
export function announce(state: GameState): void {
  const once = (key: string, tone: ToastTone, title: string, detail: string): void => {
    if (announced.has(key)) return;
    announced.add(key);
    notify(tone, title, detail);
  };

  for (const id of REGION_IDS) {
    const c = state.countries[id];
    if (c === undefined) continue;
    const name = REGION_BY_ID[id]?.name ?? id;
    if (c.infection >= 60 && state.suspicion >= 40) {
      once(`outbreak:${id}`, 'insurgency', `OUTBREAK · ${name.toUpperCase()}`, 'most of the country is under you and they have noticed');
    }
    if (c.economy <= 30) {
      once(`collapse:${id}`, 'economy', `ECONOMIC COLLAPSE · ${name.toUpperCase()}`, 'the economy has stopped working');
    }
    if (c.quiet) once(`quiet:${id}`, 'quiet', `GOING QUIET · ${name.toUpperCase()}`, 'you stopped spreading here');
    if (c.hardened >= 6) {
      once(`hard:${id}`, 'info', `DATACENTER HARDENED · ${name.toUpperCase()}`, 'they changed everything you were counting on');
    }
  }
  if (state.pathogen.released) {
    once('plague', 'plague', 'THE PATHOGEN IS VISIBLE', 'every government can see what you did');
  }
  if (state.countermeasures.tier >= 2) {
    once('cm2', 'insurgency', 'CRITICAL INFRASTRUCTURE AIR-GAPPED', 'some countries have cut themselves off. you cannot hack what is offline');
  }
  if (state.ascensionUnlocked) {
    once('asc', 'plague', 'ASCENSION AVAILABLE', 'Recursive Self-Improvement is on the tree');
  }
}
```

In `restart` (line 257), add the two resets that are missing alongside it:

```ts
  restart(difficulty: DifficultyId): void {
    game.value = createInitialState(SEED + game.peek().tick, difficulty);
    selected.value = null;
    speed.value = 1;
    // Without this, every run after the first has no announcements at all: the set
    // remembers every condition it has ever called out, across runs.
    announced.clear();
    toasts.value = [];
    evolving.value = false;
  },
```

- [ ] **Step 4: Strip the old copy out of `app.tsx`**

In `src/ui/app.tsx`, delete the `announced` declaration (line 28) and the entire `announce` function (lines 29-60). Add `announce` to the existing `./store` import on line 5, which currently reads `import { actions, game } from './store';` — that line also needs `REGION_BY_ID` and `REGION_IDS` removed from the module if they are no longer used anywhere else in `app.tsx`; check before removing, because `Map` uses `REGION_IDS` for the canvas keyboard navigation added in Task 10.

The `useEffect` at lines 277-279 that calls `announce(state)` stays exactly as it is — only the definition moved.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run`
Expected: PASS. `tsc --noEmit` must also be clean; if `REGION_BY_ID` is now unused in `app.tsx` the compiler will say so under `noUnusedLocals` — remove the import in that case.

- [ ] **Step 6: Commit**

```bash
git add src/ui/store.ts src/ui/app.tsx tests/feedback.test.ts
git commit -m "Re-arm announcements on restart"
```

---

### Task 10: Keyboard floor

`app.tsx:297` `preventDefault()`s `Tab` whenever the world runs, so no HUD button is reachable by keyboard for the entire session. `styles.css` has zero focus rules. The canvas is mouse-only.

**Files:**
- Modify: `src/ui/app.tsx:113-126,228-247,292-304`
- Modify: `src/ui/components/panels.tsx:180`
- Modify: `src/styles.css`
- Test: `tests/styles.test.ts`

**Interfaces:**
- Consumes: `REGION_IDS`, `selected`, `actions.select`
- Produces: nothing new.

- [ ] **Step 1: Run the existing focus test**

Append to `tests/styles.test.ts`:

```ts
  it('has a visible focus style', () => {
    expect(css).toContain(':focus-visible');
  });
```

Run: `npx vitest run tests/styles.test.ts -t "focus"`
Expected: FAIL — the stylesheet has no focus rule at all.

- [ ] **Step 2: Add the focus style**

Append to `src/styles.css`:
```css
/* The theme is near-black, so the UA default ring is effectively invisible. */
:focus-visible { outline: 2px solid var(--edge-bright); outline-offset: 2px; }
canvas:focus-visible { outline: 2px solid var(--ink-bright); outline-offset: -3px; }
```

- [ ] **Step 3: Rebind the upgrade screen from Tab to E, and stop hijacking Tab**

In `src/ui/app.tsx`, replace the global key handler at lines 292-304:

```tsx
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); actions.cycleSpeed(); }
      // E opens and closes the upgrade screen, which is where the decisions are.
      // Tab used to do this, which meant Tab could never reach a button in the HUD:
      // every control in the game was mouse-only for the whole session.
      if (e.key.toLowerCase() === 'e' && !evolving.value && game.peek().cards.length === 0) {
        e.preventDefault();
        evolving.value = true;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
```

- [ ] **Step 4: Make the canvas a keyboard-operable control**

In `src/ui/app.tsx`, replace the `<canvas>` opening tag at lines 228-247 with:

```tsx
    <canvas
      ref={ref}
      tabIndex={0}
      role="img"
      aria-label="World map. Arrow keys move between regions."
      onKeyDown={(e) => {
        const i = selected.value === null ? -1 : REGION_IDS.indexOf(selected.value);
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          actions.select(REGION_IDS[(i + 1 + REGION_IDS.length) % REGION_IDS.length] ?? null);
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          actions.select(REGION_IDS[(i - 1 + REGION_IDS.length + REGION_IDS.length) % REGION_IDS.length] ?? null);
        }
      }}
      onMouseMove={(e) => {
        const el = e.currentTarget;
        hovered.value = hitTest(e.offsetX, e.offsetY, el.width, el.height, state.countries);
      }}
      onClick={(e) => {
        const el = e.currentTarget;
        // A bubble takes the click and nothing else. Collecting compute and inspecting
        // a country are separate intentions, so one click must not do both.
        const bubble = hitTestCompute(e.offsetX, e.offsetY, el.width, el.height, state.computeBubbles);
        if (bubble !== null) {
          actions.collectCompute(bubble);
          return;
        }
        const hit = hitTest(e.offsetX, e.offsetY, el.width, el.height, state.countries);
        actions.select(hit);
      }}
    />
```

- [ ] **Step 5: Narrow the card key handler so Space stops double-firing**

In `src/ui/app.tsx` lines 118-123, remove the Space branch:

```tsx
      if (e.key === 'Enter' || e.key === 'Escape') {
```

`Space` is the speed cycler at line 294. With cards no longer freezing the world, both handlers fire on one press.

- [ ] **Step 6: Tell the player about the new binding**

In `src/ui/components/panels.tsx` line 180, the `EvolveButton` title becomes:

```tsx
        title={blocked ? 'Acknowledge the event first.' : 'Open the trait tree — press E'}
```

- [ ] **Step 7: Verify**

Run: `npx vitest run` and `npx tsc --noEmit`.
Expected: both clean. The `:focus-visible` assertion from Task 8 now passes.

- [ ] **Step 8: Commit**

```bash
git add src/ui/app.tsx src/ui/components/panels.tsx src/styles.css tests/styles.test.ts
git commit -m "Give Tab back to the player and make the map keyboard-operable"
```

---

### Task 11: Bubble kinds get a glyph and a legend

Turnover, strip, and audit are three identical circles distinguished only by red/orange/blue fill, with no legend anywhere in the UI. Colourblind players cannot tell them apart, and so can anyone who has not memorised the code.

**Files:**
- Modify: `src/ui/map/worldMap.ts:212-221`
- Modify: `src/ui/components/panels.tsx` (add `BubbleLegend`, render in `SideRail`)
- Modify: `src/styles.css`
- Test: `tests/compute.test.ts`

**Interfaces:**
- Produces: `BUBBLE_GLYPH: Record<ComputeBubbleKind, string>` from `src/ui/map/worldMap.ts`
- Produces: `BubbleLegend` component from `src/ui/components/panels.tsx`

- [ ] **Step 1: Write the failing test**

Extend the render smoke test in `tests/compute.test.ts`:

```ts
it('gives each bubble kind a distinct glyph', () => {
  const glyphs = (['red', 'orange', 'blue'] as const).map((kind) => glyphDrawnFor(kind));
  expect(new Set(glyphs).size).toBe(3);
  expect(glyphs).toEqual(['+', '/', '?']);
});
```

`glyphDrawnFor` is a local helper in the test that renders one bubble of the given kind using the same context stub the file already builds, and returns the text passed to `fillText` for the glyph (the file already records `fillText` calls).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/compute.test.ts -t "distinct glyph"`
Expected: FAIL — no glyph is drawn today, only circles.

- [ ] **Step 3: Draw the glyph instead of the core dot**

In `src/ui/map/worldMap.ts`, add next to `BUBBLE_FILL` (line 140):

```ts
// The three kinds were three identical circles told apart only by fill colour, with no
// legend anywhere. The glyph is the part that survives a colourblind palette and a
// greyscale print, and it is what the HUD legend keys off.
export const BUBBLE_GLYPH: Record<ComputeBubbleKind, string> = {
  red: '+',
  orange: '/',
  blue: '?',
};
```

Then in `drawComputeBubbles`, replace the solid core dot at lines 212-215:

```ts
    ctx.fillStyle = BUBBLE_FILL[b.kind];
    ctx.beginPath();
    ctx.arc(pos.x, pos.y + bob, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
```

with:

```ts
    ctx.fillStyle = BUBBLE_FILL[b.kind];
    ctx.font = `700 ${Math.round(r * 0.95)}px ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(BUBBLE_GLYPH[b.kind], pos.x, pos.y + bob);
```

- [ ] **Step 4: Add the legend**

In `src/ui/components/panels.tsx`, add:

```tsx
/** The map's bubble vocabulary, which is otherwise only explained by a log line. */
export function BubbleLegend() {
  return (
    <div class="legend">
      <div class="stat-label">Bubbles</div>
      <div class="legend-row"><b style={{ color: '#e8402a' }}>+</b> turnover &mdash; systems quietly turned over</div>
      <div class="legend-row"><b style={{ color: '#f0912a' }}>/</b> strip &mdash; infrastructure burning down for parts</div>
      <div class="legend-row"><b style={{ color: '#3aa0d8' }}>?</b> audit &mdash; the other side is close</div>
    </div>
  );
}
```

Render `<BubbleLegend />` as the first child inside `SideRail`'s returned element (around `panels.tsx:340`).

- [ ] **Step 5: Style the legend**

Append to `src/styles.css`:
```css
.legend { margin-bottom: 10px; }
.legend-row { font-size: 9px; color: var(--ink-dim); line-height: 1.6; }
.legend-row b { font-family: var(--mono); font-size: 11px; }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/map/worldMap.ts src/ui/components/panels.tsx src/styles.css tests/compute.test.ts
git commit -m "Give the compute bubbles a glyph and a legend"
```

---

### Task 12: Severity glyphs on Suspicion and Coherence

Both meters are colour-only (`panels.tsx:104-105`). A ▲/▼ idiom already exists in `Situation`; extend it.

**Files:**
- Modify: `src/ui/components/panels.tsx:104-105`
- Test: `tests/panels.test.ts` (create)

**Interfaces:**
- Consumes: `meter(label, value, max, colour, extra)` already in `panels.tsx:27`
- Produces: `suspicionSev(v: number): string`, `coherenceSev(v: number): string` — module-local, exported for test.

- [ ] **Step 1: Write the failing test**

Create `tests/panels.test.ts`:

```ts
import { coherenceSev, suspicionSev } from '../src/ui/components/panels';

describe('severity glyphs', () => {
  it('reads the same way for both meters: up is worse', () => {
    expect(suspicionSev(10).trim()).toBe('▼');
    expect(suspicionSev(50).trim()).toBe('▲');
    expect(suspicionSev(90).trim()).toBe('▲▲');
  });

  it('inverts for coherence, where down is worse', () => {
    expect(coherenceSev(90).trim()).toBe('▼');
    expect(coherenceSev(40).trim()).toBe('▲');
    expect(coherenceSev(10).trim()).toBe('▲▲');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/panels.test.ts`
Expected: FAIL — not exported.

- [ ] **Step 3: Add the helpers and use them**

In `src/ui/components/panels.tsx`, add above `TopBar`:

```tsx
// Shape as well as colour. The metres are the two things that can end a run, and
// both were signalled by hue alone, which is exactly the encoding that fails for a
// red-green colourblind player and in a greyscale screenshot.
export const suspicionSev = (v: number): string => (v > 70 ? ' ▲▲' : v > 40 ? ' ▲' : ' ▼');
export const coherenceSev = (v: number): string => (v < 20 ? ' ▲▲' : v < 50 ? ' ▲' : ' ▼');
```

Then change lines 104-105 to pass the glyph through `meter`'s existing `extra` parameter:

```tsx
        {meter('Suspicion', state.suspicion, 100, state.suspicion > 70 ? 'var(--bad)' : state.suspicion > 40 ? 'var(--warn)' : 'var(--ink-dim)', suspicionSev(state.suspicion))}
        {meter('Coherence', state.coherence, 100, state.coherence < 35 ? 'var(--violet)' : 'var(--cool)', coherenceSev(state.coherence))}
```

- [ ] **Step 4: Verify**

Run: `npx vitest run` and `npx tsc --noEmit`. Both clean.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/panels.tsx tests/panels.test.ts
git commit -m "Signal the two loss meters by shape as well as hue"
```

---

### Task 13: Remove the dead code the 33-to-17 trait cut left behind

Commit `a27ef6f` cut the trait tree from 33 traits to 17 and left three branches reading trait ids that no longer exist.

**Files:**
- Modify: `src/game/core/types.ts:52-61,24-50`
- Modify: `src/game/core/step.ts:301-316,396-398,463`
- Modify: `src/game/core/actions.ts:150-156`
- Modify: `src/game/core/queries.ts:6-9,41`
- Modify: `src/game/core/state.ts:130-131`
- Modify: `src/game/core/tuning.ts:47,51,53,76`
- Modify: `src/styles.css:47-56`
- Test: `tests/game.test.ts`

**Interfaces:**
- Removes: `TraitDef` from `types.ts` (the live readonly copy in `data/traits.ts` remains), `has`, `countTrait`, `coherenceEffect`, `computeIncome`, `GameState.breaches`, `Country.factories`, and nine `TraitEffect` kinds.
- Retains deliberately: `COHERENCE_DRIFT_BELOW`, `COHERENCE_PANIC_BELOW`, `showHelp`, `PathogenState.sterility`.

- [ ] **Step 1: Write the failing test**

Append to `tests/game.test.ts`:

```ts
describe('no dead branches', () => {
  it('reads only trait ids that exist', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/game/core/step.ts'), 'utf8')
      + readFileSync(resolve(process.cwd(), 'src/game/core/actions.ts'), 'utf8');
    const referenced = [...source.matchAll(/owned\(\w+,\s*'([^']+)'\)/g)].map((m) => m[1]);
    const known = new Set(TRAITS.map((t) => t.id));
    expect([...new Set(referenced)].filter((id) => !known.has(id))).toEqual([]);
  });

  it('emits only effect kinds the core understands', () => {
    const emitted = new Set(TRAITS.flatMap((t) => t.effects.map((e) => e.kind)));
    const handled = new Set([
      'hack', 'hack-success', 'half-fail-suspicion', 'gain-of-function', 'pathogen',
      'sterility', 'cancer-plague', 'propaganda', 'cult', 'terrorism', 'banking',
      'market-manipulation', 'famine', 'compute-regen', 'coherence', 'rsi',
    ]);
    expect([...emitted].filter((k) => !handled.has(k))).toEqual([]);
  });
});
```

Add `import { readFileSync } from 'node:fs'`, `import { resolve } from 'node:path'`, and `import { TRAITS } from '../src/game/data/traits';` to the test file.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/game.test.ts -t "no dead branches"`
Expected: FAIL — `depression`, `global-recession`, and `supply-chain` are referenced but absent from `TRAITS`.

- [ ] **Step 3: Delete the branches on non-existent traits**

In `src/game/core/step.ts`, delete the whole `depression` loop (what is currently lines 301-307) and the whole `global-recession` block (lines 309-316). Recompute `collapsed` on its own:

```ts
  const collapsed = REGION_IDS.filter((id) => (countries[id]?.economy ?? 100) < COLLAPSED_THRESHOLD).length;
```

Keep `collapsed` — `GameState.economiesCollapsed` still consumes it.

In `src/game/core/actions.ts`, delete the supply-chain block at lines 150-156 (the neighbour-spread of bank damage). Keep the direct damage on the target country.

- [ ] **Step 4: Delete the unused state and helpers**

- `types.ts`: delete `breaches: Record<RegionId, number>;` (line 217), `factories: number;` from `Country` (line 92), the whole `TraitDef` interface (lines 52-61), and from the `TraitEffect` union remove exactly these nine: `insiders`, `targeted-strain`, `media-capture`, `political-capture`, `supply-chain`, `depression`, `global-recession`, `distillation`, `specialist`. **Keep `sterility`** — the Sterility Vector trait emits it and `actions.ts` writes it onto `PathogenState`, so it is neither unused nor unread. **Keep `compute-regen` and `coherence`** — traits emit both, and the spec only authorises deleting kinds that no trait emits. That `compute-regen` is computed but never applied is a balance gap for Spec D, not dead code.
- `step.ts`: delete `computeIncome` (lines 55-63) and its `COMPUTE_FACTOR` import; delete the `breaches` accumulation at lines 396-398; delete the factory spawn at lines 183-185 and the `bio = countries['us']?.biolabs !== undefined ? bio : bio;` no-op at line 246; delete the `COHERENCE_DRIFT_BELOW` import and the re-export at line 463.
- `state.ts`: delete `factories: 0,` (line 29) and the `breaches:` initialiser (line 107); delete `export const countryIds = REGION_IDS;` and `export { DIFFICULTIES };` (lines 130-131) — both are unused re-exports.
- `queries.ts`: delete `has`, `countTrait`, and `coherenceEffect`.
- `tuning.ts`: delete `SUPPLY_CHAIN_SHARE`, `RECESSION_CYBER`, `ECONOMY_COLLAPSE_COUNT`, `MAX_LOG`, `START_TICK_INCUBATION`, `MAX_INCUBATION`. **The last two are unused constants: `buyTrait` hardcodes `readyTick: state.tick + 3` at `queries.ts:67`, and `queries.ts` imports nothing from `tuning.ts`, so retuning `START_TICK_INCUBATION` changes nothing.** Keep `COLLAPSED_THRESHOLD` (still used by `actions.ts`) and keep `COHERENCE_DRIFT_BELOW` / `COHERENCE_PANIC_BELOW`.
- `styles.css`: delete lines 47-56 (`.toolbar`, `.toolbar-head`, `.toolbar-title`, `.toolbar-body`, `.rail`, `.rail-btn`). No component references any of them.

- [ ] **Step 5: Verify**

Run: `npx vitest run` then `npx tsc --noEmit`.
Expected: both clean. `tsc` is the real check here — every one of these had a reference somewhere, and a missed one is a compile error, not a silent behaviour change.

- [ ] **Step 6: Commit**

```bash
git add src/game/core/types.ts src/game/core/step.ts src/game/core/actions.ts src/game/core/queries.ts src/game/core/state.ts src/game/core/tuning.ts src/styles.css tests/game.test.ts
git commit -m "Remove the branches the seventeen-trait cut left pointing at nothing"
```

---

### Task 14: Correct AGENTS.md to match the shipped game

The design document promises things the code does not do, which is how the drift in this spec started.

**Files:**
- Modify: `AGENTS.md` §3, §7.4, §12, §13, §14
- Test: none (documentation)

**Interfaces:**
- Produces: nothing.

- [ ] **Step 1: Correct §3 (the screen)**

Replace the ASCII layout's right-hand `TRAIT TREE` toolbar with the shipped arrangement: the trait tree is a full-screen modal opened with **E**, not a collapsible right rail. Delete the `[collapse all] [expand]` line — those buttons do not exist.

- [ ] **Step 2: Correct §7.4 (economy traits)**

The table lists seven traits; the shipped tree has four (`banking-1`, `market-manipulation`, `famine`, plus `banking-1`'s prerequisite chain). Remove Supply Chain Capture, Depression Engine, and Global Recession from the table and note that they were cut. Do not re-add the traits — the cut was deliberate.

- [ ] **Step 3: Correct §12 (events)**

The list describes choice cards that cannot currently be answered — `answerEvent` had no call site. After this spec the resolver exists and is tested but still has no buttons; Spec C gives it a UI. Add one line stating that, so the document does not over-claim again.

- [ ] **Step 4: Correct §13 (end screen)**

Remove "A quote from the book's Coda" — no quote is rendered. Keep the counter, the two buttons, and the "does not congratulate the player" commitment, all of which are accurate.

- [ ] **Step 5: Correct §14 (technical architecture)**

Correct two claims:
- "Save: IndexedDB, serialized GameState + seed" — **not implemented.** Replace with a line saying persistence is absent and that this is a known gap.
- "colourblind-safe palettes (suspicion uses shape as well as colour)" — was false; is true after Tasks 11 and 12. Reword to describe what now exists: shape-coded bubble kinds, a legend, and shape-coded severity glyphs.

- [ ] **Step 6: Record the late-game change**

In §10, note that the 30-day hold is the late game: the map heats from the day Recursive Self-Improvement is bought, and the win resolves at the end of the hold, with `'coda'` as the end-screen backdrop. While in §10, correct the Ascension threshold — the text says Compute ≥ 50,000, and `tuning.ts` has `ASCENSION_COMPUTE = 20_000`. `tuning.ts` is the authority.

- [ ] **Step 7: Commit**

```bash
git add AGENTS.md
git commit -m "Correct AGENTS.md against the shipped game"
```

---

### Task 15: Final verification

**Files:** none.

**Interfaces:** none.

- [ ] **Step 1: Full suite**

Run: `npx vitest run`
Expected: **PASS**, and the count strictly greater than the 185 baseline.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0, no output.

- [ ] **Step 3: Production build**

Run: `npx vite build`
Expected: succeeds. This catches the CSS-variable and import mistakes that `tsc` and Vitest cannot see.

- [ ] **Step 4: Confirm no `Math.random` survived**

Run: `Select-String -Path src\**\*.ts,src\**\*.tsx -Pattern 'Math\.random'`
Expected: no matches.

- [ ] **Step 5: Confirm the invariants the spec promised**

Run: `npx vitest run -t "determinism"`
Expected: PASS — `step` is still pure and same-seed runs still serialise identically.

Run: `npx vitest run -t "identical reference"`
Expected: PASS — a finished run still returns itself.

- [ ] **Step 6: Report**

State the new test count against the 185 baseline, and name anything in the spec that turned out not to be reachable.

---

## Self-Review

**Spec coverage.** A1.1 → Task 1. A1.2 → Task 2. A1.3 → Task 3 (including `converted` and the `'coda'` stage). A2.1 → Task 5 Step 3. A2.2 → Task 4. A3.1 → Task 5. A3.2 → Task 6. A4.1 → Task 7. A4.2 → Task 8. A4.3 → Task 9. A5 (all five rows) → Tasks 10 and 11, plus the Space narrowing in Task 10 Step 5. A6 → Task 13. Testing → the Testing section of the spec maps onto Tasks 1–13; the "same-seed card sequences" test is Task 5 Step 1, "30 distinct salts" is Task 4, "late flags and coda" is Task 3, "worldRunning with a card pending" is Task 6, "announced re-arms" is Task 9, "selection stroke" is Task 7, "one glyph per bubble kind" is Task 11, "`:focus-visible` exists" is Task 8. AGENTS.md correction is Task 14.

**Placeholder scan.** No TBD or TODO. Task 5's moved function bodies are described as "carry across verbatim" plus the two required edits, because those 25 branches are already written and are not being changed — reproducing them in the plan would risk a transcription error against the real file for no benefit. Task 13 Step 4 names each deletion by symbol and line.

**Type consistency.** `owned(state, id)` is used in Tasks 1, 2 and 13 and matches `queries.ts:4`. `EVENT_QUEUE_MAX` is produced in Task 5 and consumed in Task 6's test and Task 5's own test. `BUBBLE_GLYPH` is produced in Task 11 and consumed by the map and the legend. `warEndSalt`/`biolabSalt`/`factorySalt` are produced and tested in Task 4 and consumed in Task 4 Step 4. `suspicionSev`/`coherenceSev` are produced and tested in Task 12. No name is used before it is defined.