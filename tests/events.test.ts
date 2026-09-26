import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { EVENT_DEFS } from '../src/game/data/events';
import { actions, game, rollEvent } from '../src/ui/store';

const dismissCard = actions.dismissCard;

const seedWith = (over: Partial<ReturnType<typeof createInitialState>> = {}) =>
  ({ ...createInitialState(20260926, 'default'), stage: 'world' as const, ...over });

beforeEach(() => {
  game.value = seedWith();
});

const idOf = (cardKey: number): string => {
  const card = game.peek().cards.find((c) => c.key === cardKey);
  if (card === undefined) throw new Error(`no card ${cardKey}`);
  return card.title;
};

describe('ignoring an event', () => {
  it('records the event as handled', () => {
    game.value = rollEvent(seedWith({ suspicion: 60, globalInfection: 20 }));
    const card = game.peek().cards[0];
    if (card === undefined) throw new Error('expected a card');
    expect(game.peek().resolved).toHaveLength(0);
    dismissCard(card.key);
    expect(game.peek().resolved).toHaveLength(1);
  });

  it('removes the card from the queue', () => {
    game.value = rollEvent(seedWith({ suspicion: 60, globalInfection: 20 }));
    const card = game.peek().cards[0];
    if (card === undefined) throw new Error('expected a card');
    dismissCard(card.key);
    expect(game.peek().cards).toHaveLength(0);
  });

  it('does not hand the same event back on the next roll', () => {
    game.value = rollEvent(seedWith({ suspicion: 60, globalInfection: 20 }));
    const first = idOf(game.peek().cards[0]?.key ?? 0);
    dismissCard(game.peek().cards[0]?.key ?? 0);
    game.value = rollEvent(game.peek());
    const second = game.peek().cards[0];
    if (second === undefined) return; // nothing else eligible is fine
    expect(idOf(second.key)).not.toBe(first);
  });

  it('never repeats an event across a long run of rolls', () => {
    game.value = seedWith({ suspicion: 60, globalInfection: 20 });
    const seen: string[] = [];
    for (let i = 0; i < 200; i++) {
      game.value = rollEvent(game.peek());
      const card = game.peek().cards[0];
      if (card === undefined) continue;
      const title = idOf(card.key);
      expect(seen).not.toContain(title);
      seen.push(title);
      dismissCard(card.key);
    }
    expect(seen.length).toBeGreaterThan(0);
  });

  it('cannot exceed the number of distinct events in the game', () => {
    for (let i = 0; i < 500; i++) {
      game.value = rollEvent(game.peek());
      const card = game.peek().cards[0];
      if (card === undefined) continue;
      dismissCard(card.key);
    }
    expect(game.peek().resolved.length).toBeLessThanOrEqual(EVENT_DEFS.length);
  });
});
