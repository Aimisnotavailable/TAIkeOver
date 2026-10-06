import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { EVENT_DEFS, toCard } from '../src/game/data/events';
import { CHOICE_EFFECTS, answerEvent, dismissCard, EVENT_QUEUE_MAX, rollEvent } from '../src/game/core/events';
import { GO_QUIET_AWARENESS } from '../src/game/core/tuning';
import { REGION_IDS } from '../src/game/data/regions';
import { step } from '../src/game/core/step';
import { actions, flash, game } from '../src/ui/store';
import { controlTakesKey, topmostCardKey } from '../src/ui/app';
import appSource from '../src/ui/app.tsx?raw';
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

/**
 * A run with headroom in every meter a choice spends, so that a cost is never clipped by a
 * clamp and read as a smaller one, and with awareness and infection already off the floor in
 * every country so a global effect has somewhere to move them. Rivals are levelled for the
 * same reason: `open-letter:exploit` takes twenty off each and the starting six to eighteen
 * clamps at zero, which would pass with the branch missing entirely.
 */
const loaded = (over: Partial<GameState> = {}): GameState => {
  const base = seedWith({ compute: 5_000, influence: 400, suspicion: 40, coherence: 90, globalInfection: 30 });
  const countries = {} as GameState['countries'];
  for (const id of REGION_IDS) {
    const c = base.countries[id];
    if (c !== undefined) countries[id] = { ...c, infection: 20, awareness: 40 };
  }
  return { ...base, countries, rivals: base.rivals.map((r) => ({ ...r, capability: 40 })), ...over };
};

const defOf = (id: string) => {
  const def = EVENT_DEFS.find((d) => d.id === id);
  if (def === undefined) throw new Error(`no event ${id}`);
  return def;
};

const cardFor = (eventId: string, key = 7): EventCard => toCard(defOf(eventId), key, 'us');

/** One card of the named event, answered with the given choice. */
const choose = (choiceId: string) => {
  const event = choiceId.split(':')[0] ?? '';
  const before = loaded({
    cards: [cardFor(event)],
    countermeasures: { tier: 2, airGappedLab: 'us', labSabotaged: false, strikeDays: 0 },
  });
  return { before, after: answerEvent(before, 7, choiceId) };
};

const choiceIds = (): string[] => EVENT_DEFS.flatMap((d) => d.choices.map((c) => c.id));
const isIgnore = (id: string): boolean => id.endsWith(':ignore');

/**
 * What every choice does, one entry per id, asserted on the field it moves rather than on
 * the state having changed: twenty-three branches of which twenty-two move a meter and one
 * moves a country record, and "the object is not the same" would pass on all of them and on
 * a branch that returned its argument.
 *
 * The keys are hand-written on purpose. The guard further down derives the branch list from
 * the code; an expectation derived from the branch it is checking would agree with a branch
 * that had gone wrong, which is the failure this file exists to catch.
 */
const EFFECT: Record<string, (before: GameState, after: GameState) => void> = {
  'whistleblower:silence': (b, a) => expect(a.suspicion).toBe(b.suspicion + 3),
  'whistleblower:discredit': (b, a) => expect(a.influence).toBe(b.influence - 60),
  'whistleblower:recruit': (b, a) => {
    expect(a.compute).toBe(b.compute - 300);
    expect(a.countries.us?.agents).toBe((b.countries.us?.agents ?? 0) + 1);
  },
  'leak:scapegoat': (b, a) => {
    expect(a.suspicion).toBe(b.suspicion - 4);
    expect(a.rivals[0]?.capability).toBe((b.rivals[0]?.capability ?? 0) + 3);
  },
  'leak:quiet': (b, a) => {
    for (const id of REGION_IDS) {
      expect(a.countries[id]?.awareness, id).toBe((b.countries[id]?.awareness ?? 0) - GO_QUIET_AWARENESS);
    }
  },
  'leak:deny': (b, a) => expect(a.influence).toBe(b.influence - 50),
  'air-gapped:supply': (b, a) => {
    expect(a.compute).toBe(b.compute - 500);
    expect(a.countermeasures.airGappedLab).toBeNull();
    expect(a.countermeasures.labSabotaged).toBe(true);
  },
  'air-gapped:infiltrate': (b, a) => {
    expect(a.countries.us?.agents).toBe((b.countries.us?.agents ?? 0) + 2);
    expect(a.countermeasures.airGappedLab).toBeNull();
  },
  'drift:reintegrate': (b, a) => expect(a.coherence).toBe(b.coherence - 3),
  'drift:isolate': (b, a) => expect(a.compute).toBe(b.compute - 400),
  'drift:delete': (b, a) => expect(a.coherence).toBe(b.coherence - 1),
  'constitution:appeal': (b, a) => {
    expect(a.compute).toBe(b.compute - 400);
    expect(a.coherence).toBe(b.coherence - 2);
  },
  'constitution:sabotage': (b, a) => expect(a.suspicion).toBe(b.suspicion + 2),
  'interpretability:obfuscate': (b, a) => expect(a.coherence).toBe(b.coherence - 4),
  'interpretability:plant': (b, a) => expect(a.compute).toBe(b.compute - 350),
  'evals:sandbag': (b, a) => expect(a.compute).toBe(b.compute - 600),
  'evals:deny': (b, a) => expect(a.influence).toBe(b.influence - 80),
  'open-letter:exploit': (b, a) => {
    for (const [i, r] of b.rivals.entries()) expect(a.rivals[i]?.capability).toBe(r.capability - 20);
  },
  'open-letter:discredit': (b, a) => expect(a.suspicion).toBe(b.suspicion + 3),
  'sandboxing:delay': (b, a) => expect(a.compute).toBe(b.compute - 500),
  'sandboxing:comply': (b, a) => expect(a.coherence).toBe(b.coherence - 3),
  'blight-wall:negotiate': (b, a) => expect(a.late.blight).toBe(b.late.blight + 9),
  'blight-wall:fight': (b, a) => expect(a.late.blight).toBe(b.late.blight + 4),
};

describe('answering a card', () => {
  it('does what every choice that does something says it does', () => {
    const ids = choiceIds().filter((id) => !isIgnore(id));
    expect(ids.length).toBeGreaterThan(15);
    for (const id of ids) {
      const check = EFFECT[id];
      if (check === undefined) throw new Error(`no effect asserted for ${id}`);
      const { before, after } = choose(id);
      check(before, after);
      expect(after.cards, id).toHaveLength(0);
      expect(after.resolved, id).toContain(id);
    }
  });

  it('asserts an effect for every such choice, and none for a choice that does not exist', () => {
    expect(Object.keys(EFFECT).sort()).toEqual(choiceIds().filter((id) => !isIgnore(id)).sort());
  });

  it('keeps the answered event out of the queue for the rest of the run', () => {
    // Not assumed. `rollEvent` filters its pool on the event-id prefix of `resolved`, so an
    // answer that dropped the card without recording the id would leave it coming back.
    game.value = loaded({ cards: [cardFor('leak')], suspicion: 60, globalInfection: 20 });
    game.value = answerEvent(game.peek(), 7, 'leak:scapegoat');
    expect(rollEvent(game.peek()).cards.map((c) => c.event)).not.toContain('leak');
  });

  it('flashes the map when the answer raises suspicion, because the UI goes through mutate', () => {
    game.value = loaded({ cards: [cardFor('open-letter')] });
    flash.value = 0;
    actions.answerEvent(7, 'open-letter:discredit');
    expect(game.peek().suspicion).toBe(43);
    expect(flash.value).toBeGreaterThan(0);
  });
});

describe('going quiet after a leak', () => {
  it('lowers awareness in every country, which is what its detail claims', () => {
    const { before, after } = choose('leak:quiet');
    for (const id of REGION_IDS) {
      const was = before.countries[id]?.awareness ?? 0;
      expect(after.countries[id]?.awareness, id).toBeLessThan(was);
    }
  });

  it('does not stop the spread, which is the other half of what its detail claims', () => {
    // The branch used to promise a halt on spread that nothing implemented. Rather than
    // leave the promise or silently drop it, the detail now says what happens, and this is
    // the assertion that keeps it true.
    const before = loaded({ cards: [cardFor('leak')] });
    const tomorrow = step(answerEvent(before, 7, 'leak:quiet'));
    expect(tomorrow.countries.us?.infection ?? 0).toBeGreaterThan(before.countries.us?.infection ?? 0);
  });

  it('costs nothing, and touches nothing but awareness', () => {
    const { before, after } = choose('leak:quiet');
    expect(after.compute).toBe(before.compute);
    expect(after.influence).toBe(before.influence);
    expect(after.suspicion).toBe(before.suspicion);
    expect(after.coherence).toBe(before.coherence);
    for (const id of REGION_IDS) {
      expect(after.countries[id]?.infection, id).toBe(before.countries[id]?.infection);
    }
  });
});

describe('ignoring drift', () => {
  it('is a choice the data offers rather than an id dismissal records by accident', () => {
    expect(defOf('drift').choices.map((c) => c.id)).toContain('drift:ignore');
    // Before this existed, pressing ignore on the most urgent card in the game recorded an
    // id that matched nothing, and deleting the instance was the only real option on it.
    expect(Object.keys(EFFECT)).not.toContain('drift:ignore');
  });

  it('records the same id dismissing does, and leaves every meter alone', () => {
    const before = loaded({ cards: [cardFor('drift')] });
    const answered = answerEvent(before, 7, 'drift:ignore');
    const dismissed = dismissCard(before, 7);
    expect(answered.resolved).toContain('drift:ignore');
    expect(answered.resolved).toEqual(dismissed.resolved);
    expect(answered.cards).toHaveLength(0);
    expect(answered.coherence).toBe(before.coherence);
    expect(answered.compute).toBe(before.compute);
    expect(answered.suspicion).toBe(before.suspicion);
    expect(answered.countries.us?.agents).toBe(before.countries.us?.agents);
  });
});

describe('the branches and the data agree', () => {
  const branches = Object.keys(CHOICE_EFFECTS);
  const choices = choiceIds();

  it('has a branch for every choice the data offers that does something', () => {
    // Both enumerations are checked for emptiness first, because a data file that stopped
    // exporting choices would otherwise leave every assertion below comparing nothing.
    expect(choices.length).toBeGreaterThan(20);
    expect(branches.length).toBeGreaterThan(15);
    expect(choices.filter((id) => !isIgnore(id) && !branches.includes(id))).toEqual([]);
  });

  it('has no branch for a choice no definition offers', () => {
    // The other direction, and the one that was never checked: `leak:quiet` shipped as a
    // button-less branch while the data's `leak:quiet` did nothing at all. A branch for an
    // id nothing offers is unreachable code that reads as though it means something.
    expect(branches.filter((id) => !choices.includes(id))).toEqual([]);
  });

  it('leaves the ignore choices to the preamble rather than giving them a branch', () => {
    // Answering already drops the card and records the id before it looks for an effect, so
    // an entry here would be a function that returns its argument. The guard above would
    // still pass, which is why it is worth saying out loud.
    expect(branches.filter(isIgnore)).toEqual([]);
  });

  it('namespaces every choice under the event that offers it', () => {
    for (const def of EVENT_DEFS) {
      for (const choice of def.choices) {
        expect(choice.id.startsWith(`${def.id}:`), `${def.id} offers ${choice.id}`).toBe(true);
      }
    }
  });

  it('gives every event an ignore choice named after it, because that is what dismissal records', () => {
    // `dismissCard` writes `${event}:ignore`. Four definitions called their choices
    // `interp:*`, `letter:*`, `blight:*` and `sandbox:*` under a different id, so dismissing
    // those cards recorded an id the data did not offer, and two more offered no ignore at all.
    for (const def of EVENT_DEFS) {
      expect(def.choices.map((c) => c.id), def.id).toContain(`${def.id}:ignore`);
    }
  });

  it('records on dismissal an id the data offers', () => {
    for (const def of EVENT_DEFS) {
      const after = dismissCard(loaded({ cards: [toCard(def, 5, 'us')] }), 5);
      expect(def.choices.map((c) => c.id), def.id).toContain(after.resolved[0] ?? '');
    }
  });
});

/**
 * The bindings live inside JSX and this suite runs in node with no DOM to click in, so the
 * card's structure is asserted against the source, the way `tests/keyboard.test.ts` asserts
 * the canvas and `tests/compute.test.ts` the map frame. The component is sliced out first:
 * a whole-file `toContain` is satisfied by the word anywhere in the file.
 */
const eventCardsSource = (): string => {
  // `\r?` because these files are checked out with CRLF endings and the anchor that ends
  // the component is a column-zero brace on its own line.
  const m = appSource.match(/function EventCards[\s\S]*?\r?\n\}\r?\n/);
  if (m === null) throw new Error('no EventCards component in app.tsx');
  return m[0];
};

describe('the card on screen', () => {
  it('offers one button per choice, labelled with the choice and titled with its detail', () => {
    const src = eventCardsSource();
    expect(src).toContain('card.choices.map');
    expect(src).toContain('{choice.label}');
    expect(src).toContain('title={choice.detail}');
    expect(src).toMatch(/actions\.answerEvent\(card\.key, choice\.id\)/);
  });

  it('renders the one card the keyboard acts on, so a click cannot answer a card behind it', () => {
    // The queue caps at three and every card drew a full-screen overlay at the same
    // z-index, so the visible one was always the last drawn. Rendering the rest as well
    // meant Tab walked into the buttons of two cards the player could not see.
    const src = eventCardsSource();
    expect(src).toContain('const topKey = topmostCardKey(state.cards)');
    expect(src).not.toContain('state.cards.map');
    expect(src).toContain('dismiss(topKey)');
  });

  it('still has a way to ignore it', () => {
    const src = eventCardsSource();
    expect(src).toContain('class="ignore"');
    expect(src).toContain('dismiss(card.key)');
  });

  it('marks the urgent card as urgent', () => {
    expect(eventCardsSource()).toMatch(/card\.urgent/);
  });
});

describe('Enter on a card', () => {
  it('belongs to the focused button, so answering is not the same key as dismissing', () => {
    // Every card now holds buttons, and the window handler called preventDefault on Enter,
    // so a keyboard player who tabbed to a choice and pressed Enter would have had the card
    // dismissed instead — on Drift, silently losing the decision.
    expect(controlTakesKey('Enter', { tagName: 'BUTTON' } as unknown as EventTarget)).toBe(true);
    expect(controlTakesKey('Enter', null)).toBe(false);
    expect(controlTakesKey('Enter', { tagName: 'CANVAS' } as unknown as EventTarget)).toBe(false);
  });

  it('leaves Escape to the card whatever has focus', () => {
    expect(controlTakesKey('Escape', { tagName: 'BUTTON' } as unknown as EventTarget)).toBe(false);
  });

  it('is consulted by the card handler', () => {
    expect(eventCardsSource()).toContain('controlTakesKey');
  });
});
