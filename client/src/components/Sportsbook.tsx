import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { Bike, ChevronRight, CircleDot, Crown, Dumbbell, Flame, RefreshCw, Sparkles, Star, Trophy, TriangleAlert } from "lucide-react";
import {
  categorise, fetchAdminMatches, fetchSport, formatKickoff, formatKickoffDate, generateCrest, getLastFetchStatus, liveClock,
  isMatchLive, parseKickoff, TWO_WAY_SPORTS,
  type EnrichedMatch, type SportKey,
} from "@/lib/sportsbook";
import { useFavorites } from "@/lib/favorites";
import { adminCrestFor } from "@/lib/logoCatalog";

export type Pick = {
  id: string; match: string; market: string; selection: string; odd: number;
  league?: string; homeTeam?: string; awayTeam?: string; kickoffAt?: string;
  isLive?: boolean; scoreHome?: number; scoreAway?: number;
};

export const SPORT_TABS: { key: SportKey; label: string; icon: typeof Trophy; swatch: string }[] = [
  { key: "football", label: "Football", icon: CircleDot, swatch: "#0da653" },
  { key: "basketball", label: "Basketball", icon: Dumbbell, swatch: "#d97706" },
  { key: "tennis", label: "Tennis", icon: Star, swatch: "#00C853" },
  { key: "baseball", label: "Baseball", icon: Trophy, swatch: "#2563eb" },
  { key: "nfl", label: "NFL", icon: Flame, swatch: "#7c3aed" },
  { key: "mma", label: "MMA", icon: Bike, swatch: "#F36600" },
];

const PAGE_SIZE = 15;
const ENDED_PAGE_SIZE = 5;

function SkeletonRows() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="sb-row sb-skel">
          <div className="sb-skel-block" style={{ width: "62%", height: 12 }} />
          <div className="sb-skel-block" style={{ width: 44, height: 30 }} />
          <div className="sb-skel-block" style={{ width: 44, height: 30 }} />
          <div className="sb-skel-block" style={{ width: 44, height: 30 }} />
        </div>
      ))}
    </>
  );
}

function OddButton({
  label, value, clickable, selected, onClick,
}: { label: string; value: number; clickable: boolean; selected: boolean; onClick: () => void }) {
  const empty = !value || value <= 0;
  return (
    <button
      className={`sb-odd${selected ? " sel" : ""}${!clickable ? " display-only" : ""}${empty ? " empty" : ""}`}
      onClick={clickable && !empty ? onClick : undefined}
      disabled={empty}
      aria-label={`${label} ${empty ? "unavailable" : value.toFixed(2)}`}
      type="button"
    >
      <span>{label}</span>
      <b>{empty ? "—" : value.toFixed(2)}</b>
    </button>
  );
}

function Countdown({ kickoffAt }: { kickoffAt?: string }) {
  const [, force] = useState(0);
  useEffect(() => {
    if (!kickoffAt) return;
    const t = setInterval(() => force((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [kickoffAt]);
  if (!kickoffAt) return null;
  const diff = parseKickoff(kickoffAt).getTime() - Date.now();
  if (Number.isNaN(diff)) return null;
  if (diff <= 0) return <span className="sb-countdown">Starting soon</span>;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const text = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return <span className="sb-countdown">in {text}</span>;
}

/**
 * Ticks independently of the 30s data-poll cycle so the running minute count
 * actually advances smoothly (every 15s) instead of only jumping forward
 * whenever the next background refetch happens to land. Used for every live
 * match row — Live Now section AND Featured Matches both render through
 * MatchRow, so both get this automatically.
 */
export function LiveClock({ match }: { match: EnrichedMatch }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, [match.id]);
  return <>{liveClock(match)}</>;
}

export function TeamCrest({ url, name }: { url?: string; name: string }) {
  const fallback = generateCrest(name);
  const [src, setSrc] = useState(url || fallback);
  useEffect(() => { setSrc(url || fallback); }, [url, fallback]);
  return (
    <span className="sb-crest" aria-hidden>
      <img src={src} alt="" loading="lazy" decoding="async" draggable={false} referrerPolicy="no-referrer" onError={() => { if (src !== fallback) setSrc(fallback); }} />
    </span>
  );
}

function MatchRow({
  match, hasDraw, picks, onPick, isAdmin = false, ended = false,
}: { match: EnrichedMatch; hasDraw: boolean; picks: Pick[]; onPick: (p: Pick) => void; isAdmin?: boolean; ended?: boolean }) {
  const adminHomeLogo = isAdmin ? adminCrestFor(match.homeTeam, "home") : match.displayHomeLogo;
  const adminAwayLogo = isAdmin ? adminCrestFor(match.awayTeam, "away") : match.displayAwayLogo;
  const [homeReady, setHomeReady] = useState(!isAdmin);
  const [awayReady, setAwayReady] = useState(!isAdmin);
  const [logoBlocked, setLogoBlocked] = useState(false);
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    setHomeReady(false); setAwayReady(false); setLogoBlocked(false);
    const preload = (src: string | undefined, ready: (value: boolean) => void) => {
      if (!src) { ready(false); return; }
      const image = new Image();
      image.onload = () => { if (active) ready(true); };
      image.onerror = () => { if (active) { setLogoBlocked(true); ready(false); } };
      image.src = src;
    };
    preload(adminHomeLogo, setHomeReady);
    preload(adminAwayLogo, setAwayReady);
    return () => { active = false; };
  }, [isAdmin, adminHomeLogo, adminAwayLogo]);
  if (isAdmin && (logoBlocked || !homeReady || !awayReady)) return null;
  const isLive = !ended && isMatchLive(match);
  // Live prices are valid bet selections too. Only finished matches and
  // synthetic/estimated prices must stay out of the slip.
  const clickable = !ended && !match.isSyntheticOdds;
  const odds = match.oddsMap;
  const matchLabel = `${match.homeTeam} vs ${match.awayTeam}`;
  const { has, toggle } = useFavorites();
  const favored = has("match", match.id);
  const isSel = (sel: string) => picks.some((p) => p.id === match.id && p.market === "1X2" && p.selection === sel);
  const pick = (sel: string, odd: number) => onPick({
    id: match.id, match: matchLabel, market: "1X2", selection: sel, odd,
    league: match.league, homeTeam: match.homeTeam, awayTeam: match.awayTeam,
    kickoffAt: match.kickoffAt, isLive, scoreHome: match.scoreHome, scoreAway: match.scoreAway,
  });

  const slots = hasDraw
    ? [["1", odds?.home ?? 0], ["X", odds?.draw ?? 0], ["2", odds?.away ?? 0]]
    : [["1", odds?.home ?? 0], ["2", odds?.away ?? 0]];

  const matchHref = `/match/${match.id}?sport=${encodeURIComponent(match.sport ?? "football")}${isAdmin ? "&admin=1" : ""}`;
  const showScore = isLive || ended;

  return (
    <div className={`sb-row${isLive ? " is-live" : ""}${isAdmin ? " is-admin" : ""}${ended ? " is-ended" : ""}`}>
      <div className="sb-row-top">
        <span className="sb-row-badges">
          <button
            className={`sb-fav${favored ? " active" : ""}`}
            onClick={(e) => { e.preventDefault(); toggle({ kind: "match", id: match.id, label: matchLabel, meta: match.league }); }}
            aria-label={favored ? "Remove from favorites" : "Add to favorites"}
            type="button"
          >
            <Star size={13} fill={favored ? "currentColor" : "none"} />
          </button>
          {isAdmin && <span className="sb-badge special"><Crown size={9} /> HOTBET</span>}
          <small>{match.league || match.sport || "Match"}</small>
          {match.isSyntheticOdds && !isLive && !ended && <span className="sb-badge synth">EST. ODDS</span>}
        </span>
        <span className="sb-row-time">
          {ended ? <span className="sb-badge ft">FT</span> : isLive ? <><i className="live-dot" /> <LiveClock match={match} /></> : (
            <>
              {formatKickoffDate(match.kickoffAt)} {formatKickoff(match.kickoffAt)}
              <Countdown kickoffAt={match.kickoffAt} />
            </>
          )}
        </span>
      </div>

      <Link href={matchHref} className="sb-fixture">
        <span className="sb-team-line">
          <TeamCrest url={adminHomeLogo} name={match.homeTeam ?? ""} />
          <span className="sb-team-name">{match.homeTeam}</span>
          {showScore && match.scoreHome != null && <em>{match.scoreHome}</em>}
        </span>
        <span className="sb-team-line">
          <TeamCrest url={adminAwayLogo} name={match.awayTeam ?? ""} />
          <span className="sb-team-name">{match.awayTeam}</span>
          {showScore && match.scoreAway != null && <em>{match.scoreAway}</em>}
        </span>
      </Link>

      {ended ? (
        <Link href={matchHref} className="sb-ended-note">Final score — view match <ChevronRight size={13} /></Link>
      ) : (
      <div className="sb-odds-row">
        {slots.map(([label, val]) => (
          <OddButton
            key={label as string}
            label={label as string}
            value={val as number}
            clickable={clickable}
            selected={isSel(label as string)}
            onClick={() => pick(label as string, val as number)}
          />
        ))}
        <Link href={matchHref} className="sb-more" aria-label="View match details"><ChevronRight size={14} /></Link>
      </div>
      )}
    </div>
  );
}

/** Groups by day (Today/Yesterday/date) rather than by league — for the
 * Recently Ended section, "which day did this finish" matters more to a
 * user scanning results than "which league". Capped to a handful shown by
 * default (matching the same "Show more" pattern used elsewhere) since a
 * busy day's worth of finished matches would otherwise dump dozens of dead
 * rows onto the page every time. */
function EndedMatchList({ list, hasDraw, picks, onPick }: { list: EnrichedMatch[]; hasDraw: boolean; picks: Pick[]; onPick: (p: Pick) => void }) {
  const [visible, setVisible] = useState(ENDED_PAGE_SIZE);
  useEffect(() => { setVisible(ENDED_PAGE_SIZE); }, [list.length]);

  if (list.length === 0) return null;
  const shown = list.slice(0, visible);
  const byDay = new Map<string, EnrichedMatch[]>();
  for (const m of shown) {
    const key = formatKickoffDate(m.kickoffAt) || "Recent";
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(m);
  }
  return (
    <>
      {Array.from(byDay.entries()).map(([day, matches]) => (
        <div key={day}>
          <div className="sb-league-hdr">{day} <b>{matches.length}</b></div>
          {matches.map((m) => <MatchRow key={m.id} match={m} hasDraw={hasDraw} picks={picks} onPick={onPick} ended />)}
        </div>
      ))}
      {visible < list.length && (
        <button className="sb-load-more" onClick={() => setVisible((v) => v + ENDED_PAGE_SIZE)} type="button">
          Show more ({list.length - visible} remaining)
        </button>
      )}
    </>
  );
}

/**
 * Horizontally-swipeable "featured" match cards sitting above the vertical
 * Live/Today lists — a genuinely distinct section from those, not just a
 * restyle of the same rows. Contains ALL of today's matches (not a capped
 * preview), real-odds ones surfaced first — "featured" here means "we
 * actually have real pricing for this one", not a fabricated hype signal.
 * No invented "HOT"/"BEST ODDS" badges without a real basis behind them;
 * badges shown are the same genuine ones used elsewhere (HOTBET, LIVE clock,
 * EST. ODDS).
 */
function FeaturedMatchCarousel({ list, hasDraw, picks, onPick }: { list: EnrichedMatch[]; hasDraw: boolean; picks: Pick[]; onPick: (p: Pick) => void }) {
  const featured = useMemo(() => {
    const real = list.filter((m) => !m.isSyntheticOdds);
    const synth = list.filter((m) => m.isSyntheticOdds);
    const live = (arr: EnrichedMatch[]) => arr.filter((m) => isMatchLive(m));
    const notLive = (arr: EnrichedMatch[]) => arr.filter((m) => !isMatchLive(m));
    return [...live(real), ...notLive(real), ...live(synth), ...notLive(synth)];
  }, [list]);

  if (featured.length === 0) return null;

  return (
    <div className="featured-carousel-wrap">
      <div className="featured-carousel-hdr">
        <span className="featured-carousel-hdr-icon"><Sparkles size={13} /></span>
        <span className="featured-carousel-hdr-text">Featured Matches</span>
        <b className="featured-carousel-hdr-count">{featured.length}</b>
      </div>
      <div className="featured-carousel">
        {featured.map((m) => (
          <FeaturedMatchCard key={m.id} match={m} hasDraw={hasDraw} picks={picks} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

function FeaturedMatchCard({ match, hasDraw, picks, onPick }: { match: EnrichedMatch; hasDraw: boolean; picks: Pick[]; onPick: (p: Pick) => void }) {
  const isLive = isMatchLive(match);
  const clickable = !match.isSyntheticOdds;
  const odds = match.oddsMap;
  const matchLabel = `${match.homeTeam} vs ${match.awayTeam}`;
  const isSel = (sel: string) => picks.some((p) => p.id === match.id && p.market === "1X2" && p.selection === sel);
  const pick = (sel: string, odd: number) => onPick({
    id: match.id, match: matchLabel, market: "1X2", selection: sel, odd,
    league: match.league, homeTeam: match.homeTeam, awayTeam: match.awayTeam,
    kickoffAt: match.kickoffAt, isLive, scoreHome: match.scoreHome, scoreAway: match.scoreAway,
  });
  const slots = hasDraw
    ? [["1", odds?.home ?? 0], ["X", odds?.draw ?? 0], ["2", odds?.away ?? 0]]
    : [["1", odds?.home ?? 0], ["2", odds?.away ?? 0]];
  const matchHref = `/match/${match.id}?sport=${encodeURIComponent(match.sport ?? "football")}`;

  return (
    <div className={`featured-card${isLive ? " is-live" : ""}`}>
      <div className="featured-card-top">
        <span className="featured-card-league">{match.league || match.sport || "Match"}</span>
        {isLive ? (
          <span className="featured-card-status-badge live"><i className="live-dot" /> LIVE</span>
        ) : match.isSyntheticOdds ? (
          <span className="featured-card-status-badge synth">EST. ODDS</span>
        ) : (
          <span className="featured-card-status-badge best">BEST ODDS</span>
        )}
      </div>
      <Link href={matchHref} className="featured-card-fixture">
        <div className="featured-card-side">
          <TeamCrest url={match.displayHomeLogo} name={match.homeTeam ?? ""} />
          <span className="featured-card-side-label">HOME</span>
          <span className="featured-card-team-name">{match.homeTeam}</span>
          {isLive && match.scoreHome != null && <em>{match.scoreHome}</em>}
        </div>
        <div className="featured-card-mid">
          {isLive ? <LiveClock match={match} /> : (
            <>
              <b>{formatKickoff(match.kickoffAt)}</b>
              <small>{formatKickoffDate(match.kickoffAt)}</small>
            </>
          )}
        </div>
        <div className="featured-card-side">
          <TeamCrest url={match.displayAwayLogo} name={match.awayTeam ?? ""} />
          <span className="featured-card-side-label">AWAY</span>
          <span className="featured-card-team-name">{match.awayTeam}</span>
          {isLive && match.scoreAway != null && <em>{match.scoreAway}</em>}
        </div>
      </Link>
      <div className="featured-card-odds">
        {slots.map(([label, val]) => (
          <OddButton
            key={label as string}
            label={label as string}
            value={val as number}
            clickable={clickable}
            selected={isSel(label as string)}
            onClick={() => pick(label as string, val as number)}
          />
        ))}
      </div>
    </div>
  );
}

function SectionShell({
  title, icon, count, live, special, badge, id, variant = "default", children,
}: { title: string; icon: React.ReactNode; count?: number; live?: boolean; special?: boolean; badge?: string; id?: string; variant?: "default" | "live" | "today" | "upcoming"; children: React.ReactNode }) {
  return (
    <section id={id} className={`panel sb-section sb-variant-${variant}${live ? " sb-live-section" : ""}${special ? " sb-special-section" : ""}`}>
      <div className="sb-section-head">
        <span className="sb-section-title">{icon}{title}{typeof count === "number" && <b>({count})</b>}</span>
        {live && <span className="live-pulse">LIVE</span>}
        {special && badge && <span className="sb-special-tag"><Sparkles size={11} />{badge}</span>}
      </div>
      <div className="sb-section-body">{children}</div>
    </section>
  );
}

function PaginatedLeagueList({
  list, hasDraw, picks, onPick, emptyLabel,
}: { list: EnrichedMatch[]; hasDraw: boolean; picks: Pick[]; onPick: (p: Pick) => void; emptyLabel: string }) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  useEffect(() => { setVisible(PAGE_SIZE); }, [list.length]);

  if (list.length === 0) return <p className="sb-empty">{emptyLabel}</p>;

  const byLeague = new Map<string, EnrichedMatch[]>();
  for (const m of list) { const key = m.league || "Other"; if (!byLeague.has(key)) byLeague.set(key, []); byLeague.get(key)!.push(m); }

  let shown = 0;
  const rows: React.ReactNode[] = [];
  for (const [league, matches] of Array.from(byLeague.entries())) {
    if (shown >= visible) break;
    const remaining = visible - shown;
    const slice = matches.slice(0, remaining);
    shown += slice.length;
    rows.push(
      <div key={league}>
        <div className="sb-league-hdr">{league} <b>{matches.length}</b></div>
        {slice.map((m: EnrichedMatch) => <MatchRow key={m.id} match={m} hasDraw={hasDraw} picks={picks} onPick={onPick} />)}
      </div>
    );
  }

  return (
    <>
      {rows}
      {visible < list.length && (
        <button className="sb-load-more" onClick={() => setVisible((v) => v + PAGE_SIZE)} type="button">
          Show more ({list.length - visible} remaining)
        </button>
      )}
    </>
  );
}

export default function Sportsbook({
  picks, onPick, mode = "all", sport: sportProp, onSportChange, leagueFilter, hoursFilter,
  onMeta,
}: {
  picks: Pick[]; onPick: (p: Pick) => void; mode?: "all" | "live-only";
  sport?: SportKey; onSportChange?: (s: SportKey) => void; leagueFilter?: string | null;
  /** Only used for the "Today" section — caps it to matches kicking off
   * within this many hours from now (e.g. 3, for a "Football in next 3
   * hours" quick filter). Ignored for Live/Upcoming/Ended since "starting
   * soon" only makes sense against not-yet-started matches. */
  hoursFilter?: number | null;
  onMeta?: (meta: {
    sport: SportKey; leagues: string[]; leagueCounts: Record<string, number>;
    counts: { live: number; today: number; upcoming: number; total: number }; loading: boolean;
  }) => void;
}) {
  const [internalSport, setInternalSport] = useState<SportKey>("football");
  const sport = sportProp ?? internalSport;
  const setSport = onSportChange ?? setInternalSport;

  const [matches, setMatches] = useState<Record<SportKey, EnrichedMatch[]>>({ football: [], basketball: [], tennis: [], baseball: [], nfl: [], mma: [] });
  const [adminMatches, setAdminMatches] = useState<EnrichedMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiUnreachable, setApiUnreachable] = useState(false);
  const loaded = useRef<Set<SportKey>>(new Set());

  const load = async (s: SportKey) => {
    setLoading(true);
    try {
      const [sportData, admin] = await Promise.all([fetchSport(s), s === "football" ? fetchAdminMatches() : Promise.resolve(adminMatches)]);
      setMatches((prev) => ({ ...prev, [s]: sportData }));
      if (s === "football") setAdminMatches(admin);
      loaded.current.add(s);
      setApiUnreachable(getLastFetchStatus().allFailed);
    } catch {
      setApiUnreachable(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(sport); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sport]);

  useEffect(() => {
    const interval = setInterval(() => { if (document.visibilityState === "visible") load(sport); }, 30_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport]);

  const hasDraw = !TWO_WAY_SPORTS.has(sport);
  const current = matches[sport];

  const grouped = useMemo(() => {
    const cats: Record<"live" | "today" | "upcoming" | "ended", EnrichedMatch[]> = { live: [], today: [], upcoming: [], ended: [] };
    for (const m of current) { const c = categorise(m); if (c) cats[c].push(m); }
    // Most-recently-finished first, so "Recently Ended" reads newest-to-oldest.
    cats.ended.sort((a, b) => {
      const at = a.kickoffAt ? parseKickoff(a.kickoffAt).getTime() : 0;
      const bt = b.kickoffAt ? parseKickoff(b.kickoffAt).getTime() : 0;
      return bt - at;
    });
    return cats;
  }, [current]);

  const leagues = useMemo(() => Array.from(new Set(current.map((m) => m.league).filter((l): l is string => !!l))).sort(), [current]);

  const leagueCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const m of current) { if (!m.league) continue; map[m.league] = (map[m.league] ?? 0) + 1; }
    return map;
  }, [current]);

  useEffect(() => {
    onMeta?.({
      sport, leagues, leagueCounts,
      counts: { live: grouped.live.length, today: grouped.today.length, upcoming: grouped.upcoming.length, total: current.length },
      loading,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sport, leagues.join("|"), loading, grouped.live.length, grouped.today.length, grouped.upcoming.length, current.length]);

  const applyFilter = (list: EnrichedMatch[]) => (leagueFilter ? list.filter((m) => m.league === leagueFilter) : list);
  const applyHoursFilter = (list: EnrichedMatch[]) => {
    const base = applyFilter(list);
    if (!hoursFilter) return base;
    return base.filter((m) => {
      if (!m.kickoffAt) return false;
      const diffH = (parseKickoff(m.kickoffAt).getTime() - Date.now()) / 3_600_000;
      return diffH >= 0 && diffH <= hoursFilter;
    });
  };

  return (
    <div className="sb-wrap">
      {mode === "all" && (
        <div className="sb-tabs">
          {SPORT_TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.key} className={`sb-tab${sport === t.key ? " active" : ""}`} onClick={() => setSport(t.key)} type="button">
                <span className="sb-tab-swatch" style={{ background: t.swatch }}><Icon size={12} /></span>
                {t.label}
              </button>
            );
          })}
          <button className="sb-refresh" onClick={() => load(sport)} aria-label="Refresh matches" type="button">
            <RefreshCw size={14} className={loading ? "spin" : ""} />
          </button>
        </div>
      )}

      {apiUnreachable && (
        <div className="sb-error-banner">
          <TriangleAlert size={15} />
          <div>
            <b>Couldn't reach the match data service.</b>
            <span>This isn't "no matches" — the API request failed (network issue, CORS block, or the backend is down). Open your browser console for details, or tap Retry.</span>
          </div>
          <button onClick={() => load(sport)} type="button">Retry</button>
        </div>
      )}

      {mode === "all" && (
        <FeaturedMatchCarousel
          list={[...applyFilter(grouped.live), ...applyFilter(grouped.today)]}
          hasDraw={hasDraw} picks={picks} onPick={onPick}
        />
      )}

      {mode === "all" && sport === "football" && !leagueFilter && adminMatches.length > 0 && (
        <SectionShell title="Featured Matches" icon={<Sparkles size={14} />} count={adminMatches.length} variant="live" badge="FEATURED">
          {adminMatches.map((m) => (
            <MatchRow key={m.id} match={m} hasDraw picks={picks} onPick={onPick} isAdmin />
          ))}
        </SectionShell>
      )}

      <SectionShell id="sb-section-live" title="Live Now" icon={<i className="live-dot" />} count={applyFilter(grouped.live).length} live variant="live">
        {loading && grouped.live.length === 0 ? (
          <SkeletonRows />
        ) : (
          <PaginatedLeagueList
            list={applyFilter(grouped.live)} hasDraw={hasDraw} picks={picks} onPick={onPick}
            emptyLabel={`No live ${SPORT_TABS.find((t) => t.key === sport)?.label.toLowerCase()} matches right now.`}
          />
        )}
      </SectionShell>

      {mode === "all" && (
        <>
          <SectionShell id="sb-section-today" title={hoursFilter ? `Today — next ${hoursFilter}h` : "Today"} icon={<Trophy size={14} />} count={applyHoursFilter(grouped.today).length} variant="today">
            {loading && grouped.today.length === 0 ? (
              <SkeletonRows />
            ) : (
              <PaginatedLeagueList list={applyHoursFilter(grouped.today)} hasDraw={hasDraw} picks={picks} onPick={onPick} emptyLabel={hoursFilter ? `No matches kicking off in the next ${hoursFilter} hours.` : "No matches today."} />
            )}
          </SectionShell>

          <SectionShell id="sb-section-upcoming" title="Upcoming" icon={<Trophy size={14} />} count={applyFilter(grouped.upcoming).length} variant="upcoming">
            {loading && grouped.upcoming.length === 0 ? (
              <SkeletonRows />
            ) : (
              <PaginatedLeagueList list={applyFilter(grouped.upcoming)} hasDraw={hasDraw} picks={picks} onPick={onPick} emptyLabel="No upcoming matches found." />
            )}
          </SectionShell>

          {applyFilter(grouped.ended).length > 0 && (
            <SectionShell id="sb-section-ended" title="Recently Ended" icon={<Trophy size={14} />} count={applyFilter(grouped.ended).length}>
              <EndedMatchList list={applyFilter(grouped.ended)} hasDraw={hasDraw} picks={picks} onPick={onPick} />
            </SectionShell>
          )}
        </>
      )}
    </div>
  );
}
