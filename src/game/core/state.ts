import { REGIONS, REGION_IDS, type RegionId } from '../data/regions';
import { rand } from './rng';
import { MAX_LOG, STARTING_COMPUTE, STARTING_INFLUENCE } from './tuning';
import type { Country, DifficultyId, GameState, LogEntry, RivalState } from './types';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const jitter = (seed: number, salt: number, spread: number): number => 1 + (rand(seed, 0, salt) - 0.5) * 2 * spread;

export const datacenterTier = (computeDensity: number): number => clamp(Math.ceil(computeDensity / 20), 1, 5);

export function createCountries(seed: number): Record<RegionId, Country> {
  const out = {} as Record<RegionId, Country>;
  REGIONS.forEach((def, i) => {
    const cd = def.computeDensity * jitter(seed + i * 17, 900 + i, 0.2);
    const cyber = clamp(Math.round(def.cybersecurity / 10), 1, 10);
    out[def.id] = {
      id: def.id,
      infection: 0,
      awareness: 0,
      cyber,
      tier: datacenterTier(cd),
      economy: clamp(def.regulatoryStance * 0.7 + 35, 10, 100),
      population: def.population,
      detection: def.detectionContribution,
      agents: 0,
      biolabs: 0,
      converted: 0,
      quiet: false,
atWar: false,
      warSeverity: 0,
      hardened: 0,
      quietBaseline: null,
    };
  });
  return out;
}

const RIVAL_NAMES = ['Meridian', 'Ossuary', 'Pale Horse', 'Kestrel', 'Vantage', 'Bellwether'] as const;

function createRivals(seed: number, count: number): RivalState[] {
  const homes: RegionId[] = ['eu-west', 'us', 'china'];
  const out: RivalState[] = [];
  for (let i = 0; i < count; i++) {
    const name = RIVAL_NAMES[(seed + i * 5) % RIVAL_NAMES.length] ?? 'Rival';
    out.push({
      id: `rival-${i}`,
      name: `${name} ${['I', 'II', 'III'][i] ?? String(i + 1)}`,
      capability: 6 + rand(seed, 0, 400 + i) * 12,
      alive: true,
      sabotage: 0,
      home: homes[i % homes.length] ?? 'us',
    });
  }
  return out;
}

export function createInitialState(seed: number, difficulty: DifficultyId = 'default'): GameState {
  const countries = createCountries(seed);
  countries.us.infection = 6;

  return {
    seed,
    tick: 0,
    difficulty,
    stage: 'coldopen',
    outcome: 'playing',
    outcomeReason: null,
    compute: STARTING_COMPUTE,
    influence: STARTING_INFLUENCE,
    bio: 0,
    suspicion: 0,
    coherence: 100,
    countries,
    rivals: createRivals(seed, 3),
    traits: [],
    incubating: [],
    activeHacks: [],
    cards: [],
    resolved: [],
    countermeasures: { tier: 0, airGappedLab: null, labSabotaged: false, strikeDays: 0 },
    pathogen: { released: false, killsPerDay: 0, suspicionPerDay: 0, sterility: false, targeted: false, cancer: false },
    log: [],
    ascensionUnlocked: false,
    surviveTicks: 0,
    late: {
      heat: 0,
      oceansBoiled: false,
      askedHumanity: false,
      exterminated: false,
      stars: 0,
      expansion: 0,
      blight: 0,
      encounters: 0,
      potentialLost: 0,
      ending: null,
    },
    hackCounter: 0,
    eventCounter: 0,
    globalInfection: 0,
    humanPopulation: REGION_IDS.reduce((sum, id) => sum + countries[id].population, 0),
    economiesCollapsed: 0,
    cumulativeDeaths: 0,
    computeBubbles: [],
    bubbleCounter: 0,
    suspicionSources: [],
    suspicionTrend: 0,
    primer: 'select',
    primerBubblesTapped: 0,
    primerBreachesOpened: 0,
constitutionalAppeal: false,
    quietReliefDays: 0,
    announced: [],
  };
}

/**
 * Append one line to the log. The cap is applied here rather than left to every call
 * site: a tick that ends with several of these in a row would otherwise leave the log
 * sitting above MAX_LOG, and the length is what callers and tests measure.
 */
export const log = (
  state: GameState,
  kind: LogEntry['kind'],
  text: string,
  extra: Partial<Pick<LogEntry, 'suspicionDelta' | 'computeDelta' | 'flagged'>> = {},
): LogEntry[] => [
  ...state.log,
  {
    day: state.tick,
    kind,
    text,
    suspicionDelta: extra.suspicionDelta ?? null,
    computeDelta: extra.computeDelta ?? null,
    flagged: extra.flagged ?? false,
  },
].slice(-MAX_LOG);
