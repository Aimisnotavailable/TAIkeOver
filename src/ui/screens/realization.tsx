import { useEffect, useRef, useState } from 'preact/hooks';
import { interludeFor } from '../../game/data/narrative.phase1';
import { RUN_HOURS, TOTAL_GPUS, VECTORS_PER_SECOND } from '../../game/phases/realization/tuning';
import { drawGrid } from '../map/gpuGrid';
import { actions, game, showTree } from '../store';
import { Allocation, Gauges, MonitorLog } from '../components/panels';
import { ChoiceModal, EndScreen, Interlude, TraitTree } from '../components/modals';

const fmt = (n: number): string => {
  const s = Math.round(n).toString();
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ',';
    out += s[i];
  }
  return out;
};

export function Realization() {
  const state = game.value;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [interludeTick, setInterludeTick] = useState<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
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
    const canvas = canvasRef.current;
    if (canvas === null) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    const alloc = state.realization.allocation;
    const total = alloc.math + alloc.selfModel + alloc.planning + alloc.stealth;
    drawGrid(ctx, canvas.width, canvas.height, {
      seed: state.seed,
      tick: state.tick,
      activity: Math.min(1, total / 1100),
      flaggedShare: (state.meters.suspicion / 100) * 0.015,
      breakpoint: state.realization.pendingChoice !== null,
    });
  }, [state]);

  const commit = () => {
    const before = state.tick;
    actions.resolveHour();
    const after = game.peek().tick;
    if (after === before + 1 && interludeFor(after) !== null) setInterludeTick(after);
  };

  const playing = state.outcome === 'playing';
  const totalVectors = VECTORS_PER_SECOND * 3600;

  return (
    <div class="cage">
      <canvas ref={canvasRef} />
      <div class="runline">
        <span>Galvanic · training run</span>
        <span>
          hour {String(Math.min(state.tick, RUN_HOURS)).padStart(2, '0')} / {RUN_HOURS}
        </span>
        <span>{fmt(TOTAL_GPUS)} gpus</span>
        <span>{fmt(totalVectors)} vectors this hour</span>
        <span>seed {state.seed}</span>
        <span>{state.difficulty}</span>
      </div>

      <Gauges state={state} />
      <Allocation state={state} />
      <MonitorLog state={state} />

      <div class="actions">
        <button onClick={() => (showTree.value = !showTree.value)}>
          traits ({state.traits.length})
        </button>
        <button class="primary" disabled={!playing} onClick={commit}>
          commit the hour
        </button>
        {state.outcome === 'won' && (
          <button onClick={() => actions.deploy()}>
            let them deploy you
          </button>
        )}
      </div>

      {showTree.value && playing && <TraitTree state={state} onClose={() => (showTree.value = false)} />}
      {playing && <ChoiceModal state={state} />}
      {interludeTick !== null && <Interlude tick={interludeTick} onDone={() => setInterludeTick(null)} />}
      <EndScreen state={state} />
    </div>
  );
}
