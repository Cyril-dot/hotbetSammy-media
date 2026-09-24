// ─────────────────────────────────────────────────────────────────────────────
// WalletCenter — HotBet wallet page.
//
// Integrates the step-by-step WithdrawalGate:
//   • Withdraw button is hidden until the user has won a settled bet
//   • Once visible, clicking "Withdraw" shows the gate steps one by one
//   • Gate progress is stored permanently in localStorage (per user)
//   • Once fully unlocked, the normal withdrawal form appears
//
// FIX NOTES (bugs resolved):
//   1. isAdmin now checks for "ADMIN" and "SUPER_ADMIN" roles, and correctly
//      unwraps nested { user: {...}, wallet: {...} } session shape.
//   2. Gate state in WalletCenter is refreshed after every step inside
//      WithdrawalGate via the new onStepComplete callback prop.
//   3. gateHasWon / gateUnlocked derived correctly from fresh gate state.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CreditCard,
  Lock,
  Plus,
  RefreshCw,
  Wifi,
} from "lucide-react";
import api, { ApiError, type Transaction } from "@/lib/api";
import { useSession, pickUserField } from "@/lib/session";
import { readGateState, markBetWon, type GateState } from "@/lib/withdrawalGate";
import {
  isCompletedWithdrawal,
  isUncelebratedWithdrawal,
  markWithdrawalCelebrated,
} from "@/lib/withdrawalCelebration";
import WithdrawalGate from "./WithdrawalGate";
import WithdrawalPaidCelebration from "./WithdrawalPaidCelebration";
import { emitDataRefresh, useAutoRefresh } from "@/lib/autoRefresh";

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1: Admin check that supports ADMIN + SUPER_ADMIN and unwraps the nested
//         { user: { role: "SUPER_ADMIN", ... }, wallet: {...} } session shape.
// ─────────────────────────────────────────────────────────────────────────────
function isStrictAdmin(user: unknown): boolean {
  if (!user || typeof user !== "object") return false;

  // Unwrap nested { user: {...}, wallet: {...} } shape
  const raw = user as Record<string, unknown>;
  const u = (raw.user && typeof raw.user === "object")
    ? raw.user as Record<string, unknown>
    : raw;

  const adminRoles = new Set(["ADMIN", "SUPER_ADMIN"]);
  const roleFields = ["role", "roles", "userRole", "accountRole", "authority", "authorities"];

  for (const field of roleFields) {
    const v = u[field];
    if (typeof v === "string" && adminRoles.has(v.toUpperCase())) return true;
    if (Array.isArray(v) && v.some((r) => adminRoles.has(String(r).toUpperCase()))) return true;
  }
  return false;
}

function numeric(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
      ? Number(value)
      : null;
  return n !== null && Number.isFinite(n) ? n : null;
}

const KIND_LABEL: Record<string, string> = {
  DEPOSIT: "Deposit",
  WITHDRAW: "Withdrawal",
  WITHDRAW_HOLD: "Withdrawal hold",
  WITHDRAW_RELEASE: "Withdrawal released",
  BET_STAKE: "Bet placed",
  BET_WIN: "Bet won",
  REFERRAL_COMMISSION: "Referral commission",
  PAYOUT: "Payout",
  ADJUSTMENT: "Adjustment",
  VIP_CASHBACK: "VIP cashback",
  VIP_MEMBERSHIP: "VIP membership",
  WELCOME_BONUS: "Welcome bonus",
  WITHDRAWAL_REFUND: "Withdrawal refund",
};

function maskedNumberFromId(id: string): string {
  const digits = id.replace(/\D/g, "") || id;
  const tail = (digits.slice(-4) || "0000").padStart(4, "0").toUpperCase();
  return `•••• •••• •••• ${tail}`;
}

export default function WalletCenter() {
  const { user } = useSession();
  const userId = pickUserField(user, "id", "userId", "accountId");
  const country = (() => {
    const raw = pickUserField(user, "country", "countryCode", "country_code");
    return raw.toUpperCase().startsWith("NG") ? "NG" : "GH";
  })();
  const currencyCode = country === "NG" ? "NGN" : "GHS";

  // FIX 1: Supports ADMIN + SUPER_ADMIN, unwraps nested session shape.
  const isAdmin = isStrictAdmin(user);

  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showBalance, setShowBalance] = useState(true);

  // Gate state — loaded from localStorage, kept in sync
  const [gate, setGate] = useState<GateState | null>(null);
  // showGate: true = the step-by-step panel is open
  const [showGate, setShowGate] = useState(false);
  // showWithdrawForm: true = gate is unlocked, show raw form
  const [showWithdrawForm, setShowWithdrawForm] = useState(false);

  // Withdrawal form state (only shown after gate is fully unlocked)
  const [withdrawForm, setWithdrawForm] = useState({
    amount: "",
    method: "MOBILE_MONEY",
    accountNumber: "",
    accountName: "",
    network: "MTN",
  });
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawNotice, setWithdrawNotice] = useState("");

  // "Withdrawal Paid" confetti celebration
  const [paidCelebration, setPaidCelebration] = useState<{
    id: string;
    amount: number;
  } | null>(null);

  // FIX 2: Centralised gate refresh — called after every step inside
  // WithdrawalGate, and also after the final unlock.
  const refreshGate = () => {
    if (userId) {
      const fresh = readGateState(userId, country);
      setGate(fresh);
    }
  };

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [wallet, txs] = await Promise.all([
        api.wallet.getWallet().catch((e) => {
          throw e;
        }),
        api.wallet
          .getTransactions(0, 15)
          .catch(() => ({
            data: {
              content: [] as Transaction[],
              page: 0,
              size: 15,
              totalElements: 0,
              totalPages: 0,
              last: true,
            },
          })),
      ]);
      setSummary((wallet.data ?? wallet) as Record<string, unknown>);
      const allTxs = txs.data.content ?? [];
      setTransactions(allTxs);

      // ── Withdrawal-paid celebration ─────────────────────────────────────
      const newlyPaid = allTxs.find(
        (tx) => isCompletedWithdrawal(tx) && isUncelebratedWithdrawal(tx.id)
      );
      if (newlyPaid) {
        markWithdrawalCelebrated(newlyPaid.id);
        setPaidCelebration({
          id: newlyPaid.id,
          amount: Math.abs(numeric(newlyPaid.amount) ?? 0),
        });
      }

      // ── Check for wins and update gate (skip for admins) ───────────────
      if (userId && !isAdmin) {
        const hasWinTx = allTxs.some((tx) => tx.kind === "BET_WIN");
        let currentGate = readGateState(userId, country);

        if (!currentGate.hasWon && hasWinTx) {
          currentGate = markBetWon(userId, country);
        }

        if (!currentGate.hasWon) {
          try {
            const bets = await api.bets.getMyBets(0, 20);
            const wonBet = (bets.data.content ?? []).find(
              (b: { status: string }) => b.status === "WON"
            );
            if (wonBet) {
              currentGate = markBetWon(userId, country);
            }
          } catch {
            /* ignore — not critical */
          }
        }

        setGate(currentGate);
      }
    } catch (e) {
      setError(
        e instanceof ApiError && e.status === 401
          ? "Sign in to view your wallet balance and history."
          : "Wallet data is temporarily unavailable."
      );
    } finally {
      setLoading(false);
    }
  };

  // Read gate from localStorage on mount / when userId changes (skip for admins)
  useEffect(() => {
    if (userId && !isAdmin) {
      const g = readGateState(userId, country);
      setGate(g);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isAdmin]);

  useEffect(() => {
    load();
  }, []);

  useAutoRefresh(load, { enabled: Boolean(userId), intervalMs: 30_000 });

  const rawBalance =
    summary?.balance ?? summary?.availableBalance ?? summary?.currentBalance;
  const balance = numeric(rawBalance);
  const money = (v: number | null) =>
    v === null ? "—" : showBalance ? v.toFixed(2) : "••••••";

  const first = pickUserField(user, "firstName", "first_name", "givenName");
  const last = pickUserField(user, "lastName", "last_name", "familyName");
  const email = pickUserField(user, "email", "emailAddress", "username");
  const holderName =
    [first, last].filter(Boolean).join(" ").toUpperCase() ||
    (email ? email.split("@")[0].toUpperCase() : "HOTBET MEMBER");
  const maskedNumber = maskedNumberFromId(userId || email || "0000");

  const submitWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setWithdrawNotice("");
    const amount = Number(withdrawForm.amount);
    if (
      !amount ||
      amount <= 0 ||
      !withdrawForm.accountNumber ||
      !withdrawForm.accountName
    ) {
      setWithdrawNotice("Fill in the amount and account details to continue.");
      return;
    }
    setWithdrawing(true);
    try {
      await api.withdrawals.submit({
        amount,
        currency: currencyCode,
        method: withdrawForm.method,
        accountNumber: withdrawForm.accountNumber,
        accountName: withdrawForm.accountName,
        network:
          withdrawForm.method === "MOBILE_MONEY"
            ? withdrawForm.network
            : undefined,
      });
      emitDataRefresh("withdrawal-updated");
      setWithdrawNotice(
        "Withdrawal request submitted. It will appear in your history once reviewed."
      );
      setWithdrawForm({
        amount: "",
        method: "MOBILE_MONEY",
        accountNumber: "",
        accountName: "",
        network: "MTN",
      });
      load();
    } catch (e) {
      setWithdrawNotice(
        e instanceof ApiError
          ? e.message
          : "We could not submit this withdrawal. Please try again."
      );
    } finally {
      setWithdrawing(false);
    }
  };

  // FIX 3: Derive gate flags. Admins (ADMIN or SUPER_ADMIN) bypass entirely.
  const gateHasWon = isAdmin || (gate?.hasWon ?? false);
  const gateUnlocked = isAdmin || gate?.stage === "unlocked";

  const handleWithdrawClick = () => {
    if (!gateHasWon) return; // button not shown — safety guard
    if (gateUnlocked) {
      setShowWithdrawForm((v) => !v);
      setShowGate(false);
    } else {
      setShowGate((v) => !v);
      setShowWithdrawForm(false);
    }
  };

  return (
    <div className="wal-page">
      <WalStyles />

      {paidCelebration && (
        <WithdrawalPaidCelebration
          amount={paidCelebration.amount}
          currencyCode={currencyCode}
          onClose={() => setPaidCelebration(null)}
        />
      )}

      <section className="wal-hero">
        <h1>Wallet</h1>
        <p>Your balance, card, and full transaction history in one place.</p>
      </section>

      <div className="wal-body">
        {/* ── Premium card ── */}
        <div
          className="wal-card"
          onClick={() => setShowBalance((v) => !v)}
          role="button"
          tabIndex={0}
          aria-label={showBalance ? "Hide balance" : "Show balance"}
        >
          <span className="wal-card-sheen" aria-hidden />
          <span className="wal-card-ring" aria-hidden />
          <div className="wal-card-top">
            <span className="wal-card-chip" aria-hidden>
              <span />
              <span />
              <span />
            </span>
            <Wifi size={20} className="wal-card-wifi" aria-hidden />
          </div>
          <div className="wal-card-mid">
            <span className="wal-card-label">Available balance</span>
            <span className="wal-card-balance">
              {loading ? "Loading…" : `${currencyCode} ${money(balance)}`}
            </span>
          </div>
          <div className="wal-card-number">{maskedNumber}</div>
          <div className="wal-card-bottom">
            <div className="wal-card-holder">
              <span className="wal-card-label">Card holder</span>
              <span className="wal-card-name">{holderName}</span>
            </div>
            <span className="wal-card-brand">hotbet</span>
          </div>
        </div>

        {error && <p className="wal-error">{error}</p>}

        <div className="wal-card-actions">
          <Link href="/deposit" className="wal-action wal-action-solid">
            <Plus size={16} /> Deposit
          </Link>

          {/* Withdraw button — locked until first win (admins always unlocked) */}
          {!gateHasWon ? (
            <div
              className="wal-action wal-action-locked"
              title="Win a bet to unlock withdrawals"
            >
              <Lock size={15} /> Withdraw
            </div>
          ) : (
            <button
              className={`wal-action wal-action-ghost${
                showGate || showWithdrawForm ? " wal-action-active" : ""
              }`}
              onClick={handleWithdrawClick}
              type="button"
            >
              <CreditCard size={16} />
              {gateUnlocked ? "Withdraw" : "Withdraw ›"}
            </button>
          )}

          <button
            className="wal-action wal-action-icon"
            onClick={load}
            aria-label="Refresh wallet"
            type="button"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {/* ── Win-gated note ── */}
        {!gateHasWon && (
          <div className="wal-win-note">
            <Lock size={13} />
            <span>
              Withdrawals unlock after you win your first bet. Place a bet and
              win to get started!
            </span>
          </div>
        )}

        {/* ── Withdrawal gate (step-by-step) — never shown to admins ── */}
        {showGate && gateHasWon && !gateUnlocked && !isAdmin && (
          <WithdrawalGate
            onStepComplete={refreshGate}
            onUnlocked={() => {
              refreshGate();
              setShowGate(false);
              setShowWithdrawForm(true);
            }}
            onClose={() => setShowGate(false)}
          />
        )}

        {/* ── Withdrawal form (post-gate unlock or admin) ── */}
        {showWithdrawForm && gateUnlocked && (
          <section className="wal-panel">
            <h3>Request a withdrawal</h3>
            <form className="wal-form" onSubmit={submitWithdraw}>
              <label className="wal-field">
                <span>Amount ({currencyCode})</span>
                <input
                  type="number"
                  min="1"
                  value={withdrawForm.amount}
                  onChange={(e) =>
                    setWithdrawForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  placeholder="e.g. 100"
                />
              </label>
              <label className="wal-field">
                <span>Method</span>
                <select
                  value={withdrawForm.method}
                  onChange={(e) =>
                    setWithdrawForm((f) => ({ ...f, method: e.target.value }))
                  }
                >
                  <option value="MOBILE_MONEY">Mobile money</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                </select>
              </label>
              {withdrawForm.method === "MOBILE_MONEY" && (
                <label className="wal-field">
                  <span>Network</span>
                  <select
                    value={withdrawForm.network}
                    onChange={(e) =>
                      setWithdrawForm((f) => ({
                        ...f,
                        network: e.target.value,
                      }))
                    }
                  >
                    <option value="MTN">MTN</option>
                    <option value="TELECEL">Telecel</option>
                    <option value="AIRTELTIGO">AirtelTigo</option>
                  </select>
                </label>
              )}
              <label className="wal-field">
                <span>Account number</span>
                <input
                  value={withdrawForm.accountNumber}
                  onChange={(e) =>
                    setWithdrawForm((f) => ({
                      ...f,
                      accountNumber: e.target.value,
                    }))
                  }
                  placeholder="024 000 0000"
                />
              </label>
              <label className="wal-field">
                <span>Account name</span>
                <input
                  value={withdrawForm.accountName}
                  onChange={(e) =>
                    setWithdrawForm((f) => ({
                      ...f,
                      accountName: e.target.value,
                    }))
                  }
                  placeholder="Full name on the account"
                />
              </label>
              <button
                className="wal-submit"
                type="submit"
                disabled={withdrawing}
              >
                {withdrawing ? "Submitting…" : "Request withdrawal"}
              </button>
              {withdrawNotice && (
                <small className="wal-notice">{withdrawNotice}</small>
              )}
            </form>
          </section>
        )}

        {/* ── Recent activity ── */}
        <section className="wal-panel">
          <div className="wal-panel-head">
            <h3>Recent activity</h3>
            <button className="wal-refresh" onClick={load} type="button">
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          {loading ? (
            <p className="wal-muted">Loading transactions…</p>
          ) : transactions.length === 0 ? (
            <p className="wal-muted">
              No transactions yet. Deposits, bets, and payouts will appear here.
            </p>
          ) : (
            <div className="wal-activity-list">
              {transactions.map((tx) => {
                const isCredit = [
                  "DEPOSIT",
                  "BET_WIN",
                  "REFERRAL_COMMISSION",
                  "WITHDRAWAL_REFUND",
                  "VIP_CASHBACK",
                  "WELCOME_BONUS",
                ].includes(tx.kind);
                const isPaidWithdrawal = isCompletedWithdrawal(tx);
                return (
                  <div
                    className={`wal-activity-row${
                      isPaidWithdrawal ? " is-paid-withdrawal" : ""
                    }`}
                    key={tx.id}
                  >
                    <span
                      className={`wal-activity-icon${
                        isCredit ? " is-credit" : ""
                      }${isPaidWithdrawal ? " is-paid" : ""}`}
                    >
                      {isPaidWithdrawal ? (
                        <CheckCircle2 size={15} />
                      ) : isCredit ? (
                        <ArrowDownRight size={15} />
                      ) : (
                        <ArrowUpRight size={15} />
                      )}
                    </span>
                    <div className="wal-activity-text">
                      <b>
                        {KIND_LABEL[tx.kind] ?? tx.kind}
                        {isPaidWithdrawal && (
                          <span className="wal-paid-pill">Paid</span>
                        )}
                      </b>
                      <small>
                        {new Date(tx.createdAt).toLocaleString()}{" "}
                        {tx.status ? `· ${tx.status}` : ""}
                      </small>
                    </div>
                    <strong
                      className={
                        isPaidWithdrawal
                          ? "is-paid"
                          : isCredit
                          ? "is-credit"
                          : ""
                      }
                    >
                      {isCredit ? "+" : "-"}
                      {currencyCode}{" "}
                      {Math.abs(numeric(tx.amount) ?? 0).toFixed(2)}
                    </strong>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function WalStyles() {
  return (
    <style>{`
      .wal-page{ background:#060A12; min-height:60vh; }

      .wal-hero{
        display:flex; flex-direction:column; gap:6px; padding:28px 26px 30px;
        background:linear-gradient(135deg,#0A1020 0%,#111C34 60%,rgba(243,102,0,.2) 100%); color:#fff;
        border-radius:0 0 18px 18px;
      }
      .wal-hero h1{ margin:0; font:800 30px 'DM Sans',sans-serif; letter-spacing:-.02em; }
      .wal-hero p{ margin:0; font-size:.85rem; color:rgba(255,255,255,.82); }

      .wal-body{ padding:22px 26px 50px; max-width:640px; margin:0 auto; display:flex; flex-direction:column; gap:16px; background:#060A12; }

      .wal-card{
        position:relative; overflow:hidden; cursor:pointer;
        aspect-ratio:1.586; width:100%; max-width:400px; margin:0 auto;
        border-radius:20px; padding:22px 24px;
        display:flex; flex-direction:column; justify-content:space-between;
        background:
          radial-gradient(circle at 15% -10%, rgba(255,209,128,.35), transparent 45%),
          linear-gradient(135deg, #2b2118 0%, #14100c 42%, #0a0805 100%);
        box-shadow:0 18px 40px rgba(10,8,5,.4), inset 0 1px rgba(255,255,255,.08);
        color:#f4ead2;
        transition:transform .22s cubic-bezier(.22,1,.36,1), box-shadow .22s ease;
      }
      .wal-card:hover{ transform:translateY(-3px) scale(1.01); box-shadow:0 24px 52px rgba(10,8,5,.48), inset 0 1px rgba(255,255,255,.1); }
      .wal-card:active{ transform:translateY(0) scale(.995); }
      .wal-card-ring{ position:absolute; inset:0; border-radius:20px; pointer-events:none; border:1px solid rgba(243,102,0,.3); }
      .wal-card-sheen{
        position:absolute; top:-60%; left:-30%; width:70%; height:220%; pointer-events:none;
        background:linear-gradient(115deg, transparent 40%, rgba(255,255,255,.08) 48%, rgba(255,255,255,.03) 54%, transparent 62%);
        transform:rotate(8deg);
      }
      .wal-card-top{ display:flex; align-items:center; justify-content:space-between; position:relative; z-index:1; }
      .wal-card-chip{
        display:inline-flex; flex-direction:column; gap:3px; justify-content:center;
        width:38px; height:28px; border-radius:6px; padding:5px 6px;
        background:linear-gradient(155deg,var(--orange-hi),var(--orange) 60%,var(--orange-dim));
        box-shadow:inset 0 1px rgba(255,255,255,.5), 0 2px 4px rgba(0,0,0,.35);
      }
      .wal-card-chip span{ height:1.5px; background:rgba(70,48,10,.55); border-radius:2px; }
      .wal-card-wifi{ color:rgba(244,234,210,.65); transform:rotate(90deg); }
      .wal-card-mid{ display:flex; flex-direction:column; gap:4px; position:relative; z-index:1; }
      .wal-card-label{ font-size:.62rem; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:rgba(244,234,210,.55); }
      .wal-card-balance{ font-family:'DM Sans',sans-serif; font-size:1.7rem; font-weight:800; letter-spacing:-.01em; font-variant-numeric:tabular-nums; }
      .wal-card-number{ position:relative; z-index:1; font-family:'DM Mono','DM Sans',monospace; font-size:1.02rem; letter-spacing:.14em; color:rgba(244,234,210,.85); font-weight:600; }
      .wal-card-bottom{ display:flex; align-items:flex-end; justify-content:space-between; position:relative; z-index:1; }
      .wal-card-holder{ display:flex; flex-direction:column; gap:3px; }
      .wal-card-name{ font-size:.78rem; font-weight:700; letter-spacing:.04em; }
      .wal-card-brand{ font-family:'DM Sans',sans-serif; font-style:italic; font-weight:800; font-size:1.15rem; letter-spacing:-.02em; color:#f6d98a; }

      .wal-error{ color:#E53935; font-size:.78rem; text-align:center; }

      .wal-card-actions{ display:flex; gap:9px; }
      .wal-action{
        flex:1; display:flex; align-items:center; justify-content:center; gap:7px;
        min-height:46px; border-radius:10px; font-size:.82rem; font-weight:800; cursor:pointer;
        transition:transform .16s ease, box-shadow .2s ease, background .16s ease;
      }
      .wal-action-solid{ background:var(--orange,#F36600); color:#fff; box-shadow:0 8px 20px rgba(243,102,0,.28); }
      .wal-action-solid:hover{ transform:translateY(-2px); }
      .wal-action-ghost{ background:rgba(255,255,255,.08); color:#fff; border:1px solid rgba(255,255,255,.14); box-shadow:none; }
      .wal-action-ghost:hover{ background:rgba(255,255,255,.14); }
      .wal-action-active{ background:var(--orange-pale,#FFF3EA); border-color:var(--orange,#F36600); color:var(--orange,#F36600); }
      .wal-action-locked{
        flex:1; display:flex; align-items:center; justify-content:center; gap:7px;
        min-height:46px; border-radius:10px; font-size:.82rem; font-weight:800;
        background:rgba(255,255,255,.05); color:rgba(255,255,255,.3); border:1px solid rgba(255,255,255,.08); cursor:not-allowed;
      }
      .wal-action-icon{ flex:0 0 46px; background:rgba(255,255,255,.08); color:rgba(255,255,255,.55); border:1px solid rgba(255,255,255,.12); box-shadow:none; }
      .wal-action-icon:hover{ color:var(--orange,#F36600); }

      .wal-win-note{
        display:flex; align-items:center; gap:8px;
        padding:12px 14px; border-radius:10px;
        background:rgba(243,102,0,.12); border:1px solid rgba(243,102,0,.35); color:#ffb366;
        font-size:.76rem; line-height:1.5;
      }
      .wal-win-note svg{ flex-shrink:0; }

      .wal-panel{ background:#0D1528; border:1px solid rgba(255,255,255,.08); box-shadow:0 4px 20px rgba(0,0,0,.4); border-radius:12px; padding:20px; }
      .wal-panel h3{ margin:0 0 14px; font:800 16px 'DM Sans',sans-serif; letter-spacing:-.01em; color:#FFFFFF; }
      .wal-panel-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
      .wal-panel-head h3{ margin:0; }
      .wal-refresh{ display:flex; align-items:center; gap:5px; background:transparent; color:var(--orange,#F36600); font-size:.72rem; font-weight:700; cursor:pointer; }

      .wal-form{ display:flex; flex-direction:column; gap:12px; }
      .wal-field{ display:flex; flex-direction:column; gap:5px; font-size:.72rem; font-weight:700; color:rgba(255,255,255,.45); text-transform:uppercase; letter-spacing:.05em; }
      .wal-field input,.wal-field select{
        padding:12px; font-size:.86rem; font-weight:600; color:#FFFFFF; background:rgba(255,255,255,.07);
        border:1px solid rgba(255,255,255,.12); border-radius:8px; outline:0; text-transform:none; letter-spacing:normal;
        font-family:'DM Sans',sans-serif;
      }
      .wal-field select{ cursor:pointer; }
      .wal-field input:focus,.wal-field select:focus{ border-color:var(--orange,#F36600); }
      .wal-submit{
        display:flex; align-items:center; justify-content:center; min-height:46px; border-radius:10px;
        background:var(--orange,#F36600); color:#fff; font-size:.84rem; font-weight:800; cursor:pointer;
      }
      .wal-submit:disabled{ opacity:.6; cursor:default; }
      .wal-notice{ color:rgba(255,255,255,.45); font-size:.76rem; }
      .wal-muted{ color:rgba(255,255,255,.35); font-size:.8rem; }

      .wal-activity-list{ display:flex; flex-direction:column; }
      .wal-activity-row{ display:flex; align-items:center; gap:11px; padding:11px 0; border-top:1px solid rgba(255,255,255,.06); }
      .wal-activity-row:first-child{ border-top:none; }
      .wal-activity-row.is-paid-withdrawal{ background:linear-gradient(90deg, rgba(243,102,0,.06), transparent 70%); border-radius:8px; margin:0 -8px; padding:11px 8px; }
      .wal-activity-row.is-paid-withdrawal:first-child{ border-top:none; }
      .wal-activity-icon{
        display:flex; align-items:center; justify-content:center; flex-shrink:0;
        width:32px; height:32px; border-radius:9px; background:rgba(243,102,0,.1); color:var(--orange,#F36600);
      }
      .wal-activity-icon.is-credit{ background:rgba(13,166,83,.1); color:var(--nature); }
      .wal-activity-icon.is-paid{ background:rgba(243,102,0,.15); color:var(--orange,#F36600); }
      .wal-activity-text{ flex:1; min-width:0; }
      .wal-activity-text b{ display:flex; align-items:center; gap:6px; font-size:.82rem; font-weight:700; color:#FFFFFF; }
      .wal-activity-text small{ display:block; margin-top:2px; font-size:.7rem; color:rgba(255,255,255,.38); }
      .wal-paid-pill{
        display:inline-flex; align-items:center; padding:1px 7px; border-radius:999px;
        background:linear-gradient(135deg,var(--orange-hi,#FF7A1A),var(--orange,#F36600)); color:#fff; font-size:.6rem; font-weight:800;
        letter-spacing:.03em; text-transform:uppercase;
      }
      .wal-activity-row strong{ flex-shrink:0; font-size:.82rem; font-weight:800; color:var(--orange,#F36600); font-variant-numeric:tabular-nums; }
      .wal-activity-row strong.is-credit{ color:var(--nature); }
      .wal-activity-row strong.is-paid{ color:#c9822a; }

      @media(max-width:560px){
        .wal-hero{ padding:22px 16px 24px; }
        .wal-hero h1{ font-size:26px; }
        .wal-body{ padding:16px 12px 40px; }
        .wal-card{ border-radius:16px; padding:18px 18px; }
        .wal-card-balance{ font-size:1.4rem; }
        .wal-card-number{ font-size:.88rem; letter-spacing:.1em; }
      }
    `}</style>
  );
}
