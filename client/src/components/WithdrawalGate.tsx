import { CheckCircle2, X } from "lucide-react";

interface WithdrawalGateProps {
  onStepComplete?: () => void;
  onUnlocked: () => void;
  onClose: () => void;
}

/**
 * Transparent withdrawal information panel.
 *
 * Withdrawals must never require an upfront fee, a qualifying deposit, or a
 * bet before a user can request access to their available funds. Normal
 * account/KYC checks and ordinary finance review remain separate concerns.
 */
export default function WithdrawalGate({ onUnlocked, onClose }: WithdrawalGateProps) {
  return (
    <section className="wg-wrap" aria-label="Withdrawal information">
      <div className="wg-header">
        <h2>Withdrawal information</h2>
        <button className="wg-close" onClick={onClose} aria-label="Close" type="button">
          <X size={18} />
        </button>
      </div>
      <div className="wg-panel wg-panel-success">
        <div className="wg-step-icon wg-icon-ok"><CheckCircle2 size={32} /></div>
        <h3>No deposit is required</h3>
        <p className="wg-desc">
          You can request a withdrawal from your available balance without paying a fee or making
          additional deposits. Requests may be reviewed for account security and compliance.
        </p>
        <button className="wg-submit-btn" type="button" onClick={onUnlocked}>
          Continue to withdrawal
        </button>
      </div>
      <style>{`
        .wg-wrap{background:#fff;border:1px solid var(--line,#e8e8e8);border-radius:16px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.1);margin-top:8px}
        .wg-header{display:flex;align-items:center;justify-content:space-between;padding:18px 20px 14px;border-bottom:1px solid var(--line,#e8e8e8)}
        .wg-header h2{margin:0;font:800 17px 'DM Sans',sans-serif;color:#20242d}
        .wg-close{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;background:#f4f4f6;color:#5f6673;cursor:pointer;border:0}
        .wg-panel{padding:20px;display:flex;flex-direction:column;gap:14px}
        .wg-panel-success{background:#f6fff9}
        .wg-step-icon{width:56px;height:56px;border-radius:16px;display:flex;align-items:center;justify-content:center}
        .wg-icon-ok{background:rgba(13,166,83,.12);color:var(--nature,#0da653)}
        .wg-panel h3{margin:0;font:800 18px 'DM Sans',sans-serif;color:#20242d}
        .wg-desc{margin:0;font-size:.84rem;color:#5f6673;line-height:1.6}
        .wg-submit-btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;border-radius:10px;font:800 .86rem 'DM Sans',sans-serif;color:#fff;background:var(--red,#F36600);cursor:pointer;border:0;text-decoration:none;margin-top:4px}
      `}</style>
    </section>
  );
}
