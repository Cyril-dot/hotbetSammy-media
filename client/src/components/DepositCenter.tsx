import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, Check, CheckCircle2, Clock3, Copy, Hourglass, ImagePlus, Loader2, RefreshCw, ShieldCheck, Smartphone, X } from "lucide-react";
import api, { ApiError, type AkwaPayNetwork, type AkwaPayVerifyResponse, type Transaction } from "@/lib/api";
import { emitDataRefresh } from "@/lib/autoRefresh";

/* Deposit centre — two tabs (owner direction 2026-11-01):
   (1) "MoMo Push" — AkwaPay (ShinobiPay) direct MoMo: verify-first
   (POST /api/wallet/deposit/akwapay/verify — no prompt goes out
   unless the envelope comes back verified:true; confirm panel shows
   the number, network, account name and exact total the prompt will
   ask for) → Confirm (never re-verifies) → POST
   /api/wallet/deposit/akwapay/init sends the push prompt → poll GET
   /api/wallet/deposit/akwapay/status/:id (read-only) until
   "succeeded". Crediting is webhook-only on the backend
   (POST /api/webhooks/akwapay on ee88); if next_action is submit_otp,
   collect the OTP and POST /api/wallet/deposit/akwapay/otp first.
   (2) "Manual Payment" — the player sends MoMo to the HotBet number
   on the page, then submits amount + MoMo number + account name
   (+ optional receipt screenshot — compressed, hosted on imgbb, its
   URL sent as screenshotUrl) → POST /api/wallet/bank-deposits lands
   PENDING for admin review. The transaction reference is NOT shown
   to the player — it is filled in the background at submit time
   (unique HB-MANUAL-… value, so the backend's duplicate-reference
   guard never trips on it).
   Amount and MoMo number are shared across tabs; the history list
   merges wallet DEPOSIT credits with the player's manual submissions.
   The MoMo number is the account's registered phone (GET /api/users/me)
   — shown locked; if the account has no phone on file the field stays
   editable. The manual tab's sender name comes from the AkwaPay verify
   endpoint (verified name shown locked); if verify fails the field
   stays editable so the user can type it. */

const MIN_DEPOSIT = 200;
const QUICK_AMOUNTS = [MIN_DEPOSIT, 500, 1000, 2000, 5000, 10000];

const RECEIVER_NAME = "OFORI CONAFOZU";
const RECEIVER_NUMBER = "0599027136";
const RECEIVER_NETWORK = "MTN";

/* Same imgbb upload key the operator's other properties ship with. */
const IMGBB_KEY = "bdd12743a2e929bcdd4a6843dea9295e";

const GH_PREFIXES: Record<string, string> = {
  "024": "MTN", "025": "MTN", "053": "MTN", "054": "MTN", "055": "MTN", "059": "MTN",
  "020": "TELECEL", "050": "TELECEL",
  "026": "AIRTELTIGO", "027": "AIRTELTIGO", "056": "AIRTELTIGO", "057": "AIRTELTIGO",
};
function detectNetwork(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  const local = digits.startsWith("233") && digits.length === 12 ? "0" + digits.slice(3) : digits;
  return GH_PREFIXES[local.slice(0, 3)] ?? "";
}
function localPhoneOf(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, "");
  return digits.startsWith("233") && digits.length === 12 ? "0" + digits.slice(3) : digits;
}
const ghs = (value: number) => `GHS ${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const networkLabel = (n: string) => n === "AIRTELTIGO" ? "AirtelTigo" : n === "TELECEL" ? "Telecel" : "MTN";

function friendlyError(error: unknown): string {
  const fallback = "Something went wrong — please try again.";
  if (error instanceof ApiError) {
    if (error.status >= 500 || !error.message || /internal server error/i.test(error.message)) return fallback;
    return error.message;
  }
  if (error instanceof Error && error.message && !/internal server error/i.test(error.message)) return error.message;
  return fallback;
}

/* The api client returns the ApiResponse envelope — unwrap .data when
   present so this works whether the backend wraps the payload or not. */
function unwrap<T>(res: unknown): T {
  const r = res as { data?: T } | null;
  return (r && typeof r === "object" && "data" in r ? r.data : res) as T;
}

/* Compress a proof image (max 800px wide, JPEG), returning a data URL
   for upload — the house pattern shared with the other properties. */
function compressImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 800; const scale = img.width > MAX ? MAX / img.width : 1;
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d")!.drawImage(img, 0, 0, w, h);
        const d = c.toDataURL("image/jpeg", 0.72);
        resolve(d.length > 524288 ? c.toDataURL("image/jpeg", 0.45) : d);
      };
      img.onerror = reject;
      img.src = ev.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* Host the compressed proof on imgbb and return its URL — the hosted
   link is what goes to the API as screenshotUrl. */
async function uploadToImgbb(dataUrl: string): Promise<string> {
  const body = new FormData();
  body.append("key", IMGBB_KEY);
  body.append("image", dataUrl.replace(/^data:image\/[a-z]+;base64,/, ""));
  const res = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body });
  const json = (await res.json().catch(() => null)) as { data?: { url?: string }; success?: boolean } | null;
  const url = json?.data?.url;
  if (!res.ok || !url) throw new Error("imgbb upload failed");
  return url;
}

type Phase = "form" | "confirm" | "otp" | "waiting" | "done" | "stalled";
type HistRow = { key: string; amount: number; date: string; chip: string; chipClass: string; sub: string };

function manualChip(status: string): { chip: string; chipClass: string } {
  const s = status.toUpperCase();
  if (s === "APPROVED") return { chip: "Approved", chipClass: "ok" };
  if (s === "REJECTED") return { chip: "Rejected", chipClass: "bad" };
  return { chip: "Pending review", chipClass: "wait" };
}

export default function DepositCenter() {
  const [tab, setTab] = useState<"momo" | "manual">("momo");
  // Shared across tabs: one amount, one MoMo number.
  const [amount, setAmount] = useState(MIN_DEPOSIT);
  const [phone, setPhone] = useState("");
  const [phoneLocked, setPhoneLocked] = useState(false);
  const [manualVerifying, setManualVerifying] = useState(false);
  const [manualVerifiedPhone, setManualVerifiedPhone] = useState<string | null>(null);
  const [nameFromVerify, setNameFromVerify] = useState(false);
  // Ref guard (not state): setting state inside this effect must not
  // re-run it and cancel the in-flight verify.
  const manualVerifyingRef = useRef(false);
  // MoMo push state.
  const [network, setNetwork] = useState("");
  const [verify, setVerify] = useState<AkwaPayVerifyResponse | null>(null);
  const [intentId, setIntentId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>("form");
  // Manual payment state.
  const [senderName, setSenderName] = useState("");
  const [shotName, setShotName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [shotUrl, setShotUrl] = useState("");
  const [manualError, setManualError] = useState("");
  const [manualBusy, setManualBusy] = useState(false);
  const [manualDone, setManualDone] = useState(false);
  const [copied, setCopied] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // Merged history.
  const [rows, setRows] = useState<HistRow[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);

  const loadRows = useCallback(async () => {
    try {
      const [wRes, mRes] = await Promise.allSettled([api.wallet.getTransactions(0, 20), api.deposits.myManualDeposits(0, 20)]);
      const merged: HistRow[] = [];
      if (wRes.status === "fulfilled") {
        const page = unwrap<{ content?: Transaction[] }>(wRes.value);
        const content = Array.isArray(page?.content) ? page.content : [];
        for (const tx of content) {
          if (String(tx.kind ?? "").toUpperCase() !== "DEPOSIT") continue;
          merged.push({ key: `w-${String(tx.id)}`, amount: Number(tx.amount ?? 0), date: String(tx.createdAt ?? ""), chip: "Credited", chipClass: "ok", sub: "" });
        }
      }
      if (mRes.status === "fulfilled") {
        const page = unwrap<{ content?: Record<string, any>[] }>(mRes.value);
        const content = Array.isArray(page?.content) ? page.content : [];
        for (const row of content) {
          const c = manualChip(String(row.status ?? "PENDING"));
          merged.push({ key: `m-${String(row.id)}`, amount: Number(row.ngnAmountSent ?? 0), date: String(row.createdAt ?? ""), chip: c.chip, chipClass: c.chipClass, sub: row.transferReference ? `Ref ${String(row.transferReference)}` : "" });
        }
      }
      merged.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      setRows(merged.slice(0, 10));
    } catch { /* the list is informational — never block the form on it */ }
    finally { setLoadingRows(false); }
  }, []);

  useEffect(() => { loadRows(); }, [loadRows]);

  // The deposit number is the account's registered phone. If the
  // account has no phone on file, the field stays editable.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.user.me();
        const u = unwrap<Record<string, unknown>>(res);
        const raw = ["phone", "phoneNumber", "phone_number", "mobile", "mobileNumber", "msisdn"]
          .map((k) => u?.[k])
          .find((v) => typeof v === "string" && String(v).replace(/\D/g, "").length >= 9);
        if (cancelled || !raw) return;
        const local = localPhoneOf(String(raw));
        setPhone(local);
        setPhoneLocked(true);
        const d = detectNetwork(local);
        if (d) setNetwork(d);
      } catch { /* no account phone — number stays editable */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Manual tab: the sender name comes from the AkwaPay verify endpoint
  // for the account number (once per number; a failed check leaves the
  // field editable, with a retry). The name does not depend on the
  // amount, so changing the amount never re-verifies.
  useEffect(() => {
    if (tab !== "manual" || manualDone) return;
    if (phone.replace(/\D/g, "").length < 9) return;
    if (amount < MIN_DEPOSIT) return;
    if (manualVerifiedPhone === phone || manualVerifyingRef.current) return;
    const net = detectNetwork(phone);
    if (!net) return; // cannot verify without a network — name stays editable
    let cancelled = false;
    manualVerifyingRef.current = true;
    setManualVerifying(true);
    (async () => {
      try {
        const res = await api.deposits.akwapayVerify({ amount, phone: localPhoneOf(phone), network: net as AkwaPayNetwork });
        const v = unwrap<AkwaPayVerifyResponse>(res);
        if (!cancelled && v?.verified === true && v.account_name) {
          setSenderName((prev) => (prev === "" || nameFromVerify ? String(v.account_name) : prev));
          setNameFromVerify(true);
        }
      } catch { /* name stays editable */ }
      finally {
        // Unconditional: this number has been attempted (success or
        // not), so the effect never loops. The cancelled flag guards
        // only the name write above, never this bookkeeping.
        manualVerifyingRef.current = false;
        setManualVerifiedPhone(phone);
        setManualVerifying(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tab, phone, amount, manualDone, manualVerifiedPhone, nameFromVerify]);

  // ── MoMo push: verify FIRST, once per attempt ──
  const start = async () => {
    setError("");
    if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) { setError(`The minimum deposit is GHS ${MIN_DEPOSIT.toLocaleString()}.`); return; }
    if (phone.replace(/\D/g, "").length < 9) { setError("Enter your MoMo number to receive the payment prompt."); return; }
    const chosen = network || detectNetwork(phone);
    if (!chosen) { setError("Choose your network — MTN, Telecel or AirtelTigo."); return; }
    setBusy(true);
    try {
      const res = await api.deposits.akwapayVerify({ amount, phone: localPhoneOf(phone), network: chosen as AkwaPayNetwork });
      const v = unwrap<AkwaPayVerifyResponse>(res);
      if (v?.verified === true) { setVerify(v); setNetwork(chosen); setPhase("confirm"); return; }
      const reason = String(v?.reason ?? "");
      const serverMessage = typeof v?.message === "string" && v.message.trim() ? v.message : "";
      if (serverMessage) setError(serverMessage);
      else if (reason === "no_account") setError(`This number has no MoMo account on ${networkLabel(chosen)}. Check the number and try again.`);
      else if (reason === "unavailable") setError("The check could not run — wait a few minutes and try again. No prompt has been sent.");
      else if (reason === "not_configured") setError("Deposits are temporarily unavailable — please try again later.");
      else setError("Number verification is not available right now. Please try again shortly.");
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };

  // Confirm reuses the verify result — it NEVER re-verifies, and it is
  // the only path that calls init, so no prompt is sent unverified.
  const confirmDeposit = async () => {
    const chosen = network || detectNetwork(phone);
    if (!chosen) { setError("Choose your network — MTN, Telecel or AirtelTigo."); setPhase("form"); return; }
    setBusy(true);
    try {
      const res = await api.deposits.akwapayInit({ amount, phone: localPhoneOf(phone), network: chosen as AkwaPayNetwork });
      const intent = unwrap<{ id?: string; status?: string; client_secret?: string; next_action?: { type?: string } | null }>(res);
      const id = String(intent?.id ?? "");
      if (!id) { setError("The payment could not be started. Try again."); setPhase("form"); return; }
      if (String(intent?.next_action?.type ?? "") === "submit_otp") {
        setIntentId(id);
        setClientSecret(String(intent?.client_secret ?? ""));
        setPhase("otp");
        return;
      }
      setIntentId(id);
      setPhase("waiting");
    } catch (e) { setError(friendlyError(e)); setPhase("form"); }
    finally { setBusy(false); }
  };

  const submitOtp = async () => {
    if (!otp.trim()) { setError("Enter the OTP sent for this payment."); return; }
    setBusy(true);
    setError("");
    try {
      await api.deposits.akwapaySubmitOtp({ intentId, clientSecret, otp: otp.trim() });
      setPhase("waiting");
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };

  // Waiting polls the intent status (read-only — the webhook/sweep
  // credits the wallet). A failed check is never a failed payment.
  useEffect(() => {
    if (phase !== "waiting" || !intentId) return;
    let cancelled = false;
    let tries = 0;
    const poll = async () => {
      tries++;
      try {
        const res = await api.deposits.akwapayStatus(intentId);
        if (cancelled) return;
        const s = String(unwrap<{ status?: string }>(res)?.status ?? "").toLowerCase();
        if (s === "succeeded" || s === "successful") {
          setPhase("done");
          emitDataRefresh("deposit-updated");
          loadRows();
          return;
        }
        if (["failed", "declined", "cancelled", "canceled", "expired", "rejected", "error"].includes(s)) {
          setError("The payment was not completed. You have not been charged — try again.");
          setPhase("form");
          return;
        }
      } catch { /* keep polling */ }
      if (cancelled) return;
      if (tries >= 30) { setPhase("stalled"); return; }
      setTimeout(poll, 4000);
    };
    poll();
    return () => { cancelled = true; };
  }, [phase, intentId, loadRows]);

  // Back/Edit returns to the form with the typed values kept.
  const backToForm = () => { setVerify(null); setError(""); setPhase("form"); };
  const reset = () => { setPhase("form"); setAmount(MIN_DEPOSIT); setPhone(""); setNetwork(""); setVerify(null); setIntentId(""); setClientSecret(""); setOtp(""); setError(""); };

  // ── Manual payment ──
  const copy = async (label: string, value: string) => {
    try { await navigator.clipboard.writeText(value); setCopied(label); window.setTimeout(() => setCopied(""), 1600); } catch { /* clipboard unavailable */ }
  };

  const pickShot = async (file: File | undefined) => {
    if (!file) return;
    setManualError("");
    setUploading(true);
    try {
      const dataUrl = await compressImageFile(file);
      const hosted = await uploadToImgbb(dataUrl);
      setShotUrl(hosted); setShotName(file.name);
    } catch { setManualError("The screenshot upload failed — try again, or submit without it."); }
    finally { setUploading(false); }
  };

  // Reference is filled in the background — the player never sees
  // or types it. Unique per submission (ms timestamp + random tail).
  const autoReference = () => `HB-MANUAL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  const submitManual = async () => {
    setManualError("");
    if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) { setManualError(`The minimum deposit is GHS ${MIN_DEPOSIT.toLocaleString()}.`); return; }
    if (phone.replace(/\D/g, "").length < 9) { setManualError("Enter the MoMo number you sent the money from."); return; }
    if (!senderName.trim()) { setManualError("Enter the name on the MoMo account you sent from."); return; }
    setManualBusy(true);
    try {
      await api.deposits.manualSubmit({
        transferReference: autoReference(),
        ngnAmountSent: amount,
        expectedNgnCredit: amount,
        senderAccountName: senderName.trim(),
        screenshotUrl: shotUrl || undefined,
        userNote: `MoMo deposit from ${phone.trim()}`,
      });
      setManualDone(true);
      emitDataRefresh("deposit-updated");
      loadRows();
    } catch (e) { setManualError(friendlyError(e)); }
    finally { setManualBusy(false); }
  };

  const resetManual = () => { setManualDone(false); setShotUrl(""); setShotName(""); setManualError(""); };

  const totalDisplay = verify?.amount?.total_display
    ? verify.amount.total_display
    : ghs(amount * 1.025);
  const confirmNetwork = network || verify?.network || "";

  return <main className="dep-page"><style>{styles}</style><div className="dep-glow" aria-hidden /><section className="dep-hero"><div className="dep-medallion"><ShieldCheck size={26} /></div><span className="dep-eyebrow">SECURE PAYMENTS</span><h1>Deposit with Mobile Money</h1></section><section className="dep-body"><div className="dep-trust"><span><ShieldCheck size={13} /> Instant MoMo prompt</span><span><BadgeCheck size={13} /> ShinobiPay</span><span><Clock3 size={13} /> Auto-credited</span></div><div className="dep-card"><div className="dep-card-head"><h2>Add funds</h2><span className="dep-provider">{tab === "manual" ? "MANUAL MOMO" : "SHINOBIPAY"}</span></div>
    <div className="dep-tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === "momo"} className={tab === "momo" ? "active" : ""} onClick={() => setTab("momo")}><Smartphone size={14} /> MoMo Push</button><button type="button" role="tab" aria-selected={tab === "manual"} className={tab === "manual" ? "active" : ""} onClick={() => setTab("manual")}>Manual Payment</button></div>
    <div className="dep-panel-momo" style={{ display: tab === "momo" ? undefined : "none" }}>
    {phase === "done" ? <div className="dep-success"><div className="dep-success-icon"><CheckCircle2 size={34} /></div><b>Deposit successful</b><span>{ghs(amount)} has been added to your wallet.</span><button onClick={reset}>Make another deposit</button></div>
    : phase === "stalled" ? <div className="dep-wait"><div className="dep-success-icon"><Hourglass size={30} /></div><h3>Still confirming</h3><p>Your approval is still being confirmed. If you entered your PIN, the money lands in your wallet automatically — <b>don&apos;t pay again</b>.</p><div className="dep-actions"><button className="dep-secondary" onClick={reset}>Done</button></div></div>
    : phase === "waiting" ? <div className="dep-wait"><div className="dep-success-icon"><Loader2 size={30} className="dep-spin" /></div><h3>Check your phone</h3><p>A MoMo prompt is on its way to <b>{localPhoneOf(phone)}</b> — enter your PIN to approve <b>{ghs(amount)}</b>. This page updates on its own when the payment lands.</p><div className="dep-actions"><button className="dep-secondary" onClick={reset}>Cancel deposit</button></div></div>
    : phase === "otp" ? <div><h3 className="dep-panel-title">Enter the OTP</h3><p className="dep-note">A code was requested for this payment on <b>{localPhoneOf(phone)}</b>. Enter it to continue.</p><label className="dep-field"><span>OTP code</span><input value={otp} onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Enter OTP" inputMode="numeric" /></label>{error && <div className="dep-alert error">{error}</div>}<div className="dep-actions"><button className="dep-primary" onClick={submitOtp} disabled={busy}>{busy ? <Loader2 className="dep-spin" size={16} /> : null}{busy ? "Submitting…" : "Submit OTP"}</button><button className="dep-secondary" onClick={reset} disabled={busy}>Cancel</button></div></div>
    : phase === "confirm" && verify ? <div><h3 className="dep-panel-title">Confirm your deposit</h3><p className="dep-note">You&apos;re paying <b>{totalDisplay}</b> to <b>{verify.account_name ?? "your MoMo account"}</b>. Confirm?</p><div className="dep-confirm-box"><span>To</span><strong>{localPhoneOf(phone)}{confirmNetwork ? ` · ${networkLabel(confirmNetwork)}` : ""}</strong></div>{error && <div className="dep-alert error">{error}</div>}<div className="dep-actions"><button className="dep-primary" onClick={confirmDeposit} disabled={busy}>{busy ? <><Loader2 className="dep-spin" size={16} /> Starting…</> : "Confirm"}</button><button className="dep-secondary" onClick={backToForm} disabled={busy}>Back / Edit</button></div></div>
    : <><label className="dep-field dep-amount"><span>Deposit amount · GHS</span><div className="dep-amount-wrap"><em>GHS</em><input type="number" min={MIN_DEPOSIT} step="1" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} /></div></label><div className="dep-quick">{QUICK_AMOUNTS.map((quick) => <button key={quick} className={amount === quick ? "chosen" : ""} onClick={() => setAmount(quick)}>GHS {quick.toLocaleString()}</button>)}</div><div className="dep-grid"><label className="dep-field"><span>Your MoMo number</span>{phoneLocked ? <div className="dep-locked-num"><strong>{localPhoneOf(phone)}</strong><small>Registered number</small></div> : <input value={phone} onChange={(e) => { setPhone(e.target.value); const d = detectNetwork(e.target.value); if (d) setNetwork(d); }} placeholder="024 000 0000" inputMode="tel" />}</label><label className="dep-field"><span>Network</span><select value={network} onChange={(e) => setNetwork(e.target.value)}><option value="">Auto-detect</option><option value="MTN">MTN</option><option value="TELECEL">Telecel</option><option value="AIRTELTIGO">AirtelTigo</option></select></label></div>{error && <div className="dep-alert error">{error}</div>}<button className="dep-primary" onClick={start} disabled={busy}>{busy ? <Loader2 className="dep-spin" size={16} /> : <Smartphone size={16} />}{busy ? "Verifying…" : "Deposit"}</button><p className="dep-facts"><ShieldCheck size={13} /> Instant deposits · ShinobiPay · Min GHS {MIN_DEPOSIT}</p></>}
    </div>
    <div className="dep-panel-manual" style={{ display: tab === "manual" ? undefined : "none" }}>
    {manualDone ? <div className="dep-success"><div className="dep-success-icon"><CheckCircle2 size={34} /></div><b>Deposit submitted</b><span>GHS {amount.toLocaleString()} will be added to your wallet as soon as our team confirms your transfer.</span><button onClick={resetManual}>Make another deposit</button></div>
    : <><div className="dep-payto"><span className="dep-payto-label">Send your MoMo transfer to</span><div className="dep-payto-row"><div><small>Account name</small><b>{RECEIVER_NAME}</b></div><button type="button" className="dep-copy" onClick={() => copy("name", RECEIVER_NAME)}>{copied === "name" ? <Check size={14} /> : <Copy size={14} />}{copied === "name" ? "Copied" : "Copy"}</button></div><div className="dep-payto-row"><div><small>{RECEIVER_NETWORK} number</small><b className="dep-payto-num">{RECEIVER_NUMBER}</b></div><button type="button" className="dep-copy" onClick={() => copy("number", RECEIVER_NUMBER)}>{copied === "number" ? <Check size={14} /> : <Copy size={14} />}{copied === "number" ? "Copied" : "Copy"}</button></div></div><label className="dep-field dep-amount"><span>Deposit amount · GHS</span><div className="dep-amount-wrap"><em>GHS</em><input type="number" min={MIN_DEPOSIT} step="1" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} /></div></label><div className="dep-quick">{QUICK_AMOUNTS.map((quick) => <button key={quick} className={amount === quick ? "chosen" : ""} onClick={() => setAmount(quick)}>GHS {quick.toLocaleString()}</button>)}</div><div className="dep-grid"><label className="dep-field"><span>Your MoMo number</span>{phoneLocked ? <div className="dep-locked-num"><strong>{localPhoneOf(phone)}</strong><small>Registered number</small></div> : <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="024 000 0000" inputMode="tel" />}</label><label className="dep-field"><span>Name on the MoMo account</span><input value={senderName} onChange={(e) => { setSenderName(e.target.value); setNameFromVerify(false); }} placeholder="Name on the account" readOnly={nameFromVerify} />{manualVerifying ? <em className="dep-field-hint">Checking name…</em> : nameFromVerify ? <em className="dep-field-hint"><b>Verified from your MoMo account</b></em> : manualVerifiedPhone === phone && phone.replace(/\D/g, "").length >= 9 ? <em className="dep-field-hint">Couldn&apos;t verify the name — type it yourself or <button type="button" className="dep-text-btn" onClick={() => setManualVerifiedPhone(null)}>retry</button>.</em> : null}</label></div><div className="dep-file-row">{shotUrl ? <span className="dep-file-name"><ImagePlus size={14} /> {shotName || "Screenshot attached"}<button type="button" aria-label="Remove screenshot" onClick={() => { setShotUrl(""); setShotName(""); }}><X size={13} /></button></span> : <button type="button" className="dep-file-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>{uploading ? <Loader2 className="dep-spin" size={14} /> : <ImagePlus size={14} />}{uploading ? "Uploading screenshot…" : "Attach receipt screenshot (optional)"}</button>}<input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickShot(e.target.files?.[0])} /></div>{manualError && <div className="dep-alert error">{manualError}</div>}<button className="dep-primary" onClick={submitManual} disabled={manualBusy || uploading}>{manualBusy ? <Loader2 className="dep-spin" size={16} /> : <Smartphone size={16} />}{manualBusy ? "Submitting…" : "Submit deposit"}</button></>}
    </div>
  </div><div className="dep-card dep-history"><div className="dep-card-head"><h2>My deposits</h2><button type="button" className="dep-refresh" onClick={() => { setLoadingRows(true); loadRows(); }}><RefreshCw size={13} /> Refresh</button></div>{loadingRows ? <p className="dep-empty">Loading…</p> : rows.length === 0 ? <p className="dep-empty">No deposits yet.</p> : <div className="dep-list">{rows.map((row) => <div className="dep-row" key={row.key}><div className="dep-row-main"><b>GHS {Number(row.amount ?? 0).toLocaleString()}</b><small>{row.date ? new Date(row.date).toLocaleString() : ""}{row.sub ? ` · ${row.sub}` : ""}</small></div><span className={`dep-chip ${row.chipClass}`}>{row.chip}</span></div>)}</div>}</div></section></main>;
}

const styles = `
.dep-page{position:relative;min-height:100vh;background:#080d12;color:#f4f7f5;padding:34px 16px 70px;font-family:'DM Sans',system-ui,sans-serif;overflow:hidden}.dep-glow{position:absolute;top:-180px;left:50%;transform:translateX(-50%);width:640px;height:380px;background:radial-gradient(closest-side,rgba(249,115,22,.22),transparent);pointer-events:none}.dep-hero,.dep-body{position:relative;max-width:560px;margin:0 auto}.dep-hero{display:flex;flex-direction:column;align-items:center;text-align:center;padding:10px 0 22px}.dep-medallion{display:grid;place-items:center;width:64px;height:64px;border-radius:20px;background:linear-gradient(145deg,rgba(249,115,22,.28),rgba(249,115,22,.08));border:1px solid rgba(249,115,22,.45);color:#ffa25e;box-shadow:0 0 0 6px rgba(249,115,22,.06),0 14px 34px rgba(249,115,22,.18);margin-bottom:14px}.dep-eyebrow{font-size:10px;letter-spacing:.22em;color:#ff9a55;font-weight:800}.dep-hero h1{margin:6px 0 0;font-size:30px;font-weight:900;letter-spacing:-.01em}.dep-trust{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:14px}.dep-trust span{display:inline-flex;align-items:center;gap:6px;padding:7px 11px;border:1px solid #22313c;border-radius:99px;background:rgba(255,255,255,.02);color:#9fb2bd;font-size:10px;font-weight:600}.dep-trust svg{color:#63dc91}.dep-card{position:relative;background:linear-gradient(180deg,#111a22,#0d141b);border:1px solid #2a3b47;border-radius:20px;padding:24px;box-shadow:0 24px 60px rgba(0,0,0,.45)}.dep-card::before{content:"";position:absolute;top:0;left:24px;right:24px;height:2px;border-radius:2px;background:linear-gradient(90deg,transparent,#f97316,transparent)}.dep-card-head{display:flex;justify-content:space-between;gap:12px;align-items:center}.dep-card h2{margin:0;font-size:20px;font-weight:800}.dep-provider{color:#7ce6ab;border:1px solid #2b6248;background:rgba(50,205,117,.07);border-radius:99px;padding:6px 10px;font-size:9px;font-weight:900;letter-spacing:.1em}.dep-tabs{display:flex;gap:6px;margin-top:16px;background:#0a1015;border:1px solid #30424e;border-radius:12px;padding:4px}.dep-tabs button{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;border:0;background:transparent;color:#a6b2b8;padding:10px 6px;border-radius:9px;font-size:12px;font-weight:800;cursor:pointer;transition:all .15s}.dep-tabs button.active{background:linear-gradient(135deg,#f97316,#ff8a3c);color:#fff;box-shadow:0 6px 16px rgba(249,115,22,.35)}.dep-payto{margin-top:16px;border:1px solid #2b6248;background:rgba(50,205,117,.05);border-radius:14px;padding:14px 15px;display:grid;gap:11px}.dep-payto-label{font-size:10px;color:#8fdcae;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.dep-payto-row{display:flex;justify-content:space-between;align-items:center;gap:10px}.dep-payto-row small{display:block;font-size:10px;color:#9fb2bd;font-weight:700;letter-spacing:.05em;text-transform:uppercase;margin-bottom:2px}.dep-payto-row b{font-size:16px;color:#f2fbf5}.dep-payto-num{font-size:19px!important;letter-spacing:.04em}.dep-copy{display:inline-flex;align-items:center;gap:5px;border:1px solid #2b6248;background:rgba(50,205,117,.08);color:#8ff0b3;border-radius:99px;padding:7px 11px;font-size:11px;font-weight:800;cursor:pointer}.dep-copy:active{transform:scale(.96)}.dep-locked-num{background:#0a1015;border:1px solid #2b6248;border-radius:11px;padding:11px 13px;display:flex;justify-content:space-between;align-items:center;gap:8px}.dep-locked-num strong{font-size:15px;color:#eef6f1;letter-spacing:.02em}.dep-locked-num small{color:#7ce6ab;font-size:10px;font-weight:800;white-space:nowrap}.dep-field-hint{display:block;font-size:11px;color:#9fb2bd;margin-top:6px;font-style:normal}.dep-field-hint b{color:#7ce6ab}.dep-text-btn{background:none;border:0;color:#ff9a55;font-weight:800;cursor:pointer;padding:0;font-size:11px}.dep-field{display:grid;gap:7px;margin-top:14px}.dep-field span{font-size:10px;color:#a5b2ba;font-weight:700;letter-spacing:.06em;text-transform:uppercase}.dep-field input,.dep-field select{width:100%;box-sizing:border-box;background:#0a1015;border:1px solid #30424e;border-radius:11px;color:#edf5f1;padding:12px 13px;outline:none;font:inherit;font-size:14px;transition:border-color .15s,box-shadow .15s}.dep-field input:focus,.dep-field select:focus{border-color:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.18)}.dep-amount-wrap{display:flex;align-items:center;background:#0a1015;border:1px solid #30424e;border-radius:12px;overflow:hidden;transition:border-color .15s,box-shadow .15s}.dep-amount-wrap:focus-within{border-color:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.18)}.dep-amount-wrap em{font-style:normal;font-weight:900;font-size:13px;color:#ff9a55;padding:0 4px 0 14px}.dep-amount-wrap input{border:0;background:transparent;font-size:22px;font-weight:800;padding:13px 12px 13px 6px;box-shadow:none!important}.dep-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.dep-quick{display:flex;gap:7px;overflow:auto;padding:12px 0 2px;scrollbar-width:none}.dep-quick::-webkit-scrollbar{display:none}.dep-quick button{white-space:nowrap;border:1px solid #2b3b46;border-radius:99px;background:#0c1319;color:#a6b2b8;padding:8px 13px;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s}.dep-quick button:hover{border-color:#f97316;color:#ffb77e}.dep-quick button.chosen{border-color:transparent;background:linear-gradient(135deg,#f97316,#ff8a3c);color:#fff;box-shadow:0 6px 16px rgba(249,115,22,.35)}.dep-facts{display:flex;align-items:center;gap:6px;margin-top:14px;color:#9fb2bd;font-size:11px}.dep-facts svg{color:#63dc91}.dep-panel-title{margin:6px 0 0;font-size:18px;font-weight:800}.dep-note{margin:10px 0 0;font-size:13px;color:#9fb2bd;line-height:1.6}.dep-note b{color:#eef6f1}.dep-confirm-box{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px;padding:14px;border-radius:12px;background:rgba(50,205,117,.07);border:1px solid #2b6248}.dep-confirm-box span{font-size:11px;color:#9fb2bd}.dep-confirm-box strong{font-size:15px;color:#e7fff0}.dep-actions{display:flex;gap:8px;margin-top:18px}.dep-actions .dep-primary{margin-top:0}.dep-secondary{flex:1;padding:14px;border-radius:12px;border:1px solid #30424e;background:transparent;color:#eef6f1;font-weight:800;cursor:pointer}.dep-secondary:disabled{opacity:.6;cursor:not-allowed}.dep-wait{display:grid;justify-items:center;gap:8px;text-align:center;padding:22px 10px 12px}.dep-wait h3{margin:0;font-size:18px}.dep-wait p{margin:0;font-size:12px;color:#9fb2bd;line-height:1.6}.dep-wait p b{color:#eef6f1}.dep-file-row{margin-top:14px}.dep-file-btn{display:inline-flex;align-items:center;gap:6px;border:1px dashed #30424e;background:transparent;color:#a6b2b8;border-radius:10px;padding:10px 13px;font-size:11px;font-weight:700;cursor:pointer}.dep-file-name{display:inline-flex;align-items:center;gap:7px;border:1px solid #2b6248;background:rgba(50,205,117,.07);color:#8ff0b3;border-radius:10px;padding:9px 12px;font-size:11px;font-weight:700}.dep-file-name button{display:grid;place-items:center;border:0;background:transparent;color:#8ff0b3;cursor:pointer;padding:0}.dep-primary{display:flex;justify-content:center;align-items:center;gap:8px;width:100%;margin-top:20px;padding:15px;border:0;border-radius:12px;background:linear-gradient(135deg,#f97316,#ff8a3c);color:#fff;font-weight:900;font-size:14px;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;box-shadow:0 10px 24px rgba(249,115,22,.3);transition:transform .1s,box-shadow .15s,opacity .15s}.dep-primary:hover:not(:disabled){box-shadow:0 12px 30px rgba(249,115,22,.45)}.dep-primary:active:not(:disabled){transform:scale(.985)}.dep-primary:disabled{opacity:.6;cursor:not-allowed}.dep-alert{margin-top:14px;padding:11px 12px;border-radius:10px;font-size:12px;line-height:1.5}.dep-alert.error{border:1px solid #713842;background:rgba(197,55,70,.1);color:#ff9ba5}.dep-success{display:grid;justify-items:center;gap:7px;margin-top:8px;padding:26px 10px 14px;text-align:center}.dep-success-icon{display:grid;place-items:center;width:76px;height:76px;border-radius:50%;background:rgba(50,205,117,.1);border:1px solid #2d7650;color:#65df96;box-shadow:0 0 0 8px rgba(50,205,117,.05);margin-bottom:6px}.dep-success b{color:#e7fff0;font-size:18px}.dep-success span{font-size:12px;color:#9aefbb}.dep-success button{margin-top:10px;border:0;border-radius:10px;padding:11px 16px;background:#65df96;color:#07130c;font-weight:800;cursor:pointer}.dep-history{margin-top:16px}.dep-refresh{display:inline-flex;align-items:center;gap:5px;border:1px solid #30424e;background:rgba(255,255,255,.02);color:#b1c0c8;border-radius:99px;padding:6px 11px;font-size:10px;font-weight:700;cursor:pointer}.dep-empty{color:#7e8e9a;font-size:12px;margin:14px 0 2px}.dep-list{display:grid;gap:8px;margin-top:14px}.dep-row{display:flex;justify-content:space-between;align-items:center;gap:10px;border:1px solid #22313c;border-radius:12px;padding:11px 13px;background:rgba(255,255,255,.02)}.dep-row-main b{font-size:14px;color:#eef6f1}.dep-row-main small{display:block;color:#7e8e9a;font-size:10px;margin-top:2px}.dep-chip{white-space:nowrap;border-radius:99px;padding:5px 9px;font-size:9px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.dep-chip.wait{color:#ffd28a;border:1px solid #6b5320;background:rgba(255,190,60,.07)}.dep-chip.ok{color:#7ce6ab;border:1px solid #2b6248;background:rgba(50,205,117,.08)}.dep-chip.bad{color:#ff9ba5;border:1px solid #713842;background:rgba(197,55,70,.08)}.dep-spin{animation:dep-spin 1s linear infinite}@keyframes dep-spin{to{transform:rotate(360deg)}}@media(max-width:600px){.dep-page{padding:22px 12px 50px}.dep-hero h1{font-size:25px}.dep-card{padding:18px 15px}.dep-grid{grid-template-columns:1fr}.dep-trust span{font-size:9px;padding:6px 9px}}
`;
