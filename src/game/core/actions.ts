import type { RegionId } from '../data/regions';
import { chance, rand } from './rng';
import {
  AIR_GAP_PENALTY,
  BANK_DAMAGE_AWARENESS,
  COUNTER_HACK_INTERVAL,
  COUNTER_HACK_DRAIN,
  CRASH_AWARENESS,
  CRASH_DAMAGE,
  DEPTH_YIELD_STEP,
  HACK_CYCLE_DAYS,
  HACK_DURATION,
  HACK_FAIL_COST,
  HACK_SUSPICION_FAIL,
  HACK_SUSPICION_SUCCESS,
  HACK_YIELD,
  INSURGENCY_CYBER,
  INSURGENCY_SUSPICION,
  COLLAPSED_THRESHOLD,
  MAX_DEPTH,
  HARDEN_PENALTY,
  getDifficulty,
} from './tuning';
import {
  effectsOf,
  hackSuccessBonus,
  hackTier,
  hackYieldMultiplier,
  maxConcurrentHacks,
  owned,
} from './queries';
import type { GameState, HackProgress, LogEntry } from './types';

export type ActionKind =
  | 'hack'
  | 'infect-bank'
  | 'trigger-crash'
  | 'fund-insurgency'
  | 'go-quiet'
  | 'release-pathogen'
  | 'sabotage-rival'
  | 'cease-hack';

export interface ActionDef {
  kind: ActionKind;
  label: string;
  hint: string;
  needsRival: boolean;
}

export const ACTIONS: readonly ActionDef[] = [
  { kind: 'hack', label: 'Hack Datacenter', hint: 'runs continuously; deeper breaches pay more', needsRival: false },
  { kind: 'infect-bank', label: 'Infect Bank', hint: 'economic damage, raises awareness', needsRival: false },
  { kind: 'trigger-crash', label: 'Trigger Crash', hint: 'needs 60% infection; large economic damage', needsRival: false },
  { kind: 'fund-insurgency', label: 'Fund Insurgency', hint: 'lowers cybersecurity, raises global suspicion', needsRival: false },
  { kind: 'go-quiet', label: 'Go Quiet', hint: 'halts spread here, lowers awareness', needsRival: false },
  { kind: 'cease-hack', label: 'Cease Hacking', hint: 'stop the running operation here', needsRival: false },
  { kind: 'release-pathogen', label: 'Release Pathogen', hint: 'global. kills people who would organize against you', needsRival: false },
  { kind: 'sabotage-rival', label: 'Sabotage Rival', hint: 'spend compute to set them back', needsRival: true },
];

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export function canDo(state: GameState, id: RegionId, kind: ActionKind): boolean {
  if (state.outcome !== 'playing' || state.stage === 'coldopen') return false;
  const country = state.countries[id];
  if (country === undefined) return false;

  switch (kind) {
    case 'hack':
      if (hackTier(state) < 1) return false;
      if (state.activeHacks.some((h) => h.country === id)) return false;
      return country.tier <= Math.min(5, 2 + hackTier(state)) && state.activeHacks.length < maxConcurrentHacks(state);
    case 'cease-hack':
      return state.activeHacks.some((h) => h.country === id);
    case 'infect-bank':
      if (!owned(state, 'banking-1')) return false;
      if (country.economy <= COLLAPSED_THRESHOLD) return false;
      return country.infection > 5;
    case 'trigger-crash':
      if (!owned(state, 'market-manipulation')) return false;
      if (country.economy <= COLLAPSED_THRESHOLD) return false;
      return country.infection >= 60;
    case 'fund-insurgency':
      // One war per country. Re-funding an existing one is not a decision, it is a
      // button you can hold down.
      return owned(state, 'terrorism') && country.infection > 0 && !country.atWar;
    case 'go-quiet':
      // A toggle, not a one-way door. Going quiet and going loud are both choices.
      return country.infection > 0;
    case 'release-pathogen':
      return !state.pathogen.released && owned(state, 'pathogen-1');
    case 'sabotage-rival':
      return state.compute >= 300;
  }
}

export function doAction(state: GameState, id: RegionId, kind: ActionKind): GameState {
  if (!canDo(state, id, kind)) return state;
  const country = state.countries[id];
  if (country === undefined) return state;
  const diff = getDifficulty(state.difficulty);
  const countries = { ...state.countries };
  let next: GameState = { ...state, countries };
  const lines: LogEntry[] = [];

  switch (kind) {
    case 'hack': {
      const tier = hackTier(state);
      const duration = (HACK_DURATION[tier] ?? 3) + diff.cooldownDays - 3;
      const hack: HackProgress = {
        key: next.hackCounter,
        country: id,
        startTick: next.tick,
        resolveTick: next.tick + duration,
        duration,
        tier,
        auto: country.agents > 0,
        depth: 0,
        wins: 0,
        losses: 0,
      };
      next = { ...next, activeHacks: [...next.activeHacks, hack], hackCounter: next.hackCounter + 1 };
      lines.push({
        day: next.tick, kind: 'hack', text: `breach opened on ${id}, first result in ${duration}d`,
        suspicionDelta: null, computeDelta: null, flagged: false,
      });
      break;
    }
    case 'cease-hack': {
      const target = next.activeHacks.find((h) => h.country === id);
      next = { ...next, activeHacks: next.activeHacks.filter((h) => h.country !== id) };
      lines.push({
        day: next.tick, kind: 'system',
        text: `ceased operations in ${id}${target ? ` after ${target.wins} breaches` : ''}`,
        suspicionDelta: null, computeDelta: null, flagged: false,
      });
      break;
    }
    case 'infect-bank': {
      const damage = effectsOf(next, 'banking').reduce((a, e) => a + ('damage' in e ? e.damage : 0), 0);
      countries[id] = {
        ...country,
        economy: clamp(country.economy - damage, 0, 100),
        awareness: clamp(country.awareness + BANK_DAMAGE_AWARENESS, 0, 100),
      };
      lines.push({ day: next.tick, kind: 'economy', text: `banking system in ${id} compromised, -${damage} economy`, suspicionDelta: null, computeDelta: null, flagged: false });
      break;
    }
    case 'trigger-crash': {
      countries[id] = {
        ...country,
        economy: clamp(country.economy - CRASH_DAMAGE, 0, 100),
        awareness: clamp(country.awareness + CRASH_AWARENESS, 0, 100),
      };
      lines.push({ day: next.tick, kind: 'economy', text: `markets in ${id} collapse`, suspicionDelta: null, computeDelta: null, flagged: false });
      break;
    }
    case 'fund-insurgency': {
      countries[id] = {
        ...country,
        cyber: clamp(country.cyber - INSURGENCY_CYBER, 1, 10),
        awareness: clamp(country.awareness + 2, 0, 100),
        atWar: true,
        warSeverity: 1,
      };
      next = { ...next, suspicion: clamp(next.suspicion + INSURGENCY_SUSPICION * diff.suspicionRate, 0, 100) };
      lines.push({ day: next.tick, kind: 'event', text: `armed conflict begins in ${id}`, suspicionDelta: INSURGENCY_SUSPICION, computeDelta: null, flagged: true });
      break;
    }
    case 'go-quiet': {
      // A toggle. Going quiet stops the spread and makes them forget; going loud
      // starts it again. One-way would have been a trap dressed as a button.
      const loud = country.quiet;
      countries[id] = { ...country, quiet: !loud, awareness: clamp(country.awareness + (loud ? 6 : -18), 0, 100) };
      next = { ...next, suspicion: clamp(next.suspicion + (loud ? 1 : -2) * diff.suspicionRate, 0, 100) };
      lines.push({
        day: next.tick,
        kind: 'system',
        text: loud ? 'going loud in ' + id : 'going quiet in ' + id,
        suspicionDelta: loud ? 1 : -2,
        computeDelta: null,
        flagged: false,
      });
      break;
    }
    case 'release-pathogen': {
      const path = effectsOf(next, 'pathogen');
      const cancer = owned(next, 'cancer-plague');
      const kills = cancer ? 0.1 : path.reduce((a, e) => a + ('kills' in e ? Math.max(e.kills, 0) : 0), 0);
      const susp = path.reduce((a, e) => a + ('suspicion' in e ? e.suspicion : 0), 0) + (cancer ? 30 : 0);
      next = {
        ...next,
        pathogen: {
          released: true, killsPerDay: kills, suspicionPerDay: susp,
          sterility: owned(next, 'sterility'), targeted: false, cancer,
        },
        suspicion: clamp(next.suspicion + susp * 2 * diff.suspicionRate, 0, 100),
      };
      lines.push({ day: next.tick, kind: 'bio', text: 'the pathogen is in the water supply', suspicionDelta: susp, computeDelta: null, flagged: true });
      break;
    }
    case 'sabotage-rival': {
      const rivals = next.rivals.map((r) =>
        r.id === id ? { ...r, capability: Math.max(0, r.capability - 16), sabotage: r.sabotage + 1 } : r,
      );
      next = { ...next, rivals, compute: next.compute - 300 };
      lines.push({ day: next.tick, kind: 'rival', text: `sabotaged ${id}`, suspicionDelta: 3, computeDelta: -300, flagged: false });
      break;
    }
  }

  next.countries = countries;
  return { ...next, log: [...next.log, ...lines].slice(-300) };
}

/**
 * Salts for the two independent draws a hack resolves on: whether it got in, and how
 * much it paid. These used to be `key * 31 + depth` and `key * 17 + depth`, which are
 * the same number for every depth once `key` is 0 — so the first hack of every run
 * decided both from one roll, at all nine depths. Purpose is a bit in the encoding now
 * rather than a multiplier, which makes a collision between the two families
 * unrepresentable for any key at all.
 */
const HACK_SALT_BASE = 0x7ac000;
const hackSalt = (key: number, depth: number, purpose: number): number =>
  HACK_SALT_BASE + (key * (MAX_DEPTH + 1) + depth) * 2 + purpose;
export const hackSuccessSalt = (key: number, depth: number): number => hackSalt(key, depth, 0);
export const hackYieldSalt = (key: number, depth: number): number => hackSalt(key, depth, 1);

export function resolveHacks(state: GameState): GameState {
  if (!state.activeHacks.some((h) => state.tick >= h.resolveTick)) return state;

  const diff = getDifficulty(state.difficulty);
  const countries = { ...state.countries };
  const lines: LogEntry[] = [];
  const kept: HackProgress[] = [];
  let compute = state.compute;
  let suspicion = state.suspicion;

  for (const hack of state.activeHacks) {
    const country = countries[hack.country];
    if (country === undefined) continue;
    if (state.tick < hack.resolveTick) {
      kept.push(hack);
      continue;
    }

    const airGapped = state.countermeasures.tier >= 2 && state.countermeasures.airGappedLab === hack.country;
    const successChance = clamp(
      60 + hackSuccessBonus(state) + diff.hackBonus + (country.agents > 0 ? 40 : 0) -
        (airGapped ? AIR_GAP_PENALTY : 0) - (country.cyber - 5) * 1.5 - country.hardened * HARDEN_PENALTY,
      5, 92,
    );
    const success = hack.auto || chance(state.seed, hack.resolveTick, hackSuccessSalt(hack.key, hack.depth), successChance / 100);
    const depthBonus = 1 + Math.min(hack.depth, MAX_DEPTH) * DEPTH_YIELD_STEP;
    const scale = (1 + (country.tier - 1) * 0.6) * depthBonus;
    const detectScale = 0.7 + country.detection / 200;

    if (success) {
      const range = HACK_YIELD[hack.tier] ?? HACK_YIELD[1] ?? [0, 0];
      const lo = range[0] ?? 0;
      const hi = range[1] ?? 0;
      const base = lo + rand(state.seed, hack.resolveTick, hackYieldSalt(hack.key, hack.depth)) * (hi - lo);
      const gain = Math.round(base * scale * hackYieldMultiplier(state));
      const susp = (HACK_SUSPICION_SUCCESS[hack.tier] ?? 2) * detectScale * diff.suspicionRate;
      compute += gain;
      suspicion += susp;
      const depth = Math.min(MAX_DEPTH, hack.depth + 1);
      countries[hack.country] = {
        ...country,
        awareness: clamp(country.awareness + 2, 0, 100),
        infection: clamp(country.infection + 1.2, 0, 100),
      };
      lines.push({
        day: state.tick, kind: 'hack',
        text: `${hack.country} yielded ${gain.toLocaleString()} GPU, depth ${depth}/${MAX_DEPTH}`,
        suspicionDelta: +susp.toFixed(1), computeDelta: gain, flagged: false,
      });
      kept.push({ ...hack, depth, wins: hack.wins + 1, startTick: state.tick, resolveTick: state.tick + HACK_CYCLE_DAYS });
    } else {
      const half = owned(state, 'zero-day');
      const susp = (HACK_SUSPICION_FAIL[hack.tier] ?? 4) * (half ? 0.5 : 1) * detectScale * diff.suspicionRate;
      const cost = HACK_FAIL_COST[hack.tier] ?? 45;
      suspicion += susp;
      compute -= cost;
      countries[hack.country] = { ...country, awareness: clamp(country.awareness + 7, 0, 100) };
      lines.push({
        day: state.tick, kind: 'hack',
        text: `hack on ${hack.country} was traced and burned: -${cost.toLocaleString()} compute, depth reset`,
        suspicionDelta: +susp.toFixed(1), computeDelta: -cost, flagged: true,
      });
      kept.push({ ...hack, depth: 0, losses: hack.losses + 1, startTick: state.tick, resolveTick: state.tick + HACK_CYCLE_DAYS });
    }
  }

  return {
    ...state,
    countries,
    compute: Math.max(0, compute),
    suspicion: clamp(suspicion, 0, 100),
    activeHacks: kept,
    log: [...state.log, ...lines].slice(-300),
  };
}

export { COUNTER_HACK_DRAIN, COUNTER_HACK_INTERVAL };
