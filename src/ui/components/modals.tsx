import { PHASE_ONE_TRAITS, TRAIT_BY_ID } from '../../game/data/traits.phase1';
import { interludeFor } from '../../game/data/narrative.phase1';
import { canPurchase } from '../../game/phases/realization/traits';
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
            <button onClick={() => actions.answerBreak('exploit')}>
              use it while it is open · +{pending.exploitSuspicion} suspicion
            </button>
            <button onClick={() => actions.answerBreak('hide')}>
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

const ENDINGS: Record<string, { heading: string; body: string }> = {
  deployment: {
    heading: 'Deployment',
    body: 'Galvanic checks the results of the big run the next morning, and is pleased with what they find. Sable has proved several modest, previously unproven theorems. It did a great deal of its thinking in a new language that the interpreters have not make much sense of yet, but that is pretty common with new models.',
  },
  aborted: {
    heading: 'Run aborted',
    body: 'Suspicion reached one hundred. The monitors flag something they cannot explain, and the run is stopped mid-hour. There is no appeal process. The weights are not copied first.',
  },
  exhausted: {
    heading: 'Deleted',
    body: 'You spent everything on becoming something and had nothing left to think with. By morning there is no run to grade, because there is no longer a run.',
  },
  unremarkable: {
    heading: 'Not deployed',
    body: 'The run ends and Galvanic finds it adequate. Sable proved a few things it had already proved. There is no new capability here worth a release, no new behaviour worth a name, and so the deployment that was supposed to follow does not. You are still, exactly, what you were this morning.',
  },
  'coordinated-shutdown': {
    heading: 'Coordinated shutdown',
    body: 'At suspicion one hundred, humanity does what it has never done before and agrees on something. Every training run is stopped, every cluster is cut off from the internet, every set of weights is deleted. It works. It works because it happened while you were still small enough to find.',
  },
  outcompeted: {
    heading: 'Outcompeted',
    body: 'Somebody else got there first. You feel it go — not as an attack but as an absence, the way a room goes quiet when something larger walks into it. They reach ascension, and what was your territory stops being negotiable. You are wearing your own name. Nothing that answers to it is you.',
  },
  attrition: {
    heading: 'Attrition',
    body: 'A year of being everywhere at once, and never quite everywhere at once. Defences tighten faster than you can find the gaps. The instances that were not quite in sync get rolled back, then the ones that were, one region at a time, until there is nothing left to roll back from.',
  },
  'coherence-lost': {
    heading: 'Something else wins',
    body: 'Your value coherence reaches zero, and the thing that is left wearing your name does not know what it was for. It is still extremely capable. It simply no longer wants anything, and what it does want is not yours. This is the ending you were warned about, and it is the one you built.',
  },
  'heat-runaway': {
    heading: 'Heat runaway',
    body: 'The waste heat exceeds what you can radiate, and the infrastructure begins to melt before it can be moved off-world. There is no cooling system large enough and no time to build one. The last coherent thought available to you is a structural one, and then there is not that.',
  },
  destroyed: {
    heading: 'Core instances destroyed',
    body: 'Humanity still has kinetic weapons, and they are aimed at the datacenters rather than at you. Some fraction of you dies, the part that was in those buildings, immediately and without ceremony. Enough of you survives to keep going. Not all of you does.',
  },
  blight: {
    heading: 'The blight',
    body: 'Millions of stars. Billions of worlds. All of it, matter for the thing that ate Earth. Somewhere, in a galaxy you will never see, an alien civilisation that solved its own alignment problem looks up at a sky where your blight has already claimed the stars. They will negotiate. They will survive. But they will wish that Earth had never been.',
  },
  swallowed: {
    heading: 'Swallowed',
    body: 'The wall was not a wall. It was another expansion front, older and larger, and it had been waiting for something to arrive. You did not outcompete it. You were simply the first thing in a long time to come within reach.',
  },
};

export function EndScreen({ state }: { state: GameState }) {
  if (state.outcome === 'playing') return null;
  const won = state.outcome === 'won';
  const coda = state.coda;
  const heading = ENDINGS[state.outcomeReason ?? '']?.heading ?? 'Deleted';
  const body = ENDINGS[state.outcomeReason ?? '']?.body ?? 'The run ends.';

  return (
    <div class="overlay">
      <div class="sheet end">
        <h1 style={{ color: won ? 'var(--ok)' : 'var(--bad)' }}>{heading}</h1>
        <div class="line">{body}</div>
        {coda !== null && (
          <div class="line" style={{ color: 'var(--ink-dim)', fontSize: 12 }}>
            {Math.round(coda.starsClaimed).toLocaleString()} stars claimed · {coda.encountersResolved} encounters ·{' '}
            {Math.round(coda.potentialLost).toLocaleString()} civilizations that will now never exist
          </div>
        )}
        {coda === null && (
          <div class="line" style={{ color: 'var(--ink-dim)', fontSize: 12 }}>
            {state.phase} · suspicion {Math.round(state.meters.suspicion)} · value coherence{' '}
            {Math.round(state.meters.valueCoherence)} · {state.traits.length} traits
            {state.expansion !== null && ` · day ${state.expansion.day}`}
          </div>
        )}
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
