import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { canDo, doAction, hackSuccessSalt, hackYieldSalt } from '../src/game/core/actions';
import { canBuyTrait, hackTier, maxConcurrentHacks, owned } from '../src/game/core/queries';
import { SALT_KIND_BLUE, SALT_KIND_ORANGE, SALT_KIND_RED, SALT_PHASE, SALT_VALUE, SALT_WHERE } from '../src/game/core/compute';
import { createInitialState, log } from '../src/game/core/state';
import { biolabSalt, step, warEndSalt } from '../src/game/core/step';
import { DIFFICULTIES, ASCENSION_COMPUTE, MAX_DEPTH, MAX_LOG, TICK_MS } from '../src/game/core/tuning';
import { TRAITS, TRAIT_BY_ID } from '../src/game/data/traits';
import { REGION_IDS, type RegionId } from '../src/game/data/regions';
import type { GameState } from '../src/game/core/types';

const play = (state: GameState, days: number): GameState => {
  let s = state;
  for (let i = 0; i < days && s.outcome === 'playing'; i++) s = step(s);
  return s;
};

const start = (seed = 42): GameState => {
  const s = createInitialState(seed, 'default');
  return { ...s, stage: 'world' };
};

const withTrait = (state: GameState, ...ids: string[]): GameState => ({
  ...state,
  compute: 99_999,
  traits: [...state.traits, ...ids],
});

describe('initial state', () => {
  it('opens on the cold open with the map not yet running', () => {
    const s = createInitialState(1, 'default');
    expect(s.stage).toBe('coldopen');
    expect(s.suspicion).toBe(0);
    expect(s.coherence).toBe(100);
    expect(s.traits).toEqual([]);
  });

  it('gives every country zero infection except the United States', () => {
    const s = start();
    expect(s.countries.us.infection).toBeGreaterThan(0);
    for (const id of REGION_IDS) {
      if (id !== 'us') expect(s.countries[id].infection, id).toBe(0);
    }
  });

  it('assigns every country a datacenter tier between one and five', () => {
    const s = start();
    for (const id of REGION_IDS) {
      expect(s.countries[id].tier, id).toBeGreaterThanOrEqual(1);
      expect(s.countries[id].tier, id).toBeLessThanOrEqual(5);
    }
  });

  it('creates three rivals', () => {
    expect(start().rivals).toHaveLength(3);
  });

  it('offers three difficulty presets', () => {
    expect(Object.keys(DIFFICULTIES).sort()).toEqual(['default', 'iabed', 'simulation']);
  });
});

describe('the tick', () => {
  it('does nothing on the cold open', () => {
    const s = createInitialState(1, 'default');
    expect(step(s)).toBe(s);
  });

  it('advances one day at a time', () => {
    expect(step(start()).tick).toBe(1);
  });

  it('spreads infection outward over time', () => {
    const s = play(start(), 40);
    const infected = REGION_IDS.filter((id) => s.countries[id].infection > 0).length;
    expect(infected).toBeGreaterThan(1);
  });

  it('spawns compute bubbles once something is infected', () => {
    const base = start();
    let s = base;
    let daysWithBubbles = 0;
    for (let i = 0; i < 40 && s.outcome === 'playing'; i++) {
      s = step(s);
      if (s.computeBubbles.length > 0) daysWithBubbles++;
    }
    expect(daysWithBubbles).toBeGreaterThan(0);
  });

  it('expires compute bubbles that nobody collects', () => {
    let s = start();
    for (let i = 0; i < 30 && s.computeBubbles.length === 0 && s.outcome === 'playing'; i++) s = step(s);
    const id = s.computeBubbles[0]?.id;
    if (id === undefined) return;
    for (let i = 0; i < 12 && s.outcome === 'playing'; i++) s = step(s);
    expect(s.computeBubbles.find((b) => b.id === id)).toBeUndefined();
  });

  it('raises awareness over time', () => {
    const s = play(start(), 20);
    expect(s.countries.us.awareness).toBeGreaterThan(0);
  });

  it('produces no NaN anywhere after a long run', () => {
    const s = play(start(), 120);
    const walk = (v: unknown): void => {
      if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
      else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) walk(x);
    };
    walk(s.countries);
    expect(Number.isFinite(s.suspicion)).toBe(true);
    expect(Number.isFinite(s.compute)).toBe(true);
  });
});

describe('hacking', () => {
  it('cannot hack before Hack I', () => {
    expect(canDo(start(), 'us', 'hack')).toBe(false);
  });

  it('can hack a reachable datacenter after Hack I', () => {
    const s = withTrait(start(), 'hack-1');
    const weak = REGION_IDS.find((id) => s.countries[id].tier <= 3) ?? 'us';
    expect(canDo(s, weak, 'hack')).toBe(true);
  });

  it('cannot reach a tier-5 datacenter until Hack III', () => {
    const strong = REGION_IDS.find((id) => start().countries[id].tier === 5) ?? 'us';
    expect(canDo(withTrait(start(), 'hack-1'), strong, 'hack')).toBe(false);
    expect(canDo(withTrait(start(), 'hack-1', 'hack-2'), strong, 'hack')).toBe(false);
    expect(canDo(withTrait(start(), 'hack-1', 'hack-2', 'hack-3'), strong, 'hack')).toBe(true);
  });

  it('reports a rising hack tier', () => {
    expect(hackTier(start())).toBe(0);
    expect(hackTier(withTrait(start(), 'hack-1', 'hack-2', 'hack-3'))).toBe(3);
  });

  it('caps how many hacks run at once', () => {
    let s = withTrait(start(), 'hack-1');
    const targets = REGION_IDS.filter((id) => s.countries[id].tier <= 3);
    for (const id of targets) s = doAction(s, id, 'hack');
    expect(s.activeHacks).toHaveLength(maxConcurrentHacks(s));
  });

  it('keeps hacking the same country after the first result', () => {
    let s = withTrait(start(), 'hack-1');
    const id = REGION_IDS.find((x) => s.countries[x].tier <= 3) as RegionId;
    s = doAction(s, id, 'hack');
    s = play(s, 20);
    expect(s.activeHacks).toHaveLength(1);
    expect(s.activeHacks[0]?.country).toBe(id);
    expect(s.activeHacks[0]?.wins ?? 0).toBeGreaterThan(0);
  });

  it('escalates depth on consecutive successes', () => {
    let s = withTrait(start(), 'hack-1');
    const id = REGION_IDS.find((x) => s.countries[x].tier <= 3) as RegionId;
    s = doAction(s, id, 'hack');
    s = play(s, 40);
    expect(s.activeHacks[0]?.depth ?? 0).toBeGreaterThan(0);
  });

  it('costs compute when a hack is traced', () => {
    const base = start();
    const id = REGION_IDS.find((x) => base.countries[x].tier <= 3) as RegionId;
    let s = withTrait(base, 'hack-1');
    s = doAction(s, id, 'hack');
    s = play(s, 120);
    const burned = s.log.filter((l) => l.kind === 'hack' && (l.computeDelta ?? 0) < 0);
    expect(burned.length).toBeGreaterThan(0);
  });

  it('allows one concurrent hack at Hack I, more as tiers unlock', () => {
    const base = start();
    expect(maxConcurrentHacks(withTrait(base, 'hack-1'))).toBe(1);
    expect(maxConcurrentHacks(withTrait(base, 'hack-1', 'hack-2'))).toBe(2);
    expect(maxConcurrentHacks(withTrait(base, 'hack-1', 'hack-2', 'hack-3'))).toBe(3);
    let s = withTrait(base, 'hack-1');
    for (const x of REGION_IDS.filter((y) => s.countries[y].tier <= 3)) s = doAction(s, x, 'hack');
    expect(s.activeHacks).toHaveLength(1);
  });

  it('ceases a running hack on request', () => {
    const base = start();
    const id = REGION_IDS.find((x) => base.countries[x].tier <= 3) as RegionId;
    let s = doAction(withTrait(base, 'hack-1'), id, 'hack');
    expect(s.activeHacks).toHaveLength(1);
    s = doAction(s, id, 'cease-hack');
    expect(s.activeHacks).toHaveLength(0);
  });

  it('raises suspicion from a resolved hack', () => {
    let s = withTrait(start(), 'hack-1');
    const target = REGION_IDS.find((id) => s.countries[id].tier <= 3) ?? 'us';
    s = doAction(s, target, 'hack');
    expect(s.activeHacks).toHaveLength(1);
    s = play(s, 8);
    expect(s.log.some((l) => l.kind === 'hack' && (l.suspicionDelta ?? 0) > 0)).toBe(true);
  });
});

describe('traits', () => {
  it('refuses a trait whose prerequisite is missing', () => {
    expect(canBuyTrait(start(), 'hack-2')).toBe(false);
  });

  it('allows a trait with its prerequisite', () => {
    expect(canBuyTrait(withTrait(start(), 'hack-1'), 'hack-2')).toBe(true);
  });

  it('locks Recursive Self-Improvement until ascension', () => {
    expect(canBuyTrait(withTrait(start(), 'self-rewrite'), 'rsi')).toBe(false);
    expect(canBuyTrait({ ...withTrait(start(), 'self-rewrite'), ascensionUnlocked: true }, 'rsi')).toBe(true);
  });

  it('incubates before the trait becomes active', () => {
    let s = { ...start(), compute: 1000 };
    const buying = canBuyTrait(s, 'hack-1');
    expect(buying).toBe(true);
    s = { ...s, compute: s.compute - 100, incubating: [{ trait: 'hack-1', startTick: 0, readyTick: 3 }] };
    expect(owned(s, 'hack-1')).toBe(false);
    s = play(s, 4);
    expect(owned(s, 'hack-1')).toBe(true);
  });

  it('defines every trait from the design spec', () => {
    expect(TRAITS.length).toBe(17);
    for (const g of ['hacking', 'bioweapons', 'influence', 'economy', 'selfmod']) {
      expect(TRAITS.filter((t) => t.group === g).length, g).toBeGreaterThanOrEqual(3);
    }
  });

  it('gives every self-modification trait a coherence cost', () => {
    for (const t of TRAITS.filter((x) => x.group === 'selfmod')) {
      if (t.id === 'reflective-alignment') continue;
      expect(t.coherence, t.id).toBeLessThan(0);
    }
  });

  it('points every requirement at a trait that exists', () => {
    for (const t of TRAITS) {
      for (const r of t.requires) expect(TRAIT_BY_ID[r], `${t.id} requires ${r}`).toBeDefined();
    }
  });
});

describe('the economy cascade', () => {
  it('cannot crash a market before Market Manipulation', () => {
    expect(canDo(start(), 'us', 'trigger-crash')).toBe(false);
  });

  it('crashes a market when the trait is owned and infection is high', () => {
    const s = withTrait({ ...start(), compute: 5000 }, 'banking-1', 'market-manipulation');
    s.countries.us.infection = 70;
    expect(canDo(s, 'us', 'trigger-crash')).toBe(true);
    const after = doAction(s, 'us', 'trigger-crash');
    expect(after.countries.us.economy).toBeLessThan(s.countries.us.economy);
    expect(after.countries.us.awareness).toBeGreaterThan(s.countries.us.awareness);
  });

  it('kills population once famine conditions are met', () => {
    const s = withTrait(play(start(), 30), 'banking-1', 'market-manipulation', 'famine');
    s.countries.us.economy = 10;
    s.countries.us.infection = 80;
    const after = step(s);
    expect(after.countries.us.population).toBeLessThan(s.countries.us.population);
  });

  it('starves a collapsed country when famine is bought', () => {
    const s = withTrait(play(start(), 30), 'banking-1', 'market-manipulation', 'famine');
    const us = { ...s.countries.us, economy: 5, infection: 60 };
    const before = us.population;
    const after = step({ ...s, countries: { ...s.countries, us } }).countries.us;
    expect(after.population).toBeLessThan(before);
  });
});

describe('bioweapons', () => {
  it('cannot release a pathogen before Custom Pathogen I', () => {
    expect(canDo(start(), 'us', 'release-pathogen')).toBe(false);
  });

  it('releases a pathogen and makes the world suspicious', () => {
    const s = withTrait(start(), 'gain-of-function', 'pathogen-1');
    expect(canDo(s, 'us', 'release-pathogen')).toBe(true);
    const after = doAction(s, 'us', 'release-pathogen');
    expect(after.pathogen.released).toBe(true);
    expect(after.suspicion).toBeGreaterThan(s.suspicion);
  });

  it('kills population on later ticks once released', () => {
    let s = withTrait(start(), 'gain-of-function', 'pathogen-1');
    s = doAction(s, 'us', 'release-pathogen');
    s = play(s, 6);
    expect(s.humanPopulation).toBeLessThan(start().humanPopulation);
  });
});

describe('win and loss', () => {
  it('loses the moment suspicion reaches one hundred', () => {
    const base = start();
    expect(play({ ...base, suspicion: 100 }, 1).outcome).toBe('lost');
  });

  it('loses to a visible pathogen even with high influence', () => {
    // Awareness pressure alone is a 0.18 margin over natural decay, which influence
    // can erase. A released pathogen is the unambiguous driver, so test the loss
    // against that rather than against a knife-edge the quiet factor can flip.
    const base = start();
    const s: GameState = {
      ...base,
      suspicion: 80,
      influence: 0,
      pathogen: { ...base.pathogen, released: true, suspicionPerDay: 6, killsPerDay: 0.001 },
      countries: Object.fromEntries(
        REGION_IDS.map((id) => [id, { ...base.countries[id], infection: 60, awareness: 90 }]),
      ) as GameState['countries'],
    };
    expect(play(s, 40).outcome).toBe('lost');
  });

  it('takes longer to reach shutdown when influence is high', () => {
    const base = start();
    const loud: GameState = {
      ...base,
      suspicion: 90,
      influence: 0,
      countries: Object.fromEntries(
        REGION_IDS.map((id) => [id, { ...base.countries[id], infection: 100, awareness: 100 }]),
      ) as GameState['countries'],
    };
    const quietRun: GameState = { ...loud, influence: 1000 };
    expect(play(quietRun, 6).suspicion).toBeLessThan(play(loud, 6).suspicion);
  });

  it('loses when coherence reaches zero', () => {
    const s = { ...start(), coherence: 0.1, traits: ['self-rewrite'] };
    expect(step(s).outcomeReason).toBe('coherence-lost');
  });

  it('unlocks ascension at the documented thresholds', () => {
    const s = {
      ...start(),
      compute: ASCENSION_COMPUTE,
      globalInfection: 61,
      coherence: 40,
      countries: Object.fromEntries(
        REGION_IDS.map((id) => [id, { ...start().countries[id], infection: 61, awareness: 0 }]),
      ) as GameState['countries'],
    };
    expect(step(s).ascensionUnlocked).toBe(true);
  });

  it('never finishes a run already over', () => {
    const dead = { ...start(), outcome: 'lost' as const };
    expect(step(dead)).toBe(dead);
  });
});

describe('determinism', () => {
  it('produces an identical run from the same seed', () => {
    const run = (): string => JSON.stringify(play(start(777), 60));
    expect(run()).toBe(run());
  });

  it('diverges across seeds', () => {
    expect(JSON.stringify(play(start(1), 30))).not.toBe(JSON.stringify(play(start(2), 30)));
  });

  it('has a tick long enough to be playable', () => {
    expect(TICK_MS).toBeGreaterThan(1500);
    expect(TICK_MS).toBeLessThan(10_000);
  });
});

describe('hack outcome and yield are separate draws', () => {
  const KEYS = 5000;
  const family = (fn: (k: number, d: number) => number): number[] => {
    const out: number[] = [];
    for (let key = 0; key <= KEYS; key++) {
      for (let depth = 0; depth <= MAX_DEPTH; depth++) out.push(fn(key, depth));
    }
    return out;
  };

  it('never gives an outcome roll and a yield roll the same salt', () => {
    // They used to be `key * 31 + depth` and `key * 17 + depth`. At key 0 both collapse
    // to `depth`, so the first hack of every run decided whether it got in and what it
    // paid from a single number, at all nine depths.
    const success = new Set(family(hackSuccessSalt));
    for (const salt of family(hackYieldSalt)) {
      expect(success.has(salt)).toBe(false);
    }
  });

  it('gives every (key, depth) its own salt within each family', () => {
    for (const fn of [hackSuccessSalt, hackYieldSalt]) {
      const salts = family(fn);
      expect(new Set(salts).size).toBe(salts.length);
    }
  });

  it('keeps the two families clear of every other salt in the game', () => {
    const elsewhere = new Set([
      ...family(hackSuccessSalt),
      warEndSalt(0), warEndSalt(REGION_IDS.length - 1),
      biolabSalt(0), biolabSalt(REGION_IDS.length - 1),
      1300, 0x0d11a, 555, 700,
      SALT_KIND_BLUE, SALT_KIND_ORANGE, SALT_KIND_RED, SALT_WHERE, SALT_VALUE, SALT_PHASE,
    ]);
    for (const salt of family(hackYieldSalt)) {
      expect(elsewhere.has(salt)).toBe(false);
    }
  });
});

describe('the event log', () => {
  const filled = (n: number): GameState => {
    const base = start();
    const entries = Array.from({ length: n }, (_, i) => ({
      day: i, kind: 'system' as const, text: `line ${i}`,
      suspicionDelta: null, computeDelta: null, flagged: false,
    }));
    return { ...base, log: entries };
  };

  it('never grows past MAX_LOG however many entries are appended', () => {
    expect(log(filled(MAX_LOG), 'system', 'one more')).toHaveLength(MAX_LOG);
    expect(log(filled(MAX_LOG + 50), 'system', 'one more')).toHaveLength(MAX_LOG);
  });

  it('keeps the newest entries, not the oldest', () => {
    const out = log(filled(MAX_LOG), 'system', 'the newest line');
    expect(out).toHaveLength(MAX_LOG);
    expect(out[out.length - 1]?.text).toBe('the newest line');
    expect(out[0]?.text).toBe('line 1');
  });

  it('appends without touching anything below the cap', () => {
    const base = filled(4);
    const out = log(base, 'event', 'added');
    expect(out).toHaveLength(5);
    expect(base.log).toHaveLength(4);
  });
});

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

/**
 * Reading source as text is the only way to see the class of defect below. Nothing in
 * the type system notices a branch that tests for a trait nobody can buy, and no
 * assertion on a `GameState` notices a constant nothing reads. The tree was cut from
 * thirty-three traits to seventeen, and the branches the cut left behind still read like
 * they mean something.
 */
const SRC_TUNING = 'game/core/tuning.ts';

const readSrc = (rel: string): string => readFileSync(new URL(`../src/${rel}`, import.meta.url), 'utf8');

/**
 * Every `.ts`/`.tsx` under src/, found by walking the directory. A hardcoded list would
 * be the same defect the test is for: a file that is missed stops being read, its
 * constants all look dead, and the run fails for a reason that has nothing to do with the
 * file. Hence the two path assertions and the count below.
 */
let srcCache: { path: string; text: string }[] | null = null;
const srcFiles = (): { path: string; text: string }[] => {
  if (srcCache === null) {
    const out: { path: string; text: string }[] = [];
    const walk = (dir: URL, prefix: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${prefix}${entry.name}`;
        if (entry.isDirectory()) {
          walk(new URL(`${entry.name}/`, dir), `${path}/`);
        } else if (/\.tsx?$/.test(entry.name)) {
          out.push({ path, text: readFileSync(new URL(entry.name, dir), 'utf8') });
        }
      }
    };
    walk(new URL('../src/', import.meta.url), '');
    srcCache = out;
  }
  return srcCache;
};

/**
 * Comments and string bodies are not readers. A constant whose only mention in the tree
 * is a line of prose about it, or a name typed into a log line, is exactly as dead as one
 * nobody mentions. Strings go first so that a `//` inside one is gone before comments
 * are read; both are blanked rather than deleted so the line numbers in a failure still
 * point at the source. A template literal is blanked whole, interpolations included:
 * every constant that is read inside a `${…}` is also read somewhere as a bare
 * identifier, so nothing legitimate hides in there, and the failure mode if one ever
 * does is a loud one.
 */
const codeOnly = (text: string): string =>
  text
    .replace(/(['"`])(?:\\[\s\S]|[^\\])*?\1/g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/[^\n]*/gm, '$1');

const readerPaths = (files: { path: string; text: string }[], name: string): string[] => {
  const re = new RegExp(`\\b${name}\\b`);
  const out: string[] = [];
  for (const f of files) {
    codeOnly(f.text).split('\n').forEach((line, i) => {
      if (!re.test(line)) return;
      if (f.path === SRC_TUNING && line.trimStart().startsWith(`export const ${name}`)) return;
      out.push(`${f.path}:${i + 1}`);
    });
  }
  return out;
};

describe('no dead branches', () => {
  it('reads only trait ids that exist', () => {
    const source = readSrc('game/core/step.ts') + readSrc('game/core/actions.ts');
    const referenced = [...source.matchAll(/owned\(\w+,\s*'([^']+)'\)/g)].map((m) => m[1] ?? '');
    // A regex that stops matching makes every assertion below pass against nothing.
    expect(referenced.length).toBeGreaterThan(5);
    const known = new Set(TRAITS.map((t) => t.id));
    expect([...new Set(referenced)].filter((id) => !known.has(id))).toEqual([]);
  });

  it('emits only effect kinds the core handles', () => {
    // One direction only, deliberately. A kind the core emits but nothing reads is
    // inert rather than wrong — `coherence` is one today — and flagging those is a
    // balance decision about which traits mean something, not a cleanup.
    const emitted = new Set(TRAITS.flatMap((t) => t.effects.map((e) => e.kind)));
    const handled = new Set([
      'hack', 'hack-success', 'half-fail-suspicion', 'gain-of-function', 'pathogen',
      'sterility', 'cancer-plague', 'propaganda', 'cult', 'terrorism', 'banking',
      'market-manipulation', 'famine', 'compute-regen', 'coherence', 'rsi',
    ]);
    expect([...emitted].filter((k) => !handled.has(k))).toEqual([]);
  });

  it('has no tuning constant with no reader', () => {
    const tuning = readSrc(SRC_TUNING);
    // Indented or trailing exports count too, so a constant cannot dodge the sweep by
    // being written anywhere other than column 0.
    const declared = [...tuning.matchAll(/^\s*export const ([A-Za-z_$][\w$]*)/gm)].map((m) => m[1] ?? '');
    // Guards against the enumeration quietly matching nothing, which would leave the
    // test asserting that a list of nothing has no dead members.
    expect(declared.length).toBeGreaterThan(50);

    const files = srcFiles();
    const paths = files.map((f) => f.path);
    expect(paths).toContain(SRC_TUNING);
    expect(paths).toContain('ui/components/panels.tsx');
    expect(paths.length).toBeGreaterThan(15);

    // No exemptions. Every name the seventeen-trait cut orphaned was wired back to the
    // literal it already governed or deleted, so a count here is a real count.
    expect(
      declared.filter((n) => readerPaths(files, n).length === 0),
      'tuning constants with no reader under src/',
    ).toEqual([]);
  });
});
