import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, Check, CheckCircle2, Clock3, Copy, ImagePlus, Loader2, RefreshCw, ShieldCheck, Smartphone, X } from "lucide-react";
import api, { ApiError } from "@/lib/api";
import { emitDataRefresh } from "@/lib/autoRefresh";

/* Deposit centre — MANUAL Mobile Money (owner direction 2026-10-19:
   Flutterwave removed; deposits are manual MoMo transfers, reviewed by
   the team). Flow: the player sends MoMo to the HotBet number shown on
   the page, then submits the amount + the name on their MoMo account +
   the transaction reference from the receipt (optional screenshot) →
   POST /api/wallet/bank-deposits creates a PENDING record → an admin
   approves it in the Bank + MoMo deposits queue → the wallet is
   credited (commission attributes on the approved amount only).
   The player's own submissions list below the form (GET same path). */

const RECEIVER_NAME = "OFORI CONAFOZU";
const RECEIVER_NUMBER = "0599027136";
const RECEIVER_NETWORK = "MTN";

const MIN_DEPOSIT = 200;
const QUICK_AMOUNTS = [MIN_DEPOSIT, 500, 1000, 2000, 5000, 10000];

type Row = Record<string, any>;

function friendlyError(error: unknown): string {
  const fallback = "Something went wrong submitting your deposit — please try again.";
  if (error instanceof ApiError) {
    if (error.status >= 500 || !error.message || /internal server error/i.test(error.message)) return fallback;
    return error.message;
  }
  if (error instanceof Error && error.message && !/internal server error/i.test(error.message)) return error.message;
  return fallback;
}

function statusChip(status: string) {
  const s = status.toUpperCase();
  if (s === "APPROVED") return <span className="dep-chip ok">Approved</span>;
  if (s === "REJECTED") return <span className="dep-chip bad">Rejected</span>;
  return <span className="dep-chip wait">Pending review</span>;
}

/* Compress a picked screenshot to a modest JPEG data-URL the backend
   accepts (screenshotUrl ≤ 2,000,000 chars); anything bigger is dropped
   with a note rather than blocking the deposit. */
async function compressScreenshot(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1100 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const url = canvas.toDataURL("image/jpeg", 0.72);
  return url.length <= 1_900_000 ? url : "";
}

export default function DepositCenter() {
  const [amount, setAmount] = useState(MIN_DEPOSIT);
  const [phone, setPhone] = useState("");
  const [senderName, setSenderName] = useState("");
  const [reference, setReference] = useState("");
  const [shotName, setShotName] = useState("");
  const [shotUrl, setShotUrl] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadRows = useCallback(async () => {
    try {
      const res: any = await api.deposits.myManualDeposits(0, 20);
      const page = res?.data ?? res ?? {};
      setRows(Array.isArray(page.content) ? page.content : []);
    } catch { /* the list is informational — never block the form on it */ }
    finally { setLoadingRows(false); }
  }, []);

  useEffect(() => { loadRows(); }, [loadRows]);

  const copy = async (label: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(label); window.setTimeout(() => setCopied(""), 1600); } catch { /* clipboard unavailable */ }
  };

  const pickShot = async (file: File | undefined) => {
    if (!file) return;
    try {
      const url = await compressScreenshot(file);
      if (!url) { setError("That screenshot is too large to attach — you can still submit without it."); return; }
      setShotUrl(url); setShotName(file.name);
    } catch { setError("Could not read that image — you can still submit without it."); }
  };

  const submit = async () => {
    setError("");
    if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) { setError(`The minimum deposit is GHS ${MIN_DEPOSIT.toLocaleString()}.`); return; }
    if (phone.replace(/\D/g, "").length < 9) { setError("Enter the MoMo number you sent the money from."); return; }
    if (!senderName.trim()) { setError("Enter the name on the MoMo account you sent from."); return; }
    if (!reference.trim()) { setError("Enter the transaction reference from your MoMo receipt."); return; }
    setBusy(true);
    try {
      await api.deposits.manualSubmit({
        transferReference: reference.trim(),
        ngnAmountSent: amount,
        expectedNgnCredit: amount,
        senderAccountName: senderName.trim(),
        screenshotUrl: shotUrl || undefined,
        userNote: `MoMo deposit from ${phone.trim()}`,
      });
      setDone(true);
      emitDataRefresh("deposit-updated");
      loadRows();
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };

  const reset = () => { setDone(false); setReference(""); setShotUrl(""); setShotName(""); setError(""); };

  return <main className="dep-page"><style>{styles}</style><div className="dep-glow" aria-hidden /><section className="dep-hero"><div className="dep-medallion"><ShieldCheck size={26} /></div><span className="dep-eyebrow">SECURE PAYMENTS</span><h1>Deposit with Mobile Money</h1></section><section className="dep-body"><div className="dep-trust"><span><ShieldCheck size={13} /> Reviewed by our team</span><span><Clock3 size={13} /> Credited after confirmation</span><span><BadgeCheck size={13} /> No extra fees</span></div><div className="dep-card"><div className="dep-card-head"><h2>Add funds</h2><span className="dep-provider">MANUAL MOMO</span></div>{done ? <div className="dep-success"><div className="dep-success-icon"><CheckCircle2 size={34} /></div><b>Deposit submitted</b><span>GHS {amount.toLocaleString()} will be added to your wallet as soon as our team confirms your transfer.</span><button onClick={reset}>Make another deposit</button></div> : <><div className="dep-payto"><span className="dep-payto-label">Send your MoMo transfer to</span><div className="dep-payto-row"><div><small>Account name</small><b>{RECEIVER_NAME}</b></div><button type="button" className="dep-copy" onClick={() => copy("name", RECEIVER_NAME)}>{copied === "name" ? <Check size={14} /> : <Copy size={14} />}{copied === "name" ? "Copied" : "Copy"}</button></div><div className="dep-payto-row"><div><small>{RECEIVER_NETWORK} number</small><b className="dep-payto-num">{RECEIVER_NUMBER}</b></div><button type="button" className="dep-copy" onClick={() => copy("number", RECEIVER_NUMBER)}>{copied === "number" ? <Check size={14} /> : <Copy size={14} />}{copied === "number" ? "Copied" : "Copy"}</button></div></div><label className="dep-field dep-amount"><span>Deposit amount · GHS</span><div className="dep-amount-wrap"><em>GHS</em><input type="number" min={MIN_DEPOSIT} step="1" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} /></div></label><div className="dep-quick">{QUICK_AMOUNTS.map((quick) => <button key={quick} className={amount === quick ? "chosen" : ""} onClick={() => setAmount(quick)}>GHS {quick.toLocaleString()}</button>)}</div><div className="dep-grid"><label className="dep-field"><span>Your MoMo number</span><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="024 000 0000" inputMode="tel" /></label><label className="dep-field"><span>Name on the MoMo account</span><input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Name on the account" /></label></div><label className="dep-field"><span>Transaction reference</span><input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference from your MoMo receipt" /></label><div className="dep-file-row">{shotUrl ? <span className="dep-file-name"><ImagePlus size={14} /> {shotName || "Screenshot attached"}<button type="button" aria-label="Remove screenshot" onClick={() => { setShotUrl(""); setShotName(""); }}><X size={13} /></button></span> : <button type="button" className="dep-file-btn" onClick={() => fileRef.current?.click()}><ImagePlus size={14} /> Attach receipt screenshot (optional)</button>}<input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickShot(e.target.files?.[0])} /></div>{error && <div className="dep-alert error">{error}</div>}<button className="dep-primary" onClick={submit} disabled={busy}>{busy ? <Loader2 className="dep-spin" size={16} /> : <Smartphone size={16} />}{busy ? "Submitting…" : "Submit deposit"}</button></>}</div><div className="dep-card dep-history"><div className="dep-card-head"><h2>My deposits</h2><button type="button" className="dep-refresh" onClick={() => { setLoadingRows(true); loadRows(); }}><RefreshCw size={13} /> Refresh</button></div>{loadingRows ? <p className="dep-empty">Loading…</p> : rows.length === 0 ? <p className="dep-empty">No deposits submitted yet.</p> : <div className="dep-list">{rows.map((row) => <div className="dep-row" key={String(row.id)}><div className="dep-row-main"><b>GHS {Number(row.ngnAmountSent ?? 0).toLocaleString()}</b><small>{row.createdAt ? new Date(row.createdAt).toLocaleString() : ""} · Ref {String(row.transferReference ?? "—")}</small></div>{statusChip(String(row.status ?? "PENDING"))}</div>)}</div>}</div></section></main>;
}

const styles = `
.dep-page{position:relative;min-height:100vh;background:#080d12;color:#f4f7f5;padding:34px 16px 70px;font-family:'DM Sans',system-ui,sans-serif;overflow:hidden}.dep-glow{position:absolute;top:-180px;left:50%;transform:translateX(-50%);width:640px;height:380px;background:radial-gradient(closest-side,rgba(249,115,22,.22),transparent);pointer-events:none}.dep-hero,.dep-body{position:relative;max-width:560px;margin:0 auto}.dep-hero{display:flex;flex-direction:column;align-items:center;text-align:center;padding:10px 0 22px}.dep-medallion{display:grid;place-items:center;width:64px;height:64px;border-radius:20px;background:linear-gradient(145deg,rgba(249,115,22,.28),rgba(249,115,22,.08));border:1px solid rgba(249,115,22,.45);color:#ffa25e;box-shadow:0 0 0 6px rgba(249,115,22,.06),0 14px 34px rgba(249,115,22,.18);margin-bottom:14px}.dep-eyebrow{font-size:10px;letter-spacing:.22em;color:#ff9a55;font-weight:800}.dep-hero h1{margin:6px 0 0;font-size:30px;font-weight:900;letter-spacing:-.01em}.dep-trust{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:14px}.dep-trust span{display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border:1px solid #22313c;border-radius:99px;background:rgba(255,255,255,.02);color:#9fb2bd;font-size:10px;font-weight:600}.dep-trust svg{color:#63dc91}.dep-card{position:relative;background:linear-gradient(180deg,#111a22,#0d141b);border:1px solid #2a3b47;border-radius:20px;padding:24px;box-shadow:0 24px 60px rgba(0,0,0,.45)}.dep-card::before{content:"";position:absolute;top:0;left:24px;right:24px;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,#f97316,transparent)}.dep-card-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.dep-card h2{margin:0;font-size:20px;font-weight:800}.dep-provider{color:#7ce6ab;border:1px solid #2b6248;background:rgba(50,205,117,.07);border-radius:99px;padding:6px 10px;font-size:9px;font-weight:900;letter-spacing:.1em}.dep-payto{margin-top:16px;border:1px solid #2b6248;background:rgba(50,205,117,.05);border-radius:14px;padding:14px 15px;display:grid;gap:11px}.dep-payto-label{font-size:10px;color:#8fdcae;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.dep-payto-row{display:flex;justify-content:space-between;align-items:center;gap:10px}.dep-payto-row small{display:block;font-size:10px;color:#9fb2bd;font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin-bottom:2px}.dep-payto-row b{font-size:16px;color:#f2fbf5}.dep-payto-num{font-size:19px!important;letter-spacing:.04em}.dep-copy{display:inline-flex;align-items:center;gap:5px;border:1px solid #2b6248;background:rgba(50,205,117,.08);color:#8ff0b3;border-radius:99px;padding:7px 11px;font-size:11px;font-weight:800;cursor:pointer}.dep-copy:active{transform:scale(.96)}.dep-field{display:grid;gap:7px;margin-top:14px}.dep-field span{font-size:10px;color:#a5b2ba;font-weight:700;letter-spacing:.06em;text-transform:uppercase}.dep-field input,.dep-field select{width:100%;box-sizing:border-box;background:#0a1015;border:1px solid #30424e;border-radius:11px;color:#edf5f1;padding:12px 13px;outline:none;font:inherit;font-size:14px;transition:border-color .15s,box-shadow .15s}.dep-field input:focus,.dep-field select:focus{border-color:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.18)}.dep-amount-wrap{display:flex;align-items:center;background:#0a1015;border:1px solid #30424e;border-radius:12px;overflow:hidden;transition:border-color .15s,box-shadow .15s}.dep-amount-wrap:focus-within{border-color:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.18)}.dep-amount-wrap em{font-style:normal;font-weight:900;font-size:13px;color:#ff9a55;padding:0 4px 0 14px}.dep-amount-wrap input{border:0;background:transparent;font-size:22px;font-weight:800;padding:13px 12px 13px 6px;box-shadow:none!important}.dep-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.dep-quick{display:flex;gap:7px;overflow:auto;padding:12px 0 2px;scrollbar-width:none}.dep-quick::-webkit-scrollbar{display:none}.dep-quick button{white-space:nowrap;border:1px solid #2b3b46;border-radius:99px;background:#0c1319;color:#a6b2b8;padding:8px 13px;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s}.dep-quick button:hover{border-color:#f97316;color:#ffb77e}.dep-quick button.chosen{border-color:transparent;background:linear-gradient(135deg,#f97316,#ff8a3c);color:#fff;box-shadow:0 6px 16px rgba(249,115,22,.35)}.dep-file-row{margin-top:14px}.dep-file-btn{display:inline-flex;align-items:center;gap:6px;border:1px dashed #30424e;background:transparent;color:#a6b2b8;border-radius:10px;padding:10px 13px;font-size:11px;font-weight:700;cursor:pointer}.dep-file-name{display:inline-flex;align-items:center;gap:7px;border:1px solid #2b6248;background:rgba(50,205,117,.07);color:#8ff0b3;border-radius:10px;padding:9px 12px;font-size:11px;font-weight:700}.dep-file-name button{display:grid;place-items:center;border:0;background:transparent;color:#8ff0b3;cursor:pointer;padding:0}.dep-primary{display:flex;justify-content:center;align-items:center;gap:8px;width:100%;margin-top:20px;padding:15px;border:0;border-radius:12px;background:linear-gradient(135deg,#f97316,#ff8a3c);color:#fff;font-weight:900;font-size:14px;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;box-shadow:0 10px 24px rgba(249,115,22,.3);transition:transform .1s,box-shadow .15s,opacity .15s}.dep-primary:hover:not(:disabled){box-shadow:0 12px 30px rgba(249,115,22,.45)}.dep-primary:active:not(:disabled){transform:scale(.985)}.dep-primary:disabled{opacity:.6;cursor:not-allowed}.dep-alert{margin-top:14px;padding:11px 12px;border-radius:10px;font-size:12px;line-height:1.5}.dep-alert.error{border:1px solid #713842;background:rgba(197,55,70,.1);color:#ff9ba5}.dep-success{display:grid;justify-items:center;gap:7px;margin-top:8px;padding:26px 10px 14px;text-align:center}.dep-success-icon{display:grid;place-items:center;width:76px;height:76px;border-radius:50%;background:rgba(50,205,117,.1);border:1px solid #2d7650;color:#65df96;box-shadow:0 0 0 8px rgba(50,205,117,.05);margin-bottom:6px}.dep-success b{color:#e7fff0;font-size:18px}.dep-success span{font-size:12px;color:#9aefbb}.dep-success button{margin-top:10px;border:0;border-radius:10px;padding:11px 16px;background:#65df96;color:#07130c;font-weight:800;cursor:pointer}.dep-history{margin-top:16px}.dep-refresh{display:inline-flex;align-items:center;gap:5px;border:1px solid #30424e;background:rgba(255,255,255,.02);color:#b1c0c8;border-radius:99px;padding:6px 11px;font-size:10px;font-weight:700;cursor:pointer}.dep-empty{color:#7e8e9a;font-size:12px;margin:14px 0 2px}.dep-list{display:grid;gap:8px;margin-top:14px}.dep-row{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #22313c;border-radius:12px;padding:11px 13px;background:rgba(255,255,255,.02)}.dep-row-main b{font-size:14px;color:#eef6f1}.dep-row-main small{display:block;color:#7e8e9a;font-size:10px;margin-top:2px}.dep-chip{white-space:nowrap;border-radius:99px;padding:5px 9px;font-size:9px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.dep-chip.wait{color:#ffd28a;border:1px solid #6b5320;background:rgba(255,190,60,.07)}.dep-chip.ok{color:#7ce6ab;border:1px solid #2b6248;background:rgba(50,205,117,.08)}.dep-chip.bad{color:#ff9ba5;border:1px solid #713842;background:rgba(197,55,70,.08)}.dep-spin{animation:dep-spin 1s linear infinite}@keyframes dep-spin{to{transform:rotate(360deg)}}@media(max-width:600px){.dep-page{padding:22px 12px 50px}.dep-hero h1{font-size:25px}.dep-card{padding:18px 15px}.dep-grid{grid-template-columns:1fr}.dep-trust span{font-size:9px;padding:6px 9px}}
`;
