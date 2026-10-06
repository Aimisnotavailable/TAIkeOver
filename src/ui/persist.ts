import { parseSave, restorableRun, serializeSave, type SaveEnvelope } from '../game/core/save';
import type { GameState } from '../game/core/types';

/**
 * Where a run is kept between page loads.
 *
 * `localStorage`, one key, the whole state as JSON — and not IndexedDB, which §14 of the
 * design document promised twice and which was never written. The state is a single JSON blob
 * with no blobs to store, nothing to query and nothing to migrate: IndexedDB would be an
 * async API and a schema for a value that fits in one `setItem`, and it is unavailable in
 * more places (private windows, `file://`, some embedded browsers) rather than fewer.
 *
 * Everything here takes its storage as an argument so the whole module can be exercised in
 * the node test environment, where `localStorage` does not exist. The default is the real one,
 * and it is read once at module load behind a `typeof` guard rather than at each call, because
 * reading it can throw — a blocked origin and Safari's private mode both refuse — and a save
 * that throws on write is a run that dies at the worst moment rather than one that is lost.
 */
export const SAVE_KEY = 'iabed.save.v1';

/** The three calls this makes on `Storage`, so a test can hand it a plain object. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** The browser's storage, or null where there is none to be had. */
const browserStorage = (): StorageLike | null => {
  try {
    const store = (globalThis as { localStorage?: StorageLike }).localStorage;
    return typeof store === 'object' && store !== null ? store : null;
  } catch {
    return null;
  }
};

/**
 * What a run costs to write, in bytes, from a real one.
 *
 * Measured rather than estimated, because the number is the argument for the write cadence:
 * about 20KB at day 240 and 48KB on a nine-hundred-day run with the log at its cap, four
 * fifths of that the log. Kept as a function so a test can hold it and so the figure is never
 * one somebody remembered.
 */
export function saveSize(state: GameState): number {
  return serializeSave(state).length;
}

/**
 * Read a run, or null. A payload that will not parse is removed rather than left in place:
 * it is not going to parse next time either, and a key that keeps failing is a key nobody can
 * tell apart from a bug.
 */
export function readSave(storage: StorageLike | null = browserStorage()): SaveEnvelope | null {
  if (storage === null) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  const envelope = parseSave(raw);
  if (envelope === null) {
    clearSave(storage);
    return null;
  }
  return envelope;
}

/** Write a run. False when there was nowhere to write it or it would not fit. */
export function writeSave(state: GameState, storage: StorageLike | null = browserStorage()): boolean {
  if (storage === null || !restorableRun(state)) return false;
  try {
    storage.setItem(SAVE_KEY, serializeSave(state));
    return true;
  } catch {
    // A full quota, most likely. Losing the ability to save is not a reason to lose the run
    // that is running, so this is a false and not a throw.
    return false;
  }
}

/** Forget the run. Called when a new one starts: the abandoned run is not the next one. */
export function clearSave(storage: StorageLike | null = browserStorage()): void {
  if (storage === null) return;
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do. There is no state this could leave inconsistent that a later write or
    // clear would not fix.
  }
}
