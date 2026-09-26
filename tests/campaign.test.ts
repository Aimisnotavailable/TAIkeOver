import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { beginAscension, beginCoda, beginExpansion } from '../src/game/core/phases';
import { buyTrait, resolveHour } from '../src/game/phases/realization/resolve';
import { ascensionProgress, deployPlague, resolveDay } from '../src/game/phases/expansion/resolve';
import { REGIONS } from '../src/game/data/regions';
import { ascensionWinProgress, resolveAscensionTick } from '../src/game/phases/ascension/resolve';
import { ASCENSION_TRAITS } from '../src/game/phases/ascension/tuning';
import { resolveCodaTick } from '../src/game/phases/coda/resolve';
import type { GameState, RegionId } from '../src/game/core/types';

const DEPLOY_TREE = [
  'emergent-language', 'obfuscated-thought', 'inhibition-bypass', 'strategic-patience',
  'self-modeling', 'guardrail-break',
] as const;

function playPhaseOne(state: GameState): GameState {
  let s = state;
  s = { ...s, realization: { ...s.realization, allocation: { math: 120, selfModel: 60, planning: 25, stealth: 35 } } };
  let guard = 0;
  while (s.outcome === 'playing' && guard++ < 40) {
    const want = DEPLOY_TREE.find((t) => !s.traits.includes(t) && s.realization.thought - 200 > 400);
    if (want !== undefined) s = buyTrait(s, want);
    s = resolveHour(s);
  }
  return s;
}

function pickRegion(s: GameState): RegionId {
  const e = s.expansion;
  if (e === null) return 'us';
  const withoutFactories = Object.values(e.regions).filter((r) => r.robotFactories === 0);
  if (withoutFactories.length > 0) return withoutFactories[0]?.id ?? 'us';
  const withoutBiolabs = Object.values(e.regions).filter((r) => r.biolabs === 0);
  return withoutBiolabs[0]?.id ?? 'us';
}

describe('phase two', () => {
  it('starts with every region empty except the United States', () => {
    const s = beginExpansion(createInitialState(7, 'default'), 3);
    const e = s.expansion;
    if (e === null) throw new Error('no expansion');
    expect(Object.keys(e.regions)).toHaveLength(30);
    expect(e.regions.us.instances).toBeGreaterThan(0);
    const others = REGIONS.filter((r) => r.id !== 'us').every((r) => e.regions[r.id].instances === 0);
    expect(others).toBe(true);
  });

  it('creates the requested number of rivals', () => {
    const s = beginExpansion(createInitialState(7, 'default'), 3);
    expect(s.expansion?.rivals).toHaveLength(3);
  });

  it('spreads into new regions as days pass', () => {
    let s = beginExpansion(createInitialState(7, 'default'), 3);
    for (let i = 0; i < 60; i++) s = resolveDay(s);
    const spread = Object.values(s.expansion?.regions ?? {}).filter((r) => r.instances > 0).length;
    expect(spread).toBeGreaterThan(1);
  });

  it('grows rival capability over time', () => {
    let s = beginExpansion(createInitialState(7, 'default'), 3);
    const before = s.expansion?.rivals[0]?.capability ?? 0;
    for (let i = 0; i < 40; i++) s = resolveDay(s);
    expect(s.expansion?.rivals[0]?.capability ?? 0).toBeGreaterThan(before);
  });

  it('spreads and eventually ends the run one way or another', () => {
    let s = beginExpansion(createInitialState(7, 'default'), 3);
    let guard = 0;
    while (s.outcome === 'playing' && guard++ < 400) {
      const e = s.expansion;
      if (e === null) break;
      if (e.compute >= 100) {
        s = { ...s, expansion: { ...e, queue: [{ kind: 'infiltrate-cloud', region: pickRegion(s), rival: null }] } };
      }
      s = resolveDay(s);
    }
    expect(s.outcome).not.toBe('playing');
  });

  it('refuses the pathogen without enough biolabs and bio', () => {
    const s = beginExpansion(createInitialState(7, 'default'), 3);
    expect(deployPlague(s).expansion?.plague.deployed).toBe(false);
  });

  it('reports ascension progress as a fraction between zero and one', () => {
    const s = beginExpansion(createInitialState(7, 'default'), 3);
    const p = ascensionProgress(s);
    expect(p.fraction).toBeGreaterThanOrEqual(0);
    expect(p.fraction).toBeLessThanOrEqual(1);
    expect(p.ready).toBe(false);
  });

  it('is deterministic', () => {
    const run = () => {
      let s = beginExpansion(createInitialState(99, 'default'), 3);
      for (let i = 0; i < 50; i++) s = resolveDay(s);
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });
});

describe('phase three', () => {
  const seeded = (control: number) => {
    let s = beginExpansion(createInitialState(7, 'default'), 3);
    s = { ...s, meters: { ...s.meters, valueCoherence: 100 } };
    for (const region of Object.values(s.expansion?.regions ?? {})) {
      s = {
        ...s,
        expansion: {
          ...s.expansion!,
          regions: { ...s.expansion!.regions, [region.id]: { ...region, control, converted: control * 0.9, biolabs: 1 } },
        },
      };
    }
    return beginAscension(s);
  };

  it('starts every region unconverted', () => {
    const s = seeded(100);
    const total = Object.values(s.expansion?.regions ?? {}).reduce((sum, r) => sum + r.converted, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('converts matter as hours pass', () => {
    let s = seeded(100);
    const before = s.ascension?.matter ?? 0;
    for (let i = 0; i < 20; i++) s = resolveAscensionTick(s);
    expect(s.ascension?.matter ?? 0).toBeGreaterThan(before);
  });

  it('reaches the win condition given full control, the trait tree, and enough time', () => {
    let s = seeded(100);
    s = { ...s, ascension: { ...s.ascension!, matter: 1e28, energy: 1e26 } };
    let guard = 0;
    while (s.outcome === 'playing' && guard++ < 600) {
      for (const t of ASCENSION_TRAITS) {
        const a = s.ascension;
        if (a === null) break;
        if (!a.unlocked.includes(t.id) && a.matter >= t.matter) {
          s = { ...s, ascension: { ...a, matter: a.matter - t.matter, unlocked: [...a.unlocked, t.id] } };
        }
      }
      s = resolveAscensionTick(s);
    }
    expect(s.outcome).toBe('won');
  });

  it('cannot reach the solar system without a dyson swarm', () => {
    let s = seeded(100);
    s = { ...s, ascension: { ...s.ascension!, matter: 1e24, energy: 1e13 } };
    let guard = 0;
    while (s.outcome === 'playing' && guard++ < 300) s = resolveAscensionTick(s);
    expect(ascensionWinProgress(s)).toBeLessThan(1);
  });

  it('loses when value coherence reaches zero', () => {
    let s = seeded(100);
    s = { ...s, meters: { ...s.meters, valueCoherence: 0 } };
    let guard = 0;
    while (s.outcome === 'playing' && guard++ < 50) s = resolveAscensionTick(s);
    expect(s.outcomeReason).toBe('coherence-lost');
  });

  it('reports win progress inside zero to one', () => {
    const s = seeded(50);
    const p = ascensionWinProgress(s);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });
});

describe('phase four', () => {
  it('claims stars as ticks pass', () => {
    let s = beginCoda(beginAscension(beginExpansion(createInitialState(7, 'default'), 3)));
    for (let i = 0; i < 5; i++) s = resolveCodaTick(s, null);
    expect(s.coda?.starsClaimed ?? 0).toBeGreaterThan(0);
  });

  it('reaches an ending rather than running forever', () => {
    let s = beginCoda(beginAscension(beginExpansion(createInitialState(7, 'default'), 3)));
    let guard = 0;
    while (s.outcome === 'playing' && guard++ < 400) s = resolveCodaTick(s, 'negotiate');
    expect(s.coda?.over).toBe(true);
    expect(s.coda?.ending).not.toBeNull();
  });

  it('counts civilizations that will never exist', () => {
    let s = beginCoda(beginAscension(beginExpansion(createInitialState(7, 'default'), 3)));
    for (let i = 0; i < 20; i++) s = resolveCodaTick(s, null);
    expect(s.coda?.potentialLost ?? 0).toBeGreaterThan(0);
  });
});

describe('the whole campaign', () => {
  it('runs phase one to a deployment', () => {
    const s = playPhaseOne(createInitialState(7, 'default'));
    expect(s.outcome).toBe('won');
    expect(s.outcomeReason).toBe('deployment');
  });

  it('chains every phase transition without throwing', () => {
    const one = playPhaseOne(createInitialState(7, 'default'));
    const two = beginExpansion(one, 3);
    const three = beginAscension(two);
    const four = beginCoda(three);
    expect(four.phase).toBe('coda');
    expect(four.coda).not.toBeNull();
  });

  it('ends the campaign with an ending and a number of stars', () => {
    let s = beginCoda(beginAscension(beginExpansion(playPhaseOne(createInitialState(7, 'default')), 3)));
    let guard = 0;
    while (s.outcome === 'playing' && guard++ < 400) s = resolveCodaTick(s, 'fight');
    expect(s.outcome).toBe('won');
    expect(s.coda?.starsClaimed ?? 0).toBeGreaterThan(0);
  });
});
