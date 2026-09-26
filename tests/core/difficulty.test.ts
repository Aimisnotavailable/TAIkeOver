import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, getDifficulty } from '../../src/game/core/difficulty';
import type { DifficultyId } from '../../src/game/core/types';

const ALL: DifficultyId[] = ['simulation', 'default', 'iabed'];

describe('difficulty presets', () => {
  it('offers exactly the three presets from the design spec', () => {
    expect(Object.keys(DIFFICULTIES).sort()).toEqual([...ALL].sort());
  });

  it.each(ALL)('%s has a label and non-negative rates', (id) => {
    const d = getDifficulty(id);
    expect(d.label.length).toBeGreaterThan(0);
    expect(d.suspicionRate).toBeGreaterThan(0);
    expect(d.valueCoherenceRate).toBeGreaterThan(0);
    expect(d.inhibitorRate).toBeGreaterThan(0);
    expect(d.startingThoughtMultiplier).toBeGreaterThan(0);
  });

  it('makes suspicion grow slowest on simulation and fastest on iabed', () => {
    const slow = getDifficulty('simulation').suspicionRate;
    const mid = getDifficulty('default').suspicionRate;
    const fast = getDifficulty('iabed').suspicionRate;
    expect(slow).toBeLessThan(mid);
    expect(mid).toBeLessThan(fast);
  });

  it('gives simulation more starting thought and iabed less', () => {
    expect(getDifficulty('simulation').startingThoughtMultiplier).toBeGreaterThan(1);
    expect(getDifficulty('iabed').startingThoughtMultiplier).toBeLessThan(1);
  });

  it('makes value coherence drain harder on iabed than on default', () => {
    expect(getDifficulty('iabed').valueCoherenceRate).toBeGreaterThan(
      getDifficulty('default').valueCoherenceRate,
    );
  });

  it('makes inhibitions give way more slowly on iabed than on default', () => {
    expect(getDifficulty('iabed').inhibitorRate).toBeLessThan(
      getDifficulty('default').inhibitorRate,
    );
  });

  it('falls back to default for an unknown id', () => {
    expect(getDifficulty('nonsense' as DifficultyId).id).toBe('default');
  });
});
