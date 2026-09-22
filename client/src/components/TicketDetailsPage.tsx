import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft, Headphones, Home, Trophy, CheckCircle2 } from "lucide-react";
import { useSession, pickUserField } from "@/lib/session";
import { currencyForCountry } from "@/lib/countries";
import api, { ApiError, type Bet, type Match } from "@/lib/api";
import TrophyCelebration from "./TrophyCelebration";

const HIDDEN_TICKETS_KEY = "hotbet_hidden_tickets";

function hideTicket(id: string) {
  try {
    const list = JSON.parse(localStorage.getItem(HIDDEN_TICKETS_KEY) || "[]") as string[];
    if (!list.includes(id)) list.push(id);
    localStorage.setItem(HIDDEN_TICKETS_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

function verifyCode(bet: Bet): string {
  const raw = bet.id.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return `GH${raw.slice(0, 4)}${raw.slice(-6)}`;
}

const STATUS_TONE: Record<Bet["status"], string> = {
  PENDING: "td-pending", WON: "td-won", LOST: "td-lost", VOID: "td-void", CASHED_OUT: "td-cashed",
};
const STATUS_LABEL: Record<Bet["status"], string> = {
  PENDING: "Pending", WON: "Won", LOST: "Lost", VOID: "Void", CASHED_OUT: "Cashed Out",
};


// ─── Helpers ────────────────────────────────────────────────────────────────

function isLiveStatus(status?: string): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "live" || s === "in_play" || s === "inplay" || s === "in-play" || s === "1h" || s === "2h" || s === "ht";
}

function isFinishedStatus(status?: string): boolean {
  if (!status) return false;
  const s = status.toLowerCase();
  return s === "ft" || s === "finished" || s === "ended" || s === "completed" || s === "aet" || s === "pen";
}

function formatKickoff(kickoffAt?: string): string {
  if (!kickoffAt) return "";
  const d = new Date(kickoffAt);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86400000);
  const hrs  = Math.floor((abs % 86400000) / 3600000);
  const mins = Math.floor((abs % 3600000) / 60000);
  const timeStr = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const dateStr = d.toLocaleDateString([], { day: "2-digit", month: "short" });
  if (diff > 0) {
    // upcoming
    if (days === 0 && hrs === 0) return `Starts in ${mins}m · ${timeStr}`;
    if (days === 0) return `Starts in ${hrs}h ${mins}m · ${timeStr}`;
    return `${dateStr} · ${timeStr}`;
  }
  return `${dateStr} · ${timeStr}`;
}

// Live ticker — re-renders every second while match is live
function LiveTicker({ minutePlayed }: { minutePlayed?: number }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="td-live-timer">
      <span className="material-symbols-outlined" style={{fontSize:13}}>radio_button_checked</span>
      {minutePlayed != null ? `${minutePlayed}'` : "LIVE"}
    </span>
  );
}

function MatchStatusBadge({ match, kickoffAt }: { match?: Match; kickoffAt?: string }) {
  const status = match?.status;
  if (!match && !kickoffAt) return null;

  if (isLiveStatus(status)) {
    const hasScore = match && match.scoreHome != null && match.scoreAway != null;
    return (
      <div className="td-match-status td-match-live">
        <LiveTicker minutePlayed={match?.minutePlayed} />
        {hasScore && (
          <span className="td-live-score">{match!.scoreHome} – {match!.scoreAway}</span>
        )}
      </div>
    );
  }

  if (isFinishedStatus(status) && match && match.scoreHome != null && match.scoreAway != null) {
    return (
      <div className="td-match-status td-match-ft">
        <span className="td-ft-label">FT</span>
        <span className="td-ft-score">{match.scoreHome} – {match.scoreAway}</span>
      </div>
    );
  }

  // Upcoming — show kickoff time
  const ko = kickoffAt ?? match?.kickoffAt;
  if (ko) {
    return (
      <div className="td-match-status td-match-upcoming">
        <span className="material-symbols-outlined" style={{fontSize:13}}>schedule</span>
        <span>{formatKickoff(ko)}</span>
      </div>
    );
  }

  return null;
}

export default function TicketDetailsPage({ id }: { id: string }) {
  const [, setLocation] = useLocation();
  const { user } = useSession();
  const userCountry = pickUserField(user, "country", "countryCode", "country_code");
  const { code: currency } = currencyForCountry(userCountry);
  const [bet, setBet] = useState<Bet | null>(null);
  const [matches, setMatchesById] = useState<Record<string, Match>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [showTrophy, setShowTrophy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    api.bets.getOne(id)
      .then(async (resp) => {
        if (cancelled) return;
        const b = resp.data;
        setBet(b);
        // Best-effort enrichment for FT score / outcome — the Bet.selections
        // payload itself doesn't carry the final score, only the match id.
        const ids = Array.from(new Set(b.selections.map((s) => s.matchId).filter(Boolean)));
        const results = await Promise.allSettled(ids.map((mid) => api.matches.getById(mid)));
        if (cancelled) return;
        const byId: Record<string, Match> = {};
        results.forEach((r, i) => { if (r.status === "fulfilled") byId[ids[i]] = r.value.data; });
        setMatchesById(byId);
      })
      .catch((e) => { if (!cancelled) setError(e instanceof ApiError ? e.message : "This ticket could not be loaded."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id]);

  // Live score polling — refetch match data every 30s while any selection is live
  useEffect(() => {
    if (!bet) return;
    const ids = Array.from(new Set(bet.selections.map(s => s.matchId).filter(Boolean)));
    const anyLive = ids.some(mid => isLiveStatus(matches[mid]?.status));
    if (!anyLive) return;
    const interval = setInterval(async () => {
      const results = await Promise.allSettled(ids.map(mid => api.matches.getById(mid)));
      setMatchesById(prev => {
        const next = { ...prev };
        results.forEach((r, i) => { if (r.status === "fulfilled") next[ids[i]] = r.value.data; });
        return next;
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [bet, matches]);

  const deleteTicket = () => {
    if (!bet) return;
    if (!window.confirm("Remove this ticket from your history? This only hides it on this device.")) return;
    setDeleting(true);
    hideTicket(bet.id);
    setLocation("/bets");
  };

  return (
    <div className="td-page">
      <TicketDetailsStyles />
      <header className="td-header">
        <button type="button" className="td-header-btn" onClick={() => setLocation("/bets")} aria-label="Back">
          <ChevronLeft size={20} />
        </button>
        <h1>Ticket Details</h1>
        <div className="td-header-right">
          <Link href="/support" className="td-header-btn" aria-label="Support"><Headphones size={18} /></Link>
          <Link href="/" className="td-header-btn" aria-label="Home"><Home size={18} /></Link>
        </div>
      </header>

      {loading ? (
        <p className="muted td-pad">Loading ticket…</p>
      ) : error || !bet ? (
        <div className="td-pad">
          <p className="muted">{error || "Ticket not found."}</p>
          <Link href="/bets" className="gold-button" style={{ marginTop: 12, display: "inline-flex" }}>Back to bet history</Link>
        </div>
      ) : (
        <>
          <section className="td-summary">
            <div className="td-summary-top">
              <span className="td-ticket-id">Ticket ID: {bet.id.slice(0, 8).toUpperCase()}</span>
              <span className="td-date" style={{display:"flex",alignItems:"center",gap:4}}>
                <span className="material-symbols-outlined" style={{fontSize:12,opacity:.6}}>schedule</span>
                {new Date(bet.placedAt).toLocaleString([], { weekday:"short", day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })}
              </span>
            </div>
            <div className="td-summary-row">
              <span className="td-kind">{bet.selections.length > 1 ? "Multiple" : "Singles"}</span>
              <span className={`td-status ${STATUS_TONE[bet.status]}`}>
                {bet.status === "WON" && <Trophy size={14} />} {STATUS_LABEL[bet.status]}
              </span>
            </div>
            <div className="td-financials">
              <div className="td-fin-item">
                <div className="td-fin-label">Stake</div>
                <div className="td-fin-val orange">{currency} {bet.stake.toFixed(2)}</div>
              </div>
              <div className="td-fin-item">
                <div className="td-fin-label">Total Odds</div>
                <div className="td-fin-val">{bet.totalOdds.toFixed(2)}x</div>
              </div>
              <div className="td-fin-item">
                <div className="td-fin-label">Return</div>
                <div className={`td-fin-val${bet.status==="WON"||bet.status==="CASHED_OUT"?" won":""}`}>{currency} {(bet.status==="WON"||bet.status==="CASHED_OUT"?bet.potentialReturn:0).toFixed(2)}</div>
              </div>
            </div>
            <div className="td-verify-strip">Verify Code: <b>{verifyCode(bet)}</b></div>
            {bet.status === "WON" && (
              <button type="button" className="td-trophy-btn" onClick={() => setShowTrophy(true)}>
                <span className="material-symbols-outlined" style={{fontSize:18}}>emoji_events</span> View winning trophy
              </button>
            )}
          </section>

          <section className="td-legs">
            {bet.selections.map((s, i) => {
              const match = matches[s.matchId];
              const home = s.homeTeam ?? match?.homeTeam ?? "Home";
              const away = s.awayTeam ?? match?.awayTeam ?? "Away";
              const live = isLiveStatus(match?.status);
              const finished = isFinishedStatus(match?.status);
              const hasScore = match && match.scoreHome != null && match.scoreAway != null;
              const scoreStr = hasScore ? `${match!.scoreHome} – ${match!.scoreAway}` : "—";
              const won = s.result ? s.result.toLowerCase() === "won" || s.result.toLowerCase() === "win" : bet.status === "WON";
              return (
                <div className={`td-leg-card${live ? " td-leg-card-live" : ""}`} key={s.id ?? i}>
                  <div className="td-leg-top">
                    {won && <span className="material-symbols-outlined td-leg-check" style={{fontSize:20}}>check_circle</span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="td-leg-teams">{home} <span>v</span> {away}</div>
                      <MatchStatusBadge match={match} kickoffAt={match?.kickoffAt} />
                    </div>
                  </div>
                  <div className={`td-leg-pick ${won ? "td-pick-won" : ""}`}>
                    <div className="td-leg-row"><span>Pick</span><b>{s.selection} @ {s.oddsLocked?.toFixed(2)} {won && "✓"}</b></div>
                    <div className="td-leg-row"><span>Market</span><b>{s.market}</b></div>
                    {(finished || hasScore) && (
                      <div className="td-leg-row"><span>{finished ? "FT Score" : "Score"}</span><b className={finished ? "td-score-final" : "td-score-live"}>{scoreStr}</b></div>
                    )}
                    {live && match?.minutePlayed != null && (
                      <div className="td-leg-row"><span>Minute</span><b className="td-score-live">{match.minutePlayed}'</b></div>
                    )}
                    <div className="td-leg-row"><span>Outcome</span><b>{s.result ?? (finished ? scoreStr : "Pending")}</b></div>
                  </div>
                </div>
              );
            })}
          </section>

          <button type="button" className="td-delete" onClick={deleteTicket} disabled={deleting}>Delete Ticket</button>
        </>
      )}

      {showTrophy && bet && <TrophyCelebration bet={bet} onClose={() => setShowTrophy(false)} />}
    </div>
  );
}

function TicketDetailsStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200');
      .material-symbols-outlined { font-variation-settings:'FILL' 0,'wght' 400,'GRAD' 0,'opsz' 24; font-family:'Material Symbols Outlined'; font-style:normal; font-weight:normal; line-height:1; display:inline-block; text-transform:none; letter-spacing:normal; vertical-align:middle; user-select:none; }

      .td-page{ min-height:100vh; background:#F0F2F5; padding-bottom:40px; }
      .td-pad{ padding:24px 18px; color:rgba(0,0,0,.55); }

      /* Header */
      .td-header{
        display:flex; align-items:center; justify-content:space-between; padding:16px 16px;
        background:#F36600; color:#fff;
        box-shadow: 0 3px 14px rgba(200,80,0,.28);
      }
      .td-header h1{ font:800 18px 'Barlow Condensed',sans-serif; margin:0; text-transform:uppercase; letter-spacing:.04em; }
      .td-header-right{ display:flex; gap:6px; }
      .td-header-btn{
        width:36px; height:36px; border-radius:50%; display:flex; align-items:center; justify-content:center;
        background:rgba(255,255,255,.15); color:#fff; cursor:pointer; border:none; transition:background .15s;
      }
      .td-header-btn:hover{ background:rgba(255,255,255,.25); }

      /* Summary card */
      .td-summary{
        margin:16px 16px 0; border-radius:16px; background:#1A1C1E; color:#fff;
        overflow:hidden; box-shadow: 0 8px 24px rgba(0,0,0,.2);
        position:relative;
      }
      .td-summary::after{
        content:''; position:absolute; left:0; bottom:0; right:0; height:4px;
        background:#F36600;
      }
      .td-summary-top{
        display:flex; justify-content:space-between; align-items:center;
        font-size:11px; font-weight:700; color:rgba(255,255,255,.4); padding:14px 18px 8px;
        text-transform:uppercase; letter-spacing:.06em;
      }
      .td-summary-row{ display:flex; align-items:center; justify-content:space-between; padding:0 18px 12px; }
      .td-kind{ font:800 20px 'Barlow Condensed',sans-serif; text-transform:uppercase; letter-spacing:.02em; }
      .td-status{
        display:flex; align-items:center; gap:5px; font-size:12px; font-weight:800;
        text-transform:uppercase; letter-spacing:.06em; padding:6px 14px; border-radius:999px;
      }
      .td-status.td-won{ background:rgba(0,200,83,.15); color:#00C853; border:1px solid rgba(0,200,83,.3); }
      .td-status.td-lost{ background:rgba(229,57,53,.12); color:#E53935; border:1px solid rgba(229,57,53,.25); }
      .td-status.td-pending{ background:rgba(243,102,0,.15); color:#FF7A1A; border:1px solid rgba(243,102,0,.3); }
      .td-status.td-void{ background:rgba(155,160,166,.12); color:rgba(255,255,255,.5); border:1px solid rgba(155,160,166,.2); }
      .td-status.td-cashed{ background:rgba(91,224,201,.12); color:#5be0c9; border:1px solid rgba(91,224,201,.25); }

      /* Financial stats */
      .td-financials{
        display:grid; grid-template-columns:repeat(3,1fr); gap:0;
        border-top:1px solid rgba(255,255,255,.06); margin-top:4px;
      }
      .td-fin-item{ padding:12px 18px; border-right:1px solid rgba(255,255,255,.06); }
      .td-fin-item:last-child{ border-right:none; }
      .td-fin-label{ font-size:10px; font-weight:700; color:rgba(255,255,255,.4); text-transform:uppercase; letter-spacing:.08em; }
      .td-fin-val{ margin-top:5px; font:800 18px 'Barlow Condensed',sans-serif; color:#fff; }
      .td-fin-val.won{ color:#00C853; }
      .td-fin-val.orange{ color:#FF7A1A; }

      .td-stat{ display:flex; align-items:center; justify-content:space-between; padding:7px 18px; font-size:12px; color:rgba(255,255,255,.55); }
      .td-stat b{ color:#fff; font-weight:700; }
      .td-return-won{ color:#00C853 !important; font:800 20px 'Barlow Condensed',sans-serif !important; }

      .td-verify-strip{
        padding:12px 18px; font-size:11px; color:rgba(255,255,255,.4); font-weight:600;
        background:rgba(0,0,0,.25); border-top:1px solid rgba(255,255,255,.06);
        display:flex; align-items:center; justify-content:space-between;
      }
      .td-verify-strip b{ color:#FF7A1A; letter-spacing:.04em; font-family:'Barlow Condensed',sans-serif; font-size:14px; }
      .td-trophy-btn{
        display:flex; align-items:center; justify-content:center; gap:7px;
        width:calc(100% - 36px); margin:12px 18px 18px;
        padding:12px; border-radius:10px; background:rgba(0,200,83,.12);
        border:1.5px solid rgba(0,200,83,.35);
        color:#00C853; font-size:13px; font-weight:800; cursor:pointer; transition:background .15s;
      }
      .td-trophy-btn:hover{ background:rgba(0,200,83,.2); }

      /* Selection cards */
      .td-legs{ display:flex; flex-direction:column; gap:10px; margin:14px 16px 0; }
      .td-leg-card{
        border-radius:14px; background:#fff; padding:16px;
        box-shadow: 0 2px 10px rgba(0,0,0,.06);
        border:1px solid #E5E8EB;
      }
      .td-leg-card-live{ border-color:rgba(243,102,0,.4) !important; background:#FFFAF5 !important; }
      .td-leg-top{ display:flex; align-items:flex-start; gap:10px; margin-bottom:12px; }
      .td-leg-check{ color:#00C853; flex-shrink:0; margin-top:2px; }
      .td-leg-teams{ font:700 15px 'Barlow Condensed',sans-serif; text-transform:uppercase; letter-spacing:.02em; margin-bottom:4px; color:#1A1C1E; }
      .td-leg-teams span{ color:rgba(0,0,0,.3); font-weight:500; margin:0 5px; }
      .td-leg-pick{
        background:#F3F5F7; border-radius:10px; padding:11px 13px;
        border:1px solid #E5E8EB;
      }
      .td-leg-pick.td-pick-won{ background:#F0FDF4; border-color:rgba(0,200,83,.2); }
      .td-leg-row{ display:flex; align-items:center; justify-content:space-between; padding:5px 0; font-size:12px; color:#9BA0A6; border-top:1px solid rgba(0,0,0,.05); }
      .td-leg-row:first-child{ border-top:none; padding-top:0; }
      .td-leg-row b{ color:#1A1C1E; font-weight:700; }
      .td-pick-won .td-leg-row:first-child b{ color:#00C853; font-weight:800; }

      /* Match status badges */
      .td-match-status{ display:inline-flex; align-items:center; gap:5px; margin-top:4px; font-size:11px; font-weight:700; border-radius:999px; padding:3px 9px; }
      .td-match-live{ background:rgba(243,102,0,.12); color:#F36600; border:1px solid rgba(243,102,0,.3); animation:td-live-pulse 2s ease-in-out infinite; }
      .td-match-ft{ background:rgba(0,0,0,.06); color:rgba(0,0,0,.5); border:1px solid rgba(0,0,0,.1); }
      .td-match-upcoming{ background:rgba(0,200,83,.08); color:#00A040; border:1px solid rgba(0,200,83,.2); }
      @keyframes td-live-pulse{ 0%,100%{opacity:1} 50%{opacity:.6} }

      .td-live-timer{ display:flex; align-items:center; gap:4px; }
      .td-live-score{ font-size:14px; font-weight:800; margin-left:5px; color:#F36600; }
      .td-ft-label{ font-size:10px; font-weight:800; opacity:.6; }
      .td-ft-score{ font-weight:800; margin-left:3px; }
      .td-score-live{ color:#F36600 !important; font-weight:800; }
      .td-score-final{ color:#00A040 !important; font-weight:800; }

      /* Delete button */
      .td-delete{
        display:block; width:calc(100% - 32px); margin:20px 16px 0; padding:13px; border-radius:10px;
        background:transparent; color:rgba(229,57,53,.7); font-size:12px; font-weight:700;
        cursor:pointer; border:1px solid rgba(229,57,53,.2); transition:all .15s;
      }
      .td-delete:hover{ background:rgba(229,57,53,.06); color:#E53935; }
      .td-delete:disabled{ opacity:.4; cursor:not-allowed; }
    `}</style>
  );
}