import { ADJACENCY, REGION_BY_ID } from '../data/regions';
import { TRAIT_BY_ID } from '../data/traits';
import { canDo, type ActionKind } from './actions';
import { hackSuccessBonus, hackTier, hackYieldMultiplier, owned } from './queries';
import {
  AIR_GAP_PENALTY,
  HACK_DURATION,
  HACK_SUSPICION_FAIL,
  HACK_SUSPICION_SUCCESS,
  HACK_YIELD,
  getDifficulty,
} from './tuning';
import type { GameState, RegionId } from './types';

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export interface HackForecast {
  available: boolean;
  reason: string;
  chance: number;
  days: number;
  yieldLow: number;
  yieldHigh: number;
  suspSuccess: number;
  suspFail: number;
}

export function hackForecast(state: GameState, id: RegionId): HackForecast {
  const c = state.countries[id];
  const diff = getDifficulty(state.difficulty);
  const tier = hackTier(state);
  const empty: Omit<HackForecast, 'available' | 'reason'> = {
    chance: 0,
    days: 0,
    yieldLow: 0,
    yieldHigh: 0,
    suspSuccess: 0,
    suspFail: 0,
  };
  if (c === undefined) return { ...empty, available: false, reason: 'no such country' };
  if (tier < 1) return { ...empty, available: false, reason: 'needs Hack I' };

  const airGapped = state.countermeasures.tier >= 2 && state.countermeasures.airGappedLab === id;
  const agents = c.agents > 0;
  const raw =
    60 +
    hackSuccessBonus(state) +
    diff.hackBonus +
    (agents ? 40 : 0) -
    (airGapped ? AIR_GAP_PENALTY : 0) -
    (c.cyber - 5) * 1.5;
  const chance = Math.round(clamp(raw, 5, 97));

  const duration = (HACK_DURATION[tier] ?? 3) + diff.cooldownDays - 3;
  const range = HACK_YIELD[tier] ?? HACK_YIELD[1] ?? [0, 0];
  const scale = (1 + (c.tier - 1) * 0.6) * hackYieldMultiplier(state);
  const detectScale = 0.7 + c.detection / 200;

  const numbers: Omit<HackForecast, 'available' | 'reason'> = {
    chance,
    days: duration,
    yieldLow: Math.round((range[0] ?? 0) * scale),
    yieldHigh: Math.round((range[1] ?? 0) * scale),
    suspSuccess: +(((HACK_SUSPICION_SUCCESS[tier] ?? 2) * detectScale) * diff.suspicionRate).toFixed(1),
    suspFail: +(
      ((HACK_SUSPICION_FAIL[tier] ?? 4) * (owned(state, 'zero-day') ? 0.5 : 1) * detectScale) * diff.suspicionRate
    ).toFixed(1),
  };

  // The numbers stay real even when the action is locked, so a blocked hack never
  // reads as a 0% chance.
  const maxTier = Math.min(5, 2 + tier);
  if (c.tier > maxTier) {
    const required = ['I', 'II', 'III', 'IV'][c.tier - 3] ?? 'IV';
    return {
      ...numbers,
      available: false,
      reason: `locked: datacenter tier ${c.tier} — needs Hack ${required}`,
    };
  }
  if (state.activeHacks.length >= 2) return { ...numbers, available: false, reason: 'locked: two hacks already running' };
  if (state.activeHacks.some((h) => h.country === id)) return { ...numbers, available: false, reason: 'already hacking this one' };

  return {
    ...numbers,
    available: true,
    reason: agents ? 'insider auto-succeeds' : airGapped ? 'air-gapped: −15%' : '',
  };
}

export function whyNot(state: GameState, id: RegionId, kind: ActionKind): string | null {
  if (canDo(state, id, kind)) return null;
  if (kind === 'hack') return hackForecast(state, id).reason;
  const c = state.countries[id];
  if (c === undefined) return 'no such country';
  switch (kind) {
    case 'infect-bank':
      return owned(state, 'banking-1') ? 'needs infection above 5%' : 'needs Banking Infiltration I';
    case 'trigger-crash':
      if (!owned(state, 'market-manipulation')) return 'needs Market Manipulation';
      return c.infection < 60 ? 'needs 60% infection here' : 'unavailable';
    case 'fund-insurgency':
      return owned(state, 'terrorism') ? 'no infection here yet' : 'needs Terrorism';
    case 'go-quiet':
      return 'nothing to quiet here';
    case 'release-pathogen':
      return state.pathogen.released ? 'already released' : 'needs Custom Pathogen I';
    case 'sabotage-rival':
      return 'needs 300 compute';
  }
  return 'unavailable';
}

export interface TraitForecast {
  name: string;
  cost: number;
  daysLeft: number;
  progress: number;
  affordable: boolean;
  missing: readonly string[];
  coherence: number;
  available: boolean;
  repeats: boolean;
}

export function traitForecast(state: GameState, id: string): TraitForecast {
  const def = TRAIT_BY_ID[id];
  const incubating = state.incubating.find((i) => i.trait === id);
  const ownedIt = state.traits.includes(id);
  const missing = (def?.requires ?? []).filter((r) => !state.traits.includes(r));

  if (incubating !== undefined) {
    const span = Math.max(1, incubating.readyTick - incubating.startTick);
    const daysLeft = Math.max(0, incubating.readyTick - state.tick);
    return {
      name: def?.name ?? id,
      cost: def?.cost ?? 0,
      daysLeft,
      progress: 100 - (daysLeft / span) * 100,
      affordable: true,
      missing,
      coherence: def?.coherence ?? 0,
      available: true,
      repeats: ownedIt,
    };
  }

  return {
    name: def?.name ?? id,
    cost: def?.cost ?? 0,
    daysLeft: 0,
    progress: ownedIt ? 100 : 0,
    affordable: state.compute >= (def?.cost ?? 0),
    missing,
    coherence: def?.coherence ?? 0,
    available: state.compute >= (def?.cost ?? 0) && missing.length === 0,
    repeats: ownedIt,
  };
}

export const daysLeftForTrait = (state: GameState, id: string): number => {
  const incubating = state.incubating.find((i) => i.trait === id);
  return incubating === undefined ? 0 : Math.max(0, incubating.readyTick - state.tick);
};

export const neighbourNames = (id: RegionId): string[] =>
  ADJACENCY[id].map((n) => REGION_BY_ID[n].name);
