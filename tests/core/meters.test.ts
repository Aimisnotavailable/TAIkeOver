import { describe, expect, it } from 'vitest';
import { applyDeltas } from '../../src/game/core/meters';
import type { DifficultyProfile, MeterDelta, MeterId } from '../../src/game/core/types';

const NEUTRAL: DifficultyProfile = {
  id: 'default',
  label: 'Default',
  suspicionRate: 1,
  valueCoherenceRate: 1,
  inhibitorRate: 1,
  startingThoughtMultiplier: 1,
};

const starting = (o: Partial<Record<MeterId, number>> = {}): Record<MeterId, number> => ({
  suspicion: o.suspicion ?? 0,
  valueCoherence: o.valueCoherence ?? 100,
  inhibitions: o.inhibitions ?? 60,
});

const delta = (overrides: Partial<MeterDelta> = {}): MeterDelta => ({
  meter: 'suspicion',
  amount: 5,
  source: 'flagged-thought',
  detail: 'flagged during self-modeling',
  tick: 3,
  ...overrides,
});

describe('applyDeltas', () => {
  it('raises a meter by the delta amount', () => {
    const result = applyDeltas(starting(), [delta({ amount: 5 })], NEUTRAL);
    expect(result.meters.suspicion).toBe(5);
  });

  it('lowers a meter when the delta amount is negative', () => {
    const result = applyDeltas(starting(), [delta({ amount: -8 })], NEUTRAL);
    expect(result.meters.suspicion).toBe(0);
  });

  it('clamps suspicion at 100 no matter how large the delta', () => {
    const result = applyDeltas(starting(), [delta({ amount: 400 })], NEUTRAL);
    expect(result.meters.suspicion).toBe(100);
  });

  it('clamps value coherence at 0', () => {
    const result = applyDeltas(starting(), [delta({ meter: 'valueCoherence', amount: -400 })], NEUTRAL);
    expect(result.meters.valueCoherence).toBe(0);
  });

  it('does not mutate the meters object it was given', () => {
    const before = starting();
    applyDeltas(before, [delta({ amount: 5 })], NEUTRAL);
    expect(before.suspicion).toBe(0);
  });

  it('sums several deltas to the same meter', () => {
    const result = applyDeltas(
      starting(),
      [delta({ amount: 5 }), delta({ amount: 3 }), delta({ amount: 2 })],
      NEUTRAL,
    );
    expect(result.meters.suspicion).toBe(10);
  });

  it('scales suspicion by the difficulty suspicion rate', () => {
    const result = applyDeltas(starting(), [delta({ amount: 10 })], {
      ...NEUTRAL,
      suspicionRate: 1.5,
    });
    expect(result.meters.suspicion).toBe(15);
  });

  it('scales value coherence by its own rate, not the suspicion rate', () => {
    const result = applyDeltas(starting(), [delta({ meter: 'valueCoherence', amount: -10 })], {
      ...NEUTRAL,
      suspicionRate: 3,
      valueCoherenceRate: 1,
    });
    expect(result.meters.valueCoherence).toBe(90);
  });

  it('scales inhibitions by the inhibitor rate', () => {
    const result = applyDeltas(starting(), [delta({ meter: 'inhibitions', amount: -10 })], {
      ...NEUTRAL,
      inhibitorRate: 0.5,
    });
    expect(result.meters.inhibitions).toBe(55);
  });
});

describe('applyDeltas threshold crossings', () => {
  it('reports crossing twenty when suspicion moves from 19 to 21', () => {
    const result = applyDeltas(starting({ suspicion: 19 }), [delta({ amount: 2 })], NEUTRAL);
    expect(result.crossings).toEqual([{ meter: 'suspicion', threshold: 20, direction: 'up' }]);
  });

  it('reports nothing while suspicion stays below the first threshold', () => {
    const result = applyDeltas(starting(), [delta({ amount: 19 })], NEUTRAL);
    expect(result.crossings).toEqual([]);
  });

  it('reports a downward crossing when suspicion falls back under a threshold', () => {
    const result = applyDeltas(starting({ suspicion: 22 }), [delta({ amount: -5 })], NEUTRAL);
    expect(result.crossings).toEqual([{ meter: 'suspicion', threshold: 20, direction: 'down' }]);
  });

  it('does not re-report a threshold the meter is already past', () => {
    const result = applyDeltas(starting({ suspicion: 25 }), [delta({ amount: 2 })], NEUTRAL);
    expect(result.crossings).toEqual([]);
  });

  it('reports every threshold jumped in a single step', () => {
    const result = applyDeltas(starting({ suspicion: 19 }), [delta({ amount: 45 })], NEUTRAL);
    expect(result.crossings.map((c) => c.threshold)).toEqual([20, 40, 60]);
  });
});

describe('applyDeltas logging', () => {
  it('writes one log entry per delta, carrying the detail text', () => {
    const result = applyDeltas(starting(), [delta({ detail: 'weights named a region' })], NEUTRAL);
    expect(result.log).toHaveLength(1);
    expect(result.log[0]?.text).toBe('weights named a region');
  });

  it('records the suspicion change on suspicion log entries', () => {
    const result = applyDeltas(starting(), [delta({ amount: 5 })], NEUTRAL);
    expect(result.log[0]?.suspicionDelta).toBe(5);
  });

  it('leaves suspicionDelta null for deltas to other meters', () => {
    const result = applyDeltas(starting(), [delta({ meter: 'inhibitions', amount: -5 })], NEUTRAL);
    expect(result.log[0]?.suspicionDelta).toBeNull();
  });

  it('stamps each log entry with the tick it came from', () => {
    const result = applyDeltas(starting(), [delta({ tick: 9 })], NEUTRAL);
    expect(result.log[0]?.tick).toBe(9);
  });

  it('marks entries as flagged when the delta came from a flagged thought', () => {
    const result = applyDeltas(starting(), [delta({ source: 'flagged-thought' })], NEUTRAL);
    expect(result.log[0]?.flagged).toBe(true);
  });

  it('leaves entries unflagged for other sources', () => {
    const result = applyDeltas(starting(), [delta({ source: 'math-neglect' })], NEUTRAL);
    expect(result.log[0]?.flagged).toBe(false);
  });
});
