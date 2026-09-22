import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, ChevronRight, Info, Loader2, QrCode, Radio, Trash2, WalletCards, X } from "lucide-react";
import api, { ApiError, type BookingCode } from "@/lib/api";
import { useSession, pickUserField } from "@/lib/session";
import { currencyForCountry } from "@/lib/countries";
import { COUNTRY_CONFIGS } from "@/lib/withdrawalGate";
import { parseKickoff } from "@/lib/sportsbook";
import type { Pick } from "./Sportsbook";

function formatCountdown(kickoffAt?: string): string {
  if (!kickoffAt) return "";
  const diff = parseKickoff(kickoffAt).getTime() - Date.now();
  if (Number.isNaN(diff)) return "";
  if (diff <= 0) return "Starting soon";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const days = Math.floor(h / 24);
  if (days > 0) return `${days}d ${h % 24}h`;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// MIN_STAKE and MAX_STAKE are now derived per-country inside BetslipPage

function SelectionCard({ pick, onRemove }: { pick: Pick; onRemove: () => void }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (pick.isLive || !pick.kickoffAt) return;
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [pick.isLive, pick.kickoffAt]);

  return (
    <div className="bp-card">
      {pick.league && <div className="bp-league">{pick.league}</div>}
      <div className="bp-teams">
        <span>{pick.homeTeam ?? pick.match.split(" vs ")[0]}</span>
        <span className="bp-vs">vs</span>
        <span>{pick.awayTeam ?? pick.match.split(" vs ")[1] ?? ""}</span>
      </div>
      <div className="bp-meta-row">
        {pick.isLive ? (
          <span className="bp-live"><Radio size={12} /> LIVE {pick.scoreHome != null && pick.scoreAway != null ? `· ${pick.scoreHome} - ${pick.scoreAway}` : ""}</span>
        ) : pick.kickoffAt ? (
          <span className="bp-countdown">Starts in {formatCountdown(pick.kickoffAt)}</span>
        ) : null}
      </div>
      <div className="bp-selection-row">
        <div>
          <small>Market: {pick.market}</small>
          <b>{pick.selection === "1" ? pick.homeTeam ?? "Home" : pick.selection === "2" ? pick.awayTeam ?? "Away" : pick.selection === "X" ? "Draw" : pick.selection}</b>
        </div>
        <strong>{pick.odd.toFixed(2)}</strong>
        <button className="bp-remove" onClick={onRemove} aria-label="Remove selection" type="button"><X size={14} /></button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Booking code redeem
// ---------------------------------------------------------------------------

interface RedeemResult {
  booking?: BookingCode;
  enrichedSelections?: Record<string, unknown>[];
  currentTotalOdds?: number;
}

function buildMatchLabel(s: Record<string, unknown>): string {
  if (s.matchLabel) return String(s.matchLabel);
  if (s.match_label) return String(s.match_label);
  if (s.match) return String(s.match);
  const home = (s.homeTeam ?? s.home_team) as string | undefined;
  const away = (s.awayTeam ?? s.away_team) as string | undefined;
  if (home && away) return `${home} vs ${away}`;
  const id = String(s.matchId ?? s.match_id ?? "");
  return id ? `Match …${id.slice(-6)}` : "Unknown match";
}

function extractOdds(sel: Record<string, unknown>): number {
  const candidates: unknown[] = [
    sel.currentOdds, sel.oddsLocked, sel.odds, sel.value, sel.odd, sel.price, sel.oddsValue, sel.rate,
  ];
  for (const raw of candidates) {
    const n = Number(raw);
    if (!Number.isNaN(n) && n > 1) return n;
  }
  return 1;
}

function selectionToPick(sel: Record<string, unknown>): Pick {
  const id = String(sel.matchId ?? sel.match_id ?? sel.fixtureId ?? sel.fixture_id ?? "");
  const homeTeam = (sel.homeTeam ?? sel.home_team) as string | undefined;
  const awayTeam = (sel.awayTeam ?? sel.away_team) as string | undefined;
  return {
    id,
    match: buildMatchLabel(sel),
    market: String(sel.market ?? sel.marketKey ?? ""),
    selection: String(sel.selection ?? sel.pick ?? sel.name ?? sel.label ?? ""),
    odd: extractOdds(sel),
    homeTeam,
    awayTeam,
  };
}

function BookingCodePanel({ picks, onAdd }: { picks: Pick[]; onAdd: (newPicks: Pick[]) => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RedeemResult | null>(null);
  const [added, setAdded] = useState(false);

  const handleLoad = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAdded(false);
    try {
      const response = await api.booking.redeem({ code: trimmed });
      const data: RedeemResult = response.data;
      const selections = data?.enrichedSelections ?? [];
      if (!Array.isArray(selections) || selections.length === 0) {
        setError("That code has no valid selections right now.");
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Invalid or expired booking code.");
    } finally {
      setLoading(false);
    }
  };

  const enrichedSelections = result?.enrichedSelections ?? [];
  const bookingData = result?.booking;
  const totalOdds = result?.currentTotalOdds ?? Number(bookingData?.totalOdds ?? 0);

  const handleAddToSlip = () => {
    const mapped = enrichedSelections.map(selectionToPick);
    const existingKeys = new Set(picks.map((p) => `${p.id}-${p.market}-${p.selection}`));
    const fresh = mapped.filter((p) => !existingKeys.has(`${p.id}-${p.market}-${p.selection}`));
    onAdd(fresh);
    setAdded(true);
    setTimeout(() => { setResult(null); setCode(""); setAdded(false); }, 1400);
  };

  return (
    <section className="panel simple-card bc-panel">
      <div className="module-title bc-title">
        <h3><QrCode size={15} /> Booking Code</h3>
      </div>
      <p className="bc-sub">Have a code from a friend or our socials? Load it straight into your betslip.</p>

      <div className={`bc-input-row${error ? " has-error" : ""}`}>
        <input
          type="text"
          value={code}
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); setResult(null); }}
          onKeyDown={(e) => e.key === "Enter" && handleLoad()}
          placeholder="Enter code e.g. ABC12345"
          disabled={loading}
          className="bc-input"
        />
        <button type="button" className="bc-load-btn" onClick={handleLoad} disabled={loading || !code.trim()}>
          {loading ? <Loader2 size={14} className="bc-spin" /> : "Load"}
        </button>
      </div>

      {error && <div className="bc-error"><Info size={13} /> {error}</div>}

      {result && (
        <div className="bc-preview">
          <div className="bc-preview-head">
            <span className="bc-preview-code">{String(bookingData?.code ?? code)}</span>
            <span className="bc-preview-meta">{enrichedSelections.length} selection{enrichedSelections.length !== 1 ? "s" : ""} · Odds {totalOdds.toFixed(2)}×</span>
          </div>
          <div className="bc-preview-list">
            {enrichedSelections.map((sel, i) => (
              <div className="bc-preview-row" key={i}>
                <div>
                  <small>{buildMatchLabel(sel)}</small>
                  <b>{String(sel.market ?? "")}: {String(sel.selection ?? "")}</b>
                </div>
                <span>{extractOdds(sel).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <button type="button" className="gold-button full bc-add-btn" onClick={handleAddToSlip} disabled={added}>
            {added ? <><CheckCircle2 size={14} /> Added to slip</> : `Add ${enrichedSelections.length} Selection${enrichedSelections.length !== 1 ? "s" : ""} to Slip`}
          </button>
        </div>
      )}
    </section>
  );
}

function BookingCodeStyles() {
  return (
    <style>{`
      .bc-panel{ padding:20px 22px; margin-top:14px; }
      .bc-title h3{ display:flex; align-items:center; gap:7px; }
      .bc-sub{ margin:6px 0 14px; color:rgba(255,255,255,.45); font-size:.78rem; line-height:1.5; }
      .bc-input-row{ display:flex; align-items:stretch; gap:0; border:1px solid rgba(255,255,255,.12); border-radius:10px; overflow:hidden; background:rgba(255,255,255,.06); transition:border-color .15s ease; }
      .bc-input-row:focus-within{ border-color:var(--orange,#F36600); }
      .bc-input-row.has-error{ border-color:var(--orange,#F36600); }
      .bc-input{ flex:1; min-width:0; padding:12px 14px; border:0; outline:0; background:transparent; color:#FFFFFF; font:700 13px 'DM Sans',sans-serif; letter-spacing:.08em; text-transform:uppercase; }
      .bc-input::placeholder{ text-transform:none; letter-spacing:normal; color:#a2a7b0; font-weight:500; }
      .bc-load-btn{ flex-shrink:0; padding:0 20px; background:var(--orange,#F36600); color:#fff; font:800 11px 'DM Sans',sans-serif; letter-spacing:.04em; text-transform:uppercase; cursor:pointer; display:flex; align-items:center; justify-content:center; min-width:64px; transition:opacity .15s ease; }
      .bc-load-btn:disabled{ opacity:.55; cursor:not-allowed; }
      .bc-spin{ animation:bcSpin .8s linear infinite; }
      @keyframes bcSpin{ to{ transform:rotate(360deg); } }
      .bc-error{ display:flex; align-items:center; gap:6px; margin-top:9px; padding:8px 11px; border-radius:8px; background:rgba(243,102,0,.08); border:1px solid rgba(243,102,0,.2); color:var(--orange,#F36600); font-size:.72rem; font-weight:600; }
      .bc-preview{ margin-top:14px; border:1px solid rgba(255,255,255,.08); border-radius:12px; overflow:hidden; background:#0D1528; }
      .bc-preview-head{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:11px 14px; border-bottom:1px solid rgba(255,255,255,.06); flex-wrap:wrap; }
      .bc-preview-code{ font:800 13px 'DM Sans',sans-serif; letter-spacing:.1em; color:var(--orange,#F36600); }
      .bc-preview-meta{ font-size:.7rem; color:rgba(255,255,255,.40); }
      .bc-preview-list{ max-height:180px; overflow-y:auto; }
      .bc-preview-row{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:9px 14px; border-top:1px solid rgba(255,255,255,.06); }
      .bc-preview-row:first-child{ border-top:none; }
      .bc-preview-row small{ display:block; color:rgba(255,255,255,.40); font-size:.68rem; }
      .bc-preview-row b{ display:block; margin-top:2px; font-size:.78rem; color:#FFFFFF; }
      .bc-preview-row span{ flex-shrink:0; font-weight:800; color:var(--orange,#F36600); font-size:.82rem; }
      .bc-add-btn{ margin:12px; width:calc(100% - 24px); display:flex; align-items:center; justify-content:center; gap:7px; }
      @media(max-width:960px){ .bc-panel{ margin-top:12px; } }
    `}</style>
  );
}

// ---------------------------------------------------------------------------
// Betslip page
// ---------------------------------------------------------------------------

export default function BetslipPage({
  picks, setPicks, onPlace,
}: { picks: Pick[]; setPicks: (p: Pick[]) => void; onPlace: (stake: number) => Promise<void> }) {
  const { user } = useSession();
  const userCountry = pickUserField(user, "country", "countryCode", "country_code");
  const { code: curr } = currencyForCountry(userCountry);
  const countryKey = curr === "NGN" ? "NG" : "GH";
  const cfg = COUNTRY_CONFIGS[countryKey];
  const MIN_STAKE = cfg.minStake;
  const MAX_STAKE = curr === "NGN" ? 5000000 : 20000;

  const [stake, setStake] = useState(MIN_STAKE);
  const [placing, setPlacing] = useState(false);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    api.wallet.getWallet()
      .then((w) => {
        const wallet = w.data;
        const raw = wallet?.balance ?? wallet?.availableBalance;
        const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : null;
        if (n !== null && Number.isFinite(n)) setBalance(n);
      })
      .catch(() => undefined);
  }, []);

  const totalOdds = picks.reduce((a, p) => a * p.odd, 1);
  const potentialReturn = stake * totalOdds;
  const stakeInvalid = stake < MIN_STAKE || stake > MAX_STAKE || (balance !== null && stake > balance);

  const remove = (pick: Pick) => setPicks(picks.filter((p) => !(p.id === pick.id && p.selection === pick.selection && p.market === pick.market)));

  const addFromBookingCode = (newPicks: Pick[]) => {
    if (newPicks.length === 0) return;
    setPicks([...picks, ...newPicks]);
  };

  const place = async () => {
    setNotice(null);
    if (picks.length === 0) return;
    if (stakeInvalid) { setNotice({ type: "error", text: balance !== null && stake > balance ? "Stake exceeds your available balance." : `Stake must be between ${curr} ${MIN_STAKE.toLocaleString()} and ${curr} ${MAX_STAKE.toLocaleString()}.` }); return; }
    setPlacing(true);
    try {
      await onPlace(stake);
      setNotice({ type: "success", text: "Bet placed successfully." });
    } catch (e) {
      setNotice({ type: "error", text: e instanceof ApiError ? e.message : "We could not place this bet. Please try again." });
    } finally {
      setPlacing(false);
    }
  };

  return (
    <main className="wrap betslip-page">
      <BookingCodeStyles />
      <div className="bp-header">
        <div>
          <span className="eyebrow">Your slip</span>
          <h1>Betslip <b className="bp-count">{picks.length}</b></h1>
        </div>
        {picks.length > 0 && <button className="text-action" onClick={() => setPicks([])} type="button"><Trash2 size={13} /> Clear all</button>}
      </div>

      {picks.length === 0 ? (
        <>
          <section className="panel simple-card bp-empty">
            <WalletCards size={34} />
            <h3>No selections yet</h3>
            <p>Select odds from any match to add them to your betslip.</p>
            <Link href="/" className="gold-button">Browse Sports <ChevronRight size={15} /></Link>
          </section>
          <BookingCodePanel picks={picks} onAdd={addFromBookingCode} />
        </>
      ) : (
        <div className="bp-grid">
          <div className="bp-list">
            {picks.map((p) => <SelectionCard key={`${p.id}-${p.selection}-${p.market}`} pick={p} onRemove={() => remove(p)} />)}
            <BookingCodePanel picks={picks} onAdd={addFromBookingCode} />
          </div>

          <aside className="panel bp-summary">
            <div className="bp-summary-row"><span>Selections</span><b>{picks.length}</b></div>
            <div className="bp-summary-row"><span>Total odds</span><b>{totalOdds.toFixed(2)}</b></div>
            <label className="bp-stake-field">
              <span>Stake ({curr})</span>
              <input type="number" min={MIN_STAKE} max={MAX_STAKE} value={stake} onChange={(e) => setStake(Number(e.target.value) || 0)} />
            </label>
            <div className="bp-stake-hint">Min {curr} {MIN_STAKE.toLocaleString()} · Max {curr} {MAX_STAKE.toLocaleString()}{balance !== null && ` · Balance ${curr} ${balance.toFixed(2)}`}</div>
            <div className="bp-summary-row highlight"><span>Potential return</span><b>{curr} {potentialReturn.toFixed(2)}</b></div>
            <button className="gold-button full" onClick={place} disabled={placing || stakeInvalid}>{placing ? "Placing…" : "Place Bet"}</button>
            {notice && <small className={notice.type === "error" ? "auth-notice" : "auth-notice bp-success"}>{notice.text}</small>}
          </aside>
        </div>
      )}
    </main>
  );
}