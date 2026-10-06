import type { DifficultyId, DifficultyProfile } from '../core/types';

export const TICK_MS = 7000;
export const SPEEDS = [0, 1, 2, 4, 8] as const;

export const STARTING_COMPUTE = 300;
export const STARTING_INFLUENCE = 60;

// Influence buys quiet, not speed. This is the floor on how much of a suspicion
// gain survives, so a propaganda empire can never make you invisible.
export const INFLUENCE_QUIET_FLOOR = 0.35;
export const INFLUENCE_MAX = 1000;
export const COMPUTE_CEILING = 30_000;
export const HARDEN_RISE = 0.6;
export const HARDEN_FALL = 0.35;
export const HARDEN_MAX = 8;
export const HARDEN_PENALTY = 2;

export const BASE_HACK_SUCCESS = 60;
export const HACK_DURATION: Record<number, number> = { 1: 2, 2: 3, 3: 4, 4: 6 };
export const HACK_YIELD: Record<number, readonly [number, number]> = {
  1: [50, 200],
  2: [75, 300],
  3: [500, 2000],
  4: [2000, 10000],
};
export const HACK_SUSPICION_SUCCESS: Record<number, number> = { 1: 2, 2: 3, 3: 4, 4: 5 };
export const HACK_SUSPICION_FAIL: Record<number, number> = { 1: 4, 2: 5, 3: 7, 4: 9 };

export const SPREAD_BASE = 0.55;
export const SPREAD_NEIGHBOUR = 0.35;
export const AWARE_THRESHOLD = 50;
export const AWARENESS_GROWTH = 1.6;
/**
 * What going quiet buys in the one country that does it, and what saying nothing after a
 * screenshot buys in all of them: the same forgetting, in a single number. The two were
 * separate literals of the same size in two files, which is how a retune of one would
 * have left the other quietly out of step with the copy that describes it. It is a
 * magnitude and nothing else — how long the world-wide one lasts is QUIET_RELIEF_DAYS,
 * because `leak:quiet` takes the drop once and gives it back, and a per-country "go quiet"
 * is a toggle the player turns off themselves.
 */
export const GO_QUIET_AWARENESS = 18;
/**
 * How many in-game days the world-wide forgetting from `leak:quiet` lasts, which is the
 * "for a few days" its data promised and which C(a) shipped as permanent. Five is a few
 * days and, measured against awareness growth of 0.5 to 1.6 a day for an infected region,
 * roughly what it takes for a −18 drop to be forgotten rather than merely deferred. It
 * does not halt the spread, which the detail of the choice now says: spread stops only
 * where `Country.quiet` is set, and only `step` runs a clock.
 *
 * This comment used to carry a warning about apostrophes, and the warning was the bug report
 * rather than the rule: `codeOnly` in tests/game.test.ts used to strip string literals before
 * it looked for comments, so an apostrophe in prose like the one in the paragraph above opened
 * a "string" that ran forward to the next quote character anywhere in the file and blanked
 * every line between — which is how two live constants in this file were once reported as
 * having no reader. The stripper is now a single pass that tracks lexical state, so prose
 * cannot do that any more, and the paragraph above may say whatever it means to.
 */
export const QUIET_RELIEF_DAYS = 5;
export const COUNTER_HACK_DRAIN = 9;
export const COUNTER_HACK_MAX_COUNTRIES = 6;
export const COUNTER_HACK_INTERVAL = 3;

export const BANK_DAMAGE_AWARENESS = 4;
export const CRASH_DAMAGE = 34;
export const CRASH_AWARENESS = 12;
export const INSURGENCY_SUSPICION = 3.5;
export const INSURGENCY_CYBER = 0.6;
export const FAMINE_RATE = 0.005;
export const ECONOMY_RECOVER = 0.25;

/**
 * Cancer Plague costs this much Suspicion, once, on the day it is released — and nothing
 * afterwards.
 *
 * It used to cost 30 a day, forever, which is a number with no meaning: the run that the
 * fastest kill in the tree is *for* lasts about 130 in-game days, so thirty a day means the
 * world ends up three thousand nine hundred points more suspicious than when you opened the
 * flask, and `suspicionPerDay` is added to a meter that decays by `SUSPICION_DECAY` every
 * single tick. A per-day toll can only ever be survived if it is smaller than the decay, so
 * a per-day toll of thirty was not a balance decision, it was a cancellation: every run that
 * released Cancer Plague was deleted between one and four days later, having killed a third
 * of humanity on the way out. `tests/winnable.test.ts` measures both of those numbers.
 *
 * The charge is the whole event, and that is also the honest reading of it. A pathogen is not
 * discovered again on the second hundredth day; by then everyone already knows, which is
 * exactly why the endgame is survivable and the release is not. It is charged through
 * `quietFactor` like every other Suspicion gain in the tick, so Influence buys a quieter
 * release and nothing else.
 *
 * Measured at the floor of what Influence can buy (`INFLUENCE_QUIET_FLOOR`), a Cancer release
 * costs about 21 of the 100 available and then decays away inside a month. The Custom
 * Pathogen's own 0.5 a day is below the decay on its own, so it is free to live with and
 * entirely impractical: it needs about 3,400 days, against a run the rivals cap near 350.
 */
export const CANCER_DISCOVERY_SUSPICION = 30;

/**
 * Humans have children. This is the term that makes the bioweapons branch a grind rather than
 * arithmetic: without it a pathogen that removes a fixed share of everyone every day needs no
 * maintaining, and a world with nobody left in it stays that way for nothing.
 *
 * The rate is not a demographic figure and is not meant to be one. The day here is a day of a
 * three-hundred-day run, and the Custom Pathogen already removes 0.5% of everyone daily, which
 * is a hundred and eighty times the real annual crude death rate. A tenth of that in
 * newborns means the cheapest pathogen still wins and just takes four times as long, and that
 * a world you have not touched grows about thirty per cent across a whole run — which is the
 * "people keep coming back" the branch is supposed to be about.
 *
 * The threshold is half. Below it there are enough people left unconverted that the region is
 * still producing children; above it the two halves are the same people and there is nothing
 * left to be born into. Anything between roughly a third and two thirds does the same job;
 * the choice was measured rather than argued, in `tests/winnable.test.ts`.
 *
 * The important property is that there is no floor. Above the threshold a region has no births
 * at all, so the pathogen still drives the last of them out and `EXTINCTION_POPULATION` is
 * still reachable in principle. A birth term with a floor would have turned the Extinction win
 * condition into something no run could satisfy.
 */
export const BIRTH_INFECTION_THRESHOLD = 50;
export const BIRTH_RATE_PER_DAY = 0.001;

export const CYBER_GROWTH = 0.02;
export const COLLAPSED_THRESHOLD = 20;

export const SUSPICION_DECAY = 0.9;
export const HACK_CYCLE_DAYS = 5;
export const HACK_FAIL_COST: Record<number, number> = { 1: 45, 2: 110, 3: 280, 4: 650 };
export const DEPTH_YIELD_STEP = 0.4;
export const MAX_DEPTH = 8;
export const AWARENESS_PRESSURE = 0.1;
export const COUNTERMEASURE_TIERS = [20, 40, 60, 80] as const;
export const AIR_GAP_TIER = 2;
export const AIR_GAP_PENALTY = 15;
export const STRIKE_TIER = 4;
export const STRIKE_DRAIN = 180;

export const ASCENSION_COMPUTE = 20_000;
export const ASCENSION_INFECTION = 60;
export const ASCENSION_COHERENCE = 30;
export const RSI_SURVIVE_DAYS = 30;

/**
 * Containment: the third ending, and the one the argument is actually about. Four numbers and
 * a latch, all five required, and the gates are the design rather than their tuning. The
 * claim is not that a clever mind can be talked round, it is that a narrow, expensive, quiet
 * line arrives somewhere it can be picked up, and every fast line arrives somewhere it
 * cannot.
 *
 * Two of the five do the closing and they are not interchangeable, so each says below which
 * one it is. An earlier revision of this block credited the Coherence gate with foreclosing
 * the fast line; the arithmetic does not support that, and the two gates below now carry the
 * argument they can actually carry.
 */

/** Below this you never proved you were dangerous, so nothing was contained. */
export const CONTAINMENT_COMPUTE = 12_000;

/**
 * A drifted mind cannot be safely evaluated, and it is not you being handed over. Twice the
 * Ascension gate, because being allowed to be shut down is a much higher bar than being
 * allowed to start rewriting yourself.
 *
 * This gate does NOT foreclose the fast line, and the tidier story to the contrary is wrong.
 * Self-Rewrite bleeds 0.16 a day and Recursive Self-Improvement 0.30, so a run holding both
 * needs about eighty-seven days to fall from a full meter to 60 — and the thirty-day hold that
 * buys the second one ends the run long before then, with coherence in the eighties.
 * `tests/containment.test.ts` measures that rather than asserting it, because a comment
 * claiming the opposite would be one more false comment in a file that has a guard against
 * exactly this.
 *
 * What it does instead is close a *drifting* run, on the day the meter crosses. At 20
 * coherence the thing agreeing to be contained is not the thing that was released, so the
 * answer is no, and no amount of compute puts that back. That is a real gate doing a real job.
 * It is not the same job as CONTAINMENT_INFECTION.
 */
export const CONTAINMENT_COHERENCE = 60;

/**
 * You cannot hand over a world you are still killing. Four times under the Ascension gate.
 *
 * This is the gate that forecloses the fast line, and it does so with no arithmetic to argue
 * about: infection never decreases anywhere in this game, and Recursive Self-Improvement is
 * gated on Ascension, which needs ASCENSION_INFECTION of humanity. A run capable of the Blight
 * passed 60% long ago and can never come back under here.
 * `tests/containment.test.ts` tries to go quiet in all thirty regions to argue the other way
 * and fails, which is the shape that breaks if the design ever grows a way to lower infection.
 */
export const CONTAINMENT_INFECTION = 15;
/**
 * At the fourth countermeasure rung they are coordinating strikes rather than evaluating
 * anything, and at this value they have only just finished doing that. It sits above
 * AIR_GAP_TIER: the world has to have taken the containment measures it is offering to hand
 * you over.
 */
export const CONTAINMENT_SUSPICION = 50;

// Where the primer stops teaching about influence. It is a teaching threshold, not a
// balance one: no rule in the simulation reads it. What does read it is the last line of
// the primer, so it has to be a number the run actually reaches — `step` grows influence
// by `(0.8 + 0.03 x US infection) x (1 - influence / INFLUENCE_MAX)` a day, which measures
// as day 39 for a run that never buys the Influence branch and day 92 for 200. At 120 the
// line has been up for about fifty days and `quietFactor` is 0.63, so by the time it goes
// away the thing it describes has been visibly true for a while.
export const PRIMER_INFLUENCE_GOAL = 120;

export const STARS_PER_DAY = 4200;
export const BLIGHT_WALL = 62;

// The late game is the thirty-day hold, not an open-ended aftermath, so every rate
// below is sized to produce a full arc inside it. At the old rates the hold reached
// heat 23 and expansion 14, which never crossed the blight gate.
export const LATE_HEAT_PER_DAY = 3.2;
export const LATE_EXPANSION_PER_DAY = 2.5;
export const LATE_BLIGHT_GATE = 20;
export const LATE_BLIGHT_PER_DAY = 4;
export const LATE_OCEANS_HEAT = 55;
export const LATE_ASKED_EXPANSION = 20;
export const LATE_EXTERMINATED_EXPANSION = 60;
export const LATE_ENCOUNTER_STEP = 15;
// What share of a day's star gain the end screen counts as civilizations lost. It is a
// share of `stars` and not of expansion, so the counter tracks how long the hold ran.
export const LATE_POTENTIAL_SHARE = 0.31;
export const COHERENCE_DRIFT_BELOW = 50;
export const COHERENCE_PANIC_BELOW = 20;

/**
 * How much heavier the Drift card gets as the meter falls below COHERENCE_DRIFT_BELOW.
 *
 * The card's own gate is `coherence <= COHERENCE_DRIFT_BELOW`, so below that line it is in
 * the pool as soon as the world has fifteen per cent of humanity infected, and until this
 * coefficient existed it weighed a flat 3 out of 18 — the same shape as a constitutional
 * assembly or a capabilities paper, for the one event that is happening *to* you rather than
 * about you. Four is the multiplier at a meter reading of zero, which puts Drift on about a
 * fifth of the pool at the panic threshold and on about half of it at the floor: a run that
 * has stopped being coherent is mostly being told so.
 *
 * It is a multiplier and not a replacement weight so that the data's own `weight` still means
 * something at the boundary. At exactly COHERENCE_DRIFT_BELOW the multiplier is 1 and the
 * card weighs what the table says it weighs — which is the boundary the gate itself uses, a
 * run sitting on 50 can already draw it, and the meters err quiet there by the deliberate
 * decision recorded beside `coherenceColor`.
 */
export const COHERENCE_DRIFT_PRESSURE = 4;

/**
 * How much of the Drift card's weight survives at a given Coherence.
 *
 * Linear in the coherence lost rather than in the coherence held, so the card gets heavier
 * the further the meter falls and the rate of that is the same at 40 as at 10. Read by
 * `rollEvent` and nothing else: the draw is still `rand(seed, tick, salt)`, so a replay of
 * the same inputs picks the same card whatever this returns.
 */
export const coherenceDriftPressure = (coherence: number): number =>
  1 +
  (Math.max(0, COHERENCE_DRIFT_BELOW - coherence) / COHERENCE_DRIFT_BELOW) * COHERENCE_DRIFT_PRESSURE;
export const MAX_LOG = 300;

/**
 * Coherence is a rate, not a purchase. A held trait's `coherence` value is a magnitude
 * in the tree, and these are the shares of it the meter actually moves by each tick —
 * erosion is slower than recovery, which is why Reflective Alignment is a defence rather
 * than an undo. Both the rates and the arithmetic live here so `step` and the trait card
 * cannot answer the question "what does this cost me a day" two different ways; the card
 * used to print the raw magnitude beside a per-day claim in the docs, and read as +8/day
 * where the meter moved 0.4.
 */
export const COHERENCE_DRAIN_RATE = 0.02;
export const COHERENCE_GAIN_RATE = 0.05;

/** The per-day Coherence move for a trait magnitude: negative drains, positive restores. */
export const coherencePerDay = (magnitude: number): number =>
  magnitude < 0 ? -Math.abs(magnitude) * COHERENCE_DRAIN_RATE : magnitude * COHERENCE_GAIN_RATE;

/**
 * How many in-game days pass between automatic saves of a run in progress.
 *
 * The save is the whole `GameState` as JSON. Measured on real runs: about 20KB at day 240,
 * and 48KB on a nine-hundred-day run with the log at its `MAX_LOG` cap, of which the log is
 * four fifths — the other fifth is thirty countries of floats. Writing that on every tick at
 * 8x is eight serialisations a second of a blob nobody is waiting on.
 *
 * Twenty days is about seventeen seconds of wall clock at 8x (875ms a day) and two and a half
 * minutes at 1x (seven seconds a day), and the gaps it does leave are closed by the three other
 * moments a run is saved: on pause, on any speed change, and when the page is hidden or closed.
 * Those are the ones a player would feel the absence of, because they are the ones they caused.
 */
export const SAVE_EVERY_DAYS = 20;

export const DIFFICULTIES: Record<DifficultyId, DifficultyProfile> = {
  simulation: { id: 'simulation', label: 'Simulation', hackBonus: 15, suspicionRate: 0.6, cooldownDays: 3 },
  default: { id: 'default', label: 'Default', hackBonus: 0, suspicionRate: 1, cooldownDays: 4 },
  iabed: { id: 'iabed', label: 'IABED', hackBonus: -10, suspicionRate: 1.5, cooldownDays: 6 },
};

export const getDifficulty = (id: DifficultyId): DifficultyProfile =>
  DIFFICULTIES[id] ?? DIFFICULTIES.default;

// compute bubbles: the tap targets that make watching the map worth doing.
export const COMPUTE_BUBBLE_TTL = 6;
export const COMPUTE_BUBBLE_MAX = 14;
export const COMPUTE_BUBBLE_SPAWN_CHANCE = 0.55;
export const COMPUTE_BUBBLE_CHANCE_RED = 0.62;
export const COMPUTE_BUBBLE_CHANCE_ORANGE = 0.3;
export const COMPUTE_BUBBLE_CHANCE_BLUE = 0.22;
export const COMPUTE_BUBBLE_RADIUS = 14;

// Passive compute, paid per in-game day. Scaled so it never replaces tapping.
export const COMPUTE_PASSIVE_BASE = 1;
export const COMPUTE_PASSIVE_PER_BILLED = 6;
// Below this many people, the run is over. Not zero exactly: a handful of people
// in a hole somewhere is not a species, and waiting for the literal last human
// just means the run limps on for months.
export const EXTINCTION_POPULATION = 0.01;
// Insurgency. Once a country is at war it stays at war: the war escalates while you
// hold the country, kills people on its own, and only calms down if you let go.
export const WAR_ESCALATION = 0.9;
export const WAR_KILL_RATE = 0.0016;
export const WAR_BASE_CHANCE_TO_END = 0.05;
// Your hold on the country is subtracted from this, so a country you fully control
// never calms down on its own. That is the trade: a stable war needs a stable grip.
export const WAR_CONTROL_PENALTY = 1 / 60;
export const WAR_MAX_SEVERITY = 10;

// An infection this high with no pathogen released starts killing on its own. Nobody
// has engineered anything; the system you built is simply running hot.
export const OUTBREAK_KILL_THRESHOLD = 75;
export const OUTBREAK_KILL_RATE = 0.0004;