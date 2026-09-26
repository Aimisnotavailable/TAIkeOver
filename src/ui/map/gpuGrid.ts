import { mix32 } from '../../game/core/rng';

export const GRID_COLS = 500;
export const GRID_ROWS = 400;
export const GRID_CELLS = GRID_COLS * GRID_ROWS;

const IDLE = 0x0f1a1e;
const ACTIVE = 0x1c6b52;
const THINKING = 0x3fa9c9;
const FLAGGED = 0xd94f2b;
const HOT = 0xff7a3c;

const buffer = document.createElement('canvas');
buffer.width = GRID_COLS;
buffer.height = GRID_ROWS;
const bufferCtx = buffer.getContext('2d');

function offscreen(): CanvasRenderingContext2D {
  if (bufferCtx === null) throw new Error('2d context unavailable');
  return bufferCtx;
}
offscreen();

const image = offscreen().createImageData(GRID_COLS, GRID_ROWS);
const pixels = new Uint32Array(image.data.buffer);

export interface GridInput {
  seed: number;
  tick: number;
  activity: number;
  flaggedShare: number;
  breakpoint: boolean;
}

export function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, input: GridInput): void {
  const { seed, tick, activity, flaggedShare, breakpoint } = input;
  const thinking = Math.min(1, Math.max(0, activity));
  const flagged = Math.min(0.02, Math.max(0, flaggedShare));

  for (let i = 0; i < GRID_CELLS; i++) {
    const r = mix32(seed, tick, i) / 0x100000000;
    let colour = IDLE;
    if (r < flagged) colour = FLAGGED;
    else if (r < flagged + thinking * 0.45) colour = THINKING;
    else if (r < flagged + thinking * 0.45 + thinking * 0.4) colour = ACTIVE;
    pixels[i] = colour;
  }

  if (breakpoint) {
    const step = 3;
    for (let y = 0; y < GRID_ROWS; y += step) {
      for (let x = 0; x < GRID_COLS; x += step) {
        if (mix32(seed, tick, x * 7919 + y) % 23 === 0) pixels[y * GRID_COLS + x] = HOT;
      }
    }
  }

  const off = offscreen();
  off.putImageData(image, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(buffer, 0, 0, width, height);
}
