export type Speed = 0 | 1 | 2 | 4 | 8;

export type Stage = 'coldopen' | 'world' | 'late' | 'coda';

export type Outcome = 'playing' | 'won' | 'lost';

export type DifficultyId = 'simulation' | 'default' | 'iabed';

export interface DifficultyProfile {
  id: DifficultyId;
  label: string;
  hackBonus: number;
  suspicionRate: number;
  cooldownDays: number;
}

export type { RegionId } from '../data/regions';
import type { RegionId } from '../data/regions';

export type TraitGroup = 'hacking' | 'bioweapons' | 'influence' | 'economy' | 'selfmod';

export type TraitId = string;

export type TraitEffect =
  | { kind: 'hack'; tier: number }
  | { kind: 'hack-success'; amount: number }
  | { kind: 'hack-yield'; multiplier: number }
  | { kind: 'half-fail-suspicion' }
  | { kind: 'gain-of-function' }
  | { kind: 'pathogen'; kills: number; suspicion: number }
  | { kind: 'sterility' }
  | { kind: 'cancer-plague' }
  | { kind: 'propaganda'; influence: number; suspicion: number }
  | { kind: 'cult'; agents: number }
  | { kind: 'terrorism' }
  | { kind: 'banking'; tier: number; damage: number }
  | { kind: 'market-manipulation' }
  | { kind: 'famine' }
  | { kind: 'compute-regen'; multiplier: number }
  | { kind: 'coherence'; amount: number }
  | { kind: 'rsi' };

export interface HackProgress {
  key: number;
  country: RegionId;
  startTick: number;
  resolveTick: number;
  duration: number;
  tier: number;
  auto: boolean;
  depth: number;
  wins: number;
  losses: number;
}

export interface SuspicionSource {
  label: string;
  value: number;
}

export interface IncubatingTrait {
  trait: TraitId;
  startTick: number;
  readyTick: number;
}

export interface Country {
  id: RegionId;
  infection: number;
  awareness: number;
  cyber: number;
  tier: number;
  economy: number;
  population: number;
  detection: number;
  agents: number;
  biolabs: number;
  converted: number;
  quiet: boolean;
  atWar: boolean;
  warSeverity: number;
  hardened: number;
}

export interface RivalState {
  id: string;
  name: string;
  capability: number;
  alive: boolean;
  sabotage: number;
  home: RegionId;
}

export interface CountermeasureState {
  tier: number;
  airGappedLab: RegionId | null;
  labSabotaged: boolean;
  strikeDays: number;
}

export interface PathogenState {
  released: boolean;
  killsPerDay: number;
  suspicionPerDay: number;
  sterility: boolean;
  targeted: boolean;
  cancer: boolean;
}

export type EventChoiceId = string;

export interface EventChoice {
  id: EventChoiceId;
  label: string;
  detail: string;
}

export interface EventCard {
  key: number;
  event: string;
  title: string;
  body: string;
  country: RegionId | null;
  choices: readonly EventChoice[];
  urgent: boolean;
}

export type ComputeBubbleKind = 'red' | 'orange' | 'blue';

export interface ComputeBubble {
  id: number;
  region: RegionId;
  kind: ComputeBubbleKind;
  value: number;
  bornTick: number;
  expiresTick: number;
  phase: number;
}

export interface LateState {
  heat: number;
  oceansBoiled: boolean;
  askedHumanity: boolean;
  exterminated: boolean;
  stars: number;
  expansion: number;
  blight: number;
  encounters: number;
  potentialLost: number;
  ending: string | null;
}

export interface LogEntry {
  day: number;
  kind: 'hack' | 'spread' | 'economy' | 'event' | 'trait' | 'system' | 'bio' | 'rival';
  text: string;
  suspicionDelta: number | null;
  computeDelta: number | null;
  flagged: boolean;
}

export interface GameState {
  seed: number;
  tick: number;
  difficulty: DifficultyId;
  stage: Stage;
  outcome: Outcome;
  outcomeReason: string | null;
  compute: number;
  influence: number;
  bio: number;
  suspicion: number;
  coherence: number;
  countries: Record<RegionId, Country>;
  rivals: RivalState[];
  traits: TraitId[];
  incubating: IncubatingTrait[];
  activeHacks: HackProgress[];
  cards: EventCard[];
  resolved: EventChoiceId[];
  countermeasures: CountermeasureState;
  pathogen: PathogenState;
  log: LogEntry[];
  ascensionUnlocked: boolean;
  surviveTicks: number;
  late: LateState;
  hackCounter: number;
  eventCounter: number;
  globalInfection: number;
  humanPopulation: number;
  cumulativeDeaths: number;
  economiesCollapsed: number;
  computeBubbles: ComputeBubble[];
  bubbleCounter: number;
  suspicionSources: SuspicionSource[];
  suspicionTrend: number;
}
