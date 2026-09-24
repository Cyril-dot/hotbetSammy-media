import { Check, Copy, KeyRound } from "lucide-react";
import { useState } from "react";

export default function AdminBookingCodeNotice({
  code,
  error,
}: {
  code?: string | null;
  error?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");

  if (!code && !error) return null;

  const copyCode = async () => {
    if (!code) return;
    setCopyError("");
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopyError("Clipboard access was unavailable. Select the code and copy it manually.");
    }
  };

  return (
    <section className={`admin-booking-code-notice${error ? " has-error" : ""}`} aria-live="polite">
      {code ? (
        <>
          <div className="admin-booking-code-heading">
            <span className="admin-booking-code-icon"><KeyRound size={15} /></span>
            <div>
              <h3>Booking code generated</h3>
              <p>Your booking code is ready to share.</p>
            </div>
          </div>
          <div className="admin-booking-code-value">
            <code>{code}</code>
            <button type="button" onClick={copyCode} aria-label="Copy admin booking code">
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? "Copied" : "Copy code"}
            </button>
          </div>
          {copyError && <small className="admin-booking-code-error">{copyError}</small>}
        </>
      ) : null}
      {error && <p className="admin-booking-code-error">{error}</p>}
      <style>{`
        .admin-booking-code-notice{display:grid;gap:12px;margin:12px 0;padding:14px;border:1px solid rgba(243,102,0,.38);border-radius:12px;background:linear-gradient(135deg,rgba(243,102,0,.14),rgba(16,21,28,.96));color:#f4f7f5}
        .admin-booking-code-heading{display:flex;align-items:flex-start;gap:10px}
        .admin-booking-code-icon{display:grid;place-items:center;flex:0 0 30px;width:30px;height:30px;border-radius:9px;background:rgba(243,102,0,.2);color:#ffad70}
        .admin-booking-code-eyebrow{display:block;color:#ffad70;font-size:9px;font-weight:900;letter-spacing:.12em}
        .admin-booking-code-heading h3{margin:3px 0 3px;font-size:14px}
        .admin-booking-code-heading p{margin:0;color:#aebbc4;font-size:11px;line-height:1.45}
        .admin-booking-code-value{display:flex;align-items:stretch;gap:8px}
        .admin-booking-code-value code{display:flex;align-items:center;min-width:0;flex:1;padding:10px 11px;border:1px solid #3b4b57;border-radius:8px;background:#070b10;color:#ffd19e;font:800 14px ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.08em;overflow-wrap:anywhere}
        .admin-booking-code-value button{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;border-radius:8px;padding:0 12px;background:#f97316;color:#fff;font-size:11px;font-weight:900;cursor:pointer;white-space:nowrap}
        .admin-booking-code-value button:hover{background:#fb923c}
        .admin-booking-code-error{margin:0;color:#ffb4b4;font-size:10px;line-height:1.45}
        .admin-booking-code-notice.has-error{border-color:rgba(239,68,68,.38)}
        @media(max-width:520px){.admin-booking-code-value{display:grid}.admin-booking-code-value button{min-height:38px}}
      `}</style>
    </section>
  );
}

export type AdminBookingCodeNoticeProps = {
  code?: string | null;
  error?: string;
};
