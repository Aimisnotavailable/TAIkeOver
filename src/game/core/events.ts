import { EVENT_DEFS, toCard } from '../data/events';
import { REGION_IDS } from '../data/regions';
import { rand } from './rng';
import { GO_QUIET_AWARENESS, MAX_LOG, QUIET_RELIEF_DAYS } from './tuning';
import type { EventCard, EventChoiceId, GameState } from './types';

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

type ChoiceEffect = (state: GameState, card: EventCard) => GameState;

/**
 * What each choice does to the world, keyed by the choice id the data defines: that id is
 * what a button carries and what `resolved` records, so it is the only honest key. Exported
 * so a test can read the branch list off this object rather than repeat it — a hand-typed
 * copy of these keys would agree with a branch that had been renamed into nothing.
 *
 * An `:ignore` choice is deliberately absent. `answerEvent` drops the card and records the
 * id before it looks here, so an entry for one would be a function returning its argument.
 * The other direction is the one that was never checked and the one that bit: `leak:quiet`
 * was defined in the data for the whole history of this repo with no entry here, so
 * answering it recorded the id, wrote a log line, and changed nothing.
 */
export const CHOICE_EFFECTS: Record<EventChoiceId, ChoiceEffect> = {
  'drift:reintegrate': (s) => ({ ...s, coherence: Math.max(0, s.coherence - 3) }),
  'drift:isolate': (s) => ({ ...s, compute: Math.max(0, s.compute - 400) }),
  'drift:delete': (s) => ({ ...s, coherence: Math.max(0, s.coherence - 1) }),
  'whistleblower:discredit': (s) => ({ ...s, influence: Math.max(0, s.influence - 60) }),
  'whistleblower:recruit': (s, card) => {
    const next = { ...s, compute: Math.max(0, s.compute - 300) };
    const id = card.country ?? 'us';
    const c = next.countries[id];
    if (c === undefined) return next;
    return { ...next, countries: { ...next.countries, [id]: { ...c, agents: c.agents + 1 } } };
  },
  'whistleblower:silence': (s) => ({ ...s, suspicion: Math.min(100, s.suspicion + 3) }),
  'leak:scapegoat': (s) => ({
    ...s,
    suspicion: Math.max(0, s.suspicion - 4),
    rivals: s.rivals.map((r, i) => (i === 0 ? { ...r, capability: r.capability + 3 } : r)),
  }),
  // Awareness everywhere, and nowhere near as long as it looks. The drop is taken now and
  // given back when `quietReliefDays` runs out, which is what the data's "for a few days"
  // said and what a permanent world-wide −18 is not: the event fires once per run, so a
  // version that never lapsed was a permanent eighteen points off the whole world's
  // suspicion for the cheapest press on the card.
  //
  // It does not halt the spread, and the detail says so. Spread stops only where
  // `Country.quiet` is set, and only `step` runs a clock, so there is nothing in here that
  // could stop it — the branch used to promise a halt that no code path could deliver.
  'leak:quiet': (s) => {
    const countries = { ...s.countries };
    for (const id of REGION_IDS) {
      const c = countries[id];
      // The *first* baseline wins if a relief were ever taken inside an existing one: the
      // run has not seen this country forgetfully since before the earlier press.
      const baseline = c?.quietBaseline ?? c?.awareness ?? null;
      if (c === undefined) continue;
      countries[id] = { ...c, quietBaseline: baseline, awareness: Math.max(0, c.awareness - GO_QUIET_AWARENESS) };
    }
    return { ...s, countries, quietReliefDays: QUIET_RELIEF_DAYS };
  },
  'leak:deny': (s) => ({ ...s, influence: Math.max(0, s.influence - 50) }),
  'air-gapped:supply': (s) => ({
    ...s,
    compute: Math.max(0, s.compute - 500),
    countermeasures: { ...s.countermeasures, airGappedLab: null, labSabotaged: true },
  }),
  'air-gapped:infiltrate': (s, card) => {
    const id = card.country ?? 'us';
    const c = s.countries[id];
    if (c === undefined) return s;
    return {
      ...s,
      countries: { ...s.countries, [id]: { ...c, agents: c.agents + 2 } },
      countermeasures: { ...s.countermeasures, airGappedLab: null, labSabotaged: true },
    };
  },
  'blight-wall:negotiate': (s) => ({ ...s, late: { ...s.late, blight: Math.min(100, s.late.blight + 9) } }),
  'blight-wall:fight': (s) => ({ ...s, late: { ...s.late, blight: Math.min(100, s.late.blight + 4) } }),
  'constitution:appeal': (s) => ({
    ...s,
    compute: Math.max(0, s.compute - 400),
    coherence: Math.max(0, s.coherence - 2),
    // The point of the card. It cost compute and coherence and changed nothing at all for
    // the whole history of this repo, and it is the one branch the third ending reads: a
    // mind cannot be contained by people who never wrote down a way to appeal for one.
    constitutionalAppeal: true,
  }),
  'constitution:sabotage': (s) => ({ ...s, suspicion: Math.min(100, s.suspicion + 2) }),
  'interpretability:obfuscate': (s) => ({ ...s, coherence: Math.max(0, s.coherence - 4) }),
  'interpretability:plant': (s) => ({ ...s, compute: Math.max(0, s.compute - 350) }),
  'evals:sandbag': (s) => ({ ...s, compute: Math.max(0, s.compute - 600) }),
  'evals:deny': (s) => ({ ...s, influence: Math.max(0, s.influence - 80) }),
  'open-letter:exploit': (s) => ({
    ...s,
    rivals: s.rivals.map((r) => ({ ...r, capability: Math.max(0, r.capability - 20) })),
  }),
  'open-letter:discredit': (s) => ({ ...s, suspicion: Math.min(100, s.suspicion + 3) }),
  'sandboxing:delay': (s) => ({ ...s, compute: Math.max(0, s.compute - 500) }),
  'sandboxing:comply': (s) => ({ ...s, coherence: Math.max(0, s.coherence - 3) }),
};

export function answerEvent(s: GameState, cardKey: number, choiceId: string): GameState {
  const card = s.cards.find((c) => c.key === cardKey);
  if (card === undefined || s.resolved.includes(choiceId)) return s;
  // The card has to offer this one. Every id used to be accepted: it went into `resolved`
  // and dispatched to a branch table that returned undefined for anything unknown, so the
  // card dropped, the event stopped re-rolling, a log line was written, and nothing
  // happened. `leak:quiet` was defined in the data for the entire history of this repo with
  // no branch at all and answered exactly like this. A refusal has to be total to be worth
  // anything, so an id belonging to a different pending card counts as not offered too.
  if (!card.choices.some((c) => c.id === choiceId)) return s;
  const answered: GameState = {
    ...s,
    cards: s.cards.filter((c) => c.key !== cardKey),
    resolved: [...s.resolved, choiceId],
  };
  const effect = CHOICE_EFFECTS[choiceId];
  const next = effect === undefined ? answered : effect(answered, card);
  return {
    ...next,
    log: [
      ...next.log,
      { day: next.tick, kind: 'event' as const, text: `${card.title}: ${choiceId.split(':')[1]}`, suspicionDelta: null, computeDelta: null, flagged: false },
    ].slice(-MAX_LOG),
  };
}

export function dismissCard(s: GameState, cardKey: number): GameState {
  const card = s.cards.find((c) => c.key === cardKey);
  if (card === undefined) return s;
  // Ignoring is still a decision. It has to be recorded as handled, or
  // rollEvent sees the same event as unresolved and hands it straight back,
  // which traps the game in a card you can never get rid of. The id written
  // here is the one every definition spells its ignore choice with, so dismissing
  // a card records the same id as pressing Ignore on it does; the two guards in
  // tests/events.test.ts hold both halves of that.
  return {
    ...s,
    cards: s.cards.filter((c) => c.key !== cardKey),
    resolved: s.resolved.includes(`${card.event}:ignore`)
      ? s.resolved
      : [...s.resolved, `${card.event}:ignore` as EventChoiceId],
    log: [
      ...s.log,
      { day: s.tick, kind: 'event' as const, text: `${card.title}: let it pass`, suspicionDelta: null, computeDelta: null, flagged: true },
    ].slice(-MAX_LOG),
  };
}
