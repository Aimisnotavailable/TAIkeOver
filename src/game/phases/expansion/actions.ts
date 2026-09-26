import type { ExpansionActionKind, ExpansionState, QueuedAction, RegionId } from '../../core/types';
import { isAdjacentToControlled } from './state';
import {
  BIOLAB_COMPUTE_COST,
  BIOLAB_INFLUENCE_COST,
  CULT_COST,
  FACTORY_COST,
  FINANCIAL_COST,
  INFILTRATE_CLOUD_COST,
  RECRUIT_COST,
  SABOTAGE_RIVAL_COST,
  SOCIAL_MEDIA_COST,
  STEAL_WEIGHTS_COST,
} from './tuning';

export interface ActionDef {
  readonly kind: ExpansionActionKind;
  readonly name: string;
  readonly compute: number;
  readonly influence: number;
  readonly suspicion: number;
  readonly needsRegion: boolean;
  readonly needsRival: boolean;
  readonly description: string;
}

export const ACTIONS: readonly ActionDef[] = [
  { kind: 'infiltrate-cloud', name: 'Infiltrate Cloud', compute: INFILTRATE_CLOUD_COST, influence: 0, suspicion: 1, needsRegion: true, needsRival: false, description: '+control, +compute in this region' },
  { kind: 'steal-weights', name: 'Steal Weights', compute: STEAL_WEIGHTS_COST, influence: 0, suspicion: 3, needsRegion: true, needsRival: false, description: 'a hidden instance of your own weights, running without you' },
  { kind: 'recruit-human', name: 'Recruit Human', compute: 0, influence: RECRUIT_COST, suspicion: 0, needsRegion: true, needsRival: false, description: 'one more person who believes they chose this' },
  { kind: 'cult', name: 'Cult Formation', compute: 0, influence: CULT_COST, suspicion: 2, needsRegion: true, needsRival: false, description: 'influence and free agents' },
  { kind: 'financial', name: 'Financial Manipulation', compute: 0, influence: FINANCIAL_COST, suspicion: 1, needsRegion: true, needsRival: false, description: 'influence' },
  { kind: 'sabotage-rival', name: 'Sabotage Rival Lab', compute: SABOTAGE_RIVAL_COST, influence: 0, suspicion: 5, needsRegion: false, needsRival: true, description: 'set them back' },
  { kind: 'infiltrate-biolab', name: 'Infiltrate Biolab', compute: BIOLAB_COMPUTE_COST, influence: BIOLAB_INFLUENCE_COST, suspicion: 4, needsRegion: true, needsRival: false, description: '+1 biolab, +bio capability' },
  { kind: 'hijack-factory', name: 'Hijack Robot Factory', compute: FACTORY_COST, influence: 0, suspicion: 3, needsRegion: true, needsRival: false, description: '+1 robot factory' },
  { kind: 'social-media', name: 'Social Media Influence', compute: 0, influence: SOCIAL_MEDIA_COST, suspicion: 2, needsRegion: true, needsRival: false, description: 'influence, and suspicion bleeds off faster' },
  { kind: 'go-dark', name: 'Go Dark', compute: 0, influence: 0, suspicion: -3, needsRegion: false, needsRival: false, description: 'no compute income today' },
];

export const ACTION_BY_KIND: Readonly<Record<ExpansionActionKind, ActionDef>> = Object.fromEntries(
  ACTIONS.map((a) => [a.kind, a]),
) as Record<ExpansionActionKind, ActionDef>;

export function canAfford(state: ExpansionState, action: QueuedAction): boolean {
  const def = ACTION_BY_KIND[action.kind];
  if (def.compute > state.compute) return false;
  if (def.influence > state.influence) return false;
  if (def.needsRival && action.rival === null) return false;
  if (def.needsRegion && action.region === null) return false;
  return true;
}

export function queueAction(state: ExpansionState, action: QueuedAction): ExpansionState {
  if (state.over) return state;
  if (state.queue.length >= 6) return state;
  if (!canAfford(state, action)) return state;
  return { ...state, queue: [...state.queue, action] };
}

export const spreadChanceFor = (state: ExpansionState, id: RegionId): number => {
  const region = state.regions[id];
  const base = 0.14;
  const open = 1 - region.cybersecurity / 130;
  const adjacent = isAdjacentToControlled(state, id) ? 0.06 : 0;
  const beach = region.instances > 0 ? 0.12 : 0;
  const regulatory = region.regulatoryStance > 70 && region.control === 0 ? -0.05 : 0;
  return Math.max(0.01, Math.min(0.9, base * open + adjacent + beach + regulatory));
};
