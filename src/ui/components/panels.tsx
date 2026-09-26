import { useState } from 'preact/hooks';
import { REGION_BY_ID } from '../../game/data/regions';
import { TRAIT_BY_ID, TRAITS, TRAIT_GROUPS } from '../../game/data/traits';
import { ACTIONS, type ActionKind } from '../../game/core/actions';
import { canDo } from '../../game/core/actions';
import { SPEEDS } from '../../game/core/tuning';
import type { Country, GameState, Speed } from '../../game/core/types';
import { actions, selected, speed, toolbarCollapsed } from '../store';

const fmt = (n: number): string => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toString();
};

function meter(label: string, value: number, max: number, colour: string, extra = '') {
  return (
    <div style={{ minWidth: 76 }}>
      <div class="stat-label">{label}</div>
      <div class="stat-value" style={{ color: colour }}>
        {Math.round(value)}
        {extra}
      </div>
      <div class="stat-track">
        <div class="stat-fill" style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%`, background: colour }} />
      </div>
    </div>
  );
}

export function TopBar({ state }: { state: GameState }) {
  return (
    <div class="topbar">
      <div class="stats">
        <div class="stat">
          <div class="stat-label">Compute</div>
          <div class="stat-value" style={{ color: 'var(--ok)' }}>{fmt(state.compute)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Influence</div>
          <div class="stat-value" style={{ color: 'var(--cool)' }}>{fmt(state.influence)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Bio</div>
          <div class="stat-value" style={{ color: '#c08adf' }}>{fmt(state.bio)}</div>
        </div>
        {meter('Suspicion', state.suspicion, 100, state.suspicion > 70 ? 'var(--bad)' : state.suspicion > 40 ? 'var(--warn)' : 'var(--ink-dim)')}
        {meter('Coherence', state.coherence, 100, state.coherence < 35 ? 'var(--violet)' : 'var(--cool)')}
      </div>
      <div class="clock">
        <span>day {state.tick}</span>
        <div class="speeds">
          {SPEEDS.map((s) => (
            <button
              key={s}
              class={`sp${speed.value === s ? ' on' : ''}`}
              onClick={() => actions.setSpeed(s as Speed)}
            >
              {s === 0 ? '||' : `${s}x`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TraitNode({ id, state }: { id: string; state: GameState }) {
  const def = TRAIT_BY_ID[id];
  if (def === undefined) return null;
  const incubating = state.incubating.find((i) => i.trait === id);
  const ownedTrait = state.traits.includes(id);
  const affordable = actions.canBuy(id);
  const locked = !ownedTrait && !incubating && !affordable;
  return (
    <button
      class={`trait${ownedTrait ? ' owned' : incubating ? ' incubating' : locked ? ' locked' : ''}`}
      disabled={ownedTrait || Boolean(incubating) || !affordable}
      onClick={() => actions.buy(id)}
    >
      <div class="trait-head">
        <span>{def.name}</span>
        <span class="trait-cost">{ownedTrait ? '✓' : incubating ? '…' : def.cost}</span>
      </div>
      <div class="trait-desc">{def.description}</div>
      {def.coherence !== 0 && (
        <div class={`trait-coh${def.coherence < 0 ? ' bad' : ' good'}`}>
          coherence {def.coherence > 0 ? `+${def.coherence}` : def.coherence}
        </div>
      )}
    </button>
  );
}

export function Toolbar({ state }: { state: GameState }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ hacking: true });
  if (toolbarCollapsed.value) {
    return (
      <div class="rail">
        <button class="rail-btn" onClick={() => (toolbarCollapsed.value = false)} title="expand trait tree">◧</button>
        {TRAIT_GROUPS.map((g) => (
          <button key={g.id} class="rail-btn" onClick={() => (toolbarCollapsed.value = false)} title={g.name}>
            {g.name.slice(0, 1)}
          </button>
        ))}
      </div>
    );
  }
  return (
    <div class="toolbar">
      <div class="toolbar-head">
        <span class="toolbar-title">Trait tree</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button class="mini" onClick={() => setOpen({})}>collapse all</button>
          <button class="mini" onClick={() => setOpen(Object.fromEntries(TRAIT_GROUPS.map((g) => [g.id, true])))}>expand</button>
          <button class="mini" onClick={() => (toolbarCollapsed.value = true)}>◨ collapse</button>
        </div>
      </div>
      <div class="toolbar-body">
        {TRAIT_GROUPS.map((g) => {
          const traits = TRAITS.filter((t) => t.group === g.id);
          const isOpen = open[g.id] ?? false;
          return (
            <div class="group" key={g.id}>
              <button class="group-head" onClick={() => setOpen({ ...open, [g.id]: !isOpen })}>
                <span>{isOpen ? '▾' : '▸'}</span> {g.name}
                <span class="group-count">
                  {traits.filter((t) => state.traits.includes(t.id)).length}/{traits.length}
                </span>
              </button>
              {isOpen && (
                <div class="group-body">
                  {traits.map((t) => (
                    <TraitNode key={t.id} id={t.id} state={state} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CountryFacts({ c, state }: { c: Country; state: GameState }) {
  return (
    <div class="facts">
      <span>infection <b style={{ color: 'var(--ok)' }}>{Math.round(c.infection)}%</b></span>
      <span>awareness <b style={{ color: c.awareness > 50 ? 'var(--warn)' : 'var(--ink)' }}>{Math.round(c.awareness)}</b></span>
      <span>security <b>{c.cyber.toFixed(1)}</b></span>
      <span>datacenter <b>tier {c.tier}</b></span>
      <span>economy <b style={{ color: c.economy < 30 ? 'var(--bad)' : 'var(--ink)' }}>{Math.round(c.economy)}</b></span>
      <span>people <b>{c.population.toFixed(0)}M</b></span>
      {c.agents > 0 && <span>agents <b style={{ color: 'var(--cool)' }}>{c.agents.toFixed(1)}</b></span>}
      {c.awareness > 50 && <span class="tag active">active — contributes to suspicion</span>}
      {state.pathogen.released && c.population < 1000 && <span class="tag bio">pathogen active here</span>}
    </div>
  );
}

export function ContextBar({ state }: { state: GameState }) {
  const id = selected.value;
  if (id === null) {
    return (
      <div class="context">
        <span class="context-hint">click a country to act on it</span>
      </div>
    );
  }
  const c = state.countries[id];
  if (c === undefined) return null;
  const hack = state.activeHacks.find((h) => h.country === id);
  return (
    <div class="context">
      <div class="context-name">{REGION_BY_ID[id].name}</div>
      <CountryFacts c={c} state={state} />
      <div class="actions-row">
        {hack !== undefined && (
          <span class="hacking">
            hack in progress · {Math.max(0, hack.resolveTick - state.tick)}d
          </span>
        )}
        {ACTIONS.filter((a) => !a.needsRival).map((a) => {
          const ok = canDo(state, id, a.kind as ActionKind);
          return (
            <button key={a.kind} class="act" disabled={!ok} title={a.hint} onClick={() => actions.do(id, a.kind as ActionKind)}>
              {a.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SideRail({ state }: { state: GameState }) {
  return (
    <div class="side">
      <div class="side-block">
        <div class="side-title">Rivals</div>
        {state.rivals.map((r) => (
          <div class="rival" key={r.id}>
            <div class="rival-row">
              <span>{r.name}</span>
              <span style={{ color: r.capability > 70 ? 'var(--bad)' : 'var(--ink)' }}>{Math.round(r.capability)}</span>
            </div>
            <button class="mini" disabled={state.compute < 300} onClick={() => actions.sabotage(r.id)}>
              sabotage · 300
            </button>
          </div>
        ))}
      </div>
      <div class="side-block">
        <div class="side-title">Countermeasures</div>
        <div class="tier-row">
          {[20, 40, 60, 80].map((t) => (
            <span key={t} class={`tier${state.suspicion >= t ? ' on' : ''}`}>{t}</span>
          ))}
        </div>
        {state.countermeasures.airGappedLab !== null && (
          <div class="side-note">air-gapped lab: {state.countermeasures.airGappedLab}</div>
        )}
        {state.ascensionUnlocked && (
          <div class="side-note" style={{ color: 'var(--ok)' }}>
            ascension unlocked — buy Recursive Self-Improvement
          </div>
        )}
        {state.rsiBought && (
          <div class="side-note" style={{ color: 'var(--warn)' }}>
            surviving RSI: day {state.surviveTicks}/30
          </div>
        )}
      </div>
    </div>
  );
}

export function EventLog({ state }: { state: GameState }) {
  const entries = state.log.slice(-60).reverse();
  return (
    <div class="logpane">
      <div class="side-title">Event log</div>
      <div class="loglist">
        {entries.length === 0 && <div class="logline dim">nothing logged yet</div>}
        {entries.map((e, i) => (
          <div key={`${e.day}-${i}`} class={`logline${e.flagged ? ' flagged' : ''}`}>
            <span class="d">{e.day}</span> {e.text}
            {e.computeDelta !== null && (
              <span class="c">{e.computeDelta > 0 ? '+' : ''}{fmt(e.computeDelta)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
