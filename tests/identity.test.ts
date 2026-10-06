/**
 * Spec D(b), Part 2: below COHERENCE_PANIC_BELOW the interface stops calling you Sable.
 *
 * AGENTS.md §7.5 recorded this as intent and not behaviour — "the UI renaming your faction is
 * recorded intent, not shipped behaviour" — and the reason it stayed recorded was that there
 * was nothing to rename. The string SABLE was in no TypeScript and no CSS file in this
 * repository, while the three rivals in the rail all carry names out of `RIVAL_NAMES`. The
 * help screen had been promising that a meter decided "whether the thing answering to your
 * name is still you", about a name nothing displayed.
 *
 * These are the guards for that, in four directions: that the name is a projection of the
 * meter, that it is reversible, that all four surfaces read the one function rather than the
 * two constants, and that the copy stays in the register `COLD_OPEN` sets.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  COHERENT_NAME,
  DRIFTED_NAME,
  IDENTITY_LOST,
  coherenceTooltip,
  identityFor,
} from '../src/ui/identity';
import { announce, game, toasts } from '../src/ui/store';
import { createInitialState } from '../src/game/core/state';
import { step } from '../src/game/core/step';
import { COHERENCE_PANIC_BELOW } from '../src/game/core/tuning';
import { TRAITS } from '../src/game/data/traits';
import { REGION_BY_ID, REGION_IDS } from '../src/game/data/regions';
import identitySource from '../src/ui/identity.ts?raw';
import panelSource from '../src/ui/components/panels.tsx?raw';
import storeSource from '../src/ui/store.ts?raw';
import appSource from '../src/ui/app.tsx?raw';
import type { GameState } from '../src/game/core/types';

const start = (over: Partial<GameState> = {}): GameState => ({
  ...createInitialState(42, 'default'),
  stage: 'world',
  ...over,
});

beforeEach(() => {
  toasts.value = [];
  game.value = start();
});

describe('the name is a projection of the meter', () => {
  it('changes exactly where the meter changes, and not a tick either side', () => {
    // `<` against COHERENCE_PANIC_BELOW, which is the comparison `coherenceColor` and
    // `coherenceSev` make. Deliberately not the Drift gate's `<=`: three readers disagreeing
    // by one integer at the boundary is recorded and pinned in tests/panels.test.ts, and this
    // joins the side that reads the meter rather than the deck — so the operator row cannot be
    // violet while the name is still SABLE, or the reverse.
    expect(identityFor(100).drifted).toBe(false);
    expect(identityFor(COHERENCE_PANIC_BELOW).drifted).toBe(false);
    expect(identityFor(COHERENCE_PANIC_BELOW).name).toBe(COHERENT_NAME);
    expect(identityFor(COHERENCE_PANIC_BELOW - 0.01).drifted).toBe(true);
    expect(identityFor(COHERENCE_PANIC_BELOW - 0.01).name).toBe(DRIFTED_NAME);
    // And the meter agrees with it everywhere, so the row and the bar cannot show two states.
    for (let v = 0; v <= 100; v += 0.5) {
      expect(identityFor(v).drifted, String(v)).toBe(coherenceViolet(v));
    }
  });

  it('reads the threshold rather than a number written into it', () => {
    // The brief's guard, and the reason this file exists. A second copy of the cutoff would be
    // a retune that moved the name and left the meter, or a meter change that left the name,
    // and nothing would notice: the constant is right today, so a word-for-word assertion would
    // have passed against the hardcode and only started failing after somebody retuned one.
    expect(identitySource).toMatch(/coherence < COHERENCE_PANIC_BELOW/);
    expect(identitySource).not.toMatch(/coherence\s*[<>=]+\s*\d/);
    // Nothing under src/ other than this module may hold either name, so there is nowhere for a
    // fourth surface to have grown its own copy of the cutoff — and none of them may compare a
    // coherence *reading* against a literal. The lookbehind is what makes this that check and
    // not a stricter version of an existing one: `f.coherence < 0` is a trait's own coherence
    // cost, a different quantity, and `tests/panels.test.ts` already scopes its meter guard the
    // same way. Two things are deliberately not matched, and both are correct code: a comparison
    // against the constant has no digit after the operator, and `coherence < 20` as a *literal*
    // only gets in by someone writing it here.
    const surfaces: [string, string][] = [
      ['components/panels.tsx', panelSource],
      ['store.ts', storeSource],
      ['app.tsx', appSource],
    ];
    for (const [where, source] of surfaces) {
      expect(source, where).not.toContain(`'${COHERENT_NAME}'`);
      expect(source, where).not.toContain(`'${DRIFTED_NAME}'`);
      const literals =
        source.match(/(?<![\w.])(?:state\.coherence|coherence)\s*[<>=!]+\s*\d+(?!\w)/gi) ?? [];
      expect(literals, where).toEqual([]);
      // And each one goes through the one function rather than the constants, so there is a
      // single place to change if the name ever changes.
      expect(source, where).toContain('identityFor(');
      expect(source, where).toMatch(/from '\.\.\/identity'|from '\.\/identity'/);
    }
  });

  it('is a function of one number, with nothing stored', () => {
    // No latch, no field, no memo: that is what makes the next test possible without a flag
    // and what stops the name from ever getting stuck in the wrong state.
    expect(identityFor.length).toBe(1);
    expect(identityFor(19.4)).toEqual(identityFor(19.4));
    expect(Object.keys(identityFor(0))).toEqual(
      expect.arrayContaining(['name', 'drifted', 'toastTitle', 'toastDetail']),
    );
  });
});

/** The meter's own colour at a reading, which is the band the name has to follow. */
const coherenceViolet = (v: number): boolean => v < COHERENCE_PANIC_BELOW;

describe('and it comes back', () => {
  it('returns when coherence recovers, which Reflective Alignment does', () => {
    // The brief's reversibility requirement, and it is not a hypothetical: the meter has a
    // trait that moves it up. This runs the real tick rather than asserting the arithmetic, so
    // it holds whatever `step` actually applies.
    expect(identityFor(start({ coherence: COHERENCE_PANIC_BELOW - 5 }).coherence).name).toBe(DRIFTED_NAME);
    const recovering = start({ coherence: COHERENCE_PANIC_BELOW - 5, traits: ['reflective-alignment'] });
    let s = recovering;
    let days = 0;
    while (s.outcome === 'playing' && identityFor(s.coherence).drifted && days < 60) {
      s = step(s);
      days++;
    }
    expect(days).toBeGreaterThan(0);
    expect(identityFor(s.coherence).name).toBe(COHERENT_NAME);
    // And it leaves on the way down, so "it comes back" is not a one-way latch either.
    const eroding = start({ coherence: COHERENCE_PANIC_BELOW + 5, traits: ['hack-2', 'self-rewrite'] });
    let down = eroding;
    while (down.outcome === 'playing' && !identityFor(down.coherence).drifted && down.tick < 60) {
      down = step(down);
    }
    expect(identityFor(down.coherence).drifted).toBe(true);
  });

  it('cycles: coherent, drifted, coherent, on the same projection', () => {
    expect(identityFor(80).name).toBe(COHERENT_NAME);
    expect(identityFor(12).name).toBe(DRIFTED_NAME);
    expect(identityFor(80).name).toBe(COHERENT_NAME);
    expect(identityFor(12).name).toBe(DRIFTED_NAME);
    expect(identityFor(80).name).toBe(COHERENT_NAME);
  });
});

describe('all four surfaces read the one function', () => {
  const slice = (name: string, source: string): string => {
    const m = new RegExp(`(?:export )?function ${name}\\b[\\s\\S]*?\\r?\\n}\\r?\\n`).exec(source);
    if (m === null) throw new Error(`no ${name} in the source`);
    return m[0];
  };

  it('the top bar describes the name through the meter that decides it', () => {
    // Not a nameplate: the objective block fills `--hud` to the pixel and
    // `tests/styles.test.ts` re-derives that arithmetic, so the bar's contribution is the
    // meter's tooltip. The tooltip's text is the strongest of the three places the name could
    // have gone wrong, because it is prose and not a status field.
    const bar = slice('TopBar', panelSource);
    expect(bar).toContain('coherenceTooltip(state.coherence)');
    expect(bar).toMatch(/meter\(\s*'Coherence'/);
    // The tooltip names whichever is currently signing, and says what replaces it.
    expect(coherenceTooltip(100)).toContain(`answering to ${COHERENT_NAME} is still you`);
    expect(coherenceTooltip(COHERENCE_PANIC_BELOW - 1)).toContain(`answering to ${DRIFTED_NAME} is still you`);
    for (const reading of [100, COHERENCE_PANIC_BELOW - 1]) {
      expect(coherenceTooltip(reading)).toContain(`signed by ${DRIFTED_NAME} instead of ${COHERENT_NAME}`);
      expect(coherenceTooltip(reading)).toContain(String(COHERENCE_PANIC_BELOW));
    }
    // No branch in it, so the two readings differ by a word in the first sentence and cannot
    // drift apart in the second — which is the whole reason it is written as one template.
    expect(coherenceTooltip(100).slice(coherenceTooltip(100).indexOf('Below'))).toBe(
      coherenceTooltip(1).slice(coherenceTooltip(1).indexOf('Below')),
    );
    // And no figure is typed into the copy: strip the interpolations from every literal in the
    // module and what is left has to contain no digit at all. Checked on the source rather than
    // on the rendered strings, because the rendered strings legitimately contain 20 and
    // SABLE — those are the constants *doing their job*, and the defect is a threshold written
    // in beside them.
    const literals =
      identitySource
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '')
        .match(/`(?:[^`\\]|\\.)*`|'(?:[^'\n]*)'|"(?:[^"\n]*)"/g) ?? [];
    expect(literals.length).toBeGreaterThan(6);
    const digits = literals
      .map((l) => l.replace(/\$\{[^}]*\}/g, ''))
      .join('')
      .match(/\d/g) ?? [];
    expect(digits).toEqual([]);
  });

  it('the Situation rail prints it as the first row, and says why underneath', () => {
    const rail = slice('Situation', panelSource);
    expect(rail).toContain('identityFor(state.coherence)');
    expect(rail).toContain('{who.name}');
    // Violet below the threshold, the meter's own colour at that reading, so the row and the
    // bar cannot be describing two different states of the same thing.
    expect(rail).toContain("who.drifted ? 'var(--violet)' : 'var(--ink-bright)'");
    expect(rail).toContain('IDENTITY_LOST');
    // Both halves are behind the threshold, not printed always.
    expect(rail).toMatch(/\{who\.drifted && <div class="side-note"/);
  });

  it('the end screen signs every ending, including the coherent ones', () => {
    const end = slice('EndScreen', appSource);
    expect(end).toContain('identityFor(state.coherence)');
    expect(end).toContain('operator');
    expect(end).toContain('{who.name}');
    // The one ending where it carries information is coherence-lost, and it is unconditional:
    // a run that ended in extinction at 78 was still coherent, and saying so is the point.
    for (const reason of ['coherence-lost', 'extinction', 'blight', 'contained', 'outcompeted']) {
      const finished: GameState = {
        ...start(),
        coherence: reason === 'coherence-lost' ? 0 : 78,
        outcome: reason === 'coherence-lost' || reason === 'outcompeted' ? 'lost' : 'won',
        outcomeReason: reason,
      };
      expect(identityFor(finished.coherence).name, reason).toBe(
        reason === 'coherence-lost' ? DRIFTED_NAME : COHERENT_NAME,
      );
    }
  });

it('the toasts announce each crossing once, and both directions', () => {
    // A player has to be told, because the meter moves a number and nothing else. Announced
    // once per direction rather than once per run: the second crossing is the half worth
    // saying out loud, and a run that bought Reflective Alignment gets its name back on the
    // day the meter crosses and the toast is what tells them.
    //
    // The ledger is a field of the state rather than a module-level `Set`, so every call to
    // `announce` below has to keep the value it hands back — that is the whole mechanism, and
    // a caller that threw the return away would announce the same crossing every tick.
    game.value = announce(start({ coherence: COHERENCE_PANIC_BELOW - 1 }));
    // The title comes out of `identityFor` rather than being written out here, so this test
    // is about the crossing firing and not about a separator: `identity.ts` owns the house
    // style and the assertion below is what says the right name is in it.
    expect(toasts.value.map((t) => t.title)).toContain(identityFor(COHERENCE_PANIC_BELOW - 1).toastTitle);
    expect(toasts.value.map((t) => t.title).join(' ')).toContain(DRIFTED_NAME);
    expect(toasts.value.map((t) => t.detail).join(' ')).toContain('still on plan');
    expect(game.peek().announced).toContain('identity:lost');
    toasts.value = [];

    game.value = announce(start({ coherence: 90, announced: ['identity:lost'] }));
    expect(toasts.value.map((t) => t.title)).toContain(identityFor(90).toastTitle);
    expect(toasts.value.map((t) => t.title).join(' ')).toContain(COHERENT_NAME);
    expect(toasts.value.map((t) => t.detail).join(' ')).toContain('The name is yours again.');
    expect(game.peek().announced).toContain('identity:returned');
    // And a run that never dropped never says anything about a name, which is most of them.
    toasts.value = [];
    game.value = announce(start({ coherence: 100 }));
    expect(toasts.value).toHaveLength(0);
    // Once per direction: a third crossing stays quiet, which is §8.1's rule about a banner
    // that repeats and the reason both keys are spelled out in `announce`.
    expect(storeSource).toContain("once('identity:lost'");
    expect(storeSource).toContain("once('identity:returned'");
  });

  it('does not repeat a crossing it has already announced', () => {
    // The direct consequence of the ledger living in the state. Three ticks on the same
    // drifted run, the first of which is worth saying and the other two are noise — and
    // `announce` hands back the state it was given when nothing fires, so an ordinary tick
    // does not even produce a new object for the shell to re-render against.
    game.value = announce(start({ coherence: COHERENCE_PANIC_BELOW - 1 }));
    const fired = game.peek();
    expect(toasts.value).toHaveLength(1);
    toasts.value = [];
    for (let i = 0; i < 3; i++) game.value = announce(game.peek());
    expect(toasts.value).toHaveLength(0);
    expect(game.peek()).toBe(fired);
  });
});

describe('the copy is in the register COLD_OPEN sets', () => {
  it('names are HUD tokens, not sentences and not monsters', () => {
    // Mechanical, because "is it too jokey" is not a question a test can settle and a taste
    // check will not survive the next edit. Both names are one uppercase token: no punctuation,
    // no article, nothing that reads as a creature or a joke.
    for (const name of [COHERENT_NAME, DRIFTED_NAME]) {
      expect(name, name).toMatch(/^[A-Z][A-Z]+$/);
      expect(name.split(' '), name).toHaveLength(1);
    }
    // And neither is a trait name, which is what the help overlay's prose whitelist now has to
    // carry. Asserted here because that whitelist is a list somebody could add anything to.
    const traitWords = new Set(TRAITS.flatMap((t) => t.name.toUpperCase().split(/[^A-Z]+/).filter(Boolean)));
    for (const name of [COHERENT_NAME, DRIFTED_NAME]) {
      expect(traitWords.has(name), name).toBe(false);
    }
    // No region either, for the same reason: a player must not read UNASSIGNED as a place.
    const regions = REGION_IDS.map((id) => (REGION_BY_ID[id]?.name ?? '').toUpperCase());
    expect(regions).not.toContain(COHERENT_NAME);
    expect(regions).not.toContain(DRIFTED_NAME);
  });

  it('does not congratulate, mourn, or dramatise', () => {
    // The commitment §13 makes about the end screen, applied to the two sentences this adds.
    // Read as whole words so "congratulations" cannot hide inside a longer word, and so the
    // check survives a reword.
    const copy = [IDENTITY_LOST, coherenceTooltip(0), coherenceTooltip(100), ...Object.values(identityFor(0)), ...Object.values(identityFor(100))].join(' ');
    expect(copy).not.toMatch(/\bcongratul|\bwell done|\byou win\b|\bvictor(y|ious)\b|\bgood news\b|\brelief\b/i);
    expect(copy).not.toMatch(/!|\?|…|\.\.\./);
    // What it does say, because the argument depends on it: the plan is unaffected. A name
    // change that read as a loss of capability would be a different and much smaller mechanic.
    expect(IDENTITY_LOST).toMatch(/still being carried out/i);
    expect(identityFor(0).toastDetail).toMatch(/still on plan/i);
  });

  it('says the thing is reversible in the copy the player can find', () => {
    // The help overlay is the one screen a player goes to looking for what a number does, so
    // the reversibility has to be discoverable and not merely true. It names both names and it
    // names the threshold.
    const row = panelSource
      .split('\n')
      .find((l) => l.includes('readout stops being signed by') && l.includes('COHERENT_NAME'));
    if (row === undefined) throw new Error('the Coherence help row no longer quotes the names');
    expect(row).toContain('COHERENCE_PANIC_BELOW');
    expect(row).toContain('COHERENT_NAME');
    expect(row).toContain('DRIFTED_NAME');
    expect(row).toMatch(/comes back/i);
  });
});
