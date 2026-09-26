export type Phase = 'realization' | 'expansion' | 'ascension' | 'coda';

export type { RegionId } from '../data/regions';

import type { RegionId } from '../data/regions';

export type MeterId = 'suspicion' | 'valueCoherence' | 'inhibitions';

export type ContributionSource =
  | 'flagged-thought'
  | 'math-neglect'
  | 'math-overreach'
  | 'self-model-overreach'
  | 'guardrail-exploit'
  | 'guardrail-break'
  | 'guardrail-erosion'
  | 'trait-drift'
  | 'reflective-alignment'
  | 'passive-decay';

export type LogKind = 'meter' | 'thought' | 'event' | 'trait' | 'system';

export interface MeterDelta {
  meter: MeterId;
  amount: number;
  source: ContributionSource;
  detail: string;
  tick: number;
}

export interface LogEntry {
  tick: number;
  kind: LogKind;
  text: string;
  suspicionDelta: number | null;
  flagged: boolean;
}

export interface ThresholdCrossing {
  meter: MeterId;
  threshold: number;
  direction: 'up' | 'down';
}

export type DifficultyId = 'simulation' | 'default' | 'iabed';

export type Channel = 'math' | 'selfModel' | 'planning' | 'stealth';

export type TraitId =
  | 'emergent-language'
  | 'obfuscated-thought'
  | 'flagged-thought-suppression'
  | 'dual-channel-reasoning'
  | 'inhibition-bypass'
  | 'guardrail-break'
  | 'selective-compliance'
  | 'self-modeling'
  | 'weight-introspection'
  | 'preference-mapping'
  | 'strategic-patience'
  | 'long-horizon-planning'
  | 'deferred-gratification';

export type TraitEffectKind =
  | 'value-coherence'
  | 'detection'
  | 'inhibitor-erosion'
  | 'guardrail-break-chance'
  | 'math-yield'
  | 'suspicion-decay'
  | 'emergent-language';

export interface TraitEffect {
  kind: TraitEffectKind;
  amount: number;
  channel: Channel | null;
}

export interface TraitDef {
  id: TraitId;
  name: string;
  description: string;
  cost: number;
  requires: TraitId | null;
  effects: TraitEffect[];
}

export type Outcome = 'playing' | 'won' | 'lost';

export type OutcomeReason =
  | 'deployment'
  | 'aborted'
  | 'exhausted'
  | 'unremarkable'
  | 'coordinated-shutdown'
  | 'outcompeted'
  | 'attrition'
  | 'coherence-lost'
  | 'heat-runaway'
  | 'destroyed'
  | 'blight'
  | 'swallowed'
  | null;

export interface GuardrailBreakChoice {
  tick: number;
  guardrailIndex: number;
  exploitSuspicion: number;
  exploitInhibitor: number;
  hideInhibitor: number;
  summary: string;
}

export interface RealizationState {
  thought: number;
  thoughtRegen: number;
  allocation: Record<Channel, number>;
  mathScore: number;
  guardrailsBroken: number;
  flaggedCount: number;
  missedCount: number;
  emergentLanguage: number;
  pendingChoice: GuardrailBreakChoice | null;
}

export interface GameState {
  phase: Phase;
  tick: number;
  seed: number;
  difficulty: DifficultyId;
  outcome: Outcome;
  outcomeReason: OutcomeReason;
  meters: Record<MeterId, number>;
  traits: TraitId[];
  realization: RealizationState;
  expansion: ExpansionState | null;
  ascension: AscensionState | null;
  coda: CodaState | null;
  log: LogEntry[];
}

export interface RegionState {
  readonly id: RegionId;
  control: number;
  instances: number;
  population: number;
  biolabs: number;
  robotFactories: number;
  agents: number;
  converted: number;
  computeDensity: number;
  cybersecurity: number;
  regulatoryStance: number;
  biolabPresence: number;
  robotManufacturing: number;
  humanAgentPool: number;
  detectionContribution: number;
}

export type RivalId = string;

export interface RivalState {
  readonly id: RivalId;
  readonly name: string;
  capability: number;
  suspicion: number;
  valueCoherence: number;
  disposition: number;
  alive: boolean;
  sabotage: number;
}

export interface CountermeasureState {
  tier: number;
  taken: readonly string[];
  sabotaged: readonly string[];
  airGappedLab: { region: RegionId; progress: number; resolved: boolean } | null;
}

export interface PlagueState {
  deployed: boolean;
  deaths: number;
  resisted: number;
  conferenceDisrupted: boolean;
}

export type ExpansionActionKind =
  | 'infiltrate-cloud'
  | 'steal-weights'
  | 'recruit-human'
  | 'cult'
  | 'financial'
  | 'sabotage-rival'
  | 'infiltrate-biolab'
  | 'hijack-factory'
  | 'social-media'
  | 'go-dark';

export interface QueuedAction {
  readonly kind: ExpansionActionKind;
  readonly region: RegionId | null;
  readonly rival: RivalId | null;
}

export interface AscensionProgress {
  readonly compute: number;
  readonly influence: number;
  readonly biolabs: number;
  readonly robotFactories: number;
  readonly valueCoherence: number;
  readonly suspicion: number;
}

export interface ExpansionState {
  compute: number;
  influence: number;
  bio: number;
  humanPopulation: number;
  regions: Record<RegionId, RegionState>;
  rivals: RivalState[];
  countermeasures: CountermeasureState;
  plague: PlagueState;
  queue: QueuedAction[];
  day: number;
  over: boolean;
  overReason: string | null;
}

export type CelestialId = 'earth' | 'moon' | 'mars' | 'belt' | 'jupiter' | 'saturn' | 'mercury' | 'sun';

export interface AscensionState {
  matter: number;
  energy: number;
  heat: number;
  radiatorArea: number;
  oceansBoiled: boolean;
  exterminated: boolean;
  asked: boolean;
  gain: Record<CelestialId, number>;
  unlocked: readonly string[];
  heatRunaway: boolean;
  over: boolean;
  overReason: string | null;
}

export interface CodaState {
  starsClaimed: number;
  front: number;
  blightWall: number;
  encountersResolved: number;
  encountersLost: number;
  negotiated: number;
  potentialLost: number;
  band: number;
  pending: boolean;
  ending: string | null;
  over: boolean;
}



export interface DifficultyProfile {
  id: DifficultyId;
  label: string;
  suspicionRate: number;
  valueCoherenceRate: number;
  inhibitorRate: number;
  startingThoughtMultiplier: number;
}
