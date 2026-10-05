import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { step } from '../src/game/core/step';
import { actions, announce, announced, game, selected, toasts } from '../src/ui/store';
import { quietFactor } from '../src/game/core/compute';
import { INFLUENCE_MAX } from '../src/game/core/tuning';
import { REGION_IDS } from '../src/game/data/regions';
import type { GameState } from '../src/game/core/types';

const start = (over: Partial<GameState> = {}): GameState => ({
  ...createInitialState(42, 'default'),
  stage: 'world',
  ...over,
});

beforeEach(() => {
  game.value = start();
  toasts.value = [];
  selected.value = null;
});

describe('confirming an action', () => {
  it('announces a breach', () => {
    game.value = start({ compute: 400, traits: ['hack-1'] });
    actions.do('mexico', 'hack');
    expect(toasts.value.map((t) => t.title).join(' ')).toContain('BREACH OPENED');
  });

  it('announces a pathogen release', () => {
    game.value = start({ compute: 2000, traits: ['gain-of-function', 'pathogen-1'] });
    actions.do('us', 'release-pathogen');
    expect(toasts.value.map((t) => t.title).join(' ')).toContain('PATHOGEN RELEASED');
  });

  it('announces an insurgency', () => {
    game.value = start({ compute: 2000, traits: ['propaganda-1', 'terrorism'] });
    const id = REGION_IDS.find((r) => game.value.countries[r]?.infection > 0) ?? 'mexico';
    actions.do(id, 'fund-insurgency');
    expect(toasts.value.map((t) => t.title).join(' ')).toContain('INSURGENCY');
  });

  it('announces an economic collapse', () => {
    game.value = start({ compute: 3000, traits: ['banking-1', 'market-manipulation'] });
    const id = REGION_IDS.find((r) => (game.value.countries[r]?.infection ?? 0) >= 10) ?? 'mexico';
    const base = game.value;
    game.value = {
      ...base,
      countries: { ...base.countries, [id]: { ...base.countries[id]!, infection: 70 } },
    } as GameState;
    actions.do(id, 'trigger-crash');
    expect(toasts.value.map((t) => t.title).join(' ')).toContain('MARKETS COLLAPSE');
  });

  it('stays silent when the action was rejected', () => {
    // No influence trait, so insurgency is locked and must claim nothing.
    game.value = start({ compute: 5000 });
    actions.do('mexico', 'fund-insurgency');
    expect(toasts.value).toHaveLength(0);
  });

  it('does not stack up faster than the screen can read', () => {
    game.value = start({ compute: 9999, traits: ['hack-1', 'propaganda-1', 'terrorism', 'banking-1'] });
    for (const id of ['mexico', 'brazil', 'argentina', 'india'] as const) actions.do(id, 'hack');
    expect(toasts.value.length).toBeLessThanOrEqual(4);
  });
});

describe('what influence is for', () => {
  it('leaves suspicion untouched at zero', () => {
    expect(quietFactor(0)).toBe(1);
  });

  it('reduces suspicion gains as it climbs', () => {
    expect(quietFactor(400)).toBeLessThan(quietFactor(100));
  });

  it('never buys total immunity', () => {
    expect(quietFactor(INFLUENCE_MAX * 10)).toBeGreaterThan(0.3);
  });

  it('grows more slowly the closer it gets to the ceiling', () => {
    const base = start();
    const early = { ...base, influence: 0 };
    const late = { ...base, influence: 900 };
    const grewEarly = step(early).influence;
    const grewLate = step(late).influence - 900;
    expect(grewLate).toBeLessThan(grewEarly);
  });

  it('is worth buying the Influence branch for', () => {
    const base = start();
    const propped: GameState = {
      ...base,
      traits: [...base.traits, 'propaganda-1', 'cult'],
    };
    let plain = base;
    let loud = propped;
    for (let i = 0; i < 120; i++) {
      plain = step(plain);
      loud = step(loud);
    }
    expect(loud.influence).toBeGreaterThan(plain.influence);
  });
});

describe('announcements re-arm on restart', () => {
  it('fires the same announcement again in a second run', () => {
    const s = start({
      pathogen: { released: true, killsPerDay: 0.005, suspicionPerDay: 1, sterility: false, targeted: false, cancer: false },
    });
    announce(s);
    expect(toasts.value.map((t) => t.title)).toContain('THE PATHOGEN IS VISIBLE');
    toasts.value = [];

    actions.restart('default');
    expect(announced.size).toBe(0);

    announce(s);
    expect(toasts.value.map((t) => t.title)).toContain('THE PATHOGEN IS VISIBLE');
  });
});
