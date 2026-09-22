import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Bookmark, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock3, Copy, Info, RefreshCw, Share2, Trash2, TrendingUp, Trophy, WalletCards, X, Zap } from "lucide-react";
import api, { ApiError, type Bet, type Match } from "@/lib/api";
import { useSession, pickUserField } from "@/lib/session";
import { currencyForCountry } from "@/lib/countries";
import { COUNTRY_CONFIGS } from "@/lib/withdrawalGate";
import type { Pick } from "./Sportsbook";

const HIDDEN_TICKETS_KEY = "hotbet_hidden_tickets";

function formatPlacedAt(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHrs = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHrs < 24) return `${diffHrs}h ago · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  if (diffDays < 7) return `${d.toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short" })} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return `${d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" })} · ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

function formatKickoff(kickoffAt?: string): string {
  if (!kickoffAt) return "";
  const d = new Date(kickoffAt);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = d.toLocaleDateString([], { weekday: "short", day: "2-digit", month: "short" });
  if (diff <= 0) return `${dateStr} · ${timeStr}`;
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  if (mins < 60) return `Starts in ${mins}m · ${timeStr}`;
  if (hrs < 24) return `Today · ${timeStr}`;
  return `${dateStr} · ${timeStr}`;
}

function readHiddenTickets(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_TICKETS_KEY) || "[]")); }
  catch { return new Set(); }
}

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

const STATUS_LABEL: Record<Bet["status"], string> = {
  PENDING: "Pending", WON: "Won", LOST: "Lost", VOID: "Void", CASHED_OUT: "Cashed Out",
};
const STATUS_CLASS: Record<Bet["status"], string> = {
  PENDING: "bh-pending", WON: "bh-won", LOST: "bh-lost", VOID: "bh-void", CASHED_OUT: "bh-cashed",
};
const STATUS_FILTERS: { value: "ALL" | Bet["status"]; label: string }[] = [
  { value: "ALL", label: "Bet Status: All" },
  { value: "PENDING", label: "Pending" },
  { value: "WON", label: "Won" },
  { value: "LOST", label: "Lost" },
  { value: "CASHED_OUT", label: "Cashed Out" },
  { value: "VOID", label: "Void" },
];
const RESULT_FILTERS = [
  { value: "ALL", label: "Bet Result: All" },
  { value: "WIN", label: "Winning bets" },
  { value: "LOSS", label: "Losing bets" },
];

function dayKey(iso: string): string { return new Date(iso).toISOString().slice(0, 10); }
function dayLabel(key: string): { day: string; mon: string } {
  const d = new Date(`${key}T00:00:00`);
  return { day: d.toLocaleDateString(undefined, { day: "2-digit" }), mon: d.toLocaleDateString(undefined, { month: "short" }) };
}

// ---------------------------------------------------------------------------
// Bet history card
// ---------------------------------------------------------------------------
function HistoryCard({ bet, scores, curr }: { bet: Bet; scores: Record<string, Match>; curr: string }) {
  const [, setLocation] = useLocation();
  const isMultiple = bet.selections.length > 1;
  const visible = bet.selections.slice(0, 3);
  const rest = bet.selections.length - visible.length;
  const totalReturn = bet.status === "WON" || bet.status === "CASHED_OUT" ? bet.potentialReturn : 0;
  const won = bet.status === "WON";
  const openTicket = () => setLocation(`/bets/${bet.id}`);
  return (
    <div className="bh-card" onClick={openTicket} onKeyDown={(e) => e.key === "Enter" && openTicket()} role="button" tabIndex={0}>
      <div className="bh-card-top">
        <div>
          <span className="bh-type">{isMultiple ? "Multiple" : "Singles"}</span>
          <span className="bh-ticket-id">Ticket #{bet.id.slice(-6).toUpperCase()}</span>
        </div>
        <span className={`bh-pill ${STATUS_CLASS[bet.status]}`}>{won && <Trophy size={12} />} {STATUS_LABEL[bet.status]}</span>
      </div>
      <div className="bh-card-body">
        <div className="bh-ticket-meta">
          <span><CalendarDays size={13} /> {bet.selections.length} pick{bet.selections.length !== 1 ? "s" : ""}</span>
          <span>{formatPlacedAt(bet.placedAt)}</span>
        </div>
        <div className="bh-totals">
          <div><span>Stake</span><b>{curr} {bet.stake.toFixed(2)}</b></div>
          <div><span>Total odds</span><b>{bet.totalOdds.toFixed(2)}×</b></div>
          <div><span>Potential return</span><b className={won ? "bh-return-won" : ""}>{curr} {totalReturn.toFixed(2)}</b></div>
        </div>
        <div className="bh-selection-list">
          {visible.map((s, i) => {
            const match = s.homeTeam && s.awayTeam ? `${s.homeTeam} v ${s.awayTeam}` : s.market;
            const result = String(s.result ?? "").toLowerCase();
            const resultClass = result.includes("won") || result.includes("win") ? "won" : result.includes("lost") || result.includes("lose") ? "lost" : "pending";
            return (
              <div className="bh-selection" key={s.id ?? i}>
                <span className={`bh-selection-state ${resultClass}`}>{resultClass === "won" ? <CheckCircle2 size={13} /> : resultClass === "lost" ? "×" : "•"}</span>
                <div className="bh-selection-copy">
                  <b>{match}</b>
                  <span>{s.market} · <strong>{s.selection}</strong></span>
                </div>
                <strong className="bh-selection-odds">{s.oddsLocked?.toFixed(2)}</strong>
              </div>
            );
          })}
          {rest > 0 && <div className="bh-more">…and {rest} other match{rest > 1 ? "es" : ""}</div>}
        </div>
        <div className="bh-card-foot">
          <span className="bh-placed-time">Tap to view full ticket</span>
          <span className="bh-view-ticket">View ticket <ChevronRight size={14} /></span>
        </div>
      </div>
    </div>
  );
}

function OpenBetCard({ bet, curr, scores, onOpen }: { bet: Bet; curr: string; scores: Record<string, Match>; onOpen: () => void }) {
  const [expanded, setExpanded] = useState(true);
  const isMultiple = bet.selections.length > 1;
  return (
    <div className="bh-card" onClick={onOpen} role="button" tabIndex={0} style={{ cursor: "pointer" }}>
      <div className="bh-card-head bh-open-head">
        <div>
          <span>{isMultiple ? "Multiple" : "Singles"}</span>
          <span className="bh-ticket-id">Ticket #{bet.id.slice(-6).toUpperCase()} · {bet.selections.length} pick{bet.selections.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="bh-open-actions">
          <button type="button" className="bh-share" onClick={e => { e.stopPropagation(); navigator.clipboard?.writeText(bet.id).catch(() => undefined); }} aria-label="Copy ticket ID">
            <Copy size={14} />
          </button>
          <span className="bh-pill bh-pending">Pending</span>
        </div>
      </div>
      <div className="bh-card-body">
        {expanded && (
          <div className="bh-legs">
            {bet.selections.map((s, i) => (
              <div className="bh-leg" key={s.id ?? i}>
                <span className="bh-leg-check">•</span>
                <div className="bh-leg-info">
                  <b>{s.homeTeam ?? "Home"} vs {s.awayTeam ?? "Away"}</b>
                  <small>{s.market} · <strong>{s.selection}</strong> @ {s.oddsLocked?.toFixed(2)}{scores[s.matchId]?.kickoffAt ? ` · ${formatKickoff(scores[s.matchId].kickoffAt)}` : ""}</small>
                </div>
              </div>
            ))}
          </div>
        )}
        <button type="button" className="bh-toggle-details" onClick={e => { e.stopPropagation(); setExpanded((v) => !v); }}>
          {expanded ? "Hide Details" : "Show Details"}
        </button>
        <div className="bh-totals bh-open-totals">
          <div><span>Stake</span><b>{curr} {bet.stake.toFixed(2)}</b></div>
          <div><span>Pot. Win</span><b style={{ color: "var(--live,#00C853)" }}>{curr} {bet.potentialReturn.toFixed(2)}</b></div>
        </div>
        <div className="bh-card-foot" style={{ borderTop: "1px solid rgba(255,255,255,.06)", marginTop: 10, paddingTop: 10 }}>
          <span className="bh-placed-time">{formatPlacedAt(bet.placedAt)}</span>
          <span className="bh-view-ticket">View ticket <ChevronRight size={14} /></span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recommended codes carousel (lives in Open Bets tab)
// ---------------------------------------------------------------------------
interface RecommendedLeg {
  matchId: string; match: string; homeTeam: string; awayTeam: string;
  market: string; selection: string; odd: number; label: string;
}
interface RecommendedCode { code: string; folds: number; totalOdds: number; legs: RecommendedLeg[]; }

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

function RecommendedCodeCard({ code, picks, onAdd, added }: { code: RecommendedCode; picks: Pick[]; onAdd: () => void; added: boolean }) {
  const alreadyIn = code.legs.every((l) => picks.some((p) => p.id === l.matchId && p.market === l.market && p.selection === l.selection));
  return (
    <div className="rc-card">
      <div className="rc-card-head">
        <span className="rc-code"><Bookmark size={11} /> {code.code}</span>
        <span className="rc-meta">{code.folds} folds · <b>{code.totalOdds.toFixed(2)}×</b></span>
      </div>
      <div className="rc-reward"><TrendingUp size={11} /> 1UP/2UP rewards you early when your team leads!</div>
      <div className="rc-legs">
        {code.legs.map((leg, i) => (
          <div className="rc-leg" key={i}>
            <div><b>{leg.label}</b><small>{leg.match}</small></div>
            <span>{leg.odd.toFixed(2)}</span>
          </div>
        ))}
      </div>
      <div className="rc-actions">
        <button type="button" className="rc-share" onClick={() => navigator.clipboard?.writeText(code.code).catch(() => undefined)}>
          <Share2 size={12} /> Share
        </button>
        <button type="button" className={`rc-add${alreadyIn || added ? " rc-added" : ""}`} onClick={onAdd} disabled={alreadyIn || added}>
          {alreadyIn || added ? "✓ Added" : "Add to Slip"}
        </button>
      </div>
    </div>
  );
}

function RecommendedCarousel({ picks, onAddLegs }: { picks: Pick[]; onAddLegs: (legs: RecommendedLeg[]) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [addedCode, setAddedCode] = useState<string | null>(null);
  const scroll = (dir: "left" | "right") => scrollRef.current?.scrollBy({ left: dir === "right" ? 260 : -260, behavior: "smooth" });
  const handleAdd = (code: RecommendedCode) => {
    onAddLegs(code.legs);
    setAddedCode(code.code);
    setTimeout(() => setAddedCode(null), 2000);
  };
  return (
    <div className="rc-section">
      <div className="rc-section-head">
        <span className="rc-section-title"><Bookmark size={14} /> Recommended Codes</span>
        <div className="rc-nav-btns">
          <button type="button" className="rc-nav-btn" onClick={() => scroll("left")}><ChevronLeft size={15} /></button>
          <button type="button" className="rc-nav-btn" onClick={() => scroll("right")}><ChevronRight size={15} /></button>
        </div>
      </div>
      <div className="rc-carousel" ref={scrollRef}>
        {RECOMMENDED_CODES.map((c) => (
          <RecommendedCodeCard key={c.code} code={c} picks={picks} onAdd={() => handleAdd(c)} added={addedCode === c.code} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline betslip panel (shown at top of Open Bets tab when picks exist)
// ---------------------------------------------------------------------------
function InlineBetslip({ picks, setPicks, onPlace, curr }: { picks: Pick[]; setPicks: (p: Pick[]) => void; onPlace: (stake: number) => Promise<void>; curr: string }) {
  const countryKey = curr === "NGN" ? "NG" : "GH";
  const cfg = COUNTRY_CONFIGS[countryKey];
  const MIN_STAKE = cfg.minStake;
  const MAX_STAKE = curr === "NGN" ? 5_000_000 : 20_000;
  const [stake, setStake] = useState(MIN_STAKE);
  const [placing, setPlacing] = useState(false);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    api.wallet.getWallet().then((w) => {
      const raw = w.data?.balance ?? w.data?.availableBalance;
      const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : null;
      if (n !== null && Number.isFinite(n)) setBalance(n);
    }).catch(() => undefined);
  }, []);

  const totalOdds = picks.reduce((a, p) => a * p.odd, 1);
  const potentialReturn = stake * totalOdds;
  const stakeInvalid = stake < MIN_STAKE || stake > MAX_STAKE || (balance !== null && stake > balance);
  const remove = (pick: Pick) => setPicks(picks.filter((p) => !(p.id === pick.id && p.market === pick.market && p.selection === pick.selection)));

  const place = async () => {
    setNotice(null);
    if (stakeInvalid) { setNotice({ type: "error", text: balance !== null && stake > balance ? "Stake exceeds your balance." : `Stake must be ${curr} ${MIN_STAKE.toLocaleString()}–${curr} ${MAX_STAKE.toLocaleString()}.` }); return; }
    setPlacing(true);
    try { await onPlace(stake); setPicks([]); setNotice({ type: "success", text: "Bet placed successfully!" }); }
    catch (e) { setNotice({ type: "error", text: e instanceof ApiError ? e.message : "Could not place bet. Please try again." }); }
    finally { setPlacing(false); }
  };

  return (
    <div className="ibs-panel">
      <div className="ibs-header">
        <span className="ibs-title"><WalletCards size={14} /> Betslip <b className="ibs-count">{picks.length}</b></span>
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
            <button className="ibs-remove" type="button" onClick={() => remove(p)}><X size={13} /></button>
          </div>
        ))}
      </div>
      <div className="ibs-summary">
        <div className="ibs-row"><span>Total odds</span><b>{totalOdds.toFixed(2)}</b></div>
        <label className="ibs-stake-label">
          <span>Stake ({curr})</span>
          <input type="number" min={MIN_STAKE} max={MAX_STAKE} value={stake} onChange={(e) => setStake(Number(e.target.value) || 0)} className="ibs-stake-input" />
        </label>
        <div className="ibs-hint">Min {curr} {MIN_STAKE.toLocaleString()} · Max {curr} {MAX_STAKE.toLocaleString()}{balance !== null && ` · Balance ${curr} ${balance.toFixed(2)}`}</div>
        <div className="ibs-row highlight"><span>Potential return</span><b>{curr} {potentialReturn.toFixed(2)}</b></div>
        <button className="gold-button full ibs-place" onClick={place} disabled={placing || stakeInvalid} type="button">
          {placing ? "Placing…" : "Place Bet"} <Zap size={15} />
        </button>
        {notice && <small className={notice.type === "error" ? "auth-notice" : "auth-notice ibs-success"}>{notice.text}</small>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main BetsCenter
// ---------------------------------------------------------------------------
export default function BetsCenter({
  defaultTab = "open",
  picks = [],
  setPicks = () => undefined,
  onPlace = async () => undefined,
}: {
  defaultTab?: "open" | "history";
  picks?: Pick[];
  setPicks?: (p: Pick[]) => void;
  onPlace?: (stake: number) => Promise<void>;
}) {
  const [, setLocation] = useLocation();
  const { user } = useSession();
  const { code: curr } = currencyForCountry(pickUserField(user, "country", "countryCode", "country_code"));

  const [tab, setTab] = useState<"open" | "history">(defaultTab);
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | Bet["status"]>("ALL");
  const [resultFilter, setResultFilter] = useState("ALL");
  const [openSubFilter, setOpenSubFilter] = useState<"all" | "cashout" | "live">("all");
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [matchScores, setMatchScores] = useState<Record<string, Match>>({});
  const hiddenTickets = useMemo(readHiddenTickets, []);

  useEffect(() => { setTab(defaultTab); }, [defaultTab]);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const page = await api.bets.getMyBets(0, 50);
      setBets(getBetList(page).filter((b) => !hiddenTickets.has(b.id)));
    } catch (e) {
      setError(e instanceof ApiError && e.status === 401 ? "Sign in to view your bets." : "Bets are temporarily unavailable.");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openBets = useMemo(() => bets.filter(isOpenBet), [bets]);
  const settledBets = useMemo(() => bets, [bets]);

  useEffect(() => {
    const ids = Array.from(new Set(settledBets.flatMap((b) => b.selections.map((s) => s.matchId)).filter(Boolean)));
    const missing = ids.filter((mid) => !(mid in matchScores));
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.allSettled(missing.map((mid) => api.matches.getById(mid))).then((results) => {
      if (cancelled) return;
      setMatchScores((prev) => {
        const next = { ...prev };
        results.forEach((r, i) => { if (r.status === "fulfilled") next[missing[i]] = r.value.data; });
        return next;
      });
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledBets]);

  const filteredSettled = useMemo(() => {
    let list = settledBets;
    if (statusFilter !== "ALL") list = list.filter((b) => b.status === statusFilter);
    if (resultFilter === "WIN") list = list.filter((b) => b.status === "WON" || b.status === "CASHED_OUT");
    if (resultFilter === "LOSS") list = list.filter((b) => b.status === "LOST");
    return list;
  }, [settledBets, statusFilter, resultFilter]);

  const filteredOpen = useMemo(() => openSubFilter === "all" ? openBets : [], [openBets, openSubFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Bet[]>();
    for (const b of filteredSettled) {
      const key = dayKey(b.placedAt);
      const list = map.get(key) ?? [];
      list.push(b); map.set(key, list);
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
  }, [filteredSettled]);

  const clearFilters = () => { setStatusFilter("ALL"); setResultFilter("ALL"); };

  // Add recommended code legs directly as picks
  const addLegsToSlip = (legs: { matchId: string; match: string; homeTeam: string; awayTeam: string; market: string; selection: string; odd: number }[]) => {
    const newPicks: Pick[] = legs.map((l) => ({ id: l.matchId, match: l.match, homeTeam: l.homeTeam, awayTeam: l.awayTeam, market: l.market, selection: l.selection, odd: l.odd }));
    const merged = [...picks];
    for (const p of newPicks) {
      if (!merged.some((x) => x.id === p.id && x.market === p.market && x.selection === p.selection)) merged.push(p);
    }
    setPicks(merged);
  };

  return (
    <div className="bc-page">
      <BetsCenterStyles />

      <div className="bc-tabs">
        <button type="button" className={tab === "open" ? "active" : ""} onClick={() => { setTab("open"); setLocation("/open-bets"); }}>
          Open Bets {picks.length > 0 && <span className="bc-tab-badge">{picks.length}</span>}
        </button>
        <button type="button" className={tab === "history" ? "active" : ""} onClick={() => { setTab("history"); setLocation("/bets"); }}>
          Bet History
        </button>
      </div>

      {/* ── OPEN BETS TAB ── */}
      {tab === "open" && (
        <div className="bc-body">
          {/* Inline betslip — always at top when picks exist */}
          {picks.length > 0 && (
            <div className="bc-flat-list">
              <InlineBetslip picks={picks} setPicks={setPicks} onPlace={onPlace} curr={curr} />
            </div>
          )}

          {/* Placed open bets from API */}
          {loading ? (
            <p className="muted bc-pad">Loading…</p>
          ) : error ? (
            <div className="bc-pad">
              <p className="muted">{error}</p>
              <Link href="/login" className="gold-button" style={{ marginTop: 12, display: "inline-flex" }}>Sign in</Link>
            </div>
          ) : (
            <>
              {openBets.length > 0 && (
                <>
                  {!bannerDismissed && (
                    <div className="bc-auto-banner">
                      <span><Info size={13} /> Set a rule to <b>Auto Cashout</b> your bet.</span>
                      <button type="button" onClick={() => setBannerDismissed(true)} aria-label="Dismiss"><X size={14} /></button>
                    </div>
                  )}
                  <div className="bc-toolbar bc-open-toolbar">
                    {(["all", "cashout", "live"] as const).map((v) => (
                      <button key={v} type="button" className={openSubFilter === v ? "bc-chip active" : "bc-chip"} onClick={() => setOpenSubFilter(v)}>
                        {v === "all" ? "All" : v === "cashout" ? "Cashout Available" : "Live Games"}
                      </button>
                    ))}
                  </div>
                  <div className="bc-flat-list">
                    {filteredOpen.map((bet) => <OpenBetCard key={bet.id} bet={bet} curr={curr} scores={matchScores} onOpen={() => setLocation(`/bets/${bet.id}`)} />)}
                  </div>
                </>
              )}

              {openBets.length === 0 && picks.length === 0 && (
                <div className="ob-empty">
                  <span className="ob-empty-emoji">🎟️⚽</span>
                  <h3>No open bets yet</h3>
                  <p>Click odds on any match — your selections appear here to stake.</p>
                  <Link href="/" className="gold-button" style={{ marginTop: 12, display: "inline-flex" }}>Browse matches</Link>
                </div>
              )}
            </>
          )}

          {/* Recommended codes carousel — always visible on open tab */}
          <RecommendedCarousel picks={picks} onAddLegs={addLegsToSlip} />
        </div>
      )}

      {/* ── BET HISTORY TAB ── */}
      {tab === "history" && (
        <>
          <div className="bc-toolbar">
            <label className="bh-filter">
              <ChevronDown size={13} />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "ALL" | Bet["status"])}>
                {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
            <label className="bh-filter">
              <ChevronDown size={13} />
              <select value={resultFilter} onChange={(e) => setResultFilter(e.target.value)}>
                {RESULT_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
            <button type="button" className="bc-icon-btn" onClick={load} aria-label="Refresh"><RefreshCw size={15} /></button>
            <button type="button" className="bc-icon-btn" onClick={clearFilters} aria-label="Clear filters"><Trash2 size={15} /></button>
          </div>
          <div className="bc-body">
            {loading ? (
              <p className="muted bc-pad">Loading…</p>
            ) : error ? (
              <div className="bc-pad"><p className="muted">{error}</p></div>
            ) : filteredSettled.length === 0 ? (
              <div className="ob-empty">
                <p className="muted">{settledBets.length === 0 ? "Bets will appear here once placed." : "No bets match this filter."}</p>
              </div>
            ) : (
              <div className="bc-days">
                {grouped.map(([key, dayBets]) => {
                  const { day, mon } = dayLabel(key);
                  return (
                    <div className="bh-day" key={key}>
                      <div className="bh-day-label"><CalendarDays size={13} /><span>{mon}</span><b>{day}</b></div>
                      <div className="bh-day-cards">
                        {dayBets.map((bet) => <HistoryCard key={bet.id} bet={bet} scores={matchScores} curr={curr} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function BetsCenterStyles() {
  return (
    <style>{`
      .bc-page{ background:radial-gradient(circle at 86% 0%,rgba(243,102,0,.10),transparent 30%),#060A12; min-height:70vh; padding:24px 0 80px; }

      .bc-tabs{ display:flex; gap:5px; max-width:720px; margin:0 auto 16px; padding:5px; background:rgba(255,255,255,.055); border:1px solid rgba(255,255,255,.09); border-radius:15px; overflow:hidden; }
      .bc-tabs button{ flex:1; padding:12px 8px; font-size:.76rem; font-weight:800; color:rgba(255,255,255,.48); cursor:pointer; border-radius:10px; transition:background .15s,color .15s,box-shadow .15s; display:flex; align-items:center; justify-content:center; gap:6px; }
      .bc-tabs button.active{ background:linear-gradient(135deg,#f36600,#d94d00); color:#fff; box-shadow:0 6px 18px rgba(243,102,0,.25); }
      .bc-tab-badge{ display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:18px; padding:0 4px; border-radius:999px; background:rgba(255,255,255,.25); color:#fff; font-size:10px; font-weight:800; }
      .bc-tabs button.active .bc-tab-badge{ background:rgba(255,255,255,.3); }

      .bc-toolbar{ display:flex; align-items:center; gap:8px; max-width:720px; margin:0 auto 14px; padding:0 16px; flex-wrap:wrap; }
      .bh-filter{ display:flex; align-items:center; gap:6px; padding:9px 12px; border-radius:10px; border:1px solid rgba(255,255,255,.10); background:rgba(13,21,40,.82); }
      .bh-filter select{ border:0; background:transparent; font-size:.72rem; font-weight:700; color:#FFFFFF; outline:0; }
      .bh-filter option{ background:#0d1528; color:#fff; }
      .bc-icon-btn{ width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,.07); color:rgba(255,255,255,.58); cursor:pointer; border:1px solid rgba(255,255,255,.08); transition:background .15s,color .15s; }
      .bc-icon-btn:hover{ background:rgba(243,102,0,.14); color:#fff; }

      .bc-auto-banner{ display:flex; align-items:center; justify-content:space-between; gap:10px; max-width:720px; margin:0 auto 12px; padding:10px 14px; border-radius:10px; background:rgba(0,200,83,.08); color:var(--live,#00C853); font-size:.76rem; font-weight:700; border:1px solid rgba(0,200,83,.15); }
      .bc-auto-banner span{ display:flex; align-items:center; gap:6px; }
      .bc-auto-banner button{ color:#8d9288; cursor:pointer; }

      .bc-open-toolbar{ background:transparent; border:none; padding-top:0; }
      .bc-chip{ padding:8px 14px; border-radius:999px; background:rgba(255,255,255,.07); color:rgba(255,255,255,.55); font-size:.72rem; font-weight:700; cursor:pointer; border:1px solid rgba(255,255,255,.08); }
      .bc-chip.active{ background:rgba(255,255,255,.18); color:#fff; }

      .bc-pad{ max-width:720px; margin:0 auto; padding:28px 16px; }
      .bc-body{ padding:0 16px 20px; }

      .ob-empty{ display:flex; flex-direction:column; align-items:center; text-align:center; padding:34px 16px 20px; }
      .ob-empty-emoji{ font-size:44px; line-height:1; margin-bottom:14px; }
      .ob-empty h3{ font:800 20px 'DM Sans',sans-serif; color:#FFFFFF; margin:0 0 6px; }
      .ob-empty p{ margin:0; color:rgba(255,255,255,.40); font-size:.85rem; }

      .bc-days,.bc-flat-list{ display:flex; flex-direction:column; gap:12px; max-width:720px; margin:0 auto; padding:0; }
      .bh-day-label{ display:flex; align-items:center; gap:7px; color:rgba(255,255,255,.42); font-size:.67rem; font-weight:800; text-transform:uppercase; letter-spacing:.08em; margin:0 2px 9px; }
      .bh-day-label b{ color:#FFFFFF; font-size:.78rem; }
      .bh-day-cards{ display:flex; flex-direction:column; gap:10px; }

      .bh-card{ display:block; width:100%; border-radius:16px; overflow:hidden; background:linear-gradient(145deg,rgba(18,29,51,.98),rgba(9,16,31,.98)); cursor:pointer; box-shadow:0 8px 24px rgba(0,0,0,.26); border:1px solid rgba(255,255,255,.09); color:inherit; transition:transform .16s,box-shadow .16s,border-color .16s; }
      .bh-card:hover{ transform:translateY(-2px); box-shadow:0 14px 30px rgba(0,0,0,.36); border-color:rgba(243,102,0,.28); }
      .bh-card-head{ display:flex; align-items:center; justify-content:space-between; padding:12px 16px; font-size:.76rem; font-weight:800; color:#FFFFFF; }
      .bh-card-head.bh-open-head{ background:rgba(255,255,255,.055); }
      .bh-share{ display:flex; color:rgba(255,255,255,.48); cursor:pointer; padding:5px; border-radius:7px; }
      .bh-share:hover{ background:rgba(255,255,255,.08); color:#fff; }
      .bh-open-actions{ display:flex; align-items:center; gap:8px; }
      .bh-card-top{ display:flex; align-items:center; justify-content:space-between; gap:10px; padding:15px 16px 0; }
      .bh-type{ font-size:.82rem; font-weight:800; color:#FFFFFF; }
      .bh-ticket-id{ display:block; margin-top:3px; color:rgba(255,255,255,.38); font-size:.62rem; font-weight:700; letter-spacing:.04em; }
      .bh-pill{ display:flex; align-items:center; gap:4px; padding:5px 11px; border-radius:999px; font-size:.66rem; font-weight:800; text-transform:uppercase; letter-spacing:.04em; color:#fff; background:rgba(255,255,255,.20); flex-shrink:0; }
      .bh-pill.bh-won{ background:var(--live,#00C853); }
      .bh-pill.bh-lost{ background:#6b7280; }
      .bh-pill.bh-pending{ background:var(--orange,#F36600); }
      .bh-pill.bh-void{ background:#8d9288; }
      .bh-pill.bh-cashed{ background:#0da653; }
      .bh-card-body{ padding:13px 16px 15px; }
      .bh-ticket-meta{ display:flex; justify-content:space-between; gap:10px; margin-bottom:13px; color:rgba(255,255,255,.42); font-size:.66rem; font-weight:700; }
      .bh-ticket-meta span{ display:flex; align-items:center; gap:5px; }
      .bh-totals{ display:grid; grid-template-columns:repeat(3,1fr); gap:8px; padding:12px 0; margin-bottom:12px; border-top:1px solid rgba(255,255,255,.07); border-bottom:1px solid rgba(255,255,255,.07); }
      .bh-totals div{ display:flex; flex-direction:column; gap:3px; }
      .bh-totals span{ font-size:.62rem; color:rgba(255,255,255,.38); text-transform:uppercase; letter-spacing:.04em; }
      .bh-totals b{ font-size:.83rem; color:#FFFFFF; }
      .bh-return-won{ color:var(--live,#00C853); }
      .bh-selection-list{ display:flex; flex-direction:column; gap:8px; }
      .bh-selection{ display:flex; align-items:center; gap:9px; padding:9px 10px; border-radius:10px; background:rgba(255,255,255,.045); }
      .bh-selection-state{ display:grid; place-items:center; width:20px; height:20px; border-radius:50%; flex-shrink:0; font-size:.82rem; font-weight:900; background:rgba(243,102,0,.16); color:var(--orange-hi,#FF7A1A); }
      .bh-selection-state.won{ background:rgba(0,200,83,.16); color:var(--live,#00C853); }
      .bh-selection-state.lost{ background:rgba(229,57,53,.16); color:#ff7370; }
      .bh-selection-copy{ display:flex; flex-direction:column; gap:3px; min-width:0; flex:1; }
      .bh-selection-copy b{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:.76rem; color:#fff; }
      .bh-selection-copy span{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:rgba(255,255,255,.44); font-size:.67rem; }
      .bh-selection-copy strong{ color:rgba(255,255,255,.7); font-weight:800; }
      .bh-selection-odds{ flex-shrink:0; color:var(--orange-hi,#FF7A1A); font-size:.8rem; }
      .bh-more{ font-size:.72rem; color:rgba(255,255,255,.38); padding-left:13px; }
      .bh-card-foot{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin-top:12px; padding-top:10px; border-top:1px solid rgba(255,255,255,.06); }
      .bh-placed-time{ font-size:.68rem; color:#a9ada2; font-weight:600; }
      .bh-view-ticket{ display:flex; align-items:center; gap:3px; color:var(--orange-hi,#FF7A1A); font-size:.72rem; font-weight:800; }
      .bh-open-totals{ border-top:1px dashed rgba(255,255,255,.08); border-bottom:none; margin-top:12px; padding-top:12px; margin-bottom:12px; }
      .bh-legs{ display:flex; flex-direction:column; gap:10px; margin-bottom:6px; }
      .bh-leg{ display:flex; gap:10px; align-items:flex-start; padding:9px 10px; border-radius:10px; background:rgba(255,255,255,.045); }
      .bh-leg-check{ width:18px; height:18px; border-radius:50%; background:rgba(243,102,0,.18); color:var(--orange-hi,#FF7A1A); font-size:.8rem; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:1px; }
      .bh-leg-info b{ display:block; font-size:.82rem; color:#FFFFFF; }
      .bh-leg-info small{ display:block; color:rgba(255,255,255,.40); font-size:.7rem; }
      .bh-leg-info strong{ color:rgba(255,255,255,.7); }
      .bh-toggle-details{ color:var(--orange-hi,#FF7A1A); font-size:.72rem; font-weight:800; cursor:pointer; padding:6px 0; }

      /* ── Inline betslip ── */
      .ibs-panel{ background:linear-gradient(145deg,rgba(18,29,51,.98),rgba(9,16,31,.98)); border:1px solid rgba(243,102,0,.2); border-radius:16px; padding:16px 18px; }
      .ibs-header{ display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; }
      .ibs-title{ display:flex; align-items:center; gap:7px; font:800 14px 'DM Sans',sans-serif; color:#FFFFFF; }
      .ibs-count{ display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:20px; padding:0 5px; border-radius:999px; background:var(--orange,#F36600); color:#fff; font-size:11px; font-weight:800; }
      .ibs-picks{ display:flex; flex-direction:column; gap:7px; margin-bottom:12px; }
      .ibs-pick{ display:flex; align-items:center; gap:10px; padding:9px 11px; border-radius:10px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); }
      .ibs-pick-info{ flex:1; min-width:0; }
      .ibs-pick-info b{ display:block; font-size:.82rem; color:#FFFFFF; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .ibs-pick-info small{ font-size:.68rem; color:rgba(255,255,255,.4); }
      .ibs-pick-odd{ font-size:.9rem; font-weight:800; color:var(--orange,#F36600); flex-shrink:0; }
      .ibs-remove{ display:flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:6px; background:rgba(255,255,255,.07); color:rgba(255,255,255,.5); cursor:pointer; flex-shrink:0; }
      .ibs-remove:hover{ background:rgba(243,102,0,.18); color:var(--orange,#F36600); }
      .ibs-summary{ border-top:1px solid rgba(255,255,255,.07); padding-top:12px; display:flex; flex-direction:column; gap:9px; }
      .ibs-row{ display:flex; align-items:center; justify-content:space-between; font-size:.82rem; color:rgba(255,255,255,.55); }
      .ibs-row b{ font-weight:800; color:#FFFFFF; }
      .ibs-row.highlight b{ color:var(--orange,#F36600); font-size:.92rem; }
      .ibs-stake-label{ display:flex; flex-direction:column; gap:4px; font-size:.76rem; color:rgba(255,255,255,.55); font-weight:600; }
      .ibs-stake-input{ width:100%; padding:9px 11px; border-radius:9px; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); color:#FFFFFF; font:700 15px 'DM Sans',sans-serif; outline:none; transition:border-color .15s; }
      .ibs-stake-input:focus{ border-color:var(--orange,#F36600); }
      .ibs-hint{ font-size:.66rem; color:rgba(255,255,255,.30); }
      .ibs-place{ display:flex; align-items:center; justify-content:center; gap:7px; }
      .ibs-success{ color:var(--live,#00C853) !important; background:rgba(0,200,83,.08) !important; border-color:rgba(0,200,83,.2) !important; }

      /* ── Recommended carousel ── */
      .rc-section{ max-width:720px; margin:20px auto 0; }
      .rc-section-head{ display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
      .rc-section-title{ display:flex; align-items:center; gap:6px; font:800 13px 'DM Sans',sans-serif; color:rgba(255,255,255,.7); text-transform:uppercase; letter-spacing:.04em; }
      .rc-nav-btns{ display:flex; gap:5px; }
      .rc-nav-btn{ width:28px; height:28px; border-radius:7px; background:rgba(255,255,255,.07); color:rgba(255,255,255,.55); display:flex; align-items:center; justify-content:center; cursor:pointer; border:1px solid rgba(255,255,255,.08); }
      .rc-nav-btn:hover{ background:rgba(243,102,0,.14); color:#fff; }
      .rc-carousel{ display:flex; gap:10px; overflow-x:auto; scroll-snap-type:x mandatory; -webkit-overflow-scrolling:touch; padding-bottom:6px; scrollbar-width:none; }
      .rc-carousel::-webkit-scrollbar{ display:none; }
      .rc-card{ flex-shrink:0; width:230px; scroll-snap-align:start; border:1px solid rgba(255,255,255,.09); border-radius:14px; padding:13px 13px 11px; background:#0D1528; display:flex; flex-direction:column; gap:8px; }
      .rc-card-head{ display:flex; align-items:center; justify-content:space-between; gap:8px; }
      .rc-code{ display:inline-flex; align-items:center; gap:4px; font-weight:800; color:var(--live,#00C853); font-size:.78rem; }
      .rc-meta{ font-size:.68rem; color:rgba(255,255,255,.38); }
      .rc-meta b{ color:#FFFFFF; }
      .rc-reward{ display:flex; align-items:center; gap:5px; font-size:.66rem; color:var(--live,#00C853); background:rgba(13,166,83,.09); border-radius:6px; padding:4px 7px; }
      .rc-legs{ display:flex; flex-direction:column; gap:5px; flex:1; }
      .rc-leg{ display:flex; align-items:center; justify-content:space-between; gap:8px; padding:4px 0; border-top:1px solid rgba(255,255,255,.05); }
      .rc-leg:first-child{ border-top:none; }
      .rc-leg b{ display:block; color:#FFFFFF; font-size:.74rem; }
      .rc-leg small{ color:rgba(255,255,255,.33); font-size:.64rem; }
      .rc-leg span{ font-weight:800; color:var(--orange,#F36600); flex-shrink:0; font-size:.76rem; }
      .rc-actions{ display:flex; gap:6px; margin-top:2px; }
      .rc-share{ display:flex; align-items:center; gap:4px; padding:7px 10px; border-radius:7px; background:rgba(255,255,255,.07); color:rgba(255,255,255,.4); font-size:.7rem; font-weight:700; cursor:pointer; }
      .rc-add{ flex:1; display:flex; align-items:center; justify-content:center; padding:7px 10px; border-radius:7px; background:var(--live,#00C853); color:#fff; font-size:.74rem; font-weight:800; cursor:pointer; transition:background .15s; }
      .rc-add:hover:not(:disabled){ background:#00a846; }
      .rc-add.rc-added{ background:rgba(0,200,83,.2); color:var(--live,#00C853); cursor:default; }
      .rc-add:disabled{ opacity:.7; cursor:default; }

      @media(max-width:560px){
        .bc-page{ padding-top:16px; }
        .bc-tabs{ margin-left:12px; margin-right:12px; }
        .bc-toolbar{ margin-left:12px; margin-right:12px; }
        .bc-body{ padding-left:12px; padding-right:12px; }
      }
    `}</style>
  );
}