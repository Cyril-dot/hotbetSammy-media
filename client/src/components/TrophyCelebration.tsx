import { useState } from "react";
import { useLocation } from "wouter";
import { Share2, Ticket, Trophy, X } from "lucide-react";
import type { Bet } from "@/lib/api";
import { markBetWon } from "@/lib/withdrawalGate";
import { pickUserField } from "@/lib/session";
import { useSession } from "@/lib/session";
import { currencyForCountry } from "@/lib/countries";

// Trophy artwork — place your custom image at client/public/hotbetTrophy.png
// (Vite serves everything under client/public/ from the site root, so it's
// referenced here as "/hotbetTrophy.png", not a relative import).
// A hotbetAltTrophy.png is also already in client/public/ as an alternative.
const TROPHY_SRC = "/hotbetTrophy.png";
// Fallback image in case hotbetTrophy.png is missing — uses the existing
// hotbetAltTrophy.png that ships with the project.
const TROPHY_FALLBACK_SRC = "/hotbetAltTrophy.png";

const CONFETTI_COLORS = ["#ff3449", "#b8f33c", "#f2c866", "#0da653", "#ffffff"];

function Confetti() {
  const pieces = Array.from({ length: 90 });
  return (
    <div className="wc-confetti" aria-hidden="true">
      {pieces.map((_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 11) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 12) * 0.18}s`,
            animationDuration: `${2.4 + (i % 6) * 0.35}s`,
          }}
        />
      ))}
    </div>
  );
}

export function verifyCode(bet: Bet): string {
  const raw = bet.id.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  return `GH${raw.slice(0, 4)}${raw.slice(-6)}`;
}

/**
 * Full-screen "YOU WON" celebration, styled after the reference win-modal
 * design: edge-to-edge overlay, shimmering headline pinned near the top,
 * the trophy filling the middle of the screen, verify code + actions
 * pinned to the bottom. Used both by WinCelebrationModal (auto popup for
 * unseen wins) and by the "View winning trophy" button on a won ticket's
 * details page.
 */
export default function TrophyCelebration({ bet, onClose, showConfetti = true }: { bet: Bet; onClose: () => void; showConfetti?: boolean }) {
  const [, setLocation] = useLocation();
  const { user } = useSession();
  const [trophySrc, setTrophySrc] = useState(TROPHY_SRC);
  const [generating, setGenerating] = useState(false);
  const code = verifyCode(bet);
  const userCountry = pickUserField(user, "country", "countryCode", "country_code");
  const { code: currency } = currencyForCountry(userCountry);

  // Record the win in the withdrawal gate so the Withdraw button unlocks
  const handleClose = () => {
    const userId = pickUserField(user, "id", "userId", "accountId");
    const country = (() => {
      const raw = pickUserField(user, "country", "countryCode", "country_code");
      return raw.toUpperCase().startsWith("NG") ? "NG" : "GH";
    })();
    if (userId) markBetWon(userId, country);
    onClose();
  };

  const showOff = async () => {
    setGenerating(true);
    const text = `I just won ${currency} ${bet.potentialReturn.toFixed(2)} on HotBet! 🏆`;
    try {
      if (navigator.share) await navigator.share({ text });
      else await navigator.clipboard.writeText(text);
    } catch { /* user cancelled share — no-op */ }
    finally { setGenerating(false); }
  };

  const viewTicket = () => {
    handleClose();
    setLocation(`/bets/${bet.id}`);
  };

  return (
    <div className="wc-overlay" role="dialog" aria-modal="true">
      <TrophyCelebrationStyles />
      {showConfetti && <Confetti />}

      <button className="wc-close" type="button" onClick={handleClose} aria-label="Close">
        <X size={20} />
      </button>

      <div className="wc-stage">
        <div className="wc-headline">
          <h1 className="wc-shimmer">YOU WON</h1>
        </div>

        <div className="wc-amount">
          {currency} {bet.potentialReturn.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>

        <div className="wc-trophy-stage">
          <div className="wc-trophy">
            <img
              src={trophySrc}
              alt="Winner's Trophy"
              onError={() => {
                // If the primary image fails, try hotbetAltTrophy.png as fallback
                if (trophySrc !== TROPHY_FALLBACK_SRC) setTrophySrc(TROPHY_FALLBACK_SRC);
              }}
            />
          </div>
        </div>

        <div className="wc-bottom">
          <p className="wc-percentile">You have won more than <b>96%</b> of all users.</p>
          <div className="wc-code">Verify Code: <b>{code}</b></div>

          <button type="button" className="wc-view-ticket" onClick={viewTicket}>
            <Ticket size={14} /> View ticket details
          </button>

          <div className="wc-actions">
            <button type="button" className="wc-details" onClick={handleClose}>Close</button>
            <button type="button" className="wc-showoff" onClick={showOff} disabled={generating}>
              <Share2 size={14} /> {generating ? "Sharing…" : "Show Off"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TrophyCelebrationStyles() {
  return (
    <style>{`
      .wc-overlay{
        position:fixed; inset:0; z-index:200; overflow:hidden;
        background:radial-gradient(circle at 50% 20%, rgba(24,18,8,.97), rgba(3,3,4,.99));
        display:flex; flex-direction:column; align-items:center;
        padding-top:max(20px, env(safe-area-inset-top)); padding-bottom:max(24px, env(safe-area-inset-bottom));
      }
      .wc-close{
        position:absolute; top:16px; right:16px; z-index:20; width:38px; height:38px; border-radius:50%;
        display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,.1);
        border:1px solid rgba(255,255,255,.16); color:#fff; cursor:pointer;
      }
      .wc-stage{
        position:relative; z-index:1; width:100%; max-width:480px; flex:1; min-height:0;
        display:flex; flex-direction:column; align-items:center; padding:0 20px;
        overflow-y:auto; overflow-x:hidden;
      }
      .wc-headline{ flex-shrink:0; margin-top:32px; text-align:center; }
      .wc-shimmer{
        margin:0; font:900 44px/1 'Barlow Condensed',sans-serif; letter-spacing:.04em;
        background:linear-gradient(90deg,#f2c866 0%,#ffffff 35%,#f2c866 55%,#ff9a3c 100%);
        background-size:200% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
        animation:wc-shimmer 2.4s linear infinite;
      }
      .wc-amount{
        flex-shrink:0; margin-top:10px; text-align:center; font:900 28px/1.1 'DM Sans',sans-serif;
        color:#fff; letter-spacing:-.01em; text-shadow:0 2px 16px rgba(0,0,0,.5);
      }
      .wc-trophy-stage{
        position:relative; flex:1 1 auto; min-height:140px; width:100%; display:flex; align-items:center; justify-content:center;
        overflow:hidden; padding:6px 0;
      }
      .wc-trophy{
        position:relative; display:flex; align-items:center; justify-content:center; color:#5a3c0d;
        width:min(300px,70vw,34vh); height:min(300px,70vw,34vh);
        animation:wc-trophy-pulse 3.2s ease-in-out infinite;
      }
      @keyframes wc-trophy-pulse{ 0%,100%{ transform:scale(1); } 50%{ transform:scale(1.035); } }
      .wc-trophy img{ width:100%; height:100%; object-fit:contain; filter:drop-shadow(0 18px 36px rgba(201,130,42,.55)) drop-shadow(0 0 46px rgba(242,200,102,.35)); }
      .wc-trophy-fallback{
        width:180px; height:180px; border-radius:50%; background:radial-gradient(circle,#f6cf74,#c9822a 70%);
        box-shadow:0 14px 32px rgba(201,130,42,.45);
      }
      .wc-bottom{ position:relative; z-index:2; flex-shrink:0; width:100%; padding-bottom:6px; text-align:center; background:transparent; }
      .wc-percentile{ margin:0 0 12px; color:#ff3449; font-size:.84rem; font-weight:700; }
      .wc-percentile b{ color:#ff3449; }
      .wc-code{ color:rgba(255,255,255,.7); font-size:.8rem; margin-bottom:16px; }
      .wc-code b{ color:#ff3449; letter-spacing:.03em; }
      .wc-view-ticket{
        display:flex; align-items:center; justify-content:center; gap:6px; width:100%; margin-bottom:14px;
        padding:13px 10px; border-radius:12px; background:rgba(242,200,102,.14); border:1px solid rgba(242,200,102,.4);
        color:#f2c866; font-size:.82rem; font-weight:800; cursor:pointer;
      }
      .wc-actions{ display:flex; gap:12px; }
      .wc-details,.wc-showoff{
        flex:1; display:flex; align-items:center; justify-content:center; gap:6px; padding:15px 10px;
        border-radius:14px; font-size:.86rem; font-weight:800; cursor:pointer;
      }
      .wc-details{ background:rgba(255,255,255,.08); border:1.5px solid rgba(255,255,255,.24); color:#fff; }
      .wc-showoff{ background:linear-gradient(135deg,#ff3449,#c81530); color:#fff; border:none; box-shadow:0 6px 20px rgba(255,52,73,.35); }
      .wc-showoff:disabled{ opacity:.6; cursor:default; }

      .wc-confetti{ position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:0; }
      .wc-confetti span{
        position:absolute; top:-12px; width:9px; height:16px; opacity:.92; border-radius:2px;
        animation-name:wc-fall; animation-timing-function:linear; animation-iteration-count:infinite;
      }
      @keyframes wc-fall{
        0%{ transform:translateY(-12px) rotate(0deg); opacity:1; }
        100%{ transform:translateY(120vh) rotate(420deg); opacity:0; }
      }
      @keyframes wc-shimmer{ 0%{ background-position:-200% center; } 100%{ background-position:200% center; } }

      @media(max-width:380px){ .wc-shimmer{ font-size:36px; } .wc-amount{ font-size:24px; } }
    `}</style>
  );
}