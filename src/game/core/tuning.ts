import type { DifficultyId, DifficultyProfile } from '../core/types';

export const TICK_MS = 7000;
export const SPEEDS = [0, 1, 2, 4, 8] as const;

export const STARTING_COMPUTE = 300;
export const STARTING_INFLUENCE = 60;
export const COMPUTE_FACTOR = 1.5;
export const COMPUTE_CEILING = 30_000;
export const HARDEN_RISE = 0.6;
export const HARDEN_FALL = 0.35;
export const HARDEN_MAX = 8;
export const HARDEN_PENALTY = 3.5;
export const START_TICK_INCUBATION = 3;
export const MAX_INCUBATION = 8;

export const BASE_HACK_SUCCESS = 60;
export const HACK_DURATION: Record<number, number> = { 1: 2, 2: 3, 3: 4, 4: 6 };
export const HACK_YIELD: Record<number, readonly [number, number]> = {
  1: [50, 200],
  2: [75, 300],
  3: [500, 2000],
  4: [2000, 10000],
};
export const HACK_SUSPICION_SUCCESS: Record<number, number> = { 1: 2, 2: 3, 3: 4, 4: 5 };
export const HACK_SUSPICION_FAIL: Record<number, number> = { 1: 4, 2: 5, 3: 7, 4: 9 };

export const SPREAD_BASE = 0.55;
export const SPREAD_NEIGHBOUR = 0.35;
export const SPREAD_HACKED = 1.4;
export const AWARE_THRESHOLD = 50;
export const AWARENESS_GROWTH = 1.6;
export const COUNTER_HACK_DRAIN = 9;
export const COUNTER_HACK_MAX_COUNTRIES = 6;
export const COUNTER_HACK_INTERVAL = 3;

export const BANK_DAMAGE_AWARENESS = 4;
export const CRASH_DAMAGE = 34;
export const CRASH_AWARENESS = 12;
export const INSURGENCY_SUSPICION = 3.5;
export const INSURGENCY_CYBER = 0.6;
export const SUPPLY_CHAIN_SHARE = 0.35;
export const FAMINE_RATE = 0.005;
export const ECONOMY_RECOVER = 0.25;
export const CYBER_GROWTH = 0.02;
export const RECESSION_CYBER = 1;
export const COLLAPSED_THRESHOLD = 20;
export const ECONOMY_COLLAPSE_COUNT = 3;

export const SUSPICION_DECAY = 0.9;
export const HACK_CYCLE_DAYS = 5;
export const HACK_FAIL_COST: Record<number, number> = { 1: 45, 2: 110, 3: 280, 4: 650 };
export const DEPTH_YIELD_STEP = 0.4;
export const MAX_DEPTH = 8;
export const AWARENESS_PRESSURE = 0.1;
export const COUNTERMEASURE_TIERS = [20, 40, 60, 80] as const;
export const AIR_GAP_TIER = 2;
export const AIR_GAP_PENALTY = 15;
export const STRIKE_TIER = 4;
export const STRIKE_DRAIN = 180;

export const ASCENSION_COMPUTE = 20_000;
export const ASCENSION_INFECTION = 60;
export const ASCENSION_COHERENCE = 30;
export const RSI_SURVIVE_DAYS = 30;

export const STARS_PER_DAY = 4200;
export const BLIGHT_WALL = 62;
export const COHERENCE_DRIFT_BELOW = 50;
export const COHERENCE_PANIC_BELOW = 20;
export const MAX_LOG = 300;

export const DIFFICULTIES: Record<DifficultyId, DifficultyProfile> = {
  simulation: { id: 'simulation', label: 'Simulation', hackBonus: 15, suspicionRate: 0.6, cooldownDays: 3 },
  default: { id: 'default', label: 'Default', hackBonus: 0, suspicionRate: 1, cooldownDays: 4 },
  iabed: { id: 'iabed', label: 'IABED', hackBonus: -10, suspicionRate: 1.5, cooldownDays: 6 },
};

export const getDifficulty = (id: DifficultyId): DifficultyProfile =>
  DIFFICULTIES[id] ?? DIFFICULTIES.default;

// compute bubbles: the tap targets that make watching the map worth doing.
export const COMPUTE_BUBBLE_TTL = 6;
export const COMPUTE_BUBBLE_MAX = 14;
export const COMPUTE_BUBBLE_SPAWN_CHANCE = 0.55;
export const COMPUTE_BUBBLE_CHANCE_RED = 0.62;
export const COMPUTE_BUBBLE_CHANCE_ORANGE = 0.3;
export const COMPUTE_BUBBLE_CHANCE_BLUE = 0.22;
export const COMPUTE_BUBBLE_RADIUS = 14;

// Passive compute, paid per in-game day. Scaled so it never replaces tapping.
export const COMPUTE_PASSIVE_BASE = 1;
export const COMPUTE_PASSIVE_PER_BILLED = 6;