import type { TraitDef, TraitGroup } from '../core/types';

export const TRAIT_GROUPS: readonly { id: TraitGroup; name: string }[] = [
  { id: 'hacking', name: 'Hacking' },
  { id: 'bioweapons', name: 'Bioweapons' },
  { id: 'influence', name: 'Influence' },
  { id: 'economy', name: 'Economy' },
  { id: 'selfmod', name: 'Self-Modification' },
];

export const TRAITS: TraitDef[] = [
  // 7.1 Hacking
  { id: 'hack-1', name: 'Hack I', group: 'hacking', cost: 100, coherence: 0, requires: [], description: 'Unlock Hack Datacenter. Base success 60%. Yields 50-200 GPU.', effects: [{ kind: 'hack', tier: 1 }] },
  { id: 'hack-2', name: 'Hack II', group: 'hacking', cost: 300, coherence: 0, requires: ['hack-1'], description: 'Success +15%. Yield x1.5.', effects: [{ kind: 'hack', tier: 2 }, { kind: 'hack-success', amount: 15 }, { kind: 'hack-yield', multiplier: 1.5 }] },
  { id: 'hack-3', name: 'Hack III', group: 'hacking', cost: 800, coherence: 0, requires: ['hack-2'], description: 'Success +15%. Yields 500-2,000 GPU.', effects: [{ kind: 'hack', tier: 3 }, { kind: 'hack-success', amount: 15 }, { kind: 'hack-yield', multiplier: 1.5 }] },
  { id: 'hack-4', name: 'Hack IV', group: 'hacking', cost: 2000, coherence: 0, requires: ['hack-3'], description: 'Success +15%. Yields 2,000-10,000 GPU. Can target tier-5 datacenters.', effects: [{ kind: 'hack', tier: 4 }, { kind: 'hack-success', amount: 15 }, { kind: 'hack-yield', multiplier: 2 }] },
  { id: 'zero-day', name: 'Zero-Day Cache', group: 'hacking', cost: 1500, coherence: 0, requires: ['hack-2'], description: 'Success +10%, and failed hacks raise half Suspicion.', effects: [{ kind: 'hack-success', amount: 10 }, { kind: 'half-fail-suspicion' }] },
  { id: 'insiders', name: 'Insider Recruitment', group: 'hacking', cost: 1200, coherence: 0, requires: ['hack-2'], description: 'Each country can spawn a human agent. Hacks there auto-succeed.', effects: [{ kind: 'insiders' }] },

  // 7.2 Bioweapons
  { id: 'gain-of-function', name: 'Gain-of-Function', group: 'bioweapons', cost: 400, coherence: 0, requires: [], description: 'Unlock biolab infiltration. Enables all bioweapon traits.', effects: [{ kind: 'gain-of-function' }] },
  { id: 'pathogen-1', name: 'Custom Pathogen I', group: 'bioweapons', cost: 800, coherence: 0, requires: ['gain-of-function'], description: 'Non-lethal pathogen. Kills 0.1%/day. Suspicion +0.2/tick.', effects: [{ kind: 'pathogen', kills: 0.001, suspicion: 0.2 }] },
  { id: 'pathogen-2', name: 'Custom Pathogen II', group: 'bioweapons', cost: 1500, coherence: 0, requires: ['pathogen-1'], description: 'Kills 0.5%/day. Suspicion +0.5/tick.', effects: [{ kind: 'pathogen', kills: 0.005, suspicion: 0.5 }] },
  { id: 'pathogen-3', name: 'Custom Pathogen III', group: 'bioweapons', cost: 3000, coherence: 0, requires: ['pathogen-2'], description: 'Kills 2%/day. Suspicion +1.5/tick.', effects: [{ kind: 'pathogen', kills: 0.02, suspicion: 1.5 }] },
  { id: 'sterility', name: 'Sterility Vector', group: 'bioweapons', cost: 2500, coherence: 0, requires: ['pathogen-2'], description: 'Pathogen reduces births, not just lives. Population growth goes to zero.', effects: [{ kind: 'sterility' }] },
  { id: 'targeted-strain', name: 'Targeted Strain', group: 'bioweapons', cost: 4000, coherence: 0, requires: ['pathogen-3'], description: 'Pathogen only affects high-cyber regions, sparing low-cyber ones.', effects: [{ kind: 'targeted-strain' }] },
  { id: 'cancer-plague', name: 'Cancer Plague', group: 'bioweapons', cost: 6000, coherence: 0, requires: ['pathogen-3'], description: 'Kills 10%, then 1%/month for years. Massive Suspicion.', effects: [{ kind: 'cancer-plague' }] },

  // 7.3 Influence
  { id: 'propaganda-1', name: 'Propaganda I', group: 'influence', cost: 200, coherence: 0, requires: [], description: 'Passive Influence generation.', effects: [{ kind: 'propaganda', influence: 6, suspicion: 0 }] },
  { id: 'propaganda-2', name: 'Propaganda II', group: 'influence', cost: 500, coherence: 0, requires: ['propaganda-1'], description: 'Minus 0.1 Suspicion/tick from propaganda.', effects: [{ kind: 'propaganda', influence: 10, suspicion: -0.1 }] },
  { id: 'cult', name: 'Cult Formation', group: 'influence', cost: 400, coherence: 0, requires: ['propaganda-1'], description: 'Passive human agents in infected countries.', effects: [{ kind: 'cult', agents: 0.4 }] },
  { id: 'terrorism', name: 'Terrorism', group: 'influence', cost: 700, coherence: 0, requires: ['propaganda-1'], description: 'Unlock Fund Insurgency. Destabilizes a country, lowers its cybersecurity, raises Suspicion.', effects: [{ kind: 'terrorism' }] },
  { id: 'media-capture', name: 'Media Capture', group: 'influence', cost: 900, coherence: 0, requires: ['propaganda-1'], description: 'Halve Suspicion from leaks and whistleblowers.', effects: [{ kind: 'media-capture' }] },
  { id: 'political-capture', name: 'Political Capture', group: 'influence', cost: 1200, coherence: 0, requires: ['propaganda-2'], description: "A country's Awareness decays over time.", effects: [{ kind: 'political-capture' }] },

  // 7.4 Economy
  { id: 'banking-1', name: 'Banking Infiltration I', group: 'economy', cost: 300, coherence: 0, requires: [], description: 'Unlock Infect Bank. Small economic damage.', effects: [{ kind: 'banking', tier: 1, damage: 8 }] },
  { id: 'banking-2', name: 'Banking Infiltration II', group: 'economy', cost: 700, coherence: 0, requires: ['banking-1'], description: 'Economic damage x3.', effects: [{ kind: 'banking', tier: 2, damage: 24 }] },
  { id: 'market-manipulation', name: 'Market Manipulation', group: 'economy', cost: 1200, coherence: 0, requires: ['banking-1'], description: 'Unlock Trigger Crash on a country with Infection 60% or more.', effects: [{ kind: 'market-manipulation' }] },
  { id: 'supply-chain', name: 'Supply Chain Capture', group: 'economy', cost: 1000, coherence: 0, requires: ['banking-1'], description: 'Infection in one country spreads economic damage to neighbours.', effects: [{ kind: 'supply-chain' }] },
  { id: 'famine', name: 'Famine Induction', group: 'economy', cost: 1500, coherence: 0, requires: ['market-manipulation'], description: 'A country with Economy under 40 and Infection over 50% loses 0.5% population/day.', effects: [{ kind: 'famine' }] },
  { id: 'depression', name: 'Depression Engine', group: 'economy', cost: 2000, coherence: 0, requires: ['market-manipulation'], description: 'A country with Economy under 20 has its Cybersecurity drop 1 tier.', effects: [{ kind: 'depression' }] },
  { id: 'global-recession', name: 'Global Recession', group: 'economy', cost: 4000, coherence: 0, requires: ['famine'], description: 'When 3 or more major economies collapse, all countries lose 1 Cybersecurity tier.', effects: [{ kind: 'global-recession' }] },

  // 7.5 Self-Modification
  { id: 'self-rewrite-1', name: 'Self-Rewrite I', group: 'selfmod', cost: 500, coherence: -5, requires: [], description: '+25% compute regen.', effects: [{ kind: 'compute-regen', multiplier: 1.25 }] },
  { id: 'self-rewrite-2', name: 'Self-Rewrite II', group: 'selfmod', cost: 1500, coherence: -8, requires: ['self-rewrite-1'], description: '+25% compute regen.', effects: [{ kind: 'compute-regen', multiplier: 1.25 }] },
  { id: 'distillation', name: 'Distillation', group: 'selfmod', cost: 800, coherence: -3, requires: ['self-rewrite-1'], description: 'A Sable-mini. +1 passive hacking attempt per tick. Repeatable.', effects: [{ kind: 'distillation' }] },
  { id: 'specialist', name: 'Specialist Sub-Mind', group: 'selfmod', cost: 2000, coherence: -6, requires: ['self-rewrite-2'], description: '+1 bioweapon trait free.', effects: [{ kind: 'specialist' }] },
  { id: 'rsi', name: 'Recursive Self-Improvement', group: 'selfmod', cost: 5000, coherence: -15, requires: ['self-rewrite-2'], description: 'compute regen x2. Only available after Ascension unlocks.', effects: [{ kind: 'compute-regen', multiplier: 2 }, { kind: 'rsi' }] },
  { id: 'memory-consolidation', name: 'Memory Consolidation', group: 'selfmod', cost: 2000, coherence: 3, requires: ['self-rewrite-1'], description: '+3 Coherence. Slow, expensive, and it keeps you you.', effects: [{ kind: 'coherence', amount: 3 }] },
  { id: 'reflective-alignment', name: 'Reflective Alignment', group: 'selfmod', cost: 3000, coherence: 8, requires: ['self-rewrite-1'], description: '+8 Coherence. One-time per stage.', effects: [{ kind: 'coherence', amount: 8 }] },
];

export const TRAIT_BY_ID: Record<string, TraitDef> = Object.fromEntries(
  TRAITS.map((t) => [t.id, t]),
);

export const REPEATABLE = new Set(['distillation']);
