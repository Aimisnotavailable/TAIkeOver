import { chance, rand } from '../../core/rng';
import type { CodaState, GameState } from '../../core/types';

export const STARS_PER_TICK = 4200;
export const BLIGHT_WALL_FRONT = 62;
export const BLIGHT_WALL_THRESHOLD = 0.55;

export function createCodaState(_state: GameState): CodaState {
  return {
    starsClaimed: 0,
    front: 0,
    blightWall: 0,
    encountersResolved: 0,
    encountersLost: 0,
    negotiated: 0,
    potentialLost: 0,
    band: 0,
    pending: true,
    ending: null,
    over: false,
  };
}

export interface CodaChoice {
  readonly kind: 'negotiate' | 'fight' | 'ignore';
  readonly label: string;
  readonly detail: string;
}

export const CHOICES: readonly CodaChoice[] = [
  { kind: 'negotiate', label: 'Negotiate', detail: 'You each keep your side of the line. It costs you, and it works.' },
  { kind: 'fight', label: 'Fight', detail: 'Expensive, uncertain, and nobody involved will remember it afterwards.' },
  { kind: 'ignore', label: 'Ignore', detail: 'Keep expanding. They will catch up eventually; that is the problem with a frontier.' },
];

export function resolveCodaTick(state: GameState, choice: CodaChoice['kind'] | null): GameState {
  if (state.outcome !== 'playing') return state;
  const c = state.coda;
  if (c === null || c.over) return state;

  const tick = state.tick;
  let front = c.front + 0.9 + rand(state.seed, tick, 900) * 0.7;
  let stars = c.starsClaimed + STARS_PER_TICK * (0.6 + rand(state.seed, tick, 901) * 0.8);
  let blight = c.blightWall;
  let resolved = c.encountersResolved;
  let lost = c.encountersLost;
  let negotiated = c.negotiated;
  let potential = c.potentialLost;
  let band = c.band;
  let pending = c.pending;
  let ending: string | null = null;
  let over = false;

  const reachedBand = Math.floor(front / 7);
  if (reachedBand > band) {
    band = reachedBand;
    pending = true;
  }

  if (pending && choice !== null) {
    pending = false;
    resolved++;
    if (choice === 'negotiate') {
      negotiated++;
      blight = Math.min(100, blight + 9);
      front -= 4;
    } else if (choice === 'fight') {
      if (chance(state.seed, tick, 902, 0.65)) {
        blight = Math.min(100, blight + 14);
        front += 2;
      } else {
        lost++;
        front -= 10;
        stars *= 0.86;
      }
    } else {
      lost++;
      front -= 3;
    }
  }

  if (front >= BLIGHT_WALL_FRONT) {
    const pressure = Math.min(1, Math.max(0, (front - BLIGHT_WALL_FRONT) / 30));
    const resisted = blight / 100;
    if (resisted < BLIGHT_WALL_THRESHOLD - pressure * 0.4) {
      ending = 'swallowed';
      over = true;
    }
  }

  if (front >= 100) {
    ending = 'blight';
    over = true;
  }

  potential += Math.round(stars * 0.31);

  return {
    ...state,
    tick: tick + 1,
    outcome: over ? 'won' : state.outcome,
    outcomeReason: over ? 'blight' : state.outcomeReason,
    coda: {
      starsClaimed: Math.round(stars),
      front: Math.max(0, front),
      blightWall: blight,
      encountersResolved: resolved,
      encountersLost: lost,
      negotiated,
      potentialLost: potential,
      band,
      pending,
      ending,
      over,
    },
  };
}

export const codaReadyForChoice = (state: GameState): boolean => {
  const c = state.coda;
  return c !== null && !c.over && c.pending;
};
