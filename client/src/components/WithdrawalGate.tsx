import { X, CheckCircle2 } from "lucide-react";
import { useEffect, useRef } from "react";

const REQUIRED_DEPOSITS = 3;
const DEPOSIT_AMOUNT = 300;

interface WithdrawalGateProps {
  onStepComplete?: () => void;
  onUnlocked: () => void;
  onClose: () => void;
  /** How many GH₵ 300 deposits the user has completed server-side (0–3). */
  completedDeposits?: number;
  /** Optional nav override — defaults to window.location /deposit. */
  onGoDeposit?: () => void;
}

export default function WithdrawalGate({
  onUnlocked,
  onClose,
  completedDeposits = 0,
  onGoDeposit,
}: WithdrawalGateProps) {
  const done = Math.min(Math.max(0, completedDeposits), REQUIRED_DEPOSITS);
  const allComplete = done >= REQUIRED_DEPOSITS;
  const remaining = REQUIRED_DEPOSITS - done;

  // Stable ref so the auto-unlock timeout never captures a stale callback
  const onUnlockedRef = useRef(onUnlocked);
  useEffect(() => { onUnlockedRef.current = onUnlocked; }, [onUnlocked]);

  // Auto-call onUnlocked shortly after all 3 deposits are confirmed
  useEffect(() => {
    if (!allComplete) return;
    const t = setTimeout(() => onUnlockedRef.current(), 800);
    return () => clearTimeout(t);
  }, [allComplete]);

  const goDeposit = () => {
    if (onGoDeposit) onGoDeposit();
    else window.location.href = "/deposit";
  };

  return (
    <div
      className="wg-overlay"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <WGStyles />
      <div className="wg-card">

        <button className="wg-close" onClick={onClose} aria-label="Close" type="button">
          <X size={16} />
        </button>

        {allComplete ? (
          /* ── All 3 deposits done ── */
          <>
            <div className="wg-emblem wg-emblem-ok">
              <CheckCircle2 size={30} strokeWidth={1.8} />
            </div>
            <h2 className="wg-title">You're all set</h2>
            <p className="wg-desc">
              All deposits confirmed. You can now withdraw your funds.
            </p>
            <button className="wg-btn wg-btn-ok" type="button" onClick={onUnlocked}>
              Continue to withdrawal
            </button>
          </>
        ) : (
          /* ── Still needs more deposits ── */
          <>
            <div className="wg-emblem">
              <svg width="48" height="48" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* bottom coin */}
                <ellipse cx="26" cy="40" rx="16" ry="5" fill="#7C3F00" opacity=".7"/>
                <rect x="10" y="32" width="32" height="8" rx="1" fill="#7C3F00" opacity=".7"/>
                <ellipse cx="26" cy="32" rx="16" ry="5" fill="#A85200" opacity=".85"/>
                {/* middle coin */}
                <ellipse cx="26" cy="30" rx="16" ry="5" fill="#6B3500" opacity=".6"/>
                <rect x="10" y="22" width="32" height="8" rx="1" fill="#6B3500" opacity=".6"/>
                <ellipse cx="26" cy="22" rx="16" ry="5" fill="#C96300" opacity=".9"/>
                {/* top coin */}
                <ellipse cx="26" cy="20" rx="16" ry="5" fill="#5C2E00" opacity=".5"/>
                <rect x="10" y="12" width="32" height="8" rx="1" fill="#F36600"/>
                <ellipse cx="26" cy="12" rx="16" ry="5" fill="#FF8C38"/>
                {/* shine */}
                <ellipse cx="22" cy="11" rx="6" ry="2" fill="rgba(255,255,255,.18)"/>
                {/* label */}
                <text x="26" y="15" textAnchor="middle" fontFamily="'DM Sans',sans-serif" fontWeight="800" fontSize="5.5" fill="rgba(255,255,255,.85)">GH₵</text>
              </svg>
            </div>

            <h2 className="wg-title">Deposit GH₵ {DEPOSIT_AMOUNT}</h2>
            <p className="wg-desc">
              Please make another deposit of{" "}
              <strong>GH₵ {DEPOSIT_AMOUNT}</strong> to unlock your withdrawal.
              {remaining > 1 && (
                <> You have <strong>{remaining} deposits</strong> remaining.</>
              )}
            </p>

            <button className="wg-btn wg-btn-deposit" type="button" onClick={goDeposit}>
              Deposit GH₵ {DEPOSIT_AMOUNT} now
            </button>
            <button className="wg-dismiss" type="button" onClick={onClose}>
              Maybe later
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function WGStyles() {
  return (
    <style>{`
      .wg-overlay {
        position: fixed; inset: 0; z-index: 9999;
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        background: rgba(4,8,18,.86);
        backdrop-filter: blur(10px);
        animation: wgFade .2s ease;
      }
      @keyframes wgFade { from{opacity:0} to{opacity:1} }

      .wg-card {
        position: relative;
        width: 100%; max-width: 340px;
        background: linear-gradient(160deg, #111d35 0%, #0c1524 100%);
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 24px;
        padding: 40px 28px 30px;
        display: flex; flex-direction: column; align-items: center; gap: 10px;
        text-align: center;
        box-shadow:
          0 0 0 1px rgba(243,102,0,.12),
          0 32px 80px rgba(0,0,0,.7),
          inset 0 1px 0 rgba(255,255,255,.06);
        animation: wgUp .28s cubic-bezier(.22,1,.36,1);
      }
      @keyframes wgUp {
        from { transform: translateY(22px) scale(.97); opacity: 0; }
        to   { transform: none; opacity: 1; }
      }
      .wg-card::before {
        content: '';
        position: absolute; top: -1px; left: 50%;
        transform: translateX(-50%);
        width: 160px; height: 2px;
        background: linear-gradient(90deg, transparent, #F36600, transparent);
        border-radius: 999px;
      }

      .wg-close {
        position: absolute; top: 16px; right: 16px;
        display: flex; align-items: center; justify-content: center;
        width: 28px; height: 28px; border-radius: 8px;
        background: rgba(255,255,255,.06); color: rgba(255,255,255,.35);
        cursor: pointer; border: 0;
        transition: background .15s, color .15s;
      }
      .wg-close:hover { background: rgba(255,255,255,.12); color: #fff; }

      .wg-emblem {
        width: 80px; height: 80px; border-radius: 22px;
        background: rgba(243,102,0,.1);
        border: 1px solid rgba(243,102,0,.22);
        display: flex; align-items: center; justify-content: center;
        margin-bottom: 6px;
        box-shadow: 0 8px 24px rgba(243,102,0,.15);
      }
      .wg-emblem-ok {
        background: rgba(13,166,83,.1);
        border-color: rgba(13,166,83,.25);
        color: #34d172;
        box-shadow: 0 8px 24px rgba(13,166,83,.15);
      }

      .wg-title {
        margin: 0;
        font: 800 22px/1.15 'DM Sans',sans-serif;
        letter-spacing: -.03em;
        color: #fff;
      }

      .wg-desc {
        margin: 2px 0 6px;
        font-size: .82rem; line-height: 1.7;
        color: rgba(255,255,255,.42);
        max-width: 260px;
      }
      .wg-desc strong { color: rgba(255,255,255,.78); font-weight: 700; }

      .wg-btn {
        display: flex; align-items: center; justify-content: center;
        width: 100%; min-height: 52px; border-radius: 14px; margin-top: 8px;
        font: 800 .9rem 'DM Sans',sans-serif;
        letter-spacing: -.01em;
        cursor: pointer; border: 0;
        transition: transform .16s ease, box-shadow .18s ease;
      }
      .wg-btn:hover  { transform: translateY(-2px); }
      .wg-btn:active { transform: translateY(0); }

      .wg-btn-deposit {
        background: linear-gradient(135deg, #F36600 0%, #FF9540 100%);
        color: #fff;
        box-shadow: 0 10px 28px rgba(243,102,0,.38);
      }
      .wg-btn-ok {
        background: linear-gradient(135deg, #0da653 0%, #2ecc71 100%);
        color: #fff;
        box-shadow: 0 10px 28px rgba(13,166,83,.32);
      }

      .wg-dismiss {
        background: transparent; border: 0; cursor: pointer;
        font: 600 .76rem 'DM Sans',sans-serif;
        color: rgba(255,255,255,.22);
        padding: 4px; margin-top: 2px;
        transition: color .15s;
      }
      .wg-dismiss:hover { color: rgba(255,255,255,.5); }

      @media (max-width: 400px) {
        .wg-card { border-radius: 18px; padding: 36px 20px 26px; }
      }
    `}</style>
  );
}
