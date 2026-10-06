import { describe, expect, it } from 'vitest';
import {
  anchorFor,
  PANEL_GAP,
  PANEL_HEIGHT,
  PANEL_INSETS,
  PANEL_MIN_WIDTH,
  PANEL_WIDTH,
  panelAnchor,
  type AnchorPoint,
  type PanelPlacement,
} from '../src/ui/anchor';
import { labelFor, makeProjection } from '../src/ui/map/worldMap';
import { REGION_IDS } from '../src/game/data/regions';
import panelSource from '../src/ui/components/panels.tsx?raw';
import appSource from '../src/ui/app.tsx?raw';

const W = 1440;
const H = 900;
const PANEL = { width: PANEL_WIDTH, height: PANEL_HEIGHT };
const VIEW = { x: W, y: H };
const NONE = { top: 0, right: 0, bottom: 0, left: 0 };

/** Windows from a phone held sideways to a large desktop, including the very short one. */
const SIZES: readonly (readonly [number, number])[] = [
  [320, 480],
  [480, 320],
  [640, 480],
  [800, 600],
  [1024, 768],
  [1280, 800],
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
  [1440, 200],
  [900, 140],
];

const isFinitePlacement = (p: PanelPlacement): boolean =>
  Number.isFinite(p.left) && Number.isFinite(p.top) && Number.isFinite(p.width) && Number.isFinite(p.height);

/**
 * A tenth of a pixel. The projection is logarithmic in latitude, so an anchor is a
 * fractional pixel that the panel's own arithmetic then adds and subtracts the gap to and
 * from; `top - PANEL_GAP` and `anchor.y` are the same number in exact arithmetic and differ
 * in the fifteenth decimal in practice. Every gap assertion below is made against this
 * rather than against equality, which would be asserting the floating point rather than the
 * geometry.
 */
const EPS = 1e-6;

describe('the panel stays inside the area it is allowed', () => {
  it('for every region, at every window size, with and without the fixed panels', () => {
    // Swept rather than sampled. The clamp has three arms — beside left, beside right,
    // stacked below — and the arm a country lands in depends on where it happens to be on the
    // map, so a handful of hand-picked cases would pass against a function that was wrong
    // for the other half of the world. `NONE` is the same sweep with the rail, the log and
    // the top bar removed, because a clamp that only holds at the real insets is a clamp
    // that only holds at one window size.
    for (const [w, h] of SIZES) {
      for (const id of REGION_IDS) {
        const anchor = anchorFor(id, w, h);
        if (anchor === null) throw new Error(`no anchor for ${id}`);
        for (const insets of [PANEL_INSETS, NONE]) {
          const p = panelAnchor(anchor, PANEL, { x: w, y: h }, insets);
          const where = `${id} at ${w}x${h} insets ${insets.left}/${insets.right}`;
          expect(isFinitePlacement(p), where).toBe(true);
          expect(p.width, where).toBeLessThanOrEqual(w);
          expect(p.height, where).toBeLessThanOrEqual(h);
          expect(p.width, where).toBeGreaterThan(0);
          // Inside the allowed box on both axes, with the screen edge reachable only
          // through the clamp — which is what `clamp` guarantees when the box is degenerate.
          expect(p.left, where).toBeGreaterThanOrEqual(Math.min(insets.left, w));
          expect(p.top, where).toBeGreaterThanOrEqual(Math.min(insets.top, h));
          expect(p.left + p.width, where).toBeLessThanOrEqual(Math.max(w - insets.right, insets.left));
          expect(p.top + p.height, where).toBeLessThanOrEqual(Math.max(h - insets.bottom, insets.top));
        }
      }
    }
  });

  it('and does not go off the top when the anchor is above the top bar', () => {
    // A country in the far north on a short window lands above the top bar. The panel goes
    // above its anchor only if that fits under the bar, and clamps to the bar's own bottom
    // edge otherwise, which is the whole of the very-short-window case.
    for (const h of [200, 300, 140]) {
      for (const anchor of [{ x: 700, y: 4 }, { x: 200, y: -20 }, { x: 1400, y: 60 }]) {
        const p = panelAnchor(anchor, PANEL, { x: W, y: h });
        expect(isFinitePlacement(p), JSON.stringify(anchor)).toBe(true);
        expect(p.top).toBeGreaterThanOrEqual(PANEL_INSETS.top);
        expect(p.top + p.height).toBeLessThanOrEqual(h - PANEL_INSETS.bottom);
      }
    }
  });
});

describe('the panel never covers the country it is describing', () => {
  it('keeps a gap between the anchor and its own near edge', () => {
    // The whole reason this does not centre the panel. The anchor point is outside the
    // panel's box: the country is a polygon and this is its label point, but a panel drawn
    // over the point is a panel drawn over the country.
    //
    // The gap is exact wherever a gap placement was geometrically possible, and on the
    // windows where it was not the panel sits flush against the nearer edge instead — a
    // 232px panel either side of a country 122px down a 480px window has nowhere to go, and
    // `fitVertical` clamps rather than leave the screen. Whether a placement was possible is
    // recomputed here from the constants rather than read off the function, so this is the
    // contract rather than the implementation restated.
    for (const [w, h] of SIZES) {
      const top = PANEL_INSETS.top;
      const bottom = h - PANEL_INSETS.bottom;
      for (const id of REGION_IDS) {
        const anchor = anchorFor(id, w, h);
        if (anchor === null) throw new Error(`no anchor for ${id}`);
        const p = panelAnchor(anchor, PANEL, { x: w, y: h });
        const where = `${id} at ${w}x${h} side ${p.side}`;
        const insideX = anchor.x >= p.left && anchor.x <= p.left + p.width;
        const insideY = anchor.y >= p.top && anchor.y <= p.top + p.height;
        // The invariant, on every window in the sweep: the anchor is never inside the box.
        expect(insideX && insideY, where).toBe(false);
        // Horizontal, on whichever side was chosen.
        if (p.side === 'right') expect(p.left, where).toBeGreaterThanOrEqual(anchor.x + PANEL_GAP - EPS);
        if (p.side === 'left') expect(p.left + p.width, where).toBeLessThanOrEqual(anchor.x - PANEL_GAP + EPS);
        // Vertical, where there was room for a gap to be kept.
        if (anchor.y + PANEL_GAP + p.height <= bottom + EPS || anchor.y - PANEL_GAP - p.height >= top - EPS) {
          // The full gap, vertically, in whichever arm placed it: below the anchor or above it.
          expect(
            anchor.y <= p.top - PANEL_GAP + EPS || anchor.y >= p.top + p.height + PANEL_GAP - EPS,
            `${where} (area ${bottom - top}px)`,
          ).toBe(true);
        }
        if (p.side === 'below') {
          // The stacked arm gives up height rather than covering the country, and this is
          // that claim: it shrinks to the clear space above or below the anchor rather than
          // taking `PANEL_HEIGHT` and landing on top of it.
          const room = Math.max(
            anchor.y - PANEL_GAP - top,
            bottom - (anchor.y + PANEL_GAP),
          );
          expect(p.height, where).toBeLessThanOrEqual(Math.max(room, 0) + EPS);
        }
      }
    }
  });

  it('narrows rather than growing over the country when a side is too narrow', () => {
    // A panel wider than the gap between the country's edges will sit on top of its own
    // anchor if it is allowed to keep its width, so the width goes instead.
    const anchor = { x: 500, y: 400 };
    for (const w of [700, 620, 560]) {
      const p = panelAnchor(anchor, PANEL, { x: w, y: H });
      const room = Math.max(w - PANEL_INSETS.right - (anchor.x + PANEL_GAP), anchor.x - PANEL_GAP - PANEL_INSETS.left);
      expect(p.width, `window ${w}`).toBeLessThanOrEqual(Math.max(room, 0));
      expect(anchor.x >= p.left && anchor.x <= p.left + p.width, `window ${w}`).toBe(false);
    }
  });

  it('stacks below only once beside is genuinely not worth having', () => {
    // The threshold is the whole of the third arm: beside a country with two hundred pixels
    // to one side is worth having, and it narrows the panel rather than stacking.
    expect(panelAnchor({ x: 640, y: 400 }, PANEL, VIEW).side).toBe('right');
    // The two edges of the threshold, a pixel apart, built from the constants so a retune of
    // either moves them together. The anchor is placed with `room` pixels between the rail's
    // edge and itself, and the window is sized to leave one pixel less than that on its
    // right — so neither side takes a full-width panel, the left has marginally more room, and
    // the decision is between narrowing into the room and stacking below the country.
    const bothSides = (room: number): { anchor: AnchorPoint; view: AnchorPoint } => {
      const x = PANEL_INSETS.left + PANEL_GAP + room;
      return { anchor: { x, y: 400 }, view: { x: x + PANEL_GAP + room - 1, y: H } };
    };
    const narrows = bothSides(PANEL_MIN_WIDTH + 1);
    const narrowed = panelAnchor(narrows.anchor, PANEL, narrows.view);
    expect(narrowed.side).toBe('left');
    expect(narrowed.width).toBe(PANEL_MIN_WIDTH + 1);
    expect(narrowed.width).toBeLessThan(PANEL_WIDTH);
    // And the panel's right edge is still clear of the country, which is what narrowing was for.
    expect(narrows.anchor.x).toBeGreaterThanOrEqual(narrowed.left + narrowed.width + PANEL_GAP);

    const stacks = bothSides(PANEL_MIN_WIDTH - 1);
    expect(panelAnchor(stacks.anchor, PANEL, stacks.view).side).toBe('below');
  });
});

describe('picking a side', () => {
  it('goes to whichever side has more room', () => {
    // Not "always right": a country hard against the right edge has most of its room on the
    // left, and a panel pinned to the right edge there would be one clamp away from hanging
    // off the screen.
    const h = 900;
    expect(panelAnchor({ x: 700, y: 400 }, PANEL, { x: 1440, y: h }).side).toBe('right');
    expect(panelAnchor({ x: 1300, y: 400 }, PANEL, { x: 1440, y: h }).side).toBe('left');
    // And at the mirror point of the allowed area, which is not the middle of the screen:
    // the rail takes 186px on the left and nothing on the right.
    const mid = (PANEL_INSETS.left + (1440 - PANEL_INSETS.right)) / 2;
    expect(panelAnchor({ x: mid - 4, y: 400 }, PANEL, { x: 1440, y: h }).side).toBe('right');
    expect(panelAnchor({ x: mid + 4, y: 400 }, PANEL, { x: 1440, y: h }).side).toBe('left');
  });

  it('prefers below when nothing is selected, in the middle of the area', () => {
    // The panel is carrying the "click a country" hint in this state, so it goes somewhere
    // deliberate rather than not at all. Midpoint of the allowed box, one gap under the bar.
    const p = panelAnchor(null, PANEL, VIEW);
    expect(p.side).toBe('below');
    expect(p.top).toBe(PANEL_INSETS.top + PANEL_GAP);
    expect(p.left).toBeCloseTo(PANEL_INSETS.left + (VIEW.x - PANEL_INSETS.left - PANEL_INSETS.right - p.width) / 2);
    expect(p.width).toBe(PANEL_WIDTH);
  });
});

describe('the anchor comes from the renderer rather than a second projection', () => {
  it('is the same point the map draws the label at', () => {
    for (const id of REGION_IDS) {
      const a = anchorFor(id, W, H);
      const b = labelFor(id, makeProjection(W, H));
      if (a === null) throw new Error(`no anchor for ${id}`);
      expect(a.x, id).toBe(b.x);
      expect(a.y, id).toBe(b.y);
    }
    expect(anchorFor(null, W, H)).toBeNull();
  });

  it('moves when the window does, because the cache is keyed on the projection', () => {
    // `labelFor` cached on the region alone, so every label — and every bubble anchored to
    // one — was drawn at the coordinates of whatever window size first asked for it, and
    // stayed there through a resize. The panel reads the same cache, so without the size in
    // the key it would point at the pre-resize position of the country.
    const small = makeProjection(800, 600);
    const large = makeProjection(1920, 1080);
    for (const id of REGION_IDS) {
      const atSmall = anchorFor(id, 800, 600);
      const atLarge = anchorFor(id, 1920, 1080);
      if (atSmall === null || atLarge === null) throw new Error(`no anchor for ${id}`);
      // Not just "different" — each is where a fresh projection of that size puts it, which
      // is what a cache keyed on the region alone cannot be after two different windows.
      expect(atSmall.x, id).toBe(labelFor(id, small).x);
      expect(atLarge.x, id).toBe(labelFor(id, large).x);
      expect(`${atSmall.x},${atSmall.y}`, id).not.toBe(`${atLarge.x},${atLarge.y}`);
    }
  });
});

describe('the panel does not take the keyboard away from the map', () => {
  it('is placed with inline geometry and nothing that moves focus or the page', () => {
    // Selection moves with ArrowLeft/ArrowRight on the canvas, so the panel repositions on
    // every press. A panel that called `focus()` would pull the caret off the canvas and
    // strand the player there, and anything that scrolled would move the map under the
    // arrow keys. This is asserted against the source because there is no DOM in this suite
    // and the arrow-key step is `stepRegion`, tested in `tests/keyboard.test.ts`.
    const component = panelSource.match(/export function ContextPanel[\s\S]*?\r?\n}\r?\n/);
    if (component === null) throw new Error('no ContextPanel component in panels.tsx');
    const body = component[0];
    expect(body).toContain('panelAnchor(');
    expect(body).toContain('anchorFor(id, view.w, view.h)');
    expect(body).not.toMatch(/\.focus\(|scrollIntoView|window\.scroll|tabIndex|autoFocus/);
    // The two attributes that would make it a focus trap of its own.
    expect(body).not.toMatch(/role="dialog"|aria-modal/);
    // And it is not in the key path: it registers no handler, so it cannot eat an arrow key
    // the map is using.
    expect(body).not.toContain('addEventListener');
  });

  it('is anchored to the same window size the canvas is drawn at', () => {
    // Two resize listeners, one per component, would eventually disagree — and a panel
    // anchored to a stale size is a panel pointing at the wrong country. `useWindowSize` in
    // the shell feeds both, and the canvas has no listener of its own any more.
    expect(appSource).toMatch(/function useWindowSize\(\)/);
    const map = appSource.match(/function Map\([\s\S]*?\r?\n}\r?\n/);
    if (map === null) throw new Error('no Map component in app.tsx');
    expect(map[0]).not.toContain("addEventListener('resize'");
    expect(appSource).toContain('<Map state={state} size={size} />');
    expect(appSource).toContain('<ContextPanel state={state} view={size} />');
    // And it waits for a measurement: `panelAnchor` clamps into the allowed area, and there
    // is no allowed area at zero.
    expect(appSource).toMatch(/size\.w > 0 && <ContextPanel/);
  });
});