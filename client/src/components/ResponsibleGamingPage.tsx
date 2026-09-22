import { useState } from "react";
import { AlertOctagon, Info, ShieldAlert, Timer } from "lucide-react";

const KEY = "hotbet_rg_limits_v1";
interface Limits { dailyDeposit: string; weeklyDeposit: string; dailyStake: string; sessionMinutes: string }
const DEFAULTS: Limits = { dailyDeposit: "", weeklyDeposit: "", dailyStake: "", sessionMinutes: "" };

function load(): Limits { try { return { ...DEFAULTS, ...JSON.parse(window.localStorage.getItem(KEY) ?? "{}") }; } catch { return DEFAULTS; } }
function save(l: Limits) { try { window.localStorage.setItem(KEY, JSON.stringify(l)); } catch { /* ignore */ } }

export default function ResponsibleGamingPage() {
  const [limits, setLimits] = useState<Limits>(() => load());
  const [saved, setSaved] = useState(false);

  const update = (k: keyof Limits, v: string) => { const next = { ...limits, [k]: v }; setLimits(next); save(next); setSaved(true); setTimeout(() => setSaved(false), 1500); };

  return (
    <main className="wrap support-page">
      <div className="bp-header"><div><span className="eyebrow">Play safely</span><h1 style={{ fontSize: 40 }}>Responsible Gaming</h1></div></div>

      <div className="deposit-note" style={{ marginBottom: 18 }}>
        <Info size={13} />
        These limits are saved as reminders on this device only — they are not yet enforced by our systems. For a limit that's actually applied to your account, contact <a href="/support" style={{ color: "var(--orange,#F36600)", fontWeight: 800 }}>Support</a> directly.
      </div>

      <div className="simple-grid">
        <section className="panel simple-card">
          <Timer size={22} />
          <h3>Set personal limits</h3>
          <form className="deposit-form" onSubmit={(e) => e.preventDefault()}>
            <label className="auth-field"><span>Daily deposit limit (GHS)</span><input type="number" value={limits.dailyDeposit} onChange={(e) => update("dailyDeposit", e.target.value)} placeholder="e.g. 200" /></label>
            <label className="auth-field"><span>Weekly deposit limit (GHS)</span><input type="number" value={limits.weeklyDeposit} onChange={(e) => update("weeklyDeposit", e.target.value)} placeholder="e.g. 800" /></label>
            <label className="auth-field"><span>Daily stake limit (GHS)</span><input type="number" value={limits.dailyStake} onChange={(e) => update("dailyStake", e.target.value)} placeholder="e.g. 100" /></label>
            <label className="auth-field"><span>Session reminder (minutes)</span><input type="number" value={limits.sessionMinutes} onChange={(e) => update("sessionMinutes", e.target.value)} placeholder="e.g. 60" /></label>
            {saved && <small className="auth-notice bp-success">Saved on this device.</small>}
          </form>
        </section>

        <section className="panel simple-card">
          <ShieldAlert size={22} />
          <h3>Take a break</h3>
          <p>Need time away? A cooling-off period temporarily pauses betting on your account.</p>
          <p className="muted" style={{ marginTop: 8 }}>To apply a real cooling-off period or self-exclusion to your account, please contact our <a href="/support" style={{ color: "var(--orange,#F36600)", fontWeight: 800 }}>Support team</a> — this requires account-level action we can't take from a device setting alone.</p>
        </section>

        <section className="panel simple-card" style={{ gridColumn: "1 / -1" }}>
          <AlertOctagon size={22} />
          <h3>Signs to watch for</h3>
          <p>Betting should stay enjoyable. Consider taking a break if you're chasing losses, betting more than you can afford, or betting is affecting your relationships, work, or wellbeing. Free, confidential support is available from organisations such as GamCare (www.gamcare.org.uk) and the National Problem Gambling Helpline.</p>
        </section>
      </div>
    </main>
  );
}
