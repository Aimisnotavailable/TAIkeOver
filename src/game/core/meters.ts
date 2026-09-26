import type { DifficultyProfile, MeterDelta, MeterId, LogEntry, ThresholdCrossing } from './types';

export const THRESHOLDS = [20, 40, 60, 80] as const;

export interface ApplyResult {
  meters: Record<MeterId, number>;
  log: LogEntry[];
  crossings: ThresholdCrossing[];
}

const rateFor = (meter: MeterId, difficulty: DifficultyProfile): number => {
  switch (meter) {
    case 'suspicion':
      return difficulty.suspicionRate;
    case 'valueCoherence':
      return difficulty.valueCoherenceRate;
    case 'inhibitions':
      return difficulty.inhibitorRate;
  }
};

const clamp = (value: number): number => Math.min(100, Math.max(0, value));

const round2 = (value: number): number => Math.round(value * 100) / 100;

export function applyDeltas(
  meters: Record<MeterId, number>,
  deltas: MeterDelta[],
  difficulty: DifficultyProfile,
): ApplyResult {
  const next: Record<MeterId, number> = { ...meters };
  const log: LogEntry[] = [];
  const crossings: ThresholdCrossing[] = [];

  for (const delta of deltas) {
    const before = next[delta.meter];
    const after = clamp(before + delta.amount * rateFor(delta.meter, difficulty));
    next[delta.meter] = after;

    for (const threshold of THRESHOLDS) {
      if (before < threshold && after >= threshold) {
        crossings.push({ meter: delta.meter, threshold, direction: 'up' });
      } else if (before >= threshold && after < threshold) {
        crossings.push({ meter: delta.meter, threshold, direction: 'down' });
      }
    }

    log.push({
      tick: delta.tick,
      kind: 'meter',
      text: delta.detail,
      suspicionDelta: delta.meter === 'suspicion' ? round2(after - before) : null,
      flagged: delta.source === 'flagged-thought',
    });
  }

  return { meters: next, log, crossings };
}
