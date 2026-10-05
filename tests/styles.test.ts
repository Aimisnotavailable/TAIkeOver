import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * `var(--nothing)` is not a CSS error. The declaration is dropped, the property falls
 * back to whatever the cascade leaves behind, and the result is a border or colour that
 * is quietly missing rather than a build that fails. Six borders were written against
 * `--line`, which `:root` never declared.
 */
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

describe('stylesheet', () => {
  it('reads the real file rather than an empty stub', () => {
    // Vitest replaces CSS imports with an empty string unless `test.css` is on, so an
    // earlier version of this file imported the stylesheet with `?raw` and passed against
    // `""` — no tokens used, nothing missing, green. Without this the suite cannot tell
    // the difference between a clean stylesheet and no stylesheet at all.
    expect(css).toContain(':root');
  });

  it('defines every custom property it uses', () => {
    const defined = new Set([...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));
    const used = new Set([...css.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]));
    const missing = [...used].filter((v) => !defined.has(v));
    expect(missing).toEqual([]);
  });

  it('has a visible focus style', () => {
    // The theme is near-black and nothing in the stylesheet had ever drawn a focus ring,
    // so a keyboard user could tab to a control and not know it.
    expect(css).toContain(':focus-visible');
  });
});