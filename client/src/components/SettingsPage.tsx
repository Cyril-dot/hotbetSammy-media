import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import api, { ApiError } from "@/lib/api";

const PREFS_KEY = "hotbet_prefs_v1";
interface LocalPrefs { oddsFormat: "decimal" | "fractional"; currency: string; notifyBets: boolean; notifyPromos: boolean; language: string }
const DEFAULT_PREFS: LocalPrefs = { oddsFormat: "decimal", currency: "GHS", notifyBets: true, notifyPromos: true, language: "en" };

function loadPrefs(): LocalPrefs {
  try { return { ...DEFAULT_PREFS, ...JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}") }; } catch { return DEFAULT_PREFS; }
}
function savePrefs(p: LocalPrefs) { try { window.localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ } }

export default function SettingsPage() {
  const [theme, setTheme] = useState<string>("dark");
  const [savingTheme, setSavingTheme] = useState(false);
  const [themeNotice, setThemeNotice] = useState("");
  const [prefs, setPrefs] = useState<LocalPrefs>(() => loadPrefs());

  useEffect(() => {
    api.user.me().then((u) => { if (typeof u.data.themePreference === "string") setTheme(u.data.themePreference); }).catch(() => undefined);
  }, []);

  const changeTheme = async (value: string) => {
    setTheme(value);
    setSavingTheme(true);
    setThemeNotice("");
    try {
      await api.user.update({ themePreference: value });
      setThemeNotice("Saved to your account.");
    } catch (e) {
      setThemeNotice(e instanceof ApiError ? e.message : "Could not save — please try again.");
    } finally {
      setSavingTheme(false);
    }
  };

  const updatePref = <K extends keyof LocalPrefs>(key: K, value: LocalPrefs[K]) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    savePrefs(next);
  };

  return (
    <main className="wrap support-page">
      <div className="bp-header"><div><span className="eyebrow">Account</span><h1 style={{ fontSize: 40 }}>Settings</h1></div></div>

      <div className="simple-grid">
        <section className="panel simple-card">
          <div className="module-title"><h3>Appearance</h3></div>
          <label className="auth-field">
            <span>Theme</span>
            <select value={theme} onChange={(e) => changeTheme(e.target.value)} disabled={savingTheme}>
              <option value="dark">Dark (default)</option>
              <option value="light">Light</option>
              <option value="system">Match system</option>
            </select>
          </label>
          {themeNotice && <small className="auth-notice" style={{ marginTop: 8, display: "block" }}>{themeNotice}</small>}
          <p className="muted" style={{ marginTop: 10, fontSize: 11 }}>Saved to your HotBet account.</p>
        </section>

        <section className="panel simple-card">
          <div className="module-title"><h3>Betting preferences</h3></div>
          <label className="auth-field">
            <span>Odds format</span>
            <select value={prefs.oddsFormat} onChange={(e) => updatePref("oddsFormat", e.target.value as LocalPrefs["oddsFormat"])}>
              <option value="decimal">Decimal (1.85)</option>
              <option value="fractional">Fractional (17/20)</option>
            </select>
          </label>
          <label className="auth-field" style={{ marginTop: 12 }}>
            <span>Display currency</span>
            <select value={prefs.currency} onChange={(e) => updatePref("currency", e.target.value)}>
              <option value="GHS">GHS — Ghanaian Cedi</option>
              <option value="NGN">NGN — Nigerian Naira</option>
              <option value="USD">USD — US Dollar</option>
            </select>
          </label>
          <label className="auth-field" style={{ marginTop: 12 }}>
            <span>Language</span>
            <select value={prefs.language} onChange={(e) => updatePref("language", e.target.value)}>
              <option value="en">English</option>
            </select>
          </label>
        </section>

        <section className="panel simple-card" style={{ gridColumn: "1 / -1" }}>
          <div className="module-title"><h3>Notifications</h3></div>
          <label className="check-row" style={{ marginBottom: 10 }}>
            <input type="checkbox" checked={prefs.notifyBets} onChange={(e) => updatePref("notifyBets", e.target.checked)} /> Notify me about bet settlements
          </label>
          <label className="check-row">
            <input type="checkbox" checked={prefs.notifyPromos} onChange={(e) => updatePref("notifyPromos", e.target.checked)} /> Notify me about promotions & bonuses
          </label>
          <div className="deposit-note" style={{ marginTop: 14 }}>
            <Info size={13} />
            Odds format, currency, language, and notification preferences are currently saved on this device only.
          </div>
        </section>
      </div>
    </main>
  );
}
