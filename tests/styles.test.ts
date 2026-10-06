import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import panelSource from '../src/ui/components/panels.tsx?raw';

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

  it('draws the primer over the map rather than as a modal', () => {
    // `.overlay` is what "modal" means in this stylesheet: `position: fixed; inset: 0`
    // behind a scrim. The primer must not be one of those — a tutorial that covers the
    // world is the defect, not the fix — and it must not be `fixed` either, or it would
    // stop being a floating line over the map and start being a second top bar.
    expect(ruleBody('.primer')).not.toBeNull();
    expect(ruleBody('.primer')).not.toContain('position: fixed');
    expect(ruleBody('.primer')).not.toContain('inset: 0');
    expect(ruleBody('.primer')).not.toContain('z-index');
  });

  it('takes the primer out of the layout, so no rule keys a size off it', () => {
    // The bar grew from 46px to 78px while the primer line was showing, and five things
    // pinned under it moved 32px down and back. A tutorial line that reflows the screen
    // is worse than the clutter it avoids, so the primer is out of flow and nothing in the
    // stylesheet may be conditioned on whether it is on screen — `priming` anywhere in the
    // file is that defect coming back under a new selector.
    expect(ruleBody('.primer')).toContain('position: absolute');
    expect(css).not.toContain('priming');
    // One declaration of the bar's height and no second one anywhere: a second value, on
    // any selector, is five things that move when it changes.
    const declared = [...css.matchAll(/--hud:\s*(\d+)px/g)].map((m) => m[1]);
    expect(declared).toEqual(['46']);
    expect(ruleBody('.topbar')).toContain('height: var(--hud)');
    for (const selector of ['.side', '.ops', '.paused-bar', '.toasts', '.evolve-btn']) {
      expect(ruleBody(selector), selector).toContain('var(--hud)');
    }
  });

  it('names the bottom dock once, for the bar and the line that floats above it', () => {
    // `.bottom`'s height was written into `.side` and the primer's offset separately, which
    // is how a floating line ends up sitting inside the context bar after one retune. One
    // number, read by everything that has to clear the dock or fill it.
    expect(ruleBody('.game')).toContain('--dock: 150px');
    expect(ruleBody('.bottom')).toContain('height: var(--dock)');
    expect(ruleBody('.side')).toContain('bottom: var(--dock)');
    expect(ruleBody('.primer')).toContain('var(--dock)');
  });

  it('leaves no hardcoded copy of the bar height behind to drift from it', () => {
    expect(css).not.toMatch(/top:\s*(46|52|58)px/);
  });

  it('fits the objective block inside the bar, as the rows and the box add up', () => {
    // Moving the primer out of `--hud` is what allowed a third `.obj-row` to be added, and
    // three rows at 9.5px/1.5 plus two 2px gaps, 4px of padding and two 1px borders came
    // to 57px inside a 46px bar — the block overhung onto the map by ten. Two rows fitted.
    //
    // The total is re-derived from the declarations rather than asserted as a constant,
    // because the defect is arithmetic: any edit to the font, the gap, the padding or the
    // row count brings it back, and a hardcoded "45px" would have passed against any of
    // them. The row count is read out of the component for the same reason.
    const rows = (panelSource.match(/class="obj-row/g) ?? []).length;
    expect(rows).toBe(3);

    const font = /font:\s*\d+\s+([\d.]+)px\/([\d.]+)/.exec(ruleBody('.obj-row') ?? '');
    const hud = /--hud:\s*([\d.]+)px/.exec(ruleBody('.game') ?? '');
    const gap = /gap:\s*([\d.]+)px/.exec(ruleBody('.objective') ?? '');
    const pad = /padding:\s*([\d.]+)px/.exec(ruleBody('.objective') ?? '');
    const border = /border:\s*([\d.]+)px/.exec(ruleBody('.objective') ?? '');
    for (const [what, m] of [['font', font], ['--hud', hud], ['gap', gap], ['padding', pad], ['border', border]] as const) {
      expect(m, `${what} is not declared the way this test reads it`).not.toBeNull();
    }

    const size = Number(font?.[1]);
    const lineHeight = Number(font?.[2]);
    const height =
      rows * size * lineHeight +
      (rows - 1) * Number(gap?.[1]) +
      2 * Number(pad?.[1]) +
      2 * Number(border?.[1]);
    expect(height).toBeLessThanOrEqual(Number(hud?.[1]));
  });

  it('lets the objective block shrink rather than push the bar off a narrow window', () => {
    // The next-goal headline runs to about 500px on a run short of Ascension, and a flex
    // item's automatic minimum size is its content: without `min-width: 0` the block
    // refuses to shrink and takes the clock group off the right edge.
    expect(ruleBody('.hud-mid')).toContain('min-width: 0');
    expect(ruleBody('.objective')).toMatch(/max-width:/);
    // Wrapped, not truncated: the advice line is a sentence and there is nothing to lose.
    expect(ruleBody('.obj-row b')).toContain('overflow-wrap');
    expect(ruleBody('.obj-row b')).not.toContain('text-overflow: ellipsis');
  });

  it('draws the help control differently from the speed buttons it sits between', () => {
    // `?` lives in the row of state buttons beside `|| 1x 2x 4x 8x`. Styled identically it
    // reads as a fourth speed, and it is not one — it opens a reference screen.
    const help = ruleBody('.sp.help-btn');
    expect(help).not.toBeNull();
    expect(help).not.toBe(ruleBody('.sp'));
  });
});
