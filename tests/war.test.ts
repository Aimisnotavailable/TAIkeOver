import { describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { doAction } from '../src/game/core/actions';
import { whyNot } from '../src/game/core/forecast';
import { step } from '../src/game/core/step';
import { COLLAPSED_THRESHOLD, WAR_KILL_RATE } from '../src/game/core/tuning';
import type { GameState } from '../src/game/core/types';

const start = (over: Partial<GameState> = {}): GameState => ({
  ...createInitialState(42, 'default'),
  stage: 'world',
  ...over,
});

const withTraits = (s: GameState, ...ids: string[]): GameState => ({ ...s, traits: [...s.traits, ...ids] });

const seeded = (infection: number, extra: Partial<GameState['countries']['us']> = {}): GameState => {
  const s = start();
  const us = { ...s.countries.us, infection, ...extra };
  return { ...s, countries: { ...s.countries, us } };
};

describe('insurgency cannot be spammed', () => {
  const ready = (): GameState => seeded(20);

  it('is available once the trait is bought and there is infection', () => {
    const s = withTraits(ready(), 'propaganda-1', 'terrorism');
    expect(whyNot(s, 'us', 'fund-insurgency')).toBeNull();
  });

  it('puts the country at war', () => {
    const s = withTraits(ready(), 'propaganda-1', 'terrorism');
    expect(doAction(s, 'us', 'fund-insurgency').countries.us.atWar).toBe(true);
  });

  // The bug: nothing checked whether the country was already at war, so the button
  // could be pressed forever, each press costing suspicion.
  it('refuses a second war in the same country', () => {
    let s = withTraits(ready(), 'propaganda-1', 'terrorism');
    s = doAction(s, 'us', 'fund-insurgency');
    expect(whyNot(s, 'us', 'fund-insurgency')).toBe('already at war');
  });

  it('does not charge suspicion for a refused second war', () => {
    let s = withTraits(ready(), 'propaganda-1', 'terrorism');
    s = doAction(s, 'us', 'fund-insurgency');
    const after = s.suspicion;
    s = doAction(s, 'us', 'fund-insurgency');
    expect(s.suspicion).toBe(after);
  });

  it('allows a separate war in a different country', () => {
    let s = withTraits(ready(), 'propaganda-1', 'terrorism');
    const brazil = { ...s.countries.brazil, infection: 20 };
    s = { ...s, countries: { ...s.countries, brazil } };
    s = doAction(s, 'us', 'fund-insurgency');
    expect(whyNot(s, 'brazil', 'fund-insurgency')).toBeNull();
  });
});

describe('a war runs without you', () => {
  const atWar = (severity: number, infection = 50): GameState => {
    const s = seeded(infection);
    const us = { ...s.countries.us, atWar: true, warSeverity: severity };
    return { ...s, countries: { ...s.countries, us } };
  };

  it('kills people in the country every day', () => {
    const s = atWar(4);
    expect(step(s).countries.us.population).toBeLessThan(s.countries.us.population);
  });

  it('escalates while it runs', () => {
    let s = atWar(1);
    for (let i = 0; i < 10; i++) s = step(s);
    expect(s.countries.us.warSeverity).toBeGreaterThan(1);
  });

  it('kills more as it escalates', () => {
    const low = step(atWar(1)).countries.us;
    const high = step(atWar(9)).countries.us;
    const base = start().countries.us.population;
    expect(base - high.population).toBeGreaterThan(base - low.population);
  });

  // The approved design: your hold on the country is subtracted from its chance to end.
  it('never calms down while you fully control the country', () => {
    let s = atWar(5, 100);
    for (let i = 0; i < 400; i++) {
      const before = s.countries.us.atWar;
      s = step(s);
      if (before && !s.countries.us.atWar) throw new Error(`war ended on day ${s.tick} at full control`);
      if (s.outcome !== 'playing') break;
    }
    expect(s.countries.us.atWar).toBe(true);
  });

  it('can end once you let the country go', () => {
    let s = atWar(2, 0);
    let ended = false;
    for (let i = 0; i < 400 && !ended; i++) {
      s = step(s);
      ended = !s.countries.us.atWar;
      if (s.outcome !== 'playing') break;
    }
    expect(ended).toBe(true);
  });

  it('leaves a country that is not at war alone', () => {
    const s = seeded(20);
    const after = step(s).countries.us;
    expect(after.warSeverity).toBe(0);
    expect(after.population).toBe(s.countries.us.population);
  });
});

describe('an uncontrolled outbreak kills on its own', () => {
  it('takes people once infection is past the threshold with no pathogen', () => {
    const s = seeded(95);
    expect(step(s).countries.us.population).toBeLessThan(s.countries.us.population);
  });

  it('does nothing below the threshold', () => {
    const s = seeded(50);
    expect(step(s).countries.us.population).toBe(s.countries.us.population);
  });

  it('kills more the hotter it gets', () => {
    const warm = step(seeded(80)).countries.us.population;
    const hot = step(seeded(100)).countries.us.population;
    const base = start().countries.us.population;
    expect(base - hot).toBeGreaterThan(base - warm);
  });
});

describe('go quiet is a toggle, not a trap', () => {
  it('is available while spreading', () => {
    expect(whyNot(seeded(20), 'us', 'go-quiet')).toBeNull();
  });

  // It used to require !country.quiet, which meant one click and no way back, with
  // no label saying it was permanent.
  it('is available again once quiet, so you can go loud', () => {
    const s = doAction(seeded(20), 'us', 'go-quiet');
    expect(s.countries.us.quiet).toBe(true);
    expect(whyNot(s, 'us', 'go-quiet')).toBeNull();
  });

  it('turns the spread back off when you go loud', () => {
    let s = doAction(seeded(20), 'us', 'go-quiet');
    s = doAction(s, 'us', 'go-quiet');
    expect(s.countries.us.quiet).toBe(false);
  });

  it('lowers awareness when hiding and raises it when showing off', () => {
    const before = seeded(20, { awareness: 50 });
    const hidden = doAction(before, 'us', 'go-quiet').countries.us.awareness;
    expect(hidden).toBeLessThan(50);
    const loud = doAction(before, 'us', 'go-quiet');
    const shown = doAction(loud, 'us', 'go-quiet').countries.us.awareness;
    expect(shown).toBeGreaterThan(hidden);
  });
});

describe('a collapsed economy cannot be looted twice', () => {
  const collapsed = (): GameState => seeded(70, { economy: COLLAPSED_THRESHOLD - 5 });

  it('refuses to infect a bank in a collapsed economy', () => {
    const s = withTraits(collapsed(), 'banking-1');
    expect(whyNot(s, 'us', 'infect-bank')).not.toBeNull();
  });

  it('refuses to crash a market that is already gone', () => {
    const s = withTraits(collapsed(), 'banking-1', 'market-manipulation');
    expect(whyNot(s, 'us', 'trigger-crash')).not.toBeNull();
  });

  it('still allows both on a healthy economy', () => {
    const s = withTraits(seeded(70, { economy: 80 }), 'banking-1', 'market-manipulation');
    expect(whyNot(s, 'us', 'infect-bank')).toBeNull();
    expect(whyNot(s, 'us', 'trigger-crash')).toBeNull();
  });
});

describe('war kill rate is meaningful', () => {
  it('removes a real share of a population at high severity', () => {
    const s = seeded(50, { atWar: true, warSeverity: 10 });
    const before = s.countries.us.population;
    const after = step(s).countries.us.population;
    expect((before - after) / before).toBeGreaterThan(WAR_KILL_RATE);
  });
});
