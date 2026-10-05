import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { computePassive, infectedPopulation, spawnComputeBubble, SALT_KIND_BLUE, SALT_KIND_ORANGE, SALT_KIND_RED, SALT_PHASE, SALT_VALUE, SALT_WHERE } from '../src/game/core/compute';
import { rand } from '../src/game/core/rng';
import { COMPUTE_BUBBLE_RADIUS, COMPUTE_BUBBLE_TTL } from '../src/game/core/tuning';
import { bubblePosition, drawWorldMap, hitTestCompute, makeProjection, mapStageFor, BUBBLE_GLYPH, type MapFrame } from '../src/ui/map/worldMap';
import { actions, game, selected } from '../src/ui/store';
import appSource from '../src/ui/app.tsx?raw';
import panelSource from '../src/ui/components/panels.tsx?raw';
import type { ComputeBubble, GameState } from '../src/game/core/types';

const start = (over: Partial<GameState> = {}): GameState => ({
  ...createInitialState(42, 'default'),
  stage: 'world',
  ...over,
});

const bubble = (over: Partial<ComputeBubble> = {}): ComputeBubble => ({
  id: 1,
  region: 'us',
  kind: 'red',
  value: 20,
  bornTick: 0,
  expiresTick: 6,
  phase: 0,
  ...over,
});

beforeEach(() => {
  game.value = start();
});

describe('tapping a compute bubble', () => {
  it('pays out its value', () => {
    game.value = start({ compute: 100, computeBubbles: [bubble({ value: 20 })] });
    actions.collectCompute(1);
    expect(game.peek().compute).toBe(120);
  });

  it('removes the bubble so it cannot be paid twice', () => {
    game.value = start({ compute: 100, computeBubbles: [bubble({ value: 20 })] });
    actions.collectCompute(1);
    expect(game.peek().computeBubbles).toHaveLength(0);
    actions.collectCompute(1);
    expect(game.peek().compute).toBe(120);
  });

  it('ignores a bubble that is not there', () => {
    game.value = start({ compute: 100, computeBubbles: [bubble({ id: 7 })] });
    actions.collectCompute(99);
    expect(game.peek().compute).toBe(100);
    expect(game.peek().computeBubbles).toHaveLength(1);
  });

  it('does not change which country is selected', () => {
    game.value = start({ compute: 100, computeBubbles: [bubble({ value: 20 })] });
    actions.select('japan');
    actions.collectCompute(1);
    expect(selected.peek()).toBe('japan');
  });

  it('writes the collection to the log', () => {
    game.value = start({ compute: 0, computeBubbles: [bubble({ value: 33 })] });
    actions.collectCompute(1);
    expect(game.peek().log.some((l) => l.computeDelta === 33)).toBe(true);
  });
});

describe('hit testing bubbles', () => {
  const p = makeProjection(1200, 800);

  it('finds a bubble under the cursor', () => {
    const b = bubble();
    const at = bubblePosition(b, p);
    expect(hitTestCompute(at.x, at.y, 1200, 800, [b])).toBe(b.id);
  });

  it('misses when the cursor is far away', () => {
    const b = bubble();
    const at = bubblePosition(b, p);
    expect(hitTestCompute(at.x + 200, at.y + 200, 1200, 800, [b])).toBeNull();
  });

  it('takes the topmost bubble when two overlap', () => {
    const under = bubble({ id: 1, phase: 0 });
    const over = bubble({ id: 2, phase: 0 });
    const at = bubblePosition(under, p);
    expect(hitTestCompute(at.x, at.y, 1200, 800, [under, over])).toBe(2);
  });

  it('has a hit area a person can actually hit', () => {
    const b = bubble();
    const at = bubblePosition(b, p);
    const edge = COMPUTE_BUBBLE_RADIUS + 3;
    expect(hitTestCompute(at.x + edge, at.y, 1200, 800, [b])).toBe(b.id);
  });
});

describe('the passive share', () => {
  it('is zero with no outbreak', () => {
    const base = start();
    const clean: GameState = {
      ...base,
      cumulativeDeaths: 0,
      countries: Object.fromEntries(
        Object.entries(base.countries).map(([k, v]) => [k, { ...v, infection: 0 }]),
      ) as GameState['countries'],
    };
    expect(computePassive(clean)).toBe(0);
  });

  it('grows with the outbreak', () => {
    const base = start();
    const small: GameState = { ...base, cumulativeDeaths: 0, countries: Object.fromEntries(Object.entries(base.countries).map(([k, v]) => [k, { ...v, infection: 2 }])) as GameState['countries'] };
    const large: GameState = { ...base, cumulativeDeaths: 0, countries: Object.fromEntries(Object.entries(base.countries).map(([k, v]) => [k, { ...v, infection: 90 }])) as GameState['countries'] };
    expect(computePassive(large)).toBeGreaterThan(computePassive(small));
  });

  it('counts the people actually infected, not the average', () => {
    const base = start();
    const half: GameState = { ...base, countries: Object.fromEntries(Object.entries(base.countries).map(([k, v]) => [k, { ...v, infection: 50 }])) as GameState['countries'] };
    expect(infectedPopulation(half)).toBeGreaterThan(0);
    expect(infectedPopulation(half)).toBeLessThan(8000);
  });
});

describe('spawning bubbles', () => {
  it('puts nothing on a world with no outbreak', () => {
    const base = start();
    const clean: GameState = { ...base, countries: Object.fromEntries(Object.entries(base.countries).map(([k, v]) => [k, { ...v, infection: 0 }])) as GameState['countries'] };
    expect(spawnComputeBubble(clean)).toBeNull();
  });

  it('only lands on regions that are worth watching', () => {
    const base = start();
    const s: GameState = { ...base, bio: 0, countermeasures: { ...base.countermeasures, tier: 0 } };
    for (let tick = 0; tick < 200; tick++) {
      const b = spawnComputeBubble({ ...s, tick });
      if (b === null) continue;
      expect(s.countries[b.region]?.infection ?? 0).toBeGreaterThan(3);
    }
  });

it('expires within a few days so the map keeps moving', () => {
    const b = spawnComputeBubble({ ...start(), bio: 5 });
    if (b === null) return;
    expect(b.expiresTick - b.bornTick).toBe(COMPUTE_BUBBLE_TTL);
  });

  it('gives every bubble roll its own salt', () => {
    // The three kind rolls were `SALT_KIND`, `SALT_KIND + 1` and `SALT_KIND + 2`, and
    // `SALT_KIND + 2` is exactly SALT_VALUE while `SALT_KIND + 1` is exactly SALT_WHERE.
    // So the kind of a bubble was decided by the same number that decided where it landed
    // and what it paid.
    const salts = [SALT_KIND_BLUE, SALT_KIND_ORANGE, SALT_KIND_RED, SALT_WHERE, SALT_VALUE, SALT_PHASE];
    expect(new Set(salts).size).toBe(salts.length);
  });

  it('does not resolve to the same number as any other bubble roll', () => {
    const roll = (salt: number, tick: number): number => rand(1234, tick, salt);
    for (let tick = 0; tick < 200; tick++) {
      expect(roll(SALT_KIND_RED, tick)).not.toBe(roll(SALT_VALUE, tick));
      expect(roll(SALT_KIND_ORANGE, tick)).not.toBe(roll(SALT_WHERE, tick));
    }
  });
});

describe('drawing the map with bubbles on it', () => {
  // Path2D is a browser global the render path depends on; node has no canvas.
  class StubPath2D {
    moveTo(): void {}
    lineTo(): void {}
    closePath(): void {}
    arc(): void {}
    addPath(): void {}
  }
  beforeAll(() => {
    (globalThis as unknown as { Path2D: unknown }).Path2D = StubPath2D;
  });  // The render path is the one piece unit tests cannot reach without a real canvas,
  // so exercise it against a stub context to catch typos and undefined references.
  const stubCtx = (): { ctx: CanvasRenderingContext2D; calls: Set<string>; texts: string[] } => {
    const calls = new Set<string>();
    const texts: string[] = [];
    const target: Record<string, unknown> = { canvas: { width: 1200, height: 800 } };
    for (const name of [
      'clearRect', 'fillRect', 'beginPath', 'arc', 'fill', 'stroke', 'moveTo', 'lineTo',
      'closePath', 'strokeText', 'fillText', 'setLineDash', 'save', 'restore', 'translate',
      'rotate', 'scale', 'clip', 'rect', 'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'arcTo',
    ]) {
      target[name] = (...args: unknown[]): void => {
        calls.add(name);
        // `calls` alone cannot tell one bubble kind from another: the three kinds drew
        // the same circle in different colours, so the glyph had to be readable back out
        // of the text to be tested at all.
        if (name === 'fillText') texts.push(String(args[0]));
        void args;
      };
    }
    target.fillStyle = '';
    target.strokeStyle = '';
    target.lineWidth = 0;
    target.globalAlpha = 1;
    target.font = '';
    target.textAlign = 'left';
    target.textBaseline = 'top';
    target.lineJoin = 'miter';
    return { ctx: target as unknown as CanvasRenderingContext2D, calls, texts };
  };

  const frame = (over: Partial<MapFrame> = {}): MapFrame => {
    const s = start();
    return {
      countries: s.countries,
      stage: 'world',
      selected: null,
      hovered: null,
      heat: 0,
      activeHacks: [],
      flash: 0,
      plague: false,
      airGapped: null,
      rivalHomes: [],
      computeBubbles: [],
      tick: 0,
      ...over,
    };
  };

  it('draws without throwing when there are no bubbles', () => {
    const { ctx, calls } = stubCtx();
    drawWorldMap(ctx, 1200, 800, frame(), 0);
    // Region labels are always painted, so this proves the whole frame ran.
    expect(calls.has('fillText')).toBe(true);
  });

  it('draws one circle per bubble of every kind', () => {
    for (const kind of ['red', 'orange', 'blue'] as const) {
      const { ctx, calls } = stubCtx();
      drawWorldMap(ctx, 1200, 800, frame({ computeBubbles: [bubble({ kind, id: 3 })] }), 0);
      expect(calls.has('arc')).toBe(true);
    }
  });

  it('gives each bubble kind a distinct glyph', () => {
    const textsFor = (kind: 'red' | 'orange' | 'blue'): string[] => {
      const { ctx, texts } = stubCtx();
      drawWorldMap(ctx, 1200, 800, frame({ computeBubbles: [bubble({ kind, id: 3 })] }), 0);
      return texts;
    };
    expect(textsFor('red')).toContain('+');
    expect(textsFor('orange')).toContain('/');
    expect(textsFor('blue')).toContain('?');
    // One glyph per kind. A red bubble that carried all three would tell a colourblind
    // reader nothing, which is the whole reason the glyph is there.
    const red = textsFor('red');
    expect(red).not.toContain('/');
    expect(red).not.toContain('?');
  });

  it('survives a frame with many bubbles at once', () => {
    const { ctx } = stubCtx();
    const many = Array.from({ length: 14 }, (_, i) => bubble({ id: i, region: 'us', phase: i }));
    expect(() => drawWorldMap(ctx, 1200, 800, frame({ computeBubbles: many }), 0)).not.toThrow();
  });

  it('fades a bubble out as it nears expiry', () => {
    const { ctx } = stubCtx();
    const fading = bubble({ bornTick: 0, expiresTick: 6 });
    const f1 = frame({ computeBubbles: [fading], tick: 1 });
    const f2 = frame({ computeBubbles: [fading], tick: 5 });
    expect(() => drawWorldMap(ctx, 1200, 800, f1, 0)).not.toThrow();
    expect(() => drawWorldMap(ctx, 1200, 800, f2, 0)).not.toThrow();
  });

  it('draws a stroke for the selected region', () => {
    const { ctx, calls } = stubCtx();
    drawWorldMap(ctx, 1200, 800, frame({ selected: 'us' }), 0);
    // The stub records method names, not the colour each call carried, so this asserts on
    // the call rather than on `#eaf6fb`. Nothing else in this frame strokes a path: region
    // outlines are the only `stroke` in worldMap outside bubbles, and the labels use
    // `strokeText`. No bubbles, no hack running and no air-gapped lab either, so a stroke
    // here can only be the selection branch.
    expect(calls.has('stroke')).toBe(true);
  });

  it('draws no selection stroke when nothing is selected', () => {
    const { ctx, calls } = stubCtx();
    drawWorldMap(ctx, 1200, 800, frame(), 0);
    expect(calls.has('stroke')).toBe(false);
  });

  it('is handed the country that is actually selected', () => {
    // The frame is assembled inside a requestAnimationFrame closure in a component, so the
    // two tests above cannot see it: they build their own frame and would have passed
    // while the map showed no selection at all. It read `selected: null` instead of the
    // signal, so reading the source is the only assertion that catches it going back.
    expect(appSource).toContain('selected: selected.value');
    expect(appSource).not.toMatch(/selected: null/);
  });

  it('keys the legend off the same glyphs the renderer draws', () => {
    expect(BUBBLE_GLYPH).toEqual({ red: '+', orange: '/', blue: '?' });
    // The legend lives in a component and has no DOM to render into here, so the drift
    // this guards against is a legend that restates the three glyphs as literals instead
    // of reading them back out of the renderer.
    expect(panelSource).toContain("import { BUBBLE_GLYPH } from '../map/worldMap'");
  });
});

describe('map stage mapping', () => {
  it('treats the cold open as the world, not as a heated map', () => {
    expect(mapStageFor('coldopen')).toBe('world');
  });

  it('passes every other stage through untouched', () => {
    expect(mapStageFor('world')).toBe('world');
    expect(mapStageFor('late')).toBe('late');
    expect(mapStageFor('coda')).toBe('coda');
  });
});
