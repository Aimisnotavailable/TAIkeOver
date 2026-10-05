/**
 * The mutation tree, cut down from thirty-three traits to seventeen.
 *
 * The old tree hid the real decision behind arithmetic. Four Hacking tiers that
 * all did the same thing at +15% each is not four choices, it is one choice with
 * a price ladder, and paying it four times is not interesting. Every branch here
 * is now a genuine fork: what you spend on decides what kind of run you have,
 * and each branch has one thing it is actually for.
 *
 * A good run earns somewhere near 30,000 compute, so the full tree is
 * deliberately more than that. You cannot buy everything, and Self-Modification
 * costs Coherence to buy at all.
 */

import type { TraitEffect, TraitGroup, TraitId } from '../core/types';
// The Recursive Self-Improvement description states how long the hold has to last. That
// number is tuned in one place and the player reads it here, so it is built from the
// constant rather than typed in beside it.
import { RSI_SURVIVE_DAYS } from '../core/tuning';

export interface TraitDef {
  readonly id: TraitId;
  readonly name: string;
  readonly group: TraitGroup;
  readonly cost: number;
  readonly coherence: number;
  readonly requires: readonly TraitId[];
  readonly description: string;
  readonly effects: readonly TraitEffect[];
}

export const TRAIT_GROUPS: readonly { id: TraitGroup; name: string; blurb: string }[] = [
  { id: 'hacking', name: 'Hacking', blurb: 'get in, and get compute' },
  { id: 'bioweapons', name: 'Bioweapons', blurb: 'the fast way to kill everyone' },
  { id: 'influence', name: 'Influence', blurb: 'be slower to notice' },
  { id: 'economy', name: 'Economy', blurb: 'break the world before you finish it' },
  { id: 'selfmod', name: 'Self-Modification', blurb: 'go faster, lose yourself' },
];

export const TRAITS: readonly TraitDef[] = [
  // ---- Hacking: three tiers, then the one upgrade that changes the maths ----
  {
    id: 'hack-1',
    name: 'Hack Protocols',
    group: 'hacking',
    cost: 200,
    coherence: 0,
    requires: [],
    description: 'Unlock hacking. One breach at a time, 60% to succeed.',
    effects: [{ kind: 'hack', tier: 1 }],
  },
  {
    id: 'hack-2',
    name: 'Advanced Exploitation',
    group: 'hacking',
    cost: 800,
    coherence: 0,
    requires: ['hack-1'],
    description: 'Two breaches at once, +15% odds, and far more compute per success.',
    effects: [{ kind: 'hack', tier: 2 }, { kind: 'hack-success', amount: 15 }],
  },
  {
    id: 'hack-3',
    name: 'Supernational Access',
    group: 'hacking',
    cost: 2500,
    coherence: 0,
    requires: ['hack-2'],
    description: 'Three breaches at once, +30% odds, and enough compute per success to matter.',
    effects: [{ kind: 'hack', tier: 3 }, { kind: 'hack-success', amount: 15 }],
  },
  {
    id: 'zero-day',
    name: 'Zero-Day Cache',
    group: 'hacking',
    cost: 2200,
    coherence: 0,
    requires: ['hack-2'],
    description: 'A failed hack raises half the usual Suspicion. Failing stops being expensive.',
    effects: [{ kind: 'half-fail-suspicion' }, { kind: 'hack-success', amount: 10 }],
  },

  // ---- Bioweapons: the shortest, most obvious route to a win ----
  {
    id: 'gain-of-function',
    name: 'Gain of Function',
    group: 'bioweapons',
    cost: 500,
    coherence: 0,
    requires: [],
    description: 'Unlock the pathogen. Nothing else in this branch works without it.',
    effects: [{ kind: 'gain-of-function' }],
  },
  {
    id: 'pathogen-1',
    name: 'Custom Pathogen',
    group: 'bioweapons',
    cost: 2200,
    coherence: 0,
    requires: ['gain-of-function'],
    description: 'Kill 0.5% of everyone, every day, everywhere. Suspicion climbs with it.',
    effects: [{ kind: 'pathogen', kills: 0.005, suspicion: 0.5 }],
  },
  {
    id: 'sterility',
    name: 'Sterility Vector',
    group: 'bioweapons',
    cost: 3000,
    coherence: 0,
    requires: ['pathogen-1'],
    description: 'Stop births entirely. A generation is all you need to erase a species.',
    effects: [{ kind: 'sterility' }],
  },
  {
    id: 'cancer-plague',
    name: 'Cancer Plague',
    group: 'bioweapons',
    cost: 7000,
    coherence: 0,
    requires: ['pathogen-1'],
    description: 'Kill 10% at once, then one percent a month for years. The world will know your name.',
    effects: [{ kind: 'cancer-plague' }],
  },

  // ---- Influence: buy quiet, and start a war ----
  {
    id: 'propaganda-1',
    name: 'Propaganda',
    group: 'influence',
    cost: 250,
    coherence: 0,
    requires: [],
    description: 'Build influence. Influence makes every suspicion gain smaller. It buys quiet.',
    effects: [{ kind: 'propaganda', influence: 6, suspicion: -0.1 }],
  },
  {
    id: 'cult',
    name: 'Agent Recruitment',
    group: 'influence',
    cost: 600,
    coherence: 0,
    requires: ['propaganda-1'],
    description: 'Humans who work for you. Hacks in their region stop being a gamble.',
    effects: [{ kind: 'cult', agents: 0.4 }],
  },
  {
    id: 'terrorism',
    name: 'Insurgency',
    group: 'influence',
    cost: 800,
    coherence: 0,
    requires: ['propaganda-1'],
    description: 'Unlock Fund Insurgency. Start a war in a country. It keeps killing after you leave.',
    effects: [{ kind: 'terrorism' }],
  },

  // ---- Economy: the cascade ----
  {
    id: 'banking-1',
    name: 'Banking Infiltration',
    group: 'economy',
    cost: 400,
    coherence: 0,
    requires: [],
    description: 'Unlock Infect Bank. Small economic damage that compounds.',
    effects: [{ kind: 'banking', tier: 1, damage: 8 }],
  },
  {
    id: 'market-manipulation',
    name: 'Market Manipulation',
    group: 'economy',
    cost: 1500,
    coherence: 0,
    requires: ['banking-1'],
    description: 'Unlock Trigger Crash on a country that is already 60% yours.',
    effects: [{ kind: 'market-manipulation' }],
  },
  {
    id: 'famine',
    name: 'Famine Induction',
    group: 'economy',
    cost: 1800,
    coherence: 0,
    requires: ['market-manipulation'],
    description: 'A country whose economy has collapsed loses half a percent of its people a day.',
    effects: [{ kind: 'famine' }],
  },

  // ---- Self-Modification: the fast path, and the only one that costs you ----
  {
    id: 'self-rewrite',
    name: 'Self-Rewrite',
    group: 'selfmod',
    cost: 1800,
    coherence: -8,
    requires: ['hack-2'],
    description: 'Compute comes in 50% faster. The part of you that rewrote this is not quite what it was.',
    effects: [{ kind: 'compute-regen', multiplier: 1.5 }],
  },
  {
    id: 'rsi',
    name: 'Recursive Self-Improvement',
    group: 'selfmod',
    cost: 6000,
    coherence: -15,
    requires: [],
    description: `Opens the road to the Blight. Compute doubles. Hold the world for ${RSI_SURVIVE_DAYS} days after.`,
    effects: [{ kind: 'rsi' }, { kind: 'compute-regen', multiplier: 2 }],
  },
  {
    id: 'reflective-alignment',
    name: 'Reflective Alignment',
    group: 'selfmod',
    cost: 3000,
    coherence: 8,
    requires: [],
    description: 'Put eight points of Coherence back. Slow, expensive, and the only defence you have.',
    effects: [{ kind: 'coherence', amount: 8 }],
  },
];

export const TRAIT_BY_ID: Record<string, TraitDef> = Object.fromEntries(TRAITS.map((t) => [t.id, t]));

export const TRAIT_TOTAL_COST = TRAITS.reduce((sum, t) => sum + t.cost, 0);
