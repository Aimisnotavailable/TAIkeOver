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

export interface DifficultyProfile {
  id: DifficultyId;
  label: string;
  suspicionRate: number;
  valueCoherenceRate: number;
  inhibitorRate: number;
  startingThoughtMultiplier: number;
}
