// =============================================================================
// withdrawalGate.ts — HotBet withdrawal gate state manager
//
// All progress is stored permanently in localStorage per user account so it
// survives page refreshes, tab closes, and app restarts.
//
// GATE STAGES (in order — each must be completed before the next is shown):
//   0  blocked   — user has never won a settled bet; gate is entirely hidden
//   1  fee       — user won; first thing shown is the activation fee prompt
//   2  kyc       — fee paid; user must upload their ID for KYC
//   3  deposits  — KYC verified; must make 3× qualifying deposits
//   4  unlocked  — all done; withdrawal form is available
//
// Country rules:
//   Ghana   — fee GHS 2,000  | deposit GHS 550 × 3  | min withdrawal GHS 350
//   Nigeria — fee NGN 244,000 | deposit NGN 67,100 × 3 | min withdrawal NGN 44,000
// =============================================================================

export type GateStage = "blocked" | "fee" | "kyc" | "deposits" | "unlocked";

export interface CountryConfig {
  currency: string;
  currencyCode: string;
  activationFee: number;
  depositAmount: number;   // each of the 3 qualifying deposits must be ≥ this
  depositCount: number;    // always 3
  minDeposit: number;      // minimum first deposit to open account
  minStake: number;
  minWithdrawal: number;
}

export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  GH: {
    currency: "GHS",
    currencyCode: "GHS",
    activationFee: 2000,
    depositAmount: 550,
    depositCount: 3,
    minDeposit: 1,
    minStake: 1,
    minWithdrawal: 350,
  },
  NG: {
    currency: "NGN",
    currencyCode: "NGN",
    activationFee: 244000,
    depositAmount: 67100,
    depositCount: 3,
    minDeposit: 44000,
    minStake: 13000,
    minWithdrawal: 44000,
  },
};

export const DEFAULT_CONFIG = COUNTRY_CONFIGS.GH;

export interface GateState {
  /** Country code: "GH" | "NG" */
  country: string;
  /** Current gate stage */
  stage: GateStage;
  /** Has the user won at least one settled bet? */
  hasWon: boolean;
  /** Has the activation fee been paid? */
  feePaid: boolean;
  /** KYC: has the user submitted their ID upload? */
  kycSubmitted: boolean;
  /** KYC: has the platform verified/approved the ID? */
  kycVerified: boolean;
  /** Number of qualifying deposits completed (0–3) */
  depositsCompleted: number;
  /** ISO timestamps of each qualifying deposit */
  depositTimestamps: string[];
  /** ISO timestamp when gate was last updated */
  updatedAt: string;
}

const STORAGE_KEY_PREFIX = "wb_gate_";

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function now(): string {
  return new Date().toISOString();
}

function defaultState(country: string): GateState {
  return {
    country,
    stage: "blocked",
    hasWon: false,
    feePaid: false,
    kycSubmitted: false,
    kycVerified: false,
    depositsCompleted: 0,
    depositTimestamps: [],
    updatedAt: now(),
  };
}

/** Read persisted gate state for a user. Returns a default if nothing stored. */
export function readGateState(userId: string, country = "GH"): GateState {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return defaultState(country);
    const parsed = JSON.parse(raw) as Partial<GateState>;
    // Merge with defaults so new fields added later don't break old saves
    return {
      ...defaultState(parsed.country ?? country),
      ...parsed,
    };
  } catch {
    return defaultState(country);
  }
}

/** Write gate state to localStorage. */
function writeGateState(userId: string, state: GateState): GateState {
  const next: GateState = { ...state, updatedAt: now() };
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // localStorage may be full in some environments — fail silently
  }
  return next;
}

/** Compute the correct stage from the raw fields. */
export function deriveStage(state: GateState): GateStage {
  if (!state.hasWon) return "blocked";
  if (!state.feePaid) return "fee";
  if (!state.kycVerified) return "kyc";
  const cfg = COUNTRY_CONFIGS[state.country] ?? DEFAULT_CONFIG;
  if (state.depositsCompleted < cfg.depositCount) return "deposits";
  return "unlocked";
}

/** Sync the stage field and persist. Always call this after mutating state. */
function syncAndSave(userId: string, state: GateState): GateState {
  const next = { ...state, stage: deriveStage(state) };
  return writeGateState(userId, next);
}

// ---------------------------------------------------------------------------
// Public mutation helpers
// ---------------------------------------------------------------------------

/**
 * Called when a bet settles as WON. Advances the gate from "blocked" → "fee".
 * Safe to call multiple times.
 */
export function markBetWon(userId: string, country = "GH"): GateState {
  const state = readGateState(userId, country);
  if (state.hasWon) return state; // already triggered
  return syncAndSave(userId, { ...state, hasWon: true, country });
}

/**
 * Called when the user pays the activation fee.
 * Advances the gate from "fee" → "kyc".
 */
export function markFeePaid(userId: string): GateState {
  const state = readGateState(userId);
  return syncAndSave(userId, { ...state, feePaid: true });
}

/**
 * Called when the user submits their KYC ID upload.
 * Does NOT advance the stage yet — kycVerified must be set separately.
 */
export function markKycSubmitted(userId: string): GateState {
  const state = readGateState(userId);
  return syncAndSave(userId, { ...state, kycSubmitted: true });
}

/**
 * Called when KYC is approved (can be triggered by admin or by polling the API).
 * Advances the gate from "kyc" → "deposits".
 */
export function markKycVerified(userId: string): GateState {
  const state = readGateState(userId);
  return syncAndSave(userId, { ...state, kycVerified: true });
}

/**
 * Called each time a qualifying deposit lands.
 * Advances depositsCompleted by 1 (capped at depositCount).
 * When all 3 are done, advances the gate to "unlocked".
 */
export function recordQualifyingDeposit(userId: string, timestamp?: string): GateState {
  const state = readGateState(userId);
  const cfg = COUNTRY_CONFIGS[state.country] ?? DEFAULT_CONFIG;
  if (state.depositsCompleted >= cfg.depositCount) return state; // already at cap
  const next: GateState = {
    ...state,
    depositsCompleted: state.depositsCompleted + 1,
    depositTimestamps: [...state.depositTimestamps, timestamp ?? now()],
  };
  return syncAndSave(userId, next);
}

/**
 * Hard-reset the gate for a user (useful for testing / admin override).
 */
export function resetGate(userId: string, country = "GH"): GateState {
  const fresh = defaultState(country);
  return writeGateState(userId, { ...fresh, stage: "blocked" });
}

/**
 * Get the CountryConfig for a gate state.
 */
export function configFor(state: GateState): CountryConfig {
  return COUNTRY_CONFIGS[state.country] ?? DEFAULT_CONFIG;
}

/**
 * Human-readable currency formatter.
 */
export function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
