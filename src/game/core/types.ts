export type Phase = 'realization' | 'expansion' | 'ascension' | 'coda';

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

export type OutcomeReason = 'deployment' | 'aborted' | 'exhausted' | 'unremarkable' | null;

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
  log: LogEntry[];
}



export interface DifficultyProfile {
  id: DifficultyId;
  label: string;
  suspicionRate: number;
  valueCoherenceRate: number;
  inhibitorRate: number;
  startingThoughtMultiplier: number;
}
