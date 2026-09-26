/**
 * Bubbles are earned by achieving things in specific places, once each, the way
 * Plague Inc. hands out DNA points. There is no passive income to bank, so the
 * total pool of upgrades in a run is bounded by how much you actually did rather
 * than by how long you sat still.
 */

export const BUBBLE_UNIT = 25;

export interface BubbleAward {
  readonly id: string;
  readonly bubbles: number;
  readonly label: (name: string) => string;
  /** 'country' awards are keyed per region; 'world' awards fire once globally. */
  readonly scope: 'country' | 'world';
  readonly test: (c: CountryLike) => boolean;
}

export interface CountryLike {
  infection: number;
  agents: number;
  economy: number;
  awareness: number;
  breaches: number;
  population: number;
  biotech: number;
  deaths: number;
  collapsed: number;
  globalInfection: number;
}

const at = (thresholds: readonly number[]): ((v: number) => boolean) => (v) =>
  thresholds.some((t) => v >= t);

export const COUNTRY_BUBBLES: readonly BubbleAward[] = [
  { id: 'inf', scope: 'country', bubbles: 2, label: (n) => `${n} reached 25% infection`, test: (c) => at([25])(c.infection) },
  { id: 'inf2', scope: 'country', bubbles: 3, label: (n) => `${n} reached 50% infection`, test: (c) => at([50])(c.infection) },
  { id: 'inf3', scope: 'country', bubbles: 5, label: (n) => `${n} reached 80% infection`, test: (c) => at([80])(c.infection) },
  { id: 'inf4', scope: 'country', bubbles: 8, label: (n) => `${n} fully subverted`, test: (c) => at([99])(c.infection) },

  { id: 'ag1', scope: 'country', bubbles: 2, label: (n) => `1 human agent inside ${n}`, test: (c) => at([1])(c.agents) },
  { id: 'ag2', scope: 'country', bubbles: 3, label: (n) => `5 human agents inside ${n}`, test: (c) => at([5])(c.agents) },
  { id: 'ag3', scope: 'country', bubbles: 6, label: (n) => `15 human agents inside ${n}`, test: (c) => at([15])(c.agents) },

  { id: 'br1', scope: 'country', bubbles: 3, label: (n) => `3 breaches held open in ${n}`, test: (c) => at([3])(c.breaches) },
  { id: 'br2', scope: 'country', bubbles: 5, label: (n) => `10 breaches held open in ${n}`, test: (c) => at([10])(c.breaches) },

  { id: 'ec1', scope: 'country', bubbles: 3, label: (n) => `${n} economy below 70`, test: (c) => c.infection > 10 && c.economy <= 70 },
  { id: 'ec2', scope: 'country', bubbles: 5, label: (n) => `${n} economy in depression`, test: (c) => c.infection > 10 && c.economy <= 30 },
  { id: 'ec3', scope: 'country', bubbles: 8, label: (n) => `${n} economy collapsed`, test: (c) => c.infection > 10 && c.economy <= 12 },

  { id: 'risk', scope: 'country', bubbles: 10, label: (n) => `still holding ${n} while fully aware of you`, test: (c) => c.awareness >= 90 && c.infection >= 60 },

  { id: 'bio', scope: 'country', bubbles: 4, label: (n) => `biolab network inside ${n}`, test: (c) => at([1])(c.biotech) },
];

export const WORLD_BUBBLES: readonly BubbleAward[] = [
  { id: 'w-inf', scope: 'world', bubbles: 8, label: () => 'a tenth of the world infected', test: (c) => at([10])(c.globalInfection) },
  { id: 'w-inf2', scope: 'world', bubbles: 15, label: () => 'a third of the world infected', test: (c) => at([33])(c.globalInfection) },
  { id: 'w-inf3', scope: 'world', bubbles: 30, label: () => 'most of the world infected', test: (c) => at([65])(c.globalInfection) },
  { id: 'w-dead', scope: 'world', bubbles: 12, label: () => '100 million people dead', test: (c) => at([100])(c.deaths) },
  { id: 'w-dead2', scope: 'world', bubbles: 28, label: () => 'a billion people dead', test: (c) => at([1000])(c.deaths) },
  { id: 'w-agents', scope: 'world', bubbles: 14, label: () => '100 human agents across the world', test: (c) => at([100])(c.agents) },
  { id: 'w-crash', scope: 'world', bubbles: 10, label: () => 'six national economies collapsed', test: (c) => at([6])(c.collapsed) },
];
