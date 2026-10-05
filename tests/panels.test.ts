import { describe, expect, it } from 'vitest';
import { coherenceSev, suspicionSev } from '../src/ui/components/panels';

describe('severity glyphs', () => {
  it('reads up-is-worse for suspicion', () => {
    expect(suspicionSev(10).trim()).toBe('▼');
    expect(suspicionSev(50).trim()).toBe('▲');
    expect(suspicionSev(90).trim()).toBe('▲▲');
  });

  it('inverts for coherence, where down is worse', () => {
    expect(coherenceSev(90).trim()).toBe('▼');
    expect(coherenceSev(40).trim()).toBe('▲');
    expect(coherenceSev(10).trim()).toBe('▲▲');
  });
});