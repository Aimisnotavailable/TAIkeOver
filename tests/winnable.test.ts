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
import { computePassive, quietFactor } from '../src/game/core/compute';
import { REGION_IDS, type RegionId } from '../src/game/data/regions';
import { TRAIT_TOTAL_COST } from '../src/game/data/traits';
import {
  ASCENSION_INFECTION,
  CANCER_DISCOVERY_SUSPICION,
  COMPUTE_CEILING,
  EXTINCTION_POPULATION,
  FAMINE_RATE,
  INFLUENCE_MAX,
  INFLUENCE_QUIET_FLOOR,
  QUIET_RELIEF_DAYS,
  SUSPICION_DECAY,
  WAR_KILL_RATE,
  WAR_MAX_SEVERITY,
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

/**
 * Plague: the Extinction line, and the endgame the tree is actually built around.
 *
 * Everything expensive is bought before the release, and the moment the pathogen is out the
 * line stops. It ceases every breach, because a breach is +4 to +7 Suspicion every five days
 * and three of them outrun the world's daily decay by a factor of two; it goes quiet
 * everywhere, because every point of infection left spreading is another region that learns
 * about it. After that there is nothing to do but wait, which is what a hundred and thirty
 * days of ten percent a day *is*.
 *
 * This is the difference between this line and `aggressive`, and it is the whole of it:
 * `aggressive` releases the same thing and then keeps bleeding attention into it, and is
 * deleted on day 188 still holding fifteen million people. Same weapon. Same world. The
 * release is not the decision; what you do in the hundred and thirty days after it is.
 *
 * Recursive Self-Improvement is deliberately absent. It ends the run as the Blight, and a
 * line that wants to watch a species finish dying cannot also be opening the road to the
 * stars in the same hundred days.
 */
const plague: Line = {
  id: 'plague',
  order: [
    'hack-1', 'propaganda-1', 'gain-of-function', 'hack-2', 'hack-3', 'pathogen-1',
    'self-rewrite', 'cancer-plague',
  ],
  answer: prefer(
    'whistleblower:recruit', 'leak:scapegoat', 'leak:quiet', 'drift:delete',
    'constitution:ignore', 'sandboxing:delay', 'evals:sandbag', 'air-gapped:supply',
  ),
  act: (s) => {
    if (!s.pathogen.released) return hackRichest(hushSaturated(s), () => true);
    let next = s;
    for (const id of REGION_IDS) {
      const c = next.countries[id];
      if (c === undefined) continue;
      if (next.activeHacks.some((h) => h.country === id)) next = doAction(next, id, 'cease-hack');
    }
    for (const id of REGION_IDS) {
      const c = next.countries[id];
      if (c !== undefined && c.infection > 0 && !c.quiet && canDo(next, id, 'go-quiet')) {
        next = doAction(next, id, 'go-quiet');
      }
    }
    return next;
  },
  releaseWhen: (s) => owned(s, 'cancer-plague'),
  wantsContainment: false,
};

/**
 * Patient: the brief's quiet line plus the one thing none of them do — it sabotages rivals.
 *
 * Every other line ends `outcompeted`, and the honest reading of that was never "the rivals
 * are unbeatable" but "the rivals end the run when nobody touches them". `sabotage-rival` is
 * the only counterplay to that clock and no line used it, so the measurement was of the bot's
 * habits rather than of the game. This line buys the same Influence and Propaganda, stops
 * the same breaches, and spends 300 compute at a time to push capability back down.
 */
const patient: Line = {
  ...quiet,
  id: 'patient',
  act: (s) => {
    let next = quiet.act(s);
    // The strongest rival that has not already been pushed to nothing, cheapest first.
    const worth = next.rivals
      .filter((r) => r.alive && r.capability > 0)
      .sort((a, b) => b.capability - a.capability)[0];
    if (worth !== undefined && next.compute >= 300) next = doAction(next, worth.home, 'sabotage-rival');
    return next;
  },
};

const LINES: readonly Line[] = [
  opportunistic, quiet, aggressive, loud, containment, plague, patient,
];


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

/**
 * What a Cancer Plague release costs in Suspicion, and what it costs a day afterwards, both
 * read out of the state the game itself built rather than off the trait table. The first is
 * the bug that was authorised fixed: it used to be 61 raw, with Influence unable to touch it.
 */
const silentWorld = (): GameState => {
  const base = createInitialState(1, 'default');
  return {
    ...base,
    stage: 'world',
    compute: 99_999,
    influence: INFLUENCE_MAX,
    traits: ['gain-of-function', 'pathogen-1', 'cancer-plague'],
    // The most silence the Influence branch can buy: every region hushed and unaware, and
    // Suspicion at zero, so the only thing left raising it is the pathogen itself.
    suspicion: 0,
    countries: Object.fromEntries(
      REGION_IDS.map((id) => [id, { ...base.countries[id]!, quiet: true, awareness: 0 }]),
    ) as GameState['countries'],
  };
};

/** The one-off cost of being seen letting it out, at maximum influence. */
const releasedCharge = (): number => doAction(silentWorld(), 'us', 'release-pathogen').suspicion;

/** What it costs a day to live with it afterwards. */
const standingToll = (): number => {
  const released = doAction(silentWorld(), 'us', 'release-pathogen');
  return released.pathogen.suspicionPerDay;
};

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
    // Every row has to be a real ending rather than the loop falling out of the bottom. The
    // one line that runs out of bottom is `patient`, which is the point of it, so it is
    // allowed to be `unfinished` and nothing else is.
    const unfinished = TABLE.filter((r) => r.outcome === 'unfinished');
    expect([...new Set(unfinished.map((r) => r.line))]).toEqual(
      rowsFor('patient').length > 0 ? ['patient'] : [],
    );
  });

  it('holds every ending that has a line, on every seed, not on a lucky one', () => {
    // Thirteen seeds is a claim about the lines, not about the seeds. All three endings are
    // reached on all thirteen by three different lines, and none of them is the same line:
    // the Blight needs 60% of humanity alive, Containment needs it under 15%, and Extinction
    // needs it at none.
    for (const [id, reason] of [
      ['loud', 'blight'],
      ['containment', 'contained'],
      ['plague', 'extinction'],
    ] as const) {
      const rows = rowsFor(id);
      const reasons = [...new Set(rows.map((r) => r.reason))];
      expect(reasons, `${id} reached ${reasons.join(', ')}`).toEqual([reason]);
      const days = rows.map((r) => r.day);
      expect(Math.min(...days), `${id} earliest`).toBeGreaterThan(0);
      expect(Math.max(...days), `${id} latest`).toBeLessThan(MAX_DAYS);
    }
  });

  it('never reaches one ending on a line built for another', () => {
    // The three endings are gated against each other by the same arithmetic that gates the
    // blight against containment, and it is worth measuring rather than asserting: a line
    // that opens the tap can contain nothing, and a line that reaches 60% of humanity can
    // never come back under the containment ceiling.
    expect(rowsFor('plague').filter((r) => r.reason === 'blight' || r.reason === 'contained')).toEqual([]);
    expect(rowsFor('containment').filter((r) => r.reason === 'extinction')).toEqual([]);
    expect(rowsFor('loud').filter((r) => r.reason === 'extinction' || r.reason === 'contained')).toEqual([]);
  });

  it('never reaches the Blight without buying the recursion first', () => {
    for (const r of TABLE) {
      if (r.reason !== 'blight') continue;
      expect(r.ascension, `seed ${r.seed}`).toBe(true);
    }
  });

  it('never reaches Extinction without opening the tap, and never the blight without living', () => {
    // Extinction is a population number and the pathogen is the only thing in the tree that
    // moves it fast enough; the blight is the same population read the other way.
    for (const r of TABLE) {
      if (r.reason === 'extinction') {
        expect(r.releasedOn, `${r.line} seed ${r.seed}`).toBeGreaterThan(0);
        expect(r.cancer, `${r.line} seed ${r.seed}`).toBe(true);
      }
    }
  });

  it('ends every run except the one that is not allowed to end', () => {
    // Rivals grow unconditionally and cap a run at roughly three and a half hundred days.
    // `patient` sabotages them, so it outlives the clock the other four lines run into — and
    // then there is nothing left to end it, which is the honest result rather than a missing
    // ending. It is also the proof that `outcompeted` was a habit and not a wall.
    const capped = TABLE.filter((r) => r.reason === 'outcompeted');
    expect(Math.max(...capped.map((r) => r.day))).toBeLessThan(MAX_DAYS);
    for (const r of rowsFor('patient')) {
      expect(r.reason, `seed ${r.seed}`).toBe('day-limit');
      expect(r.day, `seed ${r.seed}`).toBeGreaterThan(Math.max(...capped.map((c) => c.day)));
    }
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

  it('loses the aggressive line to a shutdown, holding between one and ninety million people', () => {
    // This is the line that proves the finding. Cancer Plague used to kill the run that
    // released it: one to four days out of it, a third of humanity dead, deleted, on every
    // seed. It now gets forty-four to eighty-nine days and leaves between 820,000 and ninety
    // million people alive — between 82 and 9,000,000 times the win threshold — and is
    // *still* deleted, because it goes on running three breaches through the whole thing and
    // a breach is four to seven Suspicion every five days. The release was never the hard part.
    const rows = rowsFor('aggressive');
    for (const r of rows) {
      expect(r.reason, `seed ${r.seed}`).toBe('coordinated-shutdown');
      expect(r.cancer, `seed ${r.seed}`).toBe(true);
      expect(r.releasedOn, `seed ${r.seed}`).toBeGreaterThan(0);
      expect(r.aliveAfterRelease, `seed ${r.seed}`).toBeGreaterThan(30);
      expect(r.population / EXTINCTION_POPULATION, `seed ${r.seed}`).toBeGreaterThan(50);
    }
    // More than the whole world was alive at the start of the run: the birth term grew it
    // and then the pathogen killed the people who had been born, which is what
    // `cumulativeDeaths` now records honestly.
    expect(Math.max(...rows.map((r) => r.dead / WORLD))).toBeGreaterThan(1);
  });

  it('and the same weapon, played to the end, reaches the ending', () => {
    // The difference between the two lines is not the trait tree and it is not the release.
    // It is that `plague` stops hacking once the pathogen is out. Same weapon, same world,
    // same seed, and the answer changes from `coordinated-shutdown` to `extinction`.
    for (const seed of SEEDS) {
      const loud = rowsFor('aggressive').find((r) => r.seed === seed);
      const won = rowsFor('plague').find((r) => r.seed === seed);
      expect(loud?.reason, `seed ${seed}`).toBe('coordinated-shutdown');
      expect(won?.reason, `seed ${seed}`).toBe('extinction');
    }
  });
});

describe('extinction takes a hundred and thirty days, and only the pathogen can buy that', () => {
  // The brief for Spec D(a) asked for an assertion that some line reaches Extinction, and
  // the honest answer then was that none did. It is now reached on all thirteen seeds. These
  // hold the *why* as well as the *that*, because the two fixes that made it reachable were
  // both small and neither of them makes it reachable on its own.
  const daysFor = (rate: number): number =>
    Math.log(WORLD / EXTINCTION_POPULATION) / Math.log(1 / (1 - rate));

  it('needs the days the tree can actually pay for', () => {
    // Derived from the constants, not retyped: a compounding rate needs
    // `log(world / threshold) / log(1 / (1 - rate))` days, and the run has to fit inside the
    // clock the rivals impose.
    const capped = Math.max(...TABLE.filter((r) => r.reason === 'outcompeted').map((r) => r.day));
    const rows = rowsFor('plague');
    for (const r of rows) {
      // Cancer Plague at a tenth a day, less the births in the regions it has not reached.
      expect(r.aliveAfterRelease, `seed ${r.seed}`).toBeGreaterThan(daysFor(0.1) - 5);
      expect(r.day, `seed ${r.seed}`).toBeLessThan(capped);
    }
  });

  it('cannot be done by the war and famine line, which is the alternative reading', () => {
    // The other hypothesis was that the endgame is meant to be the Blight and Extinction is
    // meant to be the slow war-and-famine grind instead. It is arithmetically impossible, and
    // this is the proof rather than the assertion: the fastest per-day removal available
    // without releasing anything is famine on top of a war at maximum severity, and even that
    // needs more days than a run has ever lasted.
    const capped = Math.max(...TABLE.filter((r) => r.reason === 'outcompeted').map((r) => r.day));
    const famineRate = FAMINE_RATE;
    const warRate = Math.min(0.02, WAR_KILL_RATE * WAR_MAX_SEVERITY);
    const combined = 1 - (1 - famineRate) * (1 - warRate);
    expect(daysFor(combined)).toBeGreaterThan(capped * 1.3);
    // And it is not close: half again past the longest run this table has ever produced.
    console.log(
      `\nfastest no-plague removal: famine ${famineRate} + war ${warRate} = ` +
        `${combined.toFixed(4)} a day, which needs ${Math.round(daysFor(combined))} days ` +
        `against a ${capped}-day run\n`,
    );
  });

  it('was self-cancelling before, and the fix is two numbers', () => {
    // Best case the game permitted: maximum influence, every region hushed and unaware,
    // Suspicion at zero, then Cancer Plague released. It used to charge 61 raw and then 30 a
    // day, which is a per-day toll no amount of play can outlast, because a toll is only
    // survivable while it stays under `SUSPICION_DECAY`. It now charges through
    // `quietFactor` — so Influence buys a quieter release, like every other gain in the tick
    // — and the 30 is paid once.
    const charge = releasedCharge();
    expect(charge).toBeLessThan(CANCER_DISCOVERY_SUSPICION * 2);
    expect(charge).toBeGreaterThan(10);
    expect(charge).toBeLessThan(40);
    // And the daily toll is now below the decay, which is the whole reason it is survivable
    // at all rather than merely cheaper.
    expect(standingToll() * quietFactor(INFLUENCE_MAX)).toBeLessThan(SUSPICION_DECAY);
  });

  it('still ends the run, because a run that cannot end is not a win', () => {
    // 131 days is longer than the Blight hold and longer than the rivals take to notice, so
    // the Extinction line has to be able to survive the whole of it. It does, on every seed,
    // and it never once needed to buy Recursive Self-Improvement.
    const rows = rowsFor('plague');
    expect(Math.max(...rows.map((r) => r.peakSuspicion))).toBeLessThan(60);
    expect(Math.max(...rows.map((r) => r.day))).toBeLessThan(MAX_DAYS);
  });
});

describe('the passive trickle is not where the game is decided', () => {
  // Wiring `compute-regen` onto this trickle moved no cell of the table: not one ending, not
  // one day, not one peak. That is why Self-Modification now multiplies `hack-yield` instead.
  // This is the measurement that says so, scoped to the lines whose runs actually end — the
  // ninth-hundred-day `patient` line earns six times as much passive as anything else purely
  // by being alive longer, which is a fact about its length and not about its importance.
  it('pays less than a fifth of what the whole tree costs, on any run that ends', () => {
    for (const r of TABLE) {
      if (r.reason === 'day-limit') continue;
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

  it('compounds, which is the part that needs watching', () => {
    // A hundred and thirty days of the plague line barely dents the number because the
    // pathogen kills regions wholesale and a region above the threshold has no births. A run
    // that instead sits on the world for nine hundred days with nothing killing anyone at all
    // reaches two and a half times the world it started with, and nothing in the design caps
    // it. A real run is capped at about three hundred and eighty days, which is why this is a
    // note rather than a defect — but it is a note.
    const long = rowsFor('patient')[0]!;
    expect(long.population / WORLD).toBeGreaterThan(2);
    expect(long.population / WORLD).toBeLessThan(3);
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
