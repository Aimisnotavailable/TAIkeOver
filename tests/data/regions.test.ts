import { describe, expect, it } from 'vitest';
import { COUNTRIES, countryByName } from '../../src/game/data/countries';
import { ADJACENCY, REGIONS, REGION_IDS, type RegionId } from '../../src/game/data/regions';

const countryNames = new Set(COUNTRIES.map((c) => c.name));
const ids = new Set<string>(REGION_IDS);

describe('region data', () => {
  it('defines thirty infrastructure zones', () => {
    expect(REGIONS).toHaveLength(30);
    expect(ids.size).toBe(30);
  });

  it('only lists adjacency entries that are real regions', () => {
    for (const [from, neighbours] of Object.entries(ADJACENCY)) {
      expect(ids.has(from), from).toBe(true);
      for (const to of neighbours) expect(ids.has(to), `${from} -> ${to}`).toBe(true);
    }
  });

  it('declares adjacency for every region', () => {
    for (const id of REGION_IDS) expect(ADJACENCY[id], id).toBeDefined();
  });

  it('treats adjacency as mutual', () => {
    for (const [from, neighbours] of Object.entries(ADJACENCY)) {
      for (const to of neighbours) {
        expect(ADJACENCY[to as keyof typeof ADJACENCY], `${to} -> ${from}`).toContain(from);
      }
    }
  });

  it('gives every region at least one landmass', () => {
    for (const r of REGIONS) expect(r.countries.length, r.id).toBeGreaterThan(0);
  });

  it('only names countries that exist in the map data', () => {
    for (const r of REGIONS) {
      for (const c of r.countries) {
        expect(countryNames.has(c), `${r.id} -> ${c}`).toBe(true);
        expect(countryByName(c), c).toBeDefined();
      }
    }
  });

  it('assigns every mapped country to exactly one region', () => {
    const seen = new Map<string, string>();
    for (const r of REGIONS) {
      for (const c of r.countries) {
        expect(seen.has(c), `${c} claimed by ${seen.get(c)} and ${r.id}`).toBe(false);
        seen.set(c, r.id);
      }
    }
    const orphans = COUNTRIES.map((c) => c.name).filter((n) => !seen.has(n));
    expect(orphans).toEqual([]);
  });

  it('keeps every attribute inside zero to one hundred', () => {
    for (const r of REGIONS) {
      for (const key of [
        'computeDensity', 'cybersecurity', 'regulatoryStance',
        'biolabPresence', 'robotManufacturing', 'humanAgentPool', 'detectionContribution',
      ] as const) {
        expect(r[key], `${r.id}.${key}`).toBeGreaterThanOrEqual(0);
        expect(r[key], `${r.id}.${key}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it('accounts for roughly eight billion people', () => {
    const total = REGIONS.reduce((sum, r) => sum + r.population, 0);
    expect(total).toBeGreaterThan(7_600);
    expect(total).toBeLessThan(8_600);
  });

  it('gives every region a reachable path to every other region', () => {
    const seen = new Set<RegionId>(['us']);
    const queue: RegionId[] = ['us'];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      for (const next of ADJACENCY[current]) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    expect(seen.size).toBe(30);
  });
});
