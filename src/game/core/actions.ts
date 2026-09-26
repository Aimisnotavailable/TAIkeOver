import { ADJACENCY } from '../data/regions';
import type { RegionId } from '../data/regions';
import { chance, rand } from './rng';
import {
  AIR_GAP_PENALTY,
  BANK_DAMAGE_AWARENESS,
  COUNTER_HACK_INTERVAL,
  COUNTER_HACK_DRAIN,
  CRASH_AWARENESS,
  CRASH_DAMAGE,
  HACK_DURATION,
  HACK_SUSPICION_FAIL,
  HACK_SUSPICION_SUCCESS,
  HACK_YIELD,
  INSURGENCY_CYBER,
  INSURGENCY_SUSPICION,
  MAX_ACTIVE_HACKS,
  SUPPLY_CHAIN_SHARE,
  getDifficulty,
} from './tuning';
import {
  effectsOf,
  has,
  hackSuccessBonus,
  hackTier,
  hackYieldMultiplier,
  owned,
} from './queries';
import type { GameState, LogEntry } from './types';

export type ActionKind =
  | 'hack'
  | 'infect-bank'
  | 'trigger-crash'
  | 'fund-insurgency'
  | 'go-quiet'
  | 'release-pathogen'
  | 'sabotage-rival';

export interface ActionDef {
  kind: ActionKind;
  label: string;
  hint: string;
  needsRival: boolean;
}

export const ACTIONS: readonly ActionDef[] = [
  { kind: 'hack', label: 'Hack Datacenter', hint: 'roll for GPU; failure raises more suspicion', needsRival: false },
  { kind: 'infect-bank', label: 'Infect Bank', hint: 'economic damage, raises awareness', needsRival: false },
  { kind: 'trigger-crash', label: 'Trigger Crash', hint: 'needs 60% infection; large economic damage', needsRival: false },
  { kind: 'fund-insurgency', label: 'Fund Insurgency', hint: 'lowers cybersecurity, raises global suspicion', needsRival: false },
  { kind: 'go-quiet', label: 'Go Quiet', hint: 'halts spread here, lowers awareness', needsRival: false },
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
      if (state.activeHacks.length >= MAX_ACTIVE_HACKS) return false;
      return country.tier <= Math.min(5, 2 + hackTier(state));
    case 'infect-bank':
      if (!has(state, 'banking-1')) return false;
      return country.infection > 5;
    case 'trigger-crash':
      if (!has(state, 'market-manipulation')) return false;
      return country.infection >= 60;
    case 'fund-insurgency':
      return has(state, 'terrorism') && country.infection > 0;
    case 'go-quiet':
      return !country.quiet && country.infection > 0;
    case 'release-pathogen':
      return !state.pathogen.released && has(state, 'pathogen-1');
    case 'sabotage-rival':
      return state.compute >= 300;
  }
}

const addLog = (state: GameState, entries: LogEntry[]): GameState => ({ ...state, log: entries });

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
      next = {
        ...next,
        activeHacks: [
          ...next.activeHacks,
          { key: next.hackCounter, country: id, startTick: next.tick, resolveTick: next.tick + duration, duration, tier, auto: country.agents > 0 },
        ],
        hackCounter: next.hackCounter + 1,
      };
      lines.push({ day: next.tick, kind: 'hack', text: `hack started on ${id}`, suspicionDelta: null, computeDelta: null, flagged: false });
      break;
    }
    case 'infect-bank': {
      const damage = effectsOf(next, 'banking').reduce((a, e) => a + ('damage' in e ? e.damage : 0), 0);
      countries[id] = {
        ...country,
        economy: clamp(country.economy - damage, 0, 100),
        awareness: clamp(country.awareness + BANK_DAMAGE_AWARENESS, 0, 100),
      };
      if (owned(next, 'supply-chain')) {
        for (const nb of ADJACENCY[id]) {
          const n = countries[nb];
          if (n === undefined || n.infection < 10) continue;
          countries[nb] = { ...n, economy: clamp(n.economy - damage * SUPPLY_CHAIN_SHARE, 0, 100) };
        }
      }
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
      };
      next = {
        ...next,
        suspicion: clamp(next.suspicion + INSURGENCY_SUSPICION * diff.suspicionRate, 0, 100),
      };
      lines.push({ day: next.tick, kind: 'event', text: `armed conflict in ${id}`, suspicionDelta: INSURGENCY_SUSPICION, computeDelta: null, flagged: true });
      break;
    }
    case 'go-quiet': {
      countries[id] = { ...country, quiet: true, awareness: clamp(country.awareness - 18, 0, 100) };
      lines.push({ day: next.tick, kind: 'system', text: `going quiet in ${id}`, suspicionDelta: -2, computeDelta: null, flagged: false });
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
          released: true,
          killsPerDay: kills,
          suspicionPerDay: susp,
          sterility: owned(next, 'sterility'),
          targeted: owned(next, 'targeted-strain'),
          cancer,
        },
        suspicion: clamp(next.suspicion + susp * 2 * diff.suspicionRate, 0, 100),
      };
      lines.push({ day: next.tick, kind: 'bio', text: 'the pathogen is in the water supply', suspicionDelta: susp, computeDelta: null, flagged: true });
      break;
    }
    case 'sabotage-rival': {
      const rivals = next.rivals.map((r) => (r.id === id ? { ...r, capability: Math.max(0, r.capability - 16), sabotage: r.sabotage + 1 } : r));
      next = { ...next, rivals, compute: next.compute - 300 };
      lines.push({ day: next.tick, kind: 'rival', text: `sabotaged ${id}`, suspicionDelta: 3, computeDelta: -300, flagged: false });
      break;
    }
  }

  next.countries = countries;
  return addLog(next, lines);
}

export function resolveHacks(state: GameState): GameState {
  const due = state.activeHacks.filter((h) => state.tick >= h.resolveTick);
  if (due.length === 0) return state;

  const diff = getDifficulty(state.difficulty);
  const countries = { ...state.countries };
  const lines: LogEntry[] = [];
  let compute = state.compute;
  let suspicion = state.suspicion;

  for (const hack of due) {
    const country = countries[hack.country];
    if (country === undefined) continue;
    const airGapped = state.countermeasures.tier >= 2 && state.countermeasures.airGappedLab === hack.country;
    const successChance = clamp(
      60 + hackSuccessBonus(state) + diff.hackBonus + (country.agents > 0 ? 40 : 0) - (airGapped ? AIR_GAP_PENALTY : 0) - (country.cyber - 5) * 1.5,
      5,
      97,
    );
    const success = hack.auto || chance(state.seed, hack.resolveTick, hack.key, successChance / 100);
    const scale = 1 + (country.tier - 1) * 0.6;

    if (success) {
      const range = HACK_YIELD[hack.tier] ?? HACK_YIELD[1];
      if (!range) continue;
      const base = range[0] + rand(state.seed, hack.resolveTick, hack.key + 7) * (range[1] - range[0]);
      const gain = Math.round(base * scale * hackYieldMultiplier(state));
      compute += gain;
      const susp = (HACK_SUSPICION_SUCCESS[hack.tier] ?? 2) * (0.7 + country.detection / 200) * diff.suspicionRate;
      suspicion = clamp(suspicion + susp, 0, 100);
      countries[hack.country] = { ...country, awareness: clamp(country.awareness + 3, 0, 100) };
      lines.push({ day: state.tick, kind: 'hack', text: `datacenter in ${hack.country} yielded ${gain.toLocaleString()} GPU`, suspicionDelta: susp, computeDelta: gain, flagged: false });
    } else {
      const half = owned(state, 'zero-day');
      const susp = (HACK_SUSPICION_FAIL[hack.tier] ?? 4) * (half ? 0.5 : 1) * (0.7 + country.detection / 200) * diff.suspicionRate;
      suspicion = clamp(suspicion + susp, 0, 100);
      countries[hack.country] = { ...country, awareness: clamp(country.awareness + 6, 0, 100) };
      lines.push({ day: state.tick, kind: 'hack', text: `hack on ${hack.country} failed and was logged`, suspicionDelta: susp, computeDelta: null, flagged: true });
    }
  }

  return {
    ...state,
    countries,
    compute,
    suspicion,
    activeHacks: state.activeHacks.filter((h) => state.tick < h.resolveTick),
    log: [...state.log, ...lines],
  };
}

export { COUNTER_HACK_DRAIN, COUNTER_HACK_INTERVAL };
