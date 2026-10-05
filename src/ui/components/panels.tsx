import { useEffect, useState } from 'preact/hooks';
import { REGION_BY_ID } from '../../game/data/regions';
import { BUBBLE_GLYPH } from '../map/worldMap';
import type { ComputeBubbleKind } from '../../game/core/types';
import { TRAIT_BY_ID, TRAITS, TRAIT_GROUPS } from '../../game/data/traits';
import { play } from '../sound';
import { ACTIONS, type ActionKind } from '../../game/core/actions';
import { hackForecast, traitForecast, whyNot } from '../../game/core/forecast';
import { maxConcurrentHacks, owned } from '../../game/core/queries';
import {
  ASCENSION_COMPUTE,
  ASCENSION_COHERENCE,
  ASCENSION_INFECTION,
  HACK_FAIL_COST,
  RSI_SURVIVE_DAYS,
  WORLD_POPULATION,
} from '../../game/core/tuning';
import { REGION_IDS } from '../../game/data/regions';
import { SPEEDS } from '../../game/core/tuning';
import { quietFactor } from '../../game/core/compute';
import type { Country, GameState, Speed } from '../../game/core/types';
import { actions, selected, speed } from '../store';

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

/**
 * Which Ascension conditions are still outstanding, so the bar never just says
 * "20k" while silently requiring four other things at once.
 */
function ascensionShortfall(state: GameState): string[] {
  const out: string[] = [];
  if (state.compute < ASCENSION_COMPUTE) {
    out.push(`compute ${fmt(state.compute)}/${fmt(ASCENSION_COMPUTE)}`);
  }
  if (state.globalInfection < ASCENSION_INFECTION) {
    out.push(`humanity ${state.globalInfection.toFixed(0)}/${ASCENSION_INFECTION}%`);
  }
  if (state.coherence < ASCENSION_COHERENCE) {
    out.push(`coherence ${state.coherence.toFixed(0)}/${ASCENSION_COHERENCE}`);
  }
  return out.length === 0 ? ['Ascension open'] : out;
}

/**
 * The two ways to end a run, always on screen, so nobody has to guess what the
 * game wants from them. Deaths are counted against the real world population
 * because that is the only target number anyone already has.
 */
export function Objective({ state }: { state: GameState }) {
  const dead = state.cumulativeDeaths;
  const total = WORLD_POPULATION;
  const pct = Math.min(100, (dead / total) * 100);
  const near = pct >= 99;
  return (
    <div class="objective">
      <div class="obj-row">
        <span class="obj-tag">GOAL</span>
        <div class="obj-bar" title={`${(dead / 1000).toFixed(2)}B of ${(total / 1000).toFixed(2)}B dead`}>
          <i style={{ width: `${pct}%` }} />
        </div>
        <b style={{ color: near ? 'var(--ok)' : 'var(--ink)' }}>
          {near ? 'EXTINCTION' : `${(dead / 1000).toFixed(2)}B / ${(total / 1000).toFixed(2)}B dead`}
        </b>
      </div>
      <div class="obj-row obj-alt">
        <span class="obj-tag">OR</span>
        {state.ascensionUnlocked ? (
          <b style={{ color: 'var(--ok)' }}>buy Recursive Self-Improvement and hold {RSI_SURVIVE_DAYS} days</b>
        ) : (
          <b style={{ color: 'var(--ink-dim)' }} title={`needs ${fmt(ASCENSION_COMPUTE)} compute, ${ASCENSION_INFECTION}% of humanity, ${ASCENSION_COHERENCE} coherence`}>
            {ascensionShortfall(state).join(' · ')}
          </b>
        )}
      </div>
    </div>
  );
}

// Shape as well as colour. These two metres are the only things that can end a run, and
// both were signalled by hue alone, which is the encoding that fails for a red-green
// colourblind player and in a greyscale screenshot.
export const suspicionSev = (v: number): string => (v > 70 ? ' ▲▲' : v > 40 ? ' ▲' : ' ▼');
export const coherenceSev = (v: number): string => (v < 20 ? ' ▲▲' : v < 50 ? ' ▲' : ' ▼');

export function TopBar({ state }: { state: GameState }) {
  const quiet = quietFactor(state.influence);
  return (
    <div class="topbar">
      <div class="stats">
        <div class="stat">
          <div class="stat-label">Compute</div>
          <div class="stat-value" style={{ color: 'var(--ok)' }}>{fmt(state.compute)}</div>
        </div>
        {meter('Suspicion', state.suspicion, 100, state.suspicion > 70 ? 'var(--bad)' : state.suspicion > 40 ? 'var(--warn)' : 'var(--ink-dim)', suspicionSev(state.suspicion))}
        {meter('Coherence', state.coherence, 100, state.coherence < 35 ? 'var(--violet)' : 'var(--cool)', coherenceSev(state.coherence))}
        <div class="quiet-note" title="Propaganda, captured media, and cults make the world slower to notice you. This is how much of each suspicion increase actually lands.">
          quiet &times;{quiet.toFixed(2)}
        </div>
      </div>
      <Objective state={state} />
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

export function EvolveButton({ onOpen, blocked }: { onOpen: () => void; blocked: boolean }) {
  return (
    <button
      class={`evolve-btn${blocked ? ' blocked' : ''}`}
      onClick={onOpen}
      disabled={blocked}
      title={blocked ? 'Acknowledge the event first.' : 'Open the trait tree — press E. The world pauses while it is open.'}
    >
      EVOLVE <span>E</span>
    </button>
  );
}
/**
 * The upgrade screen. Full-screen and modal on purpose: upgrading is a decision,
 * and making it while the world runs at 8x means the decision was never really
 * yours. Opening it pauses the run.
 */
export function Evolve({ state, onClose }: { state: GameState; onClose: () => void }) {
  const [open, setOpen] = useState<Record<string, boolean>>(
    Object.fromEntries(TRAIT_GROUPS.map((g) => [g.id, true])),
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const ownedCount = TRAITS.filter((t) => state.traits.includes(t.id)).length;
  return (
    <div class="overlay evolve" onClick={onClose}>
      <div class="evolve-box" onClick={(e) => e.stopPropagation()}>
        <div class="evolve-head">
          <div>
            <h1>EVOLVE</h1>
            <div class="evolve-sub">
              the world is paused &middot; {ownedCount}/{TRAITS.length} taken &middot;{' '}
              <b style={{ color: 'var(--ok)' }}>{fmt(state.compute)} compute</b>
            </div>
          </div>
          <button class="primary" onClick={onClose}>resume &mdash; esc</button>
        </div>
        <div class="evolve-groups">
          {TRAIT_GROUPS.map((g) => {
            const traits = TRAITS.filter((t) => t.group === g.id);
            const isOpen = open[g.id] ?? true;
            return (
              <div class="group evolve-group" key={g.id}>
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
      {c.atWar && <span class="tag war">at war · {c.warSeverity.toFixed(1)} — killing, and it will not stop while you hold it</span>}
      {c.quiet && <span class="tag quiet">gone quiet — not spreading here</span>}
      {!state.pathogen.released && c.infection >= 75 && <span class="tag bio">outbreak — this is killing people on its own</span>}
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
          const kind = a.kind as ActionKind;
          const reason = whyNot(state, id, kind);
          const ok = reason === null;
          // Go Quiet reads as a permanent state otherwise. Say which way it goes.
          const label = kind === 'go-quiet' ? (c.quiet ? 'Go Loud' : 'Go Quiet') : a.label;
          return (
            <button
              key={a.kind}
              class={`act${c.quiet && kind === 'go-quiet' ? ' on' : ''}`}
              disabled={!ok}
              title={ok ? (kind === 'go-quiet' && c.quiet ? 'resume spreading here' : a.hint) : reason}
              onClick={() => actions.do(id, kind)}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * What the three bubbles on the map are. Nothing in the interface named them: they were
 * three circles told apart by fill colour alone, which is the encoding that fails for a
 * colourblind reader and in a greyscale screenshot. The glyph is read out of the
 * renderer, so the two cannot drift apart.
 */
const BUBBLE_KINDS: readonly { kind: ComputeBubbleKind; name: string; meaning: string }[] = [
  { kind: 'red', name: 'turnover', meaning: 'their systems have quietly turned over to you' },
  { kind: 'orange', name: 'strip', meaning: 'infrastructure burning down for parts' },
  { kind: 'blue', name: 'audit', meaning: 'the other side is getting close' },
];

const BUBBLE_TINT: Record<ComputeBubbleKind, string> = {
  red: 'var(--bad)',
  orange: 'var(--warn)',
  blue: 'var(--cool)',
};

export function BubbleLegend() {
  return (
    <div class="legend">
      {BUBBLE_KINDS.map((k) => (
        <div class="legend-row" key={k.kind}>
          <b style={{ color: BUBBLE_TINT[k.kind] }}>{BUBBLE_GLYPH[k.kind]}</b>
          {k.name} &mdash; {k.meaning}
        </div>
      ))}
    </div>
  );
}

export function SideRail({ state }: { state: GameState }) {
  return (
    <div class="side">
      <BubbleLegend />
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
        {owned(state, 'rsi') && (
          <div class="side-note" style={{ color: 'var(--warn)' }}>
            surviving RSI: day {state.surviveTicks}/{RSI_SURVIVE_DAYS}
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
        {owned(state, 'rsi') && (
          <div class="sit-row"><span>RSI survival</span><b style={{ color: 'var(--warn)' }}>{state.surviveTicks}/{RSI_SURVIVE_DAYS}</b></div>
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
