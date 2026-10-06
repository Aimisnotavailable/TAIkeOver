/**
 * Vite's `?raw` suffix hands back a file's contents as a string, resolved at transform
 * time and needing no runtime module at all. That suits a test that already knows which
 * file it wants: the salt invariant in `tests/core/rng.test.ts` names its one target and
 * imports it this way. It cannot enumerate, so the guards in `tests/game.test.ts`, which
 * have to walk all of `src/`, read from disk through the `node:fs` declaration below.
 */
declare module '*?raw' {
  const contents: string;
  export default contents;
}

/**
 * Vitest replaces CSS imports with an empty string unless `test.css` is on, so `?raw`
 * on `styles.css` yields `""` rather than the file — a test that greps the stylesheet
 * for undefined custom properties would pass against nothing at all. Reading the file
 * from disk is the only way to see it, and there is no `@types/node` to type that with.
 * Only the functions the tests actually call are declared: `readFileSync` for
 * `tests/styles.test.ts` and the guards in `tests/game.test.ts`, and `readdirSync` so a
 * test can walk a directory rather than list files by hand and quietly stop reading one.
 */
declare module 'node:fs' {
  export function readFileSync(path: string | URL, encoding: 'utf8'): string;
  export interface DirEntry {
    name: string;
    isDirectory(): boolean;
  }
  export function readdirSync(path: string | URL, options: { withFileTypes: true }): DirEntry[];
}