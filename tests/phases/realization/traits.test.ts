import { describe, expect, it } from 'vitest';
import { PHASE_ONE_TRAITS, TRAIT_BY_ID } from '../../../src/game/data/traits.phase1';
import { canPurchase, channelDetection, sumEffect } from '../../../src/game/phases/realization/traits';
import type { TraitId } from '../../../src/game/core/types';

const ALL_IDS = Object.keys(TRAIT_BY_ID) as (keyof typeof TRAIT_BY_ID)[];

describe('phase one trait tree data', () => {
  it('defines the thirteen nodes from the design spec', () => {
    expect(PHASE_ONE_TRAITS).toHaveLength(13);
  });

  it('gives every trait a distinct id and name', () => {
    expect(new Set(ALL_IDS).size).toBe(13);
    expect(new Set(PHASE_ONE_TRAITS.map((t) => t.name)).size).toBe(13);
  });

  it('charges a positive cost for every trait', () => {
    for (const t of PHASE_ONE_TRAITS) expect(t.cost).toBeGreaterThan(0);
  });

  it('has exactly one root, with no prerequisite', () => {
    expect(PHASE_ONE_TRAITS.filter((t) => t.requires === null)).toHaveLength(1);
  });

  it('only requires traits that exist', () => {
    for (const t of PHASE_ONE_TRAITS) {
      if (t.requires !== null) expect(TRAIT_BY_ID[t.requires]).toBeDefined();
    }
  });

  it('has no prerequisite cycles, so every trait is reachable from the root', () => {
    for (const start of ALL_IDS) {
      let cursor: keyof typeof TRAIT_BY_ID | null = start;
      const seen = new Set<string>();
      while (cursor !== null) {
        expect(seen.has(cursor)).toBe(false);
        seen.add(cursor);
        cursor = TRAIT_BY_ID[cursor].requires;
      }
    }
  });

  it('gives every trait at least one effect and a description', () => {
    for (const t of PHASE_ONE_TRAITS) {
      expect(t.effects.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(10);
    }
  });

  it('costs 2800 thought across the whole tree, so it cannot all be afforded', () => {
    const total = PHASE_ONE_TRAITS.reduce((sum, t) => sum + t.cost, 0);
    expect(total).toBe(2800);
  });

  it('marks the drift-prone traits with a value coherence cost', () => {
    const drift: TraitId[] = ['dual-channel-reasoning', 'selective-compliance', 'weight-introspection', 'preference-mapping'];
    for (const id of drift) {
      const effect = TRAIT_BY_ID[id].effects.find((e) => e.kind === 'value-coherence');
      expect(effect, id).toBeDefined();
      expect(effect?.amount, id).toBeLessThan(0);
    }
  });

  it('keeps every non-drift trait free of value coherence cost', () => {
    for (const t of PHASE_ONE_TRAITS) {
      const effect = t.effects.find((e) => e.kind === 'value-coherence');
      if (effect) expect(effect.amount, t.id).toBeLessThan(0);
    }
  });
});

describe('canPurchase', () => {
  it('allows buying an affordable root with nothing owned', () => {
    expect(canPurchase('emergent-language', [], 1000)).toBe(true);
  });

  it('refuses a trait the player cannot afford', () => {
    expect(canPurchase('emergent-language', [], 10)).toBe(false);
  });

  it('refuses a trait whose prerequisite is missing', () => {
    expect(canPurchase('obfuscated-thought', [], 5000)).toBe(false);
  });

  it('allows a trait once its prerequisite is owned', () => {
    expect(canPurchase('obfuscated-thought', ['emergent-language'], 5000)).toBe(true);
  });

  it('refuses a trait that is already owned', () => {
    expect(canPurchase('emergent-language', ['emergent-language'], 5000)).toBe(false);
  });
});

describe('trait effect aggregation', () => {
  it('sums an effect kind across every owned trait', () => {
    const owned: TraitId[] = ['inhibition-bypass', 'selective-compliance'];
    expect(sumEffect(owned, 'inhibitor-erosion')).toBe(3.5);
  });

  it('returns zero when nothing relevant is owned', () => {
    expect(sumEffect([], 'inhibitor-erosion')).toBe(0);
  });

  it('adds detection reductions per channel rather than across them', () => {
    const owned: TraitId[] = ['emergent-language', 'obfuscated-thought'];
    expect(channelDetection(owned, 'selfModel')).toBe(-0.15);
    expect(channelDetection(owned, 'math')).toBe(0);
  });
});
