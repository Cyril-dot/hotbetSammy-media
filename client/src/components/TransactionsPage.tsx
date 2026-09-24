import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, RefreshCw, Wallet } from "lucide-react";
import api, { ApiError, type Transaction } from "@/lib/api";
import { isCompletedWithdrawal } from "@/lib/withdrawalCelebration";
import { useAutoRefresh } from "@/lib/autoRefresh";

const FILTERS: { key: string; label: string; kinds: string[] }[] = [
  { key: "all", label: "All", kinds: [] },
  { key: "deposits", label: "Deposits", kinds: ["DEPOSIT"] },
  { key: "withdrawals", label: "Withdrawals", kinds: ["WITHDRAW", "WITHDRAW_HOLD", "WITHDRAW_RELEASE"] },
  { key: "bets", label: "Bets", kinds: ["BET_STAKE"] },
  { key: "winnings", label: "Winnings", kinds: ["BET_WIN"] },
  { key: "bonuses", label: "Bonuses", kinds: ["WELCOME_BONUS", "VIP_CASHBACK", "REFERRAL_COMMISSION"] },
];

const KIND_LABEL: Record<string, string> = {
  DEPOSIT: "Deposit", WITHDRAW: "Withdrawal", WITHDRAW_HOLD: "Withdrawal hold", WITHDRAW_RELEASE: "Withdrawal released",
  BET_STAKE: "Bet placed", BET_WIN: "Bet won", REFERRAL_COMMISSION: "Referral commission", PAYOUT: "Payout",
  ADJUSTMENT: "Adjustment", VIP_CASHBACK: "VIP cashback", VIP_MEMBERSHIP: "VIP membership", WELCOME_BONUS: "Welcome bonus",
  WITHDRAWAL_REFUND: "Withdrawal refund",
};

const CREDIT_KINDS = new Set(["DEPOSIT", "BET_WIN", "REFERRAL_COMMISSION", "WITHDRAWAL_REFUND", "VIP_CASHBACK", "WELCOME_BONUS"]);
const PAGE_SIZE = 20;

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");

  const load = async (p = 0) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.wallet.getTransactions(p, PAGE_SIZE);
      setTransactions(res.data.content ?? []);
      setTotalPages(res.data.totalPages ?? 1);
      setPage(p);
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? "Sign in to view your transaction history." : "Transactions are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(0); }, []);
  useAutoRefresh(() => load(page), { intervalMs: 30_000 });

  const activeFilter = FILTERS.find((f) => f.key === filter)!;
  const filtered = activeFilter.kinds.length === 0 ? transactions : transactions.filter((t) => activeFilter.kinds.includes(t.kind));

  return (
    <main className="wrap support-page">
      <div className="bp-header">
        <div><span className="eyebrow">Wallet</span><h1 style={{ fontSize: 40 }}>Transactions</h1></div>
        <button className="text-action" onClick={() => load(page)} type="button"><RefreshCw size={12} /> Refresh</button>
      </div>

      <div className="casino-tabs" style={{ marginBottom: 18 }}>
        {FILTERS.map((f) => (
          <button key={f.key} className={filter === f.key ? "active" : ""} onClick={() => setFilter(f.key)} type="button">{f.label}</button>
        ))}
      </div>

      <section className="panel simple-card" style={{ gridColumn: "1 / -1" }}>
        {loading ? (
          <p className="muted">Loading transactions…</p>
        ) : error ? (
          <>
            <Wallet size={24} />
            <p className="muted">{error}</p>
            <Link href="/login" className="gold-button" style={{ marginTop: 12, display: "inline-flex" }}>Sign in</Link>
          </>
        ) : filtered.length === 0 ? (
          <p className="muted">No {filter === "all" ? "" : activeFilter.label.toLowerCase() + " "}transactions found on this page.</p>
        ) : (
          filtered.map((tx) => {
            const isCredit = CREDIT_KINDS.has(tx.kind);
            const isPaidWithdrawal = isCompletedWithdrawal(tx);
            return (
              <div className={`activity-row${isPaidWithdrawal ? " is-paid-withdrawal" : ""}`} key={tx.id} style={isPaidWithdrawal ? { background: "linear-gradient(90deg, rgba(243,102,0,.09), transparent 70%)", borderRadius: 8, margin: "0 -8px", padding: "12px 8px" } : undefined}>
                <span className="activity-icon" style={isPaidWithdrawal ? { color: "#c9822a", background: "rgba(243,102,0,.16)" } : undefined}>
                  {isPaidWithdrawal ? <CheckCircle2 size={15} /> : isCredit ? "+" : "−"}
                </span>
                <div>
                  <b style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {KIND_LABEL[tx.kind] ?? tx.kind}
                    {isPaidWithdrawal && (
                      <span style={{ display: "inline-flex", alignItems: "center", padding: "1px 7px", borderRadius: 999, background: "linear-gradient(135deg,#FF7A1A,#c9822a)", color: "#20140a", fontSize: 9, fontWeight: 800, letterSpacing: ".03em", textTransform: "uppercase" }}>Paid</span>
                    )}
                  </b>
                  <small>{new Date(tx.createdAt).toLocaleString()} {tx.status ? `· ${tx.status}` : ""} {tx.providerRef ? `· Ref ${tx.providerRef}` : ""}</small>
                </div>
                <strong style={{ color: isPaidWithdrawal ? "#c9822a" : isCredit ? "var(--live,#00C853)" : "var(--orange,#F36600)" }}>
                  {isCredit ? "+" : "-"}GHS {Math.abs(tx.amount).toFixed(2)}
                </strong>
              </div>
            );
          })
        )}
        {!loading && !error && totalPages > 1 && (
          <div className="tx-pagination">
            <button disabled={page === 0} onClick={() => load(page - 1)} type="button">Previous</button>
            <span>Page {page + 1} of {totalPages}</span>
            <button disabled={page + 1 >= totalPages} onClick={() => load(page + 1)} type="button">Next</button>
          </div>
        )}
      </section>
    </main>
  );
}
