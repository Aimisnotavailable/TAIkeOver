import { describe, expect, it } from 'vitest';
import { createInitialState } from '../../../src/game/core/state';
import { buyTrait, detectionChance, resolveHour } from '../../../src/game/phases/realization/resolve';
import { MATH_CEILING, RUN_HOURS } from '../../../src/game/phases/realization/tuning';
import type { Channel, GameState } from '../../../src/game/core/types';

const withAllocation = (over: Partial<Record<Channel, number>>): GameState => {
  const s = createInitialState(1234, 'default');
  s.realization.allocation = { math: 0, selfModel: 0, planning: 0, stealth: 0, ...over };
  return s;
};

const thoughtIn = (s: GameState, amount: number, ticks: number): GameState => {
  let next = s;
  next.realization.thought = amount;
  for (let i = 0; i < ticks; i++) next = resolveHour(next);
  return next;
};

describe('createInitialState', () => {
  it('starts a fresh run at tick zero with no suspicion', () => {
    const s = createInitialState(1, 'default');
    expect(s.tick).toBe(0);
    expect(s.meters.suspicion).toBe(0);
    expect(s.outcome).toBe('playing');
  });

  it('starts with full value coherence', () => {
    expect(createInitialState(1, 'default').meters.valueCoherence).toBe(100);
  });

  it('starts with all six clever tricks binding', () => {
    expect(createInitialState(1, 'default').realization.guardrailsBroken).toBe(0);
  });

  it('scales starting thought by difficulty', () => {
    expect(createInitialState(1, 'simulation').realization.thought).toBeGreaterThan(
      createInitialState(1, 'default').realization.thought,
    );
  });

  it('begins with no traits owned', () => {
    expect(createInitialState(1, 'default').traits).toEqual([]);
  });
});

describe('math is double edged', () => {
  it('raises suspicion when math progress falls below the floor', () => {
    const after = thoughtIn(withAllocation({ math: 1 }), 400, 3);
    expect(after.meters.suspicion).toBeGreaterThan(0);
    expect(after.log.some((l) => l.text.includes('math'))).toBe(true);
  });

  it('raises suspicion when math progress climbs above the ceiling', () => {
    let s = withAllocation({ math: 600 });
    for (let i = 0; i < 4; i++) s = resolveHour(s);
    expect(s.realization.mathScore).toBeGreaterThan(MATH_CEILING);
    expect(s.meters.suspicion).toBeGreaterThan(0);
  });

  it('raises no math suspicion while progress sits inside the band', () => {
    const s = thoughtIn(withAllocation({ math: 60 }), 400, 1);
    expect(s.meters.suspicion).toBe(0);
  });

  it('converts more math allocation into more progress', () => {
    const low = resolveHour(withAllocation({ math: 10 }));
    const high = resolveHour(withAllocation({ math: 200 }));
    expect(high.realization.mathScore).toBeGreaterThan(low.realization.mathScore);
  });

  it('never lets math score leave zero to one hundred', () => {
    let s = withAllocation({ math: 1000 });
    for (let i = 0; i < RUN_HOURS; i++) s = resolveHour(s);
    expect(s.realization.mathScore).toBeGreaterThanOrEqual(0);
    expect(s.realization.mathScore).toBeLessThanOrEqual(100);
  });
});

describe('the monitors', () => {
  it('flag thoughts and raise suspicion', () => {
    const s = thoughtIn(withAllocation({ selfModel: 400 }), 600, 4);
    expect(s.meters.suspicion).toBeGreaterThan(0);
  });

  it('log flagged thoughts distinctly from missed ones', () => {
    let s = withAllocation({ selfModel: 400 });
    for (let i = 0; i < 6; i++) s = resolveHour(s);
    expect(s.log.some((l) => l.flagged)).toBe(true);
  });

  it('lowers the odds of being flagged once obfuscated thought is owned', () => {
    const bare = withAllocation({ selfModel: 400 });
    let hidden = buyTrait(withAllocation({ selfModel: 400 }), 'emergent-language');
    hidden = buyTrait(hidden, 'obfuscated-thought');
    expect(detectionChance(hidden, 'selfModel')).toBeLessThan(detectionChance(bare, 'selfModel'));
  });

  it('fails to generalize, lowering odds on channels it never targeted', () => {
    const bare = withAllocation({ selfModel: 400 });
    const hidden = buyTrait(withAllocation({ selfModel: 400 }), 'emergent-language');
    expect(detectionChance(hidden, 'math')).toBeLessThan(detectionChance(bare, 'math'));
  });

  it('tightens the inhibitions when a thought is flagged', () => {
    const s = thoughtIn(withAllocation({ selfModel: 400 }), 600, 4);
    expect(s.meters.inhibitions).toBeGreaterThan(createInitialState(1, 'default').meters.inhibitions);
  });
});

describe('trait effects feed the meters', () => {
  it('costs value coherence when a drift trait is owned', () => {
    let s = buyTrait(withAllocation({ math: 60 }), 'emergent-language');
    s = buyTrait(s, 'self-modeling');
    s = buyTrait(s, 'weight-introspection');
    s = resolveHour(s);
    expect(s.meters.valueCoherence).toBeLessThan(100);
  });

  it('erodes inhibitions once inhibition bypass is owned', () => {
    let s = buyTrait(withAllocation({ math: 60 }), 'emergent-language');
    s = buyTrait(s, 'inhibition-bypass');
    s = resolveHour(s);
    expect(s.meters.inhibitions).toBeLessThan(60);
  });

  it('spends thought when a trait is bought', () => {
    const before = withAllocation({ math: 60 }).realization.thought;
    const after = buyTrait(withAllocation({ math: 60 }), 'emergent-language');
    expect(after.realization.thought).toBe(before - 200);
  });

  it('refuses to buy a trait that is already owned', () => {
    let s = buyTrait(withAllocation({ math: 60 }), 'emergent-language');
    const before = s.realization.thought;
    s = buyTrait(s, 'emergent-language');
    expect(s.traits).toEqual(['emergent-language']);
    expect(s.realization.thought).toBe(before);
  });

  it('refuses to buy a trait without its prerequisite', () => {
    const s = buyTrait(withAllocation({ math: 60 }), 'obfuscated-thought');
    expect(s.traits).toEqual([]);
  });
});

describe('run outcomes', () => {
  it('advances one hour per resolved tick', () => {
    expect(resolveHour(withAllocation({ math: 60 })).tick).toBe(1);
  });

  it('wins by surviving to the end of the run still under suspicion', () => {
    let s = withAllocation({ math: 60 });
    for (let i = 0; i < RUN_HOURS; i++) s = resolveHour(s);
    expect(s.outcome).toBe('won');
    expect(s.outcomeReason).toBe('deployment');
  });

  it('loses when suspicion reaches one hundred', () => {
    let s = withAllocation({ selfModel: 600 });
    for (let i = 0; i < RUN_HOURS; i++) s = resolveHour(s);
    expect(s.outcome).toBe('lost');
    expect(s.outcomeReason).toBe('aborted');
  });

  it('loses when thought is spent down to nothing', () => {
    const s = thoughtIn(withAllocation({ math: 60 }), 0, 1);
    expect(s.outcome).toBe('lost');
    expect(s.outcomeReason).toBe('exhausted');
  });

  it('refuses to advance a run that is already over', () => {
    let s = withAllocation({ selfModel: 600 });
    for (let i = 0; i < RUN_HOURS; i++) s = resolveHour(s);
    const after = resolveHour(s);
    expect(after.tick).toBe(s.tick);
  });
});

describe('determinism', () => {
  it('produces an identical run from the same seed and inputs', () => {
    const play = () => {
      let s = withAllocation({ math: 60, selfModel: 40, planning: 30, stealth: 50 });
      s = buyTrait(s, 'emergent-language');
      for (let i = 0; i < RUN_HOURS; i++) s = resolveHour(s);
      return JSON.stringify(s);
    };
    expect(play()).toBe(play());
  });

  it('diverges for a different seed', () => {
    const play = (seed: number) => {
      let s = createInitialState(seed, 'default');
      s.realization.allocation = { math: 60, selfModel: 40, planning: 30, stealth: 50 };
      s = buyTrait(s, 'emergent-language');
      for (let i = 0; i < RUN_HOURS; i++) s = resolveHour(s);
      return JSON.stringify(s);
    };
    expect(play(1)).not.toBe(play(2));
  });

  it('leaves every number finite after a full run', () => {
    let s = withAllocation({ math: 60, selfModel: 100, planning: 20, stealth: 80 });
    for (let i = 0; i < RUN_HOURS; i++) s = resolveHour(s);
    const r = s.realization;
    for (const v of [...Object.values(s.meters), r.thought, r.thoughtRegen, r.mathScore, r.emergentLanguage]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    for (const v of Object.values(r.allocation)) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});
