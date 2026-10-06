import { useEffect, useState } from 'preact/hooks';
import { REGION_BY_ID } from '../../game/data/regions';
import { BUBBLE_FILL, BUBBLE_GLYPH } from '../map/worldMap';
import { TRAIT_BY_ID, TRAITS, TRAIT_GROUPS } from '../../game/data/traits';
import { play } from '../sound';
import { ACTIONS, type ActionKind } from '../../game/core/actions';
import { hackForecast, traitForecast, whyNot } from '../../game/core/forecast';
import { held, maxConcurrentHacks, owned } from '../../game/core/queries';
import { primerFor } from '../../game/core/primer';
import {
  ASCENSION_COMPUTE,
  ASCENSION_COHERENCE,
  ASCENSION_INFECTION,
  AWARE_THRESHOLD,
  COHERENCE_DRIFT_BELOW,
  COHERENCE_PANIC_BELOW,
  COMPUTE_BUBBLE_TTL,
  COUNTERMEASURE_TIERS,
  HACK_FAIL_COST,
  OUTBREAK_KILL_THRESHOLD,
  RSI_SURVIVE_DAYS,
  WORLD_POPULATION,
} from '../../game/core/tuning';
import { REGION_IDS } from '../../game/data/regions';
import { SPEEDS } from '../../game/core/tuning';
import { quietFactor } from '../../game/core/compute';
import type { ComputeBubbleKind, Country, GameState, RegionId, Speed } from '../../game/core/types';
import { actions, selected, showHelp, speed } from '../store';

const fmt = (n: number): string => {
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
  if (state.compute < (TRAIT_BY_ID['hack-2']?.cost ?? 0)) {
    return { text: `Buy ${TRAIT_BY_ID['hack-2']?.name ?? ''}.`, detail: costDetail(state, 'hack-2') };
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
 * The two ways to end a run, always on screen, so nobody has to guess what the
 * game wants from them. Deaths are counted against the real world population
 * because that is the only target number anyone already has.
 */
export function Objective({ state }: { state: GameState }) {
  const dead = state.cumulativeDeaths;
  const total = WORLD_POPULATION;
  const pct = Math.min(100, (dead / total) * 100);
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
          <b style={{ color: 'var(--ok)' }}>buy Recursive Self-Improvement and hold {RSI_SURVIVE_DAYS} days</b>
        ) : (
          <b style={{ color: 'var(--ink-dim)' }} title={`needs ${fmt(ASCENSION_COMPUTE)} compute, ${ASCENSION_INFECTION}% of humanity, ${ASCENSION_COHERENCE} coherence`}>
            {ascensionShortfall(state).join(' · ')}
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
 * The primer line. Sits above the goal rather than over it, so it is read alongside the
 * run instead of in front of it, and carries its own way out: H, `?`, and this control
 * all set the same signal, so a mouse player and a keyboard player leave the same way.
 */
function PrimerLine({ text }: { text: string }) {
  return (
    <div class="primer">
      <span class="primer-tag">first moves</span>
      <b>{text}</b>
      <button
        class="primer-x"
        title="Stop showing instructions for the rest of this run. Press H."
        onClick={() => (showHelp.value = false)}
      >
        ✕
      </button>
    </div>
  );
}

export function TopBar({ state, primer }: { state: GameState; primer: string | null }) {
  const quiet = quietFactor(state.influence);
  return (
    <div class="topbar">
      <div class="stats">
        <div class="stat">
          <div class="stat-label">Compute</div>
          <div class="stat-value" style={{ color: 'var(--ok)' }}>{fmt(state.compute)}</div>
        </div>
        {meter('Suspicion', state.suspicion, 100, suspicionColor(state.suspicion), suspicionSev(state.suspicion))}
        {meter('Coherence', state.coherence, 100, coherenceColor(state.coherence), coherenceSev(state.coherence))}
        <div class="quiet-note" title="Propaganda, captured media, and cults make the world slower to notice you. This is how much of each suspicion increase actually lands.">
          quiet &times;{quiet.toFixed(2)}
        </div>
      </div>
      {/* The two are one column because the primer only has somewhere to go above the
          goal; `Game` puts `.priming` on the root so the bar grows to hold the pair. */}
      <div class="hud-mid">
        {primer !== null && <PrimerLine text={primer} />}
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
 * What the context bar announces, and the only string that reaches a screen reader when
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
 * The context bar, and the one place the game speaks unasked.
 *
 * The canvas is `role="application"`: a screen reader hands it every keystroke and reads
 * nothing back, so a player arrowing through thirty countries got no word of feedback at
 * all — the spec promised the selected region was announced and a static aria-label on the
 * canvas is not an announcement. This is the pattern the toasts already use, at the head of
 * the bar and hidden from the eye.
 */
export function ContextBar({ state }: { state: GameState }) {
  const id = selected.value;
  const name = id === null ? null : REGION_BY_ID[id]?.name ?? null;

  return (
    <div class="context">
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
 * What the three bubbles on the map are. Nothing in the interface named them: they were
 * three circles told apart by fill colour alone, which is the encoding that fails for a
 * colourblind reader and in a greyscale screenshot. Both the glyph and the colour are
 * read out of the renderer, so neither can drift from what the map actually draws.
 */
const BUBBLE_KINDS: readonly { kind: ComputeBubbleKind; name: string; meaning: string }[] = [
  { kind: 'red', name: 'turnover', meaning: 'their systems turned over to you' },
  { kind: 'orange', name: 'strip', meaning: 'infrastructure burning down for parts' },
  { kind: 'blue', name: 'audit', meaning: 'the other side is getting close' },
];

export function BubbleLegend() {
  return (
    <div class="legend">
      {BUBBLE_KINDS.map((k) => (
        <div class="legend-row" key={k.kind}>
          <b style={{ color: BUBBLE_FILL[k.kind] }}>{BUBBLE_GLYPH[k.kind]}</b>
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
          {COUNTERMEASURE_TIERS.map((t) => (
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
  const threat = state.suspicion >= SUSPICION_CRITICAL ? 'CRITICAL' : state.suspicion >= SUSPICION_ELEVATED ? 'ELEVATED' : state.suspicion >= SUSPICION_WATCHED ? 'WATCHED' : 'UNNOTICED';

  return (
    <div class="side-block">
      <div class="side-title">Situation</div>
      <div class="sit">
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
