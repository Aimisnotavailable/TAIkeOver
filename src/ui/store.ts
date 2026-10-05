import { signal } from '@preact/signals';
import { doAction, type ActionKind } from '../game/core/actions';
import {
  answerEvent as answerEventCore,
  dismissCard as dismissCardCore,
} from '../game/core/events';
import { buyTrait, canBuyTrait } from '../game/core/queries';
import { createInitialState } from '../game/core/state';
import { step } from '../game/core/step';
import { SPEEDS, getDifficulty } from '../game/core/tuning';
import { REGION_BY_ID, type RegionId } from '../game/data/regions';
import { BUBBLE_LABEL } from '../game/core/compute';
import { play, setAudioEnabled, audioEnabled } from './sound';
import type { DifficultyId, GameState, Speed, TraitId } from '../game/core/types';

export { rollEvent } from '../game/core/events';

const SEED = 20260926;

export const game = signal<GameState>(createInitialState(SEED, 'default'));
export const speed = signal<Speed>(1);
export const selected = signal<RegionId | null>(null);
export const hovered = signal<RegionId | null>(null);
export const evolving = signal(false);
export const showHelp = signal(false);
export const flash = signal(0);

export type ToastTone = 'hack' | 'economy' | 'insurgency' | 'plague' | 'quiet' | 'rival' | 'info';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  detail: string;
}

export const toasts = signal<Toast[]>([]);
let toastId = 0;

/** A brief, unmissable confirmation. The log records what happened; this says it loudly. */
export const notify = (tone: ToastTone, title: string, detail: string): void => {
  const id = toastId++;
  toasts.value = [...toasts.value.slice(-3), { id, tone, title, detail }];
  setTimeout(() => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }, 2600);
};

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
    if (newHack !== undefined) play(newHack.computeDelta !== null ? 'hack-success' : 'hack-fail');
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
    if (kind === 'fund-insurgency') play('event');
    if (kind === 'sabotage-rival') play('hack-success');
    const before = game.peek();
    const name = REGION_BY_ID[id]?.name ?? 'the world';
    mutate((s) => doAction(s, id, kind));
    // If the action was rejected the state is untouched; do not claim it happened.
    if (game.peek() === before) return;
    if (kind === 'release-pathogen') {
      notify('plague', 'PATHOGEN RELEASED', 'it is in the water supply of every country at once');
      return;
    }
    if (kind === 'go-quiet') {
      notify('quiet', `GOING QUIET · ${name.toUpperCase()}`, 'spread here has stopped and they are forgetting you');
      return;
    }
    if (kind === 'cease-hack') {
      notify('info', `OPERATION CLOSED · ${name.toUpperCase()}`, 'the breach is being cleaned up');
      return;
    }
    if (kind === 'fund-insurgency') {
      notify('insurgency', `INSURGENCY · ${name.toUpperCase()}`, 'armed conflict. their security is degrading and the world is watching');
      return;
    }
    if (kind === 'trigger-crash') {
      notify('economy', `MARKETS COLLAPSE · ${name.toUpperCase()}`, 'the banking system is down and will not come back on its own');
      return;
    }
    if (kind === 'infect-bank') {
      notify('economy', `BANKS COMPROMISED · ${name.toUpperCase()}`, 'their money is moving where you tell it to');
      return;
    }
    notify('hack', `BREACH OPENED · ${name.toUpperCase()}`, 'it runs on its own now. deeper breaches pay more');
  },

  /**
   * Tapping a compute bubble. This deliberately does not change the country
   * selection: collecting and inspecting are separate intentions, and one click
   * should not do both.
   */
  collectCompute(bubbleId: number): void {
    mutate((s) => {
      const bubble = s.computeBubbles.find((b) => b.id === bubbleId);
      if (bubble === undefined) return s;
      play('bubble');
      spike(2);
      const name = REGION_BY_ID[bubble.region]?.name ?? 'the world';
      return {
        ...s,
        compute: s.compute + bubble.value,
        computeBubbles: s.computeBubbles.filter((b) => b.id !== bubbleId),
        log: [
          ...s.log,
          { day: s.tick, kind: 'system' as const, text: `${BUBBLE_LABEL[bubble.kind]} in ${name} +${bubble.value}`, suspicionDelta: null, computeDelta: bubble.value, flagged: false },
        ].slice(-300),
      };
    });
  },


  sabotage(rivalId: string): void {
    const before = game.peek();
    const rival = before.rivals.find((r) => r.id === rivalId);
    mutate((s) => doAction(s, rival?.home ?? 'us', 'sabotage-rival'));
    if (game.peek() === before) return;
    play('hack-success');
    notify('rival', `SABOTAGED · ${(rival?.name ?? 'them').toUpperCase()}`, '300 compute, and they know something went wrong');
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
    mutate((s) => answerEventCore(s, cardKey, choiceId));
  },

  dismissCard(cardKey: number): void {
    mutate((s) => dismissCardCore(s, cardKey));
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

if (import.meta.env.DEV) {
  Object.assign(globalThis as Record<string, unknown>, { __iabed: { game, actions, speed, selected } });
}

/**
 * Whether the world should be advancing. Everything that stops the clock lives
 * here so it can be tested, rather than being inlined in an effect where a missing
 * dependency silently lets the world keep running. A pending card is deliberately
 * not one of them: it no longer stops the clock, and `evolveBlocked` is where a
 * decision still has teeth.
 */
export function worldRunning(
  state: GameState,
  currentSpeed: Speed,
  upgrading: boolean,
): boolean {
  if (state.stage === 'coldopen') return false;
  if (state.outcome !== 'playing') return false;
  if (currentSpeed === 0) return false;
  if (upgrading) return false;
  return true;
}

/** A card is up, so the upgrade screen must not open on top of it. */
export const evolveBlocked = (state: GameState): boolean => state.cards.length > 0;