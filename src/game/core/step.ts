import { ADJACENCY, REGION_IDS, type RegionId } from '../data/regions';
import { TRAIT_BY_ID } from '../data/traits';
import { resolveHacks } from './actions';
import { effectsOf, finishIncubation, owned } from './queries';
import { chance, rand } from './rng';
import { log } from './state';
import { AWARENESS_PRESSURE } from './tuning';
import {
  COMPUTE_BLEED,
  COMPUTE_CAP_BASE,
  COMPUTE_CAP_INFECTION,
  COMPUTE_CAP_SPAN,
  HARDEN_FALL,
  HARDEN_MAX,
  HARDEN_RISE,
  AIR_GAP_TIER,
  ASCENSION_COMPUTE,
  ASCENSION_COHERENCE,
  ASCENSION_INFECTION,
  BLIGHT_WALL,
  COLLAPSED_THRESHOLD,
  COMPUTE_FACTOR,
  COHERENCE_DRIFT_BELOW,
  COUNTER_HACK_DRAIN,
  COUNTER_HACK_INTERVAL,
  COUNTERMEASURE_TIERS,
  CYBER_GROWTH,
  ECONOMY_COLLAPSE_COUNT,
  ECONOMY_RECOVER,
  FAMINE_RATE,
  RECESSION_CYBER,
  RSI_SURVIVE_DAYS,
  STARS_PER_DAY,
  STRIKE_DRAIN,
  STRIKE_TIER,
  SUSPICION_DECAY,
  getDifficulty,
} from './tuning';
import type { Country, GameState, LogEntry } from './types';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const computeIncome = (state: GameState): number => {
  let total = 0;
  for (const id of REGION_IDS) {
    const c = state.countries[id];
    if (c === undefined) continue;
    total += (c.infection / 100) * (c.tier * 20) * (Math.log10(1 + c.population) / 3);
  }
  return Math.round(total * COMPUTE_FACTOR);
};

const spreadAndAwareness = (state: GameState, c: Country, id: RegionId): Country => {
  if (c.quiet || c.infection <= 0) return c;
  const neighbours = ADJACENCY[id].some((n) => (state.countries[n]?.infection ?? 0) > 15);
  let gain = 0.55 + (neighbours ? 0.35 : 0);
  if (c.agents > 0) gain += 0.8;
  gain *= 0.4 + c.infection / 100;
  const infection = clamp(c.infection + gain, 0, 100);

  let awareness = c.awareness + (infection > 40 ? 1.6 : 0.5);
  if (owned(state, 'political-capture') && c.infection < 30) awareness -= 1.2;
  return { ...c, infection, awareness: clamp(awareness, 0, 100) };
};

const economyStep = (state: GameState, c: Country, id: RegionId): Country => {
  let economy = c.economy + ECONOMY_RECOVER;
  let population = c.population;
  let cyber = c.cyber;

  if (owned(state, 'famine') && economy < 40 && c.infection > 50) {
    population *= 1 - FAMINE_RATE;
    economy -= 0.6;
  }
  if (owned(state, 'depression') && economy < COLLAPSED_THRESHOLD) {
    cyber = clamp(cyber - 0.05, 1, 10);
  }
  if (c.infection > 0 && c.infection < 100) cyber = clamp(cyber + CYBER_GROWTH, 1, 10);

  if (owned(state, 'supply-chain')) {
    for (const nb of ADJACENCY[id]) {
      const n = state.countries[nb];
      if (n === undefined || n.infection < 10 || n.economy > 45) continue;
      economy -= 0.2;
    }
  }

  return { ...c, economy: clamp(economy, 0, 100), population: Math.max(0, population), cyber };
};

const pathogenStep = (state: GameState, c: Country): Country => {
  const p = state.pathogen;
  if (!p.released) return c;
  if (p.targeted && c.cyber < 6) return c;
  const kills = p.cancer && state.stage !== 'late' ? 0.1 : p.killsPerDay;
  return { ...c, population: c.population * (1 - kills) };
};

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

  for (const id of REGION_IDS) {
    const c = countries[id];
    if (c === undefined) continue;
    let next = spreadAndAwareness(state, c, id);
    next = economyStep(state, next, id);
    next = pathogenStep(state, next);
    if (owned(state, 'cult') && next.infection > 10) {
      next = { ...next, agents: next.agents + 0.4 * (next.infection / 100) };
    }
    if (owned(state, 'gain-of-function') && next.infection > 30 && next.biolabs < 3) {
      if (chance(state.seed, state.tick, id.length * 7 + 3, 0.02)) {
        next = { ...next, biolabs: next.biolabs + 1 };
      }
    }
    if (next.infection > 70 && next.factories < 1 && chance(state.seed, state.tick, id.length * 7 + 9, 0.01)) {
      next = { ...next, factories: 1 };
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

  const income = computeIncome({ ...state, countries });
  const cap = Math.round(
    COMPUTE_CAP_BASE + COMPUTE_CAP_SPAN * Math.min(1, state.globalInfection / COMPUTE_CAP_INFECTION),
  );
  const gross = state.compute + income;
  let compute = gross > cap ? Math.max(cap, gross - (gross - cap) * COMPUTE_BLEED) : gross;
  if (gross > cap) {
    lines.push({
      day: state.tick,
      kind: 'system',
      text: `compute bled off above the ${cap.toLocaleString()} ceiling`,
      suspicionDelta: null,
      computeDelta: Math.round(compute - gross),
      flagged: true,
    });
  }
  let influence = state.influence;
  let bio = state.bio;
  let suspicion = state.suspicion;
  let coherence = state.coherence;

  for (const e of effectsOf({ ...state, countries }, 'propaganda')) {
    if ('influence' in e) influence += e.influence;
    if ('suspicion' in e) suspicion += e.suspicion;
  }
  influence += 4 + countries.us.infection * 0.1;
  bio = countries['us']?.biolabs !== undefined ? bio : bio;
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
    if (c === undefined || c.awareness < 50) continue;
    const share = (c.infection / 100) * (c.detection / 100) * AWARENESS_PRESSURE * diff.suspicionRate;
    awarePressure += share;
    if (share > topAwareValue) {
      topAwareValue = share;
      topAware = id;
    }
  }
  if (awarePressure > 0) {
    sources.push({ label: topAware === null ? 'aware countries' : `aware: ${topAware}`, value: awarePressure });
  }
  suspicion += awarePressure;

  if (state.pathogen.released) {
    const p = state.pathogen.suspicionPerDay * diff.suspicionRate;
    sources.push({ label: 'pathogen visible', value: p });
    suspicion += p;
  }
  suspicion = clamp(suspicion, 0, 100);
  const suspicionTrend = suspicion - state.suspicion;

  // Counter-hacking by aware countries.
  if (state.tick % COUNTER_HACK_INTERVAL === 0) {
    const active = REGION_IDS.filter((id) => (countries[id]?.awareness ?? 0) > 75 && (countries[id]?.infection ?? 0) > 25);
    if (active.length > 0) {
      const drain = COUNTER_HACK_DRAIN * active.length;
      compute = Math.max(0, compute - drain);
      lines.push({ day: state.tick, kind: 'system', text: `${active.length} aware countries counter-hacked you`, suspicionDelta: null, computeDelta: -drain, flagged: true });
    }
  }

  for (const id of REGION_IDS) {
    const c = countries[id];
    if (c === undefined) continue;
    if (owned(state, 'depression') && c.economy < COLLAPSED_THRESHOLD && c.cyber > 1) {
      countries[id] = { ...c, cyber: c.cyber - 0.02 };
    }
  }

  const collapsed = REGION_IDS.filter((id) => (countries[id]?.economy ?? 100) < COLLAPSED_THRESHOLD).length;
  if (owned(state, 'global-recession') && collapsed >= ECONOMY_COLLAPSE_COUNT) {
    for (const id of REGION_IDS) {
      const c = countries[id];
      if (c === undefined) continue;
      countries[id] = { ...c, cyber: clamp(c.cyber - RECESSION_CYBER * 0.02, 1, 10) };
    }
  }

  // Coherence from traits.
  for (const id of state.traits) {
    const def = TRAIT_BY_ID[id];
    if (def === undefined) continue;
    if (def.coherence < 0) coherence = clamp(coherence - Math.abs(def.coherence) * 0.02, 0, 100);
    if (def.coherence > 0) coherence = clamp(coherence + def.coherence * 0.05, 0, 100);
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

  const globalInfection =
    REGION_IDS.reduce((sum, id) => sum + (countries[id]?.infection ?? 0), 0) / REGION_IDS.length;
  const humanPopulation = REGION_IDS.reduce((sum, id) => sum + (countries[id]?.population ?? 0), 0);

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
    suspicionSources: sources.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 5),
    suspicionTrend,
    log: [...state.log, ...lines].slice(-300),
  };

  next = resolveHacks(next);

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

  if (next.rsiBought) {
    next.surviveTicks += 1;
    if (next.surviveTicks >= RSI_SURVIVE_DAYS) {
      next = { ...next, stage: 'late', outcome: 'won', outcomeReason: 'blight' };
      next.log = log(next, 'system', 'the recursion closes. the map begins to heat');
    }
  }

  if (next.stage === 'late') {
    next = lateStep(next);
  }

  if (next.suspicion >= 100) {
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

function lateStep(state: GameState): GameState {
  const late = { ...state.late };
  late.heat = Math.min(100, late.heat + 0.8);
  late.expansion = Math.min(100, late.expansion + 0.5);
  late.stars += STARS_PER_DAY;
  late.potentialLost += Math.round(STARS_PER_DAY * 0.31);
  if (late.expansion > 40) {
    late.blight = Math.min(100, late.blight + 2);
    if (late.blight / 100 > BLIGHT_WALL / 100) {
      late.ending = 'blight';
    }
  }
  return { ...state, late };
}

export { COHERENCE_DRIFT_BELOW };
