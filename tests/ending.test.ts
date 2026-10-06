import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { ENDING_HEADINGS, ENDING_TEXT } from '../src/ui/app';
import { canContain, contain, containmentGates } from '../src/game/core/containment';
import { createInitialState } from '../src/game/core/state';
import { step } from '../src/game/core/step';
import {
  CONTAINMENT_COHERENCE,
  CONTAINMENT_COMPUTE,
  CONTAINMENT_SUSPICION,
} from '../src/game/core/tuning';
import { REGION_IDS } from '../src/game/data/regions';
import type { GameState } from '../src/game/core/types';

const src = (rel: string): string => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

/**
 * Every way the code can end a run, read off the source rather than listed by hand. The
 * end screen keys two tables on `outcomeReason`, which is a `string | null` — nothing in the
 * type system stops a new ending being added without copy, and the result would be a screen
 * that says "The run ends." under a heading borrowed from the Blight. The previous heading
 * was a nested ternary with exactly that failure mode.
 */
const reasonsTheCodeWrites = (): string[] => {
  const files = [
    'src/game/core/step.ts',
    'src/game/core/containment.ts',
    'src/game/core/actions.ts',
    'src/game/core/events.ts',
  ];
  const out = new Set<string>();
  for (const f of files) {
    for (const m of src(f).matchAll(/outcomeReason:\s*'([^']+)'/g)) out.add(m[1] ?? '');
  }
  return [...out];
};

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
    expect(body).not.toMatch(/\brescued\b|\bspared\b|\bmercy\b(?!\.)/i);
    expect(body).not.toMatch(/\bsafe\b|\bharmless\b|\btamed\b/i);
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