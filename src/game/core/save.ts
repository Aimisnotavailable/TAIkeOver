import { REGION_IDS } from '../data/regions';
import { createInitialState } from './state';
import { DIFFICULTIES, SAVE_EVERY_DAYS } from './tuning';
import type { DifficultyId, GameState } from './types';

/**
 * A run in progress, serialisable and nothing else.
 *
 * `GameState` is one immutable object and `step` is pure, so the whole of a run is that
 * object plus the seed and difficulty it was made with — all three of which are already
 * fields of the state itself. They are lifted into the envelope anyway, and `parseSave`
 * refuses a payload where the envelope and the state disagree, because the envelope is what
 * a person (or a future migration) reads first and an envelope that lies about the run under
 * it is worse than no envelope.
 *
 * `SAVE_VERSION` exists for one reason: to make a stale payload a thing that can be refused
 * rather than parsed. A version this game has never written is not a run, it is somebody
 * else's JSON in our key.
 */
export const SAVE_VERSION = 1;

export interface SaveEnvelope {
  readonly version: number;
  readonly seed: number;
  readonly difficulty: DifficultyId;
  readonly state: GameState;
}

/**
 * The shape a payload's `state` has to have, read off a real one rather than written out.
 *
 * A hand-typed list of field names is a second description of `GameState` that stops being
 * true the moment a field is added, and it fails in the direction that matters: the new field
 * would be missing from a restored run and nothing would say so. Building the shape from
 * `createInitialState` means the check is the state itself.
 *
 * Three kinds, treated differently on purpose. Arrays and objects are checked for their kind
 * only, because their contents are the simulation's business and a partial check there would
 * be a guess. Scalars are checked by type, which is what catches a truncated or hand-edited
 * number. And a field that is `null` in the shape — `outcomeReason`, `quietBaseline`,
 * `late.ending` — is only required to be *present*: its type is not knowable from an empty
 * value, and the day it has one, the run has been through a card or an ending that is not
 * empty.
 */
const SHAPE: GameState = createInitialState(0, 'default');

/** Every region has to be in `countries`: the map and the rail both iterate all thirty. */
const isGameState = (value: unknown): value is GameState => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(SHAPE) as (keyof GameState)[]) {
    const expected = SHAPE[key];
    const actual = record[key];
    if (actual === undefined) return false;
    if (expected === null) continue;
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual)) return false;
    } else if (typeof expected === 'object') {
      if (typeof actual !== 'object' || actual === null || Array.isArray(actual)) return false;
    } else if (typeof actual !== typeof expected) {
      return false;
    }
  }
  const countries = record.countries;
  if (typeof countries !== 'object' || countries === null) return false;
  const byId = countries as Record<string, unknown>;
  return REGION_IDS.every((id) => typeof byId[id] === 'object' && byId[id] !== null);
};

/** The payload for a run, as the string that goes into storage. */
export function serializeSave(state: GameState): string {
  return JSON.stringify({
    version: SAVE_VERSION,
    seed: state.seed,
    difficulty: state.difficulty,
    state,
  });
}

/**
 * A payload back into a run, or null if it is not one.
 *
 * Every failure path returns null rather than throwing: the input is a string out of
 * `localStorage` that any other tab, any earlier build, or a curious player can put there,
 * and a run that cannot be read has to be a run that starts over rather than a white screen.
 */
export function parseSave(raw: string | null | undefined): SaveEnvelope | null {
  if (typeof raw !== 'string' || raw === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const envelope = parsed as Partial<SaveEnvelope>;
  if (envelope.version !== SAVE_VERSION) return null;
  if (typeof envelope.seed !== 'number' || !Number.isFinite(envelope.seed)) return null;
  if (typeof envelope.difficulty !== 'string' || !(envelope.difficulty in DIFFICULTIES)) return null;
  if (!isGameState(envelope.state)) return null;
  // The state carries both of these too, and they have to be the same numbers.
  if (envelope.state.seed !== envelope.seed) return null;
  if (envelope.state.difficulty !== envelope.difficulty) return null;
  return {
    version: SAVE_VERSION,
    seed: envelope.seed,
    difficulty: envelope.difficulty,
    state: envelope.state,
  };
}

/**
 * Whether a payload is a run worth putting back in front of a player.
 *
 * The cold open is the one stage that is refused. It is three text cards and a world at day
 * zero, it is not a run, and restoring it would replace the launch screen — content warnings,
 * difficulty, the whole thing — with cards the player has already read. Everything else is
 * fair: a finished run restores to its end screen, which is what the player last saw.
 */
export const restorableRun = (state: GameState): boolean => state.stage !== 'coldopen';

/**
 * Whether the tick that just happened is one of the automatic save points.
 *
 * Every `SAVE_EVERY_DAYS` days rather than every day, because the payload is the whole state
 * and at 8x a day is 875ms — saving on every one of them is eight serialisations a second of
 * a blob nobody is waiting on. The cadence is a multiple rather than a comparison against a
 * remembered day so that a run cannot skip it: a saved tick is always a multiple of it.
 *
 * Day zero is excluded on purpose. It is the same state `createInitialState` returns, and
 * the run is written the moment the player leaves the cold open.
 */
export const saveDue = (state: GameState, everyDays: number = SAVE_EVERY_DAYS): boolean =>
  state.tick > 0 && everyDays > 0 && state.tick % everyDays === 0;

