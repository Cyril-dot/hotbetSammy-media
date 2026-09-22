import { useEffect, useCallback, useMemo, useState, useRef } from "react";
import { Link } from "wouter";
import { ArrowLeft, Radio, Star, Lock, Unlock, Clock, Calendar, Activity, Users, BarChart3, Zap, ChevronRight, RefreshCw } from "lucide-react";
import {
  formatKickoff,
  normalizeSportKey, parseKickoff, findFootballBulkMatchById,
  type OddsGroup
} from "@/lib/sportsbook";
import { TeamCrest, LiveClock } from "./Sportsbook";
import { useFavorites } from "@/lib/favorites";
import type { Pick } from "./Sportsbook";
import api from "@/lib/api";
import type { Match } from "@/lib/api";
import { assignAdminLogos } from "@/lib/logoCatalog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MatchStats { [key: string]: unknown }
interface MatchEvents { [key: string]: unknown }
interface MatchLineups { [key: string]: unknown }
interface MatchH2H { [key: string]: unknown }

// HotBet-style sport kind (wider than SportKey, includes 'admin')
type SportKind = "football" | "basketball" | "nfl" | "baseball" | "mma" | "tennis" | "admin";

interface HotOddsResult {
  odds1x2: OddsGroup[];
  oddsHalfTime: OddsGroup[];
  oddsCorrectScore: OddsGroup[];
  oddsHandicap: OddsGroup[];
}

// ---------------------------------------------------------------------------
// HotBet: detectSport — reads sport/source fields directly off the match
// ---------------------------------------------------------------------------
function detectSport(match: Match): SportKind {
  const sport  = String(match.sport ?? match.sportEnum ?? "").toLowerCase();
  const source = String(match.source ?? "").toUpperCase();
  if (source.startsWith("ADMIN_")) return "admin";
  if (sport.includes("basket") || sport === "basketball") return "basketball";
  if (sport.includes("american") || sport === "nfl" || sport === "american_football") return "nfl";
  if (sport.includes("baseball")) return "baseball";
  if (sport === "mma") return "mma";
  if (sport === "tennis") return "tennis";
  return "football";
}

// ---------------------------------------------------------------------------
// HotBet: fetchMatchById — tries football first, falls back to admin
// ---------------------------------------------------------------------------
async function fetchAdminOddsRaw(id: string): Promise<unknown[]> {
  try {
    const raw = await fetch(`/api/public/admin-matches/${id}/odds`).then(r => r.json());
    if (raw && typeof raw === "object" && Array.isArray((raw as Record<string, unknown>).data)) {
      return (raw as Record<string, unknown>).data as unknown[];
    }
    if (Array.isArray(raw)) return raw;
    return [];
  } catch { return []; }
}

async function fetchMatchById(id: string, sport: SportKind): Promise<Match> {
  let res: unknown;
  switch (sport) {
    case "basketball": res = await api.publicBasketball.getById(id); break;
    case "nfl":        res = await api.publicNfl.getById(id);        break;
    case "baseball":   res = await api.publicBaseball.getById(id);   break;
    case "mma":        res = await api.publicMma.getById(id);        break;
    case "tennis":     res = await api.publicTennis.getById(id);     break;
    case "admin": {
      try {
        res = await api.publicAdminMatches.getById(id);
      } catch (error) {
        console.warn("[AdminMatch] details endpoint failed; falling back to public admin list", { id, error });
        const listResponse = await api.publicAdminMatches.getAll();
        const list = Array.isArray(listResponse.data) ? listResponse.data : [];
        const found = list.find((item) => String(item.id) === String(id));
        if (!found) throw error;
        console.info("[AdminMatch] resolved details from public admin list", { id });
        return found;
      }
      break;
    }
    default: {
      // Public links may contain the provider event ID (for example
      // /match/401922312?sport=football), while detail/odds routes expect the
      // canonical UUID. Resolve both forms through the direct bulk feed.
      const bulk = await findFootballBulkMatchById(id);
      if (bulk?.match) return bulk.match;
      res = await api.publicFootball.getById(id);
      break;
    }
  }
  return ((res as Record<string, unknown>)?.data as Match) ?? (res as Match);
}

async function requireAdminLogos(match: Match): Promise<Match> {
  const assigned = assignAdminLogos(match) as Match & { homeLogo?: string; awayLogo?: string };
  if (typeof window === "undefined") return assigned;
  const load = (src?: string) => new Promise<boolean>((resolve) => {
    if (!src) { console.error("[AdminLogo] details page missing assigned path", { matchId: match.id }); resolve(false); return; }
    const image = new window.Image();
    let settled = false;
    const finish = (ok: boolean) => { if (!settled) { settled = true; resolve(ok); } };
    image.onload = () => { console.info("[AdminLogo] details preload success", { matchId: match.id, path: src }); finish(true); };
    image.onerror = () => { console.error("[AdminLogo] details preload failed", { matchId: match.id, path: src }); finish(false); };
    window.setTimeout(() => { console.error("[AdminLogo] details preload timeout", { matchId: match.id, path: src }); finish(false); }, 5000);
    image.src = src;
  });
  const [homeReady, awayReady] = await Promise.all([load(assigned.homeLogo), load(assigned.awayLogo)]);
  if (!homeReady || !awayReady) { console.warn("[AdminLogo] details match hidden", { matchId: match.id, home: assigned.homeLogo, away: assigned.awayLogo }); throw new Error("Admin match logos could not be loaded."); }
  return assigned;
}

// ---------------------------------------------------------------------------
// parseOddsGroups — convert any API response shape into OddsGroup[]
// ---------------------------------------------------------------------------
function parseOddsGroups(raw: unknown): OddsGroup[] {
  if (!raw) return [];
  let payload: unknown = raw;
  if (typeof raw === "object" && raw !== null && "data" in (raw as Record<string, unknown>)) {
    payload = (raw as Record<string, unknown>).data;
  }
  if (!payload) return [];

  // Already shaped as OddsGroup[]
  if (Array.isArray(payload)) {
    const first = (payload as Record<string, unknown>[])[0];
    if (first && "market" in first && "options" in first) return payload as OddsGroup[];

    // Flat array of odds rows → group by market
    const rows = payload as Array<Record<string, unknown>>;
    const hasHandicap = rows.some(r => r.handicap != null);
    if (hasHandicap) {
      const lineMap = new Map<string, Map<string, number[]>>();
      const lineOrder: string[] = [];
      for (const o of rows) {
        const handicap = String(o.handicap ?? "");
        const sel = String(o.selection ?? o.outcome ?? o.label ?? "");
        const odd = Number(o.value ?? o.odd ?? o.odds ?? o.price ?? 0);
        if (!sel || !handicap || odd <= 0) continue;
        if (!lineMap.has(handicap)) { lineMap.set(handicap, new Map()); lineOrder.push(handicap); }
        const sm = lineMap.get(handicap)!;
        if (!sm.has(sel)) sm.set(sel, []);
        sm.get(sel)!.push(odd);
      }
      const used = new Set<string>();
      const groups: OddsGroup[] = [];
      for (const line of [...lineOrder].sort((a, b) => parseFloat(a) - parseFloat(b))) {
        if (used.has(line)) continue;
        const mirrorVal = parseFloat(line) * -1;
        const mirrorKey = lineOrder.find(l => Math.abs(parseFloat(l) - mirrorVal) < 0.001);
        const options: Array<{ label: string; odd: number }> = [];
        const addFrom = (key: string) => {
          const sm = lineMap.get(key);
          if (!sm) return;
          for (const [sel, odds] of sm.entries()) {
            const avg = odds.reduce((a, b) => a + b, 0) / odds.length;
            options.push({ label: `${sel} (${key})`, odd: Math.round(avg * 100) / 100 });
          }
        };
        addFrom(line);
        if (mirrorKey && mirrorKey !== line) { addFrom(mirrorKey); used.add(mirrorKey); }
        used.add(line);
        if (options.length > 0) {
          const label = mirrorKey && mirrorKey !== line ? `${line} / ${mirrorKey}` : line;
          groups.push({ market: label, options });
        }
      }
      return groups;
    }
    // Non-handicap flat rows
    const marketMap = new Map<string, Map<string, number[]>>();
    for (const o of rows) {
      const market = String(o.market ?? o.name ?? o.type ?? "Other");
      const sel    = String(o.selection ?? o.outcome ?? o.label ?? o.name ?? "");
      const odd    = Number(o.value ?? o.odd ?? o.odds ?? o.price ?? 0);
      if (!sel || odd <= 0) continue;
      if (!marketMap.has(market)) marketMap.set(market, new Map());
      const sm = marketMap.get(market)!;
      if (!sm.has(sel)) sm.set(sel, []);
      sm.get(sel)!.push(odd);
    }
    const groups: OddsGroup[] = [];
    for (const [market, sm] of marketMap.entries()) {
      const options = [...sm.entries()].map(([sel, odds]) => ({
        label: sel, odd: Math.round((odds.reduce((a, b) => a + b, 0) / odds.length) * 100) / 100,
      }));
      groups.push({ market, options });
    }
    return groups;
  }

  // Object keyed by market name
  if (typeof payload === "object" && payload !== null) {
    const obj = payload as Record<string, unknown>;
    const groups: OddsGroup[] = [];
    for (const [market, entries] of Object.entries(obj)) {
      if (!Array.isArray(entries)) continue;
      const options = (entries as Array<Record<string, unknown>>)
        .map(e => ({ label: String(e.selection ?? e.outcome ?? e.name ?? e.label ?? ""), odd: Number(e.value ?? e.odd ?? e.odds ?? e.price ?? 0) }))
        .filter(o => o.odd > 0 && o.label);
      if (options.length > 0) groups.push({ market, options });
    }
    return groups;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Admin odds classifier (score/handicap/halftime/1x2)
// ---------------------------------------------------------------------------
function isScoreLabel(l: string) { return /^\d+[:\-]\d+$/.test(l.trim()); }
function isHtMarket(m: string) { const s = m.toLowerCase(); return ["halftime","half-time","half time","ht ","ht/","firsthalf","first half","2ndhalf","second half"].some(k => s.includes(k)); }
function isAhMarket(m: string) { const s = m.toLowerCase(); return ["handicap","asian","spread","ah ","ah/"].some(k => s.includes(k)); }

function classifyAdminOdds(raw: unknown[]): HotOddsResult {
  const result: HotOddsResult = { odds1x2: [], oddsHalfTime: [], oddsCorrectScore: [], oddsHandicap: [] };
  const mmap = new Map<string, Array<{ selection: string; odd: number; handicap?: string }>>();
  for (const row of raw as Array<Record<string, unknown>>) {
    const market = String(row.market ?? row.name ?? "match_result");
    const sel    = String(row.selection ?? row.outcome ?? row.label ?? "");
    const odd    = Number(row.value ?? row.odd ?? row.odds ?? row.price ?? 0);
    if (!sel || odd <= 0) continue;
    const handicap = row.handicap != null ? String(row.handicap) : undefined;
    if (!mmap.has(market)) mmap.set(market, []);
    mmap.get(market)!.push({ selection: sel, odd, handicap });
  }
  for (const [market, entries] of mmap.entries()) {
    const options = entries.map(e => ({ label: e.handicap ? `${e.selection} (${e.handicap})` : e.selection, odd: Math.round(e.odd * 100) / 100 }));
    const group: OddsGroup = { market, options };
    if (isAhMarket(market) || entries.some(e => e.handicap)) { result.oddsHandicap.push(group); continue; }
    if (isHtMarket(market)) { result.oddsHalfTime.push(group); continue; }
    if (options.length >= 2 && options.every(o => isScoreLabel(o.label))) { result.oddsCorrectScore.push(group); continue; }
    result.odds1x2.push(group);
  }
  return result;
}

// ---------------------------------------------------------------------------
// HotBet: fetchAllOddsForSport — per-sport, per-endpoint, Promise.allSettled
// ---------------------------------------------------------------------------
async function fetchAllOddsForSport(id: string, sport: SportKind): Promise<HotOddsResult> {
  const empty: HotOddsResult = { odds1x2: [], oddsHalfTime: [], oddsCorrectScore: [], oddsHandicap: [] };

  if (sport === "admin") {
    const rawOdds = await fetchAdminOddsRaw(id);
    if (!rawOdds.length) return empty;
    return classifyAdminOdds(rawOdds);
  }

  if (sport === "football") {
    const [r1, r2, r3, r4] = await Promise.allSettled([
      api.publicFootball.odds(id),
      api.publicFootball.oddsHalfTime(id),
      api.publicFootball.oddsCorrectScore(id),
      api.publicFootball.oddsHandicap(id),
    ]);
    if (r1.status === "fulfilled") empty.odds1x2          = parseOddsGroups(r1.value);
    if (r2.status === "fulfilled") empty.oddsHalfTime     = parseOddsGroups(r2.value);
    if (r3.status === "fulfilled") empty.oddsCorrectScore = parseOddsGroups(r3.value);
    if (r4.status === "fulfilled") empty.oddsHandicap     = parseOddsGroups(r4.value);
    return empty;
  }

  if (sport === "basketball") {
    const [r1, r2, r3] = await Promise.allSettled([
      api.publicBasketball.oddsMoneyline(id),
      api.publicBasketball.oddsSpread(id),
      api.publicBasketball.oddsTotal(id),
    ]);
    if (r1.status === "fulfilled") empty.odds1x2      = parseOddsGroups(r1.value);
    if (r2.status === "fulfilled") empty.oddsHandicap = parseOddsGroups(r2.value);
    if (r3.status === "fulfilled") empty.oddsHalfTime = parseOddsGroups(r3.value);
    return empty;
  }

  if (sport === "nfl") {
    const [r1] = await Promise.allSettled([api.publicNfl.oddsAll(id)]);
    if (r1.status === "fulfilled") empty.odds1x2 = parseOddsGroups(r1.value);
    return empty;
  }

  if (sport === "baseball") {
    const [r1] = await Promise.allSettled([api.publicBaseball.odds(id)]);
    if (r1.status === "fulfilled") empty.odds1x2 = parseOddsGroups(r1.value);
    return empty;
  }

  if (sport === "mma") {
    const [r1] = await Promise.allSettled([api.publicMma.oddsAll(id)]);
    if (r1.status === "fulfilled") empty.odds1x2 = parseOddsGroups(r1.value);
    return empty;
  }

  if (sport === "tennis") {
    const [r1] = await Promise.allSettled([api.publicTennis.odds(id)]);
    if (r1.status === "fulfilled") empty.odds1x2 = parseOddsGroups(r1.value);
    return empty;
  }

  return empty;
}

// ---------------------------------------------------------------------------
// Countdown
// ---------------------------------------------------------------------------
function Countdown({ kickoffAt }: { kickoffAt?: string }) {
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force(n => n + 1), 1000); return () => clearInterval(t); }, []);
  if (!kickoffAt) return null;
  const diff = parseKickoff(kickoffAt).getTime() - Date.now();
  if (isNaN(diff) || diff <= 0) return <span className="md-countdown">Starting soon</span>;
  const days = Math.floor(diff / 86_400_000);
  const hrs  = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const secs = Math.floor((diff % 60_000) / 1000);
  return (
    <span className="md-countdown">
      {days > 0 ? `${days}d ${hrs}h` : `${String(hrs).padStart(2,"0")}:${String(mins).padStart(2,"0")}:${String(secs).padStart(2,"0")}`}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Odds lock logic (mirrors hotbet's window-based locking)
// ---------------------------------------------------------------------------
const LIVE_STATUSES = new Set(["LIVE","live","IN_PLAY","in_play","FIRST_HALF","first_half","1H","SECOND_HALF","second_half","2H","HALFTIME","halftime","HALF_TIME","HT","EXTRA_TIME","extra_time","ET","PENALTIES","penalties","PEN","SUSPENDED","suspended"]);
const FINISHED_STATUSES = new Set(["FINISHED","finished","FULL_TIME","FT","AWARDED","CANCELLED","POSTPONED","ABANDONED","VOID","AET","AP","ENDED","COMPLETED","WALKOVER"]);
// Aliases used by the new hotbet-style fetch logic
const LIVE_STATUSES_SET = LIVE_STATUSES;
const FINISHED_STATUSES_SET = FINISHED_STATUSES;

const sessionStartMap = new Map<string, number>();
function getSessionStart(id: string): number {
  if (!sessionStartMap.has(id)) sessionStartMap.set(id, Date.now());
  return sessionStartMap.get(id)!;
}
const WIN_MS = 10 * 60 * 1000, OPEN_MS = 3 * 60 * 1000;
function isWindowOpen(id: string): boolean {
  return ((Date.now() - getSessionStart(id)) % WIN_MS) < OPEN_MS;
}
function msToNextChange(id: string): number {
  const phase = (Date.now() - getSessionStart(id)) % WIN_MS;
  return phase < OPEN_MS ? OPEN_MS - phase : WIN_MS - phase;
}

function useOddsWindow(match: { id?: string; status?: string } | null) {
  const isLive = LIVE_STATUSES.has(match?.status ?? "");
  const isFin  = FINISHED_STATUSES.has(match?.status ?? "");
  const id     = match?.id ?? "";
  const alwaysOpen = new Set(["HALFTIME","halftime","HALF_TIME","HT","FIRST_HALF","first_half","1H"]).has(match?.status ?? "");
  const [windowOpen, setWindowOpen] = useState(() => isLive && id ? isWindowOpen(id) : true);
  const [secsLeft, setSecsLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(() => {
    if (!isLive || isFin || !id || alwaysOpen) { setWindowOpen(true); setSecsLeft(0); return; }
    const tick = () => {
      setWindowOpen(isWindowOpen(id));
      const ms = msToNextChange(id);
      setSecsLeft(Math.ceil(ms / 1000));
      timerRef.current = setTimeout(tick, ms);
    };
    tick();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isLive, isFin, id, alwaysOpen]);
  const locked = isFin || (isLive && !windowOpen && !alwaysOpen);
  return { locked, windowOpen, secsLeft };
}

// ---------------------------------------------------------------------------
// Market components
// ---------------------------------------------------------------------------
function MarketGroup({ group, market, matchId, picks, onPick, clickable, homeTeam, awayTeam }: {
  group: OddsGroup; market: string; matchId: string; picks: Pick[];
  onPick: (p: Pick) => void; clickable: boolean; homeTeam?: string; awayTeam?: string;
}) {
  const isSel = (sel: string) => picks.some(p => p.id === matchId && p.market === market && p.selection === sel);
  const pick  = (sel: string, odd: number) => {
    if (!clickable || !odd || odd <= 0) return;
     onPick({ id: matchId, match: `${homeTeam ?? ""} vs ${awayTeam ?? ""}`, market, selection: sel, odd, homeTeam, awayTeam });
  };
  return (
    <div className="md-market-section">
      <div className="md-market-title">{group.market.replace(/_/g," ")}</div>
      <div className={`md-odds-row${group.options.length > 3 ? " md-odds-wrap" : ""}`}>
        {group.options.map(opt => (
          <button key={opt.label} type="button"
            className={`md-odd${isSel(opt.label)?" sel":""}${!clickable?" display-only":""}${opt.odd<=0?" empty":""}`}
            onClick={() => pick(opt.label, opt.odd)} disabled={!clickable || opt.odd <= 0}
          >
            <span>{opt.label}</span>
            <b>{opt.odd > 0 ? opt.odd.toFixed(2) : "—"}</b>
          </button>
        ))}
      </div>
    </div>
  );
}

function CorrectScoreSection({ groups, matchId, picks, onPick, clickable, homeTeam, awayTeam }: {
  groups: OddsGroup[]; matchId: string; picks: Pick[]; onPick: (p: Pick) => void;
  clickable: boolean; homeTeam?: string; awayTeam?: string;
}) {
  const market = groups[0]?.market ?? "correct_score";
  const scores = useMemo(() => {
    const all = groups.flatMap(g => g.options);
    const map = new Map<string,number>();
    for (const o of all) { const ex = map.get(o.label); if (ex === undefined || o.odd < ex) map.set(o.label, o.odd); }
    const parse = (s: string) => { const m = s.match(/(\d+)[:\-](\d+)/); return m ? {h:+m[1],a:+m[2]} : null; };
    return Array.from(map.entries()).map(([label,odd]) => ({label,odd})).sort((a,b) => {
      const am=parse(a.label),bm=parse(b.label);
      if (!am||!bm) return a.label.localeCompare(b.label);
      const at=am.h>am.a?0:am.h===am.a?1:2,bt=bm.h>bm.a?0:bm.h===bm.a?1:2;
      if (at!==bt) return at-bt;
      return (am.h+am.a)-(bm.h+bm.a);
    });
  }, [groups]);
  const isSel = (sel: string) => picks.some(p => p.id === matchId && p.market === market && p.selection === sel);
  const pick  = (sel: string, odd: number) => {
    if (!clickable || !odd || odd <= 0) return;
     onPick({ id: matchId, match: `${homeTeam ?? ""} vs ${awayTeam ?? ""}`, market, selection: sel, odd, homeTeam, awayTeam });
  };
  const parse = (s: string) => { const m = s.match(/(\d+)[:\-](\d+)/); return m ? {h:+m[1],a:+m[2]} : null; };
  const homeWins = scores.filter(s => { const p=parse(s.label); return p&&p.h>p.a; });
  const draws    = scores.filter(s => { const p=parse(s.label); return p&&p.h===p.a; });
  const awayWins = scores.filter(s => { const p=parse(s.label); return p&&p.h<p.a; });
  const other    = scores.filter(s => !parse(s.label));
  const Grp = ({ title, items }: { title: string; items: typeof scores }) => {
    if (!items.length) return null;
    return (
      <div className="md-cs-group">
        <div className="md-cs-head">{title}</div>
        <div className="md-cs-grid">
          {items.map(s => (
            <button key={s.label} type="button"
              className={`md-cs-btn${isSel(s.label)?" sel":""}${!clickable?" display-only":""}`}
              onClick={() => pick(s.label, s.odd)} disabled={!clickable}
            >
              <span>{s.label}</span><b>{s.odd.toFixed(2)}</b>
            </button>
          ))}
        </div>
      </div>
    );
  };
  if (!scores.length) return null;
  return (
    <div className="md-market-section">
      <div className="md-market-title">Correct Score</div>
      <Grp title={`${homeTeam??"Home"} win`} items={homeWins} />
      <Grp title="Draw" items={draws} />
      <Grp title={`${awayTeam??"Away"} win`} items={awayWins} />
      <Grp title="Other" items={other} />
    </div>
  );
}

function HandicapSection({ groups, matchId, picks, onPick, clickable, homeTeam, awayTeam }: {
  groups: OddsGroup[]; matchId: string; picks: Pick[]; onPick: (p: Pick) => void;
  clickable: boolean; homeTeam?: string; awayTeam?: string;
}) {
  const isSel = (mkt: string, sel: string) => picks.some(p => p.id === matchId && p.market === mkt && p.selection === sel);
  const pick  = (mkt: string, sel: string, odd: number) => {
    if (!clickable || !odd || odd <= 0) return;
     onPick({ id: matchId, match: `${homeTeam ?? ""} vs ${awayTeam ?? ""}`, market: mkt, selection: sel, odd, homeTeam, awayTeam });
  };
  return (
    <div className="md-market-section">
      <div className="md-market-title">Handicap</div>
      {groups.map((g, gi) => (
        <div key={gi} className="md-hc-group">
          <div className="md-hc-line-label">{g.market}</div>
          {g.options.map(opt => {
            const m = opt.label.match(/^(.+?)\s*\(([^)]+)\)$/);
            const teamN = m ? m[1] : opt.label, line = m ? m[2] : "";
            const selKey = `${opt.label}|${gi}`;
            return (
              <button key={opt.label} type="button"
                className={`md-hc-row${isSel("handicap",selKey)?" sel":""}${!clickable?" display-only":""}`}
                onClick={() => pick("handicap", selKey, opt.odd)} disabled={!clickable}
              >
                <span className="md-hc-team">{teamN}{line && <em> ({line})</em>}</span>
                <b>{opt.odd.toFixed(2)}</b>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stats tab
// ---------------------------------------------------------------------------
function StatsTab({ stats }: { stats: MatchStats | null }) {
  if (!stats) return <p style={{color:"var(--grey-500)",fontSize:13,padding:"20px 0"}}>Statistics not available for this match.</p>;
  const items = Object.entries(stats).filter(([k]) => !["id","matchId","createdAt","updatedAt"].includes(k));
  if (!items.length) return <p style={{color:"var(--grey-500)",fontSize:13,padding:"20px 0"}}>No statistics yet.</p>;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {items.map(([k, v]) => {
        if (typeof v !== "object" || v === null) return null;
        const vals = v as Record<string,unknown>;
        const home = Number(vals.home ?? vals.homeTeam ?? vals.h ?? 0);
        const away = Number(vals.away ?? vals.awayTeam ?? vals.a ?? 0);
        const total = home + away || 1;
        return (
          <div key={k} className="md-stat-bar">
            <div style={{width:32,textAlign:"center",fontSize:12,fontWeight:800,color:"var(--orange)"}}>{home}</div>
            <div style={{flex:1}}>
              <div style={{marginBottom:4,textAlign:"center",fontSize:11,fontWeight:700,color:"var(--grey-600)",textTransform:"capitalize"}}>{k.replace(/_/g," ")}</div>
              <div className="md-stat-track">
                <div className="md-stat-fill" style={{width:`${(home/total)*100}%`}} />
              </div>
            </div>
            <div style={{width:32,textAlign:"center",fontSize:12,fontWeight:800,color:"var(--grey-600)"}}>{away}</div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Events tab
// ---------------------------------------------------------------------------
function EventsTab({ events }: { events: MatchEvents | null }) {
  if (!events) return <p style={{color:"var(--grey-500)",fontSize:13,padding:"20px 0"}}>No events recorded yet.</p>;
  const evList: Array<{minute?:number;type?:string;team?:string;player?:string;detail?:string}> =
    Array.isArray((events as Record<string,unknown>).events)
      ? (events as Record<string,unknown>).events as typeof evList
      : Array.isArray(events) ? events as typeof evList : [];
  if (!evList.length) return <p style={{color:"var(--grey-500)",fontSize:13,padding:"20px 0"}}>No events recorded.</p>;
  const icon = (type?: string) => {
    if (!type) return "•";
    const t = type.toLowerCase();
    if (t.includes("goal") || t.includes("score")) return "⚽";
    if (t.includes("card") && t.includes("red")) return "🟥";
    if (t.includes("card")) return "🟨";
    if (t.includes("sub")) return "🔄";
    if (t.includes("pen")) return "🥅";
    return "•";
  };
  return (
    <div>
      {evList.map((ev, i) => (
        <div key={i} className="md-event">
          <div className="md-event-time">{ev.minute ? `${ev.minute}'` : "—"}</div>
          <div className="md-event-icon" style={{fontSize:16}}>{icon(ev.type)}</div>
          <div>
            <div className="md-event-detail">{ev.player ?? ev.type ?? "Event"}</div>
            {ev.team && <div className="md-event-sub">{ev.team}</div>}
            {ev.detail && <div className="md-event-sub">{ev.detail}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// H2H tab
// ---------------------------------------------------------------------------
function H2HTab({ h2h }: { h2h: MatchH2H | null }) {
  if (!h2h) return <p style={{color:"var(--grey-500)",fontSize:13,padding:"20px 0"}}>Head-to-head data not available.</p>;
  const matches: Array<{date?:string;home?:string;away?:string;scoreHome?:number;scoreAway?:number;result?:string}> =
    Array.isArray((h2h as Record<string,unknown>).matches) ? (h2h as Record<string,unknown>).matches as typeof matches :
    Array.isArray((h2h as Record<string,unknown>).h2h) ? (h2h as Record<string,unknown>).h2h as typeof matches :
    Array.isArray(h2h) ? h2h as typeof matches : [];
  if (!matches.length) return <p style={{color:"var(--grey-500)",fontSize:13,padding:"20px 0"}}>No previous meetings found.</p>;
  return (
    <div>
      {matches.slice(0,10).map((m,i) => (
        <div key={i} className="md-h2h-row">
          <div className="md-h2h-date">{m.date ? new Date(m.date).toLocaleDateString("en-GB",{day:"2-digit",month:"short"}) : "—"}</div>
          <div className="md-h2h-teams">{m.home ?? "?"} vs {m.away ?? "?"}</div>
          <div className="md-h2h-score">{m.scoreHome ?? "?"} - {m.scoreAway ?? "?"}</div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lineups tab
// ---------------------------------------------------------------------------
function LineupsTab({ lineups }: { lineups: MatchLineups | null }) {
  if (!lineups) return <p style={{color:"var(--grey-500)",fontSize:13,padding:"20px 0"}}>Lineups not available yet.</p>;
  const raw = lineups as Record<string,unknown>;
  const getPlayers = (key: string): Array<{name?:string;number?:number;position?:string}> => {
    const arr = raw[key];
    return Array.isArray(arr) ? arr as Array<{name?:string;number?:number;position?:string}> : [];
  };
  const homePlayers = getPlayers("home") || getPlayers("homeStarting") || getPlayers("homeLineup");
  const awayPlayers = getPlayers("away") || getPlayers("awayStarting") || getPlayers("awayLineup");
  if (!homePlayers.length && !awayPlayers.length) return <p style={{color:"var(--grey-500)",fontSize:13,padding:"20px 0"}}>Lineups not confirmed yet.</p>;
  return (
    <div className="md-lineup">
      <div className="md-lineup-team">
        <div className="md-lineup-title">Home XI</div>
        {homePlayers.slice(0,11).map((p,i) => (
          <div key={i} className="md-player">
            <div className="md-player-num">{p.number ?? i+1}</div>
            <div className="md-player-name">{p.name ?? "Player"}</div>
            {p.position && <div className="md-player-pos">{p.position}</div>}
          </div>
        ))}
      </div>
      <div className="md-lineup-team">
        <div className="md-lineup-title">Away XI</div>
        {awayPlayers.slice(0,11).map((p,i) => (
          <div key={i} className="md-player">
            <div className="md-player-num">{p.number ?? i+1}</div>
            <div className="md-player-name">{p.name ?? "Player"}</div>
            {p.position && <div className="md-player-pos">{p.position}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function DetailDataPanel({ title, icon: Icon, data }: { title: string; icon: typeof Activity; data: Record<string, unknown> | null }) {
  const entries = data ? Object.entries(data).filter(([key, value]) => !["id", "matchId", "eventId"].includes(key) && value !== null && value !== undefined && value !== "") : [];
  return <section className="md-data-card"><div className="md-data-card-head"><Icon size={16} /><h3>{title}</h3></div>{entries.length ? <div className="md-data-grid">{entries.map(([key, value]) => <div className="md-data-item" key={key}><span>{key.replace(/([A-Z])/g, " $1")}</span><b>{typeof value === "object" ? JSON.stringify(value) : String(value)}</b></div>)}</div> : <p className="md-empty-data">No {title.toLowerCase()} data is available for this match.</p>}</section>;
}

// Main component
// ---------------------------------------------------------------------------
export default function MatchDetailsPage({
  id, picks, onPick, sportHint, adminHint,
}: { id: string; picks: Pick[]; onPick: (p: Pick) => void; sportHint?: string; adminHint?: boolean }) {
  // ── Match state ────────────────────────────────────────────────────────
  const [match, setMatch]         = useState<Match | null>(null);
  const [sport, setSport]         = useState<SportKind>("football");
  const [loading, setLoading]     = useState(true);
  const [matchError, setMatchError] = useState<string | null>(null);

  // ── Odds state (hotbet pattern: separate per-endpoint buckets) ───────
  const [odds1x2, setOdds1x2]                   = useState<OddsGroup[]>([]);
  const [oddsHalfTime, setOddsHalfTime]         = useState<OddsGroup[]>([]);
  const [oddsCorrectScore, setOddsCorrectScore] = useState<OddsGroup[]>([]);
  const [oddsHandicap, setOddsHandicap]         = useState<OddsGroup[]>([]);
  const [oddsLoading, setOddsLoading]           = useState(false);

  // ── Extra detail state ────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<"odds"|"stats"|"events"|"h2h"|"lineups">("odds");
  const [stats, setStats]     = useState<MatchStats | null>(null);
  const [events, setEvents]   = useState<MatchEvents | null>(null);
  const [h2h, setH2H]         = useState<MatchH2H | null>(null);
  const [lineups, setLineups] = useState<MatchLineups | null>(null);

  const { has, toggle } = useFavorites();
  const { locked, secsLeft } = useOddsWindow(match);

  // ── Load the endpoint that owns this match. The list page supplies the
  // sport/admin hint; without using it, every detail page tried football first
  // and could either show the wrong record or never load its odds.
  const fetchMatch = useCallback(async () => {
    if (!id) return;
    setLoading(true); setMatchError(null);
    try {
      const hintedSport = adminHint
        ? "admin"
        : (["football", "basketball", "nfl", "baseball", "mma", "tennis"].includes((sportHint ?? "").toLowerCase())
          ? sportHint!.toLowerCase() as SportKind
          : undefined);
      let m: Match;
      if (hintedSport) {
        m = await fetchMatchById(id, hintedSport);
      } else {
        try { m = await fetchMatchById(id, "football"); }
        catch { m = await fetchMatchById(id, "admin"); }
      }
      const detectedSport = detectSport(m);
      if (adminHint || hintedSport === "admin" || detectedSport === "admin") {
        m = await requireAdminLogos(m);
      }
      setSport(detectedSport);
      setMatch(m);
      // Start odds window timer for live matches
      if (LIVE_STATUSES_SET.has(m.status ?? "")) getSessionStart(m.id);
    } catch (err) {
      setMatchError((err as Error).message ?? "Failed to load match");
    } finally { setLoading(false); }
  }, [adminHint, id, sportHint]);

  // ── HotBet fetchOdds: per-sport, per-endpoint, Promise.allSettled ───
  const fetchOdds = useCallback(async (matchId: string, sportKind: SportKind) => {
    if (!matchId) return;
    setOddsLoading(true);
    try {
      const result = await fetchAllOddsForSport(matchId, sportKind);
      setOdds1x2(result.odds1x2);
      setOddsHalfTime(result.oddsHalfTime);
      setOddsCorrectScore(result.oddsCorrectScore);
      setOddsHandicap(result.oddsHandicap);
    } finally { setOddsLoading(false); }
  }, [id]);

  // ── Additional public detail calls (stats/events/h2h/lineups) ─────────
  // Keep these requests direct and sport-owned. Admin-created matches do not
  // have public football stats, so never send their IDs to a football endpoint.
  const fetchDetails = useCallback(async (matchId: string, sportKind: SportKind) => {
    setStats(null);
    setEvents(null);
    setH2H(null);
    setLineups(null);
    if (sportKind === "admin") return;

    const requests = sportKind === "basketball"
      ? [
          api.publicBasketball.stats(matchId),
          api.publicBasketball.events(matchId),
          api.publicBasketball.h2h(matchId),
          api.publicBasketball.lineups(matchId),
        ]
      : sportKind === "football"
        ? [
            api.publicFootball.stats(matchId),
            api.publicFootball.events(matchId),
            api.publicFootball.h2h(matchId),
            api.publicFootball.lineups(matchId),
          ]
        : [];

    if (!requests.length) return;
    const [statsRes, eventsRes, h2hRes, lineupsRes] = await Promise.allSettled(requests);
    if (statsRes.status === "fulfilled" && statsRes.value.data)
      setStats(statsRes.value.data as MatchStats);
    if (eventsRes.status === "fulfilled" && eventsRes.value.data)
      setEvents(eventsRes.value.data as MatchEvents);
    if (h2hRes.status === "fulfilled" && h2hRes.value.data)
      setH2H(h2hRes.value.data as MatchH2H);
    if (lineupsRes.status === "fulfilled" && lineupsRes.value.data)
      setLineups(lineupsRes.value.data as MatchLineups);
  }, []);

  // ── Mount: fetch match ────────────────────────────────────────────────
  useEffect(() => { fetchMatch(); }, [fetchMatch]);

  // ── After match loads: fetch odds + detail data ───────────────────────
  useEffect(() => {
    if (!loading && match) {
      fetchOdds(match.id, sport);
      fetchDetails(match.id, sport);
    }
  }, [sport, loading, match, fetchOdds, fetchDetails]);

  // ── Live matches: re-fetch every 10 min (hotbet pattern) ───────────
  useEffect(() => {
    if (!match || !LIVE_STATUSES_SET.has(match.status ?? "")) return;
    const interval = setInterval(() => { fetchMatch(); }, 10 * 60 * 1000);
    return () => clearInterval(interval);
  }, [match, fetchMatch]);

  // Derive MatchDetail-compatible shape for the rest of the render
  const isLive  = LIVE_STATUSES_SET.has(match?.status ?? "");
  const isFin   = FINISHED_STATUSES_SET.has(match?.status ?? "");
  const notFound = !loading && !match && !!matchError;

  if (loading) {
    return (
      <main className="wrap" style={{paddingTop:24,paddingBottom:60}}>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <div style={{height:14,width:160,background:"var(--grey-200)",borderRadius:4}} />
          <div style={{height:280,background:"var(--grey-200)",borderRadius:14,animation:"pulse 1.4s ease infinite"}} />
          <div style={{height:120,background:"var(--grey-200)",borderRadius:14}} />
        </div>
      </main>
    );
  }

  if (notFound || !match) {
    return (
      <main className="wrap" style={{paddingTop:24,paddingBottom:60}}>
        <Link href="/" className="md-back"><ArrowLeft size={14}/> Back to matches</Link>
        <div className="panel simple-card" style={{marginTop:16}}>
          <h3>Match not found</h3>
          <p className="muted" style={{marginTop:8}}>This match may have finished or is no longer available.</p>
          <Link href="/" className="gold-button" style={{marginTop:16,display:"inline-flex",background:"var(--orange)",color:"#fff",borderRadius:8,padding:"10px 18px"}}>Browse matches <ChevronRight size={15}/></Link>
        </div>
      </main>
    );
  }

  const favored = has("match", match.id);
  // Build a 1X2 odds map from the odds1x2 bucket (hotbet pattern)
  const main1x2 = odds1x2[0];
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]/g, "");
  const findOpt = (kws: string[]) => main1x2?.options.find(o => kws.some(k => norm(o.label) === k || norm(o.label).includes(k)));
  const homeOpt = findOpt(["1","home",norm(match.homeTeam ?? "")]);
  const drawOpt = findOpt(["draw","x"]);
  const awayOpt = findOpt(["2","away",norm(match.awayTeam ?? "")]);
  const matchSportKey = normalizeSportKey(match.sport ?? "");
  const hasDraw = !["basketball","nfl","baseball","mma"].includes(sport);
  const clickable = !locked;
  const matchLabel = `${match.homeTeam} vs ${match.awayTeam}`;
  const isSel = (sel: string) => picks.some(p => p.id === match.id && p.market === "1X2" && p.selection === sel);
  const pick  = (sel: string, odd: number) => {
    if (!odd || odd <= 0) return;
    onPick({ id: match.id, match: matchLabel, market: "1X2", selection: sel, odd,
      league: match.league, homeTeam: match.homeTeam, awayTeam: match.awayTeam,
      kickoffAt: match.kickoffAt, isLive, scoreHome: match.scoreHome, scoreAway: match.scoreAway });
  };
  const slots = hasDraw
    ? [["1", match.homeTeam, homeOpt?.odd ?? 0],["X","Draw", drawOpt?.odd ?? 0],["2", match.awayTeam, awayOpt?.odd ?? 0]]
    : [["1", match.homeTeam, homeOpt?.odd ?? 0],["2", match.awayTeam, awayOpt?.odd ?? 0]];

  const tabs: Array<{ key: typeof activeTab; label: string; icon: typeof Activity }> = [
    { key: "odds", label: "Markets", icon: BarChart3 },
    ...(stats ? [{ key: "stats" as const, label: "Stats", icon: Activity }] : []),
    ...(events ? [{ key: "events" as const, label: "Events", icon: Zap }] : []),
    ...(h2h ? [{ key: "h2h" as const, label: "H2H", icon: Users }] : []),
    ...(lineups ? [{ key: "lineups" as const, label: "Line-ups", icon: Users }] : []),
  ];

  return (
    <main className="wrap match-details-page" style={{paddingTop:20,paddingBottom:60,maxWidth:900,margin:"0 auto"}}>
      {/* Back link */}
      <Link href="/" className="md-back"><ArrowLeft size={14}/> Back to matches</Link>

      {/* Hero header */}
      <div className="md-header">
        <div className="md-league">
          {sport === "admin" && <span className="sb-badge special" style={{marginRight:6}}>SPECIAL</span>}
          {match.league || match.sport || "Match"}
          <button
            className={`sb-fav${favored?" active":""}`}
            style={{marginLeft:"auto",background:"transparent",border:"none"}}
            onClick={() => toggle({ kind:"match", id:match.id, label:matchLabel, meta:match.league })}
            type="button" aria-label="Toggle favorite"
          >
            <Star size={15} fill={favored?"currentColor":"none"} />
          </button>
        </div>

        <div className="md-teams">
          {/* Home team */}
          <div className="md-team">
            <div className="md-crest">
              <TeamCrest url={match.homeLogo} name={match.homeTeam ?? ""} side="home" />
            </div>
            <div className="md-team-name">{match.homeTeam}</div>
          </div>

          {/* Score / status */}
          <div className="md-score-block">
            {isLive ? (
              <>
                <div className="md-score">{match.scoreHome ?? 0} - {match.scoreAway ?? 0}</div>
                <div className="md-live-badge"><Radio size={10}/> <LiveClock match={{ id: match.id, status: match.status, kickoffAt: match.kickoffAt, minutePlayed: match.minutePlayed } as Parameters<typeof LiveClock>[0]["match"]} /></div>
              </>
            ) : (
              <>
                <div className="md-score" style={{fontSize:36,color:"rgba(255,255,255,.5)"}}>vs</div>
                <div className="md-status">{match.status ? match.status.replace(/_/g," ") : "Upcoming"}</div>
              </>
            )}
          </div>

          {/* Away team */}
          <div className="md-team">
            <div className="md-crest">
              <TeamCrest url={match.awayLogo} name={match.awayTeam ?? ""} side="away" />
            </div>
            <div className="md-team-name">{match.awayTeam}</div>
          </div>
        </div>

        <div className="md-time-info">
          {match.kickoffAt && (
            <>
              <div className="md-time-item"><Calendar size={13}/> {formatKickoff(match.kickoffAt)}</div>
              {!isLive && <div className="md-time-item"><Clock size={13}/> <Countdown kickoffAt={match.kickoffAt}/></div>}
            </>
          )}
          {odds1x2.length === 0 && !oddsLoading && (
            <div className="md-time-item" style={{color:"rgba(255,255,255,.5)"}}>
              <span style={{fontSize:10,fontWeight:700,background:"rgba(243,102,0,.25)",padding:"2px 8px",borderRadius:4,color:"var(--orange-hi)"}}>ESTIMATED ODDS</span>
            </div>
          )}
        </div>
      </div>

      {/* Odds lock banner */}
      {locked && (
        <div className="md-lock-banner">
          <Lock size={16}/>
          <div>
            <div>Markets temporarily locked — live pricing is being updated</div>
            {secsLeft > 0 && <div className="md-lock-countdown">Unlocks in {secsLeft}s</div>}
          </div>
        </div>
      )}
      {!locked && isLive && (
        <div className="md-lock-banner" style={{background:"rgba(0,200,83,.08)",border:"1.5px solid rgba(0,200,83,.3)",color:"var(--live)"}}>
          <Unlock size={16}/>
          <div>Live markets open — odds may change rapidly</div>
        </div>
      )}

      {/* Tab bar */}
      <div className="md-tab-bar">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} type="button"
            className={`md-tab${activeTab===key?" active":""}`}
            onClick={() => setActiveTab(key as typeof activeTab)}
          >
            <Icon size={13}/> {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="md-panel">
        {activeTab === "odds" && (
          <>
            {/* Main 1X2 */}
            <div className="md-panel-title"><BarChart3 size={15}/> Match Result</div>
            <div className="md-odds-row" style={{marginBottom:16}}>
              {slots.map(([label, name, val]) => (
                <button key={label as string} type="button"
                  className={`md-odd${isSel(label as string)?" sel":""}${!clickable?" display-only":""}${!val||(val as number)<=0?" empty":""}`}
                  onClick={() => clickable && pick(label as string, val as number)}
                  disabled={!clickable || !val || (val as number) <= 0}
                >
                  <span>{name as string}</span>
                  <b>{val && (val as number) > 0 ? (val as number).toFixed(2) : "—"}</b>
                </button>
              ))}
            </div>

            {oddsLoading ? (
              <p style={{fontSize:12,color:"var(--grey-400)",marginTop:12}}>Loading additional markets…</p>
            ) : (
              <>
                {oddsHalfTime.map((g,i) => (
                  <MarketGroup key={`ht-${i}`} group={g} market={g.market} matchId={match.id}
                    picks={picks} onPick={onPick} clickable={clickable}
                    homeTeam={match.homeTeam} awayTeam={match.awayTeam}
                  />
                ))}
                {oddsCorrectScore.length > 0 && (
                  <CorrectScoreSection groups={oddsCorrectScore} matchId={match.id}
                    picks={picks} onPick={onPick} clickable={clickable}
                    homeTeam={match.homeTeam} awayTeam={match.awayTeam}
                  />
                )}
                {oddsHandicap.length > 0 && (
                  <HandicapSection groups={oddsHandicap} matchId={match.id}
                    picks={picks} onPick={onPick} clickable={clickable}
                    homeTeam={match.homeTeam} awayTeam={match.awayTeam}
                  />
                )}
                {oddsHalfTime.length === 0 && oddsCorrectScore.length === 0 && oddsHandicap.length === 0 && !oddsLoading && (
                  <p style={{fontSize:12,color:"var(--grey-400)",marginTop:12}}>
                    Only match result market is available for this game.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
      {activeTab === "stats" && <DetailDataPanel title="Match statistics" icon={Activity} data={stats} />}
      {activeTab === "events" && <DetailDataPanel title="Match events" icon={Zap} data={events} />}
      {activeTab === "h2h" && <DetailDataPanel title="Head to head" icon={Users} data={h2h} />}
      {activeTab === "lineups" && <DetailDataPanel title="Line-ups" icon={Users} data={lineups} />}

      {/* Additional CSS for details page elements */}
      <style>{`
        .match-details-page{max-width:1180px!important;padding:18px 24px 96px!important;background:transparent!important}
        .match-details-page .md-back{display:inline-flex!important;align-items:center!important;gap:7px!important;margin:0 0 12px!important;color:#b8c8e8!important;font-size:12px!important;font-weight:800!important}
        .match-details-page .md-header{display:block!important;margin:0!important;padding:22px 26px 20px!important;border:1px solid rgba(255,255,255,.09)!important;border-top:3px solid #f36600!important;border-radius:16px!important;background:linear-gradient(135deg,#111c34,#0d1528 62%,#162040)!important;box-shadow:0 14px 32px rgba(0,0,0,.32)!important}
        .match-details-page .md-header:before{display:none!important}
        .match-details-page .md-teams{max-width:820px!important;margin:20px auto 16px!important;grid-template-columns:minmax(0,1fr) 132px minmax(0,1fr)!important;gap:32px!important}
        .match-details-page .md-crest{width:76px!important;height:76px!important;padding:8px!important;border-radius:20px!important;border:2px solid rgba(243,102,0,.5)!important;background:#f8f9fa!important;box-shadow:0 8px 22px rgba(0,0,0,.3)!important}
        .match-details-page .md-team-name{max-width:280px!important;color:#fff!important;font-size:clamp(16px,2.1vw,24px)!important;font-weight:900!important}
        .match-details-page .md-score-block{min-width:132px!important;padding:15px 12px!important;border-radius:15px!important;background:rgba(6,10,18,.5)!important;border:1px solid rgba(255,255,255,.1)!important}
        .match-details-page .md-score{font-size:42px!important;color:#fff!important;font-weight:900!important}
        .match-details-page .md-tab-bar{position:sticky!important;top:78px!important;z-index:40!important;justify-content:flex-start!important;width:max-content!important;min-width:150px!important;margin:16px 0 12px!important;padding:5px!important;border:1px solid rgba(255,255,255,.1)!important;border-radius:11px!important;background:rgba(13,21,40,.98)!important;box-shadow:0 8px 20px rgba(0,0,0,.25)!important}
        .match-details-page .md-tab{min-width:138px!important;min-height:42px!important;border-radius:8px!important;color:#8fa4cc!important;font-size:13px!important;font-weight:900!important;background:transparent!important}
        .match-details-page .md-tab.active{background:#f36600!important;border-color:#ff7a1a!important;color:#fff!important;box-shadow:0 5px 12px rgba(243,102,0,.25)!important}
        .match-details-page .md-panel{display:block!important;margin:0!important;padding:0!important;border:0!important;background:transparent!important;box-shadow:none!important}
        .match-details-page .md-panel-title{display:flex!important;align-items:center!important;gap:8px!important;margin:0 0 10px!important;padding:15px 18px!important;border:1px solid rgba(255,255,255,.08)!important;border-bottom:2px solid #f36600!important;border-radius:12px!important;background:#0d1528!important;color:#fff!important;font-size:18px!important;font-weight:900!important}
        .match-details-page .md-panel-title svg{color:#ff7a1a!important}
        .match-details-page .md-odds-row{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:12px!important;margin:0 0 18px!important;padding:18px!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:12px!important;background:#0d1528!important;box-shadow:0 8px 20px rgba(0,0,0,.2)!important}
        .match-details-page .md-odd{min-height:90px!important;padding:12px 8px!important;border:0!important;border-radius:11px!important;background:#f4f7fb!important;color:#164d96!important;box-shadow:0 3px 0 rgba(0,0,0,.16)!important}
        .match-details-page .md-odd span{color:#415b75!important;font-size:12px!important;font-weight:800!important}
        .match-details-page .md-odd b{color:#164d96!important;font-size:26px!important;font-weight:900!important}
        .match-details-page .md-odd.sel{background:#f36600!important;box-shadow:0 6px 14px rgba(243,102,0,.28)!important}
        .match-details-page .md-odd.sel span,.match-details-page .md-odd.sel b{color:#fff!important}
        .match-details-page .md-market-section{margin:0 0 18px!important;padding:18px!important;border:1px solid rgba(255,255,255,.08)!important;border-top:2px solid rgba(243,102,0,.7)!important;border-radius:12px!important;background:#0d1528!important;box-shadow:0 8px 20px rgba(0,0,0,.2)!important}
        .match-details-page .md-market-title{margin:0 0 14px!important;color:#2b6cc4!important;font-size:20px!important;font-weight:900!important;line-height:1.1!important}
        .match-details-page .md-cs-group{margin:0 0 16px!important}
        .match-details-page .md-cs-head,.match-details-page .md-hc-line-label{display:block!important;margin:0 0 8px!important;color:#aebed8!important;font-size:12px!important;font-weight:800!important;line-height:1.2!important;letter-spacing:.06em!important;text-transform:uppercase!important}
        .match-details-page .md-cs-grid{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(96px,1fr))!important;gap:8px!important;width:100%!important}
        .match-details-page .md-cs-btn{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:5px!important;min-height:64px!important;width:100%!important;padding:9px 6px!important;border:0!important;color:#163555!important;border-radius:9px!important;background:#f4f7fb!important;box-shadow:0 3px 0 rgba(0,0,0,.16)!important;cursor:pointer!important;overflow:hidden!important}
        .match-details-page .md-cs-btn span{display:block!important;max-width:100%!important;color:#415b75!important;font-size:12px!important;font-weight:800!important;line-height:1.15!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .match-details-page .md-cs-btn b{display:block!important;color:#164d96!important;font-size:18px!important;font-weight:900!important;line-height:1!important}
        .match-details-page .md-hc-group{margin:0 0 14px!important}
        .match-details-page .md-hc-row{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;width:100%!important;min-height:50px!important;margin:0 0 8px!important;padding:11px 13px!important;border:0!important;color:#163555!important;border-radius:9px!important;background:#f4f7fb!important;box-shadow:0 3px 0 rgba(0,0,0,.16)!important;cursor:pointer!important;text-align:left!important}
        .match-details-page .md-hc-team{min-width:0!important;color:#415b75!important;font-size:12px!important;font-weight:800!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
        .match-details-page .md-hc-team em{color:#164d96!important;font-style:normal!important}
        .match-details-page .md-hc-row b{flex-shrink:0!important;color:#164d96!important;font-size:18px!important;font-weight:900!important}
        .match-details-page .md-cs-btn:hover,.match-details-page .md-hc-row:hover{background:#fff!important;transform:translateY(-1px)!important}
        .match-details-page .md-cs-btn.display-only,.match-details-page .md-hc-row.display-only{cursor:not-allowed!important;opacity:.55!important;transform:none!important}
        .match-details-page .md-cs-btn b,.match-details-page .md-hc-row b,.match-details-page .md-hc-team em{color:#164d96!important}
        @media(max-width:700px){
          .match-details-page{padding:10px 14px 78px!important}
          .match-details-page .md-header{padding:15px 14px 14px!important;border-radius:13px!important}
          .match-details-page .md-teams{grid-template-columns:minmax(0,1fr) 78px minmax(0,1fr)!important;gap:7px!important;margin:14px auto!important}
          .match-details-page .md-crest{width:52px!important;height:52px!important;padding:5px!important;border-radius:13px!important}
          .match-details-page .md-team-name{font-size:13px!important}
          .match-details-page .md-score-block{min-width:78px!important;padding:9px 4px!important}
          .match-details-page .md-score{font-size:27px!important}
          .match-details-page .md-tab-bar{position:static!important;width:100%!important;margin:12px 0 9px!important}
          .match-details-page .md-tab{width:100%!important;min-width:0!important;min-height:46px!important}
          .match-details-page .md-panel-title{padding:13px 15px!important;font-size:17px!important}
          .match-details-page .md-odds-row{gap:7px!important;padding:12px!important}
          .match-details-page .md-odd{min-height:82px!important;padding:9px 3px!important}
          .match-details-page .md-odd span{font-size:10px!important}
          .match-details-page .md-odd b{font-size:23px!important}
          .match-details-page .md-market-section{padding:14px!important}
          .match-details-page .md-cs-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;gap:7px!important}
          .match-details-page .md-cs-btn{min-height:68px!important;padding:8px 3px!important}
          .match-details-page .md-cs-btn span{font-size:10px!important}
          .match-details-page .md-cs-btn b{font-size:17px!important}
          .match-details-page .md-hc-row{min-height:48px!important;padding:10px!important}
          .match-details-page .md-hc-team{font-size:11px!important}
          .match-details-page .md-hc-row b{font-size:17px!important}
        }
        .match-details-page{background:linear-gradient(180deg,#f7f7f8 0%,#eceef0 100%)!important;color:#252a30!important;border-radius:0!important}
        .match-details-page .md-back{color:#6b7280!important;text-decoration:none!important}
        .match-details-page .md-header{background:linear-gradient(135deg,#252a30 0%,#3f464d 100%)!important;border:0!important;border-top:5px solid #f36600!important;border-radius:22px!important;box-shadow:0 18px 42px rgba(37,42,48,.22)!important}
        .match-details-page .md-league{color:#f5f6f7!important;font-weight:800!important}.match-details-page .md-team-name{color:#fff!important}.match-details-page .md-score-block{background:#fff!important;border:0!important;box-shadow:0 10px 24px rgba(0,0,0,.16)!important}.match-details-page .md-score{color:#252a30!important}.match-details-page .md-status,.match-details-page .md-time-info{color:#6b7280!important}
        .match-details-page .md-tab-bar{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(120px,1fr))!important;width:100%!important;min-width:0!important;padding:6px!important;background:#252a30!important;border:0!important;border-radius:14px!important;box-shadow:0 12px 24px rgba(37,42,48,.18)!important}.match-details-page .md-tab{width:100%!important;min-width:0!important;color:#d5d8db!important;border-radius:10px!important}.match-details-page .md-tab.active{background:#f36600!important;color:#fff!important}
        .match-details-page .md-panel-title{background:#fff!important;color:#252a30!important;border:0!important;border-left:5px solid #f36600!important;box-shadow:0 6px 16px rgba(37,42,48,.10)!important}.match-details-page .md-odds-row,.match-details-page .md-market-section{background:#fff!important;border:0!important;box-shadow:0 8px 20px rgba(37,42,48,.10)!important}.match-details-page .md-market-title{color:#f36600!important}.match-details-page .md-odd{background:#eef0f2!important;color:#252a30!important;border:1px solid #d8dce0!important;box-shadow:none!important}.match-details-page .md-odd span{color:#6b7280!important}.match-details-page .md-odd b{color:#f36600!important}.match-details-page .md-odd.sel{background:#f36600!important;border-color:#f36600!important}
        .match-details-page .md-data-card{margin:0 0 18px;padding:20px;background:#fff;border-radius:16px;border-left:5px solid #f36600;box-shadow:0 8px 20px rgba(37,42,48,.10)}.match-details-page .md-data-card-head{display:flex;align-items:center;gap:9px;padding-bottom:14px;border-bottom:1px solid #e2e5e8;color:#f36600}.match-details-page .md-data-card-head h3{margin:0;color:#252a30;font-size:18px}.match-details-page .md-data-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:15px}.match-details-page .md-data-item{display:grid;gap:4px;padding:12px;border-radius:10px;background:#f1f3f4}.match-details-page .md-data-item span{color:#6b7280;font-size:11px;text-transform:capitalize}.match-details-page .md-data-item b{color:#252a30;font-size:13px;overflow-wrap:anywhere}.match-details-page .md-empty-data{margin:15px 0 0;color:#6b7280;font-size:13px}
        .adm-mode-switch{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px;padding:12px 14px;border:1px solid #e0e3e6;border-radius:14px;background:#fff;box-shadow:0 8px 20px rgba(37,42,48,.08)}.adm-mode-label{color:#6b7280;font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.adm-mode-tabs{display:flex;gap:7px;flex-wrap:wrap}.adm-mode-tabs button{min-height:40px;padding:0 16px;border:1px solid #cfd4d8;border-radius:9px;background:#f1f3f4;color:#6b7280;font-size:12px;font-weight:900;cursor:pointer}.adm-mode-tabs button.active{border-color:#f36600;background:#f36600;color:#fff;box-shadow:0 5px 12px rgba(243,102,0,.24)}
        @media(max-width:700px){.match-details-page{padding:12px 12px 78px!important}.match-details-page .md-teams{grid-template-columns:minmax(0,1fr) 86px minmax(0,1fr)!important;gap:8px!important}.match-details-page .md-tab-bar{grid-template-columns:repeat(2,minmax(0,1fr))!important}.match-details-page .md-data-grid{grid-template-columns:1fr}.adm-mode-switch{align-items:stretch;flex-direction:column}.adm-mode-tabs{display:grid;grid-template-columns:1fr 1fr}.adm-mode-tabs button{width:100%}}
      `}</style>
    </main>
  );
}
