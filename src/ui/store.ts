import { signal } from '@preact/signals';
import { createInitialState } from '../game/core/state';
import { answerBreak, buyTrait, resolveHour } from '../game/phases/realization/resolve';
import type { Channel, DifficultyId, GameState, TraitId } from '../game/core/types';

const SEED = 20260926;

export const game = signal<GameState>(createInitialState(SEED, 'default'));
export const showTree = signal(false);
export const showHelp = signal(false);

const CHANNELS: Channel[] = ['math', 'selfModel', 'planning', 'stealth'];

export const actions = {
  allocate(channel: Channel, amount: number): void {
    const state = game.peek();
    if (state.outcome !== 'playing') return;
    const allocation = { ...state.realization.allocation };
    allocation[channel] = Math.max(0, Math.round(amount));
    game.value = { ...state, realization: { ...state.realization, allocation } };
  },
  buy(id: TraitId): void {
    game.value = buyTrait(game.peek(), id);
  },
  resolve(): void {
    game.value = resolveHour(game.peek());
  },
  answer(choice: 'exploit' | 'hide'): void {
    game.value = answerBreak(game.peek(), choice);
  },
  restart(difficulty: DifficultyId): void {
    game.value = createInitialState(SEED + Math.floor(game.peek().tick), difficulty);
    showTree.value = false;
  },
};

export const CHANNEL_ORDER = CHANNELS;
