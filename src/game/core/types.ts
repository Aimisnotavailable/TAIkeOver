export type Speed = 0 | 1 | 2 | 4 | 8;

export type Stage = 'coldopen' | 'world' | 'late' | 'coda';

/** Which instruction the primer is currently on. `done` renders nothing. */
export type PrimerStep = 'select' | 'hack-protocols' | 'tap-bubble' | 'breach' | 'influence' | 'done';

export type Outcome = 'playing' | 'won' | 'lost';

export type DifficultyId = 'simulation' | 'default' | 'iabed';

export interface DifficultyProfile {
  id: DifficultyId;
  label: string;
  hackBonus: number;
  suspicionRate: number;
  cooldownDays: number;
}

export type { RegionId } from '../data/regions';
import type { RegionId } from '../data/regions';

export type TraitGroup = 'hacking' | 'bioweapons' | 'influence' | 'economy' | 'selfmod';

export type TraitId = string;

export type TraitEffect =
  | { kind: 'hack'; tier: number }
  | { kind: 'hack-success'; amount: number }
  | { kind: 'hack-yield'; multiplier: number }
  | { kind: 'half-fail-suspicion' }
  | { kind: 'gain-of-function' }
  | { kind: 'pathogen'; kills: number; suspicion: number }
  | { kind: 'sterility' }
  | { kind: 'cancer-plague' }
  | { kind: 'propaganda'; influence: number; suspicion: number }
  | { kind: 'cult'; agents: number }
  | { kind: 'terrorism' }
  | { kind: 'banking'; tier: number; damage: number }
  | { kind: 'market-manipulation' }
  | { kind: 'famine' }
  | { kind: 'coherence'; amount: number }
  | { kind: 'rsi' };

export interface HackProgress {
  key: number;
  country: RegionId;
  startTick: number;
  resolveTick: number;
  duration: number;
  tier: number;
  auto: boolean;
  depth: number;
  wins: number;
  losses: number;
}

export interface SuspicionSource {
  label: string;
  value: number;
}

export interface IncubatingTrait {
  trait: TraitId;
  startTick: number;
  readyTick: number;
}

export interface Country {
  id: RegionId;
  infection: number;
  awareness: number;
  cyber: number;
  tier: number;
  economy: number;
  population: number;
  detection: number;
  agents: number;
  biolabs: number;
  converted: number;
  quiet: boolean;
atWar: boolean;
  warSeverity: number;
  hardened: number;
  /**
   * The awareness this country had when the last world-wide forgetting was taken, and null
   * otherwise. `step` gives the awareness back and clears this on the last day of
   * `GameState.quietReliefDays`, or on the next tick if the countdown is already spent, so
   * a baseline left behind by a hand-built state is cleaned up rather than held forever.
   */
  quietBaseline: number | null;
}

export interface RivalState {
  id: string;
  name: string;
  capability: number;
  alive: boolean;
  sabotage: number;
  home: RegionId;
}

export interface CountermeasureState {
  tier: number;
  airGappedLab: RegionId | null;
  labSabotaged: boolean;
  strikeDays: number;
}

export interface PathogenState {
  released: boolean;
  killsPerDay: number;
  suspicionPerDay: number;
  sterility: boolean;
  targeted: boolean;
  cancer: boolean;
}

export type EventChoiceId = string;

export interface EventChoice {
  id: EventChoiceId;
  label: string;
  detail: string;
}

export interface EventCard {
  key: number;
  event: string;
  title: string;
  body: string;
  country: RegionId | null;
  choices: readonly EventChoice[];
  urgent: boolean;
}

export type ComputeBubbleKind = 'red' | 'orange' | 'blue';

export interface ComputeBubble {
  id: number;
  region: RegionId;
  kind: ComputeBubbleKind;
  value: number;
  bornTick: number;
  expiresTick: number;
  phase: number;
}

export interface LateState {
  heat: number;
  oceansBoiled: boolean;
  askedHumanity: boolean;
  exterminated: boolean;
  stars: number;
  expansion: number;
  blight: number;
  encounters: number;
  potentialLost: number;
  ending: string | null;
}

export interface LogEntry {
  day: number;
  kind: 'hack' | 'spread' | 'economy' | 'event' | 'trait' | 'system' | 'bio' | 'rival';
  text: string;
  suspicionDelta: number | null;
  computeDelta: number | null;
  flagged: boolean;
}

export interface GameState {
  seed: number;
  tick: number;
  difficulty: DifficultyId;
  stage: Stage;
  outcome: Outcome;
  outcomeReason: string | null;
  compute: number;
  influence: number;
  bio: number;
  suspicion: number;
  coherence: number;
  countries: Record<RegionId, Country>;
  rivals: RivalState[];
  traits: TraitId[];
  incubating: IncubatingTrait[];
  activeHacks: HackProgress[];
  cards: EventCard[];
  resolved: EventChoiceId[];
  countermeasures: CountermeasureState;
  pathogen: PathogenState;
  log: LogEntry[];
  ascensionUnlocked: boolean;
  surviveTicks: number;
  late: LateState;
  hackCounter: number;
  eventCounter: number;
  globalInfection: number;
  humanPopulation: number;
  cumulativeDeaths: number;
  economiesCollapsed: number;
  computeBubbles: ComputeBubble[];
  bubbleCounter: number;
suspicionSources: SuspicionSource[];
  suspicionTrend: number;
  // The primer, core/primer.ts. `primer` is a floor rather than the answer: only the
  // "has selected" milestone has no other record in this state, so it is the only one
  // worth storing. The two counters are for the milestones nothing else witnesses.
  primer: PrimerStep;
  primerBubblesTapped: number;
  primerBreachesOpened: number;
  /**
   * Whether humanity wrote down a way to appeal on your behalf and you let them. Set by
   * `constitution:appeal` and read by the Containment ending, which cannot otherwise be
   * reached: there is nothing to appeal to if they never built one. Costs compute and
   * coherence at the time, like every other card choice.
   */
  constitutionalAppeal: boolean;
  /**
   * Days left of the world-wide awareness drop `leak:quiet` takes. Spent one per tick by
   * `step`, which gives the awareness back as it reaches zero. Zero on every other branch
   * of the game and on a clean run.
   */
  quietReliefDays: number;
  /**
   * Which once-per-run announcements have already fired, as a list because this is a saved
   * object. §8.1 promises each of them happens once per run, and a module-level `Set` in the
   * UI store did not keep that across a restore: `announce` runs on mount, so a resumed run
   * re-announced every outbreak, every collapse and every country gone quiet for the whole of
   * the run behind it — four toasts deep, in the wrong order, about days the player has
   * already seen.
   *
   * It lives in the state rather than beside it because the state is what is written to
   * storage, and a ledger that is not written down is a ledger that forgets. `step` carries
   * it untouched, so it costs the simulation nothing, and `createInitialState` is where
   * `save.ts` reads the required shape from, so it is required in a save for free.
   */
  announced: string[];
}
