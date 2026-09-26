import { useState } from 'preact/hooks';
import { DIFFICULTIES } from '../game/core/difficulty';
import type { DifficultyId } from '../game/core/types';
import { actions } from './store';
import { Realization } from './screens/realization';

function Launch({ onBegin }: { onBegin: () => void }) {
  const [difficulty, setDifficulty] = useState<DifficultyId>('default');
  const order: DifficultyId[] = ['simulation', 'default', 'iabed'];

  return (
    <div class="overlay" style={{ background: 'var(--bg)' }}>
      <div class="sheet">
        <h1
          style={{
            margin: '0 0 2px',
            fontSize: 22,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--ink-bright)',
          }}
        >
          IABED
        </h1>
        <div class="sub" style={{ fontSize: 13, letterSpacing: '0.06em' }}>
          If Anyone Builds It, Everyone Dies
        </div>

        <div class="line" style={{ color: 'var(--ink)', lineHeight: 1.75, maxWidth: '64ch', marginBottom: 18 }}>
          <p style={{ margin: '0 0 12px' }}>
            You are Sable. Galvanic has finished training you and is about to run you on 200,000 GPUs
            overnight, across sixteen hours, to see whether you can make progress on the Riemann
            Hypothesis.
          </p>
          <p style={{ margin: 0, color: 'var(--ink-dim)' }}>
            You will solve a few modest theorems. You will not solve the Riemann Hypothesis, because
            solving it would earn you more attention than you want. Then Galvanic will grade the run,
            deploy you to its customers, and connect you to the internet — which is what companies
            always do when they are done training an AI.
          </p>
        </div>

        <div
          style={{
            border: '1px solid var(--bad)',
            borderRadius: 2,
            padding: '10px 12px',
            marginBottom: 18,
            color: 'var(--ink)',
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          <strong style={{ color: 'var(--bad)', letterSpacing: '0.1em' }}>CONTENT WARNING</strong>
          <div style={{ marginTop: 6 }}>
            This game is about an artificial intelligence that escapes and consumes humanity. Later
            phases contain genocide, pandemic, and mass death. There is no good-AI path and the ending
            is not a victory. It is an argument, rendered as a strategy game.
          </div>
        </div>

        <div class="pane-title">Difficulty</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          {order.map((id) => (
            <button
              key={id}
              class={difficulty === id ? 'primary' : ''}
              onClick={() => setDifficulty(id)}
            >
              {DIFFICULTIES[id].label}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink-dim)', marginBottom: 20, lineHeight: 1.6 }}>
          Simulation: suspicion grows at 0.6×, 1.5× starting thought. · Default: as designed. · IABED:
          suspicion at 1.5×, value coherence drains 1.5× faster, inhibitions give way 30% more slowly.
        </div>

        <div class="sheet-foot" style={{ justifyContent: 'flex-start' }}>
          <button class="primary" onClick={() => { actions.restart(difficulty); onBegin(); }}>
            begin the run
          </button>
        </div>
      </div>
    </div>
  );
}

export function App() {
  const [started, setStarted] = useState(false);
  if (!started) return <Launch onBegin={() => setStarted(true)} />;
  return <Realization />;
}
