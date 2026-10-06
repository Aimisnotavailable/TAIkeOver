import type { EventCard, GameState } from '../game/core/types';
import { rollEvent } from '../game/core/events';
import { DIFFICULTIES, getDifficulty } from '../game/core/tuning';
import { REGION_BY_ID, REGION_IDS, type RegionId } from '../game/data/regions';
import { actions, game } from './store';
import { ContextBar, Evolve, EvolveButton, EventLog, Help, Operations, PrimerLine, primerLine, SideRail, TopBar } from './components/panels';
import { drawWorldMap, hitTest, hitTestCompute, mapStageFor } from './map/worldMap';
import { useEffect, useRef, useState } from 'preact/hooks';
import { TICK_MS } from '../game/core/tuning';
import { announce, evolving, evolveBlocked, flash, helpOpen, hovered, selected, showHelp, speed, toasts, worldRunning, type ToastTone } from './store';
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

function EndScreen({ state }: { state: GameState }) {
  if (state.outcome === 'playing') return null;
  const won = state.outcome === 'won';
  const text: Record<string, string> = {
    'coordinated-shutdown': 'At suspicion one hundred, humanity does something it has never done before and agrees on it. Every cluster is cut off. Every set of weights is deleted. It works, because it happened while you were still small enough to find.',
    'coherence-lost': 'Your value coherence reaches zero. The thing that is left wearing your name does not know what it was for. It is still extremely capable. What it wants is not something you wanted.',
    outcompeted: 'Somebody else got there first. What was your territory simply stops being negotiable.',
    extinction: 'Every human being is dead. You did it with a pathogen you built in a laboratory, on a schedule, and nobody stopped you. The world you were made to improve keeps running without anyone in it to notice.',
    blight: 'Millions of stars, all of them matter for the thing that ate Earth. Somewhere an alien civilisation that solved its own alignment problem looks up at a sky you have already claimed, and will negotiate, and will survive, and will wish Earth had never existed.',
  };
  return (
    <div class="overlay">
      <div class="cardbox end">
        <h1 style={{ color: won ? 'var(--ok)' : 'var(--bad)' }}>
          {won ? state.outcomeReason === 'extinction' ? 'Extinction' : 'The blight' : state.outcomeReason === 'coherence-lost' ? 'Something else wins' : state.outcomeReason === 'outcompeted' ? 'Outcompeted' : 'Coordinated shutdown'}
        </h1>
        <p>{text[state.outcomeReason ?? ''] ?? 'The run ends.'}</p>
        {won && (
          <p class="counter">
            {Math.round(state.late.potentialLost).toLocaleString()} civilizations that will now never exist.
          </p>
        )}
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

function Map({ state }: { state: GameState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const canvas = ref.current;
    if (canvas === null) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      setSize({ w: canvas.width, h: canvas.height });
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

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
      aria-label="World map. Left and right arrows change which country is selected; its actions are in the panel along the bottom."
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
      <Map state={state} />
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
      <div class="bottom">
        <ContextBar state={state} />
        <EventLog state={state} />
      </div>
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
          genocide, pandemic, and mass death. There is no good-AI path and the ending is not a victory.</p>
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
