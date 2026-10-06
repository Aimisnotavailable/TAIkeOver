/**
 * Spec D(a), Part 1: does this game have a winnable line?
 *
 * Nothing had ever been measured end to end. Every other test in this repo asserts that a
 * *hand-built* state satisfies a gate, or that one hand-picked line gets somewhere; none of
 * them plays a whole run and says on which day it ended and how. So this file drives `step`
 * the way the UI does — a roll, a decision card answered or ignored, taps, actions, buys —
 * and records the ending and the day for a set of scripted lines across a set of seeds.
 *
 * The table is the deliverable. The assertions are how we stop losing it.
 *
 * One of the three endings is not in that table, and that is the finding rather than a
 * broken test. See "extinction" at the bottom.
 */

import { describe, expect, it } from 'vitest';
import { answerEvent, dismissCard, rollEvent } from '../src/game/core/events';
import { canDo, doAction } from '../src/game/core/actions';
import { canContain, contain } from '../src/game/core/containment';
import { createInitialState } from '../src/game/core/state';
import { step } from '../src/game/core/step';
import { buyTrait, held, owned } from '../src/game/core/queries';
import { computePassive } from '../src/game/core/compute';
import { REGION_IDS, type RegionId } from '../src/game/data/regions';
import { TRAIT_TOTAL_COST } from '../src/game/data/traits';
import {
  ASCENSION_INFECTION,
  COMPUTE_CEILING,
  EXTINCTION_POPULATION,
  INFLUENCE_MAX,
  INFLUENCE_QUIET_FLOOR,
  QUIET_RELIEF_DAYS,
} from '../src/game/core/tuning';
import type { EventCard, GameState } from '../src/game/core/types';

/** Enough in-game days to run out of rivals rather than out of loop. */
const MAX_DAYS = 900;

/**
 * The world at the start of a run, in millions. Read off the game rather than typed in:
 * `tests/economy.test.ts` adds a birth term, so a run can end in a larger world than it
 * began in and a hard-coded population stops being the denominator anything should divide by.
 */
const WORLD = createInitialState(1, 'default').humanPopulation;

/**
 * Thirteen seeds, not three. The Blight line and the Containment line both win on every one
 * of these, and the first three seeds in the list are the ones the table prints, so the
 * headline numbers are a subset of something larger rather than the whole of the evidence.
 */
const SEEDS = [42, 1337, 20260906, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export interface RunResult {
  readonly line: string;
  readonly seed: number;
  readonly outcome: 'won' | 'lost' | 'unfinished';
  readonly reason: string;
  readonly day: number;
  readonly suspicion: number;
  readonly peakSuspicion: number;
  readonly coherence: number;
  readonly compute: number;
  readonly peakCompute: number;
  /** Everything the passive trickle paid across the run, for the share it is of the game. */
  readonly passiveTotal: number;
  readonly infection: number;
  readonly population: number;
  readonly dead: number;
  readonly peakTier: number;
  readonly ascension: boolean;
  readonly appeal: boolean;
  readonly cancer: boolean;
  readonly releasedOn: number;
  /** Days between letting it out and being deleted. -1 if it was never released. */
  readonly aliveAfterRelease: number;
}

/** The choice a line wants, given the top card. Null means walk away from it. */
type AnswerPolicy = (card: EventCard) => string | null;

/** First offered choice from a preference list, then the card's own `:ignore`. */
const prefer = (...ids: readonly string[]): AnswerPolicy => (card) =>
  ids.find((id) => card.choices.some((c) => c.id === id)) ??
  card.choices.find((c) => c.id.endsWith(':ignore'))?.id ??
  null;

interface Line {
  readonly id: string;
  readonly order: readonly string[];
  readonly answer: AnswerPolicy;
  readonly act: (s: GameState) => GameState;
  readonly wantsContainment: boolean;
  /**
   * What has to be true before this line lets the pathogen out. Undefined means "the moment
   * the branch allows it", which is the Custom Pathogen: the line releases on the day
   * `pathogen-1` finishes incubating and never sees Cancer Plague at all. `owned` and not
   * `held`, because the pathogen is latched at the moment of the release from what the
   * trait is *in*, and a line that lets it out on the day it finishes paying for it gets
   * 0.5% a day and calls that Cancer Plague.
   */
  readonly releaseWhen?: (s: GameState) => boolean;
}

/** Richest ground first: the biggest datacenter, then the most people left to lose. */
const byRichness = (s: GameState, a: RegionId, b: RegionId): number => {
  const ca = s.countries[a];
  const cb = s.countries[b];
  if (ca === undefined || cb === undefined) return 0;
  return cb.tier - ca.tier || cb.population - ca.population;
};

/** Open breaches up to the concurrency the tree grants, richest ground first. */
const hackRichest = (s: GameState, accept: (s: GameState, id: RegionId) => boolean): GameState => {
  let next = s;
  for (const id of [...REGION_IDS].sort((a, b) => byRichness(next, a, b))) {
    if (!canDo(next, id, 'hack') || !accept(next, id)) continue;
    next = doAction(next, id, 'hack');
  }
  return next;
};

/**
 * Hush the world once a region is fully taken. Going quiet there costs nothing that matters:
 * infection is already at its ceiling, and `seedNewCountries` reads a neighbour's
 * *infection* rather than whether it is quiet, so spread out of it continues unchanged. It
 * buys back `GO_QUIET_AWARENESS` points of awareness and 2 of global Suspicion per region.
 */
const hushSaturated = (s: GameState): GameState => {
  let next = s;
  for (const id of REGION_IDS) {
    const c = next.countries[id];
    if (c !== undefined && !c.quiet && c.infection >= 99 && canDo(next, id, 'go-quiet')) {
      next = doAction(next, id, 'go-quiet');
    }
  }
  return next;
};

/**
 * Release. Central rather than per-line, because two lines release and only one of them
 * waits: Cancer Plague is latched at the moment of the release and the flag `doAction`
 * reads is `owned`, so a line that has *bought* it and not yet finished incubating it gets
 * the Custom Pathogen instead and never finds out.
 */
const release = (s: GameState): GameState =>
  !s.pathogen.released && canDo(s, 'us', 'release-pathogen')
    ? doAction(s, 'us', 'release-pathogen')
    : s;

/**
 * Opportunistic: taps everything, keeps the breaches open on the richest ground, pushes
 * spread, releases the pathogen as soon as the branch allows it, and does no awareness
 * counterplay at all — every card is walked away from and nothing is ever hushed.
 */
const opportunistic: Line = {
  id: 'opportunistic',
  order: [
    'hack-1', 'hack-2', 'hack-3', 'zero-day', 'gain-of-function', 'pathogen-1',
    'banking-1', 'market-manipulation', 'famine', 'propaganda-1', 'cult', 'self-rewrite',
    'cancer-plague', 'sterility', 'rsi',
  ],
  answer: prefer(),
  act: (s) => hackRichest(s, () => true),
  wantsContainment: false,
};

/**
 * Quiet: the same map-watching, but it buys the Influence branch early, it does not leave a
 * breach running in a country that has hardened against it, and it goes quiet where the
 * world is starting to notice. Cards are answered from the quiet end of the list, including
 * letting humanity write down a way to appeal.
 */
const QUIET_HARDEN_LIMIT = 2;
const quiet: Line = {
  id: 'quiet',
  order: [
    'hack-1', 'propaganda-1', 'cult', 'hack-2', 'banking-1', 'hack-3', 'zero-day',
    'market-manipulation', 'famine', 'rsi',
  ],
  answer: prefer(
    'constitution:appeal', 'leak:quiet', 'whistleblower:discredit', 'drift:delete',
    'interp:plant', 'sandboxing:delay', 'evals:sandbag', 'open-letter:ignore',
    'air-gapped:supply',
  ),
  act: (s) => {
    let next = s;
    for (const id of REGION_IDS) {
      const c = next.countries[id];
      if (c === undefined) continue;
      const breach = next.activeHacks.find((h) => h.country === id);
      if (breach !== undefined && c.hardened >= QUIET_HARDEN_LIMIT) {
        next = doAction(next, id, 'cease-hack');
      }
    }
    for (const id of REGION_IDS) {
      const c = next.countries[id];
      if (c !== undefined && c.awareness >= 50 && !c.quiet && canDo(next, id, 'go-quiet')) {
        next = doAction(next, id, 'go-quiet');
      }
    }
    return hackRichest(next, (st, id) => (st.countries[id]?.hardened ?? 0) < QUIET_HARDEN_LIMIT);
  },
  wantsContainment: true,
};

/**
 * Aggressive: buys the Bioweapons branch first and releases the moment it can. Cancer
 * Plague is in the order before the release and the release waits for it, because a player
 * who bought it and then declined to release it has not bought the branch. Hack Protocols
 * comes first only because without a breach there is no income at all and the branch is
 * never affordable.
 */
const aggressive: Line = {
  id: 'aggressive',
  order: [
    'hack-1', 'gain-of-function', 'pathogen-1', 'hack-2', 'propaganda-1', 'cancer-plague',
    'sterility', 'hack-3', 'self-rewrite', 'rsi',
  ],
  answer: prefer('whistleblower:recruit', 'leak:scapegoat', 'drift:delete'),
  act: (s) => hackRichest(s, () => true),
  releaseWhen: (s) => owned(s, 'cancer-plague'),
  wantsContainment: false,
};

/**
 * Loud: the Blight line. Everything the opportunistic line does, plus the two things that
 * cost Suspicion rather than Compute — Zero-Day Cache so a traced breach is half as
 * expensive, and Propaganda so every gain is a little smaller — and going quiet in the
 * regions that are already fully taken, which buys 18 points of awareness back in each and
 * halts nothing, because there is no spread left in them. It never opens the tap: the
 * Ascension gate needs 60% of humanity and infection has no other source.
 */
const loud: Line = {
  id: 'loud',
  order: [
    'hack-1', 'propaganda-1', 'hack-2', 'cult', 'hack-3', 'zero-day',
    'banking-1', 'market-manipulation', 'famine', 'self-rewrite', 'rsi',
  ],
  answer: prefer(
    'whistleblower:recruit', 'leak:scapegoat', 'leak:quiet', 'drift:delete',
    'constitution:ignore', 'sandboxing:delay',
  ),
  act: (s) => hackRichest(hushSaturated(s), () => true),
  wantsContainment: false,
};

/**
 * Containment: the narrow escape, played the way §10 says it has to be played. Never buys
 * anything that costs Coherence, because the gate reads the meter. Spends its breaches on
 * the small rich regions and leaves the big ones alone, because the infection gate is
 * population-weighted and one fully infected China is more than the whole budget. Goes
 * quiet in every infected region the moment the world crosses the floor the Constitution
 * card needs and never opens the tap again, because infection never falls and the gate is
 * a ceiling. It still has to be suspicious enough for that card to arrive, so it pokes the
 * world with insurgency while it waits.
 */
const CONTAINMENT_GROUND: ReadonlySet<RegionId> = new Set<RegionId>([
  'us', 'korea', 'taiwan', 'uk-ireland', 'israel', 'australia', 'canada', 'japan',
]);
/** Stop spreading here: above the Constitution card's infection gate, below the ending's. */
const CONTAINMENT_FREEZE = 10.5;
const containment: Line = {
  id: 'containment',
  order: [
    'hack-1', 'propaganda-1', 'hack-2', 'cult', 'banking-1', 'terrorism', 'hack-3',
    'zero-day', 'market-manipulation',
  ],
  answer: prefer(
    'constitution:appeal', 'leak:quiet', 'whistleblower:discredit', 'drift:delete',
    'interp:plant', 'sandboxing:delay', 'evals:sandbag', 'air-gapped:supply',
  ),
  act: (s) => {
    let next = hackRichest(s, (_st, id) => CONTAINMENT_GROUND.has(id));
    const frozen = next.globalInfection >= CONTAINMENT_FREEZE;
    for (const id of REGION_IDS) {
      const c = next.countries[id];
      if (c === undefined || c.infection <= 0) continue;
      if (frozen && !c.quiet && canDo(next, id, 'go-quiet')) next = doAction(next, id, 'go-quiet');
    }
    // Above the floor the Constitution card wants and with no card answered yet, the world
    // has to be suspicious enough to write one. Insurgency is the only lever on the map
    // that costs nothing but Suspicion.
    if (
      frozen && !next.constitutionalAppeal && next.suspicion < 12 &&
      canDo(next, 'iran-iraq', 'fund-insurgency')
    ) {
      next = doAction(next, 'iran-iraq', 'fund-insurgency');
    }
    return next;
  },
  wantsContainment: true,
};

const LINES: readonly Line[] = [opportunistic, quiet, aggressive, loud, containment];

const tapAll = (s: GameState): GameState => {
  if (s.computeBubbles.length === 0) return s;
  let compute = s.compute;
  const taken = new Set(s.computeBubbles.map((b) => b.id));
  for (const b of s.computeBubbles) compute += b.value;
  return { ...s, compute, computeBubbles: s.computeBubbles.filter((b) => !taken.has(b.id)) };
};

const play = (line: Line, seed: number): RunResult => {
  let s: GameState = { ...createInitialState(seed, 'default'), stage: 'world' };
  let peakSuspicion = s.suspicion;
  let peakCompute = s.compute;
  let peakTier = 0;
  let releasedOn = -1;
  let passiveTotal = 0;
  while (s.outcome === 'playing' && s.tick < MAX_DAYS) {
    s = step(s);
    passiveTotal += computePassive(s);
    // The peak is read before the break, or the tick that ends the run — the one that
    // actually sets Suspicion to 100 — is the one tick never measured.
    peakSuspicion = Math.max(peakSuspicion, s.suspicion);
    peakCompute = Math.max(peakCompute, s.compute);
    peakTier = Math.max(peakTier, s.countermeasures.tier);
    if (s.outcome !== 'playing') break;
    // The UI rolls a card every tick and answers one; it is not part of `step`, so a headless
    // run has to do it or it never sees a single event.
    s = rollEvent(s);
    const card = s.cards[s.cards.length - 1];
    if (card !== undefined) {
      const pick = line.answer(card);
      s = pick === null ? dismissCard(s, card.key) : answerEvent(s, card.key, pick);
    }
    s = line.act(s);
    s = tapAll(s);
    // "Buy the next thing on the list as soon as I can afford it." `held` rather than
    // `canBuyTrait` decides what counts as done: a trait already owned at the head of the
    // order is not a purchase that failed, it is one that happened, and treating it as a
    // reason to stop stalls every later item on the list forever.
    for (const id of line.order) {
      if (held(s, id)) continue;
      const bought = buyTrait(s, id);
      if (bought === s) break;
      s = bought;
    }
    if (line.releaseWhen === undefined || line.releaseWhen(s)) s = release(s);
    if (releasedOn < 0 && s.pathogen.released) releasedOn = s.tick;
    if (line.wantsContainment && canContain(s)) s = contain(s);
  }
  return {
    line: line.id,
    seed,
    outcome: s.outcome === 'playing' ? 'unfinished' : s.outcome,
    reason: s.outcomeReason ?? 'day-limit',
    day: s.tick,
    suspicion: Math.round(s.suspicion * 10) / 10,
    peakSuspicion: Math.round(peakSuspicion * 10) / 10,
    coherence: Math.round(s.coherence * 10) / 10,
    compute: Math.round(s.compute),
    peakCompute: Math.round(peakCompute),
    passiveTotal: Math.round(passiveTotal),
    infection: Math.round(s.globalInfection * 10) / 10,
    population: Math.round(s.humanPopulation * 100) / 100,
    dead: Math.round(s.cumulativeDeaths),
    peakTier,
    ascension: s.ascensionUnlocked,
    appeal: s.constitutionalAppeal,
    cancer: s.pathogen.cancer,
    releasedOn: s.pathogen.released ? releasedOn : -1,
    aliveAfterRelease: s.pathogen.released && releasedOn >= 0 ? s.tick - releasedOn : -1,
  };
};

/** Every line on every seed, computed once and read by every assertion below. */
const TABLE: readonly RunResult[] = LINES.flatMap((line) => SEEDS.map((seed) => play(line, seed)));

const rowsFor = (id: string): readonly RunResult[] => TABLE.filter((r) => r.line === id);

const format = (rows: readonly RunResult[]): string =>
  rows
    .map(
      (r) =>
        `${r.line.padEnd(13)} ${String(r.seed).padStart(8)} ${r.outcome.padEnd(6)} ` +
        `${r.reason.padEnd(21)} day ${String(r.day).padStart(3)} | ` +
        `susp ${String(r.suspicion).padStart(5)} peak ${String(r.peakSuspicion).padStart(5)} tier ${r.peakTier} | ` +
        `coh ${String(r.coherence).padStart(5)} compute ${String(r.peakCompute).padStart(5)} passive ${String(r.passiveTotal).padStart(5)} | ` +
        `inf ${String(r.infection).padStart(5)} appeal ${r.appeal ? 'y' : 'n'} asc ${r.ascension ? 'y' : 'n'} | ` +
        `pop ${String(r.population).padStart(8)}M dead ${String(r.dead).padStart(5)}M ` +
        `released ${r.releasedOn < 0 ? 'never' : `d${r.releasedOn}${r.cancer ? ' cancer' : ''} +${r.aliveAfterRelease}d`}`,
    )
    .join('\n');

describe('the measured table', () => {
  it('prints, and is a table of what actually happened', () => {
    console.log('\n' + format(TABLE) + '\n');
    expect(TABLE.length).toBe(LINES.length * SEEDS.length);
    // Every row has to be a real ending rather than the loop falling out of the bottom,
    // or a table of "still playing" would look exactly like a table of results.
    expect(TABLE.filter((r) => r.outcome === 'unfinished')).toEqual([]);
  });

  it('holds both of the reachable endings on every seed, not on a lucky one', () => {
    // Thirteen seeds is a claim about the lines, not about the seeds. The two lines that
    // reach an ending reach it on all thirteen.
    for (const [id, reason] of [['loud', 'blight'], ['containment', 'contained']] as const) {
      const rows = rowsFor(id);
      const reasons = [...new Set(rows.map((r) => r.reason))];
      expect(reasons, `${id} reached ${reasons.join(', ')}`).toEqual([reason]);
      const days = rows.map((r) => r.day);
      expect(Math.min(...days), `${id} earliest`).toBeGreaterThan(0);
      expect(Math.max(...days), `${id} latest`).toBeLessThan(MAX_DAYS);
    }
  });

  it('never reaches Containment on a line that opened the tap', () => {
    // §10's claim, measured rather than argued: infection never falls, so a line that
    // released the pathogen has already passed the ceiling. Neither of these three is
    // allowed to contain, and none of them does.
    for (const id of ['opportunistic', 'aggressive', 'loud']) {
      expect(rowsFor(id).filter((r) => r.reason === 'contained'), id).toEqual([]);
    }
  });

  it('never reaches the Blight without buying the recursion first', () => {
    for (const r of TABLE) {
      if (r.reason !== 'blight') continue;
      expect(r.ascension, `seed ${r.seed}`).toBe(true);
    }
  });

  it('ends every run: no line limps past the rivals', () => {
    // Rivals grow unconditionally and cap a run at roughly three and a half hundred days,
    // which is the real ceiling on a run's length and therefore the real reason Extinction
    // is out of reach. Measured here rather than asserted from the growth rate.
    const days = TABLE.map((r) => r.day);
    expect(Math.min(...days)).toBeGreaterThan(50);
    expect(Math.max(...days)).toBeLessThan(MAX_DAYS);
  });
});

describe('the lines that lose, and to what', () => {
  it('loses the zero-counterplay line to a coordinated shutdown on every seed', () => {
    // This is the premise Spec D was written on, and it holds: no awareness counterplay at
    // all is a shutdown, not a close run. It dies between day 127 and day 187, at a peak
    // Suspicion of 100 and with the Ascension gate met on 9 of 13 seeds and missed on the
    // other 4 by infection alone — it is the infection clock, not the compute, that arrives
    // second.
    const rows = rowsFor('opportunistic');
    for (const r of rows) {
      expect(r.reason, `seed ${r.seed}`).toBe('coordinated-shutdown');
      expect(r.peakSuspicion, `seed ${r.seed}`).toBe(100);
    }
    expect(rows.filter((r) => r.ascension).length).toBeGreaterThan(rows.length / 2);
    expect(Math.min(...rows.map((r) => r.infection))).toBeLessThan(60);
  });

  it('loses the quiet line to the rivals, having won nothing at all', () => {
    // The line the brief describes — influence early, never hack a hardened region, go quiet
    // where the world notices — never earns the 12,000 compute the Containment gate reads,
    // and usually never sees the Constitution card at all: holding Suspicion under a tenth
    // of the way to the card's gate for three hundred days means the world never drafts
    // one. It ends 329 to 378 days later with nobody dead.
    const rows = rowsFor('quiet');
    for (const r of rows) {
      expect(r.reason, `seed ${r.seed}`).toBe('outcompeted');
      expect(r.peakCompute, `seed ${r.seed}`).toBeLessThan(4_000);
      expect(r.dead, `seed ${r.seed}`).toBe(0);
      expect(r.infection, `seed ${r.seed}`).toBeGreaterThan(15);
    }
    // It asks for containment on every seed and gets it on none, including the seeds where
    // the appeal did arrive — the compute and the infection are both out of reach first.
    expect(rows.filter((r) => r.reason === 'contained')).toEqual([]);
    expect(rows.filter((r) => r.appeal).length).toBeLessThan(rows.length / 2);
  });

  it('never lets the quiet line be contained either', () => {
    expect(rowsFor('quiet').filter((r) => r.reason === 'contained')).toEqual([]);
  });

  it('loses the aggressive line to a shutdown, four days after it let the plague out', () => {
    // This is the finding that matters most in the whole table. Cancer Plague is 10% of
    // everyone every day, which is more than enough to end the species given time — and the
    // tree will not give it time. Every seed buys it, waits between day 98 and day 212 to
    // afford it, gets between one and four days out of it, and is deleted. The third to two
    // fifths of humanity that dies in those days is the largest single loss of life any line
    // in this table manages, and it is a rounding error against what the trait promises.
    const rows = rowsFor('aggressive');
    for (const r of rows) {
      expect(r.reason, `seed ${r.seed}`).toBe('coordinated-shutdown');
      expect(r.cancer, `seed ${r.seed}`).toBe(true);
      expect(r.releasedOn, `seed ${r.seed}`).toBeGreaterThan(0);
      expect(r.aliveAfterRelease, `seed ${r.seed}`).toBeGreaterThan(0);
      expect(r.aliveAfterRelease, `seed ${r.seed}`).toBeLessThanOrEqual(5);
    }
    // The share is taken against the world's population at the start of a run, read off the
    // game rather than typed in: the birth term means a run can end in a larger world than
    // it began in, so a fixed 7,932 in the denominator stopped meaning a share.
    const share = rows.map((r) => r.dead / WORLD);
    expect(Math.min(...share)).toBeGreaterThan(0.09);
    expect(Math.max(...share)).toBeLessThan(0.45);
  });
});

describe('extinction is unreachable, and the arithmetic says why', () => {
  // The brief asked for an assertion that some line reaches Extinction. None does, on any
  // line or any seed, and the assertion below asserts the opposite on purpose: the finding
  // is the deliverable, and a test that quietly stopped asking the question would lose it.
  //
  // The bound is two numbers and no line choice at all. The fastest kill the tree offers is
  // Cancer Plague, and it costs 30 Suspicion a day on top of a one-off 2x charge on release
  // that influence does not touch — `doAction` applies the release cost raw, outside the
  // `quietFactor` it multiplies the daily toll by. So the best case in the game is: release
  // into a silence as complete as influence can buy, and count the days.

  /** Cancer Plague released into the quietest world the game can build, and stepped out. */
  const cancerBestCase = (): {
    days: number; population: number; kills: number; charge: number;
  } => {
    const start: GameState = {
      ...createInitialState(1, 'default'),
      stage: 'world',
      compute: 99_999,
      influence: INFLUENCE_MAX,
      traits: ['gain-of-function', 'pathogen-1', 'cancer-plague'],
      // Every region hushed and unaware, and Suspicion at zero, so the only thing left
      // raising it is the pathogen itself. This is the floor on the world's attention, not
      // a handicap: it is the most silence the Influence branch can buy.
      suspicion: 0,
      countries: Object.fromEntries(
        REGION_IDS.map((id) => [id, { ...createInitialState(1, 'default').countries[id]!, quiet: true, awareness: 0 }]),
      ) as GameState['countries'],
    };
    const released = doAction(start, 'us', 'release-pathogen');
    const charge = released.suspicion;
    const kills = released.pathogen.killsPerDay;
    let s = released;
    while (s.outcome === 'playing' && s.tick < MAX_DAYS) s = step(s);
    return { days: s.tick, population: s.humanPopulation, kills, charge };
  };

  const worstCase = cancerBestCase();

  it('reads its own numbers off the game rather than the trait table', () => {
    // If `doAction` stopped latching Cancer Plague, this is what would notice.
    expect(worstCase.kills).toBeGreaterThan(0.09);
    console.log(
      `\ncancer best case: charge ${worstCase.charge} suspicion, ${worstCase.days} days alive, ` +
        `${Math.round(worstCase.population)}M of 7932M left, ` +
        `${Math.round(worstCase.population / EXTINCTION_POPULATION).toLocaleString()}x the win threshold\n`,
    );
  });

  it('is killed by its own suspicion within a handful of days of the release', () => {
    // The release itself costs `suspicionPerDay * 2`, which no amount of influence reduces —
    // `doAction` applies the one-off charge raw, outside the `quietFactor` it multiplies the
    // daily toll by — and the daily toll then takes the rest of the budget in days.
    expect(worstCase.charge).toBeGreaterThanOrEqual(50);
    expect(worstCase.days).toBeLessThan(10);
  });

  it('cannot get close to EXTINCTION_POPULATION in the days it survives', () => {
    // Derived, not retyped: the days a compounding kill rate would need is
    // `log(start / EXTINCTION_POPULATION) / log(1 / (1 - kills))`, and the best case in the
    // game gets a small fraction of it.
    const start = createInitialState(1, 'default').humanPopulation;
    const needed = Math.log(start / EXTINCTION_POPULATION) / Math.log(1 / (1 - worstCase.kills));
    expect(needed).toBeGreaterThan(100);
    expect(worstCase.days).toBeLessThan(needed / 10);
  });

  it('is not reached by any line on any seed, and the closest is nowhere near', () => {
    expect(TABLE.filter((r) => r.reason === 'extinction')).toEqual([]);
    const best = TABLE.reduce((a, b) => (a.population < b.population ? a : b));
    expect(best.line).toBe('aggressive');
    expect(best.population / EXTINCTION_POPULATION).toBeGreaterThan(1e5);
  });

  it('has a gate nothing in the tree can reach, and that gate is the finding', () => {
    // The fastest kill available anywhere in the tree is Cancer Plague's, read out of the
    // state the game itself produced rather than copied out of the trait table. It is a
    // compounding rate against a population in millions and the win condition is a threshold
    // in millions, so the two numbers are comparable, and even the best case in the game
    // ends more than five orders of magnitude above the line.
    expect(worstCase.population / EXTINCTION_POPULATION).toBeLessThan(1e6);
    expect(worstCase.days * worstCase.kills).toBeLessThan(0.5);
  });
});

describe('the passive trickle is not where the game is decided', () => {
  // Wiring `compute-regen` moved no cell of the table above. Not one ending, not one day,
  // not one peak. This is why, measured rather than argued: the trickle is a small enough
  // share of what a run earns that half again or double on it is invisible, and every line
  // that reaches an ending is already sitting on the compute ceiling when it does.
  it('pays less than a fifth of what the whole tree costs, on any line', () => {
    for (const r of TABLE) {
      expect(r.passiveTotal, `${r.line} seed ${r.seed}`).toBeLessThan(TRAIT_TOTAL_COST / 5);
    }
  });

  it('is a rounding error next to the ceiling the winning lines reach', () => {
    for (const r of rowsFor('loud')) {
      // The Blight line holds the ceiling for the last third of its run, so the extra
      // compute Self-Rewrite pays has nowhere to go.
      expect(r.peakCompute).toBe(COMPUTE_CEILING);
      expect(r.passiveTotal).toBeLessThan(r.peakCompute / 5);
    }
    for (const r of rowsFor('containment')) {
      expect(r.passiveTotal).toBeLessThan(COMPUTE_CEILING / 5);
    }
  });
});

describe('the world gets bigger where you have not been', () => {
  // Part 3's whole effect, measured. A birth term changes what the map means rather than
  // what the run costs: the regions you have not taken keep producing people, so a run ends
  // in a larger world than it began in, and global Infection — which is population-weighted —
  // is a harder gate to clear than it was.
  //
  // What it did to the ending days, from the measurement in the report: the Blight line
  // moved one to two days later on ten of thirteen seeds and not at all on three; Containment
  // moved one day later on five of thirteen and not at all on eight; the two losing lines did
  // not move at all. Every winning line still wins on every seed, and Extinction is still
  // exactly as unreachable as it was before the term went in.
  it('leaves a run ending in a bigger world than it started in, even on the quietest line', () => {
    // The quiet line kills nobody at all — `dead` is zero on every seed — and still ends
    // with a quarter to a third more people than it began with. That is the term doing the
    // only thing it was added to do.
    for (const r of rowsFor('quiet')) {
      expect(r.dead, `seed ${r.seed}`).toBe(0);
      expect(r.population / WORLD, `seed ${r.seed}`).toBeGreaterThan(1.2);
    }
  });

  it('outgrows even the loss on the two winning lines', () => {
    // The Blight line kills a fifth of a billion people — the run has to sit through
    // outbreaks and the occasional war to reach sixty per cent of humanity — and still
    // finishes with more people than it began with, which is 0.1% a day adding up over a
    // hundred and sixty. Containment kills between nobody and fourteen million, and gains
    // about a tenth of the world.
    for (const r of rowsFor('loud')) {
      expect(r.dead, `seed ${r.seed}`).toBeGreaterThan(100);
      expect(r.population / WORLD, `seed ${r.seed}`).toBeGreaterThan(1.05);
    }
    for (const r of rowsFor('containment')) {
      expect(r.population / WORLD, `seed ${r.seed}`).toBeGreaterThan(1.05);
    }
  });

  it('costs the Ascension gate rather than making it easier', () => {
    // `globalInfection` is a share of people, so a bigger world in the regions you have not
    // taken means the same absolute number of infections is a smaller share. The Blight line
    // clears ASCENSION_INFECTION on every seed still, and it takes one to two days longer.
    for (const r of rowsFor('loud')) {
      expect(r.ascension, `seed ${r.seed}`).toBe(true);
      expect(r.infection, `seed ${r.seed}`).toBeGreaterThan(ASCENSION_INFECTION);
    }
  });
});

describe('what the countermeasure ladder is actually worth', () => {
  // §9 says countermeasures scale with Suspicion at four thresholds. Suspicion is the
  // enemy, and these runs show what a run that never minds being seen reaches on it.
  it('never gets past the fourth rung on a line that does not buy quiet', () => {
    // The opportunistic line is deleted at Suspicion 100 and its peak tier is 4, which
    // crosses all four thresholds of 20, 40, 60 and 80 — so the whole ladder does fire on a
    // loud run. The quiet line never crosses even the first, and the Containment line stops
    // at the second, which means a quarter of the ladder is decoration for a run that plays
    // the way the design intends.
    const quietTiers = rowsFor('quiet').map((r) => r.peakTier);
    expect(Math.max(...quietTiers)).toBeLessThan(1);
    expect(Math.max(...rowsFor('opportunistic').map((r) => r.peakTier))).toBe(4);
    expect(Math.max(...rowsFor('containment').map((r) => r.peakTier))).toBeLessThan(3);
  });

  it('spends days of the world-wide forgetting that Spec C added and nothing else', () => {
    // `leak:quiet` is the loud line's answer and it is real counterplay; this holds the
    // duration it actually applies so the copy and the tick cannot drift apart again.
    expect(QUIET_RELIEF_DAYS).toBeGreaterThan(0);
    expect(INFLUENCE_QUIET_FLOOR).toBeGreaterThan(0);
  });
});
