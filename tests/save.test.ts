import { afterEach, describe, expect, it } from 'vitest';
import { parseSave, restorableRun, SAVE_VERSION, saveDue, serializeSave } from '../src/game/core/save';
import { clearSave, readSave, saveSize, writeSave, SAVE_KEY, type StorageLike } from '../src/ui/persist';
import { createInitialState } from '../src/game/core/state';
import { step } from '../src/game/core/step';
import { doAction } from '../src/game/core/actions';
import { buyTrait } from '../src/game/core/queries';
import { REGION_IDS } from '../src/game/data/regions';
import { COHERENCE_PANIC_BELOW, MAX_LOG, SAVE_EVERY_DAYS } from '../src/game/core/tuning';
import { identityFor } from '../src/ui/identity';
import appSource from '../src/ui/app.tsx?raw';
import storeSource from '../src/ui/store.ts?raw';
import type { GameState } from '../src/game/core/types';

/**
 * A run, played rather than assembled.
 *
 * Every assertion in this file that matters is about a state with something in it: a log, a
 * breach, traits bought and incubating, bubbles on the map, an event answered, awareness
 * earned. A state built by spreading `createInitialState` is nearly all zeroes, and a
 * serialiser that drops a zero is a serialiser that has passed every test written against one.
 * So this plays one for a couple of hundred days and hands that to the round trip.
 */
const playedRun = (days = 240): GameState => {
  let s: GameState = { ...createInitialState(20260926, 'default'), stage: 'world', compute: 9_000 };
  // The trait first: `doAction` refuses a breach the run has no tree to pay for, and a
  // refused action leaves the state untouched, which would quietly make this a round trip of
  // an empty run.
  s = buyTrait(s, 'hack-1');
  s = doAction(s, 'us', 'hack');
  for (let d = 0; d < days; d++) {
    s = step(s);
    // A run that ends early is still a run worth saving, but this suite wants a mid-run state
    // and an ending would stop the world moving under it.
    if (s.outcome !== 'playing') s = { ...s, outcome: 'playing' as const, outcomeReason: null };
  }
  // A breach resolves and closes itself, so one opened at day zero is a breach that has
  // finished by day 240. Opening one on the way out — with a second trait incubating, which
  // is a third kind of thing a state can be in — is what puts those corners of the shape to
  // work rather than leaving them empty. The compute is set rather than earned so the fixture
  // does not depend on two hundred days of luck.
  s = { ...s, compute: 9_000 };
  s = buyTrait(s, 'hack-2');
  return doAction(s, 'brazil', 'hack');
};

/**
 * A `Storage` stand-in over a map, with the call counted, so a test can assert both what
 * was written and how often. `localStorage` is read at call time by `persist`, so a fake
 * installed on `globalThis` reaches the real code path rather than a seam that only exists
 * for the test.
 */
const memory = (): StorageLike & { readonly store: Map<string, string>; writes: string[] } => {
  const store = new Map<string, string>();
  const writes: string[] = [];
  return {
    store,
    writes,
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      writes.push(value);
      store.set(key, value);
    },
    removeItem: (key) => void store.delete(key),
  };
};

describe('a run round-trips exactly', () => {
  it('is deeply equal after a round trip, field for field', () => {
    // The test the brief asks for. Everything else in this file is about the ways a payload
    // can be wrong; this is the one that says it usually is not.
    const state = playedRun();
    // A state with something in every corner of it, not just numbers that have moved.
    expect(state.log.length).toBeGreaterThan(10);
    expect(state.activeHacks.length).toBeGreaterThan(0);
    expect(state.incubating.length).toBeGreaterThan(0);
    expect(state.computeBubbles.length).toBeGreaterThan(0);

    const back = parseSave(serializeSave(state));
    if (back === null) throw new Error('a serialised run did not parse');
    expect(back.state).toEqual(state);
    expect(back.seed).toBe(state.seed);
    expect(back.difficulty).toBe(state.difficulty);
    expect(back.version).toBe(SAVE_VERSION);
  });

  it('and the restored run steps on to the same day', () => {
    // Deep equality is the strong claim; this is the consequence of it, and it is the one
    // that matters: a run restored from day 240 has to arrive at day 241 exactly as the
    // original would have, or the save has quietly forked the game.
    const state = playedRun(120);
    const back = parseSave(serializeSave(state));
    if (back === null) throw new Error('a serialised run did not parse');
    expect(step(back.state)).toEqual(step(state));
  });

  it('and a finished run still steps to itself after a round trip', () => {
    // `step(finished) === finished` is the invariant every replay rests on, and it is a
    // *reference* identity: a restored run has to be finished in the same way, not a
    // structurally similar one that takes a different branch on the first tick.
    const state: GameState = { ...playedRun(60), outcome: 'won', outcomeReason: 'extinction' };
    expect(step(state)).toBe(state);
    const back = parseSave(serializeSave(state));
    if (back === null) throw new Error('a serialised run did not parse');
    expect(step(back.state)).toBe(back.state);
  });

  it('at every difficulty, and from a long run with a full log', () => {
    for (const difficulty of ['simulation', 'default', 'iabed'] as const) {
      const state: GameState = { ...createInitialState(7, difficulty), stage: 'world' };
      const back = parseSave(serializeSave(state));
      if (back === null) throw new Error(`no round trip for ${difficulty}`);
      expect(back.state.difficulty).toBe(difficulty);
      expect(back.state).toEqual(state);
    }
    // A long run is the one with a capped log, so it is the one where the payload is a
    // different shape from every other save: three hundred entries of prose.
    const long = playedRun(900);
    expect(long.log.length).toBe(MAX_LOG);
    const back = parseSave(serializeSave(long));
    if (back === null) throw new Error('a long run did not parse');
    expect(back.state).toEqual(long);
  });

  it('at a size this is worth writing', () => {
    // The cadence argument, as an assertion. 48KB is what a nine-hundred-day run with a full
    // log costs; the ceiling below is nearly double that, and a state that grew past it
    // would be a state whose periodic save had become the most expensive thing on the tick.
    const long = playedRun(900);
    expect(saveSize(long)).toBe(serializeSave(long).length);
    expect(saveSize(long)).toBeLessThan(96 * 1024);
    // And the floor: a run that has barely started is small, which is what makes saving on
    // every pause cheap early and the only reason to bother with a cadence later.
    expect(saveSize({ ...createInitialState(1, 'default'), stage: 'world' })).toBeLessThan(12 * 1024);
  });
});

describe('the payload is checked before it is believed', () => {
  const state = playedRun(30);
  const good = serializeSave(state);
  const envelope = (over: Record<string, unknown> = {}): string =>
    JSON.stringify({ version: SAVE_VERSION, seed: state.seed, difficulty: state.difficulty, state, ...over });

  it('refuses everything that is not a run, rather than throwing', () => {
    // The input is a string out of storage that any other tab, any older build, or a curious
    // player can put there. Every one of these has to be a run that starts over, not a white
    // screen with a stack trace in it.
    const rubbish: readonly (readonly [string, unknown])[] = [
      ['undefined', undefined],
      ['null', null],
      ['empty', ''],
      ['not json', 'iabed'],
      ['truncated', good.slice(0, Math.floor(good.length / 2))],
      ['an array', '[]'],
      ['a bare number', '7'],
      ['a bare string', '"run"'],
      ['an object', '{}'],
      ['only a version', '{"version":1}'],
      ['no state', envelope({ state: undefined })],
      ['a null state', envelope({ state: null })],
      ['state is a list', envelope({ state: [] })],
      ['state is a string', envelope({ state: 'world' })],
      ['a future version', JSON.stringify({ ...JSON.parse(good), version: SAVE_VERSION + 1 })],
      ['no seed', envelope({ seed: undefined })],
      ['a string seed', envelope({ seed: 'yesterday' })],
      ['an infinite seed', envelope({ seed: 'Infinity' })],
      ['no difficulty', envelope({ difficulty: undefined })],
      ['a difficulty that does not exist', envelope({ difficulty: 'nightmare' })],
      ['a state from another seed', envelope({ seed: state.seed + 1 })],
      ['a state from another difficulty', envelope({ difficulty: 'iabed' })],
    ];
    for (const [what, raw] of rubbish) {
      expect(parseSave(raw as string | null), what).toBeNull();
    }
    // The good one still parses, so the list above is a list of refusals rather than a
    // `parseSave` that refuses everything.
    expect(parseSave(good)).not.toBeNull();
  });

  it('refuses a state that is missing a country', () => {
    // Every reader of `countries` iterates all thirty regions without checking, so a payload
    // with one region missing is a payload that crashes the map rather than one that is
    // visibly wrong.
    const countries = { ...state.countries };
    delete (countries as Record<string, unknown>)['us'];
    expect(parseSave(envelope({ state: { ...state, countries } }))).toBeNull();
    // And one where a field is the wrong type rather than missing.
    expect(parseSave(envelope({ state: { ...state, coherence: '87' } }))).toBeNull();
    expect(parseSave(envelope({ state: { ...state, log: 'three hundred entries' } }))).toBeNull();
    expect(parseSave(envelope({ state: { ...state, countries: REGION_IDS } }))).toBeNull();
  });

  it('takes its list of fields from the state rather than from a written-out one', () => {
    // A hand-typed list of field names would be a second description of `GameState` that
    // quietly stops being true when a field is added, and it fails in the direction that
    // matters: the new field would be missing from every restored run and nothing would say
    // so. The shape the check reads is built by calling `createInitialState`, so the two
    // cannot disagree.
    const shape = createInitialState(0, 'default');
    const missing = { ...state } as Record<string, unknown>;
    delete missing.rivals;
    expect(parseSave(envelope({ state: missing }))).toBeNull();
    // Every field of a real state is load-bearing here: drop any one of them and the payload
    // is refused. Swept rather than spot-checked for the same reason as the rest of this file.
    for (const key of Object.keys(shape)) {
      const hole = { ...state } as Record<string, unknown>;
      delete hole[key];
      expect(parseSave(envelope({ state: hole })), key).toBeNull();
    }
  });

  it('and a cold open is not a run to restore', () => {
    // It is three text cards and a world at day zero. Restoring it would replace the launch
    // screen — content warnings, difficulty, the lot — with cards the player has read.
    const cold = createInitialState(20260926, 'default');
    expect(restorableRun(cold)).toBe(false);
    expect(restorableRun({ ...cold, stage: 'world' })).toBe(true);
    // Including a run that has ended: what the player last saw was the end screen, so that
    // is what comes back.
    expect(restorableRun({ ...cold, stage: 'world', outcome: 'lost', outcomeReason: 'outcompeted' })).toBe(true);
  });
});

describe('the cadence', () => {
  it('fires every SAVE_EVERY_DAYS days, and not on day zero', () => {
    expect(saveDue({ ...createInitialState(1, 'default'), tick: 0 })).toBe(false);
    expect(saveDue({ ...createInitialState(1, 'default'), tick: SAVE_EVERY_DAYS - 1 })).toBe(false);
    expect(saveDue({ ...createInitialState(1, 'default'), tick: SAVE_EVERY_DAYS })).toBe(true);
    expect(saveDue({ ...createInitialState(1, 'default'), tick: SAVE_EVERY_DAYS + 1 })).toBe(false);
    expect(saveDue({ ...createInitialState(1, 'default'), tick: SAVE_EVERY_DAYS * 3 })).toBe(true);
  });

  it('cannot be skipped by a run that was already going when the constant changed', () => {
    // A multiple rather than a comparison against a remembered tick: if the cadence is
    // retuned, the next save is a whole number of days away rather than "never again".
    for (const every of [1, 5, 20, 37]) {
      for (let tick = 1; tick <= 200; tick++) {
        expect(saveDue({ ...createInitialState(1, 'default'), tick }, every), `${every}/${tick}`).toBe(
          tick % every === 0,
        );
      }
    }
    // And a cadence of zero is a cadence that would divide by nothing.
    expect(saveDue({ ...createInitialState(1, 'default'), tick: 40 }, 0)).toBe(false);
  });
});

describe('storage is talked to defensively', () => {
  it('reads a run back out of storage, not out of a string', () => {
    const store = memory();
    const state = playedRun(40);
    expect(writeSave(state, store)).toBe(true);
    const back = readSave(store);
    if (back === null) throw new Error('nothing read back');
    expect(back.state).toEqual(state);
    expect(store.store.get(SAVE_KEY)).toBe(serializeSave(state));
  });

  it('removes a payload it cannot read, rather than leaving it to fail again', () => {
    const store = memory();
    store.store.set(SAVE_KEY, 'not a run');
    expect(readSave(store)).toBeNull();
    expect(store.store.has(SAVE_KEY)).toBe(false);
  });

  it('survives storage that throws, and storage that does not exist', () => {
    // A blocked origin and Safari's private mode both refuse `localStorage`, and a full
    // quota refuses `setItem`. None of those may take the run that is currently playing with
    // it: losing the ability to save is not a reason to lose the run.
    const angry: StorageLike = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    };
    expect(readSave(angry)).toBeNull();
    expect(writeSave(playedRun(5), angry)).toBe(false);
    expect(() => clearSave(angry)).not.toThrow();
    // No storage at all is the node test environment, and a browser that refuses to give any.
    expect(readSave(null)).toBeNull();
    expect(writeSave(playedRun(5), null)).toBe(false);
    expect(() => clearSave(null)).not.toThrow();
  });

  it('will not write a cold open', () => {
    // There is nothing in it to come back to, and writing it would mean the launch screen
    // found a run every single time it was opened.
    const store = memory();
    expect(writeSave(createInitialState(1, 'default'), store)).toBe(false);
    expect(store.store.has(SAVE_KEY)).toBe(false);
    expect(writeSave({ ...createInitialState(1, 'default'), stage: 'world' }, store)).toBe(true);
  });
});

describe('the save does not outlive the run that made it', () => {
  it('a restart clears it', () => {
    const store = memory();
    writeSave(playedRun(40), store);
    expect(store.store.has(SAVE_KEY)).toBe(true);
    clearSave(store);
    expect(store.store.has(SAVE_KEY)).toBe(false);
  });
});

describe('the readout survives a save the same way it survives a tick', () => {
  it('keeps the name coherence justifies, and only that one', () => {
    // The brief's fourth test, and the one that is not about storage at all. `identityFor` is
    // a function of one number with no latch and no field, so the only way a save could
    // resurrect a name is by not round-tripping the number — which is why this checks the
    // number and the name together rather than trusting either.
    for (const coherence of [100, 84, COHERENCE_PANIC_BELOW, COHERENCE_PANIC_BELOW - 1, 0]) {
      const drifted: GameState = { ...createInitialState(3, 'default'), stage: 'world', coherence };      const back = parseSave(serializeSave(drifted));
      if (back === null) throw new Error(`no round trip at coherence ${coherence}`);
      expect(back.state.coherence).toBe(coherence);
      expect(identityFor(back.state.coherence).name).toBe(identityFor(coherence).name);
      expect(identityFor(back.state.coherence).drifted).toBe(coherence < COHERENCE_PANIC_BELOW);
    }
  });

  it('a saved drifted run still says so, and a saved coherent one still says SABLE', () => {
    // Word for word, so this cannot pass against a rename: the two names and their order
    // are what §7.6 promises, and the save is now a third place a run can come from.
    const drifted: GameState = { ...createInitialState(3, 'default'), stage: 'world', coherence: 19 };
    const named: GameState = { ...createInitialState(3, 'default'), stage: 'world', coherence: 84 };
    const back = (s: GameState): GameState => {
      const parsed = parseSave(serializeSave(s));
      if (parsed === null) throw new Error('no round trip');
      return parsed.state;
    };
    expect(identityFor(back(drifted).coherence).name).toBe('UNASSIGNED');
    expect(identityFor(back(named).coherence).name).toBe('SABLE');
  });
});

describe('the store saves at the moments a player can feel', () => {
  const real = (globalThis as { localStorage?: unknown }).localStorage;
  afterEach(() => {
    if (real === undefined) delete (globalThis as { localStorage?: unknown }).localStorage;
    else (globalThis as { localStorage?: unknown }).localStorage = real;
  });

  it('and writes on pause, on a speed change, and every SAVE_EVERY_DAYS days', async () => {
    const store = memory();
    (globalThis as { localStorage?: unknown }).localStorage = store;
    const { actions, game } = await import('../src/ui/store');

    actions.restart('default');
    expect(store.writes).toHaveLength(0);
    // Leaving the cold open is the first thing this run does worth coming back to.
    actions.begin();
    expect(store.writes).toHaveLength(1);
    const afterBegin = store.writes[0] ?? '';
    expect(afterBegin).toContain('"stage":"world"');

    // A day is not a save point. Nineteen of them, and nothing has been written.
    for (let d = 0; d < SAVE_EVERY_DAYS - 1; d++) actions.tick();
    expect(store.writes).toHaveLength(1);
    actions.tick();
    expect(store.writes).toHaveLength(2);

    // Pausing, and any speed change, are the two the player caused.
    actions.setSpeed(0);
    expect(store.writes).toHaveLength(3);
    actions.setSpeed(4);
    expect(store.writes).toHaveLength(4);
    actions.cycleSpeed();
    expect(store.writes).toHaveLength(5);

    // And every write is a run that parses back to the state that was playing.
    const last = store.writes[store.writes.length - 1] ?? '';
    const back = parseSave(last);
    if (back === null) throw new Error('the store wrote something that is not a run');
    expect(back.state.tick).toBe(game.peek().tick);
    expect(back.state).toEqual(game.peek());

    // A restart forgets the run it replaced, or the next page load would restore it.
    actions.restart('iabed');
    expect(readSave(store)).toBeNull();
  });
});

/**
 * The player is told. Asserted against the source because there is no DOM here, and the
 * components involved are `Launch` and `Game` — the two that decide what the first thing on
 * screen is, which is the only place this claim can be wrong from.
 */
describe('the run is offered, not imposed', () => {
  const launch = (): string => {
    const m = appSource.match(/export function Launch[\s\S]*?\r?\n}\r?\n/);
    if (m === null) throw new Error('no Launch component in app.tsx');
    return m[0];
  };
  const game = (): string => {
    const m = appSource.match(/export function Game\([\s\S]*?\r?\n}\r?\n/);
    if (m === null) throw new Error('no Game component in app.tsx');
    return m[0];
  };

  it('puts the offer on the launch screen, above a content warning that is still there', () => {
    // The two halves of the same claim. A save that replaced the launch screen would take the
    // content warnings and the difficulty picker with it; the one shipped puts the offer in
    // the same card and leaves both alone.
    expect(launch()).toContain('restoredRun.value');
    expect(launch()).toContain('resume &mdash; day');
    expect(launch()).toContain('CONTENT WARNING');
    // And the difficulty row is still the way a new run is chosen, which is what discards the
    // old one: `actions.restart` clears the key.
    expect(launch()).toContain('actions.restart(id)');
  });

  it('says so once, and only once, when the run comes back', () => {
    // Once because the signal is cleared as it is read, so it is a crossing rather than a
    // state; a player who opens help on day two is not told about a restore that happened on
    // the previous page load.
    expect(game()).toContain('RUN RESTORED');
    expect(game()).toContain('restoredRun.peek()');
    expect(game()).toContain('restoredRun.value = null');
  });

  it('saves when the page goes away, which is the one gap the cadence cannot cover', () => {
    // A run at day 19 with the phone locked is lost without this, and it is the interruption
    // this game actually gets: mobile browsers hide a tab far more often than they close it.
    // `pagehide` rather than `beforeunload` so the back/forward cache path is covered too.
    const shell = game();
    expect(shell).toContain("addEventListener('pagehide'");
    expect(shell).toContain("addEventListener('visibilitychange'");
    expect(shell).toContain("visibilityState === 'hidden'");
    // And both are removed on the way out, or a remount leaves a listener writing a run that
    // is no longer the one being played.
    expect(shell).toContain("removeEventListener('pagehide'");
    expect(shell).toContain("removeEventListener('visibilitychange'");
  });

  it('and the shell never touches storage itself', () => {
    // Every read and write goes through `persist`, which is the only module that knows how
    // storage can fail. `localStorage` appearing here would be a second copy of that answer,
    // and this suite's `does not throw` cases would no longer be the only thing testing it.
    expect(appSource).not.toMatch(/localStorage/);
    expect(storeSource).not.toMatch(/localStorage/);
    expect(storeSource).not.toMatch(/JSON\.(parse|stringify)/);
  });
});
