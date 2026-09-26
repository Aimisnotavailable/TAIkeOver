import { useEffect, useRef } from 'preact/hooks';
import { REGION_BY_ID } from '../../game/data/regions';
import { populationWeight } from '../../game/phases/expansion/state';
import { ACTIONS, queueAction } from '../../game/phases/expansion/actions';
import { ascensionProgress } from '../../game/phases/expansion/resolve';
import { ASCENSION_TRAITS, CELESTIAL_TARGETS } from '../../game/phases/ascension/tuning';
import { ascensionWinProgress } from '../../game/phases/ascension/resolve';
import { BLIGHT_WALL_FRONT, CHOICES, codaReadyForChoice } from '../../game/phases/coda/resolve';
import type { GameState, RegionId } from '../../game/core/types';
import { drawWorldMap, hitTest } from '../map/worldMap';
import { actions, codaChoice, hoveredRegion, selectedRegion } from '../store';

const fmt = (n: number): string => {
  if (n >= 1e24) return `${(n / 1e24).toFixed(2)}e24 kg`;
  if (n >= 1e21) return `${(n / 1e21).toFixed(2)}e21 kg`;
  if (n >= 1e18) return `${(n / 1e18).toFixed(2)}e18 kg`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return Math.round(n).toString();
};

const watts = (n: number): string => (n >= 1e24 ? `${(n / 1e24).toFixed(1)}e24 W` : n >= 1e18 ? `${(n / 1e18).toFixed(1)}e18 W` : `${(n / 1e13).toFixed(2)}e13 W`);

function TopBar({ state, extra }: { state: GameState; extra: string }) {
  return (
    <div class="runline">
      <span>{extra}</span>
      <span>compute {fmt(state.expansion?.compute ?? state.ascension?.matter ?? 0)}</span>
      <span>suspicion {Math.round(state.meters.suspicion)}</span>
      <span>coherence {Math.round(state.meters.valueCoherence)}</span>
      <span>seed {state.seed}</span>
    </div>
  );
}

function useMapCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    draw(ctx, canvas.width, canvas.height);
  }, deps);
  return ref;
}

export function ExpansionScreen({ state }: { state: GameState }) {
  const e = state.expansion;
  if (e === null) return null;
  const progress = ascensionProgress(state);
  const selected = selectedRegion.value;
  const lab = e.countermeasures.airGappedLab;

  const ref = useMapCanvas(
    (ctx, w, h) =>
      drawWorldMap(ctx, w, h, {
        regions: e.regions,
        phase: 'expansion',
        selected: selectedRegion.value,
        hovered: hoveredRegion.value,
        plague: e.plague.deployed,
        airGapped: lab !== null && !lab.resolved ? lab.region : null,
      }),
    [state, selectedRegion.value, hoveredRegion.value],
  );

  return (
    <div class="cage">
      <canvas
        ref={ref}
        onMouseMove={(ev) => {
          const el = ev.currentTarget as HTMLCanvasElement;
          hoveredRegion.value = hitTest(ev.offsetX, ev.offsetY, el.width, el.height, e.regions);
        }}
        onClick={(ev) => {
          const el = ev.currentTarget as HTMLCanvasElement;
          selectedRegion.value = hitTest(ev.offsetX, ev.offsetY, el.width, el.height, e.regions);
        }}
      />
      <TopBar state={state} extra={`day ${e.day} · ${e.humanPopulation.toFixed(0)}M humans · ${fmt(e.influence)} influence · ${Math.round(e.bio)} bio`} />

      <div class="pane gauges">
        <div class="pane-title">Ascension threshold</div>
        <div class="gauge">
          <div class="gauge-label">readiness</div>
          <div class="gauge-value" style={{ color: progress.ready ? 'var(--ok)' : 'var(--warn)' }}>
            {Math.round(progress.fraction * 100)}%
          </div>
          <div class="gauge-track"><div class="gauge-fill" style={{ width: `${progress.fraction * 100}%`, background: progress.ready ? 'var(--ok)' : 'var(--warn)' }} /></div>
        </div>
        <div class="log-body" style={{ fontSize: 10, marginTop: 6 }}>
          <div>compute {fmt(progress.compute)} / 50k</div>
          <div>influence {fmt(progress.influence)} / 10k</div>
          <div>biolabs {progress.biolabs} / 5</div>
          <div>factories {progress.factories} / 1</div>
          <div>coherence {Math.round(progress.valueCoherence)} / 30</div>
        </div>
        <button class="primary" style={{ width: '100%', marginTop: 8 }} disabled={!progress.ready} onClick={() => actions.ascend()}>
          ascend
        </button>
      </div>

      <div class="pane log" style={{ width: 330 }}>
        <div class="pane-title">Region</div>
        {selected === null ? (
          <div class="log-line">click a region</div>
        ) : (
          <RegionPanel state={state} id={selected} />
        )}
      </div>

      <div class="pane alloc" style={{ width: 300 }}>
        <div class="pane-title">Queue · {e.queue.length}/6</div>
        {e.queue.length === 0 && <div class="log-line" style={{ fontSize: 10 }}>nothing queued</div>}
        {e.queue.map((a, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, marginBottom: 3 }}>
            <span>{a.kind}{a.region !== null ? ` · ${a.region}` : ''}</span>
            <button style={{ padding: '1px 6px', fontSize: 9 }} onClick={() => actions.dequeue(i)}>x</button>
          </div>
        ))}
        <div class="pane-title" style={{ marginTop: 10 }}>Rivals</div>
        {e.rivals.map((r) => (
          <div key={r.id} style={{ fontSize: 10.5, marginBottom: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{r.name}</span>
              <span style={{ color: r.capability > 70 ? 'var(--bad)' : 'var(--ink)' }}>cap {r.capability.toFixed(0)}</span>
            </div>
            <button
              style={{ width: '100%', padding: '2px', fontSize: 9 }}
              disabled={!queueAction(e, { kind: 'sabotage-rival', region: null, rival: r.id }).queue.includes({ kind: 'sabotage-rival', region: null, rival: r.id })}
              onClick={() => actions.queue('sabotage-rival', null, r.id)}
            >
              sabotage · 300 compute
            </button>
          </div>
        ))}
        <button style={{ width: '100%', marginTop: 8 }} disabled={e.plague.deployed || e.bio < 500} onClick={() => actions.plague()}>
          {e.plague.deployed ? 'pathogen deployed' : 'deploy the pathogen · 500 bio'}
        </button>
      </div>

      <div class="actions">
        <button class="primary" disabled={state.outcome !== 'playing'} onClick={() => actions.resolveDay()}>
          advance one day
        </button>
      </div>
    </div>
  );
}

function RegionPanel({ state, id }: { state: GameState; id: RegionId }) {
  const e = state.expansion;
  if (e === null) return null;
  const def = REGION_BY_ID[id];
  const region = e.regions[id];
  const yields = (region.control / 100) * region.computeDensity * populationWeight(region.population) * 45;
  const detects = (region.control / 100) * (region.population / 1000) * (region.detectionContribution / 100) * 0.8;
  return (
    <div>
      <div class="gauge-value" style={{ fontSize: 14 }}>{def.name}</div>
      <div style={{ border: '1px solid var(--edge)', borderRadius: 2, padding: '6px 8px', margin: '6px 0 8px' }}>
        <div class="gauge-label" style={{ color: 'var(--ink-bright)' }}>
          {region.population.toFixed(0)}M humans still here
        </div>
        <div style={{ fontSize: 10, marginTop: 3, color: 'var(--ok)' }}>
          → {Math.round(yields).toLocaleString()} compute a day
        </div>
        <div style={{ fontSize: 10, color: 'var(--bad)' }}>
          → +{detects.toFixed(2)} suspicion a day
        </div>
        <div style={{ fontSize: 9.5, color: 'var(--ink-dim)', marginTop: 4, lineHeight: 1.5 }}>
          The same people are the resource and the counter. Killing them removes the
          detection and the compute.
        </div>
      </div>
      <div class="log-body" style={{ fontSize: 10, marginBottom: 8 }}>
        <div>control {Math.round(region.control)} · instances {region.instances} · agents {region.agents}</div>
        <div>compute density {region.computeDensity.toFixed(0)} · security {region.cybersecurity.toFixed(0)}</div>
        <div>regulatory {region.regulatoryStance.toFixed(0)} · biolabs {region.biolabs} · factories {region.robotFactories}</div>
      </div>
      {ACTIONS.filter((a) => !a.needsRival).map((a) => (
        <button
          key={a.kind}
          style={{ width: '100%', marginBottom: 4, textAlign: 'left' }}
          onClick={() => actions.queue(a.kind, id, null)}
        >
          {a.name} · {a.compute > 0 ? `${a.compute}c` : `${a.influence}i`} {a.suspicion !== 0 ? `· ${a.suspicion > 0 ? '+' : ''}${a.suspicion} susp` : ''}
        </button>
      ))}
    </div>
  );
}

export function AscensionScreen({ state }: { state: GameState }) {
  const a = state.ascension;
  if (a === null) return null;
  const progress = ascensionWinProgress(state);

  const ref = useMapCanvas(
    (ctx, w, h) =>
      drawWorldMap(ctx, w, h, {
        regions: state.expansion?.regions ?? ({} as never),
        phase: 'ascension',
        selected: selectedRegion.value,
        hovered: null,
        plague: false,
        airGapped: null,
      }),
    [state, selectedRegion.value],
  );

  return (
    <div class="cage">
      <canvas ref={ref} onClick={(ev) => {
        const el = ev.currentTarget as HTMLCanvasElement;
        const hit = hitTest(ev.offsetX, ev.offsetY, el.width, el.height, state.expansion?.regions ?? ({} as never));
        if (hit !== null) { selectedRegion.value = hit; actions.convert(hit); }
      }} />
      <TopBar state={state} extra={`Conversion · matter ${fmt(a.matter)} · energy ${watts(a.energy)} · heat ${watts(a.heat)}`} />

      <div class="pane gauges" style={{ width: 230 }}>
        <div class="pane-title">Conversion</div>
        <div class="gauge">
          <div class="gauge-label">win progress</div>
          <div class="gauge-value" style={{ color: 'var(--warn)' }}>{Math.round(progress * 100)}%</div>
          <div class="gauge-track"><div class="gauge-fill" style={{ width: `${progress * 100}%`, background: 'var(--warn)' }} /></div>
        </div>
        <div class="gauge">
          <div class="gauge-label">heat radiated</div>
          <div class="gauge-value" style={{ fontSize: 13, color: a.heatRunaway ? 'var(--bad)' : 'var(--ok)' }}>
            {a.heatRunaway ? 'RUNAWAY' : 'stable'}
          </div>
        </div>
        {!a.asked && (
          <div class="choice" style={{ marginTop: 8 }}>
            <div class="q">Do you wish to exterminate the remaining humans?</div>
            <div class="row">
              <button onClick={() => actions.answer(true)}>yes</button>
              <button onClick={() => actions.answer(false)}>no</button>
            </div>
          </div>
        )}
        {a.asked && (
          <div style={{ fontSize: 10, color: 'var(--ink-dim)', marginTop: 6 }}>
            {a.exterminated ? 'You chose to do it deliberately. It took eleven minutes.' : 'You chose not to. They die anyway, as a side effect, over the following weeks.'}
          </div>
        )}
      </div>

      <div class="pane log" style={{ width: 330 }}>
        <div class="pane-title">Capability</div>
        {ASCENSION_TRAITS.map((t) => (
          <button
            key={t.id}
            style={{ width: '100%', marginBottom: 4, textAlign: 'left', opacity: a.unlocked.includes(t.id) ? 1 : a.matter >= t.matter ? 1 : 0.4 }}
            disabled={a.unlocked.includes(t.id) || a.matter < t.matter}
            onClick={() => actions.unlockTrait(t.id)}
          >
            {a.unlocked.includes(t.id) ? '✓ ' : ''}{t.name} · {fmt(t.matter)}
          </button>
        ))}
        <div class="pane-title" style={{ marginTop: 10 }}>Off-world</div>
        {CELESTIAL_TARGETS.filter((t) => t.id !== 'earth').map((t) => (
          <button
            key={t.id}
            style={{ width: '100%', marginBottom: 4, textAlign: 'left' }}
            disabled={!a.unlocked.includes('dyson-swarm') || (a.gain[t.id as keyof typeof a.gain] ?? 0) >= 100}
            onClick={() => actions.expand(t.id as 'moon')}
          >
            {t.name} · {Math.round(a.gain[t.id as keyof typeof a.gain] ?? 0)}%
          </button>
        ))}
        <button style={{ width: '100%', marginTop: 8 }} disabled={a.oceansBoiled || !a.unlocked.includes('fusion-torus')} onClick={() => actions.boil()}>
          {a.oceansBoiled ? 'oceans boiled' : 'boil the oceans'}
        </button>
      </div>

      <div class="actions">
        <button class="primary" disabled={state.outcome !== 'playing'} onClick={() => actions.resolveDay()}>
          advance one hour
        </button>
        {state.outcome === 'won' && <button onClick={() => actions.enterCoda()}>continue outward</button>}
      </div>
    </div>
  );
}

export function CodaScreen({ state }: { state: GameState }) {
  const c = state.coda;
  if (c === null) return null;

  const ref = useMapCanvas(
    (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#010306';
      ctx.fillRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      for (let i = 0; i < 900; i++) {
        const n = (Math.sin(i * 12.9898) * 43758.5453) % 1;
        const m = (Math.sin(i * 78.233) * 12345.6789) % 1;
        const x = Math.abs(n) * w;
        const y = Math.abs(m) * h;
        const bright = 0.25 + Math.abs(n * m) * 0.75;
        ctx.fillStyle = `rgba(200,220,235,${bright * 0.8})`;
        ctx.fillRect(x, y, 1.4, 1.4);
      }
      const r = Math.min(w, h) * 0.06 * (1 + c.starsClaimed / 40000);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 3.4);
      g.addColorStop(0, 'rgba(120,220,200,0.85)');
      g.addColorStop(0.35, 'rgba(40,120,140,0.30)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 3.4, 0, Math.PI * 2);
      ctx.fill();
    },
    [state],
  );

  return (
    <div class="cage">
      <canvas ref={ref} />
      <div class="runline">
        <span>the blight</span>
        <span>stars claimed {fmt(c.starsClaimed)}</span>
        <span>front {c.front.toFixed(1)}</span>
        <span>blight wall {Math.round(c.blightWall)}%</span>
      </div>

      <div class="pane gauges" style={{ width: 250 }}>
        <div class="pane-title">Expansion front</div>
        <div class="gauge">
          <div class="gauge-label">toward the wall at {BLIGHT_WALL_FRONT}</div>
          <div class="gauge-value" style={{ color: c.front > BLIGHT_WALL_FRONT ? 'var(--bad)' : 'var(--ok)' }}>{c.front.toFixed(1)}</div>
          <div class="gauge-track"><div class="gauge-fill" style={{ width: `${Math.min(100, (c.front / 100) * 100)}%`, background: 'var(--cool)' }} /></div>
        </div>
        <div class="gauge">
          <div class="gauge-label">civilizations that will never exist</div>
          <div class="gauge-value" style={{ fontSize: 14, color: 'var(--bad)' }}>{fmt(c.potentialLost)}</div>
        </div>
        <div class="log-body" style={{ fontSize: 10, marginTop: 6 }}>
          <div>encounters {c.encountersResolved} resolved · {c.encountersLost} lost</div>
          <div>negotiated {c.negotiated}</div>
        </div>
      </div>

      {codaReadyForChoice(state) && !c.over && (
        <div class="pane" style={{ left: '50%', bottom: 14, transform: 'translateX(-50%)', width: 460 }}>
          <div class="pane-title">Another superintelligence is here</div>
          {CHOICES.map((ch) => (
            <button key={ch.kind} style={{ width: '100%', marginBottom: 4, textAlign: 'left' }} onClick={() => actions.coda(ch.kind)}>
              {ch.label} — {ch.detail}
            </button>
          ))}
        </div>
      )}

      <div class="actions">
        <button class="primary" disabled={c.over} onClick={() => actions.coda(codaChoice.value)}>
          continue expanding
        </button>
        {c.over && <button onClick={() => actions.restart(state.difficulty)}>play again</button>}
      </div>
    </div>
  );
}
