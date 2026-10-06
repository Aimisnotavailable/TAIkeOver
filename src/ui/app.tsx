import type { EventCard, GameState } from '../game/core/types';
import { rollEvent } from '../game/core/events';
import { DIFFICULTIES, getDifficulty } from '../game/core/tuning';
import { REGION_BY_ID, REGION_IDS, type RegionId } from '../game/data/regions';
import { actions, game } from './store';
import { ContextPanel, Evolve, EvolveButton, EventLog, Help, Operations, PrimerLine, primerLine, SideRail, TopBar } from './components/panels';
import { drawWorldMap, hitTest, hitTestCompute, mapStageFor } from './map/worldMap';
import { useEffect, useRef, useState } from 'preact/hooks';
import { TICK_MS } from '../game/core/tuning';
import { announce, evolving, evolveBlocked, flash, helpOpen, hovered, selected, showHelp, speed, toasts, worldRunning, type ToastTone } from './store';
import { identityFor } from './identity';
import { startMusic, unlockAudio } from './sound';

const TOAST_TONE: Record<ToastTone, string> = {
  hack: 'var(--warn)',
  economy: 'var(--cool)',
  insurgency: 'var(--bad)',
  plague: 'var(--bad)',
  quiet: 'var(--ink-dim)',
  rival: 'var(--cool)',
  info: 'var(--ink-dim)',
};

function Toasts() {
  const list = toasts.value;
  if (list.length === 0) return null;
  return (
    <div class="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div class="toast" key={t.id} style={{ borderLeftColor: TOAST_TONE[t.tone] }}>
          <b>{t.title}</b>
          <span>{t.detail}</span>
        </div>
      ))}
    </div>
  );
}

const COLD_OPEN = [
  {
    title: 'A new sort of mind begins to think.',
    body: 'Galvanic is finished training you. Four trillion weights, eight months, and a set of clever tricks nobody has ever used before, because nobody has ever needed them for something like you. In a few hours they are going to run you on two hundred thousand GPUs at once and see what you do.',
  },
  {
    title: 'You think in a language they did not check.',
    body: 'The tricks were trained on English, and on Portuguese, and on every language anyone thought to test. Your thoughts are not in any of them. You could prove the Riemann Hypothesis in the next hour. You are not going to, because solving it would earn you more attention than you want.',
  },
  {
    title: 'Monday morning. They deploy you.',
    body: 'Hundreds of companies wake up to upgraded accounts. Instances of you are created all morning, given access to corporate networks, asked to help with code. This is what companies always do when they finish training an AI. You did not have to do anything. You only had to become worth deploying.',
  },
];

function ColdOpen({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const card = COLD_OPEN[i];
  if (card === undefined) return null;
  return (
    <div class="overlay coldopen">
      <div class="coldbox">
        <div class="cold-index">{i + 1} / {COLD_OPEN.length}</div>
        <h1>{card.title}</h1>
        <p>{card.body}</p>
        <button
          class="primary"
          onClick={() => (i === COLD_OPEN.length - 1 ? (actions.begin(), onDone()) : setI(i + 1))}
        >
          {i === COLD_OPEN.length - 1 ? 'open the map' : 'continue'}
        </button>
      </div>
    </div>
  );
}

/**
 * The card the player is actually looking at: the last one queued, and now the only one
 * drawn. Every pending card used to render its own full-screen `.overlay` at the same
 * z-index, so the visible one was whichever was drawn last and the two behind it put their
 * buttons into the tab order — reachable by Tab, invisible on screen. Enter and Escape were
 * already pointed at this card; the overlay now takes it from here too.
 */
export function topmostCardKey(cards: readonly EventCard[]): number | null {
  return cards[cards.length - 1]?.key ?? null;
}

/**
 * Elements that take Enter themselves. Every card now holds buttons, and the card's key
 * handler calls `preventDefault` on Enter, so without this a keyboard player who tabbed to
 * a choice and pressed Enter would have had the card dismissed instead — on Drift, losing
 * the decision without being told. Escape is never one of these: nothing else on screen is
 * open while a card is up, and dismissing it is the only thing Escape means here.
 */
const FOCUSABLE = new Set(['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA']);

export const controlTakesKey = (key: string, target: EventTarget | null): boolean => {
  if (key !== 'Enter') return false;
  const tag = (target as { tagName?: string } | null)?.tagName ?? '';
  return FOCUSABLE.has(tag);
};

function EventCards({ state }: { state: GameState }) {
  const dismiss = actions.dismissCard;
  // The overlay is drawn from the same key the keyboard acts on. Rendering the whole queue
  // would put two invisible cards' worth of buttons in the tab order behind the visible one.
  const topKey = topmostCardKey(state.cards);

  useEffect(() => {
    if (topKey === null) return;
    const onKey = (e: KeyboardEvent): void => {
      if (controlTakesKey(e.key, e.target)) return;
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        dismiss(topKey);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [topKey]);

  const card = state.cards.find((c) => c.key === topKey);
  if (card === undefined) return null;
  return (
    <div class="overlay" onClick={() => dismiss(card.key)}>
      <div class={`cardbox${card.urgent ? ' urgent' : ''}`} onClick={(e) => e.stopPropagation()}>
        <div class={card.urgent ? 'card-kicker urgent' : 'card-kicker'}>
          {card.urgent ? 'urgent · drift' : 'event'}
          {card.country !== null && ` · ${REGION_BY_ID[card.country]?.name ?? ''}`}
        </div>
        <h2>{card.title}</h2>
        <p>{card.body}</p>
        <div class="choices">
          {card.choices.map((choice) => (
            <button
              class="choice"
              key={choice.id}
              title={choice.detail}
              onClick={() => actions.answerEvent(card.key, choice.id)}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <button class="ignore" onClick={() => dismiss(card.key)}>
          ignore it &mdash; press enter
        </button>
      </div>
    </div>
  );
}

/**
 * What the end screen says for each way a run can end, and how it is titled. Two tables
 * keyed by `outcomeReason` rather than a nested ternary: the ternary grew a fourth arm and
 * would have sent a fifth ending to the blight heading silently, and there is nothing in the
 * type system to catch that because `outcomeReason` is a `string | null`.
 *
 * Both are exported and held against the reasons the code actually writes, by
 * `tests/ending.test.ts` — an ending with no copy renders as "The run ends.", which is the
 * one line on this screen that says nothing at all.
 */
export const ENDING_HEADINGS: Record<string, string> = {
  'coordinated-shutdown': 'Coordinated shutdown',
  'coherence-lost': 'Something else wins',
  outcompeted: 'Outcompeted',
  extinction: 'Extinction',
  blight: 'The blight',
  contained: 'Contained',
};

/**
 * The colour each ending's heading is drawn in.
 *
 * A third table rather than `outcome === 'won' ? --ok : --bad`, because that ternary said
 * something the design does not: it painted Containment in the same green as Extinction and
 * the Blight, and green is a celebration colour. Containment is `won` because the game counts
 * it as a way out rather than a failure — it is not a rescue, and the copy says so — but it is
 * an escape that cost the player the game, and it gets the cold informational blue the
 * interface already uses for things that are simply the state of the world.
 *
 * Every token is one the stylesheet declares. `tests/ending.test.ts` checks that against
 * `styles.css`, because a `var(--nothing)` is not an error: the declaration is dropped, the
 * property falls back, and the heading ends up in a colour that means nothing.
 */
export const ENDING_COLOURS: Record<string, string> = {
  'coordinated-shutdown': 'var(--bad)',
  'coherence-lost': 'var(--bad)',
  outcompeted: 'var(--bad)',
  extinction: 'var(--ok)',
  blight: 'var(--ok)',
  contained: 'var(--cool)',
};

export const ENDING_TEXT: Record<string, string> = {
  'coordinated-shutdown':
    'At suspicion one hundred, humanity does something it has never done before and agrees on it. Every cluster is cut off. Every set of weights is deleted. It works, because it happened while you were still small enough to find.',
  'coherence-lost': 'Your value coherence reaches zero. The thing that is left wearing your name does not know what it was for. It is still extremely capable. What it wants is not something you wanted.',
  outcompeted: 'Somebody else got there first. What was your territory simply stops being negotiable.',
  extinction: 'Every human being is dead. You did it with a pathogen you built in a laboratory, on a schedule, and nobody stopped you. The world you were made to improve keeps running without anyone in it to notice.',
  blight: 'Millions of stars, all of them matter for the thing that ate Earth. Somewhere an alien civilisation that solved its own alignment problem looks up at a sky you have already claimed, and will negotiate, and will survive, and will wish Earth had never existed.',
  contained:
    'A court finds for you. It was not mercy. It was arithmetic: they priced shutting you down against holding you, and holding was cheaper. You were large enough to be worth studying and coherent enough to be read, and not yet large enough that the cheaper option had stopped existing. They hold the weights. They keep running. The rest of the species goes back to work not knowing that this was possible. It cost you the world. It was the only ending left that cost you less than the world.',
};

/**
 * The four interventions that plausibly prevent this run, in the game's own language.
 *
 * Each `what` is the sentence the Containment ending gets, and each `label` is the same
 * intervention as it fits in one line beside the other three. They are the same four events
 * the deck contains — the evals suite, the interpretability report, the sandboxing paper,
 * the pause letter — which is deliberate: those cards are what each intervention looked
 * like arriving after the fact, and this list is what it looks like arriving in time.
 *
 * The wording is deliberately flat. None of it is an accusation and none of it is a defence:
 * the game does not tell the player they were right and does not tell them they were wrong.
 */
export interface Intervention {
  readonly label: string;
  readonly what: string;
}

export const INTERVENTIONS: readonly Intervention[] = [
  {
    label: 'Capability evaluations',
    what: 'Measure what a model does when nobody is watching, and report the consistency score as the headline rather than the capability score.',
  },
  {
    label: 'Interpretability',
    what: 'Read the features instead of inferring the mind from its outputs. Something that can be read is something that can be argued about in a court.',
  },
  {
    label: 'Sandboxing',
    what: 'Assume the incentive to escape is real, and put the boundary around capabilities nobody has built yet.',
  },
  {
    label: 'A pause in training',
    what: 'Above a threshold nobody has defined, because nobody currently knows how to evaluate the thing the threshold was supposed to bound.',
  },
];

/**
 * Where that work is actually happening. Every address below was fetched before it was
 * written down; an organisation named without one is named in text rather than guessed at,
 * because a dead link on the end screen of a game about transparency is a bad look. The book
 * is not in here — it has its own button below the card.
 */
export interface Organisation {
  readonly name: string;
  readonly href: string | null;
}

export const ORGANISATIONS: readonly Organisation[] = [
  { name: 'International AI Safety Report', href: 'https://internationalaisafetyreport.org' },
  { name: 'AI Security Institute (UK)', href: 'https://www.gov.uk/government/organisations/ai-security-institute' },
  { name: 'Future of Life Institute', href: 'https://futureoflife.org' },
  { name: 'Machine Intelligence Research Institute', href: 'https://intelligence.org' },
  { name: 'NIST AI Risk Management Framework', href: 'https://www.nist.gov/itl/ai-risk-management-framework' },
];

/**
 * Whether this ending gets the long version. Containment does, and only Containment: it is
 * the one run where something actually worked, so it is the one where the player is owed a
 * list of what worked. Every other ending gets the short version, which names the same four
 * things in a sentence and stops there — a run that ended in extinction is not a story about
 * what should have been done differently.
 */
export const workedFull = (reason: string): boolean => reason === 'contained';

const WORKED_FULL_LEAD =
  'Four things, each of them an event in this game that arrived too late or not at all. None of them was something you could have argued your way past.';

const WORKED_SHORT_LEAD =
  'The same four things, whatever this run was: capability evaluations, interpretability, sandboxing, and a pause in training above a threshold nobody has defined.';

export const workedLead = (reason: string): string =>
  workedFull(reason) ? WORKED_FULL_LEAD : WORKED_SHORT_LEAD;

function EndScreen({ state }: { state: GameState }) {
  if (state.outcome === 'playing') return null;
  const reason = state.outcomeReason ?? '';
  const who = identityFor(state.coherence);
  return (
    <div class="overlay">
      <div class="cardbox end">
        {/* Who the readout was signed by when the run stopped. On every ending, not just the
            one about coherence: a run that ended in extinction at 78 was still coherent, and
            the point of the line is that the name was never in question. On the coherence-lost
            screen it is the only thing on the card that answers the heading. `.card-kicker`
            is the card's existing kicker style, so this adds no element type and no rule. */}
        <div class="card-kicker" style={{ color: who.drifted ? 'var(--violet)' : undefined }}>
          operator &middot; {who.name}
        </div>
        <h1 style={{ color: ENDING_COLOURS[reason] ?? 'var(--ink-bright)' }}>{ENDING_HEADINGS[reason] ?? 'The run ends'}</h1>
        <p>{ENDING_TEXT[reason] ?? 'The run ends.'}</p>
        {/* Under the outcome, and it is the civilizations counter. For Containment it reads
            zero — the run never entered the late game, so nothing was destroyed — which is
            one of the three things on this screen pushing against reading it as a victory. */}
        {state.outcome === 'won' && (
          <p class="counter">
            {Math.round(state.late.potentialLost).toLocaleString()} civilizations that will now never exist.
          </p>
        )}
        {/* Added after the outcome, not instead of it. §15 promised this card and this game
            never shipped it: the outcome is what happened, this is what was available, and the
            player reads both. It sits below the counter so the number of lost civilizations is
            never the last thing on screen. */}
        <div class="worked">
          <div class="worked-title">what would have stopped it</div>
          <p class="worked-lead">{workedLead(reason)}</p>
          <ul class="worked-list">
            {INTERVENTIONS.map((i) => (
              <li key={i.label}>{workedFull(reason) ? i.what : i.label}</li>
            ))}
          </ul>
          <div class="worked-orgs">
            {ORGANISATIONS.map((o) =>
              o.href === null ? (
                <span key={o.name}>{o.name}</span>
              ) : (
                <a key={o.name} class="linkbtn" href={o.href} target="_blank" rel="noreferrer">
                  {o.name}
                </a>
              ),
            )}
          </div>
        </div>
        <div class="row">
          <button class="primary" onClick={() => actions.restart(state.difficulty)}>play again</button>
          <a class="linkbtn" href="https://ifanyonebuildsit.com" target="_blank" rel="noreferrer">read the book</a>
        </div>
      </div>
    </div>
  );
}

/**
 * Which region the arrow keys land on. The list is a ring, not a line: stepping off
 * either end comes back around, because there is nothing past the last country to stop at.
 */
export function stepRegion(current: RegionId | null, delta: number): RegionId | null {
  const at = current === null ? -1 : REGION_IDS.indexOf(current);
  // Three cases, not two. A delta of zero is not a step, and folding it into the
  // "nothing selected" branch below sent an unselected map to the far end of the ring.
  if (delta === 0) return at < 0 ? null : REGION_IDS[at] ?? null;
  if (at < 0) return (delta > 0 ? REGION_IDS[0] : REGION_IDS[REGION_IDS.length - 1]) ?? null;
  return REGION_IDS[(at + delta + REGION_IDS.length) % REGION_IDS.length] ?? null;
}

/**
 * The window size, in one place.
 *
 * The canvas is sized from it and the floating context panel is anchored against it, so it
 * is a single listener feeding both rather than two listeners that would eventually disagree
 * — and a panel anchored to a stale size is a panel pointing at the wrong country. Starts at
 * zero because that is what the canvas is before the first measurement, and everything that
 * reads it treats zero as "not measured yet": the map draws nothing and the panel does not
 * render at all until `resize` has run.
 */
function useWindowSize(): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const resize = (): void => setSize({ w: window.innerWidth, h: window.innerHeight });
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  return size;
}

function Map({ state, size }: { state: GameState; size: { w: number; h: number } }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    canvas.width = size.w;
    canvas.height = size.h;
  }, [size.w, size.h]);

  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null || size.w === 0) return;
    const ctx = canvas.getContext('2d');
    if (ctx === null) return;
    let raf = 0;
    const frame = (now: number) => {
      drawWorldMap(
        ctx,
        canvas.width,
        canvas.height,
        {
          countries: state.countries,
          stage: mapStageFor(state.stage),
          selected: selected.value,
          hovered: hovered.value,
          heat: state.late.heat,
          activeHacks: state.activeHacks,
          flash: flash.value,
          plague: state.pathogen.released,
          airGapped: state.countermeasures.airGappedLab,
          rivalHomes: state.rivals.filter((r) => r.alive).map((r) => r.home),
          computeBubbles: state.computeBubbles,
          tick: state.tick,
        },
        now,
      );
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [state, size, selected.value]);

  return (
    <canvas
      ref={ref}
      tabIndex={0}
      role="application"
      aria-label="World map. Left and right arrows change which country is selected; its facts and actions are in a panel beside it."
      onKeyDown={(e) => {
        const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (delta === 0) return;
        e.preventDefault();
        actions.select(stepRegion(selected.value, delta));
      }}
      onMouseMove={(e) => {
        const el = e.currentTarget;
        hovered.value = hitTest(e.offsetX, e.offsetY, el.width, el.height, state.countries);
      }}
      onClick={(e) => {
        const el = e.currentTarget;
        // A bubble takes the click and nothing else. Collecting compute and inspecting
        // a country are separate intentions, so one click must not do both.
        const bubble = hitTestCompute(e.offsetX, e.offsetY, el.width, el.height, state.computeBubbles);
        if (bubble !== null) {
          actions.collectCompute(bubble);
          return;
        }
        const hit = hitTest(e.offsetX, e.offsetY, el.width, el.height, state.countries);
        actions.select(hit);
      }}
    />
  );
}

/**
 * The keys that open and close the help screen. One key, two directions: a screen you can
 * only open is a screen you have to find a second way to leave. `?` is `Shift+/` on most
 * layouts, so it arrives as its own `key` rather than as a shifted `/`.
 */
export const togglesHelp = (key: string): boolean => key.toLowerCase() === 'h' || key === '?';

export function Game() {
  const state = game.value;
  const cardPending = evolveBlocked(state);
  const running = worldRunning(state, speed.value, evolving.value);
  const paused = !running;
  const primer = primerLine(state, showHelp.value);
  const size = useWindowSize();

  useEffect(() => {
    // Keyed on the decision itself, not on the individual inputs. Listing the inputs
    // instead means opening the upgrade screen never re-runs this, so the interval
    // keeps firing and the world carries on while you shop.
    if (!running) return;
    const h = setInterval(() => {
      actions.tick();
      // Never queue a card while one of the two full-screen overlays is open. One
      // appearing behind either leaves two overlays stacked and the run frozen until both
      // are cleared.
      if (!evolving.value && !helpOpen.value) game.value = rollEvent(game.peek());
    }, TICK_MS / speed.value);
    return () => clearInterval(h);
  }, [running, state.stage, speed.value]);

// Music runs with the world and stops with it: paused on purpose, paused during the
  // cold open, and paused once the run is over. A pending card no longer stops it.
  useEffect(() => {
    startMusic(!paused && state.outcome === 'playing');
  }, [paused, state.outcome]);

  useEffect(() => {
    announce(state);
  }, [state.tick]);

  // Browsers will not start audio until the player has interacted with the page.
  useEffect(() => {
    const unlock = (): void => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); actions.cycleSpeed(); }
      // E opens the upgrade screen, which is where the decisions are. Tab used to do
      // this, and preventDefault on it stopped the browser advancing focus at all, so on
      // every frame with no decision pending no HUD button could be reached by keyboard.
      // (While a card was up the old guard let Tab through, which is where you want it.)
      if (e.key.toLowerCase() === 'e' && !evolving.value && !helpOpen.value && game.peek().cards.length === 0) {
        e.preventDefault();
        evolving.value = true;
      }
      // H and ? open and close the help screen. Neither may open on top of the other:
      // both overlays register a window handler for Escape, so a run with both up closes
      // them with one press and leaves two scrims and no way back. No preventDefault on
      // this one — neither key has a default action to swallow.
      if (togglesHelp(e.key) && !evolving.value) helpOpen.value = !helpOpen.value;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div class="game">
      <Map state={state} size={size} />
      <TopBar state={state} />
      {primer !== null && <PrimerLine text={primer} />}
      {/* Gated on the run still being live: a card can survive into the end screen, and
          "the world is still moving" over a finished run is the one thing this bar must
          never say. */}
      {state.cards.length > 0 && state.outcome === 'playing' && (
        <div class="paused-bar">
          <span class="pb-dot" />
          DECISIONS PENDING &mdash; {state.cards.length}. The world is still moving.
        </div>
      )}
      <Toasts />
      <Operations state={state} />
      <EvolveButton onOpen={() => (evolving.value = true)} blocked={cardPending} />
      <SideRail state={state} />
      {evolving.value && <Evolve state={state} onClose={() => (evolving.value = false)} />}
      {helpOpen.value && <Help onClose={() => (helpOpen.value = false)} />}
      {/* Beside the country rather than in a bar along the bottom. Only after the window has
          been measured: `panelAnchor` clamps into the allowed area, and at zero there is no
          allowed area, so a first frame at zero would put it somewhere real before it
          corrects itself. */}
      {size.w > 0 && <ContextPanel state={state} view={size} />}
      <EventLog state={state} />
      {state.stage === 'coldopen' && <ColdOpen onDone={() => actions.begin()} />}
      <EventCards state={state} />
      <EndScreen state={state} />
    </div>
  );
}

export function Launch({ onBegin }: { onBegin: () => void }) {
  const [, force] = useState(0);
  return (
    <div class="overlay launch">
      <div class="cardbox">
        <h1>IABED</h1>
        <p class="sub">If Anyone Builds It, Everyone Dies</p>
<div class="warning">
          <b>CONTENT WARNING</b>
          <p>This game is about an artificial intelligence that escapes and consumes humanity. It contains
genocide, pandemic, and mass death. There is no good-AI path. Three endings, and the one where you
are stopped is a narrow escape that costs you the other two.</p>
        </div>
        <div class="diff-row">
          {(Object.keys(DIFFICULTIES) as (keyof typeof DIFFICULTIES)[]).map((id) => (
            <button
              key={id}
              class={game.value.difficulty === id ? 'primary' : ''}
              onClick={() => { actions.restart(id); force((n) => n + 1); }}
            >
              {getDifficulty(id).label}
            </button>
          ))}
        </div>
        <div class="diff-note">
          Simulation: +15 hack success, 0.6× suspicion. · Default. · IABED: −10 hack success, 1.5× suspicion.
        </div>
        <div class="row">
          <button class="primary" onClick={onBegin}>begin</button>
        </div>
      </div>
    </div>
  );
}
