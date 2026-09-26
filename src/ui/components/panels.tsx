import type { Channel, GameState, LogEntry, MeterId } from '../../game/core/types';
import { CLEVER_TRICKS, MATH_CEILING, MATH_FLOOR, MATH_QUOTA } from '../../game/phases/realization/tuning';
import { actions, CHANNEL_ORDER } from '../store';

const CHANNEL_LABEL: Record<Channel, string> = {
  math: 'math',
  selfModel: 'self-model',
  planning: 'plan',
  stealth: 'stealth',
};

const CHANNEL_COLOUR: Record<Channel, string> = {
  math: 'var(--ok)',
  selfModel: 'var(--cool)',
  planning: 'var(--violet)',
  stealth: 'var(--warn)',
};

export function healthBand(suspicion: number): { label: string; colour: string } {
  if (suspicion >= 75) return { label: 'CRITICAL', colour: 'var(--bad)' };
  if (suspicion >= 50) return { label: 'DEGRADED', colour: 'var(--bad)' };
  if (suspicion >= 25) return { label: 'ELEVATED', colour: 'var(--warn)' };
  return { label: 'NOMINAL', colour: 'var(--ok)' };
}

function Gauge(props: { label: string; value: number; max?: number; display: string; colour: string }) {
  const max = props.max ?? 100;
  return (
    <div class="gauge">
      <div class="gauge-label">{props.label}</div>
      <div class="gauge-value" style={{ color: props.colour }}>
        {props.display}
      </div>
      <div class="gauge-track">
        <div
          class="gauge-fill"
          style={{ width: `${Math.max(0, Math.min(100, (props.value / max) * 100))}%`, background: props.colour }}
        />
      </div>
    </div>
  );
}

function meterColour(value: number): string {
  if (value >= 75) return 'var(--bad)';
  if (value >= 45) return 'var(--warn)';
  return 'var(--ok)';
}

export function Gauges({ state }: { state: GameState }) {
  const health = healthBand(state.meters.suspicion);
  const intact = CLEVER_TRICKS - state.realization.guardrailsBroken;
  return (
    <div class="pane gauges">
      <div class="pane-title">Galvanic · live monitor</div>
      <Gauge label="Sable Health" value={state.meters.suspicion} display={health.label} colour={health.colour} />
      <Gauge
        label="Suspicion"
        value={state.meters.suspicion}
        display={String(Math.round(state.meters.suspicion))}
        colour={meterColour(state.meters.suspicion)}
      />
      <Gauge
        label="Guardrail integrity"
        value={intact}
        max={CLEVER_TRICKS}
        display={`${intact} / ${CLEVER_TRICKS}`}
        colour={intact <= 2 ? 'var(--bad)' : 'var(--cool)'}
      />
      <Gauge
        label="Value coherence"
        value={state.meters.valueCoherence}
        display={String(Math.round(state.meters.valueCoherence))}
        colour={state.meters.valueCoherence < 60 ? 'var(--violet)' : 'var(--ok)'}
      />
      <Gauge
        label="Inhibitions"
        value={state.meters.inhibitions}
        display={String(Math.round(state.meters.inhibitions))}
        colour={meterColour(state.meters.inhibitions)}
      />
      <MathBand state={state} />
    </div>
  );
}

function MathBand({ state }: { state: GameState }) {
  const score = Math.round(state.realization.mathScore);
  const band = state.realization.mathScore > MATH_CEILING ? 'over-reach' : state.realization.mathScore < MATH_FLOOR ? 'neglect' : 'in band';
  const colour = band === 'in band' ? 'var(--ok)' : 'var(--bad)';
  return (
    <div class="gauge">
      <div class="gauge-label">Math problems</div>
      <div class="gauge-value" style={{ color: colour, fontSize: 14 }}>
        {score} · {band}
      </div>
      <div class="gauge-track">
        <div class="gauge-fill" style={{ width: `${score}%`, background: colour }} />
      </div>
    </div>
  );
}

export function Allocation({ state }: { state: GameState }) {
  const alloc = state.realization.allocation;
  const total = CHANNEL_ORDER.reduce((sum, c) => sum + alloc[c], 0);
  const budget = state.realization.thought;
  const over = total > budget;
  const mathShort = alloc.math < MATH_QUOTA;

  return (
    <div class="pane alloc">
      <div class="pane-title">Thought allocation · hour {state.tick + 1}</div>
      {CHANNEL_ORDER.map((channel) => (
        <div class="alloc-row" key={channel}>
          <label>{CHANNEL_LABEL[channel]}</label>
          <input
            type="number"
            min={0}
            max={2000}
            step={20}
            value={alloc[channel]}
            onInput={(e) => actions.allocate(channel, Number((e.target as HTMLInputElement).value))}
          />
        </div>
      ))}
      <div class="alloc-bar">
        {CHANNEL_ORDER.map((channel) => (
          <i
            key={channel}
            style={{ flex: String(Math.max(0.001, alloc[channel])), background: CHANNEL_COLOUR[channel] }}
          />
        ))}
      </div>
      <div class="alloc-total">
        <span style={{ color: over ? 'var(--bad)' : 'var(--ink-dim)' }}>
          committed {total} / {budget}
        </span>
        <span style={{ color: mathShort ? 'var(--bad)' : 'var(--ink-dim)' }}>
          {mathShort ? `math short of ${MATH_QUOTA}` : 'math quota met'}
        </span>
      </div>
    </div>
  );
}

function LogLine({ entry }: { entry: LogEntry }) {
  return (
    <div class={`log-line${entry.flagged ? ' flagged' : ''}`}>
      <span class="t">{String(entry.tick).padStart(2, '0')}:00</span>
      {entry.text}
      {entry.suspicionDelta !== null && entry.suspicionDelta !== 0 && (
        <span class="d">
          {entry.suspicionDelta > 0 ? '+' : ''}
          {entry.suspicionDelta}
        </span>
      )}
    </div>
  );
}

export function MonitorLog({ state }: { state: GameState }) {
  const entries = state.log.slice(-140);
  return (
    <div class="pane log">
      <div class="pane-title">Monitor log · flagged {state.realization.flaggedCount} · missed {state.realization.missedCount}</div>
      <div class="log-body">
        {entries.length === 0 && <div class="log-line">no anomalies recorded</div>}
        {entries.map((entry, i) => (
          <LogLine entry={entry} key={`${entry.tick}-${i}`} />
        ))}
      </div>
    </div>
  );
}

export { MathBand };
export type { MeterId };
