import { describe, expect, it } from 'vitest';
import { stepRegion } from '../src/ui/app';
import { closesEvolve } from '../src/ui/components/panels';
import { REGION_IDS } from '../src/game/data/regions';
import appSource from '../src/ui/app.tsx?raw';

/**
 * The bindings live in component bodies, and this suite runs in the node environment
 * with no DOM to press a key in, so the parts that are pure are tested directly and the
 * parts that are JSX are asserted against the source text. That is the same trade
 * `tests/compute.test.ts` makes about the map frame.
 */

/**
 * The canvas opening tag, sliced out of the file. Assertions about tabindex, role and
 * aria-label have to be scoped to it: a bare `toContain` over the whole file is
 * satisfied by any element anywhere that has an aria-label, so all four attributes could
 * move onto a wrapper <div> and the map could go back to being mouse-only with every
 * assertion still green. Non-greedy up to the first `/>`, which is the end of the tag
 * because nothing inside a handler contains a slash-then-close.
 */
const canvasTag = (): string => {
  const m = appSource.match(/<canvas\b[\s\S]*?\/>/);
  if (m === null) throw new Error('no self-closing <canvas> in app.tsx');
  return m[0];
};

describe('stepping the selection with the arrow keys', () => {
  const first = REGION_IDS[0];
  const second = REGION_IDS[1];
  const last = REGION_IDS[REGION_IDS.length - 1];
  if (first === undefined || second === undefined || last === undefined) throw new Error('no regions');

  it('moves one region forward and back', () => {
    expect(stepRegion(first, 1)).toBe(second);
    expect(stepRegion(second, -1)).toBe(first);
  });

  it('wraps past the end and before the start', () => {
    expect(stepRegion(last, 1)).toBe(first);
    expect(stepRegion(first, -1)).toBe(last);
  });

  it('enters the list from either end when nothing is selected', () => {
    expect(stepRegion(null, 1)).toBe(first);
    expect(stepRegion(null, -1)).toBe(last);
  });

  it('treats a zero step as no step at all', () => {
    // Two cases, not one: with a region selected this returns it unchanged, and folding
    // a zero delta into the "nothing selected" branch sent an unselected map to the far
    // end of the ring. The caller guards against zero, but this is exported.
    expect(stepRegion(null, 0)).toBeNull();
    expect(stepRegion('japan', 0)).toBe('japan');
  });
});

describe('the trait tree', () => {
  it('closes on Escape and leaves Tab to the browser', () => {
    expect(closesEvolve('Escape')).toBe(true);
    // Tab used to close it too, with preventDefault, so Tab never moved focus: a player
    // could open the tree with E and then reach not one trait button or group header.
    expect(closesEvolve('Tab')).toBe(false);
    // Enter belongs to whatever button has focus, and Space cycles the speed.
    expect(closesEvolve('Enter')).toBe(false);
    expect(closesEvolve(' ')).toBe(false);
  });
});

describe('the keyboard floor', () => {
  it('no longer eats Tab to open the upgrade screen', () => {
    // Tolerant of spacing on purpose. A formatting-exact string pass is silently
    // disarmed by the first prettier run that changes `if (e.key === 'Tab'` to
    // `if (e.key==='Tab'`, which leaves the defect in place and the test green.
    expect(appSource).not.toMatch(/if\s*\(\s*e\.key\s*===\s*'Tab'\s*&&\s*!\s*evolving\.value/);
    expect(appSource).toMatch(/if\s*\(\s*e\.key\.toLowerCase\(\)\s*===\s*'e'\s*&&/);
  });

  it('leaves Space to the speed control alone', () => {
    expect(appSource).not.toMatch(
      /e\.key\s*===\s*'Enter'\s*\|\|\s*e\.key\s*===\s*'Escape'\s*\|\|\s*e\.key\s*===\s*' '/,
    );
    expect(appSource).toMatch(/if\s*\(\s*e\.key\s*===\s*'Enter'\s*\|\|\s*e\.key\s*===\s*'Escape'\s*\)\s*\{/);
  });

  it('makes the map itself focusable and reachable with the arrows', () => {
    const tag = canvasTag();
    expect(tag).toContain('tabIndex={0}');
    expect(tag).toContain('role="application"');
    expect(tag).toMatch(/aria-label="[^"]+"/);
    expect(tag).toContain('onKeyDown');
    expect(tag).toContain('ArrowLeft');
    expect(tag).toContain('ArrowRight');
    expect(tag).toContain('actions.select(stepRegion(');
  });
});
