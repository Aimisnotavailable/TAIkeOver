/**
 * Vite's `?raw` suffix hands back a file's contents as a string. This project has no
 * `@types/node`, so a test cannot `readFileSync` without adding a dependency, and the
 * salt invariant in `tests/core/rng.test.ts` needs to read source as text. `?raw` is
 * resolved by Vite at transform time and needs no runtime module at all.
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