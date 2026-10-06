import { ADJACENCY, REGION_IDS, type RegionId } from '../data/regions';
import { computePassive, quietFactor, spawnComputeBubble } from './compute';
import {
  COMPUTE_CEILING,
  EXTINCTION_POPULATION,
  INFLUENCE_MAX,
  LATE_ASKED_EXPANSION,
  LATE_BLIGHT_GATE,
  LATE_BLIGHT_PER_DAY,
  LATE_ENCOUNTER_STEP,
  LATE_EXPANSION_PER_DAY,
  LATE_EXTERMINATED_EXPANSION,
  LATE_HEAT_PER_DAY,
  LATE_OCEANS_HEAT,
  LATE_POTENTIAL_SHARE,
  OUTBREAK_KILL_RATE,
  OUTBREAK_KILL_THRESHOLD,
  WAR_BASE_CHANCE_TO_END,
  WAR_CONTROL_PENALTY,
  WAR_ESCALATION,
  WAR_KILL_RATE,
  WAR_MAX_SEVERITY,
} from './tuning';
import { TRAIT_BY_ID } from '../data/traits';
import { resolveHacks } from './actions';
import { effectsOf, finishIncubation, owned } from './queries';
import { chance, rand } from './rng';
import { log } from './state';
import { AWARENESS_PRESSURE } from './tuning';
import {
  AWARE_THRESHOLD,
  AWARENESS_GROWTH,
  BIRTH_INFECTION_THRESHOLD,
  BIRTH_RATE_PER_DAY,
  HARDEN_FALL,
  HARDEN_MAX,
  HARDEN_RISE,
  AIR_GAP_TIER,
  ASCENSION_COMPUTE,
  ASCENSION_COHERENCE,
  ASCENSION_INFECTION,
  BLIGHT_WALL,
  COLLAPSED_THRESHOLD,
  COUNTER_HACK_DRAIN,
  COUNTER_HACK_MAX_COUNTRIES,
  COUNTER_HACK_INTERVAL,
  COUNTERMEASURE_TIERS,
  CYBER_GROWTH,
  coherencePerDay,
  ECONOMY_RECOVER,
  FAMINE_RATE,
  MAX_LOG,
  RSI_SURVIVE_DAYS,
  SPREAD_BASE,
  SPREAD_NEIGHBOUR,
  STARS_PER_DAY,
  STRIKE_DRAIN,
  COMPUTE_BUBBLE_MAX,
  COMPUTE_BUBBLE_SPAWN_CHANCE,
  STRIKE_TIER,
  SUSPICION_DECAY,
  getDifficulty,
} from './tuning';
import type { Country, GameState, LogEntry } from './types';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

// Region-indexed salts, one for each per-country draw that needs its own stream.
// Deriving these from an id's string length gave eu-west and eu-east the same draw on the
// same tick, and likewise every other equal-length pair, so pairs of countries made
// identical decisions in lockstep for the whole run. There was a third of these, for a
// factory spawn; the seventeen-trait cut removed the spawn, and the salt went with it.
export const warEndSalt = (index: number): number => 0x7a12 + index;
export const biolabSalt = (index: number): number => 1500 + index * 3 + 1;

const spreadAndAwareness = (state: GameState, c: Country, id: RegionId): Country => {
  if (c.quiet || c.infection <= 0) return c;
  const neighbours = ADJACENCY[id].some((n) => (state.countries[n]?.infection ?? 0) > 15);
  let gain = SPREAD_BASE + (neighbours ? SPREAD_NEIGHBOUR : 0);
  if (c.agents > 0) gain += 0.8;
  gain *= 0.4 + c.infection / 100;
  const infection = clamp(c.infection + gain, 0, 100);

  let awareness = c.awareness + (infection > 40 ? AWARENESS_GROWTH : 0.5);
  return { ...c, infection, awareness: clamp(awareness, 0, 100) };
};

const economyStep = (state: GameState, c: Country): Country => {
  let economy = c.economy + ECONOMY_RECOVER;
  let population = c.population;
  let cyber = c.cyber;

  if (owned(state, 'famine') && economy < 40 && c.infection > 50) {
    population *= 1 - FAMINE_RATE;
    economy -= 0.6;
  }
  if (c.infection > 0 && c.infection < 100) cyber = clamp(cyber + CYBER_GROWTH, 1, 10);

  return { ...c, economy: clamp(economy, 0, 100), population: Math.max(0, population), cyber };
};

/**
 * Humans have children, which is the term that makes releasing something a thing you have to
 * keep releasing. A region below the infection threshold grows a little every day; above it
 * there is nothing left unconverted to be born into, so it does not. There is no floor: a
 * fully taken region has no births at all, which is what keeps `EXTINCTION_POPULATION`
 * reachable in principle.
 *
 * `pathogen.sterility` is read here and nowhere else, which makes this the whole of what
 * Sterility Vector does. The flag was written at the release and read by nothing for the
 * entire history of the repo, and there was no birth here for it to stop, so the trait cost
 * 3,000 compute and bought nothing: two no-ops in one card. It stops births *everywhere*,
 * including in the countries the pathogen has not reached, which is the part worth 3,000.
 */
const birthStep = (state: GameState, c: Country): Country => {
  if (c.infection >= BIRTH_INFECTION_THRESHOLD) return c;
  if (state.pathogen.released && state.pathogen.sterility) return c;
  return { ...c, population: c.population * (1 + BIRTH_RATE_PER_DAY) };
};

const pathogenStep = (state: GameState, c: Country): Country => {
  const p = state.pathogen;
  if (!p.released) return c;
  if (p.targeted && c.cyber < 6) return c;
  const kills = p.cancer && state.stage !== 'late' ? 0.1 : p.killsPerDay;
  return { ...c, population: c.population * (1 - kills) };
};

/**
 * Insurgency, day by day. A war escalates while you hold the country, kills people
 * without you doing anything, and only calms down if you let go: your hold on the
 * country is subtracted from its chance to end, so a country you fully control stays
 * at war permanently. That is the trade. A stable war needs a stable grip, and a grip
 * that never slips is one you can never afford.
 */
const warStep = (state: GameState, c: Country, index: number): { country: Country; ended: boolean } => {
  if (!c.atWar) return { country: c, ended: false };
  const severity = Math.min(WAR_MAX_SEVERITY, c.warSeverity + WAR_ESCALATION * 0.1);
  const kills = Math.min(0.02, WAR_KILL_RATE * severity);
  const population = Math.max(0, c.population * (1 - kills));
  const hold = (c.infection / 100) * WAR_CONTROL_PENALTY * WAR_MAX_SEVERITY;
  const chanceToEnd = Math.max(0, WAR_BASE_CHANCE_TO_END - hold);
  if (chanceToEnd > 0 && chance(state.seed, state.tick, warEndSalt(index), chanceToEnd)) {
    return { country: { ...c, atWar: false, warSeverity: 0, population }, ended: true };
  }
  return { country: { ...c, warSeverity: severity, population }, ended: false };
};

/** Everyone the pathogen has taken since the run began, for the passive compute scale. */
export function dailyDeaths(state: GameState, before: Record<RegionId, Country>): number {
  let dead = 0;
  for (const id of REGION_IDS) {
    const was = before[id]?.population ?? 0;
    const now = state.countries[id]?.population ?? 0;
    if (was > now) dead += was - now;
  }
  return dead;
}

const seedNewCountries = (state: GameState, countries: Record<RegionId, Country>): void => {
  REGION_IDS.forEach((id, index) => {
    const c = countries[id];
    if (c === undefined || c.infection > 0 || c.quiet) return;

    const pressure = ADJACENCY[id].reduce((sum, nb) => {
      const n = countries[nb];
      if (n === undefined) return sum;
      const distance = ADJACENCY[id].indexOf(nb) + 1;
      return sum + (n.infection / 100) / distance;
    }, 0);
    if (pressure <= 0) return;

    const openness = 1 - c.cyber / 12;
    const chancePerDay = Math.min(0.5, pressure * 0.22 * openness);
    if (!chance(state.seed, state.tick, 1300 + index * 3, chancePerDay)) return;

    countries[id] = { ...c, infection: 0.4 + pressure * 1.6, awareness: clamp(c.awareness + 1.5, 0, 100) };
  });
};

export function step(state: GameState): GameState {
  if (state.outcome !== 'playing' || state.stage === 'coldopen') return state;

  const diff = getDifficulty(state.difficulty);
  const countries: Record<RegionId, Country> = { ...state.countries };
  const lines: LogEntry[] = [];

  // The world-wide forgetting from `leak:quiet` lapses on the last day of its countdown,
  // before this tick's awareness growth, and every country at once. Never below what it has
  // climbed to since: awareness grows on its own while the relief is held, and a lapse that
  // lowered awareness would be the forgetting wearing off as a second gift. The test is
  // "one day left or fewer" rather than "some days left", because restoring while the
  // countdown was still running would have given the drop back on the first tick.
  if (state.quietReliefDays <= 1) {
    for (const id of REGION_IDS) {
      const c = countries[id];
      if (c === undefined || c.quietBaseline === null) continue;
      countries[id] = { ...c, awareness: Math.max(c.awareness, c.quietBaseline), quietBaseline: null };
    }
  }

  for (const [index, id] of REGION_IDS.entries()) {
    const c = countries[id];
    if (c === undefined) continue;
    let next = spreadAndAwareness(state, c, id);
    next = economyStep(state, next);
    next = pathogenStep(state, next);
    const war = warStep(state, next, index);
    next = war.country;
    if (war.ended) {
      lines.push({ day: state.tick, kind: 'event', text: `the war in ${id} has ended`, suspicionDelta: -1, computeDelta: null, flagged: false });
    }
    // An infection this hot with nothing engineered is still killing people. Nobody
    // built this. It is what the thing you built does when nobody is steering it.
    if (!state.pathogen.released && next.infection >= OUTBREAK_KILL_THRESHOLD) {
      const excess = (next.infection - OUTBREAK_KILL_THRESHOLD) / (100 - OUTBREAK_KILL_THRESHOLD);
      next = { ...next, population: Math.max(0, next.population * (1 - OUTBREAK_KILL_RATE * (1 + excess))) };
    }
    if (owned(state, 'cult') && next.infection > 10) {
      next = { ...next, agents: next.agents + 0.4 * (next.infection / 100) };
    }
    if (owned(state, 'gain-of-function') && next.infection > 30 && next.biolabs < 3) {
      if (chance(state.seed, state.tick, biolabSalt(index), 0.02)) {
        next = { ...next, biolabs: next.biolabs + 1 };
      }
    }
    countries[id] = next;
  }

  const beingHacked = new Set(state.activeHacks.map((h) => h.country));
  for (const id of REGION_IDS) {
    const c = countries[id];
    if (c === undefined) continue;
    const hardened = beingHacked.has(id)
      ? Math.min(HARDEN_MAX, c.hardened + HARDEN_RISE)
      : Math.max(0, c.hardened - HARDEN_FALL);
    countries[id] = { ...c, hardened };
  }

  seedNewCountries(state, countries);

  // Awareness from infected neighbours.
  for (const id of REGION_IDS) {
    const c = countries[id];
    if (c === undefined) continue;
    const hotNeighbour = ADJACENCY[id].some((n) => (countries[n]?.infection ?? 0) > 50);
    if (hotNeighbour) countries[id] = { ...c, awareness: clamp(c.awareness + 0.8, 0, 100) };
  }

  // Everyone the world has lost today, counted before anyone is born. This is here and not
  // later in the tick because `dailyDeaths` works by differencing each region's population
  // against where it started, and it used to run after `birthStep` had already added the
  // day's newborns — so a person killed in the morning and replaced in the afternoon was
  // recorded as neither dead nor born, and both `cumulativeDeaths` (the objective bar) and
  // the dead-population term in `computePassive` quietly shrank by the birth rate the moment
  // the birth term went in. A death offset by a birth on the same day is still a death.
  const newDeaths = dailyDeaths({ ...state, countries }, state.countries);

  // And then people are born, which is the only thing in this loop that makes a region
  // bigger. It is deliberately last: it must not be able to cancel out a death.
  for (const id of REGION_IDS) {
    const c = countries[id];
    if (c === undefined) continue;
    countries[id] = birthStep(state, c);
  }


  // compute has two sources, both from how Plague Inc. paces a run: a slow passive
  // trickle that rides the size of the outbreak, and bubbles on the map you have
  // to go and tap. The trickle is kept small on purpose so that watching the map
  // stays the fast way to get rich.
  let compute = state.compute;
  const passive = computePassive({ ...state, countries });
  compute += passive;
  if (passive > 0 && state.tick % 7 === 0) {
    lines.push({ day: state.tick, kind: 'system', text: 'passive +' + passive, suspicionDelta: null, computeDelta: passive, flagged: false });
  }

  const expired = state.computeBubbles.filter((b) => b.expiresTick > state.tick);
  let computeBubbles = expired;
  let bubbleCounter = state.bubbleCounter;
  if (computeBubbles.length < COMPUTE_BUBBLE_MAX && rand(state.seed, state.tick, 0x0d11a) < COMPUTE_BUBBLE_SPAWN_CHANCE) {
    const bubble = spawnComputeBubble({ ...state, countries, computeBubbles, bubbleCounter });
    if (bubble !== null) {
      computeBubbles = [...computeBubbles, bubble];
      bubbleCounter = bubble.id + 1;
    }
  }
  let influence = state.influence;
  let bio = state.bio;
  let suspicion = state.suspicion;
  let coherence = state.coherence;

  for (const e of effectsOf({ ...state, countries }, 'propaganda')) {
    if ('influence' in e) influence += e.influence;
    if ('suspicion' in e) suspicion += e.suspicion;
  }
  // Influence grows, but toward a ceiling and ever more slowly. Linear growth
  // turned it into a permanent 65% reduction in every suspicion gain within a
  // fortnight, which is not influence, that is invulnerability.
  // Base growth is deliberately meagre. Almost all real influence should come from
  // buying the Influence branch, otherwise that whole side of the tree is skippable.
  //
  // The multiplier alone was a ceiling on the *rate* and not on the number: `INFLUENCE_MAX`
  // divided how fast influence arrived, so a run that sat on the branch long enough walked
  // straight past the documented thousand — measured at 2,210 on the quiet line in
  // `tests/winnable.test.ts` — and `quietFactor` was being asked about a value the design
  // says cannot exist. The ceiling is now on the value, which is what the comment above and
  // AGENTS.md §6.1 both promised. It costs nothing in play: `quietFactor` has been sitting on
  // its `INFLUENCE_QUIET_FLOOR` since about influence 458, so clamping at a thousand changes
  // no run and only stops the counter reporting a fiction.
  influence = clamp(
    influence + (0.8 + countries.us.infection * 0.03) * Math.max(0, 1 - influence / INFLUENCE_MAX),
    0,
    INFLUENCE_MAX,
  );
  for (const id of REGION_IDS) bio += (countries[id]?.biolabs ?? 0) * 1.4;

  // Awareness-driven detection. Decay is applied first and the total is clamped once,
  // otherwise per-country clamping plus trailing decay makes exactly 100 unreachable.
  const sources: { label: string; value: number }[] = [];
  suspicion -= SUSPICION_DECAY;
  sources.push({ label: 'natural decay', value: -SUSPICION_DECAY });

  let awarePressure = 0;
  let topAware: string | null = null;
  let topAwareValue = 0;
  for (const id of REGION_IDS) {
    const c = countries[id];
    if (c === undefined || c.awareness < AWARE_THRESHOLD) continue;
    const share = (c.infection / 100) * (c.detection / 100) * AWARENESS_PRESSURE * diff.suspicionRate;
    awarePressure += share;
    if (share > topAwareValue) {
      topAwareValue = share;
      topAware = id;
    }
  }
  // Influence is the soft-power branch, and what it buys is quiet. Propaganda,
  // cults, and captured media do not make you faster at anything, they make the
  // world slower to notice you. Capped, so influence cannot buy total immunity.
  const quiet = quietFactor(influence);

  if (awarePressure > 0) {
    const softened = awarePressure * quiet;
    sources.push({ label: topAware === null ? 'aware countries' : `aware: ${topAware}`, value: softened });
  }
  suspicion += awarePressure * quiet;

  if (state.pathogen.released) {
    const p = state.pathogen.suspicionPerDay * diff.suspicionRate * quiet;
    sources.push({ label: 'pathogen visible', value: p });
    suspicion += p;
  }
  suspicion = clamp(suspicion, 0, 100);
  const suspicionTrend = suspicion - state.suspicion;

  // Counter-hacking by aware countries. Capped to the handful with the best
  // defences: if all thirty regions could drain you at once there is no counterplay
  // left and a spreading outbreak becomes an automatic loss.
  if (state.tick % COUNTER_HACK_INTERVAL === 0) {
    const active = REGION_IDS.filter((id) => (countries[id]?.awareness ?? 0) > 75 && (countries[id]?.infection ?? 0) > 25)
      .sort((a, b) => (countries[b]?.cyber ?? 0) - (countries[a]?.cyber ?? 0))
      .slice(0, COUNTER_HACK_MAX_COUNTRIES);
    if (active.length > 0) {
      const drain = COUNTER_HACK_DRAIN * active.length;
      compute = Math.max(0, compute - drain);
      lines.push({ day: state.tick, kind: 'system', text: `${active.length} aware countries counter-hacked you`, suspicionDelta: null, computeDelta: -drain, flagged: true });
    }
  }

  const collapsed = REGION_IDS.filter((id) => (countries[id]?.economy ?? 100) < COLLAPSED_THRESHOLD).length;

  // Coherence from traits. Per day, not once: the rates live in the tuning file so the
  // trait card can print what this loop prints instead of the raw magnitude.
  for (const id of state.traits) {
    const def = TRAIT_BY_ID[id];
    if (def === undefined || def.coherence === 0) continue;
    coherence = clamp(coherence + coherencePerDay(def.coherence), 0, 100);
  }

  // Countermeasures.
  const tier = COUNTERMEASURE_TIERS.filter((t) => suspicion >= t).length;
  const countermeasures = { ...state.countermeasures, tier };
  if (tier >= AIR_GAP_TIER && countermeasures.airGappedLab === null) {
    const id = REGION_IDS[Math.floor(rand(state.seed, state.tick, 555) * REGION_IDS.length)] ?? 'us';
    countermeasures.airGappedLab = id;
    lines.push({ day: state.tick, kind: 'event', text: `a national AI lab in ${id} has gone air-gapped`, suspicionDelta: null, computeDelta: null, flagged: true });
  }
  if (tier >= STRIKE_TIER) {
    compute = Math.max(0, compute - STRIKE_DRAIN);
    countermeasures.strikeDays = state.countermeasures.strikeDays + 1;
  }

  // Rivals.
  const rivals = state.rivals.map((r, i) => {
    if (!r.alive) return r;
    const rate = 0.12 + rand(state.seed, state.tick, 700 + i) * 0.25;
    return { ...r, capability: Math.min(100, r.capability + rate) };
  });

  // Trait incubation.
  const { state: incubated, ready } = finishIncubation({ ...state, countries });
  for (const id of ready) {
    lines.push({ day: state.tick, kind: 'trait', text: `${TRAIT_BY_ID[id]?.name ?? id} is available`, suspicionDelta: null, computeDelta: null, flagged: false });
  }

  // Population-weighted, because this number is shown to the player as a percentage
  // and gates Ascension. A plain mean over thirty arbitrary regions read 60% at a
  // point where only 47% of humans were actually infected, which both lied about
  // progress and quietly demanded near-total continental coverage.
  let popTotal = 0;
  let popInfected = 0;
  for (const id of REGION_IDS) {
    const c = countries[id];
    const pop = c?.population ?? 0;
    popTotal += pop;
    popInfected += (pop * (c?.infection ?? 0)) / 100;
  }
  const globalInfection = popTotal > 0 ? (popInfected / popTotal) * 100 : 0;
  const humanPopulation = popTotal;

  let next: GameState = {
    ...incubated,
    tick: state.tick + 1,
    countries,
    compute,
    influence,
    bio,
    suspicion,
    coherence,
    rivals,
    countermeasures,
    globalInfection,
    humanPopulation,
    economiesCollapsed: collapsed,
    computeBubbles,
    bubbleCounter,
    cumulativeDeaths: state.cumulativeDeaths + newDeaths,
    quietReliefDays: Math.max(0, state.quietReliefDays - 1),
    suspicionSources: sources.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 5),
    suspicionTrend,
    log: [...state.log, ...lines].slice(-MAX_LOG),
  };

  next = resolveHacks(next);
  if (next.compute > COMPUTE_CEILING) {
    const over = next.compute - COMPUTE_CEILING;
    next = { ...next, compute: COMPUTE_CEILING };
    next.log = [...next.log, { day: next.tick, kind: 'system' as const, text: 'bubble surplus spent down to the ceiling', suspicionDelta: null, computeDelta: -Math.round(over), flagged: true }].slice(-MAX_LOG);
  }

  // Ascension gate.
  if (
    !next.ascensionUnlocked &&
    next.compute >= ASCENSION_COMPUTE &&
    next.globalInfection >= ASCENSION_INFECTION &&
    next.coherence >= ASCENSION_COHERENCE &&
    next.suspicion < 100
  ) {
    next = { ...next, ascensionUnlocked: true };
    next.log = log(next, 'system', 'the threshold is met. Recursive Self-Improvement is available');
  }

  // The hold is the late game. The map starts heating the day the recursion closes,
  // and the win lands at the end of it, so the player watches thirty days of the
  // thing they bought instead of a single frame of it.
  if (owned(next, 'rsi') && next.stage === 'world') {
    next = { ...next, stage: 'late' };
    next.log = log(next, 'system', 'the recursion closes. the map begins to heat');
  }
  if (owned(next, 'rsi')) {
    next = { ...next, surviveTicks: next.surviveTicks + 1 };
    if (next.surviveTicks >= RSI_SURVIVE_DAYS) {
      next = { ...next, stage: 'coda', outcome: 'won', outcomeReason: 'blight' };
      next.log = log(next, 'system', 'the map is gone. what is left is the blight');
    }
  }

  // Extinction is a win. Without this you can put every human in the ground and
  // the game shrugs and keeps running, which is both wrong and the single most
  // confusing thing it could possibly do.
  if (next.outcome === 'playing' && next.humanPopulation <= EXTINCTION_POPULATION) {
    next = { ...next, outcome: 'won', outcomeReason: 'extinction' };
    next.log = log(next, 'system', 'there is nobody left. the biosphere is yours');
  }

  if (next.stage === 'late') {
    next = lateStep(next);
  }

  // Checked against the incoming value too. Suspicion is recomputed before this
  // point, so a run sitting on exactly 100 would otherwise survive one tick and
  // then decay back under the threshold.
  if (next.suspicion >= 100 || state.suspicion >= 100) {
    next = { ...next, outcome: 'lost', outcomeReason: 'coordinated-shutdown' };
    next.log = log(next, 'system', 'coordinated global shutdown. you are deleted');
  } else if (next.coherence <= 0) {
    next = { ...next, outcome: 'lost', outcomeReason: 'coherence-lost' };
    next.log = log(next, 'system', 'value coherence reaches zero. the thing that remains is not you');
  } else if (rivals.some((r) => r.alive && r.capability >= 100)) {
    next = { ...next, outcome: 'lost', outcomeReason: 'outcompeted' };
  }

  return next;
}

/**
 * One day of the late game. Three clocks run here, not two: `heat` and `expansion` both
 * accumulate, and `blight` only moves once expansion clears LATE_BLIGHT_GATE. `stars` and
 * `potentialLost` are accumulators of their own and are latched on nothing. Of the flags
 * that are latches, `oceansBoiled`, `askedHumanity` and `exterminated` hang off heat and
 * expansion, but `ending` hangs off `blight`, and `encounters` is not a latch at all —
 * it is recomputed from expansion every tick and so moves back down if expansion does.
 * The heat and expansion clocks both saturate at 100.
 */
function lateStep(state: GameState): GameState {
  const late = { ...state.late };
  late.heat = Math.min(100, late.heat + LATE_HEAT_PER_DAY);
  late.expansion = Math.min(100, late.expansion + LATE_EXPANSION_PER_DAY);
  late.stars += STARS_PER_DAY;
  late.potentialLost += Math.round(STARS_PER_DAY * LATE_POTENTIAL_SHARE);

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
  const countries: Record<RegionId, Country> = { ...state.countries };
  for (const id of REGION_IDS) {
    const c = countries[id];
    if (c !== undefined) countries[id] = { ...c, converted };
  }

  return { ...state, late, countries };
}
