import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * `var(--nothing)` is not a CSS error. The declaration is dropped, the property falls
 * back to whatever the cascade leaves behind, and the result is a border or colour that
 * is quietly missing rather than a build that fails. Six borders were written against
 * `--line`, which `:root` never declared.
 */
const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

/**
 * The declarations of one rule, or null if the stylesheet has no rule for that selector.
 * Comments are stripped from the selector before comparing: half this file explains itself
 * above the rule it explains, and a comment there made `.sr-only` resolve to null — which
 * reads exactly like a rule that was never written.
 */
const ruleBody = (selector: string): string | null => {
  for (const part of css.split('}')) {
    const brace = part.indexOf('{');
    if (brace < 0) continue;
    if (part.slice(0, brace).replace(/\/\*[\s\S]*?\*\//g, '').trim() === selector) return part.slice(brace + 1);
  }
  return null;
};

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

  it('draws the focus ring where it can be seen against what it has to find', () => {
    // `--edge-bright` is every button's own border colour, so a ring in it reads as part
    // of the control and is separated from it only by the 2px offset; on this near-black
    // palette it also lands near 2:1, under the 3:1 SC 1.4.11 asks of a focus indicator.
    // The canvas is the opposite case and keeps the brightest ink on screen.
    expect(ruleBody(':focus-visible')).toContain('var(--ink)');
    expect(ruleBody(':focus-visible')).not.toContain('--edge-bright');
    expect(ruleBody('canvas:focus-visible')).toContain('var(--ink-bright)');
  });

  it('hides the live region it gives the context bar', () => {
    // The class name is the whole mechanism: a `sr-only` with no rule beside it renders
    // its text as a visible line of type in the middle of the map's bottom bar, and the
    // announcement becomes something everyone reads and nobody needs.
    const rule = ruleBody('.sr-only');
    expect(rule).not.toBeNull();
    expect(rule).toContain('position: absolute');
    expect(rule).toContain('overflow: hidden');
    // Clipping or a zero-size box; both are accepted ways to do it and the test should not
    // care which one a future edit picks.
    expect(rule).toMatch(/clip(-path)?:/);
    expect(rule).toMatch(/width:\s*1px/);
    expect(rule).toMatch(/height:\s*1px/);
  });

  it('draws the pending-decisions bar above the card it describes', () => {
    // That bar exists to say the world is still moving while a card is up, and `.overlay`
    // is a fixed full-viewport scrim at z-index 30. The bar sat at 25, so the one piece
    // of text explaining the interaction was the one thing the interaction hid.
    const z = (selector: string): number => Number(/z-index:\s*(\d+)/.exec(ruleBody(selector) ?? '')?.[1] ?? -1);
    expect(ruleBody('.paused-bar')).not.toBeNull();
    expect(z('.paused-bar')).toBeGreaterThan(z('.overlay'));
  });
});
