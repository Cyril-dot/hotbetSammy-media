// =============================================================================
// WithdrawalPaidCelebration.tsx — "Withdrawal Paid" confetti celebration.
//
// Shown once, the first time WalletCenter notices a withdrawal transaction
// has moved into a completed state (APPROVED/SETTLED/PAID). Which withdrawal
// ids have already been celebrated is tracked in lib/withdrawalCelebration.ts
// so this never re-fires for the same payout on a later visit/refresh.
// =============================================================================

import { CheckCircle2, X } from "lucide-react";

const CONFETTI_COLORS = ["#f2c866", "#ffe08a", "#ff3449", "#b8f33c", "#ffffff"];

function Confetti() {
  const pieces = Array.from({ length: 80 });
  return (
    <div className="wpc-confetti" aria-hidden="true">
      {pieces.map((_, i) => (
        <span
          key={i}
          style={{
            left: `${(i * 12.5) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 12) * 0.16}s`,
            animationDuration: `${2.2 + (i % 6) * 0.3}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function WithdrawalPaidCelebration({
  amount, currencyCode, onClose,
}: { amount: number; currencyCode: string; onClose: () => void }) {
  return (
    <div className="wpc-overlay" role="dialog" aria-modal="true">
      <WithdrawalPaidCelebrationStyles />
      <Confetti />

      <button className="wpc-close" type="button" onClick={onClose} aria-label="Close">
        <X size={20} />
      </button>

      <div className="wpc-card">
        <div className="wpc-icon"><CheckCircle2 size={40} /></div>
        <h2>Withdrawal Paid</h2>
        <p className="wpc-amount">{currencyCode} {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        <p className="wpc-thanks">Thanks for using HotBet!</p>
        <button className="wpc-done" type="button" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}

function WithdrawalPaidCelebrationStyles() {
  return (
    <style>{`
      .wpc-overlay{
        position:fixed; inset:0; z-index:200; overflow:hidden;
        background:radial-gradient(circle at 50% 25%, rgba(38,28,8,.97), rgba(3,3,4,.99));
        display:flex; align-items:center; justify-content:center;
        padding:20px; padding-top:max(20px, env(safe-area-inset-top)); padding-bottom:max(20px, env(safe-area-inset-bottom));
      }
      .wpc-close{
        position:absolute; top:16px; right:16px; z-index:20; width:38px; height:38px; border-radius:50%;
        display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,.1);
        border:1px solid rgba(255,255,255,.16); color:#fff; cursor:pointer;
      }
      .wpc-card{
        position:relative; z-index:1; width:100%; max-width:360px; text-align:center;
        display:flex; flex-direction:column; align-items:center; gap:6px;
        padding:36px 26px 30px; border-radius:20px;
        background:linear-gradient(160deg, rgba(38,30,14,.92), rgba(10,9,6,.96));
        border:1px solid rgba(242,200,102,.35);
        box-shadow:0 24px 60px rgba(0,0,0,.5), inset 0 1px rgba(255,255,255,.06);
      }
      .wpc-icon{
        display:flex; align-items:center; justify-content:center;
        width:76px; height:76px; border-radius:50%; margin-bottom:8px;
        background:radial-gradient(circle, rgba(242,200,102,.22), rgba(242,200,102,.05));
        color:#f2c866;
        box-shadow:0 0 0 1px rgba(242,200,102,.35), 0 12px 30px rgba(242,200,102,.22);
      }
      .wpc-card h2{
        margin:0; font:900 26px 'Barlow Condensed',sans-serif; letter-spacing:.02em; text-transform:uppercase;
        background:linear-gradient(90deg,#f2c866 0%,#ffffff 35%,#f2c866 55%,#ffe08a 100%);
        background-size:200% auto; -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text;
        animation:wpc-shimmer 2.4s linear infinite;
      }
      .wpc-amount{ margin:2px 0 0; font:800 26px 'DM Sans',sans-serif; color:#fff; letter-spacing:-.01em; }
      .wpc-thanks{ margin:2px 0 18px; font-size:.86rem; color:rgba(255,255,255,.72); }
      .wpc-done{
        width:100%; min-height:48px; border-radius:12px; font:800 .88rem 'DM Sans',sans-serif;
        background:linear-gradient(135deg,#f2c866,#c9822a); color:#20140a; cursor:pointer;
        box-shadow:0 10px 24px rgba(201,130,42,.35);
      }

      .wpc-confetti{ position:absolute; inset:0; overflow:hidden; pointer-events:none; z-index:0; }
      .wpc-confetti span{
        position:absolute; top:-12px; width:9px; height:16px; opacity:.92; border-radius:2px;
        animation-name:wpc-fall; animation-timing-function:linear; animation-iteration-count:infinite;
      }
      @keyframes wpc-fall{
        0%{ transform:translateY(-12px) rotate(0deg); opacity:1; }
        100%{ transform:translateY(120vh) rotate(420deg); opacity:0; }
      }
      @keyframes wpc-shimmer{ 0%{ background-position:-200% center; } 100%{ background-position:200% center; } }
    `}</style>
  );
}
