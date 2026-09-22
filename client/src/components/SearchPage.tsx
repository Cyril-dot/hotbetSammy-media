import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Clock3, Search as SearchIcon, X } from "lucide-react";
import { getSearchableMatches, isMatchLive, formatKickoff, type EnrichedMatch } from "@/lib/sportsbook";
import { LiveClock } from "./Sportsbook";

const RECENT_KEY = "hotbet_recent_searches_v1";
function loadRecent(): string[] { try { return JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; } }
function saveRecent(list: string[]) { try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8))); } catch { /* ignore */ } }

export default function SearchPage() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<EnrichedMatch[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [recent, setRecent] = useState<string[]>(() => loadRecent());
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    getSearchableMatches().then((m) => { setMatches(m); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !matches) return [];
    return matches.filter((m) =>
      m.homeTeam?.toLowerCase().includes(q) || m.awayTeam?.toLowerCase().includes(q) || (m.league ?? "").toLowerCase().includes(q)
    ).slice(0, 40);
  }, [query, matches]);

  const commit = (q: string) => {
    if (!q.trim()) return;
    const next = [q, ...recent.filter((r) => r !== q)];
    setRecent(next);
    saveRecent(next);
  };

  return (
    <main className="wrap search-page">
      <div className="search-page-bar">
        <SearchIcon size={17} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && commit(query)}
          placeholder="Search teams, leagues, or matches…"
        />
        {query && <button onClick={() => setQuery("")} aria-label="Clear search" type="button"><X size={16} /></button>}
      </div>

      {!query && (
        <section className="panel simple-card">
          {recent.length > 0 && (
            <>
              <div className="module-title"><h3>Recent searches</h3><button className="text-action" onClick={() => { setRecent([]); saveRecent([]); }} type="button">Clear</button></div>
              <div className="search-recent-chips">
                {recent.map((r) => (
                  <button key={r} className="search-recent-chip" onClick={() => setQuery(r)} type="button"><Clock3 size={11} /> {r}</button>
                ))}
              </div>
            </>
          )}
          <p className="muted" style={{ marginTop: recent.length ? 16 : 0 }}>Search across today's, upcoming, and live football fixtures by team or league name.</p>
        </section>
      )}

      {query && (
        <section className="panel simple-card" style={{ padding: 0 }}>
          {loading ? (
            <p className="muted" style={{ padding: 20 }}>Loading match data…</p>
          ) : results.length === 0 ? (
            <div style={{ padding: 24 }}>
              <p className="muted">No results for "{query}".</p>
            </div>
          ) : (
            results.map((m) => {
              const isLive = isMatchLive(m);
              return (
                <Link key={m.id} href={`/match/${m.id}?sport=${encodeURIComponent(m.sport ?? "football")}${m.isAdmin ? "&admin=1" : ""}`} className="search-result-row" onClick={() => commit(query)}>
                  <div>
                    <small>{m.league || "Football"}</small>
                    <b>{m.homeTeam} vs {m.awayTeam}</b>
                  </div>
                  <span className={isLive ? "search-result-live" : "search-result-time"}>
                    {isLive ? <><i className="live-dot" /> <LiveClock match={m} /></> : formatKickoff(m.kickoffAt)}
                  </span>
                </Link>
              );
            })
          )}
        </section>
      )}
    </main>
  );
}