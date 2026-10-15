import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Phone, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import api, { ApiError } from "@/lib/api";
import { emitDataRefresh } from "@/lib/autoRefresh";

/* Deposit centre — Flutterwave v4 Ghana Mobile Money (owner direction
   2026-10-15, replacing Paystack in full: the old momo/bank/card
   channels with their OTP and birthday steps are gone).
   Flow: amount + MoMo number + network → POST
   /api/wallet/deposit/flutterwave/gh/v4/init sends a prompt to the
   phone → the page polls POST .../gh/v4/verify until Flutterwave
   confirms; crediting itself is webhook-first and the verify endpoint
   credits idempotently, so a missed webhook still lands. */

type Phase = "form" | "waiting" | "success" | "failed" | "stalled";
type Payload = Record<string, any>;

const MIN_DEPOSIT = 200;
const QUICK_AMOUNTS = [MIN_DEPOSIT, 500, 1000, 2000, 5000, 10000];

const NETWORKS = [
  ["MTN", "MTN Mobile Money"],
  ["VODAFONE", "Telecel Cash"],
  ["AIRTELTIGO", "AirtelTigo Money"],
] as const;

const GH_PREFIXES: Record<string, string> = {
  "024": "MTN", "025": "MTN", "053": "MTN", "054": "MTN", "055": "MTN", "059": "MTN",
  "020": "VODAFONE", "050": "VODAFONE",
  "026": "AIRTELTIGO", "027": "AIRTELTIGO", "056": "AIRTELTIGO", "057": "AIRTELTIGO",
};
function detectNetwork(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  const local = digits.startsWith("233") && digits.length === 12 ? "0" + digits.slice(3) : digits;
  return GH_PREFIXES[local.slice(0, 3)] ?? "";
}

function payload(response: any): Payload {
  const outer = response?.data && typeof response.data === "object" ? response.data : response;
  return outer?.data && typeof outer.data === "object" ? outer.data : (outer ?? {});
}

/* A gateway 5xx must never surface raw server text to the player;
   genuine 4xx messages (bad amount, bad number) pass through. */
function friendlyError(error: unknown): string {
  const fallback = "Payments are temporarily unavailable — please try again in a few minutes.";
  if (error instanceof ApiError) {
    if (error.status >= 500 || !error.message || /internal server error/i.test(error.message)) return fallback;
    return error.message;
  }
  if (error instanceof Error && error.message && !/internal server error/i.test(error.message)) return error.message;
  return fallback;
}

export default function DepositCenter() {
  const [amount, setAmount] = useState(MIN_DEPOSIT);
  const [phone, setPhone] = useState("");
  const [network, setNetwork] = useState<string>("MTN");
  const [phase, setPhase] = useState<Phase>("form");
  const [txRef, setTxRef] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);

  const checkOnce = async (ref: string): Promise<"paid" | "failed" | "pending"> => {
    const data = payload(await api.deposits.ghVerify(ref));
    const status = String(data.status ?? "").toLowerCase();
    if (data.credited === true || ["succeeded", "successful", "success"].includes(status)) return "paid";
    if (["failed", "declined", "cancelled", "canceled", "expired"].includes(status)) {
      setError(String(data.message || "The payment was not completed. You have not been charged — try again."));
      return "failed";
    }
    return "pending";
  };

  useEffect(() => {
    if (phase !== "waiting" || !txRef) return;
    let cancelled = false;
    let tries = 0;
    const tick = async () => {
      tries += 1;
      try {
        const outcome = await checkOnce(txRef);
        if (cancelled) return;
        if (outcome === "paid") { setPhase("success"); emitDataRefresh("deposit-updated"); return; }
        if (outcome === "failed") { setPhase("form"); return; }
      } catch { /* a failed check is not a failed payment — keep polling */ }
      if (cancelled) return;
      if (tries >= 30) { setPhase("stalled"); return; }
      timer = window.setTimeout(tick, 4000);
    };
    let timer = window.setTimeout(tick, 1200);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, txRef]);

  const start = async () => {
    setError("");
    if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) { setError(`The minimum deposit is GHS ${MIN_DEPOSIT.toLocaleString()}.`); return; }
    if (phone.replace(/\D/g, "").length < 9) { setError("Enter a valid Ghana mobile-money phone number."); return; }
    const chosen = network || detectNetwork(phone);
    if (!chosen) { setError("Choose your network — MTN, Telecel or AirtelTigo."); return; }
    setBusy(true);
    try {
      const data = payload(await api.deposits.ghInit({ amount, phoneNumber: phone.trim(), network: chosen }));
      const ref = String(data.txRef ?? "");
      if (!ref) { setError("The payment could not be started. Try again."); return; }
      setTxRef(ref);
      setPhase("waiting");
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };

  const manualCheck = async () => {
    if (!txRef) return;
    setChecking(true);
    try {
      const outcome = await checkOnce(txRef);
      if (outcome === "paid") { setPhase("success"); emitDataRefresh("deposit-updated"); }
      else if (outcome === "failed") setPhase("form");
    } catch (e) { setError(friendlyError(e)); }
    finally { setChecking(false); }
  };

  const reset = () => { setPhase("form"); setTxRef(""); setError(""); };

  return <main className="dep-page"><style>{styles}</style><section className="dep-hero"><div className="dep-hero-icon"><ShieldCheck size={22} /></div><div><span className="dep-eyebrow">SECURE PAYMENTS</span><h1>Deposit with Flutterwave</h1></div></section><section className="dep-body"><div className="dep-trust"><span><ShieldCheck size={14} /> Flutterwave secured</span><span><CheckCircle2 size={14} /> Wallet credited after confirmation</span><span><RefreshCw size={14} /> Automatic payment verification</span></div><div className="dep-card"><div className="dep-card-head"><div><h2>Add funds</h2></div><span className="dep-provider">FLUTTERWAVE</span></div>{phase === "success" ? <div className="dep-success"><CheckCircle2 size={28} /><b>Deposit confirmed</b><span>GHS {amount.toLocaleString()} has been added to your wallet.</span><button onClick={reset}>Make another deposit</button></div> : phase === "stalled" ? <div className="dep-step"><b>Still confirming</b><button className="dep-check" onClick={reset}>Done</button></div> : <><label className="dep-field"><span>Deposit amount · GHS (minimum 200)</span><input type="number" min={MIN_DEPOSIT} step="1" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} disabled={phase === "waiting"} /></label><div className="dep-quick">{QUICK_AMOUNTS.map((quick) => <button key={quick} className={amount === quick ? "chosen" : ""} onClick={() => setAmount(quick)}>GHS {quick.toLocaleString()}</button>)}</div><div className="dep-grid"><label className="dep-field"><span>Mobile number</span><input value={phone} onChange={(e) => { setPhone(e.target.value); const d = detectNetwork(e.target.value); if (d) setNetwork(d); }} placeholder="024 000 0000" inputMode="tel" disabled={phase === "waiting"} /></label><label className="dep-field"><span>Network</span><select value={network} onChange={(e) => setNetwork(e.target.value)} disabled={phase === "waiting"}>{NETWORKS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>{error && <div className="dep-alert error">{error}</div>}{phase === "waiting" ? <><button className="dep-primary" disabled={true}><Loader2 className="dep-spin" size={16} /> Waiting for confirmation…</button><button className="dep-check" onClick={manualCheck} disabled={checking}><RefreshCw size={14} /> {checking ? "Checking…" : "Check payment status"}</button><button className="dep-check" onClick={reset}>Cancel deposit</button></> : <button className="dep-primary" onClick={start} disabled={busy}>{busy ? <Loader2 className="dep-spin" size={16} /> : <Phone size={16} />}{busy ? "Starting…" : "Send MoMo prompt"}</button>}</>}</div></section></main>;
}

const styles = `
.dep-page{min-height:100vh;background:#080d12;color:#f4f7f5;padding:28px 16px 60px;font-family:'DM Sans',system-ui,sans-serif}.dep-hero,.dep-body{max-width:880px;margin:0 auto}.dep-hero{display:flex;gap:14px;align-items:center;padding:18px 0 24px}.dep-hero-icon{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:rgba(243,102,0,.14);color:#ff9a55}.dep-eyebrow{font-size:10px;letter-spacing:.12em;color:#ff9a55;font-weight:800}.dep-hero h1{margin:4px 0;font-size:28px}.dep-hero p{margin:0;color:#8e9da8;font-size:13px}.dep-trust{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:12px}.dep-trust span{display:inline-flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid #253743;border-radius:8px;color:#a9b8c0;font-size:10px}.dep-trust svg{color:#63dc91}.dep-card{background:#101820;border:1px solid #2a3b47;border-radius:16px;padding:20px;box-shadow:0 18px 55px rgba(0,0,0,.25)}.dep-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.dep-card h2{margin:0;font-size:19px}.dep-card p{margin:5px 0 0;color:#8495a0;font-size:11px}.dep-provider{color:#66dfa0;border:1px solid #2b6248;border-radius:99px;padding:6px 9px;font-size:9px;font-weight:900;letter-spacing:.08em}.dep-field{display:grid;gap:6px;margin-top:12px}.dep-field span{font-size:10px;color:#a5b2ba;font-weight:700}.dep-field input,.dep-field select,.dep-step input{width:100%;box-sizing:border-box;background:#0a1015;border:1px solid #30424e;border-radius:9px;color:#edf5f1;padding:11px 12px;outline:none;font:inherit;font-size:13px}.dep-field input:focus,.dep-field select:focus,.dep-step input:focus{border-color:#f97316}.dep-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.dep-quick{display:flex;gap:7px;overflow:auto;padding:11px 0 2px}.dep-quick button{white-space:nowrap;border:1px solid #2b3b46;border-radius:99px;background:#0c1319;color:#a6b2b8;padding:7px 10px;font-size:10px;cursor:pointer}.dep-quick button.chosen{border-color:#f97316;color:#ffb77e;background:rgba(243,102,0,.1)}.dep-step{display:grid;gap:7px;margin-top:15px;padding:14px;border:1px dashed #f97316;border-radius:10px;background:rgba(243,102,0,.06)}.dep-step b{font-size:13px}.dep-step p{margin:0;color:#94a2ab;font-size:11px}.dep-primary{display:flex;justify-content:center;align-items:center;gap:7px;width:100%;margin-top:18px;padding:13px;border:0;border-radius:10px;background:#f97316;color:white;font-weight:900;cursor:pointer}.dep-primary:disabled{opacity:.55;cursor:not-allowed}.dep-check{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:8px;padding:9px;border:1px solid #30424e;border-radius:9px;background:transparent;color:#b1c0c8;cursor:pointer;font-size:11px}.dep-alert{margin-top:12px;padding:10px;border-radius:8px;font-size:11px}.dep-alert.error{border:1px solid #713842;background:rgba(197,55,70,.1);color:#ff9ba5}.dep-alert.ok{border:1px solid #2a6645;background:rgba(50,205,117,.08);color:#9aefbb}.dep-success{display:grid;justify-items:center;gap:6px;margin-top:18px;padding:20px;border:1px solid #2d7650;border-radius:11px;background:rgba(50,205,117,.08);color:#9aefbb}.dep-success b{color:#e7fff0}.dep-success span{font-size:10px}.dep-success button{margin-top:6px;border:0;border-radius:8px;padding:9px 12px;background:#65df96;color:#07130c;font-weight:800;cursor:pointer}.dep-note{display:block;margin-top:12px;color:#72838e;font-size:10px;line-height:1.5}.dep-spin{animation:dep-spin 1s linear infinite}@keyframes dep-spin{to{transform:rotate(360deg)}}@media(max-width:600px){.dep-page{padding:18px 11px 40px}.dep-hero h1{font-size:24px}.dep-card{padding:15px}.dep-grid{grid-template-columns:1fr}.dep-trust{display:grid;grid-template-columns:1fr}.dep-card-head{display:grid}.dep-provider{justify-self:start}}
`;
