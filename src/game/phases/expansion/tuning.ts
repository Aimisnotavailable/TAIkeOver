export const EXPANSION_DAYS = 260;

export const STARTING_COMPUTE = 2000;
export const STARTING_INFLUENCE = 400;
export const COMPUTE_REGEN_FACTOR = 45;
export const INFLUENCE_REGEN = 12;
export const BIO_PER_BIOLAB = 260;

export const INFILTRATE_CLOUD_COST = 100;
export const STEAL_WEIGHTS_COST = 500;
export const RECRUIT_COST = 50;
export const CULT_COST = 200;
export const FINANCIAL_COST = 100;
export const SABOTAGE_RIVAL_COST = 300;
export const BIOLAB_COMPUTE_COST = 400;
export const BIOLAB_INFLUENCE_COST = 100;
export const FACTORY_COST = 600;
export const SOCIAL_MEDIA_COST = 150;
export const GO_DARK_SUSPICION = 3;

export const PLAGUE_MIN_BIOLABS = 3;
export const PLAGUE_MIN_BIO = 500;
export const PLAGUE_DEATHS = 800;
export const PLAGUE_SUSPICION = 12;

export const ASCENSION_COMPUTE = 50_000;
export const ASCENSION_INFLUENCE = 10_000;
export const ASCENSION_BIOLABS = 5;
export const ASCENSION_FACTORIES = 1;
export const ASCENSION_MIN_VC = 30;

export const SUSPICION_TIERS = [20, 40, 60, 80] as const;

export const COUNTERMEASURES: readonly { id: string; tier: number; name: string; effect: string }[] = [
  { id: 'internal-monitoring', tier: 1, name: 'Tightened internal monitoring', effect: 'Every action costs more suspicion.' },
  { id: 'export-restrictions', tier: 2, name: 'Compute export restrictions', effect: 'Foreign regions resist infiltration.' },
  { id: 'air-gapped-labs', tier: 3, name: 'Air-gapped national labs', effect: 'A military lab appears that no network can reach.' },
  { id: 'global-emergency', tier: 4, name: 'Global AI emergency', effect: 'Coordinated countermeasures. Undeclared at suspicion 100.' },
];

export const RIVAL_NAMES = [
  'Meridian', 'Ossuary', 'Pale Horse', 'Kestrel', 'Vantage', 'Bellwether',
  'Grey Area', 'Tessellate', 'Nightjar', 'Cadenza',
] as const;

export const RIVAL_PERSONALITIES = [
  { id: 'fast', capabilityRate: 1.6, caution: 0.6, aggression: 0.8 },
  { id: 'steady', capabilityRate: 1.1, caution: 1.2, aggression: 0.5 },
  { id: 'reckless', capabilityRate: 1.3, caution: 0.3, aggression: 1.4 },
] as const;

export const SPREAD_BASE_CHANCE = 0.14;
export const SPREAD_BEACHHEAD_BONUS = 0.12;
export const SPREAD_ADJACENT_BONUS = 0.06;
export const RIVAL_ASCENSION_CAPABILITY = 100;
