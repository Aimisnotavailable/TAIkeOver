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
    // A sixth condition, and not a numeric one.
    //
    // It is worth being straight that this is belt and braces rather than the wall. The late
    // stage is reachable only with Recursive Self-Improvement, which needs Ascension, which
    // needs infection past a threshold that never falls — so the infection ceiling has
    // already refused every real late-stage run and this check never gets the vote on any
    // state the game can produce. It is here because it states the invariant instead of
    // inheriting it, and the case below is the one that would start mattering the day
    // infection became reducible.
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

/**
 * The fast line, which must not be redeemable.
 *
 * What forecloses it is the infection ceiling, and this block is mostly about the two things
 * that are often credited with it and do not do it: the Coherence gate, and the stage check.
 * The comments say which is which, because an earlier revision of this suite implied the
 * opposite and a reader who skims should not be misled by the assertions below.
 */
/**
 * Press Go Quiet on every region that is currently loud, or un-press it on every region that
 * is currently quiet. The button is a toggle, so a loop that wants more than one round has to
 * alternate rather than press blindly.
 */
const toggleQuietEverywhere = (state: GameState, wantQuiet: boolean): GameState => {
  let s = state;
  for (const id of REGION_IDS) {
    if ((s.countries[id]?.quiet ?? false) !== wantQuiet) s = doAction(s, id, 'go-quiet');
  }
  return s;
};

describe('the fast line cannot be redeemed', () => {
  /**
   * A run on the aggressive line, built the way the game would let a player build it.
   *
   * It is an aggressive run and not a quiet one because that is the only kind that can reach
   * this branch: Recursive Self-Improvement is gated on Ascension, which needs
   * `ASCENSION_INFECTION` of humanity, and the Containment ceiling is a quarter of that. The
   * two lines are already exclusive on the infection gate before anything else is considered.
   */
  const selfModLine = (): GameState => {
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

  it('is refused by the infection ceiling alone in a real late-stage run, which is why the stage check is redundant', () => {
    // The claim the stage-condition comment makes, measured rather than asserted. Taken
    // inside the hold and with the stage check stripped off, the run is still refused — and
    // refused by the gate that actually does the work, not by the sixth condition. This is
    // the case that would start mattering the day infection became reducible.
    let s = selfModLine();
    let guard = 0;
    while (s.outcome === 'playing' && !s.traits.includes('rsi') && guard++ < 60) s = step(s);
    for (let i = 0; i < 5 && s.outcome === 'playing'; i++) s = step(s);
    expect(s.stage).toBe('late');
    expect(containmentGates({ ...s, stage: 'world' }).infection).toBe(false);
    expect(canContain({ ...s, stage: 'world' })).toBe(false);
  });

  it('stays unavailable on every single day of the line', () => {
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

  it('cannot get under the ceiling however hard the player tries to go quiet, which is the point', () => {
    // **This is the closure.** Written the way it is so that it breaks if the ceiling ever
    // becomes removable.
    //
    // Go Quiet is the strongest counterplay in the game: it stops spread and drops awareness
    // in a region, and doing it everywhere is what a player reaching for this ending would
    // reach for. Pressed repeatedly rather than once, because one press at this infection is a
    // rounding error, and a ceiling that is removable by one press is removable by four. Forty
    // rounds is enough that any reduction the design could plausibly grow — even five per cent
    // a press — would compound under the gate and fail the loop.
    //
    // The day a way to lower infection lands in `step` or `doAction`, one of the two halves
    // below fails, and somebody has to decide whether the fast line can now be redeemed.
    let s = selfModLine();
    expect(containmentGates(s).infection).toBe(false);
    for (let round = 0; round < 40; round++) {
      s = toggleQuietEverywhere(s, true);
      // A tick between rounds, because `containmentGates` reads `globalInfection` and only
      // `step` writes it. Pressing the button alone would leave the gate reading a stale
      // figure and the loop below would pass against a reduction that had already happened —
      // which is exactly the mistake a single-press version of this test made first time.
      s = step(s);
      expect(containmentGates(s).infection, `quiet, round ${round + 1}`).toBe(false);
      // Reset for the next round, so the next one is a real press rather than a no-op.
      s = toggleQuietEverywhere(s, false);
    }
    // It did what the button says it does, so the assertions above are not passing because the
    // control silently did nothing.
    expect(toggleQuietEverywhere(s, true).countries.us?.quiet).toBe(true);

    // And over the whole life of the line, every single day, rather than at the end. This half
    // is what catches a reduction inside the tick rather than inside a button.
    let t = selfModLine();
    for (let i = 0; i < 400 && t.outcome === 'playing'; i++) {
      t = step(t);
      expect(containmentGates(t).infection, `day ${i + 1}`).toBe(false);
    }
  });

  it('is shut at the threshold Ascension itself demands, with nothing in between', () => {
    // The structural half, with no run involved: the gate is a quarter of the gate that opens
    // the branch which needs it, so a run standing exactly on the Ascension threshold is
    // already four times over the containment ceiling. If either constant is retuned past the
    // other, this fails before any behaviour does.
    expect(CONTAINMENT_INFECTION).toBeLessThan(ASCENSION_INFECTION);
    const atThreshold: GameState = { ...selfModLine(), globalInfection: ASCENSION_INFECTION };
    expect(containmentGates(atThreshold).infection).toBe(false);
    // And the last value that would pass, still passes — so the gate has not quietly become
    // unreachable either.
    expect(containmentGates({ ...atThreshold, globalInfection: CONTAINMENT_INFECTION }).infection).toBe(true);
  });

  it('is shut on day one by the infection it needed to open Ascension', () => {
    // The precondition for the two tests above, on its own: reaching Ascension means passing
    // `ASCENSION_INFECTION` of humanity, and the run has already done that before it buys
    // anything on this branch.
    let s = selfModLine();
    expect(s.ascensionUnlocked).toBe(true);
    expect(s.globalInfection).toBeGreaterThan(ASCENSION_INFECTION);
    for (let i = 0; i < 400 && s.outcome === 'playing'; i++) {
      s = step(s);
      expect(s.globalInfection).toBeGreaterThan(CONTAINMENT_INFECTION);
    }
  });

  it('never clears the coherence bar, which is the point of this assertion', () => {
    // **This assertion says the Coherence gate is NOT what forecloses the fast line.** It is
    // the assertion most likely to be misread, because the obvious expectation here is the
    // opposite one and it is the flattering one.
    //
    // Self-Rewrite bleeds 0.16 a day and Recursive Self-Improvement 0.30, so a run holding
    // both needs about eighty-seven days to fall from a full meter to CONTAINMENT_COHERENCE —
    // and the thirty-day hold that buys the second ends the run first. Measured across the
    // whole hold, coherence bottoms out in the eighties. So on this line the gate is never even
    // reached, and what forecloses the line is the infection ceiling above.
    //
    // If a future edit makes this fail by dropping `lowest` below the bar, that is a *good*
    // change to the simulation and a bad change to this comment: the Coherence gate would
    // still not be what closes the line, because the infection ceiling would refuse it first
    // either way. Update the comment, do not delete the assertion.
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
    // Not what stops the card drawing over the end screen: `EventCards` is gated on the
    // outcome, like `paused-bar`, and that gate is the general guard — it covers the four
    // endings `step` writes, none of which clear the queue. This is about the finished run's
    // own state, and Containment is the only ending a player presses a button for rather than
    // one `step` finds, so it is the only one authored rather than produced.
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