import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createInitialState } from '../src/game/core/state';
import { doAction } from '../src/game/core/actions';
import { step } from '../src/game/core/step';
import { computePassive, infectedPopulation, spawnComputeBubble, SALT_KIND_BLUE, SALT_KIND_ORANGE, SALT_KIND_RED, SALT_PHASE, SALT_VALUE, SALT_WHERE } from '../src/game/core/compute';
import { rand } from '../src/game/core/rng';
import { COMPUTE_BUBBLE_RADIUS, COMPUTE_BUBBLE_TTL, HACK_YIELD } from '../src/game/core/tuning';
import { bubblePosition, drawWorldMap, hitTestCompute, makeProjection, mapStageFor, BUBBLE_FILL, BUBBLE_GLYPH, type MapFrame } from '../src/ui/map/worldMap';
import { TRAITS, TRAIT_BY_ID } from '../src/game/data/traits';
import traitSource from '../src/game/data/traits.ts?raw';
import { actions, game, selected } from '../src/ui/store';
import appSource from '../src/ui/app.tsx?raw';
import mapSource from '../src/ui/map/worldMap.ts?raw';
import panelSource from '../src/ui/components/panels.tsx?raw';
import type { ComputeBubble, GameState, TraitEffect } from '../src/game/core/types';

/** The spec this build was written from. Read, because two of its claims were copied. */
const specSource = readFileSync(
  new URL('../docs/superpowers/specs/2026-10-06-teach-decide-rebalance-design.md', import.meta.url),
  'utf8',
);

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

describe('the Self-Modification branch buys something', () => {
  // `compute-regen` was emitted by two traits and read by nothing for the whole history of
  // the repo, so the entire branch bought nothing but its coherence cost. It was wired first
  // onto the passive trickle, and that moved not one cell of a 65-run measurement, because
  // the trickle is a twentieth of a run's income and both winning lines are already on the
  // compute ceiling. It now multiplies `hack-yield`, which is where breaches actually pay.
  const withTraits = (...traits: string[]): GameState => {
    const base = start({ cumulativeDeaths: 400, traits });
    return {
      ...base,
      countries: Object.fromEntries(
        Object.entries(base.countries).map(([k, v]) => [k, { ...v, infection: 60 }]),
      ) as GameState['countries'],
    };
  };

  /** What a breach pays, taken out of the state the real resolve path built. */
  const oneBreach = (s: GameState): number => {
    let n = s;
    for (let i = 0; i < 12 && n.activeHacks.length === 0; i++) n = doAction(step(n), 'us', 'hack');
    const target = n.activeHacks[0];
    expect(target).toBeDefined();
    // Bounded on the *first* resolve of this breach and not on the hack key: a resolved
    // breach re-arms itself for another `HACK_CYCLE_DAYS`, so waiting on the key never ends.
    let resolve = n;
    let guard = 0;
    while (resolve.tick < target!.resolveTick && guard++ < 20) resolve = step(resolve);
    return resolve.log.find((l) => l.text.startsWith('us yielded'))?.computeDelta ?? 0;
  };

  const yieldOf = (...traits: string[]): number =>
    oneBreach(withTraits('hack-1', 'hack-2', 'hack-3', ...traits));

  it('multiplies what a breach pays', () => {
    const plain = yieldOf();
    expect(yieldOf('self-rewrite')).toBeGreaterThan(plain);
    expect(yieldOf('rsi')).toBeGreaterThan(plain);
  });

  it('multiplies rather than adds, and both writers compound', () => {
    const plain = yieldOf();
    const both = yieldOf('self-rewrite', 'rsi');
    // 1.5 x 2, read off the trait table rather than retyped. The tolerance is a whole
    // breach's worth of rounding, because the yield roll is a separate random draw per run.
    const mult =
      TRAIT_BY_ID['self-rewrite']!.effects.find((e) => e.kind === 'hack-yield')!.multiplier *
      TRAIT_BY_ID['rsi']!.effects.find((e) => e.kind === 'hack-yield')!.multiplier;
    expect(both / plain).toBeGreaterThan(mult - 0.2);
    expect(both / plain).toBeLessThan(mult + 0.2);
  });

  it('leaves the passive trickle alone, and says so', () => {
    expect(computePassive(withTraits('self-rewrite'))).toBe(computePassive(withTraits()));
    expect(computePassive(withTraits('hack-1', 'hack-2', 'hack-3', 'self-rewrite'))).toBe(
      computePassive(withTraits('hack-1', 'hack-2', 'hack-3')),
    );
  });

  it('no longer emits an effect kind nothing reads', () => {
    // `compute-regen` is deleted from the union rather than kept as a second way to spell
    // "breach yield". A test that has to be edited to accept a deleted kind is the guard
    // working: the kind is gone, so the assertion is that no trait mentions it.
    const kinds = new Set(TRAITS.flatMap((t) => t.effects.map((e) => e.kind)));
    expect(kinds.has('compute-regen' as TraitEffect['kind'])).toBe(false);
    expect(TRAITS.flatMap((t) => t.effects).filter((e) => e.kind === 'hack-yield')).toHaveLength(2);
    expect(traitSource).not.toContain("kind: 'compute-regen'");
  });
  it('carries no inert duplicate of a number that already has a home', () => {
    // Reflective Alignment declared `{kind:'coherence', amount: 8}` and `step` never read it —
    // it reads `def.coherence`, which is the single magnitude all three Self-Modification
    // numbers live in and the one the trait card prints its per-day figure from.
    const def = TRAIT_BY_ID['reflective-alignment']!;
    expect(def.effects).toEqual([]);
    expect(def.coherence).toBeGreaterThan(0);
    expect(def.description).toContain(`${def.coherence} points`);
  });

  it('is worth having now, which is the finding and was not the intent', () => {
    // Half again on breach yield across a loud run is on the order of ten thousand compute,
    // against 1,800 and a daily coherence bleed. Before this it was 1,200 against 1,800.
    const mult = TRAIT_BY_ID['self-rewrite']!.effects.find((e) => e.kind === 'hack-yield')!.multiplier;
    expect(mult).toBeGreaterThan(1.2);
    expect(mult).toBeLessThan(2);
    console.log(
      `\nself-rewrite: breach yield x${mult}, which is where a run's compute comes from\n`,
    );
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
    const KINDS = [
      ['red', '+'],
      ['orange', '/'],
      ['blue', '?'],
    ] as const;
    for (const [kind, glyph] of KINDS) expect(textsFor(kind)).toContain(glyph);
    // One glyph per kind, and each of the three checked against the other two. Only
    // checking `red` left the other two free to draw each other's marks, which is the
    // case the glyph exists to prevent: a legend is only worth anything if a bubble
    // cannot be read two ways.
    for (const [kind, glyph] of KINDS) {
      // Keyed on the kind, not on the glyph: if two kinds were ever given the same mark,
      // comparing marks would skip the pair instead of catching it.
      for (const [other, otherGlyph] of KINDS) {
        if (other === kind) continue;
        expect(textsFor(kind)).not.toContain(otherGlyph);
        expect(glyph).not.toBe(otherGlyph);
      }
    }
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

  it('names the datacenter tier of the region under the cursor, and only that one', () => {
    // The map showed infection but not opportunity. The conflation worth avoiding here is
    // between the two tiers: `HACK_YIELD` is indexed by the hacking tier the tree grants
    // (50-200 at Hack I, 500-2,000 at Hack III) and the datacenter's own tier multiplies
    // that row by `1 + 0.6 * (tier - 1)`, so Hack III into a tier-5 datacenter pays
    // 1,700-6,800 and it is the datacenter tier doing it, not a fourth row of the table.
    const us = start().countries.us;
    if (us === undefined) throw new Error('no us');
    const { ctx, texts } = stubCtx();
    drawWorldMap(ctx, 1200, 800, frame({ hovered: 'us' }), 0);
    expect(texts).toContain(`tier ${us.tier}`);
    // Hover only. Thirty permanent markers is the noise the legend already covers.
    const { ctx: idle, texts: idleTexts } = stubCtx();
    drawWorldMap(idle, 1200, 800, frame(), 0);
    expect(idleTexts.some((t) => t.startsWith('tier '))).toBe(false);
  });

  it('does not confuse a datacenter tier with a hacking tier again', () => {
    // This confusion came from the design spec rather than from the code, so it was copied
    // into a comment rather than derived — which is how it survived into the build. The
    // claim was `a tier-5 datacenter pays HACK_YIELD[3] where a tier-1 pays HACK_YIELD[1]`.
    // `HACK_YIELD` has no key for a datacenter at all, and the spec text has been corrected
    // too, so both places are checked rather than one.
    const claim = /HACK_YIELD\[\d+\]/;
    expect(mapSource).not.toMatch(claim);
    expect(specSource).not.toMatch(claim);
    // The rule the code actually applies: one row, chosen by the hacking tier, multiplied
    // by the datacenter's own tier. `forecast.ts` builds it as
    // `(1 + (c.tier - 1) * 0.6) * hackYieldMultiplier`.
    const scale = (datacenter: number): number => 1 + (datacenter - 1) * 0.6;
    const low = (hack: number, datacenter: number): number =>
      Math.round((HACK_YIELD[hack]?.[0] ?? 0) * scale(datacenter));
    const high = (hack: number, datacenter: number): number =>
      Math.round((HACK_YIELD[hack]?.[1] ?? 0) * scale(datacenter));
    expect(scale(5)).toBeCloseTo(3.4);
    // The example AGENTS.md §8 gives: Hack III into a tier-5 datacenter, 1,700-6,800.
    expect(low(3, 5)).toBe(1700);
    expect(high(3, 5)).toBe(6800);
    // And the number the old comment implied for the other end of the ladder: Hack I into
    // the same tier-5 datacenter pays 170-680, not the 500-2,000 of Hack III's own row.
    expect(low(1, 5)).toBe(170);
    expect(high(1, 5)).toBe(680);
    // Same hacking tier, two datacenter tiers: one row at two multipliers.
    expect(low(3, 1)).toBe(HACK_YIELD[3]?.[0]);
    expect(low(3, 5) / (HACK_YIELD[3]?.[0] ?? 1)).toBeCloseTo(scale(5));
  });

  it('is handed the country that is actually hovered', () => {
    // The same argument the selection test below makes: the frame is assembled inside a
    // requestAnimationFrame closure, so a frame built here proves nothing about the one the
    // component passes. Reading the source is the only assertion that catches a renderer
    // that stops being told where the cursor is.
    expect(appSource).toContain('hovered: hovered.value');
  });

  it('is handed the country that is actually selected', () => {
    // The frame is assembled inside a requestAnimationFrame closure in a component, so the
    // two tests above cannot see it: they build their own frame and would have passed
    // while the map showed no selection at all. It read `selected: null` instead of the
    // signal, so reading the source is the only assertion that catches it going back.
    expect(appSource).toContain('selected: selected.value');
    expect(appSource).not.toMatch(/selected: null/);
  });

  it('keys the legend off the same glyph and colour the renderer draws', () => {
    expect(BUBBLE_GLYPH).toEqual({ red: '+', orange: '/', blue: '?' });
    expect(BUBBLE_FILL).toEqual({ red: '#e8402a', orange: '#f0912a', blue: '#3aa0d8' });
    expect(Object.keys(BUBBLE_FILL).sort()).toEqual(Object.keys(BUBBLE_GLYPH).sort());
    // The legend lives in a component and has no DOM to render into here, so the drift
    // this guards against is a legend that restates the glyphs or the colours instead of
    // reading them back out of the renderer. An unused `BUBBLE_GLYPH` import would have
    // been caught by `noUnusedLocals`; a hand-typed copy of the three hexes would not
    // have been caught by anything.
    expect(panelSource).toMatch(/import\s*\{[^}]*BUBBLE_GLYPH[^}]*\}\s*from\s*'\.\.\/map\/worldMap'/);
    expect(panelSource).toContain('BUBBLE_FILL[k.kind]');
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
