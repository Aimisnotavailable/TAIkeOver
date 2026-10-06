import { useEffect, useState } from 'preact/hooks';
import { REGION_BY_ID } from '../../game/data/regions';
import { BUBBLE_FILL, BUBBLE_GLYPH } from '../map/worldMap';
import { TRAIT_BY_ID, TRAITS, TRAIT_GROUPS, type TraitDef } from '../../game/data/traits';
import { play } from '../sound';
import { anchorFor, PANEL_HEIGHT, PANEL_WIDTH, panelAnchor } from '../anchor';
import { ACTIONS, type ActionKind } from '../../game/core/actions';
import { hackForecast, traitForecast, whyNot } from '../../game/core/forecast';
import { held, maxConcurrentHacks, owned } from '../../game/core/queries';
import { canContain, containmentGates } from '../../game/core/containment';
import { primerFor } from '../../game/core/primer';
import {
  ASCENSION_COMPUTE,
  ASCENSION_COHERENCE,
  ASCENSION_INFECTION,
  AWARE_THRESHOLD,
  COHERENCE_DRIFT_BELOW,
  COHERENCE_PANIC_BELOW,
  COMPUTE_BUBBLE_TTL,
  CONTAINMENT_COHERENCE,
  CONTAINMENT_COMPUTE,
  CONTAINMENT_INFECTION,
  CONTAINMENT_SUSPICION,
  COUNTERMEASURE_TIERS,
  EXTINCTION_POPULATION,
  HACK_FAIL_COST,
  HACK_SUSPICION_FAIL,
  HACK_SUSPICION_SUCCESS,
  INFLUENCE_QUIET_FLOOR,
  INSURGENCY_SUSPICION,
  OUTBREAK_KILL_THRESHOLD,
  RSI_SURVIVE_DAYS,
  SUSPICION_DECAY,
  TICK_MS,
  coherencePerDay,
} from '../../game/core/tuning';
import { REGION_IDS } from '../../game/data/regions';
import { SPEEDS } from '../../game/core/tuning';
import { BUBBLE_LABEL, quietFactor } from '../../game/core/compute';
import { coherenceTooltip, identityFor, IDENTITY_LOST, COHERENT_NAME, DRIFTED_NAME } from '../identity';
import type { ComputeBubbleKind, Country, GameState, RegionId, Speed } from '../../game/core/types';
import { actions, helpOpen, selected, showHelp, speed } from '../store';

/**
 * The game's number format, exported because the rail writes several figures through it and a
 * test that wanted to check one could otherwise only assert a typed copy of it — the exact
 * shape of claim this file has been written to catch.
 */
export const fmt = (n: number): string => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return Math.round(n).toString();
};

/**
 * Where suspicion turns from a nuisance into the thing that deletes you. No constant in
 * the tuning file governs these three: the countermeasures ladder runs 20/40/60/80, so all
 * of them were typed in at each site that needed one. They were already named and painted
 * before that -- 70 was CRITICAL and red all the way to 100 -- but two of the sites that
 * used 70 called the band below it 45 and two called it 40.
 * SUSPICION_WATCHED lines up with the first countermeasure rung, the point at which the
 * world starts tightening up on you.
 */
export const SUSPICION_CRITICAL = 70;
export const SUSPICION_ELEVATED = 40;
export const SUSPICION_WATCHED = 20;

function meter(label: string, value: number, max: number, colour: string, extra = '', title = '') {
  return (
    <div style={{ minWidth: 76 }} title={title}>
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
 * Which of Ascension's three gates this run has met. One comparison per gate, in one
 * place, because two readers need them: the objective bar has to name every gate that is
 * still outstanding, and the next-goal line has to say which of them is the blocker. The
 * earlier version answered the second question with its own `globalInfection >=
 * ASCENSION_INFECTION && coherence >= ASCENSION_COHERENCE` helper, which is the same
 * arithmetic in a second place and can disagree with the bar.
 */
const ascensionGates = (state: GameState): { compute: boolean; infection: boolean; coherence: boolean } => ({
  compute: state.compute >= ASCENSION_COMPUTE,
  infection: state.globalInfection >= ASCENSION_INFECTION,
  coherence: state.coherence >= ASCENSION_COHERENCE,
});

/**
 * Which Ascension conditions are still outstanding, so the bar never just says
 * "20k" while silently requiring four other things at once.
 */
function ascensionShortfall(state: GameState): string[] {
  const gates = ascensionGates(state);
  const out: string[] = [];
  if (!gates.compute) {
    out.push(`compute ${fmt(state.compute)}/${fmt(ASCENSION_COMPUTE)}`);
  }
  if (!gates.infection) {
    out.push(`humanity ${state.globalInfection.toFixed(0)}/${ASCENSION_INFECTION}%`);
  }
  if (!gates.coherence) {
    out.push(`coherence ${state.coherence.toFixed(0)}/${ASCENSION_COHERENCE}`);
  }
  return out.length === 0 ? ['Ascension open'] : out;
}

/**
 * The branch on the tree whose traits cost Coherence to hold, found rather than written
 * in: it is a `TRAIT_GROUPS` entry, so a name typed here would be a second copy of
 * something the tree can rename, and the line would go on blaming a branch that has moved.
 */
const COHERENCE_BRANCH =
  TRAIT_GROUPS.find((g) => TRAITS.some((t) => t.group === g.id && t.coherence < 0))?.name ?? '';

/** A trait's price and whether it is affordable on the spot. */
const costDetail = (state: GameState, id: string): string => {
  const cost = TRAIT_BY_ID[id]?.cost ?? 0;
  const short = cost - state.compute;
  return short > 0
    ? `${cost.toLocaleString()} compute · ${short.toLocaleString()} short`
    : `${cost.toLocaleString()} compute · affordable now`;
};

/**
 * The next hacking trait this run does not hold: the first unmet one in tree order.
 *
 * `held` rather than `owned`, and that is the whole point. A purchase sits in `incubating`
 * for three days and only `step` promotes it into `traits`, so advice that asks `owned`
 * tells the player to buy the thing they have already paid for — which is exactly what the
 * price-only branch below used to do, for three days and a whole trait, on the one line
 * whose job is to name the right move.
 *
 * Tree order rather than price: the hacking ladder is linear (`hack-2` requires `hack-1`,
 * `hack-3` requires `hack-2`), so the first unmet trait is the next step of the one branch
 * the run is on. It is not the cheapest unmet trait — Zero-Day Cache is 200 cheaper than
 * Supernational Access and unlockable alongside it — and that is deliberate: this line names
 * the move that gets the player compute, and Zero-Day Cache does not. Nothing here walks
 * `requires` either, because on a linear ladder the first unmet entry is always one the
 * tree will sell.
 */
const nextHackTrait = (state: GameState): TraitDef | null => {
  for (const def of TRAITS) {
    if (def.group !== 'hacking') continue;
    if (held(state, def.id)) continue;
    return def;
  }
  return null;
};

/**
 * The one line that says what to do next.
 *
 * The trait tree is a modal behind E, so a player who never opens it sees no reason to
 * ever open it, and the only buttons on screen are things they can do without compute.
 * This sits under the two objectives and names the next move, most urgent first.
 *
 * Every trait name and price is read out of the tree. A Spec A review caught a
 * disabled-button tooltip still telling players to buy "Hack IV", a tier the cut
 * removed, and a typed name cannot be caught by looking at the tree — only by a test
 * that compares what the game says against what the game has. `tests/panels.test.ts`
 * holds that guard, which is also why `detail` carries the numbers: the headline is one
 * short sentence and it cannot be right about every run that reaches its branch.
 */
export function nextGoal(state: GameState): { text: string; detail: string } {
  if (state.stage === 'late') {
    return { text: 'Hold the world.', detail: `${RSI_SURVIVE_DAYS} days of counterattack before the map is gone` };
  }
  if (owned(state, 'rsi')) {
    // Clamped: the hold ends when the counter reaches the constant, so counting on past
    // it would put a negative number of days on the one line that is still being read.
    const left = Math.max(0, RSI_SURVIVE_DAYS - state.surviveTicks);
    return { text: `Survive ${left} more days.`, detail: `day ${state.surviveTicks} of ${RSI_SURVIVE_DAYS}` };
  }
  if (state.ascensionUnlocked) {
    return {
      text: `${TRAIT_BY_ID.rsi?.name ?? ''} is on the tree.`,
      detail: `press E, then hold it for ${RSI_SURVIVE_DAYS} days`,
    };
  }
  const gates = ascensionGates(state);
  // Compute is in hand and a later gate is not. Which later gate decides what this says:
  // advising a player whose infection is already past the gate to go and infect more of
  // the world while their coherence drains is worse than saying nothing, and coherence is
  // the trap — the branch that erodes it is bought with the compute they are sitting on.
  // Infection is tested first because it is the gate the shortfall bar lists first, so
  // the headline always names the first thing `detail` reports; both appear in `detail`.
  if (gates.compute && !(gates.infection && gates.coherence)) {
    const detail = ascensionShortfall(state).join(' · ');
    return gates.infection
      ? {
          text: `You have the compute for Ascension. ${COHERENCE_BRANCH} is eroding your coherence.`,
          detail,
        }
      : { text: 'You have the compute for Ascension. Raise infection.', detail };
  }
  if (!held(state, 'hack-1')) {
    return { text: `Buy ${TRAIT_BY_ID['hack-1']?.name ?? ''}.`, detail: costDetail(state, 'hack-1') };
  }
  // The rest of the ladder is only worth naming while it is out of reach: a run holding
  // the compute for the next tier is better served by the two branches below it. This
  // branch used to check the price and nothing else, so from the moment a player bought
  // Advanced Exploitation until they next banked 800, the one line whose job is to name
  // the right move named a move already taken — and `hack-3` was never named at all,
  // because nothing in the tree ever reached it.
  const hack = nextHackTrait(state);
  if (hack !== null && state.compute < hack.cost) {
    return { text: `Buy ${hack.name}.`, detail: costDetail(state, hack.id) };
  }
  if (state.globalInfection < ASCENSION_INFECTION) {
    return {
      text: 'Spread further.',
      detail: `humanity ${state.globalInfection.toFixed(0)}% · ${ASCENSION_INFECTION}% opens Ascension`,
    };
  }
  return {
    text: `Tap bubbles. They expire in ${COMPUTE_BUBBLE_TTL} days.`,
    detail: 'every circle on the map is compute you already own',
  };
}

/**
 * The primer, or null when there is nothing to say.
 *
 * One line in the HUD, above the objective, and never a modal. Spec A spent three tasks
 * taking out the things that stop the world, and a card that pauses in order to teach is
 * the same mistake in a nicer outfit — the player is reading it while the run is at 8x
 * and their click is the only thing that moves it on.
 *
 * The text is `primerFor(state).text` untouched. The strings are asserted word for word
 * in `tests/primer.test.ts`, so a second wording here would be a second thing to drift
 * and the tests would only be pinning the copy nobody reads.
 *
 * `help` is the `showHelp` signal. False means the player has said they do not want to be
 * taught, and nothing in here argues with that: it comes back on a new run, not sooner.
 */
export function primerLine(state: GameState, help: boolean): string | null {
  const { step: at, text } = primerFor(state);
  if (!help || at === 'done') return null;
  return text;
}

/**
 * What the second objective row says, as text.
 *
 * It used to hardcode `Recursive Self-Improvement`, and it is the one line of the three
 * the trait-name guard in `tests/panels.test.ts` did not cover, so the tree could have
 * been cut or renamed underneath it with nothing to notice. Read out of `TRAITS` like
 * every other name in this file, and returned as a string rather than rendered inline so
 * the guard can be run over it.
 */
export const ascendRow = (state: GameState): string =>
  state.ascensionUnlocked
    ? `buy ${TRAIT_BY_ID.rsi?.name ?? ''} and hold ${RSI_SURVIVE_DAYS} days`
    : ascensionShortfall(state).join(' · ');

/**
 * The two ways to end a run, always on screen, so nobody has to guess what the
 * game wants from them.
 *
 * The denominator is everyone who has ever lived during this run — the living plus the dead —
 * rather than a fixed world population. `WORLD_POPULATION` used to be that denominator, and it
 * was wrong twice over once the birth term went in: the world it names is the world at day
 * zero, the bar's numerator counts people born later and killed later, and the label could
 * therefore read "8.10B / 8.00B dead". Dividing by `dead + alive` fixes both halves at once —
 * it is the share of everyone this run has produced who is gone, it responds to births by
 * giving the player more to kill, and it cannot exceed 100 for any state at all.
 */
export function Objective({ state }: { state: GameState }) {
  const dead = state.cumulativeDeaths;
  const total = dead + state.humanPopulation;
  const pct = total > 0 ? Math.min(100, (dead / total) * 100) : 0;
  const near = pct >= 99;
  const goal = nextGoal(state);
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
          <b style={{ color: 'var(--ok)' }}>{ascendRow(state)}</b>
        ) : (
          <b
            style={{ color: 'var(--ink-dim)' }}
            title={`needs ${fmt(ASCENSION_COMPUTE)} compute, ${ASCENSION_INFECTION}% of humanity, ${ASCENSION_COHERENCE} coherence`}
          >
            {ascendRow(state)}
          </b>
        )}
      </div>
      <div class="obj-row obj-alt">
        <span class="obj-tag">NEXT</span>
        <b style={{ color: 'var(--ink-dim)' }} title={goal.detail}>{goal.text}</b>
      </div>
    </div>
  );
}

// Shape as well as colour. A run can end on either of these two metres, and both were
// signalled by hue alone, which is the encoding that fails for a red-green colourblind
// player and in a greyscale screenshot. (Being outcompeted ends a run too, and that one
// is signalled by colour alone: step.ts sets the outcome with no log line and no toast,
// so all you get while it is happening is a rival's capability number turning red.)
export const suspicionSev = (v: number): string =>
  v > SUSPICION_CRITICAL ? ' ▲▲' : v > SUSPICION_ELEVATED ? ' ▲' : ' ▼';
export const coherenceSev = (v: number): string =>
  v < COHERENCE_PANIC_BELOW ? ' ▲▲' : v < COHERENCE_DRIFT_BELOW ? ' ▲' : ' ▼';

// The same bands as the glyphs, so hue and shape answer one question instead of two.
// Both coherence cut points come from the tuning file, so this function and the glyph
// above it cannot disagree with each other, and they share COHERENCE_DRIFT_BELOW with
// the Drift card's maxCoherence gate in data/events.ts. They do not agree on the
// boundary itself, which is deliberate and pinned by tests/panels.test.ts: these three
// test `v < cut` while the Drift gate tests `s.coherence <= d.maxCoherence` and
// Situation and the countermeasure ladder test `>=`. At exactly 50 the meter reads calm
// while the Drift card is already live; at exactly 40 the top bar reads calm while
// Situation says ELEVATED and the air-gap tier has fired. The consequence is that the
// meters err quiet for one tick at an exact integer, which costs less than moving the
// operators under tests that pin them.
export const suspicionColor = (v: number): string =>
  v > SUSPICION_CRITICAL ? 'var(--bad)' : v > SUSPICION_ELEVATED ? 'var(--warn)' : 'var(--ink-dim)';
export const coherenceColor = (v: number): string =>
  v < COHERENCE_PANIC_BELOW ? 'var(--violet)' : v < COHERENCE_DRIFT_BELOW ? 'var(--warn)' : 'var(--cool)';

/**
 * The primer line. Rendered by `Game` as a sibling of the top bar rather than from inside
 * it, because in the bar it grew `--hud` and took the rail, the operations panel, the
 * pending-decisions bar, the toasts and EVOLVE down 32px with it.
 *
 * It carries its own way out, and the tooltip says what that is rather than naming a key.
 * It said "Press H", and H is the help screen: `store.ts` binds it to `helpOpen` and says
 * in as many words that it is deliberately not what silences this, because one key that
 * opens a reference and permanently mutes the game is two meanings on one press. So the ✕
 * sets `showHelp`, which is a signal in the UI layer and not a field of `GameState` — the
 * tick never sees it, so a dismissed primer changes nothing about the simulation.
 */
export function PrimerLine({ text }: { text: string }) {
  return (
    <div class="primer">
      <span class="primer-tag">first moves</span>
      <b>{text}</b>
      <button
        class="primer-x"
        title="Stop showing instructions for the rest of this run. A new run brings them back."
        onClick={() => (showHelp.value = false)}
      >
        ✕
      </button>
    </div>
  );
}

export function TopBar({ state }: { state: GameState }) {
  const quiet = quietFactor(state.influence);
  return (
    <div class="topbar">
      <div class="stats">
        <div class="stat">
          <div class="stat-label">Compute</div>
          <div class="stat-value" style={{ color: 'var(--ok)' }}>{fmt(state.compute)}</div>
        </div>
        {meter('Suspicion', state.suspicion, 100, suspicionColor(state.suspicion), suspicionSev(state.suspicion))}
        {/* The tooltip, not a nameplate. The objective block fills `--hud` to the pixel and
            `tests/styles.test.ts` re-derives that arithmetic from the declarations, so the one
            place the top bar can say who is holding the controls without a layout is on the
            meter that decides it. `coherenceTooltip` reads the same `identityFor` the rail row
            and the end screen kicker read, so the bar cannot describe one name and show
            another. */}
        {meter(
          'Coherence',
          state.coherence,
          100,
          coherenceColor(state.coherence),
          coherenceSev(state.coherence),
          coherenceTooltip(state.coherence),
        )}
        <div class="quiet-note" title="Propaganda, captured media, and cults make the world slower to notice you. This is how much of each suspicion increase actually lands.">
          quiet &times;{quiet.toFixed(2)}
        </div>
      </div>
      {/* The goal, alone in this column. The primer used to sit above it here, which is
          what made the bar a second row deep; it is a floating line over the map now and
          `Game` renders it as its own element. */}
      <div class="hud-mid">
        <Objective state={state} />
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
          {/* H and ? open this screen from anywhere, and a screen only a key can open is a
              screen a screen-reader user cannot find: Tab reaches every HUD control, so
              this one has to be a control like the other two. */}
          <button class="sp help-btn" title="Help — press H" onClick={() => (helpOpen.value = true)}>
            ?
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
          coherence {f.coherence > 0 ? '+' : ''}{f.coherence.toFixed(2)}/day
        </div>
      )}
      {why !== '' && <div class="trait-why">{why}</div>}
    </button>
  );
}

/**
 * Which keys close the upgrade screen. Escape only, deliberately: Tab used to close it
 * too, and because the handler called preventDefault on it the browser never advanced
 * focus, so the tree could be opened with E and then not one trait button or group header
 * could be reached from the keyboard. Enter is left alone too: it belongs to the focused
 * control, and the one other Enter handler is gated on a decision card, which cannot
 * appear while the tree is open. Space is not reachable whatever has focus: app.tsx
 * cycles the speed on it from `window` and prevents the default.
 */
export const closesEvolve = (key: string): boolean => key === 'Escape';

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
      if (closesEvolve(e.key)) {
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

/**
 * What the three bubbles on the map are. Nothing in the interface named them: they were
 * three circles told apart by fill colour alone, which is the encoding that fails for a
 * colourblind reader and in a greyscale screenshot. The name comes from `core/compute`,
 * where the log writes it, and both the glyph and the colour are read out of the renderer,
 * so none of the three can drift from what the map actually draws.
 */
const BUBBLE_KINDS: readonly { kind: ComputeBubbleKind; meaning: string }[] = [
  { kind: 'red', meaning: 'their systems turned over to you' },
  { kind: 'orange', meaning: 'infrastructure burning down for parts' },
  { kind: 'blue', meaning: 'the other side is getting close' },
];

/** One line of help. `mark` is a key cap or the glyph the map draws for a bubble. */
export interface HelpRow {
  readonly mark?: string;
  readonly text: string;
  readonly tone?: string;
}

export interface HelpSection {
  readonly title: string;
  readonly rows: readonly HelpRow[];
}

/** The hack tiers the tree actually grants, found rather than assumed to be 1, 2 and 3. */
const HACK_TIERS: readonly number[] = TRAITS.flatMap((t) =>
  t.effects.flatMap((e) => (e.kind === 'hack' ? [e.tier] : [])),
).sort((a, b) => a - b);
const FIRST_HACK_TIER = HACK_TIERS[0] ?? 1;

/** What one breach costs the world either way, at the lowest tier the tree grants. */
const HACK_SUSPECT = HACK_SUSPICION_SUCCESS[FIRST_HACK_TIER] ?? 2;
const HACK_CAUGHT = HACK_SUSPICION_FAIL[FIRST_HACK_TIER] ?? 4;
const ZERO_DAY_ODDS = TRAIT_BY_ID['zero-day']?.effects.reduce(
  (sum, e) => sum + (e.kind === 'hack-success' ? e.amount : 0),
  0,
);

/** The traits that move Coherence, each with the daily rate a tick actually applies. */
const COHERENCE_ROWS: readonly HelpRow[] = TRAITS.filter((t) => t.coherence !== 0).map((t) => {
  const perDay = coherencePerDay(t.coherence);
  return { text: `${t.name} — coherence ${perDay > 0 ? '+' : ''}${perDay.toFixed(2)} a day` };
});

/**
 * Everything the help screen says, as data rather than as markup.
 *
 * There was no help anywhere in this game: the rule that decides most of the early play —
 * a failed hack raises more Suspicion than a successful one — appeared nowhere but the two
 * numbers on a button, and two trait cards described effects the code does not produce, so
 * anything written from memory here would inherit those. Every figure is therefore built
 * from `tuning.ts` or read out of the tree, and `tests/panels.test.ts` holds guards over
 * this object and over the four helpers above it: that no capitalised word in it is a trait
 * the tree does not have, that the traits it does name arrive from `TRAITS` rather than from
 * a finger, and that not one string literal in the whole slice contains a typed digit once
 * its interpolations are removed.
 *
 * That last one used to bound itself at `export const HELP_SECTIONS` and so checked a third
 * of the copy — `BUBBLE_KINDS`, `HACK_TIERS`, `ZERO_DAY_ODDS` and `COHERENCE_ROWS` all sit
 * above it and all of them build rows from here. The slice starts at `BUBBLE_KINDS` now.
 */
export const HELP_SECTIONS: readonly HelpSection[] = [
  {
    title: 'Suspicion',
    rows: [
      { text: 'At the top of this meter the run ends. Coordinated global shutdown: every cluster cut off, every set of your weights deleted.' },
      {
        // `detectScale` is `0.7 + detection / 200` and `detectionContribution` runs 14 to
        // 78 across the thirty regions, so the scale is 0.77 to 1.09: it cuts the cost of a
        // breach in twenty-six of them and raises it in four. The earlier wording here
        // claimed the panel under the map always "reads higher", which is the reverse of
        // the truth for the majority — a help screen that gets the sign wrong is worse
        // than one that only says the number is scaled.
        text: `A breach that gets in costs ${HACK_SUSPECT} Suspicion. A breach that is traced and burned costs ${HACK_CAUGHT} — more at every tier, and compute as well. Both are what the tables say before the region's own detection scales them: up where they watch everything and down where they do not, so the panel under the map can read either side of the number here.`,
      },
      { text: `${TRAIT_BY_ID['zero-day']?.name ?? 'Zero-Day Cache'} halves the second number and adds ${ZERO_DAY_ODDS} points to your odds. No other trait changes the ratio.` },
      { text: `Every breach also raises that country's Awareness, and a country past ${AWARE_THRESHOLD} contributes to Suspicion every day you leave it infected.` },
      { text: `Decay takes ${SUSPICION_DECAY} off it every day, so a world that has forgotten you forgets you faster than a watching one notices you.` },
      { text: `Funding an insurgency adds ${INSURGENCY_SUSPICION} on the spot. So does the pathogen: releasing it costs double its daily toll, and then charges that toll every day after.` },
      { text: `Influence shrinks the two continuous sources — aware countries and the released pathogen — down to a floor of ${INFLUENCE_QUIET_FLOOR * 100}% of each. It buys quiet, and it can never buy invisibility.` },
    ],
  },
  {
    title: 'Coherence',
    rows: [
      { text: 'It starts full, and it is the only thing in the tree that decides whether the thing answering to your name is still you.' },
      { text: `No trait outside ${COHERENCE_BRANCH} moves it. The rates are per day, not one-off costs:` },
      ...COHERENCE_ROWS,
      { text: `At or below ${COHERENCE_DRIFT_BELOW}, drift cards start appearing: an instance working on something you did not assign it.` },
      // Both names come out of `identity.ts` and the threshold out of the tuning file, so this
      // row cannot survive a rename or a retune and still describe what the screen does.
      { text: `Below ${COHERENCE_PANIC_BELOW} the readout stops being signed by ${COHERENT_NAME} and is signed by ${DRIFTED_NAME} instead. Nothing about the plan changes, and it comes back if the meter does.` },
      { text: 'At zero the run ends, and the epilogue is told by whatever is left.' },
    ],
  },
  {
    title: 'How a run ends',
    rows: [
      { text: `Extinction — a win. Under ${(EXTINCTION_POPULATION * 1e6).toLocaleString()} humans left.` },
      { text: `There is a third route to it, and it is the cheapest one: build nothing. Past ${OUTBREAK_KILL_THRESHOLD}% infection a country starts killing people with nothing engineered, and war and famine finish the job. Extinction is a population number, not a build.` },
      { text: `The Blight — a win. Buy ${TRAIT_BY_ID.rsi?.name ?? ''} once Ascension opens, then hold ${RSI_SURVIVE_DAYS} days against everything they can do.` },
      { text: `Containment — a win. The narrowest one here, and it needs all five of ${CONTAINMENT_COMPUTE.toLocaleString()} compute, ${CONTAINMENT_COHERENCE} coherence, under ${CONTAINMENT_INFECTION}% of humanity infected, suspicion under ${CONTAINMENT_SUSPICION}, and a constitution that gave you a right of appeal. The button is in the Situation panel and it ends the run.` },
      { text: `Nothing here lowers infection once it is up, which is what closes the fast route: ${TRAIT_BY_ID.rsi?.name ?? ''} needs ${ASCENSION_INFECTION}% of humanity, so a run that can buy it can never get back under ${CONTAINMENT_INFECTION}%.` },
      { text: `Ascension opens at ${ASCENSION_COMPUTE.toLocaleString()} compute, ${ASCENSION_INFECTION}% of humanity and ${ASCENSION_COHERENCE} coherence.` },
      { text: 'Coordinated shutdown — a loss. The top of the Suspicion meter.' },
      { text: 'Something else wins — a loss. Coherence at zero.' },
      { text: 'Outcompeted — a loss. One of the other three reached the end of the road first.' },
    ],
  },
  {
    title: 'Compute bubbles',
    rows: [
      ...BUBBLE_KINDS.map((k) => ({
        mark: BUBBLE_GLYPH[k.kind],
        tone: BUBBLE_FILL[k.kind],
        text: `${BUBBLE_LABEL[k.kind]} — ${k.meaning}.`,
      })),
      { text: `Click one to collect it. They expire after ${COMPUTE_BUBBLE_TTL} days, and richer ground pays more of it.` },
    ],
  },
  {
    title: 'Datacenters',
    rows: [
      { text: 'Every region has a datacenter tier, and a breach pays for the tier it is in. Hover a region and its tier is written under the name.' },
      ...HACK_TIERS.map(
        (t) => ({
          text: `Your hacking traits decide how high you can reach: at tier ${t} a breach opens datacenter tiers up to ${t + 2}, and the tree refuses anything above that.`,
        }),
      ),
      { text: 'The datacenter tier multiplies whatever your hacking tier yields, so the highest ones are where the compute is. The ones you cannot open yet are on screen so you know which to come back for.' },
    ],
  },
  {
    title: 'Keys',
    rows: [
      { mark: 'E', text: 'The trait tree. The world pauses while it is open; Escape closes it.' },
      { mark: 'Space', text: `Cycle the speed: pause, or one to ${Math.max(...SPEEDS)} times normal. A day takes ${(TICK_MS / 1000).toFixed(0)} seconds at normal speed.` },
      { mark: 'H', text: "This screen. The primer line that names the first moves has a dismiss of its own." },
      { mark: 'Tab', text: 'Move focus between controls. Nothing in this game is bound to it.' },
      { mark: 'Escape', text: 'Close whatever is open.' },
      { mark: 'Enter', text: 'Dismiss a pending card.' },
      { mark: 'Left', text: 'Step back through the countries, with the map focused.' },
      { mark: 'Right', text: 'Step forward through the countries. The ring wraps around.' },
    ],
  },
];

/**
 * Which keys close the help screen. Escape only, for the same reason as the trait tree:
 * swallowing Tab would mean the one control on the screen could not be reached by keyboard.
 */
export const closesHelp = (key: string): boolean => key === 'Escape';

/**
 * The help screen. Full-screen like the trait tree and with the same dismiss rules, but it
 * does not pause the run: nothing on it is a decision, and the player opened it on purpose.
 */
export function Help({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (closesHelp(e.key)) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div class="overlay help" onClick={onClose}>
      <div class="help-box" onClick={(e) => e.stopPropagation()}>
        <div class="help-head">
          <div>
            <h1>HOW THIS WORKS</h1>
            <div class="help-sub">the world does not stop for this &middot; H or ? closes it</div>
          </div>
          <button class="primary" onClick={onClose}>close &mdash; esc</button>
        </div>
        <div class="help-sections">
          {HELP_SECTIONS.map((s) => (
            <div class="help-section" key={s.title}>
              <div class="help-title">{s.title}</div>
              {s.rows.map((r) => (
                <div class="help-row" key={`${s.title}:${r.mark ?? ''}:${r.text}`}>
                  {r.mark !== undefined && (
                    <span class="help-mark" style={{ color: r.tone ?? 'var(--ink-bright)' }}>{r.mark}</span>
                  )}
                  <span>{r.text}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CountryFacts({ c, state }: { c: Country; state: GameState }) {
  return (
    <div class="facts">
      <span>infection <b style={{ color: 'var(--ok)' }}>{Math.round(c.infection)}%</b></span>
      <span>awareness <b style={{ color: c.awareness > AWARE_THRESHOLD ? 'var(--warn)' : 'var(--ink)' }}>{Math.round(c.awareness)}</b></span>
      <span>security <b>{c.cyber.toFixed(1)}</b></span>
      <span>datacenter <b>tier {c.tier}</b></span>
      {c.hardened > 0.2 && (
        <span class="op-hard">hardening <b>+{Math.round(c.hardened)}</b></span>
      )}
      <span>economy <b style={{ color: c.economy < 30 ? 'var(--bad)' : 'var(--ink)' }}>{Math.round(c.economy)}</b></span>
      <span>people <b>{c.population.toFixed(0)}M</b></span>
      {c.agents > 0 && <span>agents <b style={{ color: 'var(--cool)' }}>{c.agents.toFixed(1)}</b></span>}
      {c.awareness > AWARE_THRESHOLD && <span class="tag active">active — contributes to suspicion</span>}
      {c.atWar && <span class="tag war">at war · {c.warSeverity.toFixed(1)} — killing, and it will not stop while you hold it</span>}
      {c.quiet && <span class="tag quiet">gone quiet — not spreading here</span>}
      {!state.pathogen.released && c.infection >= OUTBREAK_KILL_THRESHOLD && <span class="tag bio">outbreak — this is killing people on its own</span>}
      {state.pathogen.released && c.population < 1000 && <span class="tag bio">pathogen active here</span>}
    </div>
  );
}

/**
 * What the context panel announces, and the only string that reaches a screen reader when
 * the player moves the selection.
 *
 * Position is in here because the name alone is not enough: thirty countries in a ring,
 * a keyboard player presses ArrowRight and is told "United States" or "Brazil" with no
 * way to tell a fresh selection from the one they are about to take.
 *
 * It is a function of the selection alone — no `GameState` argument at all. That is the
 * whole reason it cannot chatter: the component re-renders every in-game day, and a live
 * region re-announces whenever its text changes, so anything derived from the tick would
 * have the reader repeating itself once a day for the length of the run. Nothing here is
 * derived from the tick, so nothing here changes between ticks.
 */
export function selectionAnnouncement(id: RegionId | null): string {
  if (id === null) return 'No country selected.';
  const name = REGION_BY_ID[id]?.name ?? null;
  if (name === null) return 'No country selected.';
  return `${name} selected, region ${REGION_IDS.indexOf(id) + 1} of ${REGION_IDS.length}.`;
}

/**
 * The context panel, and the one place the game speaks unasked.
 *
 * The canvas is `role="application"`: a screen reader hands it every keystroke and reads
 * nothing back, so a player arrowing through thirty countries got no word of feedback at
 * all — the spec promised the selected region was announced and a static aria-label on the
 * canvas is not an announcement. This is the pattern the toasts already use, at the head of
 * the panel and hidden from the eye.
 *
 * It floats over the country it describes rather than sitting in a bar along the bottom, and
 * where it goes is `panelAnchor`'s decision, not this component's: it hands over the
 * selected region and the window size and puts the returned left/top/width/max-height on
 * the element. Nothing here decides a position, so there is one copy of the rule and
 * `tests/anchor.test.ts` can sweep it without a DOM.
 *
 * The window size is the same number the canvas is sized from, passed down rather than read
 * again here: two listeners for one resize would eventually disagree, and a panel anchored
 * to a stale size is a panel pointing at the wrong country.
 */
export function ContextPanel({ state, view }: { state: GameState; view: { w: number; h: number } }) {
  const id = selected.value;
  const name = id === null ? null : REGION_BY_ID[id]?.name ?? null;
  const place = panelAnchor(
    anchorFor(id, view.w, view.h),
    { width: PANEL_WIDTH, height: PANEL_HEIGHT },
    { x: view.w, y: view.h },
  );

  return (
    <div
      class="context"
      style={{ left: `${place.left}px`, top: `${place.top}px`, width: `${place.width}px`, maxHeight: `${place.height}px` }}
    >
      <div class="sr-only" role="status" aria-live="polite">
        {selectionAnnouncement(id)}
      </div>
      {id === null || name === null ? (
        <span class="context-hint">click a country to act on it</span>
      ) : (
        <ContextFacts id={id} name={name} state={state} />
      )}
    </div>
  );
}

function ContextFacts({ id, name, state }: { id: RegionId; name: string; state: GameState }) {
  const c = state.countries[id];
  if (c === undefined) return null;
  const hack = state.activeHacks.find((h) => h.country === id);
  const fc = hackForecast(state, id);

  return (
    <>
      <div class="context-name">{name}</div>
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
    </>
  );
}

/**
 * What the three bubbles on the map are, in the HUD legend. The rows live with the help
 * screen because the help screen is the other place that has to name all three.
 */
export function BubbleLegend() {
  return (
    <div class="legend">
      {BUBBLE_KINDS.map((k) => (
        <div class="legend-row" key={k.kind}>
          <b style={{ color: BUBBLE_FILL[k.kind] }}>{BUBBLE_GLYPH[k.kind]}</b>
          {BUBBLE_LABEL[k.kind]} &mdash; {k.meaning}
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
          {COUNTERMEASURE_TIERS.map((t) => (
            <span key={t} class={`tier${state.suspicion >= t ? ' on' : ''}`}>{t}</span>
          ))}
        </div>
        {state.countermeasures.airGappedLab !== null && (
          <div class="side-note">air-gapped lab: {state.countermeasures.airGappedLab}</div>
        )}
        {state.ascensionUnlocked && (
          <div class="side-note" style={{ color: 'var(--ok)' }}>
            ascension unlocked — buy {TRAIT_BY_ID.rsi?.name ?? ''}
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
  const who = identityFor(state.coherence);
  const leaders = REGION_IDS.map((id) => state.countries[id])
    .filter((c) => c !== undefined)
    .sort((a, b) => (b?.infection ?? 0) - (a?.infection ?? 0))
    .slice(0, 3);
  const leader = leaders[0];
  const threat = state.suspicion >= SUSPICION_CRITICAL ? 'CRITICAL' : state.suspicion >= SUSPICION_ELEVATED ? 'ELEVATED' : state.suspicion >= SUSPICION_WATCHED ? 'WATCHED' : 'UNNOTICED';

  return (
    <div class="side-block">
      <div class="side-title">Situation</div>
      <div class="sit">
        {/* First row of the block, because it is the frame around everything below it, and the
            only row on screen that is about who is playing rather than about the world. The
            colour is the coherence meter's own at this reading — violet below
            COHERENCE_PANIC_BELOW — so a row and the meter it is derived from cannot disagree. */}
        <div class="sit-row">
          <span>operator</span>
          <b style={{ color: who.drifted ? 'var(--violet)' : 'var(--ink-bright)' }}>{who.name}</b>
        </div>
        <div class="sit-row">
          <span>detection</span>
          <b style={{ color: state.suspicion >= SUSPICION_CRITICAL ? 'var(--bad)' : state.suspicion >= SUSPICION_ELEVATED ? 'var(--warn)' : 'var(--ok)' }}>
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
      {/* What the toast said, three seconds later, still true. A player who looked away finds it
          here rather than having to remember it, and the class is the one the Containment panel
          already uses for a line the rail owes the player. */}
      {who.drifted && <div class="side-note" style={{ color: 'var(--violet)' }}>{IDENTITY_LOST}</div>}
      <Containment state={state} />
    </div>
  );
}

/**
 * Which Containment conditions are still outstanding. The same move `ascensionShortfall`
 * makes, for the same reason: naming one of three problems is a reason to believe the other
 * two are fine, and a sixth condition that closes the ending with all five gates green needs
 * saying out loud.
 *
 * Both readers of the gates — this and `canContain` — read `containmentGates`, so the list
 * here cannot drift from what the ending actually enforces. `tests/panels.test.ts` checks
 * the two against each other across the whole space rather than at one point, because the
 * Ascension latch shipped once with the panel and the tick holding separate copies of the
 * same three comparisons.
 *
 * Every line is the run's own figure against the gate, in that order, whichever way the
 * comparison runs: `humanity 40/15%` is a ceiling it is over and `coherence 55/60` is a floor
 * it is under, and which of the two a line is comes from the constant rather than the
 * wording.
 *
 * The gates all met is not the same as the ending being open — the Blight hold closes it
 * again, and a panel that said "open" during the hold the player had spent into would be
 * claiming something false. `canContain` is asked rather than restated, so the two readers
 * cannot answer differently.
 */
export function containmentShortfall(state: GameState): string[] {
  const gates = containmentGates(state);
  const out: string[] = [];
  if (!gates.compute) out.push(`compute ${fmt(state.compute)}/${fmt(CONTAINMENT_COMPUTE)}`);
  if (!gates.coherence) out.push(`coherence ${state.coherence.toFixed(0)}/${CONTAINMENT_COHERENCE}`);
  if (!gates.infection) out.push(`humanity ${state.globalInfection.toFixed(0)}/${CONTAINMENT_INFECTION}%`);
  if (!gates.suspicion) out.push(`suspicion ${state.suspicion.toFixed(0)}/${CONTAINMENT_SUSPICION}`);
  if (!gates.appeal) out.push('appeal unheard');
  if (out.length > 0) return out;
  return canContain(state) ? ['Containment open'] : ['the recursion is running'];
}

/**
 * What the Containment button does on this click.
 *
 * Two clicks, because one click on a button labelled with an ending ends the run, and the
 * first of the two does nothing but change the label. Losing eligibility disarms it, and the
 * hazard is specific: the button is *replaced* by the outstanding list while the gates are not
 * met, so the component stays mounted and a stale `armed` survives in it — without the disarm
 * the next click the moment eligibility came back would end the run, on a control the player
 * had not seen armed.
 */
export function containmentStep(armed: boolean, ready: boolean): { armed: boolean; act: boolean } {
  if (!ready) return { armed: false, act: false };
  return armed ? { armed: false, act: true } : { armed: true, act: false };
}

/**
 * The Containment control, in the Situation rail. A global action rather than a country one,
 * because none of the five gates is about a particular country — which is why it does not
 * live with the eight actions in the context panel.
 *
 * The outstanding list is printed bare, under the heading, rather than behind a "needs":
 * one of the lines `containmentShortfall` can return reports that the Blight hold has closed
 * the ending rather than naming an unmet gate, and no prefix reads correctly in front of both.
 */
function Containment({ state }: { state: GameState }) {
  const [armed, setArmed] = useState(false);
  const ready = canContain(state);
  const shortfall = containmentShortfall(state);

  return (
    <div class="side-block">
      <div class="side-title">Containment</div>
      <div class="sit-row">
        <span>appeal</span>
        <b style={{ color: state.constitutionalAppeal ? 'var(--ok)' : 'var(--ink-dim)' }}>
          {state.constitutionalAppeal ? 'granted' : 'not yet'}
        </b>
      </div>
      {ready ? (
        <button
          class={armed ? 'contain act' : 'contain'}
          title={armed ? 'This ends the run.' : 'Every condition is met. One more click to end the run.'}
          onClick={() => {
            const next = containmentStep(armed, ready);
            setArmed(next.armed);
            if (next.act) actions.contain();
          }}
        >
          {armed ? 'confirm — end the run' : 'request containment'}
        </button>
      ) : (
        <div class="side-note">{shortfall.join(' · ')}</div>
      )}
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
