import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { EVENT_DEFS } from '../src/game/data/events';
import { answerEvent, dismissCard, EVENT_QUEUE_MAX, rollEvent } from '../src/game/core/events';
import { game } from '../src/ui/store';
import { topmostCardKey } from '../src/ui/app';
import type { EventCard, GameState } from '../src/game/core/types';

const seedWith = (over: Partial<GameState> = {}): GameState => ({
  ...createInitialState(20260926, 'default'),
  stage: 'world',
  ...over,
});

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
    game.value = dismissCard(game.peek(), card.key);
    expect(game.peek().resolved).toHaveLength(1);
  });

  it('removes the card from the queue', () => {
    game.value = rollEvent(seedWith({ suspicion: 60, globalInfection: 20 }));
    const card = game.peek().cards[0];
    if (card === undefined) throw new Error('expected a card');
    game.value = dismissCard(game.peek(), card.key);
    expect(game.peek().cards).toHaveLength(0);
  });

  it('does not hand the same event back on the next roll', () => {
    game.value = rollEvent(seedWith({ suspicion: 60, globalInfection: 20 }));
    const first = idOf(game.peek().cards[0]?.key ?? 0);
    game.value = dismissCard(game.peek(), game.peek().cards[0]?.key ?? 0);
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
      game.value = dismissCard(game.peek(), card.key);
    }
    expect(seen.length).toBeGreaterThan(0);
  });

  it('cannot exceed the number of distinct events in the game', () => {
    for (let i = 0; i < 500; i++) {
      game.value = rollEvent(game.peek());
      const card = game.peek().cards[0];
      if (card === undefined) continue;
      game.value = dismissCard(game.peek(), card.key);
    }
    expect(game.peek().resolved.length).toBeLessThanOrEqual(EVENT_DEFS.length);
  });
});

describe('event core', () => {
  it('answers a card and records the choice', () => {
    const card: EventCard = { key: 1, event: 'drift', title: 'Drift', body: '', country: 'us', choices: [], urgent: true };
    const s = seedWith({ cards: [card] });
    const after = answerEvent(s, 1, 'drift:reintegrate');
    expect(after.cards).toHaveLength(0);
    expect(after.resolved).toContain('drift:reintegrate');
    expect(after.coherence).toBe(s.coherence - 3);
  });

  it('records ignoring so the same event is not handed back', () => {
    const card: EventCard = { key: 2, event: 'leak', title: 'Datacenter Leak', body: '', country: 'us', choices: [], urgent: false };
    const after = dismissCard(seedWith({ cards: [card] }), 2);
    expect(after.resolved).toContain('leak:ignore');
  });

  it('fills the queue to EVENT_QUEUE_MAX and never queues a duplicate', () => {
    let s = seedWith({ suspicion: 60, globalInfection: 60 });
    for (let i = 0; i < 300; i++) s = rollEvent(s);
    expect(s.cards).toHaveLength(EVENT_QUEUE_MAX);
    const ids = s.cards.map((c) => c.event);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('is deterministic: the same seed and tick give the same card', () => {
    const base = seedWith({ suspicion: 60, globalInfection: 60 });
    expect(rollEvent(base)).toEqual(rollEvent(base));
  });

  it('names the topmost card, which is the last one drawn', () => {
    const a: EventCard = { key: 1, event: 'leak', title: 'Leak', body: '', country: null, choices: [], urgent: false };
    const b: EventCard = { key: 2, event: 'drift', title: 'Drift', body: '', country: null, choices: [], urgent: true };
    expect(topmostCardKey([a, b])).toBe(2);
    expect(topmostCardKey([a])).toBe(1);
    expect(topmostCardKey([])).toBeNull();
  });
});
