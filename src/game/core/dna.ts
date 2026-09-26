/**
 * DNA is the currency, and it comes from two places, both lifted from how Plague
 * Inc. actually paces a run: bubbles that appear on the map and have to be tapped,
 * and a slow passive trickle that grows with how much of humanity you are riding.
 *
 * The passive share is deliberately too small to play the game for you. If you stop
 * watching the map you fall behind, which is the whole point of the tapping.
 */

import { rand } from './rng';
import {
  DNA_BUBBLE_TTL,
  DNA_PASSIVE_BASE,
  DNA_PASSIVE_PER_BILLED,
  DNA_BUBBLE_CHANCE_RED,
  DNA_BUBBLE_CHANCE_ORANGE,
  DNA_BUBBLE_CHANCE_BLUE,
} from './tuning';
import type { DnaBubble, DnaBubbleKind, GameState, RegionId } from './types';

const SALT_KIND = 0x5eed01;
const SALT_WHERE = 0x5eed02;
const SALT_VALUE = 0x5eed03;
const SALT_PHASE = 0x5eed04;

const RANGE: Record<DnaBubbleKind, readonly [number, number]> = {
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
export function pickBubbleKind(state: GameState): DnaBubbleKind | null {
  if (state.countermeasures.tier > 0 && rand(state.seed, state.tick, SALT_KIND) < DNA_BUBBLE_CHANCE_BLUE) {
    return 'blue';
  }
  if (state.bio > 0 && rand(state.seed, state.tick, SALT_KIND + 1) < DNA_BUBBLE_CHANCE_ORANGE) return 'orange';
  if (anythingInfected(state) && rand(state.seed, state.tick, SALT_KIND + 2) < DNA_BUBBLE_CHANCE_RED) return 'red';
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

export function spawnDnaBubble(state: GameState): DnaBubble | null {
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
    expiresTick: state.tick + DNA_BUBBLE_TTL,
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
 */
export function dnaPassive(state: GameState): number {
  const infectedBillion = infectedPopulation(state) / 1000;
  const deadBillion = state.cumulativeDeaths / 1000;
  const raw = infectedBillion * 0.55 + deadBillion * 0.4;
  if (raw <= 0) return 0;
  return Math.max(1, Math.round(DNA_PASSIVE_BASE + raw * DNA_PASSIVE_PER_BILLED));
}

export const BUBBLE_LABEL: Record<DnaBubbleKind, string> = {
  red: 'biohazard',
  orange: 'severity',
  blue: 'cure',
};
