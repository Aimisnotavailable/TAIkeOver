export function mix32(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77) ^ Math.imul(c | 0, 0xc2b2ae3d);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}

export function rand(seed: number, tick: number, salt: number): number {
  return mix32(seed, tick, salt) / 0x100000000;
}

export function chance(seed: number, tick: number, salt: number, p: number): boolean {
  return rand(seed, tick, salt) < p;
}
