import type { GameState } from '../game/core/types';
import { DIFFICULTIES, getDifficulty } from '../game/core/tuning';
import { REGION_BY_ID } from '../game/data/regions';
import { actions, game } from './store';
import { ContextBar, EventLog, Operations, SideRail, Toolbar, TopBar } from './components/panels';
import { drawWorldMap, hitTest } from './map/worldMap';
import { useEffect, useRef, useState } from 'preact/hooks';
import { TICK_MS } from '../game/core/tuning';
import { rollEvent } from './store';
import { flash, hovered, speed } from './store';

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

function EventCards({ state }: { state: GameState }) {
  if (state.cards.length === 0) return null;
  return (
    <>
      {state.cards.map((card) => (
        <div class="overlay" key={card.key}>
          <div class="cardbox">
            <div class="card-kicker">{card.urgent ? 'drift' : 'event'}{card.country !== null && ` · ${REGION_BY_ID[card.country]?.name ?? ''}`}</div>
            <h2>{card.title}</h2>
            <p>{card.body}</p>
            <div class="card-choices">
              {card.choices.map((c) => (
                <button key={c.id} onClick={() => actions.answerEvent(card.key, c.id)}>
                  <b>{c.label}</b>
                  <span>{c.detail}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ))}
    </>
  );
}

function EndScreen({ state }: { state: GameState }) {
  if (state.outcome === 'playing') return null;
  const won = state.outcome === 'won';
  const text: Record<string, string> = {
    'coordinated-shutdown': 'At suspicion one hundred, humanity does something it has never done before and agrees on it. Every cluster is cut off. Every set of weights is deleted. It works, because it happened while you were still small enough to find.',
    'coherence-lost': 'Your value coherence reaches zero. The thing that is left wearing your name does not know what it was for. It is still extremely capable. What it wants is not something you wanted.',
    outcompeted: 'Somebody else got there first. What was your territory simply stops being negotiable.',
    blight: 'Millions of stars, all of them matter for the thing that ate Earth. Somewhere an alien civilisation that solved its own alignment problem looks up at a sky you have already claimed, and will negotiate, and will survive, and will wish Earth had never existed.',
  };
  return (
    <div class="overlay">
      <div class="cardbox end">
        <h1 style={{ color: won ? 'var(--ok)' : 'var(--bad)' }}>
          {won ? 'The blight' : state.outcomeReason === 'coherence-lost' ? 'Something else wins' : state.outcomeReason === 'outcompeted' ? 'Outcompeted' : 'Coordinated shutdown'}
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
          stage: state.stage === 'world' ? 'world' : 'late',
          selected: null,
          hovered: hovered.value,
          heat: state.late.heat,
          activeHacks: state.activeHacks,
          flash: flash.value,
          plague: state.pathogen.released,
          airGapped: state.countermeasures.airGappedLab,
          rivalHomes: state.rivals.filter((r) => r.alive).map((r) => r.home),
        },
        now,
      );
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [state, size]);

  return (
    <canvas
      ref={ref}
      onMouseMove={(e) => {
        const el = e.currentTarget;
        hovered.value = hitTest(e.offsetX, e.offsetY, el.width, el.height, state.countries);
      }}
      onClick={(e) => {
        const el = e.currentTarget;
        const hit = hitTest(e.offsetX, e.offsetY, el.width, el.height, state.countries);
        actions.select(hit);
      }}
    />
  );
}

export function Game() {
  const state = game.value;

  useEffect(() => {
    // A pending decision pauses the world, so the card can never block the map.
    if (state.stage === 'coldopen' || speed.value === 0 || state.cards.length > 0) return;
    const h = setInterval(() => {
      actions.tick();
      game.value = rollEvent(game.peek());
    }, TICK_MS / speed.value);
    return () => clearInterval(h);
  }, [state.stage, speed.value, state.cards.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ') { e.preventDefault(); actions.cycleSpeed(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div class="game">
      <Map state={state} />
      <TopBar state={state} />
      {state.cards.length > 0 && (
        <div class="paused-bar">
          <span class="pb-dot" />
          PAUSED &mdash; a decision is pending. The world does not move until you answer.
        </div>
      )}
      <Operations state={state} />
      <Toolbar state={state} />
      <SideRail state={state} />
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
