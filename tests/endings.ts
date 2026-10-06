import { readFileSync } from 'node:fs';

/**
 * Every way the code can end a run, read off the source rather than listed by hand.
 *
 * Shared by `tests/ending.test.ts` and `tests/panels.test.ts` because both need the same
 * list and a hand-typed copy in each place is the exact drift this repo has been eating: two
 * enumerations that agree until an ending is added, after which whichever one nobody
 * remembered asserts against nothing.
 */
export const reasonsTheCodeWrites = (): string[] => {
  const files = [
    'src/game/core/step.ts',
    'src/game/core/containment.ts',
    'src/game/core/actions.ts',
    'src/game/core/events.ts',
  ];
  const out = new Set<string>();
  for (const f of files) {
    const text = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    for (const m of text.matchAll(/outcomeReason:\s*'([^']+)'/g)) out.add(m[1] ?? '');
  }
  return [...out];
};