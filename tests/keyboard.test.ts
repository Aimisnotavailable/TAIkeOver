import { describe, expect, it } from 'vitest';
import { stepRegion } from '../src/ui/app';
import { REGION_IDS } from '../src/game/data/regions';
import appSource from '../src/ui/app.tsx?raw';

/**
 * The bindings live in component bodies, and this suite runs in the node environment
 * with no DOM to press a key in, so the parts that are pure are tested directly and the
 * parts that are JSX are asserted against the source text. That is the same trade
 * `tests/compute.test.ts` makes about the map frame.
 */
describe('stepping the selection with the arrow keys', () => {
  const first = REGION_IDS[0];
  const last = REGION_IDS[REGION_IDS.length - 1];
  const second = REGION_IDS[1];
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
});

describe('the keyboard floor', () => {
  it('no longer eats Tab to open the upgrade screen', () => {
    // Matched on the whole branch rather than on `Tab`, because the Evolve component
    // still binds Tab to close: a bare `.not.toContain('Tab')` would forbid the key
    // everywhere instead of only forbidding it here.
    expect(appSource).not.toContain("if (e.key === 'Tab' && !evolving.value");
    expect(appSource).toContain("e.key.toLowerCase() === 'e'");
  });

  it('leaves Space to the speed control alone', () => {
    // The card handler used to dismiss on Space as well as on Enter and Escape, so one
    // press both dismissed the card and changed the speed.
    expect(appSource).not.toContain("e.key === 'Enter' || e.key === 'Escape' || e.key === ' '");
    expect(appSource).toContain("if (e.key === 'Enter' || e.key === 'Escape') {");
  });

  it('makes the map itself focusable and reachable with the arrows', () => {
    expect(appSource).toContain('tabIndex={0}');
    expect(appSource).toContain('role="application"');
    expect(appSource).toContain('aria-label=');
    expect(appSource).toContain('ArrowLeft');
    expect(appSource).toContain('ArrowRight');
    expect(appSource).toContain('actions.select(stepRegion(');
  });
});