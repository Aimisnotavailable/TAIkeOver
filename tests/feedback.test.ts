import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState } from '../src/game/core/state';
import { primerFor } from '../src/game/core/primer';
import { step } from '../src/game/core/step';
import { actions, announce, announced, game, selected, showHelp, toasts } from '../src/ui/store';
import { primerLine } from '../src/ui/components/panels';
import { quietFactor } from '../src/game/core/compute';
import { INFLUENCE_MAX } from '../src/game/core/tuning';
import { REGION_IDS } from '../src/game/data/regions';
import type { GameState } from '../src/game/core/types';
import storeSource from '../src/ui/store.ts?raw';

const start = (over: Partial<GameState> = {}): GameState => ({
  ...createInitialState(42, 'default'),
  stage: 'world',
  ...over,
});

beforeEach(() => {
  game.value = start();
  toasts.value = [];
  selected.value = null;
  showHelp.value = true;
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

describe('the primer can be dismissed, and comes back with the run', () => {
  it('goes quiet for the rest of the run once the player says no', () => {
    game.value = start();
    expect(primerLine(game.peek(), showHelp.value)).not.toBeNull();
    showHelp.value = false;
    expect(primerLine(game.peek(), showHelp.value)).toBeNull();
    // It does not come back on a milestone. This is a preference about the interface,
    // not a step the projection can walk on.
    actions.select('us');
    expect(primerLine(game.peek(), showHelp.value)).toBeNull();
  });

  it('re-arms on restart, because a new run is a run nobody has told this player about', () => {
    showHelp.value = false;
    actions.restart('default');
    expect(showHelp.value).toBe(true);
    expect(primerFor(game.peek()).step).toBe('select');
    expect(primerLine(game.peek(), showHelp.value)).not.toBeNull();
  });
});

describe('the primer follows what the player actually did', () => {
  // Hack Protocols is owned in every state below because the primer will not show the
  // tap and breach lines to a run that has not bought it yet, however it behaves.
  const ready = (over: Partial<GameState> = {}): GameState =>
    start({
      compute: 400,
      traits: ['hack-1'],
      computeBubbles: [
        { id: 7, region: 'us', kind: 'red', value: 12, bornTick: 1, expiresTick: 7, phase: 0 },
      ],
      ...over,
    });

  it('moves on when a country is selected', () => {
    expect(primerFor(game.peek()).step).toBe('select');
    actions.select('us');
    expect(primerFor(game.peek()).step).toBe('hack-protocols');
  });

  it('does not move on for a click that selected nothing', () => {
    // Clicking off the map clears the selection; that is not the primer's "select".
    actions.select('us');
    actions.select(null);
    expect(primerFor(game.peek()).step).toBe('hack-protocols');
  });

  it('moves on when a bubble is tapped', () => {
    game.value = ready();
    actions.select('us');
    actions.collectCompute(7);
    expect(primerFor(game.peek()).step).toBe('breach');
  });

  it('does not move on for a tap that collected nothing', () => {
    game.value = ready();
    actions.select('us');
    actions.collectCompute(999);
    expect(primerFor(game.peek()).step).toBe('tap-bubble');
  });

  it('counts every kind of bubble, because all three are compute', () => {
    // The primer line said "Red circles are compute you already own" while the help screen
    // it shipped beside named all three kinds. `hitTestCompute` returns any of them and
    // the collection credits `bubble.value` whatever the kind, so the red was the only
    // untrue word in a sentence about all three.
    for (const kind of ['red', 'orange', 'blue'] as const) {
      game.value = ready({
        computeBubbles: [{ id: 7, region: 'us', kind, value: 12, bornTick: 1, expiresTick: 7, phase: 0 }],
      });
      const before = game.peek().compute;
      actions.collectCompute(7);
      expect(game.peek().compute, kind).toBe(before + 12);
      expect(game.peek().primerBubblesTapped, kind).toBe(1);
    }
  });

  it('moves on when a breach is accepted', () => {
    game.value = ready();
    actions.select('us');
    actions.collectCompute(7);
    expect(game.peek().primerBubblesTapped).toBe(1);
    actions.do('mexico', 'hack');
    expect(game.peek().primerBreachesOpened).toBe(1);
    expect(primerFor(game.peek()).step).toBe('influence');
  });

  it('does not move on for a hack that was refused', () => {
    // No Hack Protocols, so the action is rejected and `doAction` hands back the same
    // state. Congratulating a player for a hack they were never allowed to start is worse
    // than saying nothing at all, and the same rule that keeps the toast quiet has to
    // keep the primer quiet.
    game.value = ready({ traits: [] });
    actions.do('mexico', 'hack');
    expect(game.peek().activeHacks).toHaveLength(0);
    expect(game.peek().primerBreachesOpened).toBe(0);
  });

  it('does not count some other action as a breach', () => {
    // Go Quiet is accepted here, so this is the case where the state did change.
    actions.do('us', 'go-quiet');
    expect(game.peek().countries.us?.quiet).toBe(true);
    expect(game.peek().primerBreachesOpened).toBe(0);
  });

  it('stops naming Hack Protocols the moment it is bought', () => {
    actions.select('us');
    expect(primerFor(game.peek()).step).toBe('hack-protocols');
    actions.buy('hack-1');
    expect(primerFor(game.peek()).step).toBe('tap-bubble');
  });

  it('leaves the primer alone for a purchase it refused', () => {
    actions.select('us');
    actions.buy('rsi');
    expect(primerFor(game.peek()).step).toBe('hack-protocols');
  });

  it('wires nothing into a purchase, because the state already witnesses one', () => {
    // `buy` used to route through `advancePrimer({ kind: 'buy', trait: id })`, whose only
    // branch returned the state unchanged — ownership is read out of `traits` and
    // `incubating`. Asserting the absence, because the two lines this replaced were a
    // source-string guard on a call site with no effect.
    expect(storeSource).not.toMatch(/advancePrimer\([^)]*kind: 'buy'/);
    expect(storeSource).not.toMatch(/kind: 'tick'/);
    // And the outcome is still the one that matters, reached through the state instead.
    actions.select('us');
    actions.buy('hack-1');
    expect(primerFor(game.peek()).step).toBe('tap-bubble');
  });
});
