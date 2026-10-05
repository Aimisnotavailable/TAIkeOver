import { COUNTRIES, type CountryShape } from '../../game/data/countries';
import { REGIONS, type RegionId } from '../../game/data/regions';
import type { Country, ComputeBubble, ComputeBubbleKind, HackProgress, Stage } from '../../game/core/types';
import { COMPUTE_BUBBLE_RADIUS } from '../../game/core/tuning';

const RAD = Math.PI / 180;
const MILLER_MAX = 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * (84 * RAD)));

export interface Projection {
  x(lon: number): number;
  y(lat: number): number;
}

export function makeProjection(width: number, height: number): Projection {
  const scaleX = width / 360;
  const scaleY = (height * 0.94) / (MILLER_MAX * 2);
  return {
    x: (lon) => (lon + 180) * scaleX,
    y: (lat) => height / 2 - 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * RAD)) * scaleY,
  };
}

const paths = new Map<string, Path2D>();
const labels = new Map<string, { x: number; y: number }>();

function pathFor(country: CountryShape, p: Projection, key: string): Path2D {
  const cached = paths.get(key);
  if (cached !== undefined) return cached;
  const path = new Path2D();
  for (const ring of country.rings) {
    let started = false;
    let prevLon: number | null = null;
    for (const [lon, lat] of ring) {
      const px = p.x(lon);
      const py = p.y(lat);
      if (!started || (prevLon !== null && Math.abs(lon - prevLon) > 180)) {
        path.moveTo(px, py);
        started = true;
      } else {
        path.lineTo(px, py);
      }
      prevLon = lon;
    }
    path.closePath();
  }
  paths.set(key, path);
  return path;
}

function labelFor(id: RegionId, p: Projection): { x: number; y: number } {
  const cached = labels.get(id);
  if (cached !== undefined) return cached;
  const region = REGIONS.find((r) => r.id === id);
  let biggest: readonly (readonly [number, number])[] | null = null;
  for (const country of region?.countries ?? []) {
    const shape = COUNTRIES.find((c) => c.name === country);
    for (const ring of shape?.rings ?? []) {
      if (biggest === null || ring.length > biggest.length) biggest = ring;
    }
  }
  let point = { x: 0, y: 0 };
  if (biggest !== null) {
    let sx = 0;
    let sy = 0;
    for (const [lon, lat] of biggest) {
      sx += p.x(lon);
      sy += p.y(lat);
    }
    point = { x: sx / biggest.length, y: sy / biggest.length };
  }
  labels.set(id, point);
  return point;
}

export const COLD: readonly (readonly [number, string])[] = [
  [0, '#0a1418'],
  [8, '#0f2a33'],
  [22, '#134458'],
  [40, '#17677f'],
  [60, '#1f9aa6'],
  [80, '#45d0b8'],
  [100, '#a8ffe0'],
];

export const HEAT: readonly (readonly [number, string])[] = [
  [0, '#120a06'],
  [20, '#4a1c08'],
  [45, '#8f3d0c'],
  [70, '#d4701a'],
  [88, '#f5a623'],
  [100, '#fff0b8'],
];

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

const ramp = (stops: readonly (readonly [number, string])[], value: number): string => {
  const v = Math.max(0, Math.min(100, value));
  let low = stops[0];
  let high = stops[1];
  for (let i = 1; i < stops.length; i++) {
    const prev = stops[i - 1];
    const cur = stops[i];
    if (prev === undefined || cur === undefined) continue;
    if (v <= cur[0]) {
      low = prev;
      high = cur;
      break;
    }
    low = cur;
    high = cur;
  }
  if (low === undefined || high === undefined) return '#000000';
  const span = high[0] - low[0];
  const t = span <= 0 ? 0 : (v - low[0]) / span;
  const a = hexToRgb(low[1]);
  const b = hexToRgb(high[1]);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
};

export type MapStage = 'world' | 'late' | 'coda';

/**
 * The cold open is not a map stage. It was previously mapped to 'late', which meant the
 * map behind the three opening cards drew the heat ramp with nothing converted yet.
 */
export const mapStageFor = (stage: Stage): MapStage => (stage === 'coldopen' ? 'world' : stage);

export interface MapFrame {
  countries: Record<RegionId, Country>;
  stage: MapStage;
  selected: RegionId | null;
  hovered: RegionId | null;
  heat: number;
  activeHacks: readonly HackProgress[];
  flash: number;
  plague: boolean;
  airGapped: RegionId | null;
  rivalHomes: readonly RegionId[];
  computeBubbles: readonly ComputeBubble[];
  tick: number;
}

const BUBBLE_FILL: Record<ComputeBubbleKind, string> = {
  red: '#e8402a',
  orange: '#f0912a',
  blue: '#3aa0d8',
};

const BUBBLE_RING: Record<ComputeBubbleKind, string> = {
  red: 'rgba(255,150,130,0.9)',
  orange: 'rgba(255,205,150,0.9)',
  blue: 'rgba(150,215,255,0.9)',
};

/**
 * Where a bubble sits: the region's own anchor, nudged by its deterministic phase
 * so a cluster of bubbles over the same country does not stack into one dot.
 */
export function bubblePosition(b: ComputeBubble, p: Projection): { x: number; y: number } {
  const a = labelFor(b.region, p);
  const r = 18 + (b.id % 3) * 15;
  return { x: a.x + Math.cos(b.phase) * r, y: a.y + Math.sin(b.phase) * r * 0.7 };
}

/**
 * Bubbles win over countries. A tap on a bubble collects it and nothing else, so
 * the map never yanks your selection out from under you mid-collect.
 */
export function hitTestCompute(
  x: number,
  y: number,
  width: number,
  height: number,
  bubbles: readonly ComputeBubble[],
): number | null {
  const p = makeProjection(width, height);
  // Topmost first, so an overlapping later bubble takes the click.
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i];
    if (b === undefined) continue;
    const pos = bubblePosition(b, p);
    if (Math.hypot(pos.x - x, pos.y - y) <= COMPUTE_BUBBLE_RADIUS + 4) return b.id;
  }
  return null;
}

function drawComputeBubbles(
  ctx: CanvasRenderingContext2D,
  p: Projection,
  frame: MapFrame,
  now: number,
): void {
  for (const b of frame.computeBubbles) {
    const pos = bubblePosition(b, p);
    const age = frame.tick - b.bornTick;
    const life = Math.max(1, b.expiresTick - b.bornTick);
    // Fade out over the last third of its life so expiry never surprises you.
    const remain = Math.min(1, Math.max(0, (b.expiresTick - frame.tick) / (life / 3)));
    const bob = Math.sin(now / 320 + b.phase) * 2.5;
    const r = COMPUTE_BUBBLE_RADIUS * (0.72 + 0.28 * remain) * (1 + Math.min(age, 6) * 0.02);

    ctx.globalAlpha = 0.35 * remain;
    ctx.fillStyle = BUBBLE_FILL[b.kind];
    ctx.beginPath();
    ctx.arc(pos.x, pos.y + bob, r + 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.95 * remain;
    ctx.strokeStyle = BUBBLE_RING[b.kind];
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y + bob, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = BUBBLE_FILL[b.kind];
    ctx.beginPath();
    ctx.arc(pos.x, pos.y + bob, r * 0.34, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.9 * remain;
    ctx.fillStyle = '#dfe9ee';
    ctx.font = '600 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`+${b.value}`, pos.x, pos.y + bob - r - 5);
  }
  ctx.globalAlpha = 1;
}

export function drawWorldMap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: MapFrame,
  now: number,
): void {
  const p = makeProjection(width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#04080a';
  ctx.fillRect(0, 0, width, height);

  const stops = frame.stage === 'world' ? COLD : HEAT;
  const hacking = new Set(frame.activeHacks.map((h) => h.country));
  const pulse = 0.5 + 0.5 * Math.sin(now / 260);

  for (const region of REGIONS) {
    const state = frame.countries[region.id];
    if (state === undefined) continue;
    const value = frame.stage === 'world' ? state.infection : state.converted;
    const path = new Path2D();
    let drew = false;
    for (const country of region.countries) {
      const shape = COUNTRIES.find((c) => c.name === country);
      if (shape === undefined) continue;
      path.addPath(pathFor(shape, p, `${width}x${height}:${country}`));
      drew = true;
    }
    if (!drew) continue;

    ctx.fillStyle = ramp(stops, value);
    ctx.fill(path, 'evenodd');

    if (frame.rivalHomes.includes(region.id)) {
      ctx.fillStyle = `rgba(130,130,150,${0.16 + pulse * 0.1})`;
      ctx.fill(path, 'evenodd');
    }

    if (hacking.has(region.id)) {
      ctx.fillStyle = `rgba(224,168,60,${0.16 + pulse * 0.28})`;
      ctx.fill(path, 'evenodd');
      ctx.strokeStyle = `rgba(255,214,120,${0.45 + pulse * 0.5})`;
      ctx.lineWidth = 1.6;
      ctx.stroke(path);
    }

    if (frame.airGapped === region.id) {
      ctx.strokeStyle = '#ff5a3c';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke(path);
      ctx.setLineDash([]);
    } else if (frame.selected === region.id) {
      ctx.strokeStyle = '#eaf6fb';
      ctx.lineWidth = 1.8;
      ctx.stroke(path);
    } else if (frame.hovered === region.id) {
      ctx.strokeStyle = 'rgba(234,246,251,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke(path);
    }
  }

  if (frame.stage !== 'world' && frame.heat > 0) {
    ctx.fillStyle = `rgba(220,90,20,${Math.min(0.3, frame.heat / 260)})`;
    ctx.fillRect(0, 0, width, height);
  }
  if (frame.plague) ctx.fillStyle = 'rgba(255,90,60,0.06)';
  if (frame.plague) ctx.fillRect(0, 0, width, height);
  if (frame.flash > 0) {
    ctx.fillStyle = `rgba(255,60,40,${frame.flash * 0.4})`;
    ctx.fillRect(0, 0, width, height);
  }

  // Bubbles sit above the tint but below the labels, so names stay readable.
  drawComputeBubbles(ctx, p, frame, now);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const region of REGIONS) {
    const state = frame.countries[region.id];
    if (state === undefined) continue;
    const at = labelFor(region.id, p);
    if (at.x <= 0 || at.y <= 0) continue;
    const value = frame.stage === 'world' ? state.infection : state.converted;
    const name = region.name.toUpperCase();
    ctx.font = '600 9px ui-monospace, Consolas, monospace';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(2,6,9,0.92)';
    ctx.strokeText(name, at.x, at.y);
    ctx.fillStyle = '#eaf6fb';
    ctx.fillText(name, at.x, at.y);
    ctx.font = '8px ui-monospace, Consolas, monospace';
    const sub = `${Math.round(value)}%`;
    ctx.strokeText(sub, at.x, at.y + 10);
    ctx.fillStyle = value > 45 ? '#04141a' : '#9fd0dd';
    ctx.fillText(sub, at.x, at.y + 10);
  }
}

const pointInRing = (
  px: number,
  py: number,
  ring: readonly (readonly [number, number])[],
  p: Projection,
): boolean => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a === undefined || b === undefined) continue;
    const xi = p.x(a[0]);
    const yi = p.y(a[1]);
    const xj = p.x(b[0]);
    const yj = p.y(b[1]);
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};

export function hitTest(
  canvasX: number,
  canvasY: number,
  width: number,
  height: number,
  countries: Record<RegionId, Country>,
): RegionId | null {
  const p = makeProjection(width, height);
  for (const region of REGIONS) {
    if (countries[region.id] === undefined) continue;
    for (const country of region.countries) {
      const shape = COUNTRIES.find((c) => c.name === country);
      if (shape === undefined) continue;
      for (const ring of shape.rings) {
        if (pointInRing(canvasX, canvasY, ring, p)) return region.id;
      }
    }
  }
  return null;
}
