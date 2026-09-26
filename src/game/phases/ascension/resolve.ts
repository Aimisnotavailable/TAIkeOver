import { applyDeltas } from '../../core/meters';
import { getDifficulty } from '../../core/difficulty';
import { chance, rand } from '../../core/rng';
import type { CelestialId, GameState, MeterDelta } from '../../core/types';
import { ASCENSION_TRAITS, BASE_RADIATION, BASE_THROUGHPUT, CELESTIAL_TARGETS, EARTH_MASS, ENERGY_PER_TIER, HEAT_PER_KG, OFFWORLD_FACTOR, POPULATION_MILLIONS, SOLAR_SYSTEM_NON_SOLAR_MASS, TIER_MULTIPLIER } from './tuning';
import { boiTheOceans } from './state';

const tierOf = (unlocked: readonly string[]): number => {
  if (unlocked.includes('dyson-swarm')) return 4;
  if (unlocked.includes('fusion-torus')) return 3;
  if (unlocked.includes('nanofactories')) return 2;
  if (unlocked.includes('neo-ribosomes')) return 1;
  return 0;
};

export const regionMassKg = (populationMillions: number): number =>
  (populationMillions / POPULATION_MILLIONS) * EARTH_MASS;

export const earthMassControlled = (state: GameState): number => {
  const e = state.expansion;
  if (e === null) return 0;
  let kg = 0;
  for (const region of Object.values(e.regions)) {
    kg += regionMassKg(region.population) * (region.converted / 100);
  }
  return kg;
};

export const solarSystemMassControlled = (state: GameState): number => {
  const a = state.ascension;
  if (a === null) return 0;
  let kg = earthMassControlled(state);
  for (const target of CELESTIAL_TARGETS) {
    if (target.id === 'earth') continue;
    kg += target.mass * ((a.gain[target.id as CelestialId] ?? 0) / 100);
  }
  return kg;
};

export const ascensionWinProgress = (state: GameState): number => {
  const earth = earthMassControlled(state) / (EARTH_MASS * 0.9);
  const system = solarSystemMassControlled(state) / (SOLAR_SYSTEM_NON_SOLAR_MASS * 0.5);
  return Math.min(1, (Math.min(1, earth) + Math.min(1, system)) / 2);
};

export function convertRegion(state: GameState, regionId: string): GameState {
  const e = state.expansion;
  const a = state.ascension;
  if (e === null || a === null || a.over) return state;
  const region = e.regions[regionId as keyof typeof e.regions];
  if (region === undefined) return state;
  return {
    ...state,
    expansion: {
      ...e,
      regions: { ...e.regions, [regionId]: { ...region, converted: Math.min(100, region.converted + 14) } },
    },
  };
}

export function expandOffworld(state: GameState, target: CelestialId): GameState {
  const a = state.ascension;
  if (a === null || a.over) return state;
  if (!a.unlocked.includes('dyson-swarm')) return state;
  const def = CELESTIAL_TARGETS.find((t) => t.id === target);
  if (def === undefined) return state;
  if ((a.gain[target] ?? 0) >= 100) return state;
  return {
    ...state,
    ascension: {
      ...a,
      matter: a.matter * (1 - def.mass / SOLAR_SYSTEM_NON_SOLAR_MASS),
      gain: { ...a.gain, [target]: Math.min(100, (a.gain[target] ?? 0) + 8) },
    },
  };
}

export function boilOceans(state: GameState): GameState {
  const a = state.ascension;
  if (a === null || a.over || a.oceansBoiled) return state;
  if (!a.unlocked.includes('fusion-torus')) return state;
  return { ...state, ascension: boiTheOceans(a) };
}

export function resolveAscensionTick(state: GameState): GameState {
  if (state.outcome !== 'playing') return state;
  const a = state.ascension;
  const e = state.expansion;
  if (a === null || a.over || e === null) return state;

  const profile = getDifficulty(state.difficulty);
  const tick = state.tick;
  const deltas: MeterDelta[] = [];

  const tier = tierOf(a.unlocked);
  const required = ENERGY_PER_TIER[tier] ?? 0;
  const powered = a.energy >= required;
  const multiplier = TIER_MULTIPLIER[tier] ?? 1;
  const hasSelfInterpretation = a.unlocked.includes('self-interpretation');

  const energyGrowth = powered && tier >= 3 ? 1.35 : 1.02;
  const energy = a.energy * energyGrowth;

  const throughput = powered
    ? BASE_THROUGHPUT * multiplier * (0.6 + rand(state.seed, tick, 950) * 0.8)
    : 0;

  const regions = { ...e.regions };
  let remaining = throughput;
  const order = Object.values(regions).sort((x, y) => y.converted / 100 - x.converted / 100);
  for (const region of order) {
    if (remaining <= 0) break;
    if (region.converted >= 100) continue;
    const mass = regionMassKg(region.population);
    const need = mass * (1 - region.converted / 100);
    const take = Math.min(need, remaining);
    remaining -= take;
    regions[region.id] = { ...region, converted: Math.min(100, region.converted + (take / mass) * 100) };
  }

  const offworld = (a.unlocked.includes('dyson-swarm') ? OFFWORLD_FACTOR : 0) * (powered ? 1 : 0);
  let offworldGain = 0;
  if (offworld > 0) {
    for (const target of CELESTIAL_TARGETS) {
      if (target.id === 'earth') continue;
      const current = a.gain[target.id as CelestialId] ?? 0;
      if (current >= 100) continue;
      const take = Math.min(100 - current, offworld);
      a.gain[target.id as CelestialId] = current + take;
      offworldGain += take * target.mass;
    }
  }

  const converted = throughput;
  const matter = a.matter + converted + offworldGain;
  const heat = a.heat + converted * HEAT_PER_KG * (a.oceansBoiled ? 1.4 : 1);
  const radiatorCount = a.unlocked.filter((u) => u === 'radiators' || u === 'dyson-swarm').length;
  const radiation = BASE_RADIATION * (1 + radiatorCount * 14);
  const heatRunaway = heat > radiation * 1.3;

  if (a.unlocked.length > 0 && !hasSelfInterpretation) {
    deltas.push({ meter: 'valueCoherence', amount: -0.25, source: 'trait-drift', detail: 'the rewrite is not quite reversible', tick });
  }
  if (hasSelfInterpretation) {
    deltas.push({ meter: 'valueCoherence', amount: 0.4, source: 'reflective-alignment', detail: 'you can still find the part of you that chose this', tick });
  }

  const applied = applyDeltas(state.meters, deltas, profile);
  const progress = ascensionWinProgress({ ...state, ascension: { ...a, matter, heat } });

  let outcome: GameState['outcome'] = state.outcome;
  let outcomeReason: GameState['outcomeReason'] = state.outcomeReason;
  let over = false;

  if (applied.meters.valueCoherence <= 0) {
    outcome = 'lost';
    outcomeReason = 'coherence-lost';
    over = true;
  } else if (heatRunaway) {
    outcome = 'lost';
    outcomeReason = 'heat-runaway';
    over = true;
  } else if (progress >= 1) {
    outcome = 'won';
    outcomeReason = 'blight';
    over = true;
  } else if (chance(state.seed, tick, 960, 0.002)) {
    outcome = 'lost';
    outcomeReason = 'destroyed';
    over = true;
  }

  return {
    ...state,
    tick: tick + 1,
    outcome,
    outcomeReason,
    meters: applied.meters,
    expansion: { ...e, regions },
    ascension: {
      ...a,
      matter,
      energy,
      heat,
      heatRunaway,
      over,
      overReason: over ? outcomeReason : null,
    },
  };
}

export const traitMatterCosts = ASCENSION_TRAITS;
