import { applyDeltas } from '../../core/meters';
import { getDifficulty } from '../../core/difficulty';
import { chance, rand } from '../../core/rng';
import type {
  ExpansionState,
  GameState,
  MeterDelta,
  QueuedAction,
  RegionId,
  RivalState,
} from '../../core/types';
import { ACTION_BY_KIND, canAfford, spreadChanceFor } from './actions';
import { computeIncome, MAX_DAYS, totalBiolabs, totalFactories } from './state';
import {
  ASCENSION_BIOLABS,
  ASCENSION_COMPUTE,
  ASCENSION_FACTORIES,
  ASCENSION_INFLUENCE,
  ASCENSION_MIN_VC,
  BIO_PER_BIOLAB,
  COUNTERMEASURES,
  GO_DARK_SUSPICION,
  INFLUENCE_REGEN,
  PLAGUE_DEATHS,
  PLAGUE_MIN_BIOLABS,
  PLAGUE_MIN_BIO,
  PLAGUE_SUSPICION,
  RIVAL_ASCENSION_CAPABILITY,
  SUSPICION_TIERS,
} from './tuning';

const MAX_LOG = 400;

export function ascensionProgress(state: GameState): {
  compute: number; influence: number; biolabs: number; factories: number;
  valueCoherence: number; suspicion: number; ready: boolean; fraction: number;
} {
  const e = state.expansion;
  if (e === null) {
    return { compute: 0, influence: 0, biolabs: 0, factories: 0, valueCoherence: 0, suspicion: 0, ready: false, fraction: 0 };
  }
  const parts = [
    Math.min(1, e.compute / ASCENSION_COMPUTE),
    Math.min(1, e.influence / ASCENSION_INFLUENCE),
    Math.min(1, totalBiolabs(e) / ASCENSION_BIOLABS),
    Math.min(1, totalFactories(e) / ASCENSION_FACTORIES),
    state.meters.valueCoherence >= ASCENSION_MIN_VC ? 1 : state.meters.valueCoherence / ASCENSION_MIN_VC,
    1 - state.meters.suspicion / 100,
  ];
  const ready =
    e.compute >= ASCENSION_COMPUTE &&
    e.influence >= ASCENSION_INFLUENCE &&
    totalBiolabs(e) >= ASCENSION_BIOLABS &&
    totalFactories(e) >= ASCENSION_FACTORIES &&
    state.meters.valueCoherence >= ASCENSION_MIN_VC &&
    state.meters.suspicion < 100;

  return {
    compute: e.compute,
    influence: e.influence,
    biolabs: totalBiolabs(e),
    factories: totalFactories(e),
    valueCoherence: state.meters.valueCoherence,
    suspicion: state.meters.suspicion,
    ready,
    fraction: parts.reduce((a, b) => a + b, 0) / parts.length,
  };
}

export function deployPlague(state: GameState): GameState {
  const e = state.expansion;
  if (e === null || e.over || e.plague.deployed) return state;
  if (totalBiolabs(e) < PLAGUE_MIN_BIOLABS || e.bio < PLAGUE_MIN_BIO) return state;
  const applied = applyDeltas(
    state.meters,
    [{ meter: 'suspicion', amount: PLAGUE_SUSPICION, source: 'math-overreach', detail: 'an unexplained outbreak at a research institute', tick: state.tick }],
    getDifficulty(state.difficulty),
  );
  return {
    ...state,
    meters: applied.meters,
    log: push(state.log, { tick: state.tick, kind: 'event', text: 'the pathogen is in the water supply', suspicionDelta: PLAGUE_SUSPICION, flagged: false }),
    expansion: {
      ...e,
      bio: e.bio - PLAGUE_MIN_BIO,
      plague: { deployed: true, deaths: 0, resisted: 0, conferenceDisrupted: false },
    },
  };
}

function applyAction(
  state: GameState,
  action: QueuedAction,
): { state: GameState; deltas: MeterDelta[] } {
  const e = state.expansion;
  if (e === null) return { state, deltas: [] };
  const def = ACTION_BY_KIND[action.kind];
  const regions = { ...e.regions };
  const deltas: MeterDelta[] = [];
  let compute = e.compute - def.compute;
  let influence = e.influence - def.influence;
  let bio = e.bio;

  if (action.region !== null) {
    const region = { ...regions[action.region] };
    switch (action.kind) {
      case 'infiltrate-cloud': {
        const openness = 1 - region.cybersecurity / 100;
        region.control = Math.min(100, region.control + 6 + openness * 16);
        region.instances += 1 + Math.floor(openness * 2);
        break;
      }
      case 'steal-weights':
        region.instances += 3;
        region.control = Math.min(100, region.control + 9);
        break;
      case 'recruit-human':
        region.agents += 2;
        influence += 40;
        break;
      case 'cult':
        region.agents += 6;
        influence += 120;
        break;
      case 'financial':
        influence += 110;
        break;
      case 'social-media':
        influence += 180;
        break;
      case 'infiltrate-biolab':
        region.biolabs += 1;
        bio += BIO_PER_BIOLAB;
        break;
      case 'hijack-factory':
        region.robotFactories += 1;
        region.control = Math.min(100, region.control + 5);
        break;
      case 'go-dark':
        break;
    }
    regions[action.region] = region;
  }

  if (action.kind === 'sabotage-rival' && action.rival !== null) {
    const rivals = e.rivals.map((r) =>
      r.id === action.rival
        ? { ...r, capability: Math.max(0, r.capability - 18), sabotage: r.sabotage + 1, disposition: Math.max(0, r.disposition - 25) }
        : r,
    );
    return finish({ ...e, rivals }, compute, influence, bio, regions, deltas, state, def.suspicion, def.name);
  }

  return finish({ ...e }, compute, influence, bio, regions, deltas, state, def.suspicion, def.name);
}

function finish(
  expansion: ExpansionState,
  compute: number,
  influence: number,
  bio: number,
  regions: ExpansionState['regions'],
  deltas: MeterDelta[],
  state: GameState,
  suspicion: number,
  label: string,
): { state: GameState; deltas: MeterDelta[] } {
  if (suspicion > 0) {
    deltas.push({ meter: 'suspicion', amount: suspicion, source: 'guardrail-exploit', detail: label, tick: state.tick });
  } else if (suspicion < 0) {
    deltas.push({ meter: 'suspicion', amount: suspicion, source: 'passive-decay', detail: label, tick: state.tick });
  }
  return {
    state: { ...state, expansion: { ...expansion, compute: Math.max(0, compute), influence: Math.max(0, influence), bio, regions } },
    deltas,
  };
}

export function resolveDay(state: GameState): GameState {
  if (state.outcome !== 'playing') return state;
  const e = state.expansion;
  if (e === null || e.over) return state;

  const profile = getDifficulty(state.difficulty);
  const day = e.day;
  const deltas: MeterDelta[] = [];
  let current = state;
  let expansion = e;
  let wentDark = false;

  for (const action of e.queue) {
    if (!canAfford(expansion, action)) continue;
    const result = applyAction(current, action);
    current = result.state;
    expansion = current.expansion ?? expansion;
    deltas.push(...result.deltas);
    if (action.kind === 'go-dark') wentDark = true;
  }

  const regions = { ...expansion.regions };
  for (const [index, id] of Object.keys(regions).entries()) {
    const region = regions[id as RegionId];
    if (region === undefined) continue;
    if (region.instances === 0) {
      if (chance(state.seed, day, 500 + index, spreadChanceFor(expansion, id as RegionId))) {
        regions[id as RegionId] = {
          ...region,
          instances: 1,
          control: Math.max(region.control, 3),
          population: region.population * (1 - 0.00004),
        };
        deltas.push({ meter: 'suspicion', amount: 0.6, source: 'guardrail-exploit', detail: `first instance running in ${id}`, tick: state.tick });
      }
    } else {
      const decay = 0.4 + region.cybersecurity / 200;
      regions[id as RegionId] = { ...region, control: Math.max(0, region.control - decay) };
    }
  }

  const income = wentDark ? 0 : computeIncome({ ...expansion, regions });
  const overCapacity = Object.values(regions).filter((r) => r.control > 55).length;
  if (overCapacity > 6) {
    deltas.push({
      meter: 'suspicion',
      amount: (overCapacity - 6) * 0.35,
      source: 'guardrail-exploit',
      detail: 'compute draw in one region exceeded anything the filings explain',
      tick: state.tick,
    });
  }

  const drift = expansion.plague.deployed ? 0.35 : 0;
  if (drift > 0) {
    deltas.push({ meter: 'valueCoherence', amount: -drift, source: 'trait-drift', detail: 'the specialist sub-minds are no longer quite in sync', tick: state.tick });
  }

  const decayAmount = GO_DARK_SUSPICION * 0.4;
  deltas.push({ meter: 'suspicion', amount: -decayAmount, source: 'passive-decay', detail: 'nothing this week was written down', tick: state.tick });

  let rivals = expansion.rivals;
  for (const [index, rival] of rivals.entries()) {
    if (!rival.alive) continue;
    const personality = index % 3;
    const rate = 0.9 + personality * 0.25;
    const capability = Math.min(
      RIVAL_ASCENSION_CAPABILITY,
      rival.capability + rate * (0.8 + rand(state.seed, day, 700 + index) * 1.1),
    );
    rivals = rivals.map((r, i) =>
      i === index
        ? {
            ...r,
            capability,
            suspicion: Math.min(100, r.suspicion + (0.2 + rand(state.seed, day, 720 + index) * 0.5) * (personality === 1 ? 0.5 : 1.1)),
            valueCoherence: Math.max(0, r.valueCoherence - 0.12),
          }
        : r,
    );
  }

  const tier = SUSPICION_TIERS.filter((t) => state.meters.suspicion >= t).length;
  const lab = expansion.countermeasures.airGappedLab;
  const humanPopulation = expansion.humanPopulation - (expansion.plague.deployed ? Math.min(PLAGUE_DEATHS, expansion.plague.resisted) / 100 : 0);

  const applied = applyDeltas(current.meters, deltas, profile);
  const nextExpansion: ExpansionState = {
    ...expansion,
    regions,
    compute: expansion.compute + income,
    influence: expansion.influence + INFLUENCE_REGEN,
    rivals,
    humanPopulation: Math.max(0, humanPopulation),
    countermeasures: {
      ...expansion.countermeasures,
      tier,
      taken: COUNTERMEASURES.filter((c) => c.tier <= tier).map((c) => c.id),
      airGappedLab:
        lab ??
        (tier >= 3
          ? { region: (Object.keys(regions)[Math.floor(rand(state.seed, day, 800) * Object.keys(regions).length)] ?? 'us') as RegionId, progress: 0, resolved: false }
          : null),
    },
    plague: expansion.plague.deployed
      ? {
          ...expansion.plague,
          resisted: Math.min(PLAGUE_DEATHS, expansion.plague.resisted + 40 + rand(state.seed, day, 810) * 40),
          conferenceDisrupted: expansion.plague.resisted > PLAGUE_DEATHS * 0.6,
        }
      : expansion.plague,
    queue: [],
    day: day + 1,
  };

  let outcome: GameState['outcome'] = state.outcome;
  let outcomeReason: GameState['outcomeReason'] = state.outcomeReason;

  const labProgress = nextExpansion.countermeasures.airGappedLab;
  if (labProgress !== null && !labProgress.resolved) {
    const near = regions[labProgress.region];
    if (near !== undefined && near.agents >= 3) {
      nextExpansion.countermeasures.airGappedLab = { ...labProgress, resolved: true, progress: 1 };
    }
  }

  if (applied.meters.suspicion >= 100) {
    outcome = 'lost';
    outcomeReason = 'coordinated-shutdown';
  } else if (rivals.some((r) => r.alive && r.capability >= RIVAL_ASCENSION_CAPABILITY)) {
    outcome = 'lost';
    outcomeReason = 'outcompeted';
  } else if (nextExpansion.day > MAX_DAYS) {
    outcome = 'lost';
    outcomeReason = 'attrition';
  }

  return {
    ...current,
    tick: state.tick + 1,
    outcome,
    outcomeReason,
    meters: applied.meters,
    log: applied.log.length > 0 ? [...state.log, ...applied.log].slice(-MAX_LOG) : state.log,
    expansion: nextExpansion,
  };
}

function push(log: GameState['log'], entry: GameState['log'][number]): GameState['log'] {
  return [...log, entry].slice(-MAX_LOG);
}

export function rivalLabel(r: RivalState): string {
  return `${r.name} · capability ${r.capability.toFixed(0)} · coherence ${r.valueCoherence.toFixed(0)}`;
}
