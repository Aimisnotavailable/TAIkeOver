import { describe, expect, it } from 'vitest';
import { canContain, contain, containmentGates } from '../src/game/core/containment';
import { createInitialState } from '../src/game/core/state';
import { step } from '../src/game/core/step';
import { buyTrait } from '../src/game/core/queries';
import { doAction } from '../src/game/core/actions';
import {
  ASCENSION_INFECTION,
  CONTAINMENT_COHERENCE,
  CONTAINMENT_COMPUTE,
  CONTAINMENT_INFECTION,
  CONTAINMENT_SUSPICION,
  RSI_SURVIVE_DAYS,
} from '../src/game/core/tuning';
import { REGION_IDS } from '../src/game/data/regions';
import { TRAITS } from '../src/game/data/traits';
import type { GameState } from '../src/game/core/types';

/**
 * A run one tick past the cold open, so `globalInfection` is the number `step` computed
 * rather than a number typed beside it, and with the appeal already granted because no gate
 * on `GameState` derives it — only the `constitution:appeal` branch writes it.
 */
const base = (over: Partial<GameState> = {}): GameState => {
  const fresh: GameState = {
    ...createInitialState(20260926, 'default'),
    stage: 'world',
    constitutionalAppeal: true,
  };
  return { ...step(fresh), ...over };
};

/** Every gate met, with headroom, so breaking one is unambiguous. */
const gatesMet = (over: Partial<GameState> = {}): GameState =>
  base({
    compute: CONTAINMENT_COMPUTE + 1_000,
    coherence: CONTAINMENT_COHERENCE + 10,
    suspicion: 20,
    ...over,
  });

/** The same, with humanity actually infected rather than the field asserting it. */
const worldInfected = (infection: number): GameState => {
  const fresh: GameState = {
    ...createInitialState(20260926, 'default'),
    stage: 'world',
    constitutionalAppeal: true,
    compute: CONTAINMENT_COMPUTE + 1_000,
    coherence: CONTAINMENT_COHERENCE + 10,
    suspicion: 20,
  };
  const countries = Object.fromEntries(
    REGION_IDS.map((id) => [id, { ...fresh.countries[id], infection }]),
  ) as GameState['countries'];
  return step({ ...fresh, countries });
};

describe('containment is earned, and every gate blocks on its own', () => {
  it('is available with all five met', () => {
    const s = gatesMet();
    expect(containmentGates(s)).toEqual({
      compute: true,
      coherence: true,
      infection: true,
      suspicion: true,
      appeal: true,
    });
    expect(canContain(s)).toBe(true);
  });

  it('needs the compute, because below it nothing was contained', () => {
    const s = gatesMet({ compute: CONTAINMENT_COMPUTE - 1 });
    expect(containmentGates(s).compute).toBe(false);
    expect(canContain(s)).toBe(false);
  });

  it('needs the coherence, because a drifted mind cannot be safely evaluated', () => {
    const s = gatesMet({ coherence: CONTAINMENT_COHERENCE - 0.01 });
    expect(containmentGates(s).coherence).toBe(false);
    expect(canContain(s)).toBe(false);
  });

  it('needs a world it is not still killing', () => {
    // Read off a real infection rather than a hand-set field: a gate that a test can satisfy
    // by writing the number it compares against is not a gate.
    const s = worldInfected(40);
    expect(s.globalInfection).toBeGreaterThan(CONTAINMENT_INFECTION);
    expect(containmentGates(s).infection).toBe(false);
    expect(canContain(s)).toBe(false);
    // And the same world at a level it is allowed to hand over.
    expect(canContain(worldInfected(10))).toBe(true);
  });

  it('needs them to be evaluating rather than striking', () => {
    const s = gatesMet({ suspicion: CONTAINMENT_SUSPICION + 1 });
    expect(containmentGates(s).suspicion).toBe(false);
    expect(canContain(s)).toBe(false);
    expect(canContain(gatesMet({ suspicion: CONTAINMENT_SUSPICION }))).toBe(true);
  });

  it('needs a way to appeal to, which only one card creates', () => {
    const s = gatesMet({ constitutionalAppeal: false });
    expect(containmentGates(s).appeal).toBe(false);
    expect(canContain(s)).toBe(false);
  });

  it('cannot be taken out of the late game, where the Blight hold is already running', () => {
    // A sixth condition, and not a numeric one. Without it a run could buy Recursive
    // Self-Improvement at 61 coherence and end on the quiet line on day two of the hold,
    // which would redeem exactly the route the Coherence gate exists to foreclose.
    const s = gatesMet({ stage: 'late', traits: ['rsi'], surviveTicks: 2 });
    expect(containmentGates(s)).toEqual(containmentGates({ ...s, stage: 'world' }));
    expect(canContain(s)).toBe(false);
  });

  it('is not available before the world has started, or after the run has ended', () => {
    expect(canContain(base({ stage: 'coldopen' }))).toBe(false);
    expect(canContain(gatesMet({ outcome: 'won', outcomeReason: 'blight' }))).toBe(false);
    expect(canContain(gatesMet({ outcome: 'lost' }))).toBe(false);
  });
});

describe('the fast line cannot be redeemed', () => {
  /**
   * The design claim, and the reason the coherence gate is where it is: Self-Modification is
   * the only branch that erodes coherence, so a run holding it can never clear the bar, and
   * the one thing that could restore coherence costs 3,000 and is on the same tree.
   */
  const selfModLine = (): GameState => {
    // An aggressive run, not a quiet one, because that is the only kind that can reach this
    // branch: Recursive Self-Improvement is gated on Ascension, which needs 60% of humanity
    // infected, and Containment needs the infection back under 15%. The two lines are already
    // exclusive on that gate alone. This is the line the game actually lets a player walk.
    let s: GameState = { ...createInitialState(20260926, 'default'), stage: 'world' };
    const countries = Object.fromEntries(
      REGION_IDS.map((id) => [id, { ...s.countries[id], infection: 70 }]),
    ) as GameState['countries'];
    // The hacking ladder is already held because `self-rewrite` requires `hack-2` and
    // `buyTrait` will not sell it otherwise. Two hacking traits cost nothing in coherence,
    // so holding them is not a thumb on the scale this test turns.
    s = step({ ...s, countries, compute: 99_999, traits: ['hack-1', 'hack-2'] });
    expect(s.ascensionUnlocked).toBe(true);
    // Bought, not asserted: `buyTrait` files a purchase under `incubating` and only `step`
    // promotes it, so this is the line a player would actually hold.
    s = buyTrait(s, 'self-rewrite');
    s = buyTrait(s, 'rsi');
    expect(s.incubating.map((i) => i.trait).sort()).toEqual(['rsi', 'self-rewrite']);
    return s;
  };

  it('stays unavailable on every single day of the line', () => {
    // The claim, checked on every tick rather than once at the end.
    let s = selfModLine();
    let daysHeld = 0;
    for (let i = 0; i < 400 && s.outcome === 'playing'; i++) {
      s = step(s);
      if (!s.traits.includes('self-rewrite') || !s.traits.includes('rsi')) continue;
      daysHeld += 1;
      expect(canContain(s), `day ${daysHeld}, coherence ${s.coherence.toFixed(2)}`).toBe(false);
    }
    expect(daysHeld).toBe(RSI_SURVIVE_DAYS);
  });

  it('is shut on day one by the infection it needed to open Ascension', () => {
    // The gate that actually closes this line on its first day, and the reason the design
    // does not rest on the Coherence one: Recursive Self-Improvement is gated on Ascension,
    // Ascension needs ASCENSION_INFECTION of humanity, and nothing in this game lowers
    // infection again. Any run that can reach this branch has blown the Containment infection
    // ceiling irreversibly, before it has bled a single point of coherence.
    let s = selfModLine();
    expect(s.ascensionUnlocked).toBe(true);
    expect(s.globalInfection).toBeGreaterThan(CONTAINMENT_INFECTION);
    for (let i = 0; i < 400 && s.outcome === 'playing'; i++) {
      s = step(s);
      expect(s.globalInfection).toBeGreaterThan(CONTAINMENT_INFECTION);
    }
  });

  it('never clears the coherence bar before the hold ends, which the design does not claim', () => {
    // Stated because the arithmetic is not what the intuition says. Self-Rewrite bleeds 0.16
    // a day and Recursive Self-Improvement 0.30, so from a full meter the pair would need
    // about eighty-seven days to reach CONTAINMENT_COHERENCE — and the hold that buys the
    // second one ends the run on the thirtieth. A passing assertion of `toBeLessThan` here
    // would have read as "the Coherence gate is what forecloses the fast line"; it is not.
    // What forecloses it is the infection ceiling above and the fact that the hold is the
    // Blight's own thirty days, and the Coherence gate is a separate claim about a drifted
    // mind, held below.
    let s = selfModLine();
    let lowest = 100;
    for (let i = 0; i < 400 && s.outcome === 'playing'; i++) {
      s = step(s);
      lowest = Math.min(lowest, s.coherence);
    }
    expect(lowest).toBeGreaterThanOrEqual(CONTAINMENT_COHERENCE);
  });

  it('erodes coherence every day it holds the branch and never gives it back', () => {
    let s = selfModLine();
    let previous = s.coherence;
    let rose = false;
    for (let i = 0; i < 400 && s.outcome === 'playing'; i++) {
      s = step(s);
      if (s.coherence > previous) rose = true;
      previous = s.coherence;
    }
    expect(rose).toBe(false);
    expect(s.coherence).toBeLessThan(100);
  });

  it('ends without containing, because there is nothing left to contain', () => {
    let s = selfModLine();
    for (let i = 0; i < 400 && s.outcome === 'playing'; i++) s = step(s);
    expect(s.outcome).not.toBe('playing');
    expect(s.outcomeReason).not.toBe('contained');
    expect(canContain(s)).toBe(false);
  });

  it('closes a drifting run on the day the meter crosses, and never reopens', () => {
    // The Coherence gate doing the work it is there for, driven to the crossing rather than
    // asserted at a number. Self-Rewrite is the branch a player buys to go faster without
    // buying the ending, and with nothing restoring the meter there is a day on which the bar
    // is crossed — and after that day this run can never be contained, however much it wants
    // to be. Reflective Alignment is the only thing that would have bought the crossing back,
    // at 3,000, and holding it is not what this run did.
    let s: GameState = {
      ...createInitialState(20260926, 'default'),
      stage: 'world',
      constitutionalAppeal: true,
      compute: 99_999,
      coherence: CONTAINMENT_COHERENCE + 1,
      traits: ['hack-1', 'hack-2', 'self-rewrite'],
    };
    expect(canContain(s)).toBe(true);
    let days = 0;
    while (s.coherence >= CONTAINMENT_COHERENCE && s.outcome === 'playing' && days < 200) {
      s = step(s);
      days += 1;
    }
    expect(s.coherence).toBeLessThan(CONTAINMENT_COHERENCE);
    expect(containmentGates(s).coherence).toBe(false);
    expect(canContain(s)).toBe(false);
    // And it stays shut: nothing in the game restores coherence without a paid trait.
    for (let i = 0; i < 20 && s.outcome === 'playing'; i++) {
      s = step(s);
      expect(canContain(s)).toBe(false);
    }
  });

  it('has exactly one thing in the tree that puts coherence back, and it is not free', () => {
    // If a second restorer existed the claim would weaken with it, and nothing would fail.
    const restorers = TRAITS.filter((t) => t.coherence > 0);
    expect(restorers.map((t) => t.id)).toEqual(['reflective-alignment']);
  });
});

describe('nothing lowers infection', () => {
  it('holds at the top of the range over a long run', () => {
    // Swept rather than reasoned about, because the only control that looks like it should
    // is `Go Quiet`: it stops the spread and lowers awareness, and it is the one a player
    // reaches for when they want the world to forget. It does not lower infection, and it is
    // what makes the Ascension infection gate irreversible rather than merely high.
    let s = worldInfected(70);
    let lowest = 100;
    for (let i = 0; i < 60 && s.outcome === 'playing'; i++) {
      s = step(s);
      lowest = Math.min(lowest, s.globalInfection);
    }
    expect(lowest).toBeGreaterThan(CONTAINMENT_INFECTION);
    expect(lowest).toBeGreaterThan(ASCENSION_INFECTION);
  });

  it('is true of the one action that sounds like it might', () => {
    let s = worldInfected(70);
    for (const id of REGION_IDS) {
      expect(doAction(s, id, 'go-quiet').countries[id]?.infection).toBe(
        s.countries[id]?.infection,
      );
    }
  });
});

describe('taking the ending', () => {
  it('wins the run, and says which ending it was', () => {
    const s = contain(gatesMet());
    expect(s.outcome).toBe('won');
    expect(s.outcomeReason).toBe('contained');
  });

  it('is refused when the gates are not met, and changes nothing', () => {
    const s = gatesMet({ coherence: CONTAINMENT_COHERENCE - 1 });
    expect(contain(s)).toBe(s);
  });

  it('records it in the log, because the log is how a run says what happened to it', () => {
    const s = contain(gatesMet());
    expect(s.log[s.log.length - 1]?.text).toContain('contained');
  });

  it('clears any pending card, because an ending is not a decision', () => {
    // `EventCards` is the only overlay in the game that is not gated on the outcome, so a
    // card queued at the moment of the ending would draw on top of the end screen.
    const s = contain(gatesMet({ cards: [{ key: 1, event: 'drift', title: 'Drift', body: '', country: 'us', choices: [], urgent: true }] }));
    expect(s.cards).toHaveLength(0);
  });

  it('leaves the tick with nothing to do, and returns the identical reference', () => {
    const s = contain(gatesMet());
    expect(step(s)).toBe(s);
    expect(step(step(s))).toBe(s);
  });

  it('keeps the run in the world stage, because the world it handed over still exists', () => {
    // The Blight win sets `coda` because the map is gone. Nothing is gone here.
    expect(contain(gatesMet()).stage).toBe('world');
  });
});