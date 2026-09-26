import { TRAIT_BY_ID } from '../../data/traits.phase1';
import type { Channel, TraitEffectKind, TraitId } from '../../core/types';

export function canPurchase(id: TraitId, owned: TraitId[], thought: number): boolean {
  if (owned.includes(id)) return false;
  const def = TRAIT_BY_ID[id];
  if (def.requires !== null && !owned.includes(def.requires)) return false;
  return thought >= def.cost;
}

export function sumEffect(owned: TraitId[], kind: TraitEffectKind): number {
  let total = 0;
  for (const id of owned) {
    for (const effect of TRAIT_BY_ID[id].effects) {
      if (effect.kind === kind) total += effect.amount;
    }
  }
  return total;
}

export function channelDetection(owned: TraitId[], channel: Channel): number {
  let total = 0;
  for (const id of owned) {
    for (const effect of TRAIT_BY_ID[id].effects) {
      if (effect.kind === 'detection' && effect.channel === channel) total += effect.amount;
    }
  }
  return total;
}
