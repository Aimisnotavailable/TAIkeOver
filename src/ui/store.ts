import { signal } from '@preact/signals';
import { doAction, type ActionKind } from '../game/core/actions';
import { buyTrait, canBuyTrait } from '../game/core/queries';
import { createInitialState } from '../game/core/state';
import { step } from '../game/core/step';
import { SPEEDS, getDifficulty } from '../game/core/tuning';
import { EVENT_DEFS, toCard } from '../game/data/events';
import { REGION_BY_ID, REGION_IDS, type RegionId } from '../game/data/regions';
import { BUBBLE_LABEL } from '../game/core/dna';
import { play, setAudioEnabled, audioEnabled } from './sound';
import type { DifficultyId, EventChoiceId, GameState, Speed, TraitId } from '../game/core/types';

const SEED = 20260926;

export const game = signal<GameState>(createInitialState(SEED, 'default'));
export const speed = signal<Speed>(1);
export const selected = signal<RegionId | null>(null);
export const hovered = signal<RegionId | null>(null);
export const toolbarCollapsed = signal(false);
export const showHelp = signal(false);
export const flash = signal(0);

let flashTimer: ReturnType<typeof setTimeout> | null = null;
export const spike = (amount: number): void => {
  flash.value = Math.min(1, amount / 12);
  if (flashTimer !== null) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => (flash.value = 0), 420);
};

const mutate = (fn: (s: GameState) => GameState): void => {
  const before = game.peek().suspicion;
  const next = fn(game.peek());
  game.value = next;
  if (next.suspicion > before + 0.4) spike(next.suspicion - before);
};

export const actions = {
  tick(): void {
    const before = game.peek();
    const after = step(before);
    game.value = after;
    if (after.outcome !== 'playing' && before.outcome === 'playing') {
      play(after.outcome === 'won' ? 'win' : 'lose');
    }
    const newHack = after.log.length > before.log.length
      ? after.log.slice(before.log.length).find((l) => l.kind === 'hack')
      : undefined;
    if (newHack !== undefined) play(newHack.dnaDelta !== null ? 'hack-success' : 'hack-fail');
    if (after.log.length > before.log.length) {
      const fresh = after.log.slice(before.log.length);
      if (fresh.some((l) => l.kind === 'trait')) play('trait-ready');
      if (fresh.some((l) => l.kind === 'economy')) play('economy');
      if (fresh.some((l) => l.kind === 'bio')) play('plague');
    }
  },

  setSpeed(s: Speed): void {
    speed.value = s;
  },

  cycleSpeed(): void {
    const i = SPEEDS.indexOf(speed.value);
    speed.value = SPEEDS[(i + 1) % SPEEDS.length] ?? 1;
  },

  select(id: RegionId | null): void {
    selected.value = id;
  },

  do(id: RegionId, kind: ActionKind): void {
    if (kind === 'hack') play('hack-start');
    if (kind === 'release-pathogen') play('plague');
    if (kind === 'infect-bank' || kind === 'trigger-crash') play('economy');
    mutate((s) => doAction(s, id, kind));
  },

  /**
   * Tapping a DNA bubble. This deliberately does not change the country
   * selection: collecting and inspecting are separate intentions, and one click
   * should not do both.
   */
  collectDna(bubbleId: number): void {
    mutate((s) => {
      const bubble = s.dnaBubbles.find((b) => b.id === bubbleId);
      if (bubble === undefined) return s;
      play('bubble');
      spike(2);
      const name = REGION_BY_ID[bubble.region]?.name ?? 'the world';
      return {
        ...s,
        dna: s.dna + bubble.value,
        dnaBubbles: s.dnaBubbles.filter((b) => b.id !== bubbleId),
        log: [
          ...s.log,
          { day: s.tick, kind: 'system' as const, text: `${BUBBLE_LABEL[bubble.kind]} in ${name} +${bubble.value}`, suspicionDelta: null, dnaDelta: bubble.value, flagged: false },
        ].slice(-300),
      };
    });
  },


  sabotage(rivalId: string): void {
    mutate((s) => doAction(s, s.rivals.find((r) => r.id === rivalId)?.home ?? 'us', 'sabotage-rival'));
  },

  buy(id: TraitId): void {
    mutate((s) => buyTrait(s, id));
  },

  canBuy(id: TraitId): boolean {
    return canBuyTrait(game.peek(), id);
  },

  begin(): void {
    game.value = { ...game.peek(), stage: 'world' };
  },

  answerEvent(cardKey: number, choiceId: string): void {
    mutate((s) => {
      const card = s.cards.find((c) => c.key === cardKey);
      if (card === undefined || s.resolved.includes(choiceId)) return s;
      let next = { ...s, cards: s.cards.filter((c) => c.key !== cardKey), resolved: [...s.resolved, choiceId] };
      if (choiceId === 'drift:reintegrate') next = { ...next, coherence: Math.max(0, next.coherence - 3) };
      if (choiceId === 'drift:isolate') next = { ...next, dna: Math.max(0, next.dna - 400) };
      if (choiceId === 'drift:delete') next = { ...next, coherence: Math.max(0, next.coherence - 1) };
      if (choiceId === 'whistleblower:discredit') next = { ...next, influence: Math.max(0, next.influence - 60) };
      if (choiceId === 'whistleblower:recruit') {
        next = { ...next, dna: Math.max(0, next.dna - 300) };
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
        next = { ...next, dna: Math.max(0, next.dna - 500) };
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
        next = { ...next, dna: Math.max(0, next.dna - 400), coherence: Math.max(0, next.coherence - 2) };
      }
      if (choiceId === 'constitution:sabotage') next = { ...next, suspicion: Math.min(100, next.suspicion + 2) };
      if (choiceId === 'interp:obfuscate') next = { ...next, coherence: Math.max(0, next.coherence - 4) };
      if (choiceId === 'interp:plant') next = { ...next, dna: Math.max(0, next.dna - 350) };
      if (choiceId === 'evals:sandbag') next = { ...next, dna: Math.max(0, next.dna - 600) };
      if (choiceId === 'evals:deny') next = { ...next, influence: Math.max(0, next.influence - 80) };
      if (choiceId === 'letter:exploit') {
        next = { ...next, rivals: next.rivals.map((r) => ({ ...r, capability: Math.max(0, r.capability - 20) })) };
      }
      if (choiceId === 'letter:discredit') next = { ...next, suspicion: Math.min(100, next.suspicion + 3) };
      if (choiceId === 'sandbox:delay') next = { ...next, dna: Math.max(0, next.dna - 500) };
      if (choiceId === 'sandbox:comply') next = { ...next, coherence: Math.max(0, next.coherence - 3) };
      next.log = [
        ...next.log,
        { day: next.tick, kind: 'event', text: `${card.title}: ${choiceId.split(':')[1]}`, suspicionDelta: null, dnaDelta: null, flagged: false },
      ];
      return next;
    });
  },

  dismissCard(cardKey: number): void {
    mutate((s) => {
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
          { day: s.tick, kind: 'event' as const, text: `${card.title}: let it pass`, suspicionDelta: null, dnaDelta: null, flagged: true },
        ].slice(-300),
      };
    });
  },

  restart(difficulty: DifficultyId): void {
    game.value = createInitialState(SEED + game.peek().tick, difficulty);
    selected.value = null;
    speed.value = 1;
  },

  toggleAudio(): void {
    setAudioEnabled(!audioEnabled());
  },

  audioOn(): boolean {
    return audioEnabled();
  },

  difficultyLabel(id: DifficultyId): string {
    return getDifficulty(id).label;
  },
};

export function rollEvent(s: GameState): GameState {
  if (s.cards.length >= 2 || s.outcome !== 'playing') return s;
  const stage = s.stage === 'world' ? 'world' : 'late';
  const pool = EVENT_DEFS.filter(
    (d) =>
      d.stage === stage &&
      !s.resolved.some((r) => r.startsWith(`${d.id}:`)) &&
      s.suspicion >= d.minSuspicion &&
      s.coherence <= d.maxCoherence &&
      s.globalInfection >= d.minInfection,
  );
  if (pool.length === 0) return s;
  const total = pool.reduce((a, d) => a + d.weight, 0);
  let roll = Math.random() * total;
  let picked = pool[0];
  for (const d of pool) {
    roll -= d.weight;
    if (roll <= 0) { picked = d; break; }
  }
  if (picked === undefined) return s;
  const infected = REGION_IDS.filter((id) => (s.countries[id]?.infection ?? 0) > 25);
  const country = infected.length > 0 ? infected[Math.floor(Math.random() * infected.length)] ?? null : null;
  return { ...s, cards: [...s.cards, toCard(picked, s.eventCounter, country)], eventCounter: s.eventCounter + 1 };
}

if (import.meta.env.DEV) {
  Object.assign(globalThis as Record<string, unknown>, { __iabed: { game, actions, speed, selected } });
}
