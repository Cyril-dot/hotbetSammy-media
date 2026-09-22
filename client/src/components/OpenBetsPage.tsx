import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Bookmark, ChevronLeft, ChevronRight, Clock3, RefreshCw, Share2, TrendingUp, Trash2, WalletCards, X, Zap } from "lucide-react";
import api, { ApiError, type Bet, type Match } from "@/lib/api";
import { useSession, pickUserField } from "@/lib/session";
import { currencyForCountry } from "@/lib/countries";
import { COUNTRY_CONFIGS } from "@/lib/withdrawalGate";
import type { Pick } from "./Sportsbook";

// ---------------------------------------------------------------------------
// Recommended codes — each leg has a real matchId + selection so clicking
// "Add to Slip" pushes actual Pick objects straight into the betslip without
// touching the booking-code API at all.
// ---------------------------------------------------------------------------
interface RecommendedLeg {
  matchId: string;
  match: string;         // display label "Home vs Away"
  homeTeam: string;
  awayTeam: string;
  market: string;
  selection: string;     // "1" | "X" | "2"
  odd: number;
  label: string;         // human label e.g. "Home Win"
}

interface RecommendedCode {
  code: string;
  folds: number;
  totalOdds: number;
  legs: RecommendedLeg[];
}

const RECOMMENDED_CODES: RecommendedCode[] = [
  {
    code: "CFDJN8", folds: 3, totalOdds: 3.61,
    legs: [
      { matchId: "rec-1a", match: "SC Pisa vs Empoli", homeTeam: "SC Pisa", awayTeam: "Empoli", market: "1X2", selection: "1", odd: 1.85, label: "Home Win" },
      { matchId: "rec-1b", match: "Sassuolo vs Cesena FC", homeTeam: "Sassuolo", awayTeam: "Cesena FC", market: "1X2", selection: "1", odd: 1.70, label: "Home Win" },
      { matchId: "rec-1c", match: "Estudiantes vs Atletico T.", homeTeam: "Estudiantes", awayTeam: "Atletico T.", market: "1X2", selection: "X", odd: 1.14, label: "Draw" },
    ],
  },
  {
    code: "C5BEGS", folds: 2, totalOdds: 2.74,
    legs: [
      { matchId: "rec-2a", match: "Mohun Bagan vs Jamshedpur", homeTeam: "Mohun Bagan", awayTeam: "Jamshedpur", market: "1X2", selection: "1", odd: 1.61, label: "Home Win" },
      { matchId: "rec-2b", match: "Chennaiyin vs Hyderabad FC", homeTeam: "Chennaiyin", awayTeam: "Hyderabad FC", market: "1X2", selection: "2", odd: 1.70, label: "Away Win" },
    ],
  },
  {
    code: "OMGBET3", folds: 3, totalOdds: 4.12,
    legs: [
      { matchId: "rec-3a", match: "Hearts vs Kotoko", homeTeam: "Hearts", awayTeam: "Kotoko", market: "1X2", selection: "1", odd: 2.10, label: "Home Win" },
      { matchId: "rec-3b", match: "Real Tamale vs Berekum Chelsea", homeTeam: "Real Tamale", awayTeam: "Berekum Chelsea", market: "1X2", selection: "X", odd: 1.60, label: "Draw" },
      { matchId: "rec-3c", match: "Medeama vs Aduana", homeTeam: "Medeama", awayTeam: "Aduana", market: "1X2", selection: "1", odd: 1.22, label: "Home Win" },
    ],
  },
  {
    code: "WEEKND5", folds: 2, totalOdds: 3.20,
    legs: [
      { matchId: "rec-4a", match: "Man City vs Arsenal", homeTeam: "Man City", awayTeam: "Arsenal", market: "1X2", selection: "1", odd: 1.80, label: "Home Win" },
      { matchId: "rec-4b", match: "Chelsea vs Liverpool", homeTeam: "Chelsea", awayTeam: "Liverpool", market: "1X2", selection: "2", odd: 1.78, label: "Away Win" },
    ],
  },
];

function getBetList(response: { data?: unknown }): Bet[] {
  const data = response?.data;
  if (Array.isArray(data)) return data as Bet[];
  if (data && typeof data === "object") {
    const page = data as { content?: unknown; bets?: unknown };
    if (Array.isArray(page.content)) return page.content as Bet[];
    if (Array.isArray(page.bets)) return page.bets as Bet[];
  }
  return [];
}

function isOpenBet(bet: Bet): boolean {
  const status = String(bet.status ?? "").toUpperCase();
  return status === "PENDING" || status === "OPEN" || status === "ACTIVE" || status === "PLACED";
}

// ---------------------------------------------------------------------------
// Recommended code card — horizontal carousel item
// ---------------------------------------------------------------------------
function RecommendedCodeCard({
  code, picks, onAddToSlip, added,
}: {
  code: RecommendedCode;
  picks: Pick[];
  onAddToSlip: (legs: RecommendedLeg[]) => void;
  added: boolean;
}) {
  const share = () => navigator.clipboard?.writeText(code.code).catch(() => undefined);
  const allAlreadyAdded = code.legs.every((leg) =>
    picks.some((p) => p.id === leg.matchId && p.market === leg.market && p.selection === leg.selection)
  );

  return (
    <div className="rc-card">
      <div className="rc-card-head">
        <span className="rc-code"><Bookmark size={11} /> {code.code}</span>
        <span className="rc-meta">{code.folds} folds &nbsp;·&nbsp; <b>{code.totalOdds.toFixed(2)}×</b></span>
      </div>
      <div className="rc-reward"><TrendingUp size={11} /> 1UP/2UP rewards you early when your team leads!</div>
      <div className="rc-legs">
        {code.legs.map((leg, i) => (
          <div className="rc-leg" key={i}>
            <div>
              <b>{leg.label}</b>
              <small>{leg.match}</small>
            </div>
            <span>{leg.odd.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="rc-actions">
        <button type="button" className="rc-share" onClick={share} aria-label="Copy code">
          <Share2 size={12} /> Share
        </button>
        <button
          type="button"
          className={`rc-add${allAlreadyAdded || added ? " rc-added" : ""}`}
          onClick={() => onAddToSlip(code.legs)}
          disabled={allAlreadyAdded || added}
        >
          {allAlreadyAdded || added ? "✓ Added" : "Add to Slip"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horizontal carousel of recommended codes
// ---------------------------------------------------------------------------
function RecommendedCarousel({
  picks, onAddToSlip,
}: {
  picks: Pick[];
  onAddToSlip: (legs: RecommendedLeg[]) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [addedCode, setAddedCode] = useState<string | null>(null);

  const scroll = (dir: "left" | "right") => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === "right" ? 260 : -260, behavior: "smooth" });
  };

  const handleAdd = (code: RecommendedCode, legs: RecommendedLeg[]) => {
    onAddToSlip(legs);
    setAddedCode(code.code);
    setTimeout(() => setAddedCode(null), 2000);
  };

  return (
    <section className="panel simple-card rc-section">
      <div className="rc-section-head">
        <div className="module-title"><h3><Bookmark size={14} /> Recommended Codes</h3></div>
        <div className="rc-nav-btns">
          <button type="button" className="rc-nav-btn" onClick={() => scroll("left")} aria-label="Scroll left"><ChevronLeft size={16} /></button>
          <button type="button" className="rc-nav-btn" onClick={() => scroll("right")} aria-label="Scroll right"><ChevronRight size={16} /></button>
        </div>
      </div>
      <div className="rc-carousel" ref={scrollRef}>
        {RECOMMENDED_CODES.map((c) => (
          <RecommendedCodeCard
            key={c.code}
            code={c}
            picks={picks}
            onAddToSlip={(legs) => handleAdd(c, legs)}
            added={addedCode === c.code}
          />
        ))}
      </div>
      <Link href="/" className="text-action rc-browse">Browse all matches <ChevronRight size={12} /></Link>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Inline betslip shown at top of Open Bets when picks exist
// ---------------------------------------------------------------------------
function InlineBetslip({
  picks, setPicks, onPlace, currency,
}: {
  picks: Pick[]; setPicks: (p: Pick[]) => void; onPlace: (stake: number) => Promise<void>; currency: string;
}) {
  const countryKey = currency === "NGN" ? "NG" : "GH";
  const cfg = COUNTRY_CONFIGS[countryKey];
  const MIN_STAKE = cfg.minStake;
  const MAX_STAKE = currency === "NGN" ? 5_000_000 : 20_000;

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

  const remove = (pick: Pick) =>
    setPicks(picks.filter((p) => !(p.id === pick.id && p.market === pick.market && p.selection === pick.selection)));

  const place = async () => {
    setNotice(null);
    if (picks.length === 0) return;
    if (stakeInvalid) {
      setNotice({
        type: "error",
        text: balance !== null && stake > balance
          ? "Stake exceeds your available balance."
          : `Stake must be between ${currency} ${MIN_STAKE.toLocaleString()} and ${currency} ${MAX_STAKE.toLocaleString()}.`,
      });
      return;
    }
    setPlacing(true);
    try {
      await onPlace(stake);
      setPicks([]);
      setNotice({ type: "success", text: "Bet placed successfully!" });
    } catch (e) {
      setNotice({ type: "error", text: e instanceof ApiError ? e.message : "Could not place bet. Please try again." });
    } finally {
      setPlacing(false);
    }
  };

  return (
    <section className="panel ibs-panel">
      <div className="ibs-header">
        <span className="ibs-title"><WalletCards size={15} /> Betslip <b className="ibs-count">{picks.length}</b></span>
        <button className="text-action" type="button" onClick={() => setPicks([])}><Trash2 size={12} /> Clear all</button>
      </div>
      <div className="ibs-picks">
        {picks.map((p) => (
          <div className="ibs-pick" key={`${p.id}-${p.market}-${p.selection}`}>
            <div className="ibs-pick-info">
              <b>{p.match}</b>
              <small>{p.market} · {p.selection === "1" ? p.homeTeam ?? "Home" : p.selection === "2" ? p.awayTeam ?? "Away" : p.selection === "X" ? "Draw" : p.selection}</small>
            </div>
            <strong className="ibs-pick-odd">{p.odd.toFixed(2)}</strong>
            <button className="ibs-remove" type="button" onClick={() => remove(p)} aria-label="Remove"><X size={13} /></button>
          </div>
        ))}
      </div>
      <div className="ibs-summary">
        <div className="ibs-row"><span>Total odds</span><b>{totalOdds.toFixed(2)}</b></div>
        <label className="ibs-stake-label">
          <span>Stake ({currency})</span>
          <input type="number" min={MIN_STAKE} max={MAX_STAKE} value={stake} onChange={(e) => setStake(Number(e.target.value) || 0)} className="ibs-stake-input" />
        </label>
        <div className="ibs-hint">Min {currency} {MIN_STAKE.toLocaleString()} · Max {currency} {MAX_STAKE.toLocaleString()}{balance !== null && ` · Balance ${currency} ${balance.toFixed(2)}`}</div>
        <div className="ibs-row highlight"><span>Potential return</span><b>{currency} {potentialReturn.toFixed(2)}</b></div>
        <button className="gold-button full ibs-place" onClick={place} disabled={placing || stakeInvalid} type="button">
          {placing ? "Placing…" : "Place Bet"} <Zap size={15} />
        </button>
        {notice && <small className={notice.type === "error" ? "auth-notice" : "auth-notice bp-success"}>{notice.text}</small>}
      </div>
    </section>
  );
}

function isLiveMatch(match?: Match): boolean {
  const status = String(match?.status ?? "").toLowerCase();
  return status === "live" || status === "in_play" || status === "inplay" || status === "in-play" || status === "1h" || status === "2h" || status === "ht";
}
function liveClockLabel(match: Match): string {
  const minute = Number(match.minutePlayed);
  if (Number.isFinite(minute) && minute >= 0) return `${Math.floor(minute)}'`;
  const kickoff = match.kickoffAt ? new Date(match.kickoffAt).getTime() : NaN;
  if (!Number.isFinite(kickoff)) return "LIVE";
  return `${Math.max(0, Math.floor((Date.now() - kickoff) / 60000))}'`;
}
function scheduledPlayLabel(match?: Match): string {
  if (!match?.kickoffAt) return "Play time pending";
  const date = new Date(match.kickoffAt);
  return Number.isNaN(date.getTime()) ? "Play time pending" : `Plays ${date.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`;
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------
export default function OpenBetsPage({
  picks = [],
  setPicks = () => undefined,
  onPlace = async () => undefined,
}: {
  picks?: Pick[];
  setPicks?: (p: Pick[]) => void;
  onPlace?: (stake: number) => Promise<void>;
}) {
  const [, setLocation] = useLocation();
  const { user } = useSession();
  const { code: currency } = currencyForCountry(pickUserField(user, "country", "countryCode", "country_code"));
  const [bets, setBets] = useState<Bet[]>([]);
  const [liveMatches, setLiveMatches] = useState<Record<string, Match>>({});
  const [, setClockTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const page = await api.bets.getMyBets(0, 50);
      setBets(getBetList(page).filter(isOpenBet));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? "Sign in to view your open bets." : "Open bets are temporarily unavailable.");
    } finally {
      setLoading(false);
    }
  };

  const loadMatchStates = async (items: Bet[]) => {
    const ids = Array.from(new Set(items.flatMap((bet) => bet.selections.map((selection) => selection.matchId)).filter(Boolean)));
    if (!ids.length) { setLiveMatches({}); return; }
    const entries = await Promise.all(ids.map(async (id) => {
      try { return [id, (await api.publicAdminMatches.getById(id)).data as Match] as const; }
      catch { try { return [id, (await api.matches.getById(id)).data as Match] as const; } catch { return null; } }
    }));
    setLiveMatches(Object.fromEntries(entries.filter((entry): entry is readonly [string, Match] => Boolean(entry))));
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { if (bets.length) { loadMatchStates(bets).catch(() => undefined); } }, [bets]);
  useEffect(() => { const timer = window.setInterval(() => setClockTick((tick) => tick + 1), 15000); return () => window.clearInterval(timer); }, []);

  // Add recommended code legs directly as picks — no API call
  const addLegsToSlip = (legs: RecommendedLeg[]) => {
    const newPicks: Pick[] = legs.map((leg) => ({
      id: leg.matchId,
      match: leg.match,
      homeTeam: leg.homeTeam,
      awayTeam: leg.awayTeam,
      market: leg.market,
      selection: leg.selection,
      odd: leg.odd,
    }));
    // Merge — skip any already in the slip
    const merged = [...picks];
    for (const p of newPicks) {
      const exists = merged.some((x) => x.id === p.id && x.market === p.market && x.selection === p.selection);
      if (!exists) merged.push(p);
    }
    setPicks(merged);
  };

  return (
    <main className="wrap support-page">
      <OpenBetsStyles />
      <div className="bp-header">
        <div><span className="eyebrow">Active</span><h1 style={{ fontSize: 40 }}>Open Bets</h1></div>
        <button className="text-action" onClick={load} type="button"><RefreshCw size={12} /> Refresh</button>
      </div>

      {/* Inline betslip when picks exist */}
      {picks.length > 0 && (
        <InlineBetslip picks={picks} setPicks={setPicks} onPlace={onPlace} currency={currency} />
      )}

      {/* Placed open bets from the API */}
      <section className="panel simple-card" style={{ gridColumn: "1 / -1" }}>
        {loading ? (
          <p className="muted">Loading open bets…</p>
        ) : error ? (
          <>
            <Clock3 size={24} />
            <p className="muted">{error}</p>
            <Link href="/login" className="gold-button" style={{ marginTop: 12, display: "inline-flex" }}>Sign in</Link>
          </>
        ) : bets.length === 0 ? (
          <div className="ob-empty">
            <span className="ob-empty-emoji">🎟️⚽</span>
            <h3>No open bets yet</h3>
            <p>Pick odds from any match — they'll appear above so you can stake right here.</p>
            <Link href="/" className="gold-button" style={{ marginTop: 12, display: "inline-flex" }}>Browse matches</Link>
          </div>
        ) : (
          bets.map((bet) => (
            <div
              className="ob-bet-row" key={bet.id}
              onClick={() => setLocation(`/bets/${bet.id}`)}
              role="button" tabIndex={0}
              onKeyDown={e => e.key === "Enter" && setLocation(`/bets/${bet.id}`)}
            >
              <div className="ob-bet-left">
                <span className="ob-bet-icon"><Clock3 size={14} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="ob-bet-type">{bet.selections.length > 1 ? `Multiple · ${bet.selections.length} picks` : "Singles"}</div>
                  {bet.selections.slice(0, 2).map((s, i) => { const match = liveMatches[s.matchId]; const live = isLiveMatch(match); return (
                    <div key={s.id ?? i} className={`ob-bet-match${live ? " ob-bet-match-live" : ""}`}>
                      <b>{s.homeTeam ?? match?.homeTeam ?? "Home"} {live ? " vs " : " v "} {s.awayTeam ?? match?.awayTeam ?? "Away"}{live && <strong className="ob-score">{match?.scoreHome ?? 0} — {match?.scoreAway ?? 0}</strong>}</b>
                      {live ? <span className="ob-live-state"><i /> LIVE · {liveClockLabel(match)}</span> : <span className="ob-play-time">{scheduledPlayLabel(match)}</span>}
                      <small>{s.market} · {s.selection} @ {s.oddsLocked?.toFixed(2)}</small>
                    </div>
                  ); })}
                  {bet.selections.length > 2 && <small className="ob-bet-more">+{bet.selections.length - 2} more</small>}
                  <div className="ob-bet-meta">
                    Placed {new Date(bet.placedAt).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {" · "}Stake {currency} {bet.stake.toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="ob-bet-right">
                <div className="ob-bet-return"><span>To win</span><strong>{currency} {bet.potentialReturn.toFixed(2)}</strong></div>
                <ChevronRight size={16} className="ob-bet-chevron" />
              </div>
            </div>
          ))
        )}
      </section>

      {/* Recommended codes carousel — always visible */}
      <RecommendedCarousel picks={picks} onAddToSlip={addLegsToSlip} />
    </main>
  );
}

function OpenBetsStyles() {
  return (
    <style>{`
      /* ── Inline betslip ── */
      .ibs-panel{ padding:18px 20px; margin-bottom:16px; grid-column:1 / -1; }
      .ibs-header{ display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
      .ibs-title{ display:flex; align-items:center; gap:7px; font:800 15px 'DM Sans',sans-serif; color:#FFFFFF; }
      .ibs-count{ display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:20px; padding:0 5px; border-radius:999px; background:var(--orange,#F36600); color:#fff; font-size:11px; font-weight:800; }
      .ibs-picks{ display:flex; flex-direction:column; gap:8px; margin-bottom:14px; }
      .ibs-pick{ display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:10px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); }
      .ibs-pick-info{ flex:1; min-width:0; }
      .ibs-pick-info b{ display:block; font-size:.84rem; color:#FFFFFF; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .ibs-pick-info small{ font-size:.7rem; color:rgba(255,255,255,.4); }
      .ibs-pick-odd{ font-size:.92rem; font-weight:800; color:var(--orange,#F36600); flex-shrink:0; }
      .ibs-remove{ display:flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:6px; background:rgba(255,255,255,.07); color:rgba(255,255,255,.5); cursor:pointer; flex-shrink:0; transition:background .14s; }
      .ibs-remove:hover{ background:rgba(243,102,0,.18); color:var(--orange,#F36600); }
      .ibs-summary{ border-top:1px solid rgba(255,255,255,.07); padding-top:14px; display:flex; flex-direction:column; gap:10px; }
      .ibs-row{ display:flex; align-items:center; justify-content:space-between; font-size:.84rem; color:rgba(255,255,255,.55); }
      .ibs-row b{ font-weight:800; color:#FFFFFF; }
      .ibs-row.highlight b{ color:var(--orange,#F36600); font-size:.95rem; }
      .ibs-stake-label{ display:flex; flex-direction:column; gap:5px; font-size:.78rem; color:rgba(255,255,255,.55); font-weight:600; }
      .ibs-stake-input{ width:100%; padding:10px 12px; border-radius:9px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); color:#FFFFFF; font:700 15px 'DM Sans',sans-serif; outline:none; transition:border-color .15s; }
      .ibs-stake-input:focus{ border-color:var(--orange,#F36600); }
      .ibs-hint{ font-size:.68rem; color:rgba(255,255,255,.32); }
      .ibs-place{ display:flex; align-items:center; justify-content:center; gap:7px; margin-top:2px; }
      .bp-success{ color:var(--live,#00C853) !important; background:rgba(0,200,83,.08) !important; border-color:rgba(0,200,83,.2) !important; }

      /* ── Placed open bets ── */
      .ob-bet-row{ display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 16px; cursor:pointer; border-radius:10px; margin-bottom:4px; background:#0D1528; border:1px solid rgba(255,255,255,.08); box-shadow:0 4px 16px rgba(0,0,0,.4); transition:background .14s,transform .14s; }
      .ob-bet-row:last-child{ margin-bottom:0; }
      .ob-bet-row:hover{ background:rgba(255,255,255,.05); transform:translateY(-1px); }
      .ob-bet-left{ display:flex; align-items:flex-start; gap:10px; flex:1; min-width:0; }
      .ob-bet-icon{ display:flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:8px; background:rgba(243,102,0,.12); color:var(--orange,#F36600); flex-shrink:0; margin-top:2px; }
      .ob-bet-type{ font-size:.7rem; font-weight:800; text-transform:uppercase; letter-spacing:.05em; color:rgba(255,255,255,.38); margin-bottom:5px; }
      .ob-bet-match{ margin-bottom:6px; }
      .ob-bet-match-live{ padding:7px 8px; margin:2px 0 6px; border-left:2px solid #00C853; background:rgba(0,200,83,.07); border-radius:0 7px 7px 0; }
      .ob-bet-match b{ display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
      .ob-score{ color:#fff; background:rgba(243,102,0,.2); border:1px solid rgba(243,102,0,.32); border-radius:5px; padding:2px 6px; font-size:.78rem; }
      .ob-live-state{ display:inline-flex; align-items:center; gap:5px; color:#62e58a; font-size:.67rem; font-weight:800; letter-spacing:.04em; margin-top:3px; }
      .ob-live-state i{ width:6px; height:6px; background:#00C853; border-radius:50%; box-shadow:0 0 0 3px rgba(0,200,83,.14); }
      .ob-play-time{ display:block; color:#f5b37a; font-size:.67rem; font-weight:700; margin-top:3px; }
      .ob-bet-match b{ display:block; font-size:.84rem; color:#FFFFFF; font-weight:700; }
      .ob-bet-match small{ font-size:.7rem; color:rgba(255,255,255,.40); }
      .ob-bet-more{ font-size:.7rem; color:rgba(255,255,255,.38); font-style:italic; }
      .ob-bet-meta{ font-size:.68rem; color:#a9ada2; margin-top:6px; }
      .ob-bet-right{ display:flex; align-items:center; gap:8px; flex-shrink:0; }
      .ob-bet-return{ display:flex; flex-direction:column; align-items:flex-end; gap:2px; }
      .ob-bet-return span{ font-size:.64rem; color:rgba(255,255,255,.38); text-transform:uppercase; letter-spacing:.04em; font-weight:700; }
      .ob-bet-return strong{ font-size:.92rem; font-weight:800; color:var(--orange,#F36600); }
      .ob-bet-chevron{ color:#c2c6ce; flex-shrink:0; }
      .ob-empty{ display:flex; flex-direction:column; align-items:center; text-align:center; padding:34px 20px 26px; }
      .ob-empty-emoji{ font-size:44px; line-height:1; margin-bottom:14px; }
      .ob-empty h3{ font:800 20px 'DM Sans',sans-serif; color:#FFFFFF; margin:0; }
      .ob-empty p{ margin:6px 0 0; color:rgba(255,255,255,.40); font-size:.85rem; }

      /* ── Recommended codes carousel ── */
      .rc-section{ grid-column:1 / -1; padding:18px 20px 14px; }
      .rc-section-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
      .rc-section-head .module-title{ margin:0; padding:0; border:none; }
      .rc-section-head .module-title h3{ display:flex; align-items:center; gap:7px; margin:0; font-size:.88rem; }
      .rc-nav-btns{ display:flex; gap:6px; }
      .rc-nav-btn{ width:30px; height:30px; border-radius:8px; background:rgba(255,255,255,.07); color:rgba(255,255,255,.55); display:flex; align-items:center; justify-content:center; cursor:pointer; border:1px solid rgba(255,255,255,.08); transition:background .14s; }
      .rc-nav-btn:hover{ background:rgba(243,102,0,.14); color:#fff; }
      .rc-carousel{ display:flex; gap:12px; overflow-x:auto; scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch; padding-bottom:8px; scrollbar-width:none; }
      .rc-carousel::-webkit-scrollbar{ display:none; }
      .rc-card{ flex-shrink:0; width:240px; scroll-snap-align:start; border:1px solid rgba(255,255,255,.09); border-radius:14px; padding:14px 14px 12px; background:#0D1528; display:flex; flex-direction:column; gap:9px; }
      .rc-card-head{ display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .rc-code{ display:inline-flex; align-items:center; gap:5px; font-weight:800; color:var(--live,#00C853); font-size:.8rem; }
      .rc-meta{ font-size:.7rem; color:rgba(255,255,255,.40); }
      .rc-meta b{ color:#FFFFFF; }
      .rc-reward{ display:flex; align-items:center; gap:5px; font-size:.68rem; color:var(--live,#00C853); background:rgba(13,166,83,.09); border-radius:7px; padding:5px 8px; }
      .rc-legs{ display:flex; flex-direction:column; gap:6px; flex:1; }
      .rc-leg{ display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:.75rem; padding:5px 0; border-top:1px solid rgba(255,255,255,.05); }
      .rc-leg:first-child{ border-top:none; }
      .rc-leg b{ display:block; color:#FFFFFF; font-size:.76rem; }
      .rc-leg small{ color:rgba(255,255,255,.35); font-size:.66rem; }
      .rc-leg span{ font-weight:800; color:var(--orange,#F36600); flex-shrink:0; font-size:.78rem; }
      .rc-actions{ display:flex; gap:7px; margin-top:4px; }
      .rc-share{ display:flex; align-items:center; gap:5px; padding:8px 11px; border-radius:8px; background:rgba(255,255,255,.07); color:rgba(255,255,255,.45); font-size:.72rem; font-weight:700; cursor:pointer; }
      .rc-add{ flex:1; display:flex; align-items:center; justify-content:center; padding:8px 11px; border-radius:8px; background:var(--live,#00C853); color:#fff; font-size:.76rem; font-weight:800; cursor:pointer; transition:background .15s; }
      .rc-add:hover:not(:disabled){ background:#00a846; }
      .rc-add.rc-added{ background:rgba(0,200,83,.22); color:var(--live,#00C853); cursor:default; }
      .rc-add:disabled{ opacity:.7; cursor:default; }
      .rc-browse{ display:inline-flex; align-items:center; gap:4px; margin-top:10px; font-size:.76rem; }
    `}</style>
  );
}