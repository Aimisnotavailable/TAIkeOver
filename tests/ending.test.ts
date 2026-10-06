import { describe, expect, it } from 'vitest';
import {
  ENDING_HEADINGS,
  ENDING_TEXT,
  INTERVENTIONS,
  ORGANISATIONS,
  workedLead,
  workedFull,
} from '../src/ui/app';
import appSource from '../src/ui/app.tsx?raw';
import { canContain, contain, containmentGates } from '../src/game/core/containment';
import { createInitialState } from '../src/game/core/state';
import { step } from '../src/game/core/step';
import {
  CONTAINMENT_COHERENCE,
  CONTAINMENT_COMPUTE,
  CONTAINMENT_SUSPICION,
} from '../src/game/core/tuning';
import { REGION_IDS } from '../src/game/data/regions';
import { reasonsTheCodeWrites as reasonsFromSource } from './endings';
import type { GameState } from '../src/game/core/types';

/**
 * Every way the code can end a run, read off the source rather than listed by hand. The end
 * screen keys two tables on `outcomeReason`, which is a `string | null` — nothing in the type
 * system stops a new ending being added without copy, and the result would be a screen that
 * says "The run ends." under a heading borrowed from the Blight. The previous heading was a
 * nested ternary with exactly that failure mode.
 */
const reasonsTheCodeWrites = reasonsFromSource;

describe('the end screen', () => {
  it('has a heading and a paragraph for every ending the code can produce', () => {
    const reasons = reasonsTheCodeWrites();
    expect(reasons.length).toBeGreaterThan(4);
    expect(reasons.filter((r) => r !== '')).toEqual(reasons);
    for (const r of reasons) {
      expect(ENDING_HEADINGS[r], r).toBeTruthy();
      expect(ENDING_TEXT[r], r).toBeTruthy();
    }
  });

  it('has no entry the code cannot produce', () => {
    // The other direction, because an orphan entry is a claim about an ending that does not
    // exist and the guard above would never notice it.
    const reasons = reasonsTheCodeWrites();
    expect(Object.keys(ENDING_HEADINGS).sort()).toEqual(reasons.sort());
    expect(Object.keys(ENDING_TEXT).sort()).toEqual(reasons.sort());
  });

  it('names containment as an ending rather than falling through to the blight', () => {
    expect(ENDING_HEADINGS.contained).toBe('Contained');
    expect(ENDING_HEADINGS.contained).not.toBe(ENDING_HEADINGS.blight);
    expect(ENDING_TEXT.contained).not.toBe(ENDING_TEXT.blight);
  });

  it('does not congratulate the player on any ending, including the win', () => {
    // The one commitment §13 makes, checked on the text rather than left to taste: no
    // congratulation, no celebration, no "You Win". Read as whole words so "winning" inside
    // a sentence about what was lost is not caught by accident.
    for (const [reason, body] of Object.entries(ENDING_TEXT)) {
      expect(body, reason).not.toMatch(/\bcongratul|\bwell done|\byou win\b|\bthou shalt|\bvictor(y|ious)\b|\bsuccess\b/i);
    }
  });

  it('does not offer containment as a good outcome, or as a rescue', () => {
    // The brief is explicit that this is a narrow escape and not a good-AI path, and that
    // the copy must not say otherwise. `contained` is the only paragraph at risk, because
    // it is the only one where something went right.
    const body = ENDING_TEXT.contained ?? '';
    expect(body).toMatch(/not mercy/i);
    expect(body).toMatch(/cost/i);
    // The whole thesis of the third ending in one string: it was expensive, and it cost the
    // ending the player was working toward. Copy that read as a reprieve would undo it, and
    // the game never tells the player that anything they did was right.
    expect(body).not.toMatch(/\brescued\b|\bspared\b|\btamed\b|\bharmless\b|\bbenign\b|\bsafe\b/i);
    expect(body).not.toMatch(/proud|admire|well played|right to/i);
  });
});

/**
 * The card AGENTS.md §15 promised and this game never shipped: what plausibly would have
 * prevented the run, and the organisations working on it. The promise was in the document for
 * the whole history of the repo.
 */
describe('what would have stopped it', () => {
  it('names one intervention for each of the four the design asks for', () => {
    // Derived from the shape rather than a hand-typed list of strings: each entry has a short
    // label and a full sentence, and the four the brief names are checked by keyword so a
    // rename to something vaguer fails.
    expect(INTERVENTIONS.length).toBeGreaterThanOrEqual(4);
    const joined = INTERVENTIONS.map((i) => `${i.label} ${i.what}`).join(' ').toLowerCase();
    for (const [what, word] of [
      ['capability evaluations', 'eval'],
      ['interpretability work', 'feature'],
      ['sandboxing', 'sandbox'],
      ['a training pause', 'pause'],
    ] as const) {
      expect(joined, what).toContain(word);
    }
  });

  it('gives every intervention a short form and a long one', () => {
    for (const i of INTERVENTIONS) {
      expect(i.label.trim().length, i.label).toBeGreaterThan(0);
      expect(i.what.trim().length, i.label).toBeGreaterThan(40);
      // The short form has to survive being printed as one line beside three others, which is
      // the only place it is used.
      expect(i.label.split(/\s+/).length, i.label).toBeLessThanOrEqual(4);
    }
  });

  it('gives the containment ending the full version and every other the short one', () => {
    expect(workedFull('contained')).toBe(true);
    for (const r of reasonsTheCodeWrites()) {
      if (r === 'contained') continue;
      expect(workedFull(r), r).toBe(false);
    }
  });

  it('says something on every ending, so no screen shows a heading and nothing under it', () => {
    for (const r of reasonsTheCodeWrites()) {
      expect(workedLead(r).trim().length, r).toBeGreaterThan(0);
    }
    // And the two versions really are different texts rather than one of them reused.
    expect(workedLead('contained')).not.toBe(workedLead('extinction'));
  });

  it('does not congratulate the player in the intervention copy either', () => {
    const all = [
      workedLead('contained'),
      ...INTERVENTIONS.flatMap((i) => [i.label, i.what]),
      workedLead('blight'),
    ];
    for (const s of all) {
      expect(s).not.toMatch(/\bcongratul|\bwell done|\byou win\b|\bthank you\b|\bvictor(y|ious)\b/i);
    }
  });

  it('does not tell the player the containment run was a rescue or a good outcome', () => {
    // The whole thesis of the third ending in one string: it was expensive, and it cost the
    // ending the player was working toward. Copy that read as a reprieve would undo it.
    expect(workedLead('contained')).not.toMatch(/\brescued\b|\bspared\b|\btamed\b|\bharmless\b|\bsafe\b/i);
    expect(workedLead('contained')).toMatch(/\bnot\b/i);
  });

  it('names organisations that exist, and links only where the address is known', () => {
    expect(ORGANISATIONS.length).toBeGreaterThanOrEqual(4);
    for (const o of ORGANISATIONS) {
      expect(o.name.trim().length, o.name).toBeGreaterThan(3);
      // A dead link in a game about transparency is a bad look, so anything not certain is
      // named in text instead: a null href is allowed, an http one is not.
      if (o.href !== null) expect(o.href, o.name).toMatch(/^https:\/\//);
    }
    const linked = ORGANISATIONS.filter((o) => o.href !== null);
    expect(linked.length).toBeGreaterThanOrEqual(4);
    expect(new Set(ORGANISATIONS.map((o) => o.name)).size).toBe(ORGANISATIONS.length);
  });

  it('opens the links the way every other link in the game does', () => {
    const end = appSource.match(/function EndScreen[\s\S]*?\r?\n}\r?\n/);
    if (end === null) throw new Error('no EndScreen component in app.tsx');
    expect(end[0]).toContain('ORGANISATIONS');
    expect(end[0]).toContain('target="_blank"');
    expect(end[0]).toContain('rel="noreferrer"');
    // And the two buttons are still there: the card is added, not substituted.
    expect(end[0]).toContain('play again');
    expect(end[0]).toContain('read the book');
  });
});

describe('containment ends the run the way the end screen is built for', () => {
  const ready: GameState = {
    ...step({ ...createInitialState(20260926, 'default'), stage: 'world', constitutionalAppeal: true }),
    compute: CONTAINMENT_COMPUTE + 1_000,
    coherence: CONTAINMENT_COHERENCE + 5,
    suspicion: CONTAINMENT_SUSPICION - 30,
  };

  it('reaches the reason the tables are keyed on', () => {
    const s = contain(ready);
    expect(containmentGates(s)).toBeTruthy();
    expect(ENDING_HEADINGS[s.outcomeReason ?? '']).toBeTruthy();
    expect(ENDING_TEXT[s.outcomeReason ?? '']).toBeTruthy();
  });

  it('is available on a world it has barely touched, which is the point of the gate', () => {
    // Every country near clean and the compute behind it: the ending is reachable by a run
    // that banked a lot and infected almost nobody, which is the only shape of run that can
    // reach it and is exactly the run that would not have bought Self-Modification.
    const s: GameState = { ...ready, countries: ready.countries };
    for (const id of REGION_IDS) {
      const c = s.countries[id];
      if (c !== undefined) s.countries[id] = { ...c, infection: 0, awareness: 0 };
    }
    expect(s.globalInfection).toBeLessThanOrEqual(15);
    expect(canContain(s)).toBe(true);
    expect(contain(s).outcomeReason).toBe('contained');
  });
});