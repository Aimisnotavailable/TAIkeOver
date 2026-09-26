import { COUNTRIES, type CountryShape } from '../../game/data/countries';
import { REGIONS, type RegionId } from '../../game/data/regions';
import type { RegionState } from '../../game/core/types';

const RAD = Math.PI / 180;
const MILLER_MAX = 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * (84 * RAD)));

export interface Projection {
  readonly width: number;
  readonly height: number;
  x(lon: number): number;
  y(lat: number): number;
}

export function makeProjection(width: number, height: number): Projection {
  const usable = height * 0.94;
  const scaleX = width / 360;
  const scaleY = usable / (MILLER_MAX * 2);
  return {
    width,
    height,
    x: (lon) => (lon + 180) * scaleX,
    y: (lat) => height / 2 - (1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * RAD))) * scaleY,
  };
}

const paths = new Map<string, Path2D>();

function pathFor(country: CountryShape, p: Projection, key: string): Path2D {
  const cached = paths.get(key);
  if (cached !== undefined) return cached;
  const path = new Path2D();
  for (const ring of country.rings) {
    ring.forEach(([lon, lat], i) => {
      const px = p.x(lon);
      const py = p.y(lat);
      if (i === 0) path.moveTo(px, py);
      else path.lineTo(px, py);
    });
    path.closePath();
  }
  paths.set(key, path);
  return path;
}

export const clearProjectionCache = (): void => {
  paths.clear();
};

export type MapPhase = 'expansion' | 'ascension';

const COLD: readonly (readonly [number, string])[] = [
  [0, '#0d1a20'],
  [12, '#123039'],
  [30, '#17546b'],
  [55, '#1f88a8'],
  [78, '#39b7c9'],
  [100, '#7fe6d8'],
];

const HOT: readonly (readonly [number, string])[] = [
  [0, '#1a1206'],
  [15, '#4a2a08'],
  [35, '#8f4a0c'],
  [60, '#d4761a'],
  [82, '#f5a623'],
  [100, '#ffe9a8'],
];

const ramp = (stops: readonly (readonly [number, string])[], value: number): string => {
  const v = Math.max(0, Math.min(100, value));
  let low = stops[0];
  let high = stops[1];
  for (let i = 1; i < stops.length; i++) {
    const previous = stops[i - 1];
    const current = stops[i];
    if (previous === undefined || current === undefined) continue;
    if (v <= current[0]) {
      low = previous;
      high = current;
      break;
    }
    low = current;
    high = current;
  }
  if (low === undefined || high === undefined) return '#000000';
  const span = high[0] - low[0];
  const t = span <= 0 ? 0 : (v - low[0]) / span;
  const a = hexToRgb(low[1]);
  const b = hexToRgb(high[1]);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
};

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

export interface MapFrame {
  regions: Record<RegionId, RegionState>;
  phase: MapPhase;
  selected: RegionId | null;
  hovered: RegionId | null;
  plague: boolean;
  airGapped: RegionId | null;
}

export function drawWorldMap(ctx: CanvasRenderingContext2D, width: number, height: number, frame: MapFrame): void {
  const p = makeProjection(width, height);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#04080a';
  ctx.fillRect(0, 0, width, height);

  const stops = frame.phase === 'ascension' ? HOT : COLD;

  for (const region of REGIONS) {
    const state = frame.regions[region.id];
    const value = frame.phase === 'ascension' ? state.converted : state.control;
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

    if (frame.airGapped === region.id) {
      ctx.strokeStyle = '#ff5a3c';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.stroke(path);
      ctx.setLineDash([]);
    } else if (frame.selected === region.id) {
      ctx.strokeStyle = '#cfe6ee';
      ctx.lineWidth = 1.6;
      ctx.stroke(path);
    } else if (frame.hovered === region.id) {
      ctx.strokeStyle = 'rgba(207,230,238,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke(path);
    }

    if (state.instances > 0 && value < 12) {
      ctx.fillStyle = 'rgba(127,230,216,0.85)';
      ctx.fill(path, 'evenodd');
    }
  }

  if (frame.plague) {
    ctx.fillStyle = 'rgba(255,90,60,0.07)';
    ctx.fillRect(0, 0, width, height);
  }
}

const pointInRing = (px: number, py: number, ring: readonly (readonly [number, number])[], p: Projection): boolean => {
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
  regions: Record<RegionId, RegionState>,
): RegionId | null {
  const p = makeProjection(width, height);
  for (const region of REGIONS) {
    const state = regions[region.id];
    if (state === undefined) continue;
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
