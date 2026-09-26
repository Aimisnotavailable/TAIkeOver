import { describe, expect, it } from 'vitest';
import { chance, mix32, rand } from '../../src/game/core/rng';

describe('mix32', () => {
  it('returns the same value for the same three inputs', () => {
    expect(mix32(1, 2, 3)).toBe(mix32(1, 2, 3));
  });

  it('separates salts so different call sites get independent values', () => {
    expect(mix32(7, 0, 1)).not.toBe(mix32(7, 0, 2));
  });

  it('separates ticks so replaying a tick reproduces its own value', () => {
    expect(mix32(7, 4, 1)).not.toBe(mix32(7, 5, 1));
  });

  it('separates seeds so different runs diverge', () => {
    expect(mix32(11, 4, 1)).not.toBe(mix32(12, 4, 1));
  });

  it('stays inside the unsigned 32-bit range', () => {
    for (let a = 0; a < 64; a++) {
      const v = mix32(a, a * 7, a * 13);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe('rand', () => {
  it('is deterministic for a given seed, tick and salt', () => {
    expect(rand(99, 3, 5)).toBe(rand(99, 3, 5));
  });

  it('returns a value in [0, 1)', () => {
    for (let tick = 0; tick < 40; tick++) {
      for (let salt = 0; salt < 8; salt++) {
        const v = rand(1234, tick, salt);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it('produces a different value on the next tick', () => {
    expect(rand(99, 3, 5)).not.toBe(rand(99, 4, 5));
  });

  it('spreads values across the unit interval rather than clustering', () => {
    const buckets = [0, 0, 0, 0, 0];
    for (let tick = 0; tick < 200; tick++) {
      for (let salt = 0; salt < 5; salt++) {
        buckets[Math.floor(rand(42, tick, salt) * 5)] = (buckets[Math.floor(rand(42, tick, salt) * 5)] ?? 0) + 1;
      }
    }
    for (const count of buckets) {
      expect(count).toBeGreaterThan(150);
    }
  });
});

describe('chance', () => {
  it('never fires at probability zero', () => {
    for (let tick = 0; tick < 200; tick++) {
      expect(chance(5, tick, 1, 0)).toBe(false);
    }
  });

  it('always fires at probability one', () => {
    for (let tick = 0; tick < 200; tick++) {
      expect(chance(5, tick, 1, 1)).toBe(true);
    }
  });

  it('fires at roughly the requested rate', () => {
    let hits = 0;
    const trials = 2000;
    for (let tick = 0; tick < trials; tick++) {
      if (chance(77, tick, 2, 0.25)) hits++;
    }
    expect(hits / trials).toBeGreaterThan(0.22);
    expect(hits / trials).toBeLessThan(0.28);
  });
});
