import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { evolveBlocked, game, speed, toasts, worldRunning } from '../src/ui/store';
import type { GameState, Speed } from '../src/game/core/types';

const world = (over: Partial<GameState> = {}): GameState => ({
  ...createInitialState(42, 'default'),
  stage: 'world',
  ...over,
});

const running = (s: GameState, sp: Speed, upgrading: boolean): boolean =>
  worldRunning(s, sp, upgrading);

beforeEach(() => {
  game.value = world();
  toasts.value = [];
});

describe('what stops the world', () => {
  it('runs at normal speed with nothing pending', () => {
    expect(running(world(), 1, false)).toBe(true);
  });

  it('runs at every speed above zero', () => {
    for (const s of [1, 2, 4, 8] as Speed[]) {
      expect(running(world(), s, false), `speed ${s}`).toBe(true);
    }
  });

  // The bug this file exists for: the upgrade screen has to stop the clock, or
  // you shop while the world keeps ending.
  it('stops while the upgrade screen is open', () => {
    expect(running(world(), 1, true)).toBe(false);
    expect(running(world(), 8, true)).toBe(false);
  });

  it('stops on pause', () => {
    expect(running(world(), 0, false)).toBe(false);
  });

  it('stops during the cold open', () => {
    expect(running(world({ stage: 'coldopen' }), 1, false)).toBe(false);
  });

  it('stops when a card is waiting', () => {
    const withCard = world({ cards: [{ key: 0, event: 'x', title: 'x', body: 'x', country: null, choices: [], urgent: false }] });
    expect(running(withCard, 1, false)).toBe(false);
  });

  it('stops once the run is over', () => {
    expect(running(world({ outcome: 'lost' }), 1, false)).toBe(false);
    expect(running(world({ outcome: 'won' }), 8, false)).toBe(false);
  });

  it('resumes the moment every reason to stop is gone', () => {
    const card: GameState['cards'] = [{ key: 0, event: 'x', title: 'x', body: 'x', country: null, choices: [], urgent: false }];
    expect(running(world({ cards: card }), 1, false)).toBe(false);
    expect(running(world(), 1, false)).toBe(true);
  });
});

describe('a card and the upgrade screen', () => {
  const card: GameState['cards'] = [
    { key: 0, event: 'leak', title: 'Datacenter leak', body: 'something', country: 'us', choices: [], urgent: false },
  ];

  // Two overlays at once is what left the run frozen: the card pausing the world
  // while the upgrade screen sat on top of it, neither reachable.
  it('blocks the upgrade screen while a card is up', () => {
    expect(evolveBlocked(world({ cards: card }))).toBe(true);
  });

  it('allows the upgrade screen once the card is gone', () => {
    expect(evolveBlocked(world())).toBe(false);
  });

  it('stays blocked for two cards, not just one', () => {
    const two: GameState['cards'] = [card[0]!, { ...card[0]!, key: 1 }];
    expect(evolveBlocked(world({ cards: two }))).toBe(true);
  });
});

describe('the speed signal', () => {
  it('reports whatever was last set', () => {
    speed.value = 4;
    expect(speed.value).toBe(4);
    speed.value = 1;
  });
});
