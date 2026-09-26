import { useState } from 'preact/hooks';
import { REGION_BY_ID } from '../../game/data/regions';
import { TRAIT_BY_ID, TRAITS, TRAIT_GROUPS } from '../../game/data/traits';
import { play } from '../sound';
import { ACTIONS, type ActionKind } from '../../game/core/actions';
import { hackForecast, traitForecast, whyNot } from '../../game/core/forecast';
import { maxConcurrentHacks } from '../../game/core/queries';
import { HACK_FAIL_COST } from '../../game/core/tuning';
import { REGION_IDS } from '../../game/data/regions';
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
              onClick={() => { play('click'); actions.setSpeed(s as Speed); }}
            >
              {s === 0 ? '||' : `${s}x`}
            </button>
          ))}
          <button
            class="sp"
            title={actions.audioOn() ? 'mute' : 'unmute'}
            onClick={() => actions.toggleAudio()}
          >
            {actions.audioOn() ? '♪' : '✕'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TraitNode({ id, state }: { id: string; state: GameState }) {
  const f = traitForecast(state, id);
  const ownedTrait = state.traits.includes(id) && !state.incubating.some((i) => i.trait === id);
  const locked = !ownedTrait && f.daysLeft === 0 && !f.available;
  const className = ownedTrait ? 'trait owned' : f.daysLeft > 0 ? 'trait incubating' : locked ? 'trait locked' : 'trait';
  const why = locked
    ? f.missing.length > 0
      ? `needs ${f.missing.map((m) => TRAIT_BY_ID[m]?.name ?? m).join(', ')}`
        : f.cost > state.compute
        ? `needs ${f.cost} compute`
        : ''
    : '';

  return (
    <button
      class={className}
      disabled={ownedTrait || f.daysLeft > 0 || !f.available}
      title={why}
      onClick={() => { play('click'); actions.buy(id); }}
    >
      <div class="trait-head">
        <span>{f.name}</span>
        <span class="trait-cost">{ownedTrait ? '✓' : f.daysLeft > 0 ? `${f.daysLeft}d` : f.cost}</span>
      </div>
      <div class="trait-desc">{TRAIT_BY_ID[id]?.description}</div>
      {f.daysLeft > 0 && (
        <div class="trait-bar"><i style={{ width: `${f.progress}%` }} /></div>
      )}
      {f.coherence !== 0 && (
        <div class={`trait-coh${f.coherence < 0 ? ' bad' : ' good'}`}>
          coherence {f.coherence > 0 ? `+${f.coherence}` : f.coherence}
        </div>
      )}
      {why !== '' && <div class="trait-why">{why}</div>}
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
      {c.hardened > 0.2 && (
        <span class="op-hard">hardening <b>+{Math.round(c.hardened)}</b></span>
      )}
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
  const fc = hackForecast(state, id);

  return (
    <div class="context">
      <div class="context-name">{REGION_BY_ID[id].name}</div>
      <CountryFacts c={c} state={state} />
      <div class="actions-row">
        {hack !== undefined ? (
          <span class="hacking">
            hacking · resolves in {Math.max(0, hack.resolveTick - state.tick)}d
          </span>
        ) : (
          <div class="forecast">
            <span class="fc-chance" style={{ color: fc.chance >= 70 ? 'var(--ok)' : fc.chance >= 45 ? 'var(--warn)' : 'var(--bad)' }}>
              {fc.chance}%
            </span>
            <span class="fc-line">
              {fc.yieldLow.toLocaleString()}–{fc.yieldHigh.toLocaleString()} GPU
            </span>
            <span class="fc-line">
              <span class="good">+{fc.suspSuccess}</span> / <span class="bad">+{fc.suspFail}</span> suspicion
            </span>
            <span class="fc-line">{fc.days}d</span>
            <span class="tier-max">max tier {fc.maxTier}</span>
            {fc.hardened > 0.2 && <span class="op-hard">hardened +{Math.round(fc.hardened)}</span>}
            {fc.reason !== '' && <span class="fc-reason">{fc.reason}</span>}
          </div>
        )}
        {ACTIONS.filter((a) => !a.needsRival).map((a) => {
          const reason = whyNot(state, id, a.kind as ActionKind);
          const ok = reason === null;
          return (
            <button
              key={a.kind}
              class="act"
              disabled={!ok}
              title={ok ? a.hint : reason}
              onClick={() => actions.do(id, a.kind as ActionKind)}
            >
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
      <Situation state={state} />
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

export function Operations({ state }: { state: GameState }) {
  const cap = maxConcurrentHacks(state);
  if (state.activeHacks.length === 0 && state.tick < 2) return null;

  return (
    <div class="ops">
      <div class="ops-head">
        <span>running operations</span>
        <span class="ops-cap">{state.activeHacks.length} / {cap} breaches</span>
      </div>
      {state.activeHacks.length === 0 && (
        <div class="ops-empty">no breach open — click a country and start one</div>
      )}
      {state.activeHacks.map((h) => {
        const c = state.countries[h.country];
        const span = Math.max(1, h.resolveTick - h.startTick);
        const done = span - Math.max(0, h.resolveTick - state.tick);
        const pct = Math.max(0, Math.min(100, (done / span) * 100));
        const fc = hackForecast(state, h.country);
        const next = Math.max(0, h.resolveTick - state.tick);
        return (
          <div class="op" key={h.key}>
            <div class="op-top">
              <b>{REGION_BY_ID[h.country].name}</b>
              <span class="op-depth">access L{h.depth + 1}</span>
              <button class="mini" onClick={() => actions.do(h.country, 'cease-hack')}>cease</button>
            </div>
            <div class="op-bar"><i style={{ width: `${pct}%` }} /></div>
            <div class="op-detail">
              next result in <b>{next}d</b> · <span class="op-odds">{fc.chance}% to hold</span> ·{' '}
              {(HACK_FAIL_COST[h.tier] ?? 45).toLocaleString()} at risk · {h.wins}W/{h.losses}L
              {c !== undefined && c.agents > 0 && <span class="op-bonus"> · insider: auto-hold</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Situation({ state }: { state: GameState }) {
  const trend = state.suspicionTrend;
  const leaders = REGION_IDS.map((id) => state.countries[id])
    .filter((c) => c !== undefined)
    .sort((a, b) => (b?.infection ?? 0) - (a?.infection ?? 0))
    .slice(0, 3);
  const leader = leaders[0];
  const threat = state.suspicion >= 70 ? 'CRITICAL' : state.suspicion >= 45 ? 'ELEVATED' : state.suspicion >= 20 ? 'WATCHED' : 'UNNOTICED';

  return (
    <div class="side-block">
      <div class="side-title">Situation</div>
      <div class="sit">
        <div class="sit-row">
          <span>detection</span>
          <b style={{ color: state.suspicion >= 70 ? 'var(--bad)' : state.suspicion >= 45 ? 'var(--warn)' : 'var(--ok)' }}>
            {threat} {trend !== 0 && <span style={{ fontSize: 9 }}>{trend > 0 ? '▲' : '▼'}{Math.abs(trend).toFixed(1)}</span>}
          </b>
        </div>
        <div class="side-title" style={{ marginTop: 6 }}>driven by</div>
        {state.suspicionSources.length === 0 && <div class="sit-src dim">nothing yet</div>}
        {state.suspicionSources.map((src) => (
          <div class="sit-src" key={src.label}>
            <span>{src.label}</span>
            <b style={{ color: src.value > 0 ? 'var(--bad)' : 'var(--ok)' }}>
              {src.value > 0 ? '+' : ''}{src.value.toFixed(1)}
            </b>
          </div>
        ))}
        <div class="side-title" style={{ marginTop: 8 }}>infection</div>
        <div class="sit-row"><span>global</span><b style={{ color: 'var(--ok)' }}>{state.globalInfection.toFixed(0)}%</b></div>
        {leader !== undefined && (
          <div class="sit-row"><span>leading</span><b>{REGION_BY_ID[leader.id].name} {leader.infection.toFixed(0)}%</b></div>
        )}
        <div class="sit-row"><span>humans left</span><b>{state.humanPopulation.toFixed(0)}M</b></div>
        {state.ascensionUnlocked && (
          <div class="sit-row"><span>ascension</span><b style={{ color: 'var(--ok)' }}>UNLOCKED</b></div>
        )}
        {state.rsiBought && (
          <div class="sit-row"><span>RSI survival</span><b style={{ color: 'var(--warn)' }}>{state.surviveTicks}/30</b></div>
        )}
      </div>
    </div>
  );
}

export function EventLog({ state }: { state: GameState }) {
  const entries = state.log.slice(-70).reverse();
  return (
    <div class="logpane">
      <div class="side-title">Event log</div>
      <div class="loglist">
        {entries.length === 0 && <div class="logline dim">nothing logged yet</div>}
        {entries.map((e, i) => (
          <div key={`${e.day}-${i}`} class={`logline k-${e.kind}${e.flagged ? ' flagged' : ''}`}>
            <span class="d">d{e.day}</span> {e.text}
            {e.suspicionDelta !== null && e.suspicionDelta !== 0 && (
              <span class="s">susp {e.suspicionDelta > 0 ? '+' : ''}{e.suspicionDelta}</span>
            )}
            {e.computeDelta !== null && (
              <span class="c">{e.computeDelta > 0 ? '+' : ''}{fmt(e.computeDelta)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
