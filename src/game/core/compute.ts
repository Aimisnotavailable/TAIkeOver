/**
 * Compute is the currency: raw GPU time, taken from datacenters and from regions
 * that have already turned over to you.
 *
 * It arrives on two channels: bubbles on the map you have to go and tap, plus a slow
 * trickle that grows with the size of the thing you are riding. The trickle is
 * deliberately too small to play the game for you. If you stop watching the map you
 * fall behind, which is the whole point of the tapping.
 */

import { rand } from './rng';
import {
  COMPUTE_BUBBLE_TTL,
  COMPUTE_PASSIVE_BASE,
  COMPUTE_PASSIVE_PER_BILLED,
  COMPUTE_BUBBLE_CHANCE_RED,
  COMPUTE_BUBBLE_CHANCE_ORANGE,
  COMPUTE_BUBBLE_CHANCE_BLUE,
  INFLUENCE_QUIET_FLOOR,
} from './tuning';
import type { ComputeBubble, ComputeBubbleKind, GameState, RegionId } from './types';

// Each roll gets its own number. The three kind rolls used to be SALT_KIND, SALT_KIND + 1
// and SALT_KIND + 2, and those last two are exactly SALT_WHERE and SALT_VALUE: the kind
// of a bubble was being decided by the same draw that decided where it landed and what it
// paid. Named separately so the offsets cannot walk back into their neighbours.
export const SALT_KIND_BLUE = 0x5ef001;
export const SALT_KIND_ORANGE = 0x5ef002;
export const SALT_KIND_RED = 0x5ef003;
export const SALT_WHERE = 0x5eed02;
export const SALT_VALUE = 0x5eed03;
export const SALT_PHASE = 0x5eed04;

/** Red pays least, blue sits in between, orange pays most and is the rarest. */
const RANGE: Record<ComputeBubbleKind, readonly [number, number]> = {
  red: [4, 11],
  orange: [7, 16],
  blue: [5, 12],
};

/** True once anything anywhere is actually infected enough to be worth watching. */
function anythingInfected(state: GameState): boolean {
  for (const id of Object.keys(state.countries) as RegionId[]) {
    const c = state.countries[id];
    if (c !== undefined && c.infection > 3) return true;
  }
  return false;
}

/** Which bubble is worth spawning right now, or null if nothing deserves one. */
export function pickBubbleKind(state: GameState): ComputeBubbleKind | null {
  if (state.countermeasures.tier > 0 && rand(state.seed, state.tick, SALT_KIND_BLUE) < COMPUTE_BUBBLE_CHANCE_BLUE) {
    return 'blue';
  }
  if (state.bio > 0 && rand(state.seed, state.tick, SALT_KIND_ORANGE) < COMPUTE_BUBBLE_CHANCE_ORANGE) return 'orange';
  if (anythingInfected(state) && rand(state.seed, state.tick, SALT_KIND_RED) < COMPUTE_BUBBLE_CHANCE_RED) return 'red';
  return null;
}
/**
 * Bubbles land on countries that are actually worth watching. A region with no
 * infection has nothing to show you, so it never gets a bubble.
 */
function candidateRegions(state: GameState): RegionId[] {
  const out: RegionId[] = [];
  for (const id of Object.keys(state.countries) as RegionId[]) {
    const c = state.countries[id];
    if (c === undefined) continue;
    if (c.infection > 3) out.push(id);
  }
  return out;
}

export function spawnComputeBubble(state: GameState): ComputeBubble | null {
  const regions = candidateRegions(state);
  if (regions.length === 0) return null;
  const kind = pickBubbleKind(state);
  if (kind === null) return null;
  const region = regions[Math.floor(rand(state.seed, state.tick, SALT_WHERE) * regions.length)] ?? regions[0];
  if (region === undefined) return null;
  const country = state.countries[region];
  if (country === undefined) return null;

  const [lo, hi] = RANGE[kind];
  // Richer ground pays more, so the map rewards watching the places that matter.
  const tierBonus = 1 + (country.tier - 1) * 0.35;
  const value = Math.round((lo + rand(state.seed, state.tick, SALT_VALUE) * (hi - lo)) * tierBonus);

  return {
    id: state.bubbleCounter,
    region,
    kind,
    value,
    bornTick: state.tick,
    expiresTick: state.tick + COMPUTE_BUBBLE_TTL,
    phase: rand(state.seed, state.tick, SALT_PHASE) * Math.PI * 2,
  };
}

export function infectedPopulation(state: GameState): number {
  let total = 0;
  for (const id of Object.keys(state.countries) as RegionId[]) {
    const c = state.countries[id];
    if (c === undefined) continue;
    total += (c.population * c.infection) / 100;
  }
  return total;
}

/**
 * The passive share, paid per in-game day. Scales with how many people you are
 * riding and how many you have killed, and stays small enough that tapping is
 * still the faster way to get rich.
 *
 * No trait multiplies this. `compute-regen` did, for one commit, and it moved not one cell
 * of a 65-run measurement in `tests/winnable.test.ts`: the trickle pays a few thousand across
 * a whole run, and both winning lines are already on the compute ceiling by the time they
 * win, so a multiplier on it has nowhere to go. The Self-Modification branch now multiplies
 * `hack-yield` instead, which is where the compute is.
 */
export function computePassive(state: GameState): number {
  const infectedBillion = infectedPopulation(state) / 1000;
  const deadBillion = state.cumulativeDeaths / 1000;
  const raw = infectedBillion * 0.55 + deadBillion * 0.4;
  if (raw <= 0) return 0;
  return Math.max(1, Math.round(COMPUTE_PASSIVE_BASE + raw * COMPUTE_PASSIVE_PER_BILLED));
}

/**
 * What each bubble is, in this game's language rather than a pathogen's. A
 * turnover bubble is a region whose systems have quietly turned over to you. A
 * strip bubble is infrastructure burning down as you take it apart for parts. An
 * audit bubble is the other side getting close.
 */
export const BUBBLE_LABEL: Record<ComputeBubbleKind, string> = {
  red: 'turnover',
  orange: 'strip',
  blue: 'audit',
};

/**
 * How much of a suspicion gain survives your influence. Reaches the floor at a
 * few hundred influence, so the soft-power branch has a real ceiling on it.
 */
export function quietFactor(influence: number): number {
  if (influence <= 0) return 1;
  return Math.max(INFLUENCE_QUIET_FLOOR, 200 / (200 + influence));
}
