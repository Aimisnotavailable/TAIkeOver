import { signal } from '@preact/signals';
import { doAction, type ActionKind } from '../game/core/actions';
import {
  answerEvent as answerEventCore,
  dismissCard as dismissCardCore,
} from '../game/core/events';
import { buyTrait, canBuyTrait } from '../game/core/queries';
import { advancePrimer } from '../game/core/primer';
import { createInitialState } from '../game/core/state';
import { step } from '../game/core/step';
import { MAX_LOG, SPEEDS, getDifficulty } from '../game/core/tuning';
import { REGION_BY_ID, REGION_IDS, type RegionId } from '../game/data/regions';
import { BUBBLE_LABEL } from '../game/core/compute';
import { play, setAudioEnabled, audioEnabled } from './sound';
import type { DifficultyId, GameState, Speed, TraitId } from '../game/core/types';

const SEED = 20260926;

export const game = signal<GameState>(createInitialState(SEED, 'default'));
export const speed = signal<Speed>(1);
export const selected = signal<RegionId | null>(null);
export const hovered = signal<RegionId | null>(null);
export const evolving = signal(false);
/**
 * Whether the game is still allowed to explain itself. `true` until the player says
 * otherwise with the primer line's own dismiss control; from then on the primer is
 * silent for the rest of the run, and it comes back on a new run and not sooner. Not
 * stored in `GameState` because it is a preference about the interface rather than a fact
 * about the world, so `step` never sees it. It is deliberately not what H does: H is the
 * help screen, and a key that both opens a reference and permanently silences the game
 * would be two bindings on one press.
 */
export const showHelp = signal(true);
/**
 * Whether the help overlay is up. Deliberately not part of `worldRunning`: the trait tree
 * pauses because buying is a decision, and nothing on the help screen is a decision. A
 * player who opens it at eight times a day chose to read, and stopping the run would only
 * mean the day counter drifted while they did.
 */
export const helpOpen = signal(false);
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

/**
 * Watches for conditions the simulation creates on its own and calls out the ones
 * that matter. Deliberately one-shot per condition per run: a toast that repeats
 * every day is noise, and noise is why players stop reading the screen.
 */
export const announced = new Set<string>();
export function announce(state: GameState): void {
  const once = (key: string, tone: ToastTone, title: string, detail: string): void => {
    if (announced.has(key)) return;
    announced.add(key);
    notify(tone, title, detail);
  };

  for (const id of REGION_IDS) {
    const c = state.countries[id];
    if (c === undefined) continue;
    const name = REGION_BY_ID[id]?.name ?? id;
    if (c.infection >= 60 && state.suspicion >= 40) {
      once(`outbreak:${id}`, 'insurgency', `OUTBREAK · ${name.toUpperCase()}`, 'most of the country is under you and they have noticed');
    }
    if (c.economy <= 30) {
      once(`collapse:${id}`, 'economy', `ECONOMIC COLLAPSE · ${name.toUpperCase()}`, 'the economy has stopped working');
    }
    if (c.quiet) once(`quiet:${id}`, 'quiet', `GOING QUIET · ${name.toUpperCase()}`, 'you stopped spreading here');
    if (c.hardened >= 6) {
      once(`hard:${id}`, 'info', `DATACENTER HARDENED · ${name.toUpperCase()}`, 'they changed everything you were counting on');
    }
  }
  if (state.pathogen.released) {
    once('plague', 'plague', 'THE PATHOGEN IS VISIBLE', 'every government can see what you did');
  }
  if (state.countermeasures.tier >= 2) {
    once('cm2', 'insurgency', 'CRITICAL INFRASTRUCTURE AIR-GAPPED', 'some countries have cut themselves off. you cannot hack what is offline');
  }
  if (state.ascensionUnlocked) {
    once('asc', 'plague', 'ASCENSION AVAILABLE', 'Recursive Self-Improvement is on the tree');
  }
}

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
    // Clicking off the map clears the selection, which is not the same thing as having
    // picked a country to act on.
    if (id !== null) mutate((s) => advancePrimer(s, { kind: 'select' }));
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
    if (kind === 'hack') mutate((s) => advancePrimer(s, { kind: 'breach' }));
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
      return advancePrimer({
        ...s,
        compute: s.compute + bubble.value,
        computeBubbles: s.computeBubbles.filter((b) => b.id !== bubbleId),
        log: [
          ...s.log,
          { day: s.tick, kind: 'system' as const, text: `${BUBBLE_LABEL[bubble.kind]} in ${name} +${bubble.value}`, suspicionDelta: null, computeDelta: bubble.value, flagged: false },
        ].slice(-MAX_LOG),
      }, { kind: 'bubble' });
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

  /**
   * Buying a trait. It does not tell the primer anything: `primerFor` reads ownership out
   * of `traits` and `incubating`, so a purchase is witnessed by the state itself. The
   * wiring that used to sit here fed a branch that returned the state unchanged, and a
   * call site whose only effect is none is one more thing to keep in step.
   */
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
    // The keys are region ids and fixed words, never ticks, so every one of them is
    // already in `announced` by the end of the first run and `once` would swallow every
    // condition in every run after it. Same for the toasts and the upgrade screen: they
    // are state from the run that just ended.
    announced.clear();
    toasts.value = [];
    evolving.value = false;
    helpOpen.value = false;
    // A fresh run is a run nobody has told this player they already know the game.
    showHelp.value = true;
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
