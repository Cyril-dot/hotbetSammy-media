import { useEffect, useState } from "react";
import { Banknote, CheckCircle2, CreditCard, Loader2, Phone, RefreshCw, ShieldCheck, Smartphone } from "lucide-react";
import api from "@/lib/api";
import { emitDataRefresh } from "@/lib/autoRefresh";

type Channel = "momo" | "bank" | "card";
type PaymentState = "idle" | "pending" | "otp" | "birthday" | "success" | "failed";
type Payload = Record<string, any>;

const MIN_DEPOSIT = 200;
const QUICK_AMOUNTS = [MIN_DEPOSIT, 500, 1000, 2000, 5000, 10000];
const KNOWN_DEPOSIT_PHONES_KEY = "hotbet.deposit.known-phones.v1";

function normalizeDepositPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("233") ? `0${digits.slice(3)}` : digits;
}

function hasKnownDepositPhone(phone: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const known = JSON.parse(window.localStorage.getItem(KNOWN_DEPOSIT_PHONES_KEY) ?? "[]");
    return Array.isArray(known) && known.includes(normalizeDepositPhone(phone));
  } catch {
    return false;
  }
}

function rememberDepositPhone(phone: string): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeDepositPhone(phone);
  if (!normalized) return;
  try {
    const existing = JSON.parse(window.localStorage.getItem(KNOWN_DEPOSIT_PHONES_KEY) ?? "[]");
    const known = Array.isArray(existing) ? existing.filter((value): value is string => typeof value === "string") : [];
    if (!known.includes(normalized)) {
      window.localStorage.setItem(KNOWN_DEPOSIT_PHONES_KEY, JSON.stringify([...known, normalized]));
    }
  } catch {
    // OTP behavior must still work if browser storage is unavailable.
  }
}

function paystackRequiresOtp(data: Payload): boolean {
  const nextType = String(data.next_action?.type ?? data.nextAction?.type ?? "").toLowerCase();
  return ["submit_otp", "send_otp", "otp"].includes(nextType)
    || data.otp_required === true
    || data.requires_otp === true
    || data.requiresOtp === true;
}
const PROVIDERS = [
  ["mtn", "MTN Mobile Money"],
  ["atl", "AirtelTigo Money"],
  ["vod", "Telecel Cash"],
] as const;

function payload(response: any): Payload {
  const outer = response?.data && typeof response.data === "object" ? response.data : response;
  return outer?.data && typeof outer.data === "object" ? outer.data : (outer ?? {});
}
function paymentStatus(data: Payload): string {
  return String(data.status ?? data.data?.status ?? data.gateway_response ?? "").toLowerCase();
}
function isPaid(data: Payload): boolean {
  return paymentStatus(data) === "success" || paymentStatus(data) === "successful" || data.paid === true;
}
function referenceFrom(data: Payload): string {
  return String(data.reference ?? data.data?.reference ?? "");
}
function friendlyError(error: unknown): string {
  return error instanceof Error ? error.message : "Paystack could not start this deposit. Please try again.";
}

export default function DepositCenter() {
  const [channel, setChannel] = useState<Channel>("momo");
  const [amount, setAmount] = useState(MIN_DEPOSIT);
  const [phone, setPhone] = useState("");
  const [provider, setProvider] = useState<(typeof PROVIDERS)[number][0]>("mtn");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [birthday, setBirthday] = useState("");
  const [otp, setOtp] = useState("");
  const [reference, setReference] = useState("");
  const [state, setState] = useState<PaymentState>("idle");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  const verify = async (ref = reference, mode = channel) => {
    if (!ref) return;
    const response = mode === "momo"
      ? await api.deposits.paystackMomoVerify(ref)
      : mode === "bank"
        ? await api.deposits.paystackBankVerify(ref)
        : await api.deposits.paystackCardVerify(ref);
    const data = payload(response);
    if (isPaid(data)) {
      setState("success");
      setMessage("Payment confirmed. Your wallet will update automatically.");
      emitDataRefresh("deposit-updated");
      return;
    }
    const status = paymentStatus(data);
    if (["failed", "abandoned", "reversed", "declined"].includes(status)) {
      setState("failed");
      setError(data.gateway_response || "Paystack marked this payment as unsuccessful.");
      return;
    }
    setState("pending");
    setMessage("Payment is still being confirmed. We will keep checking automatically.");
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const returnedReference = params.get("reference") || params.get("trxref");
    if (!returnedReference) return;
    setChannel("card");
    setReference(returnedReference);
    setState("pending");
    void verify(returnedReference, "card").catch((e) => setError(friendlyError(e)));
  }, []);

  useEffect(() => {
    if (state !== "pending" || !reference) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      if (attempts > 60) { window.clearInterval(timer); return; }
      void verify().catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [state, reference, channel]);

  const start = async () => {
    if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) { setError(`The minimum deposit is GHS ${MIN_DEPOSIT.toLocaleString()}.`); return; }
    if (channel === "momo" && phone.replace(/\D/g, "").length < 9) { setError("Enter a valid Ghana mobile-money phone number."); return; }
    if (channel === "bank" && (!bankCode.trim() || accountNumber.replace(/\D/g, "").length < 6)) { setError("Enter the bank code and a valid account number."); return; }
    setChecking(true); setError(""); setMessage(""); setState("idle"); setReference("");
    try {
      let response: any;
      if (channel === "momo") response = await api.deposits.paystackMomoInit({ amount, phone: phone.trim(), provider });
      if (channel === "bank") response = await api.deposits.paystackBankInit({ amount, bankCode: bankCode.trim(), accountNumber: accountNumber.trim(), ...(birthday ? { birthday } : {}) });
      if (channel === "card") response = await api.deposits.paystackCardInit({ amount });
      const data = payload(response);
      const ref = referenceFrom(data);
      if (channel === "card") {
        const authorizationUrl = String(data.authorization_url ?? data.data?.authorization_url ?? "");
        if (!authorizationUrl) throw new Error("Paystack did not return a checkout link.");
        setReference(ref); setState("pending");
        window.location.assign(authorizationUrl);
        return;
      }
      if (!ref) throw new Error("Paystack did not return a payment reference.");
      setReference(ref);
      const nextType = String(data.next_action?.type ?? data.nextAction?.type ?? "").toLowerCase();
      const newPhoneNeedsOtp = channel === "momo" && !hasKnownDepositPhone(phone);
      // Paystack can omit next_action for a new phone even though it has sent an OTP.
      // New numbers must always expose the OTP field so the user can continue.
      if (newPhoneNeedsOtp || paystackRequiresOtp(data)) {
        setState("otp");
        setMessage("Enter the OTP sent to this mobile number by Paystack.");
      } else if (nextType === "submit_birthday") setState("birthday");
      else { setState("pending"); setMessage("Approve the Paystack prompt on your phone. We will confirm it automatically."); }
    } catch (e) { setState("failed"); setError(friendlyError(e)); }
    finally { setChecking(false); }
  };

  const submitOtp = async () => {
    if (!otp.trim() || !reference) { setError("Enter the OTP sent by your payment provider."); return; }
    setChecking(true); setError("");
    try {
      const response = channel === "momo"
        ? await api.deposits.paystackMomoSubmitOtp({ otp: otp.trim(), reference })
        : await api.deposits.paystackBankSubmitOtp({ otp: otp.trim(), reference });
      const data = payload(response);
      if (channel === "momo") rememberDepositPhone(phone);
      setOtp("");
      if (isPaid(data)) { setState("success"); setMessage("Payment confirmed. Your wallet will update automatically."); emitDataRefresh("deposit-updated"); }
      else { setState("pending"); setMessage("OTP accepted. We are confirming the payment with Paystack."); }
    } catch (e) { setError(friendlyError(e)); }
    finally { setChecking(false); }
  };

  const submitBirthday = async () => {
    if (!birthday || !reference) { setError("Enter the account birthday required by the bank."); return; }
    setChecking(true); setError("");
    try { await api.deposits.paystackBankSubmitBirthday({ birthday, reference }); setState("pending"); setMessage("Bank details accepted. We are confirming the payment with Paystack."); }
    catch (e) { setError(friendlyError(e)); }
    finally { setChecking(false); }
  };

  const reset = () => { setState("idle"); setReference(""); setOtp(""); setError(""); setMessage(""); };

  return <main className="dep-page"><style>{styles}</style><section className="dep-hero"><div className="dep-hero-icon"><ShieldCheck size={22} /></div><div><span className="dep-eyebrow">SECURE PAYMENTS</span><h1>Deposit with Paystack</h1><p>Mobile Money, bank and card deposits are processed securely by Paystack.</p></div></section><section className="dep-body"><div className="dep-trust"><span><ShieldCheck size={14} /> Paystack secured</span><span><CheckCircle2 size={14} /> Wallet credited after confirmation</span><span><RefreshCw size={14} /> Automatic payment verification</span></div><div className="dep-card"><div className="dep-card-head"><div><h2>Add funds</h2><p>Choose a payment method and follow the secure Paystack steps.</p></div><span className="dep-provider">PAYSTACK</span></div><div className="dep-methods"><button className={channel === "momo" ? "active" : ""} onClick={() => { reset(); setChannel("momo"); }}><Smartphone size={17} /><b>Mobile Money</b><small>MTN · AirtelTigo · Telecel</small></button><button className={channel === "bank" ? "active" : ""} onClick={() => { reset(); setChannel("bank"); }}><Banknote size={17} /><b>Bank</b><small>Paystack bank charge</small></button><button className={channel === "card" ? "active" : ""} onClick={() => { reset(); setChannel("card"); }}><CreditCard size={17} /><b>Card</b><small>Secure hosted checkout</small></button></div><label className="dep-field"><span>Deposit amount · GHS (minimum 200)</span><input type="number" min={MIN_DEPOSIT} step="1" value={amount} onChange={(e) => setAmount(Number(e.target.value) || 0)} disabled={state === "pending" || state === "otp" || state === "birthday"} /></label><div className="dep-quick">{QUICK_AMOUNTS.map((quick) => <button key={quick} className={amount === quick ? "chosen" : ""} onClick={() => setAmount(quick)}>GHS {quick.toLocaleString()}</button>)}</div>{channel === "momo" && <div className="dep-grid"><label className="dep-field"><span>Mobile number</span><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="024 000 0000" inputMode="tel" /></label><label className="dep-field"><span>Network</span><select value={provider} onChange={(e) => setProvider(e.target.value as typeof provider)}>{PROVIDERS.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>}{channel === "bank" && <div className="dep-grid"><label className="dep-field"><span>Paystack bank code</span><input value={bankCode} onChange={(e) => setBankCode(e.target.value)} placeholder="Bank code" /></label><label className="dep-field"><span>Account number</span><input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Account number" inputMode="numeric" /></label><label className="dep-field"><span>Birthday if requested</span><input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} /></label></div>}{state === "otp" && <div className="dep-step"><b>Enter Paystack OTP</b><p>Enter the OTP sent to this mobile number by Paystack.</p><input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="OTP" inputMode="numeric" /></div>}{state === "birthday" && <div className="dep-step"><b>Confirm bank birthday</b><p>Paystack requires the account holder birthday to continue.</p><input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} /></div>}{error && <div className="dep-alert error">{error}</div>}{message && <div className="dep-alert ok">{message}</div>}{state === "success" ? <div className="dep-success"><CheckCircle2 size={28} /><b>Deposit confirmed</b><span>Reference: {reference}</span><button onClick={reset}>Make another deposit</button></div> : state === "otp" ? <button className="dep-primary" onClick={submitOtp} disabled={checking}>{checking ? <Loader2 className="dep-spin" size={16} /> : null}{checking ? "Submitting…" : "Submit OTP"}</button> : state === "birthday" ? <button className="dep-primary" onClick={submitBirthday} disabled={checking}>{checking ? "Submitting…" : "Continue"}</button> : <button className="dep-primary" onClick={start} disabled={checking || state === "pending"}>{checking ? <Loader2 className="dep-spin" size={16} /> : channel === "card" ? <CreditCard size={16} /> : <Phone size={16} />}{checking ? "Starting Paystack…" : channel === "card" ? "Continue to Paystack checkout" : state === "pending" ? "Waiting for confirmation…" : "Start Paystack deposit"}</button>}{state === "pending" && <button className="dep-check" onClick={() => verify().catch((e) => setError(friendlyError(e)))} disabled={checking}><RefreshCw size={14} /> Check payment status</button>}<small className="dep-note">Your payment reference is {reference ? "" : "created securely by Paystack after you start"}{reference && <code>{reference}</code>}. Never share OTPs with anyone.</small></div></section></main>;
}

const styles = `
.dep-page{min-height:100vh;background:#080d12;color:#f4f7f5;padding:28px 16px 60px;font-family:'DM Sans',system-ui,sans-serif}.dep-hero,.dep-body{max-width:880px;margin:0 auto}.dep-hero{display:flex;gap:14px;align-items:center;padding:18px 0 24px}.dep-hero-icon{display:grid;place-items:center;width:48px;height:48px;border-radius:14px;background:rgba(243,102,0,.14);color:#ff9a55}.dep-eyebrow{font-size:10px;letter-spacing:.12em;color:#ff9a55;font-weight:800}.dep-hero h1{margin:4px 0;font-size:28px}.dep-hero p{margin:0;color:#8e9da8;font-size:13px}.dep-trust{display:flex;gap:9px;flex-wrap:wrap;margin-bottom:12px}.dep-trust span{display:inline-flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid #253743;border-radius:8px;color:#a9b8c0;font-size:10px}.dep-trust svg{color:#63dc91}.dep-card{background:#101820;border:1px solid #2a3b47;border-radius:16px;padding:20px;box-shadow:0 18px 55px rgba(0,0,0,.25)}.dep-card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.dep-card h2{margin:0;font-size:19px}.dep-card p{margin:5px 0 0;color:#8495a0;font-size:11px}.dep-provider{color:#66dfa0;border:1px solid #2b6248;border-radius:99px;padding:6px 9px;font-size:9px;font-weight:900;letter-spacing:.08em}.dep-methods{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:20px 0}.dep-methods button{display:grid;grid-template-columns:auto 1fr;gap:3px 8px;text-align:left;align-items:center;padding:12px;border-radius:10px;border:1px solid #2c3d49;background:#0c1319;color:#9baab4;cursor:pointer}.dep-methods button svg{grid-row:span 2;color:#758997}.dep-methods button b{font-size:12px;color:#ecf4ef}.dep-methods button small{font-size:9px;color:#7e8e9a}.dep-methods button.active{border-color:#f97316;background:rgba(243,102,0,.1)}.dep-methods button.active svg,.dep-methods button.active b{color:#ffb77e}.dep-field{display:grid;gap:6px;margin-top:12px}.dep-field span{font-size:10px;color:#a5b2ba;font-weight:700}.dep-field input,.dep-field select,.dep-step input{width:100%;box-sizing:border-box;background:#0a1015;border:1px solid #30424e;border-radius:9px;color:#edf5f1;padding:11px 12px;outline:none;font:inherit;font-size:13px}.dep-field input:focus,.dep-field select:focus,.dep-step input:focus{border-color:#f97316}.dep-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.dep-quick{display:flex;gap:7px;overflow:auto;padding:11px 0 2px}.dep-quick button{white-space:nowrap;border:1px solid #2b3b46;border-radius:99px;background:#0c1319;color:#a6b2b8;padding:7px 10px;font-size:10px;cursor:pointer}.dep-quick button.chosen{border-color:#f97316;color:#ffb77e;background:rgba(243,102,0,.1)}.dep-step{display:grid;gap:7px;margin-top:15px;padding:14px;border:1px dashed #f97316;border-radius:10px;background:rgba(243,102,0,.06)}.dep-step b{font-size:13px}.dep-step p{margin:0;color:#94a2ab;font-size:11px}.dep-primary{display:flex;justify-content:center;align-items:center;gap:7px;width:100%;margin-top:18px;padding:13px;border:0;border-radius:10px;background:#f97316;color:white;font-weight:900;cursor:pointer}.dep-primary:disabled{opacity:.55;cursor:not-allowed}.dep-check{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;margin-top:8px;padding:9px;border:1px solid #30424e;border-radius:9px;background:transparent;color:#b1c0c8;cursor:pointer;font-size:11px}.dep-alert{margin-top:12px;padding:10px;border-radius:8px;font-size:11px}.dep-alert.error{border:1px solid #713842;background:rgba(197,55,70,.1);color:#ff9ba5}.dep-alert.ok{border:1px solid #2a6645;background:rgba(50,205,117,.08);color:#9aefbb}.dep-success{display:grid;justify-items:center;gap:6px;margin-top:18px;padding:20px;border:1px solid #2d7650;border-radius:11px;background:rgba(50,205,117,.08);color:#9aefbb}.dep-success b{color:#e7fff0}.dep-success span{font-size:10px}.dep-success button{margin-top:6px;border:0;border-radius:8px;padding:9px 12px;background:#65df96;color:#07130c;font-weight:800;cursor:pointer}.dep-note{display:block;margin-top:12px;color:#72838e;font-size:10px;line-height:1.5}.dep-note code{color:#f8c18f;margin-left:4px}.dep-spin{animation:dep-spin 1s linear infinite}@keyframes dep-spin{to{transform:rotate(360deg)}}@media(max-width:600px){.dep-page{padding:18px 11px 40px}.dep-hero h1{font-size:24px}.dep-card{padding:15px}.dep-methods{grid-template-columns:1fr}.dep-grid{grid-template-columns:1fr}.dep-trust{display:grid;grid-template-columns:1fr}.dep-card-head{display:grid}.dep-provider{justify-self:start}}
`;
