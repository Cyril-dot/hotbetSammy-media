import { useMemo, useState } from "react";
import { ChevronDown, Flame, Search, Star, Trophy, X } from "lucide-react";
import Sportsbook, { SPORT_TABS, type Pick } from "./Sportsbook";
import type { SportKey } from "@/lib/sportsbook";
import { useFavorites } from "@/lib/favorites";

const SPORT_BLURB: Record<SportKey, string> = {
  football: "Odds on the world's biggest leagues and cups, updated in real time.",
  basketball: "NBA, EuroLeague and more — moneylines on every tip-off.",
  tennis: "ATP, WTA and Grand Slam markets, set by set.",
  baseball: "MLB moneylines from first pitch to final out.",
  nfl: "Every week's slate, spreads and totals included.",
  mma: "Fight night moneylines across the major promotions.",
};

function StatPill({
  tone, label, value,
}: { tone: "live" | "today" | "upcoming"; label: string; value: number }) {
  return (
    <div className={`sp-stat sp-stat-${tone}`}>
      {tone === "live" ? <i className="live-dot" /> : <span className="sp-stat-dot" />}
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export default function SportsPage({ picks, onPick }: { picks: Pick[]; onPick: (p: Pick) => void }) {
  const [sport, setSport] = useState<SportKey>("football");
  const [leagueFilter, setLeagueFilter] = useState<string | null>(null);
  const [leagues, setLeagues] = useState<string[]>([]);
  const [leagueCounts, setLeagueCounts] = useState<Record<string, number>>({});
  const [counts, setCounts] = useState({ live: 0, today: 0, upcoming: 0, total: 0 });
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const { favorites } = useFavorites();
  const favoriteMatches = favorites.filter((f) => f.kind === "match");

  const activeTab = SPORT_TABS.find((t) => t.key === sport) ?? SPORT_TABS[0];
  const ActiveIcon = activeTab.icon;

  const visibleLeagues = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? leagues.filter((l) => l.toLowerCase().includes(q)) : leagues;
    return [...filtered].sort((a, b) => (leagueCounts[b] ?? 0) - (leagueCounts[a] ?? 0) || a.localeCompare(b));
  }, [leagues, leagueCounts, query]);

  const changeSport = (s: SportKey) => { setSport(s); setLeagueFilter(null); setQuery(""); };

  return (
    <main className="wrap sports-page-grid">
      <aside className="side-nav panel sports-sidebar">
        <div className="side-title"><Flame size={15} /> Sports</div>
        <div className="sports-sport-list">
          {SPORT_TABS.map((t) => {
            const Icon = t.icon;
            const isActive = sport === t.key;
            return (
              <button
                key={t.key}
                className={`sports-sidebar-item${isActive ? " active" : ""}`}
                onClick={() => changeSport(t.key)}
                type="button"
              >
                <span className="sports-sidebar-icon"><Icon size={14} /></span>
                {t.label}
                {isActive && counts.live > 0 && <i className="live-dot sports-sidebar-live" />}
              </button>
            );
          })}
        </div>

        <div className="side-title spaced"><Star size={15} /> Competitions</div>
        <div className="sports-comp-search">
          <Search size={13} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${activeTab.label.toLowerCase()} competitions…`}
            aria-label="Search competitions"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search"><X size={13} /></button>
          )}
        </div>

        <div className="sports-comp-list">
          <button
            className={`sports-sidebar-item comp${leagueFilter === null ? " active" : ""}`}
            onClick={() => setLeagueFilter(null)}
            type="button"
          >
            <span>All competitions</span>
            <b className="sports-comp-count">{counts.total}</b>
          </button>
          {leagues.length === 0 ? (
            <p className="sports-sidebar-empty">No competitions loaded yet.</p>
          ) : visibleLeagues.length === 0 ? (
            <p className="sports-sidebar-empty">No competitions match "{query}".</p>
          ) : (
            visibleLeagues.map((l) => (
              <button
                key={l}
                className={`sports-sidebar-item comp${leagueFilter === l ? " active" : ""}`}
                onClick={() => setLeagueFilter(l)}
                type="button"
              >
                <span>{l}</span>
                <b className="sports-comp-count">{leagueCounts[l] ?? 0}</b>
              </button>
            ))
          )}
        </div>

        {favoriteMatches.length > 0 && (
          <>
            <div className="side-title spaced"><Star size={15} /> Favorites</div>
            <p className="sports-sidebar-empty" style={{ padding: "6px 16px 12px" }}>{favoriteMatches.length} favorite match{favoriteMatches.length === 1 ? "" : "es"} — view on the <a href="/favorites" style={{ color: "var(--orange,#F36600)", fontWeight: 800 }}>Favorites page</a>.</p>
          </>
        )}
      </aside>

      <div className="main-column">
        <div className={`sports-command${expanded ? " expanded" : ""}`}>
          <button
            type="button"
            className="sports-command-bar"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
          >
            <span className="sports-command-icon"><ActiveIcon size={16} /></span>
            <span className="sports-command-title">{activeTab.label} Betting</span>
            <span className="sports-command-scope">{leagueFilter ?? "All competitions"}</span>
            <span className="sports-command-quick">
              {counts.live > 0 && <span className="sports-command-live"><i className="live-dot" />{counts.live} live</span>}
              <span className="sports-command-today">{counts.today} today</span>
            </span>
            <ChevronDown size={16} className="sports-command-chevron" />
          </button>

          <div className="sports-command-body">
            <div className="sports-command-body-inner">
              <p>{SPORT_BLURB[sport]}</p>
              <div className="sports-hero-stats">
                <StatPill tone="live" label="Live now" value={counts.live} />
                <StatPill tone="today" label="Today" value={counts.today} />
                <StatPill tone="upcoming" label="Upcoming" value={counts.upcoming} />
              </div>
            </div>
          </div>
        </div>

        {leagueFilter && (
          <div className="sports-filter-chip">
            <Trophy size={13} />
            Filtering by <b>{leagueFilter}</b>
            <button type="button" onClick={() => setLeagueFilter(null)} aria-label="Clear competition filter"><X size={13} /></button>
          </div>
        )}

        <Sportsbook
          picks={picks}
          onPick={onPick}
          sport={sport}
          onSportChange={changeSport}
          leagueFilter={leagueFilter}
          onMeta={({ leagues: l, leagueCounts: lc, counts: c }) => { setLeagues(l); setLeagueCounts(lc); setCounts(c); }}
        />
      </div>
    </main>
  );
}