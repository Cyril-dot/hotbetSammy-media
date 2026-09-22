import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Award, Bell, CheckCheck, RefreshCw, Wallet } from "lucide-react";
import api, { ApiError, type Bet, type Transaction } from "@/lib/api";
import { useSession, pickUserField } from "@/lib/session";
import { currencyForCountry } from "@/lib/countries";

interface Notice { id: string; icon: "wallet" | "bet"; title: string; detail: string; at: string; }

const READ_KEY = "hotbet_read_notices_v1";
function loadRead(): Set<string> { try { return new Set(JSON.parse(window.localStorage.getItem(READ_KEY) ?? "[]")); } catch { return new Set(); } }
function saveRead(ids: Set<string>) { try { window.localStorage.setItem(READ_KEY, JSON.stringify(Array.from(ids))); } catch { /* ignore */ } }

const KIND_LABEL: Record<string, string> = {
  DEPOSIT: "Deposit confirmed", WITHDRAW: "Withdrawal submitted", WITHDRAW_RELEASE: "Withdrawal released",
  BET_WIN: "Bet won", BET_STAKE: "Bet placed", REFERRAL_COMMISSION: "Referral commission earned",
  WELCOME_BONUS: "Welcome bonus credited", VIP_CASHBACK: "VIP cashback credited",
};

export default function NotificationsPage() {
  const { user } = useSession();
  const { code: currency } = currencyForCountry(pickUserField(user, "country", "countryCode", "country_code"));
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [readIds, setReadIds] = useState<Set<string>>(() => loadRead());

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [txPage, betPage] = await Promise.all([api.wallet.getTransactions(0, 30), api.bets.getMine(0, 30)]);
      setTxs(txPage.data.content ?? []);
      setBets(betPage.data.content.filter((b) => b.status !== "PENDING"));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? "Sign in to see your account activity." : "Activity is temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const notices: Notice[] = useMemo(() => {
    const fromTx: Notice[] = txs.map((t) => ({
      id: `tx-${t.id}`, icon: "wallet", title: KIND_LABEL[t.kind] ?? t.kind,
      detail: `${currency} ${Math.abs(t.amount).toFixed(2)}${t.status ? ` · ${t.status}` : ""}`, at: t.createdAt,
    }));
    const fromBets: Notice[] = bets.map((b) => ({
      id: `bet-${b.id}`, icon: "bet",
      title: b.status === "WON" ? "Bet won" : b.status === "LOST" ? "Bet lost" : b.status === "VOID" ? "Bet voided" : "Bet cashed out",
      detail: `Stake ${currency} ${b.stake.toFixed(2)} · ${b.selections.length} selection${b.selections.length === 1 ? "" : "s"}`,
      at: b.settledAt ?? b.placedAt,
    }));
    return [...fromTx, ...fromBets].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [txs, bets, currency]);

  const markAllRead = () => { const all = new Set(notices.map((n) => n.id)); setReadIds(all); saveRead(all); };
  const markRead = (id: string) => { const next = new Set(readIds); next.add(id); setReadIds(next); saveRead(next); };
  const unreadCount = notices.filter((n) => !readIds.has(n.id)).length;

  return (
    <main className="wrap support-page">
      <div className="bp-header">
        <div><span className="eyebrow">Account</span><h1 style={{ fontSize: 40 }}>Notifications {unreadCount > 0 && <b className="bp-count" style={{ verticalAlign: "middle" }}>{unreadCount}</b>}</h1></div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="text-action" onClick={markAllRead} type="button"><CheckCheck size={13} /> Mark all read</button>
          <button className="text-action" onClick={load} type="button"><RefreshCw size={12} /> Refresh</button>
        </div>
      </div>

      <section className="panel simple-card" style={{ gridColumn: "1 / -1" }}>
        {loading ? (
          <p className="muted">Loading activity…</p>
        ) : error ? (
          <>
            <Bell size={24} />
            <p className="muted">{error}</p>
            <Link href="/login" className="gold-button" style={{ marginTop: 12, display: "inline-flex" }}>Sign in</Link>
          </>
        ) : notices.length === 0 ? (
          <>
            <Bell size={24} />
            <p className="muted">No activity yet. Deposits, withdrawals, and bet results will appear here as they happen.</p>
          </>
        ) : (
          notices.map((n) => (
            <div className={`activity-row notice-row${readIds.has(n.id) ? "" : " unread"}`} key={n.id} onClick={() => markRead(n.id)}>
              <span className="activity-icon">{n.icon === "wallet" ? <Wallet size={14} /> : <Award size={14} />}</span>
              <div>
                <b>{n.title}</b>
                <small>{n.detail} · {new Date(n.at).toLocaleString()}</small>
              </div>
              {!readIds.has(n.id) && <span className="notice-dot" />}
            </div>
          ))
        )}
      </section>
    </main>
  );
}
