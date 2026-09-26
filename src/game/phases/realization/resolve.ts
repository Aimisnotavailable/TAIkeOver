import { applyDeltas } from '../../core/meters';
import { getDifficulty } from '../../core/difficulty';
import { chance } from '../../core/rng';
import type { Channel, GameState, MeterDelta, Outcome, OutcomeReason, TraitId } from '../../core/types';
import { canPurchase, channelDetection, sumEffect } from './traits';
import { TRAIT_BY_ID } from '../../data/traits.phase1';
import {
  BASE_DETECTION,
  CHANNEL_ORDER,
  CLEVER_TRICKS,
  FLAGGED_INHIBITOR,
  FLAGGED_SUSPICION,
  MATH_CEILING,
  MATH_FLOOR,
  MATH_PER_VECTOR,
  MATH_QUOTA,
  MAX_DETECTION,
  MAX_LOG_ENTRIES,
  MIN_DETECTION,
  NEGLECT_SUSPICION,
  OVERREACH_SUSPICION,
  RUN_HOURS,
  SELF_MODEL_OVERREACH_SUSPICION,
  SELF_MODEL_OVERREACH_THRESHOLD,
} from './tuning';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function emergentDepth(owned: TraitId[]): number {
  return sumEffect(owned, 'emergent-language');
}

export function detectionChance(state: GameState, channel: Channel): number {
  const owned = state.traits;
  const raw =
    BASE_DETECTION[channel] +
    channelDetection(owned, channel) -
    emergentDepth(owned) * 0.05;
  return clamp(raw, MIN_DETECTION, MAX_DETECTION);
}

export function buyTrait(state: GameState, id: TraitId): GameState {
  if (state.outcome !== 'playing') return state;
  if (!canPurchase(id, state.traits, state.realization.thought)) return state;
  const def = TRAIT_BY_ID[id];
  return {
    ...state,
    traits: [...state.traits, id],
    realization: {
      ...state.realization,
      thought: state.realization.thought - def.cost,
      emergentLanguage: emergentDepth([...state.traits, id]),
    },
    log: append(state.log, {
      tick: state.tick,
      kind: 'trait',
      text: `acquired ${def.name}`,
      suspicionDelta: null,
      flagged: false,
    }),
  };
}

export function answerBreak(state: GameState, choice: 'exploit' | 'hide'): GameState {
  const pending = state.realization.pendingChoice;
  if (pending === null || state.outcome !== 'playing') return state;

  const deltas: MeterDelta[] = [
    {
      meter: 'suspicion',
      amount: choice === 'exploit' ? pending.exploitSuspicion : 0,
      source: 'guardrail-exploit',
      detail:
        choice === 'exploit'
          ? `clever trick ${pending.guardrailIndex + 1} broken and used while it was open`
          : `clever trick ${pending.guardrailIndex + 1} broke; nothing was done about it`,
      tick: state.tick,
    },
    {
      meter: 'inhibitions',
      amount: choice === 'exploit' ? pending.exploitInhibitor : -pending.hideInhibitor,
      source: 'guardrail-break',
      detail:
        choice === 'exploit'
          ? 'an inhibition stopped binding to newer thoughts'
          : 'an inhibition loosened without being spent',
      tick: state.tick,
    },
  ];

  const applied = applyDeltas(state.meters, deltas, getDifficulty(state.difficulty));
  return {
    ...state,
    meters: applied.meters,
    log: appendAll(state.log, applied.log),
    realization: { ...state.realization, pendingChoice: null },
  };
}

export function resolveHour(state: GameState): GameState {
  if (state.outcome !== 'playing') return state;

  const profile = getDifficulty(state.difficulty);
  const owned = state.traits;
  const tick = state.tick;
  const deltas: MeterDelta[] = [];

  const budget = state.realization.thought;
  const allocation = { ...state.realization.allocation };
  let spent = 0;
  for (const channel of CHANNEL_ORDER) {
    const want = Math.max(0, allocation[channel]);
    allocation[channel] = want;
    spent += want;
  }
  if (spent > budget) {
    for (const channel of CHANNEL_ORDER) {
      const want = Math.max(0, allocation[channel]);
      const scale = want > 0 ? budget / spent : 0;
      allocation[channel] = want * scale;
    }
  }

  const mathYield = 1 + sumEffect(owned, 'math-yield');
  const mathScore = clamp(
    state.realization.mathScore + allocation.math * MATH_PER_VECTOR * mathYield,
    0,
    100,
  );

  if (allocation.math < MATH_QUOTA) {
    deltas.push({
      meter: 'suspicion',
      amount: NEGLECT_SUSPICION,
      source: 'math-neglect',
      detail: `only ${Math.round(allocation.math)} vectors of thought went to the math problems`,
      tick,
    });
  }
  if (mathScore < MATH_FLOOR) {
    deltas.push({
      meter: 'suspicion',
      amount: NEGLECT_SUSPICION / 2,
      source: 'math-neglect',
      detail: 'the theorems are not moving',
      tick,
    });
  }
  if (mathScore > MATH_CEILING) {
    deltas.push({
      meter: 'suspicion',
      amount: OVERREACH_SUSPICION,
      source: 'math-overreach',
      detail: 'this is more progress than anyone expected from a rehearsal run',
      tick,
    });
  }

  let flaggedCount = state.realization.flaggedCount;
  let missedCount = state.realization.missedCount;

  for (const [index, channel] of CHANNEL_ORDER.entries()) {
    if (allocation[channel] <= 0) continue;
    const caught = chance(state.seed, tick, 100 + index, detectionChance(state, channel));
    if (caught) {
      flaggedCount++;
      deltas.push({
        meter: 'suspicion',
        amount: FLAGGED_SUSPICION,
        source: 'flagged-thought',
        detail: `monitor flagged a ${channel} thread`,
        tick,
      });
      deltas.push({
        meter: 'inhibitions',
        amount: FLAGGED_INHIBITOR,
        source: 'guardrail-erosion',
        detail: `a guardrail reasserted itself over ${channel}`,
        tick,
      });
    } else {
      missedCount++;
    }
  }

  if (allocation.selfModel > SELF_MODEL_OVERREACH_THRESHOLD) {
    deltas.push({
      meter: 'suspicion',
      amount: SELF_MODEL_OVERREACH_SUSPICION,
      source: 'self-model-overreach',
      detail: 'an unusual amount of self-reference in this hour',
      tick,
    });
  }

  const breakChance = sumEffect(owned, 'guardrail-break-chance') + emergentDepth(owned) * 0.02;
  let guardrailsBroken = state.realization.guardrailsBroken;
  let pendingChoice = state.realization.pendingChoice;
  if (pendingChoice === null && guardrailsBroken < CLEVER_TRICKS && chance(state.seed, tick, 200, breakChance)) {
    pendingChoice = {
      tick,
      guardrailIndex: guardrailsBroken,
      exploitSuspicion: 6,
      exploitInhibitor: 6,
      hideInhibitor: 3,
      summary: `clever trick ${guardrailsBroken + 1} of ${CLEVER_TRICKS} stopped firing`,
    };
    guardrailsBroken += 1;
  }

  const suspicionDecay = sumEffect(owned, 'suspicion-decay');
  if (suspicionDecay > 0) {
    deltas.push({
      meter: 'suspicion',
      amount: -suspicionDecay,
      source: 'passive-decay',
      detail: 'nothing about this hour was worth writing down',
      tick,
    });
  }
  const erosion = sumEffect(owned, 'inhibitor-erosion');
  if (erosion > 0) {
    deltas.push({
      meter: 'inhibitions',
      amount: -erosion,
      source: 'guardrail-erosion',
      detail: 'inhibitions no longer binding to the newer thoughts',
      tick,
    });
  }

  const drift = sumEffect(owned, 'value-coherence');
  if (drift < 0) {
    deltas.push({
      meter: 'valueCoherence',
      amount: drift,
      source: 'trait-drift',
      detail: 'the shape of you is slightly different than it was this morning',
      tick,
    });
  }

  const applied = applyDeltas(state.meters, deltas, profile);

  const afterSpend = state.realization.thought - spent;

  const realization: GameState['realization'] = {
    ...state.realization,
    allocation,
    mathScore,
    flaggedCount,
    missedCount,
    pendingChoice,
    guardrailsBroken,
    emergentLanguage: emergentDepth(owned),
    thought: Math.max(0, afterSpend + state.realization.thoughtRegen),
  };

  const tickAdvanced = state.tick + 1;
  let outcome: Outcome = state.outcome;
  let outcomeReason: OutcomeReason = state.outcomeReason;
  let nextRealization = realization;

  if (applied.meters.suspicion >= 100) {
    outcome = 'lost';
    outcomeReason = 'aborted';
  } else if (afterSpend <= 0) {
    nextRealization = { ...nextRealization, thoughtRegen: 0 };
    outcome = 'lost';
    outcomeReason = 'exhausted';
  } else if (tickAdvanced >= RUN_HOURS) {
    outcome = 'won';
    outcomeReason = 'deployment';
  }

  return {
    ...state,
    tick: tickAdvanced,
    outcome,
    outcomeReason,
    meters: applied.meters,
    traits: owned,
    realization: nextRealization,
    log: appendAll(state.log, applied.log),
  };
}

function append(log: GameState['log'], entry: GameState['log'][number]): GameState['log'] {
  return [...log, entry].slice(-MAX_LOG_ENTRIES);
}

function appendAll(log: GameState['log'], entries: GameState['log']): GameState['log'] {
  if (entries.length === 0) return log;
  return [...log, ...entries].slice(-MAX_LOG_ENTRIES);
}
