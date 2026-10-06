/**
 * Where the floating context panel goes.
 *
 * The jam asked for the panel to stop being a bar along the bottom and float over the
 * country the player clicked. That is a layout problem with one constraint nobody can be
 * talked out of: **the panel must not cover the country it is describing.** The obvious
 * reading of "float over the country" — centre the panel on it — does exactly that, so
 * this anchors by edge: the panel's near edge sits a gap away from the country's own
 * on-screen point, on whichever side has more room, and only ever clamps.
 *
 * Pure, and the only copy of these rules. It takes the anchor the map renderer already
 * computed (`labelFor`, which is where a region's screen position lives), the panel's own
 * size, and the area it is allowed to occupy, and returns a position. No DOM and no
 * `window`, which is what lets `tests/anchor.test.ts` sweep thirty regions across a range
 * of window sizes instead of asserting one screenshot's worth.
 */

import type { RegionId } from '../game/data/regions';
import { labelFor, makeProjection } from './map/worldMap';

/**
 * The gap between the anchor and the panel's near edge, and the margin the panel keeps off
 * the edges of the area it may occupy. One number for both because they are the same
 * distance: how close the panel may come to the country, and how close to the screen edge.
 */
export const PANEL_GAP = 14;

/**
 * Below this the panel stops being a panel. When neither side of a country has room for
 * the real width, the width is narrowed to whatever the wider side can give; if even that
 * is under this, the panel stops trying to sit beside the country and stacks below it
 * instead, which is the only placement that can put a panel over its own anchor and the
 * only one where that is the lesser problem.
 */
export const PANEL_MIN_WIDTH = 170;

/**
 * The shortest the stacked panel will shrink to before it would rather cover the country than
 * be a sliver. Below this the panel takes the taller of the two sides and clamps, which on a
 * window this short is the only arrangement left.
 */
export const PANEL_MIN_HEIGHT = 96;

/** How wide the panel is drawn. `tests/styles.test.ts` holds this against the stylesheet. */
export const PANEL_WIDTH = 320;

/**
 * How tall it may get before it scrolls. This is a ceiling rather than a measurement on
 * purpose: a panel that grew with its contents would move every time a country picked up
 * another tag, which is exactly the "the world reflows under the player's cursor" problem
 * the primer was pulled out of the bar for. The content region scrolls past this.
 */
export const PANEL_HEIGHT = 232;

/**
 * The area the panel may occupy: the window minus the three things it must not cover — the
 * top bar and the left rail, and the log column on the right. Only the first two are insets;
 * the log's width is declared below because the anchor test needs to know how much of a
 * narrow window the two columns already take, not because the panel has to stay off them.
 *
 * `--hud` and `--rail` are declared in the stylesheet and `--log` with them;
 * `tests/styles.test.ts` asserts all three against these numbers, so a retune of the layout
 * cannot leave the panel clamping against figures that no longer exist. There is no fourth:
 * `--dock` was the height of a bottom bar that spanned the screen, the log and the panel
 * shared, and it went when the context panel began floating over the country it describes.
 * `styles.css` says in as many words that it is gone, and this comment had been going on
 * describing a bar that is not there.
 */
export const PANEL_INSETS = {
  /** `--hud` in the stylesheet. */
  top: 46,
  /** The log is a column on the right, so the panel may use the right edge. */
  right: 0,
  /**
   * Nothing stands along the bottom. The 150px dock that used to be here held the panel and
   * the log, and the number went with it; the rail runs full height for the same reason.
   */
  bottom: 0,
  /** `--rail` in the stylesheet. */
  left: 186,
  /**
   * The event log's width, `--log` in the stylesheet. Not an inset — the panel may use the
   * right edge — but the anchor test needs it to know how much of a narrow window the two
   * columns already take, and it is declared here so both files hold one number.
   */
  log: 330,
} as const;

export interface AnchorPoint {
  readonly x: number;
  readonly y: number;
}

export interface PanelSize {
  readonly width: number;
  readonly height: number;
}

export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** Which side of the country the panel ended up on. `below` is the stacked fallback. */
export type AnchorSide = 'right' | 'left' | 'below';

export interface PanelPlacement {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly side: AnchorSide;
}

const clamp = (v: number, lo: number, hi: number): number => (hi < lo ? lo : Math.max(lo, Math.min(hi, v)));

/**
 * The top edge for a panel of this height, given where it would rather be.
 *
 * Below the anchor if that fits, above the anchor if it does not, and clamped into the
 * allowed area when neither does — which is the very short window, where the panel is
 * taller than the gap between the bar and the bottom of the window, where there is nowhere
 * to put it and it has to be clamped into whatever band is left.
 */
function fitVertical(anchorY: number, height: number, view: AnchorPoint, insets: Insets): number {
  const floor = insets.top;
  const bottom = view.y - insets.bottom;
  const ceiling = Math.max(floor, bottom - height);
  // Below the anchor, so its top edge sits one gap under it.
  const below = anchorY + PANEL_GAP;
  if (below + height <= bottom) return Math.max(floor, below);
  // Above it: the bottom edge sits one gap over the anchor, so the top is that much higher.
  const above = anchorY - PANEL_GAP - height;
  if (above >= floor) return Math.min(ceiling, above);
  return clamp(below, floor, ceiling);
}

/** How much clear height there is below an anchor, one gap down from it. */
const roomBelow = (anchorY: number, view: AnchorPoint, insets: Insets): number =>
  view.y - insets.bottom - (anchorY + PANEL_GAP);

/** How much clear height there is above an anchor, one gap up from it. */
const roomAbove = (anchorY: number, insets: Insets): number => anchorY - PANEL_GAP - insets.top;

/**
 * The stacked placement: the panel under the anchor rather than beside it, sized so that it
 * still clears the anchor.
 *
 * This is the arm that can put a panel over its own country, so it gives up the other thing
 * it could have given up instead — height. The content scrolls, and a short panel over the
 * bottom of the map is a far smaller problem than a full-height one covering the country the
 * player just clicked. Where even that is not enough room the panel takes the taller of the
 * two and clamps, and the anchor is inside the box: on a 200px-tall window there is no
 * arrangement that does not, and the alternative is a panel off the bottom of the screen.
 */
function stackUnder(anchor: AnchorPoint, panel: PanelSize, view: AnchorPoint, insets: Insets, width: number): PanelPlacement {
  const below = roomBelow(anchor.y, view, insets);
  const above = roomAbove(anchor.y, insets);
  const under = below >= above;
  const room = Math.max(0, Math.floor(under ? below : above));
  const height =
    room >= PANEL_MIN_HEIGHT ? Math.min(panel.height, room) : Math.min(panel.height, Math.max(0, view.y - insets.top - insets.bottom));
  return {
    left: clamp(anchor.x - width / 2, insets.left, Math.max(insets.left, view.x - insets.right - width)),
    top: fitVertical(anchor.y, height, view, insets),
    width,
    height,
    side: 'below',
  };
}

/**
 * Where the panel goes for one anchor.
 *
 * `anchor` is null when nothing is selected, and the panel then goes to the middle of the
 * area rather than nowhere: it is carrying the "click a country to act on it" hint, and a
 * hint at an arbitrary place on screen is worse than one in the middle.
 *
 * Three placements in order of preference. Beside the country, on the side with more room
 * (`right`, `left`) — the anchor-by-edge rule, and what keeps the panel off the country.
 * Then, if neither side can take the real width, the width is narrowed to the wider side's
 * gap rather than allowed to grow back over the country. Then, if even that gap is under
 * `PANEL_MIN_WIDTH`, below the country (`below`) — centred on it and clamped, which is the
 * one placement that can overlap the anchor, and the one where that is the least bad.
 */
export function panelAnchor(
  anchor: AnchorPoint | null,
  panel: PanelSize,
  view: AnchorPoint,
  insets: Insets = PANEL_INSETS,
): PanelPlacement {
  const areaX = Math.max(0, view.x - insets.left - insets.right);
  const areaY = Math.max(0, view.y - insets.top - insets.bottom);
  const height = Math.min(panel.height, areaY);
  const width = Math.floor(Math.min(panel.width, areaX));
  const fit = (left: number, w: number): number =>
    clamp(left, insets.left, Math.max(insets.left, view.x - insets.right - w));

  if (anchor === null) {
    return { left: insets.left + (areaX - width) / 2, top: insets.top + PANEL_GAP, width, height, side: 'below' };
  }

  const rightRoom = view.x - insets.right - (anchor.x + PANEL_GAP);
  const leftRoom = anchor.x - PANEL_GAP - insets.left;
  const fitsRight = rightRoom >= width;
  const fitsLeft = leftRoom >= width;

  if (fitsRight || fitsLeft) {
    const side: AnchorSide = fitsRight && (!fitsLeft || rightRoom >= leftRoom) ? 'right' : 'left';
    return {
      left: fit(side === 'right' ? anchor.x + PANEL_GAP : anchor.x - PANEL_GAP - width, width),
      top: fitVertical(anchor.y, height, view, insets),
      width,
      height,
      side,
    };
  }

  // Neither side fits at full width. Take the wider gap and narrow into it.
  const narrow = Math.floor(Math.max(rightRoom, leftRoom));
  if (narrow >= PANEL_MIN_WIDTH) {
    const side: AnchorSide = rightRoom >= leftRoom ? 'right' : 'left';
    const w = Math.min(narrow, areaX);
    return {
      left: fit(side === 'right' ? anchor.x + PANEL_GAP : anchor.x - PANEL_GAP - w, w),
      top: fitVertical(anchor.y, height, view, insets),
      width: w,
      height,
      side,
    };
  }

  // Nowhere beside it is worth having. Below or above it, sized to clear it.
  return stackUnder(anchor, panel, view, insets, width);
}

/**
 * The on-screen point for a region, out of the projection the renderer uses.
 *
 * A pass-through rather than a second projection: `labelFor` is already where a region's
 * screen position lives, and duplicating the Miller maths here would be a third answer to
 * the same question the moment either was retuned.
 */
export function anchorFor(region: RegionId | null, viewWidth: number, viewHeight: number): AnchorPoint | null {
  if (region === null) return null;
  return labelFor(region, makeProjection(viewWidth, viewHeight));
}