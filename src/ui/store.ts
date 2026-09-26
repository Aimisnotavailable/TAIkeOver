import { signal } from '@preact/signals';
import { createInitialState } from '../game/core/state';
import { answerBreak, buyTrait, resolveHour } from '../game/phases/realization/resolve';
import { ACTIONS, queueAction } from '../game/phases/expansion/actions';
import { deployPlague, resolveDay } from '../game/phases/expansion/resolve';
import { resolveAscensionTick, convertRegion, expandOffworld } from '../game/phases/ascension/resolve';
import { unlockTrait as unlockAscension, answerTheQuestion, boiTheOceans } from '../game/phases/ascension/state';
import { resolveCodaTick } from '../game/phases/coda/resolve';
import { beginAscension, beginCoda, beginExpansion } from '../game/core/phases';
import type { Channel, DifficultyId, ExpansionActionKind, GameState, RegionId, TraitId } from '../game/core/types';

const SEED = 20260926;

export const game = signal<GameState>(createInitialState(SEED, 'default'));
export const showTree = signal(false);
export const selectedRegion = signal<RegionId | null>(null);
export const hoveredRegion = signal<RegionId | null>(null);
export const codaChoice = signal<'negotiate' | 'fight' | 'ignore' | null>(null);

const CHANNELS: Channel[] = ['math', 'selfModel', 'planning', 'stealth'];

const mutate = (fn: (state: GameState) => GameState): void => {
  game.value = fn(game.peek());
};

export const actions = {
  allocate(channel: Channel, amount: number): void {
    mutate((state) => {
      if (state.outcome !== 'playing') return state;
      const allocation = { ...state.realization.allocation };
      allocation[channel] = Math.max(0, Math.round(amount));
      return { ...state, realization: { ...state.realization, allocation } };
    });
  },

  buy(id: TraitId): void {
    mutate((state) => buyTrait(state, id));
  },

  resolveHour(): void {
    mutate((state) => {
      if (state.phase === 'ascension') return resolveAscensionTick(state);
      return resolveHour(state);
    });
  },

  answerBreak(choice: 'exploit' | 'hide'): void {
    mutate((state) => answerBreak(state, choice));
  },

  deploy(): void {
    mutate((state) => {
      if (state.outcome !== 'won') return state;
      return beginExpansion(state, 3);
    });
  },

  ascend(): void {
    mutate((state) => (state.outcome === 'playing' ? beginAscension(state) : state));
  },

  enterCoda(): void {
    mutate((state) => (state.outcome === 'playing' ? beginCoda(state) : state));
  },

  restart(difficulty: DifficultyId): void {
    game.value = createInitialState(SEED, difficulty);
    selectedRegion.value = null;
    showTree.value = false;
  },

  queue(kind: ExpansionActionKind, region: RegionId | null, rival: string | null): void {
    mutate((state) => {
      if (state.expansion === null) return state;
      const next = queueAction(state.expansion, { kind, region, rival });
      return { ...state, expansion: next };
    });
  },

  dequeue(index: number): void {
    mutate((state) => {
      if (state.expansion === null) return state;
      const queue = state.expansion.queue.filter((_, i) => i !== index);
      return { ...state, expansion: { ...state.expansion, queue } };
    });
  },

  resolveDay(): void {
    mutate((state) => resolveDay(state));
  },

  plague(): void {
    mutate((state) => deployPlague(state));
  },

  convert(region: RegionId): void {
    mutate((state) => convertRegion(state, region));
  },

  unlockTrait(id: string): void {
    mutate((state) =>
      state.ascension === null ? state : { ...state, ascension: unlockAscension(state.ascension, id) },
    );
  },

  boil(): void {
    mutate((state) => (state.ascension === null ? state : { ...state, ascension: boiTheOceans(state.ascension) }));
  },

  answer(exterminate: boolean): void {
    mutate((state) =>
      state.ascension === null
        ? state
        : { ...state, ascension: answerTheQuestion(state.ascension, exterminate) },
    );
  },

  expand(target: 'moon' | 'mars' | 'belt' | 'jupiter' | 'saturn' | 'mercury'): void {
    mutate((state) => (state.ascension === null ? state : expandOffworld(state, target)));
  },

  coda(choice: 'negotiate' | 'fight' | 'ignore' | null): void {
    codaChoice.value = choice;
    mutate((state) => resolveCodaTick(state, choice));
  },
};

export { ACTIONS };
export const CHANNEL_ORDER = CHANNELS;

if (import.meta.env.DEV) {
  Object.assign(globalThis as Record<string, unknown>, {
    __iabed: { game, actions, showTree, selectedRegion, hoveredRegion },
    __iabedPhases: { beginExpansion, beginAscension, beginCoda },
  });
}
