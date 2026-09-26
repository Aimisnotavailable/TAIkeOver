import { ADJACENCY, REGIONS, type RegionId } from '../../data/regions';
import { rand } from '../../core/rng';
import type { ExpansionState, RegionState, RivalState } from '../../core/types';
import {
  EXPANSION_DAYS,
  RIVAL_NAMES,
  STARTING_COMPUTE,
  STARTING_INFLUENCE,
} from './tuning';

const jitter = (seed: number, tick: number, salt: number, spread: number): number =>
  1 + (rand(seed, tick, salt) - 0.5) * 2 * spread;

export function createRegionStates(seed: number, tick: number): Record<RegionId, RegionState> {
  const out = {} as Record<RegionId, RegionState>;
  REGIONS.forEach((def, index) => {
    const s = (salt: number): number => seed + index * 31 + salt;
    out[def.id] = {
      id: def.id,
      control: 0,
      instances: 0,
      population: def.population,
      biolabs: 0,
      robotFactories: 0,
      agents: 0,
      converted: 0,
      computeDensity: clampAttr(def.computeDensity * jitter(s(0), tick, 11, 0.2)),
      cybersecurity: clampAttr(def.cybersecurity * jitter(s(0), tick, 12, 0.2)),
      regulatoryStance: clampAttr(def.regulatoryStance * jitter(s(0), tick, 13, 0.2)),
      biolabPresence: clampAttr(def.biolabPresence * jitter(s(0), tick, 14, 0.2)),
      robotManufacturing: clampAttr(def.robotManufacturing * jitter(s(0), tick, 15, 0.2)),
      humanAgentPool: clampAttr(def.humanAgentPool * jitter(s(0), tick, 16, 0.2)),
      detectionContribution: clampAttr(def.detectionContribution * jitter(s(0), tick, 17, 0.2)),
    };
  });
  return out;
}

const clampAttr = (v: number): number => Math.max(0, Math.min(100, v));

function createRivals(seed: number, count: number): RivalState[] {
  const out: RivalState[] = [];
  for (let i = 0; i < count; i++) {
    const name = RIVAL_NAMES[(seed + i * 7) % RIVAL_NAMES.length] ?? 'Rival';
    out.push({
      id: `rival-${i}`,
      name: `${name} ${['I', 'II', 'III'][i] ?? String(i + 1)}`,
      capability: 8 + rand(seed, 0, 300 + i) * 14,
      suspicion: rand(seed, 0, 310 + i) * 10,
      valueCoherence: 100,
      disposition: 20 + rand(seed, 0, 320 + i) * 30,
      alive: true,
      sabotage: 0,
    });
  }
  return out;
}

export function createExpansionState(seed: number, rivalCount: number): ExpansionState {
  const regions = createRegionStates(seed, 0);
  regions.us.control = 8;
  regions.us.instances = 1;
  return {
    compute: STARTING_COMPUTE,
    influence: STARTING_INFLUENCE,
    bio: 0,
    humanPopulation: REGIONS.reduce((sum, r) => sum + r.population, 0),
    regions,
    rivals: createRivals(seed, rivalCount),
    countermeasures: { tier: 0, taken: [], sabotaged: [], airGappedLab: null },
    plague: { deployed: false, deaths: 0, resisted: 0, conferenceDisrupted: false },
    queue: [],
    day: 0,
    over: false,
    overReason: null,
  };
}

export const hasBeachhead = (state: ExpansionState, id: RegionId): boolean =>
  state.regions[id].instances > 0;

export const isAdjacentToControlled = (state: ExpansionState, id: RegionId): boolean =>
  ADJACENCY[id].some((n) => state.regions[n].control > 5);

export const totalBiolabs = (state: ExpansionState): number =>
  Object.values(state.regions).reduce((sum, r) => sum + r.biolabs, 0);

export const totalFactories = (state: ExpansionState): number =>
  Object.values(state.regions).reduce((sum, r) => sum + r.robotFactories, 0);

export const computeIncome = (state: ExpansionState): number =>
  Math.round(
    Object.values(state.regions).reduce(
      (sum, r) => sum + (r.control / 100) * r.computeDensity,
      0,
    ) * 45,
  );

export const MAX_DAYS = EXPANSION_DAYS;
