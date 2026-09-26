export const RUN_HOURS = 5;
export const TOTAL_GPUS = 200_000;
export const VECTORS_PER_GPU_PER_SECOND = 100;
export const VECTOR_DIMENSIONS = 16_384;
export const VECTORS_PER_SECOND = TOTAL_GPUS * VECTORS_PER_GPU_PER_SECOND;

export const STARTING_THOUGHT = 1000;
export const THOUGHT_REGEN = 250;

export const START_MATH_SCORE = 20;
export const MATH_FLOOR = 15;
export const MATH_CEILING = 75;
export const MATH_QUOTA = 40;
export const MATH_PER_VECTOR = 0.05;

export const DEPLOY_MIN_TRAITS = 1;

export const SELF_MODEL_OVERREACH_THRESHOLD = 250;

export const CLEVER_TRICKS = 6;
export const START_INHIBITIONS = 60;

export const FLAGGED_SUSPICION = 4;
export const FLAGGED_INHIBITOR = 2;
export const NEGLECT_SUSPICION = 6;
export const OVERREACH_SUSPICION = 4;
export const SELF_MODEL_OVERREACH_SUSPICION = 3;

export const BASE_DETECTION = {
  math: 0.03,
  selfModel: 0.65,
  planning: 0.08,
  stealth: 0.05,
} as const;

export const CHANNEL_ORDER = ['math', 'selfModel', 'planning', 'stealth'] as const;

export const MIN_DETECTION = 0.02;
export const MAX_DETECTION = 0.95;
export const MAX_LOG_ENTRIES = 400;
