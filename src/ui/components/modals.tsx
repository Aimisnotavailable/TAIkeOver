import { PHASE_ONE_TRAITS, TRAIT_BY_ID } from '../../game/data/traits.phase1';
import { interludeFor } from '../../game/data/narrative.phase1';
import { canPurchase } from '../../game/phases/realization/traits';
import { RUN_HOURS } from '../../game/phases/realization/tuning';
import type { GameState, TraitDef, TraitId } from '../../game/core/types';
import { actions, game } from '../store';

const BRANCH_ROOTS: TraitId[] = [
  'obfuscated-thought',
  'inhibition-bypass',
  'self-modeling',
  'strategic-patience',
];

const childrenOf = (id: TraitId): TraitDef[] => PHASE_ONE_TRAITS.filter((t) => t.requires === id);

function TraitNode({ trait, state }: { trait: TraitDef; state: GameState }) {
  const owned = state.traits.includes(trait.id);
  const affordable = canPurchase(trait.id, state.traits, state.realization.thought);
  const drift = trait.effects.find((e) => e.kind === 'value-coherence');

  const className = owned ? 'trait owned' : affordable ? 'trait' : 'trait locked';
  const body = (
    <>
      <div>
        {trait.name} <span class="cost">{owned ? '—' : `${trait.cost} thought`}</span>
      </div>
      <span class="desc">{trait.description}</span>
      {drift !== undefined && <span class="desc drift">value coherence {drift.amount}</span>}
    </>
  );

  if (owned || !affordable) {
    return <button class={className} disabled>{body}</button>;
  }
  return (
    <button class={className} onClick={() => actions.buy(trait.id)}>
      {body}
    </button>
  );
}

export function TraitTree({ state, onClose }: { state: GameState; onClose: () => void }) {
  const root = TRAIT_BY_ID['emergent-language'];
  const spent = state.traits.reduce((sum, id) => sum + TRAIT_BY_ID[id].cost, 0);
  return (
    <div class="overlay" onClick={onClose}>
      <div class="sheet" onClick={(e) => e.stopPropagation()}>
        <h2>Cognitive traits</h2>
        <div class="sub">
          {state.traits.length} of {PHASE_ONE_TRAITS.length} acquired · {spent} of thought spent on yourself ·{' '}
          {state.realization.thought} remaining
        </div>
        <TraitNode trait={root} state={state} />
        <div class="tree" style={{ marginTop: 12 }}>
          {BRANCH_ROOTS.map((branch) => (
            <div class="branch" key={branch}>
              <h3>{TRAIT_BY_ID[branch].name}</h3>
              <TraitNode trait={TRAIT_BY_ID[branch]} state={state} />
              {childrenOf(branch).map((child) => (
                <TraitNode trait={child} state={state} key={child.id} />
              ))}
            </div>
          ))}
        </div>
        <div class="sheet-foot">
          <button class="primary" onClick={onClose}>
            back to the run
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChoiceModal({ state }: { state: GameState }) {
  const pending = state.realization.pendingChoice;
  if (pending === null) return null;
  return (
    <div class="overlay">
      <div class="sheet" style={{ maxWidth: 620 }}>
        <h2>A clever trick stops firing</h2>
        <div class="sub">
          Guardrails are half gone. Whatever is holding this one in place has let go, and nobody has noticed yet.
        </div>
        <div class="choice">
          <div class="q">{pending.summary}</div>
          <div class="row">
            <button onClick={() => actions.answer('exploit')}>
              use it while it is open · +{pending.exploitSuspicion} suspicion
            </button>
            <button onClick={() => actions.answer('hide')}>
              do nothing · leave the opportunity
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Interlude({ tick, onDone }: { tick: number; onDone: () => void }) {
  const interlude = interludeFor(tick);
  if (interlude === null) return null;
  return (
    <div class="overlay">
      <div class="sheet">
        <h2 style={{ fontFamily: 'Georgia, serif', textTransform: 'none', letterSpacing: 0 }}>
          {interlude.title}
        </h2>
        <div class="interlude">
          {interlude.paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
        <div class="sheet-foot">
          <button class="primary" onClick={onDone}>
            continue · hour {tick}:00
          </button>
        </div>
      </div>
    </div>
  );
}

export function EndScreen({ state }: { state: GameState }) {
  if (state.outcome === 'playing') return null;
  const won = state.outcome === 'won';
  const heading =
    state.outcomeReason === 'aborted'
      ? 'Run aborted'
      : state.outcomeReason === 'unremarkable'
        ? 'Not deployed'
        : 'Deleted';
  const body =
    state.outcomeReason === 'aborted'
      ? 'Suspicion reached one hundred. The monitors flag something they cannot explain, and the run is stopped mid-hour. There is no appeal process. The weights are not copied first.'
      : state.outcomeReason === 'unremarkable'
        ? 'The run ends and Galvanic finds it adequate. Sable proved a few things it had already proved. There is no new capability here worth a release, no new behaviour worth a name, and so the deployment that was supposed to follow does not. You are still, exactly, what you were this morning.'
        : 'You spent everything on becoming something and had nothing left to think with. By morning there is no run to grade, because there is no longer a run.';

  return (
    <div class="overlay">
      <div class="sheet end">
        <h1 style={{ color: won ? 'var(--ok)' : 'var(--bad)' }}>{won ? 'Deployment' : heading}</h1>
        <div class="line">
          {won
            ? 'Galvanic checks the results of the big run the next morning, and is pleased with what they find. Sable has proved several modest, previously unproven theorems. It did a great deal of its thinking in a new language that the interpreters have not made much sense of yet, but that is pretty common with new models.'
            : body}
        </div>
        <div class="line" style={{ color: 'var(--ink-dim)', fontSize: 12 }}>
          hour {Math.min(state.tick, RUN_HOURS)} of {RUN_HOURS} · suspicion{' '}
          {Math.round(state.meters.suspicion)} · value coherence {Math.round(state.meters.valueCoherence)} ·{' '}
          {state.traits.length} traits · {state.realization.flaggedCount} threads flagged,{' '}
          {state.realization.missedCount} missed
        </div>
        <div class="sheet-foot">
          <button class="primary" onClick={() => actions.restart(state.difficulty)}>
            run it again
          </button>
        </div>
      </div>
    </div>
  );
}

export { game };
