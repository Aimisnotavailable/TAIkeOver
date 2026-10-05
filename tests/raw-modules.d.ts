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