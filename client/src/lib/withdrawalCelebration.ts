// =============================================================================
// withdrawalCelebration.ts — tracks which completed-withdrawal transaction
// ids have already shown the "Withdrawal Paid" confetti celebration, so it
// only ever fires once per payout (not on every page load/refresh/poll).
// =============================================================================

const SEEN_KEY = "hotbet_celebrated_withdrawal_ids";

function loadSeenIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? new Set<string>(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveSeenIds(ids: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(ids)));
  } catch { /* ignore — localStorage may be full/unavailable */ }
}

/** Statuses that mean a withdrawal has actually been paid out. */
export const WITHDRAWAL_COMPLETED_STATUSES = new Set(["APPROVED", "SETTLED", "PAID", "COMPLETED"]);

/** Transaction kinds that represent a withdrawal reaching the user. */
export const WITHDRAWAL_COMPLETED_KINDS = new Set(["WITHDRAW", "WITHDRAW_RELEASE"]);

export function isCompletedWithdrawal(tx: { kind: string; status?: string }): boolean {
  if (!WITHDRAWAL_COMPLETED_KINDS.has(tx.kind)) return false;
  const status = (tx.status ?? "").trim().toUpperCase();
  return WITHDRAWAL_COMPLETED_STATUSES.has(status);
}

/** True if this completed-withdrawal transaction id hasn't been celebrated yet. */
export function isUncelebratedWithdrawal(txId: string): boolean {
  return !loadSeenIds().has(txId);
}

/** Marks a withdrawal transaction id as celebrated so it never triggers the popup again. */
export function markWithdrawalCelebrated(txId: string): void {
  const seen = loadSeenIds();
  if (seen.has(txId)) return;
  seen.add(txId);
  saveSeenIds(seen);
}
