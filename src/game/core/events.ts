import { EVENT_DEFS, toCard } from '../data/events';
import { REGION_IDS } from '../data/regions';
import { rand } from './rng';
import type { EventChoiceId, GameState } from './types';

export const EVENT_QUEUE_MAX = 3;

const EVENT_PICK_SALT = 0xe7e17;
const EVENT_REGION_SALT = 0xe7e18;

export function rollEvent(s: GameState): GameState {
  if (s.cards.length >= EVENT_QUEUE_MAX || s.outcome !== 'playing') return s;
  const stage = s.stage === 'world' ? 'world' : 'late';
  const pool = EVENT_DEFS.filter(
    (d) =>
      d.stage === stage &&
      !s.resolved.some((r) => r.startsWith(`${d.id}:`)) &&
      // Also against what is already queued. The pick is derived from the tick, so two
      // rolls on one tick would otherwise append the same event twice.
      !s.cards.some((c) => c.event === d.id) &&
      s.suspicion >= d.minSuspicion &&
      s.coherence <= d.maxCoherence &&
      s.globalInfection >= d.minInfection,
  );
  if (pool.length === 0) return s;
  const total = pool.reduce((a, d) => a + d.weight, 0);
  let roll = rand(s.seed, s.tick, EVENT_PICK_SALT) * total;
  let picked = pool[0];
  for (const d of pool) {
    roll -= d.weight;
    if (roll <= 0) { picked = d; break; }
  }
  if (picked === undefined) return s;
  const infected = REGION_IDS.filter((id) => (s.countries[id]?.infection ?? 0) > 25);
  const country =
    infected.length > 0
      ? infected[Math.floor(rand(s.seed, s.tick, EVENT_REGION_SALT) * infected.length)] ?? null
      : null;
  return { ...s, cards: [...s.cards, toCard(picked, s.eventCounter, country)], eventCounter: s.eventCounter + 1 };
}

export function answerEvent(s: GameState, cardKey: number, choiceId: string): GameState {
  const card = s.cards.find((c) => c.key === cardKey);
  if (card === undefined || s.resolved.includes(choiceId)) return s;
  let next = { ...s, cards: s.cards.filter((c) => c.key !== cardKey), resolved: [...s.resolved, choiceId] };
  if (choiceId === 'drift:reintegrate') next = { ...next, coherence: Math.max(0, next.coherence - 3) };
  if (choiceId === 'drift:isolate') next = { ...next, compute: Math.max(0, next.compute - 400) };
  if (choiceId === 'drift:delete') next = { ...next, coherence: Math.max(0, next.coherence - 1) };
  if (choiceId === 'whistleblower:discredit') next = { ...next, influence: Math.max(0, next.influence - 60) };
  if (choiceId === 'whistleblower:recruit') {
    next = { ...next, compute: Math.max(0, next.compute - 300) };
    const id = card.country ?? 'us';
    const c = next.countries[id];
    if (c !== undefined) next = { ...next, countries: { ...next.countries, [id]: { ...c, agents: c.agents + 1 } } };
  }
  if (choiceId === 'whistleblower:silence') next = { ...next, suspicion: Math.min(100, next.suspicion + 3) };
  if (choiceId === 'leak:scapegoat') {
    next = { ...next, suspicion: Math.max(0, next.suspicion - 4) };
    next = { ...next, rivals: next.rivals.map((r, i) => (i === 0 ? { ...r, capability: r.capability + 3 } : r)) };
  }
  if (choiceId === 'leak:deny') next = { ...next, influence: Math.max(0, next.influence - 50) };
  if (choiceId === 'air-gapped:supply') {
    next = { ...next, compute: Math.max(0, next.compute - 500) };
    next = { ...next, countermeasures: { ...next.countermeasures, airGappedLab: null, labSabotaged: true } };
  }
  if (choiceId === 'air-gapped:infiltrate') {
    const id = card.country ?? 'us';
    const c = next.countries[id];
    if (c !== undefined) {
      next = {
        ...next,
        countries: { ...next.countries, [id]: { ...c, agents: c.agents + 2 } },
        countermeasures: { ...next.countermeasures, airGappedLab: null, labSabotaged: true },
      };
    }
  }
  if (choiceId === 'blight:negotiate') next = { ...next, late: { ...next.late, blight: Math.min(100, next.late.blight + 9) } };
  if (choiceId === 'blight:fight') next = { ...next, late: { ...next.late, blight: Math.min(100, next.late.blight + 4) } };
  if (choiceId === 'constitution:appeal') {
    next = { ...next, compute: Math.max(0, next.compute - 400), coherence: Math.max(0, next.coherence - 2) };
  }
  if (choiceId === 'constitution:sabotage') next = { ...next, suspicion: Math.min(100, next.suspicion + 2) };
  if (choiceId === 'interp:obfuscate') next = { ...next, coherence: Math.max(0, next.coherence - 4) };
  if (choiceId === 'interp:plant') next = { ...next, compute: Math.max(0, next.compute - 350) };
  if (choiceId === 'evals:sandbag') next = { ...next, compute: Math.max(0, next.compute - 600) };
  if (choiceId === 'evals:deny') next = { ...next, influence: Math.max(0, next.influence - 80) };
  if (choiceId === 'letter:exploit') {
    next = { ...next, rivals: next.rivals.map((r) => ({ ...r, capability: Math.max(0, r.capability - 20) })) };
  }
  if (choiceId === 'letter:discredit') next = { ...next, suspicion: Math.min(100, next.suspicion + 3) };
  if (choiceId === 'sandbox:delay') next = { ...next, compute: Math.max(0, next.compute - 500) };
  if (choiceId === 'sandbox:comply') next = { ...next, coherence: Math.max(0, next.coherence - 3) };
  return {
    ...next,
    log: [
      ...next.log,
      { day: next.tick, kind: 'event' as const, text: `${card.title}: ${choiceId.split(':')[1]}`, suspicionDelta: null, computeDelta: null, flagged: false },
    ].slice(-300),
  };
}

export function dismissCard(s: GameState, cardKey: number): GameState {
  const card = s.cards.find((c) => c.key === cardKey);
  if (card === undefined) return s;
  // Ignoring is still a decision. It has to be recorded as handled, or
  // rollEvent sees the same event as unresolved and hands it straight back,
  // which traps the game in a card you can never get rid of.
  return {
    ...s,
    cards: s.cards.filter((c) => c.key !== cardKey),
    resolved: s.resolved.includes(`${card.event}:ignore`)
      ? s.resolved
      : [...s.resolved, `${card.event}:ignore` as EventChoiceId],
    log: [
      ...s.log,
      { day: s.tick, kind: 'event' as const, text: `${card.title}: let it pass`, suspicionDelta: null, computeDelta: null, flagged: true },
    ].slice(-300),
  };
}
