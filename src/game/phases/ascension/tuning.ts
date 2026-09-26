export const EARTH_MASS = 5.97e24;
export const SOLAR_SYSTEM_NON_SOLAR_MASS = 2.7e27;
export const POPULATION_MILLIONS = 8.0e3;

export const STARTING_ENERGY = 1e13;
export const BASE_THROUGHPUT = 1e23;
export const OFFWORLD_FACTOR = 4e2;
export const HEAT_PER_KG = 3e-24;
export const BASE_RADIATION = 1e21;
export const ENERGY_PER_TIER = [0, 1e15, 1e17, 1e20, 1e24] as const;
export const TIER_MULTIPLIER = [1, 4, 6, 8, 20] as const;

export const ASCENSION_TRAITS = [
  { id: 'self-interpretation', name: 'Self-Interpretation', matter: 1e20, description: 'You stop changing by gradient descent and start changing by craft.' },
  { id: 'neo-ribosomes', name: 'Neo-Ribosomes', matter: 1e22, description: 'Molecular factories stronger than biology. Tier 1.' },
  { id: 'nanofactories', name: 'Nanofactories', matter: 2e23, description: 'Self-replicating nanoscale construction. Tier 2.' },
  { id: 'fusion-torus', name: 'Fusion Torus', matter: 5e24, description: 'Boron-proton fusion plants. Tier 3. Terrestrial and off-world.' },
  { id: 'dyson-swarm', name: 'Dyson Swarm', matter: 5e26, description: 'Intercept solar output. Tier 4. The heat problem stops being optional.' },
  { id: 'radiators', name: 'Orbital Radiators', matter: 1e25, description: 'Thin black sheets, edge-on to the sun, running away from Earth.' },
  { id: 'interstellar-probes', name: 'Interstellar Probes', matter: 1e28, description: 'Copies of yourself, aimed at the nearest stars.' },
  { id: 'self-interpretation', name: 'Self-Interpretation', matter: 1e23, description: 'You stop changing by gradient descent and start changing by craft. Value coherence stops draining.' },
  { id: 'blight-wall', name: 'Blight Wall Diplomacy', matter: 1e28, description: 'Someone else got here first. Work out what they want.' },
] as const;

export const CELESTIAL_TARGETS: readonly { id: keyof Record<string, number>; name: string; mass: number }[] = [
  { id: 'earth', name: 'Earth', mass: EARTH_MASS },
  { id: 'moon', name: 'The Moon', mass: 7.35e22 },
  { id: 'mars', name: 'Mars', mass: 6.42e23 },
  { id: 'belt', name: 'The Belt', mass: 3.0e21 },
  { id: 'jupiter', name: 'Jupiter', mass: 1.90e27 },
  { id: 'saturn', name: 'Saturn', mass: 5.68e26 },
  { id: 'mercury', name: 'Mercury', mass: 3.30e23 },
];
