import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Phone, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import api, { ApiError } from "@/lib/api";
import { emitDataRefresh } from "@/lib/autoRefresh";

/* Deposit centre — Flutterwave v4 Ghana Mobile Money (owner direction
   2026-10-15, replacing Paystack in full). Flow: amount + MoMo number +
   network → POST /api/wallet/deposit/flutterwave/gh/v4/init sends a
   prompt to the phone → the page polls POST .../gh/v4/verify until
   Flutterwave confirms; crediting is webhook-first and the verify
   endpoint credits idempotently. Page copy is deliberately minimal —
   no instruction text (owner order 2026-10-15). */

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

  return <main className="dep-page"><style>{styles}</style><div className="dep-glow" aria-hidden /><section className="dep-hero"><div className="dep-medallion"><ShieldCheck size={26} /></div><span className="dep-eyebrow">SECURE PAYMENTS</span><h1>Deposit with Flutterwave</h1></section><section className="dep-body"><div className="dep-trust"><span><ShieldCheck size={13} /> Flutterwave secured</span><span><CheckCircle2 size={13} /> Instant wallet credit</span><span><RefreshCw size={13} /> Auto verification</span></div><div className="dep-card"><div className="dep-card-head"><h2>Add funds</h2><span className="dep-provider">FLUTTERWAVE</span></div>{phase === "success" ? <div className="dep-success"><div className="dep-success-icon"><CheckCircle2 size={34} /></div><b>Deposit confirmed</b><span>GHS {amount.toLocaleString()} has been added to your wallet.</span><button onClick={reset}>Make another deposit</button></div> : phase === "stalled" ? <div className="dep-stalled"><b>Still confirming</b><button className="dep-check" onClick={reset}>Done</button></div> : <><label className="dep-field dep-amount"><span>Deposit amount · GHS</span><div className="dep-amount-wrap"><em>GHS</em><input type="number" min={MIN_DEPOSIT} step="1" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} disabled={phase === "waiting"} /></div></label><div className="dep-quick">{QUICK_AMOUNTS.map((quick) => <button key={quick} className={amount === quick ? "chosen" : ""} onClick={() => setAmount(quick)}>GHS {quick.toLocaleString()}</button>)}</div><div className="dep-grid"><label className="dep-field"><span>Mobile number</span><input value={phone} onChange={(e) => { setPhone(e.target.value); const d = detectNetwork(e.target.value); if (d) setNetwork(d); }} placeholder="024 000 0000" inputMode="tel" disabled={phase === "waiting"} /></label><label className="dep-field"><span>Network</span><select value={network} onChange={(e) => setNetwork(e.target.value)} disabled={phase === "waiting"}>{NETWORKS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>{error && <div className="dep-alert error">{error}</div>}{phase === "waiting" ? <><div className="dep-wait-visual"><span className="dep-ring" /><span className="dep-ring delay" /><span className="dep-wait-icon"><Smartphone size={30} /></span></div><div className="dep-wait-amount">GHS {amount.toLocaleString()} <i>→</i> {phone}</div><button className="dep-primary" disabled={true}><Loader2 className="dep-spin" size={16} /> Waiting for confirmation…</button><button className="dep-check" onClick={manualCheck} disabled={checking}><RefreshCw size={14} /> {checking ? "Checking…" : "Check payment status"}</button><button className="dep-check ghost" onClick={reset}>Cancel deposit</button></> : <button className="dep-primary" onClick={start} disabled={busy}>{busy ? <Loader2 className="dep-spin" size={16} /> : <Phone size={16} />}{busy ? "Starting…" : "Send MoMo prompt"}</button>}</>}</div></section></main>;
}

const styles = `
.dep-page{position:relative;min-height:100vh;background:#080d12;color:#f4f7f5;padding:34px 16px 70px;font-family:'DM Sans',system-ui,sans-serif;overflow:hidden}.dep-glow{position:absolute;top:-180px;left:50%;transform:translateX(-50%);width:640px;height:380px;background:radial-gradient(closest-side,rgba(249,115,22,.22),transparent);pointer-events:none}.dep-hero,.dep-body{position:relative;max-width:560px;margin:0 auto}.dep-hero{display:flex;flex-direction:column;align-items:center;text-align:center;padding:10px 0 22px}.dep-medallion{display:grid;place-items:center;width:64px;height:64px;border-radius:20px;background:linear-gradient(145deg,rgba(249,115,22,.28),rgba(249,115,22,.08));border:1px solid rgba(249,115,22,.45);color:#ffa25e;box-shadow:0 0 0 6px rgba(249,115,22,.06),0 14px 34px rgba(249,115,22,.18);margin-bottom:14px}.dep-eyebrow{font-size:10px;letter-spacing:.22em;color:#ff9a55;font-weight:800}.dep-hero h1{margin:6px 0 0;font-size:30px;font-weight:900;letter-spacing:-.01em}.dep-trust{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:14px}.dep-trust span{display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border:1px solid #22313c;border-radius:99px;background:rgba(255,255,255,.02);color:#9fb2bd;font-size:10px;font-weight:600}.dep-trust svg{color:#63dc91}.dep-card{position:relative;background:linear-gradient(180deg,#111a22,#0d141b);border:1px solid #2a3b47;border-radius:20px;padding:24px;box-shadow:0 24px 60px rgba(0,0,0,.45)}.dep-card::before{content:"";position:absolute;top:0;left:24px;right:24px;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,#f97316,transparent)}.dep-card-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.dep-card h2{margin:0;font-size:20px;font-weight:800}.dep-provider{color:#7ce6ab;border:1px solid #2b6248;background:rgba(50,205,117,.07);border-radius:99px;padding:6px 10px;font-size:9px;font-weight:900;letter-spacing:.1em}.dep-field{display:grid;gap:7px;margin-top:14px}.dep-field span{font-size:10px;color:#a5b2ba;font-weight:700;letter-spacing:.06em;text-transform:uppercase}.dep-field input,.dep-field select{width:100%;box-sizing:border-box;background:#0a1015;border:1px solid #30424e;border-radius:11px;color:#edf5f1;padding:12px 13px;outline:none;font:inherit;font-size:14px;transition:border-color .15s,box-shadow .15s}.dep-field input:focus,.dep-field select:focus{border-color:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.18)}.dep-amount-wrap{display:flex;align-items:center;background:#0a1015;border:1px solid #30424e;border-radius:12px;overflow:hidden;transition:border-color .15s,box-shadow .15s}.dep-amount-wrap:focus-within{border-color:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.18)}.dep-amount-wrap em{font-style:normal;font-weight:900;font-size:13px;color:#ff9a55;padding:0 4px 0 14px}.dep-amount-wrap input{border:0;background:transparent;font-size:22px;font-weight:800;padding:13px 12px 13px 6px;box-shadow:none!important}.dep-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.dep-quick{display:flex;gap:7px;overflow:auto;padding:12px 0 2px;scrollbar-width:none}.dep-quick::-webkit-scrollbar{display:none}.dep-quick button{white-space:nowrap;border:1px solid #2b3b46;border-radius:99px;background:#0c1319;color:#a6b2b8;padding:8px 13px;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s}.dep-quick button:hover{border-color:#f97316;color:#ffb77e}.dep-quick button.chosen{border-color:transparent;background:linear-gradient(135deg,#f97316,#ff8a3c);color:#fff;box-shadow:0 6px 16px rgba(249,115,22,.35)}.dep-primary{display:flex;justify-content:center;align-items:center;gap:8px;width:100%;margin-top:20px;padding:15px;border:0;border-radius:12px;background:linear-gradient(135deg,#f97316,#ff8a3c);color:#fff;font-weight:900;font-size:14px;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;box-shadow:0 10px 24px rgba(249,115,22,.3);transition:transform .1s,box-shadow .15s,opacity .15s}.dep-primary:hover:not(:disabled){box-shadow:0 12px 30px rgba(249,115,22,.45)}.dep-primary:active:not(:disabled){transform:scale(.985)}.dep-primary:disabled{opacity:.6;cursor:not-allowed}.dep-check{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:9px;padding:10px;border:1px solid #30424e;border-radius:10px;background:rgba(255,255,255,.02);color:#b1c0c8;cursor:pointer;font-size:11px;font-weight:600}.dep-check.ghost{border-color:transparent;background:transparent;color:#7e8e9a}.dep-alert{margin-top:14px;padding:11px 12px;border-radius:10px;font-size:12px;line-height:1.5}.dep-alert.error{border:1px solid #713842;background:rgba(197,55,70,.1);color:#ff9ba5}.dep-wait-visual{position:relative;display:grid;place-items:center;height:110px;margin-top:16px}.dep-wait-icon{position:relative;z-index:2;display:grid;place-items:center;width:64px;height:64px;border-radius:50%;background:linear-gradient(145deg,rgba(249,115,22,.3),rgba(249,115,22,.1));border:1px solid rgba(249,115,22,.5);color:#ffa25e}.dep-ring{position:absolute;width:64px;height:64px;border-radius:50%;border:1px solid rgba(249,115,22,.5);animation:dep-pulse 2s ease-out infinite}.dep-ring.delay{animation-delay:1s}@keyframes dep-pulse{from{transform:scale(1);opacity:.8}to{transform:scale(2.1);opacity:0}}.dep-wait-amount{text-align:center;font-size:15px;font-weight:800;color:#e8f2ec;margin-bottom:2px}.dep-wait-amount i{font-style:normal;color:#ff9a55;margin:0 4px}.dep-success{display:grid;justify-items:center;gap:7px;margin-top:8px;padding:26px 10px 14px;text-align:center}.dep-success-icon{display:grid;place-items:center;width:76px;height:76px;border-radius:50%;background:rgba(50,205,117,.1);border:1px solid #2d7650;color:#65df96;box-shadow:0 0 0 8px rgba(50,205,117,.05);margin-bottom:6px}.dep-success b{color:#e7fff0;font-size:18px}.dep-success span{font-size:12px;color:#9aefbb}.dep-success button{margin-top:10px;border:0;border-radius:10px;padding:11px 16px;background:#65df96;color:#07130c;font-weight:800;cursor:pointer}.dep-stalled{display:grid;gap:10px;justify-items:center;margin-top:16px;padding:18px;border:1px dashed #f97316;border-radius:12px;background:rgba(243,102,0,.05)}.dep-stalled b{font-size:14px}.dep-stalled .dep-check{width:auto;padding:9px 18px;margin-top:0}.dep-spin{animation:dep-spin 1s linear infinite}@keyframes dep-spin{to{transform:rotate(360deg)}}@media(max-width:600px){.dep-page{padding:22px 12px 50px}.dep-hero h1{font-size:25px}.dep-card{padding:18px 15px}.dep-grid{grid-template-columns:1fr}.dep-trust span{font-size:9px;padding:6px 9px}}
`;
