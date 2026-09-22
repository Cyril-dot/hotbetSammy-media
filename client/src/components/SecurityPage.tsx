import { useEffect, useState } from "react";
import { AlertTriangle, KeyRound, Laptop, ShieldCheck } from "lucide-react";
import api, { ApiError } from "@/lib/api";

export default function SecurityPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    api.user.me().then((u) => setEmail(String(u.data.email ?? ""))).catch(() => undefined);
  }, []);

  const sendReset = async () => {
    if (!email) { setNotice("We couldn't find an email on your account to send the reset link to."); return; }
    setSending(true);
    setNotice("");
    try {
      await api.auth.requestPasswordReset({ email });
      setNotice(`A password reset link has been sent to ${email}.`);
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "We could not send the reset link. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="wrap support-page">
      <div className="bp-header"><div><span className="eyebrow">Account</span><h1 style={{ fontSize: 40 }}>Security</h1></div></div>

      <div className="simple-grid">
        <section className="panel simple-card">
          <KeyRound size={22} />
          <h3>Change your password</h3>
          <p>For your security, password changes are confirmed by email. We'll send a reset link to <b>{email || "your account email"}</b>.</p>
          <button className="gold-button" onClick={sendReset} disabled={sending} type="button" style={{ marginTop: 14 }}>
            {sending ? "Sending…" : "Send reset link"}
          </button>
          {notice && <small className="auth-notice" style={{ marginTop: 10, display: "block" }}>{notice}</small>}
        </section>

        <section className="panel simple-card">
          <Laptop size={22} />
          <h3>This device</h3>
          <p>You're currently signed in on this device and browser.</p>
          <div className="status-grid" style={{ marginTop: 4 }}>
            <div><span>Session</span><b className="status-good">Active</b></div>
          </div>
        </section>

        <section className="panel simple-card" style={{ gridColumn: "1 / -1" }}>
          <AlertTriangle size={22} />
          <h3>Two-factor authentication</h3>
          <p>Two-factor authentication isn't available to manage from this app yet — we didn't want to show a toggle that doesn't actually do anything. If you'd like 2FA enabled sooner, reach out via the <a href="/support" style={{ color: "var(--orange,#F36600)", fontWeight: 800 }}>Support Centre</a>.</p>
        </section>

        <section className="panel simple-card" style={{ gridColumn: "1 / -1" }}>
          <ShieldCheck size={22} />
          <h3>Account verification</h3>
          <p>Keeping your email and phone number verified helps us secure withdrawals and recover your account if needed. Manage these from your <a href="/profile" style={{ color: "var(--orange,#F36600)", fontWeight: 800 }}>Profile page</a>.</p>
        </section>
      </div>
    </main>
  );
}
