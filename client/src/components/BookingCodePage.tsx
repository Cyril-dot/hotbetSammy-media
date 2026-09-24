import { useState } from "react";
import { useLocation } from "wouter";
import { Ticket, CheckCircle2, ChevronRight, Search, ArrowLeft, Loader2, CircleCheck, CircleX } from "lucide-react";
import api, { ApiError, type RedeemResponse } from "../lib/api";
import { useSession, pickUserField } from "@/lib/session";
import { currencyForCountry } from "@/lib/countries";

type LoadedMatch = {
  home: string;
  away: string;
  market: string;
  selection: string;
  odd: number;
};

type LoadedBet = {
  id?: string;
  code: string;
  matches: LoadedMatch[];
  totalOdd: number;
  sport?: string;
  rawSelections: Record<string, unknown>[];
};

// ---------------------------------------------------------------------------
// Helpers — mirror BetslipPage.tsx's BookingCodePanel mapping, since that's
// the shape /api/booking/redeem actually returns:
//   { booking, enrichedSelections, currentTotalOdds }
// ---------------------------------------------------------------------------

function buildMatchLabel(s: Record<string, unknown>): { home: string; away: string } {
  const home = (s.homeTeam ?? s.home_team) as string | undefined;
  const away = (s.awayTeam ?? s.away_team) as string | undefined;
  if (home && away) return { home, away };
  if (typeof s.matchLabel === "string" && s.matchLabel.includes(" vs ")) {
    const [h, a] = (s.matchLabel as string).split(" vs ");
    return { home: h?.trim() ?? "", away: a?.trim() ?? "" };
  }
  if (typeof s.match === "string" && s.match.includes(" vs ")) {
    const [h, a] = (s.match as string).split(" vs ");
    return { home: h?.trim() ?? "", away: a?.trim() ?? "" };
  }
  return { home: home ?? "TBD", away: away ?? "TBD" };
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

function mapRedeemResponse(trimmedCode: string, data: RedeemResponse): LoadedBet {
  const booking = data.booking as unknown as Record<string, unknown>;
  const rawSelections = data.enrichedSelections ?? [];
  const matches: LoadedMatch[] = rawSelections.map((sel) => {
    const { home, away } = buildMatchLabel(sel);
    return {
      home,
      away,
      market: String(sel.market ?? sel.marketKey ?? ""),
      selection: String(sel.selection ?? sel.pick ?? sel.name ?? sel.label ?? ""),
      odd: extractOdds(sel),
    };
  });
  const totalOdd =
      typeof data.currentTotalOdds === "number"
      ? data.currentTotalOdds
      : Number(booking.totalOdds ?? 0);

  return {
    id: typeof booking.id === "string" ? booking.id : undefined,
    code: String(booking.code ?? trimmedCode),
    matches,
    totalOdd,
    rawSelections,
  };
}

export default function BookingCodePage() {
  const [, setLocation] = useLocation();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [bet, setBet] = useState<LoadedBet | null>(null);

  const { user } = useSession();
  const userCountry = pickUserField(user, "country", "countryCode", "country_code");
  const { code: currency } = currencyForCountry(userCountry);
  const MIN_STAKE = currency === "NGN" ? 13000 : 1;
  const QUICK_STAKES = currency === "NGN"
    ? [13000, 20000, 50000, 100000]
    : [1, 5, 10, 20, 50];

  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [placeError, setPlaceError] = useState("");
  const [stake, setStake] = useState<string>("");

  const handleLoad = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) {
      setError("Please enter a booking code.");
      return;
    }
    setError("");
    setLoading(true);
    setBet(null);
    try {
      // The real endpoint is POST /api/booking/redeem (api.booking.redeem),
      // not api.bookingCodes.load — that method never existed, which is why
      // every code used to fail with a generic "not found" message.
      const result = await api.booking.redeem({ code: trimmed });
      const mapped = mapRedeemResponse(trimmed, result.data);
      if (mapped.matches.length === 0) {
        setError("That code has no valid selections right now.");
        return;
      }
      setBet(mapped);
    } catch (err: unknown) {
      setError(
        err instanceof ApiError && err.message
          ? err.message
          : "Booking code not found. Please check the code and try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleLoad();
  };

  const handlePlace = async () => {
    if (!bet || placing) return;
    setPlaceError("");
    setPlacing(true);
    try {
      // Build selections from the raw enrichedSelections returned by /api/booking/redeem
      const selections = bet.rawSelections.map((sel) => ({
        matchId: String(sel.matchId ?? sel.match_id ?? sel.fixtureId ?? sel.fixture_id ?? ""),
        market:  String(sel.market ?? sel.marketKey ?? ""),
        selection: String(sel.selection ?? sel.pick ?? sel.name ?? sel.label ?? ""),
        submittedOdds: (() => {
          const candidates = [sel.currentOdds, sel.oddsLocked, sel.odds, sel.value, sel.odd, sel.price];
          for (const raw of candidates) { const n = Number(raw); if (!Number.isNaN(n) && n > 1) return n; }
          return 1;
        })(),
      })).filter(s => s.matchId);

      if (selections.length === 0) {
        setPlaceError("Could not extract match IDs from this booking code. Please add to betslip manually.");
        return;
      }

      const stakeNum = parseFloat(stake);
      if (!stakeNum || stakeNum < MIN_STAKE) {
        setPlaceError(`Minimum stake is ${currency} ${MIN_STAKE.toLocaleString()}.`);
        setPlacing(false);
        return;
      }
      await api.bets.place({
        stake: stakeNum,
        currency,
        selections,
        bookingCodeUsedId: bet.id,
      });
      setPlaced(true);
      setTimeout(() => setLocation("/open-bets"), 1400);
    } catch (err) {
      setPlaceError(err instanceof ApiError ? err.message : "Could not place bet. Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  return (
    <main className="wrap simple-page" style={{ maxWidth: 560, margin: "0 auto", paddingTop: 24 }}>
      {/* Back button */}
      <button
        type="button"
        onClick={() => setLocation("/")}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: "none",
          border: "none",
          color: "var(--muted)",
          fontSize: 13,
          cursor: "pointer",
          padding: "0 0 18px",
        }}
      >
        <ArrowLeft size={15} /> Back to home
      </button>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: "var(--orange,#F36600)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Ticket size={20} color="#0f0f0f" />
        </span>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Load booking code</h2>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", marginTop: 2 }}>
            Enter a code shared by another user to copy their bet slip.
          </p>
        </div>
      </div>

      {/* Input card */}
      <section
        className="panel"
        style={{
          marginTop: 22,
          padding: "20px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Booking code
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              onKeyDown={handleKeyDown}
              placeholder="e.g. RBGH12345"
              maxLength={20}
              style={{
                flex: 1,
                padding: "10px 13px",
                borderRadius: 8,
                border: "1px solid var(--border)",
                background: "var(--surface)",
                color: "var(--text)",
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: "0.1em",
                outline: "none",
              }}
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={handleLoad}
              disabled={loading}
              className="gold-button"
              style={{ minWidth: 52, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 16px" }}
            >
              {loading ? <Loader2 size={17} style={{ animation: "spin 0.8s linear infinite" }} /> : <Search size={17} />}
            </button>
          </div>
        </label>

        {error && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 13px",
              borderRadius: 8,
              background: "rgba(220,60,60,0.08)",
              color: "#e05050",
              fontSize: 13,
            }}
          >
            <CircleX size={15} />
            {error}
          </div>
        )}

        {/* Loaded bet preview */}
        {bet && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: "var(--nature, #4caf50)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <CircleCheck size={15} />
              Booking code loaded — {bet.matches?.length ?? 0} selection{(bet.matches?.length ?? 0) !== 1 ? "s" : ""}
            </div>

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {(bet.matches ?? []).map((m, i) => (
                <div
                  key={i}
                  style={{
                    padding: "11px 14px",
                    borderBottom: i < (bet.matches?.length ?? 0) - 1 ? "1px solid var(--border)" : "none",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.4 }}>
                      {m.home} <span style={{ color: "var(--muted)", fontWeight: 400 }}>vs</span> {m.away}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                      {m.market} · <strong style={{ color: "var(--text)" }}>{m.selection}</strong>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "var(--orange,#F36600)",
                      flexShrink: 0,
                    }}
                  >
                    {m.odd.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "var(--surface)",
                borderRadius: 8,
                fontSize: 13,
              }}
            >
              <span style={{ color: "var(--muted)" }}>Total odds</span>
              <strong style={{ color: "var(--orange,#F36600)", fontSize: 15 }}>
                {bet.totalOdd?.toFixed(2) ?? "—"}
              </strong>
            </div>

            {/* ── Stake input ── */}
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              <label style={{ fontSize:12, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                Stake ({currency})
              </label>
              <input
                type="number"
                min={MIN_STAKE}
                value={stake}
                onChange={e => { setStake(e.target.value); setPlaceError(""); }}
                placeholder={`Min ${currency} ${MIN_STAKE.toLocaleString()}`}
                style={{ padding:"11px 13px", borderRadius:8, border:"1px solid var(--border)", background:"var(--surface)", color:"var(--text)", fontSize:15, fontWeight:700, outline:"none", width:"100%", boxSizing:"border-box" as const }}
              />
              <div style={{ display:"flex", gap:7, flexWrap:"wrap" as const }}>
                {QUICK_STAKES.map(q => (
                  <button
                    key={q} type="button"
                    onClick={() => { setStake(String(q)); setPlaceError(""); }}
                    style={{ padding:"6px 13px", borderRadius:999, border:"1px solid var(--border)", background: stake === String(q) ? "var(--orange,#F36600)" : "#f3f4f6", color: stake === String(q) ? "#fff" : "#5f6673", fontSize:12, fontWeight:700, cursor:"pointer" }}
                  >
                    {currency === "NGN"
                      ? (q >= 1000 ? `₦${q/1000}k` : `₦${q}`)
                      : `GHS ${q}`}
                  </button>
                ))}
              </div>
              <div style={{ fontSize:11, color:"var(--muted)" }}>
                Potential return: <strong style={{ color:"var(--orange,#F36600)" }}>
                  {stake && !isNaN(parseFloat(stake))
                    ? `${currency} ${(parseFloat(stake) * (bet?.totalOdd ?? 1)).toFixed(2)}`
                    : "—"}
                </strong>
              </div>
            </div>

            {placeError && (
              <div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 13px", borderRadius:8, background:"rgba(220,60,60,0.08)", color:"#e05050", fontSize:13 }}>
                <CircleX size={15} /> {placeError}
              </div>
            )}

            {placed ? (
              <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, padding:"13px", borderRadius:10, background:"rgba(13,166,83,.12)", color:"var(--live,#00C853)", fontSize:14, fontWeight:700 }}>
                <CheckCircle2 size={18} /> Bet placed! Redirecting to open bets…
              </div>
            ) : (
              <button
                type="button"
                className="gold-button full"
                style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, opacity: placing ? 0.7 : 1 }}
                onClick={handlePlace}
                disabled={placing}
              >
                {placing
                  ? <><Loader2 size={16} style={{ animation:"spin 0.8s linear infinite" }} /> Placing bet…</>
                  : <>Add to open bets <ChevronRight size={15} /></>
                }
              </button>
            )}
          </div>
        )}
      </section>

      {/* Info tip */}
      {!bet && (
        <p
          style={{
            fontSize: 12,
            color: "var(--muted)",
            textAlign: "center",
            marginTop: 20,
            lineHeight: 1.7,
          }}
        >
          Booking codes let you instantly load a pre-built bet shared by another user.
          <br />
          You can find them shared in chats or generated from your own betslip.
        </p>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </main>
  );
}
