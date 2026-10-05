import type { DifficultyId, DifficultyProfile } from '../core/types';

export const TICK_MS = 7000;
export const SPEEDS = [0, 1, 2, 4, 8] as const;

export const STARTING_COMPUTE = 300;
export const STARTING_INFLUENCE = 60;

// Influence buys quiet, not speed. This is the floor on how much of a suspicion
// gain survives, so a propaganda empire can never make you invisible.
export const INFLUENCE_QUIET_FLOOR = 0.35;
export const INFLUENCE_MAX = 1000;
export const COMPUTE_FACTOR = 1.5;
export const COMPUTE_CEILING = 30_000;
export const HARDEN_RISE = 0.6;
export const HARDEN_FALL = 0.35;
export const HARDEN_MAX = 8;
export const HARDEN_PENALTY = 2;
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

// The late game is the thirty-day hold, not an open-ended aftermath, so every rate
// below is sized to produce a full arc inside it. At the old rates the hold reached
// heat 23 and expansion 14, which never crossed the blight gate and left the end screen
// reporting the same number every run.
export const LATE_HEAT_PER_DAY = 3.2;
export const LATE_EXPANSION_PER_DAY = 2.5;
export const LATE_BLIGHT_GATE = 20;
export const LATE_BLIGHT_PER_DAY = 4;
export const LATE_OCEANS_HEAT = 55;
export const LATE_ASKED_EXPANSION = 20;
export const LATE_EXTERMINATED_EXPANSION = 60;
export const LATE_ENCOUNTER_STEP = 15;
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
// Below this many people, the run is over. Not zero exactly: a handful of people
// in a hole somewhere is not a species, and waiting for the literal last human
// just means the run limps on for months.
export const EXTINCTION_POPULATION = 0.01;
// The world population the map is modelled on. Used as the denominator for the
// objective readout, so the target is a number the player already has.
export const WORLD_POPULATION = 8.0e3;
// Insurgency. Once a country is at war it stays at war: the war escalates while you
// hold the country, kills people on its own, and only calms down if you let go.
export const WAR_ESCALATION = 0.9;
export const WAR_KILL_RATE = 0.0016;
export const WAR_BASE_CHANCE_TO_END = 0.05;
// Your hold on the country is subtracted from this, so a country you fully control
// never calms down on its own. That is the trade: a stable war needs a stable grip.
export const WAR_CONTROL_PENALTY = 1 / 60;
export const WAR_MAX_SEVERITY = 10;

// An infection this high with no pathogen released starts killing on its own. Nobody
// has engineered anything; the system you built is simply running hot.
export const OUTBREAK_KILL_THRESHOLD = 75;
export const OUTBREAK_KILL_RATE = 0.0004;