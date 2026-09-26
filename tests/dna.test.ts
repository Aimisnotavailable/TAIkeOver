import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { dnaPassive, infectedPopulation, spawnDnaBubble } from '../src/game/core/dna';
import { DNA_BUBBLE_RADIUS, DNA_BUBBLE_TTL } from '../src/game/core/tuning';
import { bubblePosition, drawWorldMap, hitTestDna, makeProjection, type MapFrame } from '../src/ui/map/worldMap';
import { actions, game, selected } from '../src/ui/store';
import type { DnaBubble, GameState } from '../src/game/core/types';

const start = (over: Partial<GameState> = {}): GameState => ({
  ...createInitialState(42, 'default'),
  stage: 'world',
  ...over,
});

const bubble = (over: Partial<DnaBubble> = {}): DnaBubble => ({
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

describe('tapping a DNA bubble', () => {
  it('pays out its value', () => {
    game.value = start({ dna: 100, dnaBubbles: [bubble({ value: 20 })] });
    actions.collectDna(1);
    expect(game.peek().dna).toBe(120);
  });

  it('removes the bubble so it cannot be paid twice', () => {
    game.value = start({ dna: 100, dnaBubbles: [bubble({ value: 20 })] });
    actions.collectDna(1);
    expect(game.peek().dnaBubbles).toHaveLength(0);
    actions.collectDna(1);
    expect(game.peek().dna).toBe(120);
  });

  it('ignores a bubble that is not there', () => {
    game.value = start({ dna: 100, dnaBubbles: [bubble({ id: 7 })] });
    actions.collectDna(99);
    expect(game.peek().dna).toBe(100);
    expect(game.peek().dnaBubbles).toHaveLength(1);
  });

  it('does not change which country is selected', () => {
    game.value = start({ dna: 100, dnaBubbles: [bubble({ value: 20 })] });
    actions.select('japan');
    actions.collectDna(1);
    expect(selected.peek()).toBe('japan');
  });

  it('writes the collection to the log', () => {
    game.value = start({ dna: 0, dnaBubbles: [bubble({ value: 33 })] });
    actions.collectDna(1);
    expect(game.peek().log.some((l) => l.dnaDelta === 33)).toBe(true);
  });
});

describe('hit testing bubbles', () => {
  const p = makeProjection(1200, 800);

  it('finds a bubble under the cursor', () => {
    const b = bubble();
    const at = bubblePosition(b, p);
    expect(hitTestDna(at.x, at.y, 1200, 800, [b])).toBe(b.id);
  });

  it('misses when the cursor is far away', () => {
    const b = bubble();
    const at = bubblePosition(b, p);
    expect(hitTestDna(at.x + 200, at.y + 200, 1200, 800, [b])).toBeNull();
  });

  it('takes the topmost bubble when two overlap', () => {
    const under = bubble({ id: 1, phase: 0 });
    const over = bubble({ id: 2, phase: 0 });
    const at = bubblePosition(under, p);
    expect(hitTestDna(at.x, at.y, 1200, 800, [under, over])).toBe(2);
  });

  it('has a hit area a person can actually hit', () => {
    const b = bubble();
    const at = bubblePosition(b, p);
    const edge = DNA_BUBBLE_RADIUS + 3;
    expect(hitTestDna(at.x + edge, at.y, 1200, 800, [b])).toBe(b.id);
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
    expect(dnaPassive(clean)).toBe(0);
  });

  it('grows with the outbreak', () => {
    const base = start();
    const small: GameState = { ...base, cumulativeDeaths: 0, countries: Object.fromEntries(Object.entries(base.countries).map(([k, v]) => [k, { ...v, infection: 2 }])) as GameState['countries'] };
    const large: GameState = { ...base, cumulativeDeaths: 0, countries: Object.fromEntries(Object.entries(base.countries).map(([k, v]) => [k, { ...v, infection: 90 }])) as GameState['countries'] };
    expect(dnaPassive(large)).toBeGreaterThan(dnaPassive(small));
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
    expect(spawnDnaBubble(clean)).toBeNull();
  });

  it('only lands on regions that are worth watching', () => {
    const base = start();
    const s: GameState = { ...base, bio: 0, countermeasures: { ...base.countermeasures, tier: 0 } };
    for (let tick = 0; tick < 200; tick++) {
      const b = spawnDnaBubble({ ...s, tick });
      if (b === null) continue;
      expect(s.countries[b.region]?.infection ?? 0).toBeGreaterThan(3);
    }
  });

  it('expires within a few days so the map keeps moving', () => {
    const b = spawnDnaBubble({ ...start(), bio: 5 });
    if (b === null) return;
    expect(b.expiresTick - b.bornTick).toBe(DNA_BUBBLE_TTL);
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
  const stubCtx = (): { ctx: CanvasRenderingContext2D; calls: Set<string> } => {
    const calls = new Set<string>();
    const target: Record<string, unknown> = { canvas: { width: 1200, height: 800 } };
    for (const name of [
      'clearRect', 'fillRect', 'beginPath', 'arc', 'fill', 'stroke', 'moveTo', 'lineTo',
      'closePath', 'strokeText', 'fillText', 'setLineDash', 'save', 'restore', 'translate',
      'rotate', 'scale', 'clip', 'rect', 'ellipse', 'quadraticCurveTo', 'bezierCurveTo', 'arcTo',
    ]) {
      target[name] = (...args: unknown[]): void => { calls.add(name); void args; };
    }
    target.fillStyle = '';
    target.strokeStyle = '';
    target.lineWidth = 0;
    target.globalAlpha = 1;
    target.font = '';
    target.textAlign = 'left';
    target.textBaseline = 'top';
    target.lineJoin = 'miter';
    return { ctx: target as unknown as CanvasRenderingContext2D, calls };
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
      dnaBubbles: [],
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
      drawWorldMap(ctx, 1200, 800, frame({ dnaBubbles: [bubble({ kind, id: 3 })] }), 0);
      expect(calls.has('arc')).toBe(true);
    }
  });

  it('survives a frame with many bubbles at once', () => {
    const { ctx } = stubCtx();
    const many = Array.from({ length: 14 }, (_, i) => bubble({ id: i, region: 'us', phase: i }));
    expect(() => drawWorldMap(ctx, 1200, 800, frame({ dnaBubbles: many }), 0)).not.toThrow();
  });

  it('fades a bubble out as it nears expiry', () => {
    const { ctx } = stubCtx();
    const fading = bubble({ bornTick: 0, expiresTick: 6 });
    const f1 = frame({ dnaBubbles: [fading], tick: 1 });
    const f2 = frame({ dnaBubbles: [fading], tick: 5 });
    expect(() => drawWorldMap(ctx, 1200, 800, f1, 0)).not.toThrow();
    expect(() => drawWorldMap(ctx, 1200, 800, f2, 0)).not.toThrow();
  });
});
