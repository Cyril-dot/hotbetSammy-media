// ─────────────────────────────────────────────────────────────────────────────
// ProfileCenter — user profile & account-management page.
//
// Identity (name/email/verification) comes from the single shared session
// (useSession) — the same source the header and account page use — so this
// page can never show different information than the rest of the app. Only
// the editable fields (phone/country) are locally managed while typing.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { BadgeCheck, ChevronRight, Mail, Phone, ShieldAlert, ShieldCheck, UserRound } from "lucide-react";
import api, { ApiError } from "@/lib/api";
import { useSession, pickUserField } from "@/lib/session";
import { emojiForSeed } from "@/lib/avatars";
import { COUNTRY_OPTIONS, resolveCountryCode } from "@/lib/countries";

interface ProfileForm { firstName: string; lastName: string; phone: string; country: string }

function VerificationPill({ verified }: { verified: boolean | undefined }) {
  if (verified === undefined) return <span className="pf-pill pf-pill-unknown"><ShieldAlert size={12} /> Not checked</span>;
  return verified
    ? <span className="pf-pill pf-pill-ok"><ShieldCheck size={12} /> Verified</span>
    : <span className="pf-pill pf-pill-pending"><ShieldAlert size={12} /> Not verified</span>;
}

export default function ProfileCenter() {
  const { user, checked, refresh } = useSession();
  const [form, setForm] = useState<ProfileForm>({ firstName: "", lastName: "", phone: "", country: "" });
  const [formLoaded, setFormLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  // Re-validate on every visit, same intent as the reference page's own
  // fetchProfile-on-mount — but through the shared session, not a parallel fetch.
  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!user || formLoaded) return;
    setForm({
      firstName: pickUserField(user, "firstName", "first_name", "givenName"),
      lastName: pickUserField(user, "lastName", "last_name", "familyName"),
      phone: pickUserField(user, "phone", "phoneNumber", "phone_number"),
      country: pickUserField(user, "country", "countryCode"),
    });
    setFormLoaded(true);
    if (!pickUserField(user, "firstName", "first_name", "givenName") && !pickUserField(user, "email", "emailAddress", "username")) {
      // eslint-disable-next-line no-console
      console.debug("[profile] Session user object had no recognizable name/email fields:", user);
    }
  }, [user, formLoaded]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice("");
    setSaving(true);
    try {
      await api.user.update(form as unknown as Record<string, unknown>);
      refresh();
      setNotice("Profile updated.");
    } catch (err) {
      setNotice(err instanceof ApiError ? err.message : "We could not save your changes. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!checked) {
    return (
      <div className="pf-page pf-page-empty">
        <PfStyles />
        <div className="pf-loading">Loading your profile…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="pf-page pf-page-empty">
        <PfStyles />
        <section className="pf-signedout">
          <span className="pf-signedout-icon"><UserRound size={26} /></span>
          <h1>Sign in to view your profile</h1>
          <p>Manage your personal details, security, and verification here.</p>
          <Link href="/login" className="gold-button" style={{ marginTop: 16 }}>Sign in <ChevronRight size={15} /></Link>
        </section>
      </div>
    );
  }

  const email = pickUserField(user, "email", "emailAddress", "username");
  const emailVerified = typeof user.emailVerified === "boolean" ? (user.emailVerified as boolean) : undefined;
  const memberSince = pickUserField(user, "createdAt", "created_at", "joinedAt");
  const userId = pickUserField(user, "id", "userId", "accountId");
  const fullName = [form.firstName, form.lastName].filter(Boolean).join(" ") || (email ? email.split("@")[0] : "");
  const avatarEmoji = emojiForSeed(userId || email || "guest");

  return (
    <div className="pf-page">
      <PfStyles />

      <section className="pf-hero">
        <div className="pf-avatar"><span className="pf-avatar-emoji">{avatarEmoji}</span></div>
        <div className="pf-id">
          <p className="pf-name">{fullName || "Account holder"}</p>
          <p className="pf-sub"><Mail size={12} /> {email || "No email on file"}</p>
        </div>
      </section>

      <div className="pf-body">
        <section className="pf-card">
          <h2 className="pf-card-title">Verification status</h2>
          <div className="pf-verify-row">
            <span className="pf-verify-label"><Mail size={14} /> Email</span>
            <VerificationPill verified={emailVerified} />
          </div>
          <div className="pf-verify-row">
            <span className="pf-verify-label"><Phone size={14} /> Phone</span>
            <VerificationPill verified={form.phone ? undefined : false} />
          </div>
          <div className="pf-verify-row">
            <span className="pf-verify-label"><BadgeCheck size={14} /> Identity (KYC)</span>
            <VerificationPill verified={false} />
          </div>
        </section>

        {(memberSince || userId) && (
          <section className="pf-card">
            <h2 className="pf-card-title">Account information</h2>
            {memberSince && (
              <div className="pf-info-row"><span>Member since</span><b>{new Date(memberSince).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}</b></div>
            )}
            {userId && <div className="pf-info-row"><span>Account ID</span><b className="pf-mono">{userId}</b></div>}
          </section>
        )}

        <section className="pf-card">
          <h2 className="pf-card-title">Personal information</h2>
          <form onSubmit={save} className="pf-form">
            <div className="pf-form-row">
              <label className="pf-field"><span>First name</span><input value={form.firstName} onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))} placeholder="First name" /></label>
              <label className="pf-field"><span>Last name</span><input value={form.lastName} onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))} placeholder="Last name" /></label>
            </div>
            <label className="pf-field"><span>Email</span><input value={email} disabled /></label>
            <label className="pf-field"><span>Phone number</span><input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} placeholder="+233 24 000 0000" /></label>
            <label className="pf-field"><span>Country</span><select value={resolveCountryCode(form.country) || "GH"} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}>{COUNTRY_OPTIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
            <button className="gold-button full" type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
            {notice && <small className="pf-notice">{notice}</small>}
          </form>
        </section>

        <section className="pf-card">
          <h2 className="pf-card-title">Security</h2>
          <Link href="/security" className="pf-link-row">
            <span>Change password & manage sessions</span>
            <ChevronRight size={16} />
          </Link>
        </section>
      </div>
    </div>
  );
}

function PfStyles() {
  return (
    <style>{`
      .pf-page{ background:#060A12; min-height:60vh; }
      .pf-page-empty{ display:flex; align-items:center; justify-content:center; min-height:70vh; }
      .pf-loading{ color:rgba(255,255,255,.4); font-size:13px; }

      .pf-signedout{
        display:flex; flex-direction:column; align-items:center; text-align:center;
        max-width:360px; padding:40px 26px; background:#0D1528; border:1px solid rgba(255,255,255,.08); box-shadow:0 8px 30px rgba(0,0,0,.45);
        border-radius:14px;
      }
      .pf-signedout-icon{ display:grid; place-items:center; width:52px; height:52px; border-radius:50%; background:rgba(243,102,0,.08); color:var(--orange,#F36600); margin-bottom:14px; }
      .pf-signedout h1{ font:800 22px 'DM Sans',sans-serif; letter-spacing:-.01em; color:#FFFFFF; }
      .pf-signedout p{ margin-top:8px; font-size:12.5px; color:rgba(255,255,255,.45); line-height:1.6; }

      .pf-hero{
        display:flex; align-items:center; gap:16px; padding:26px 26px;
        background:linear-gradient(135deg,var(--orange,#F36600) 0%,var(--orange,#F36600) 65%,#c81530 130%); color:#fff;
        border-radius:0 0 18px 18px;
      }
      .pf-avatar{
        flex-shrink:0; width:58px; height:58px; border-radius:50%; display:flex; align-items:center; justify-content:center;
        font-size:1.4rem; font-weight:800; font-family:'DM Sans',sans-serif;
        background:rgba(255,255,255,.16); border:2px solid rgba(255,255,255,.32);
      }
      .pf-avatar-emoji{ font-size:1.7rem; line-height:1; }
      .pf-id{ min-width:0; }
      .pf-name{ margin:0; font-size:1.2rem; font-weight:800; letter-spacing:-.015em; font-family:'DM Sans',sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .pf-sub{ display:flex; align-items:center; gap:6px; margin:4px 0 0; font-size:.78rem; color:rgba(255,255,255,.78); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

      .pf-body{ padding:20px 26px 50px; max-width:640px; margin:0 auto; display:flex; flex-direction:column; gap:18px; }

      .pf-card{ background:#0D1528; border:1px solid rgba(255,255,255,.08); box-shadow:0 4px 20px rgba(0,0,0,.4); padding:18px 18px 20px; border-radius:12px; }
      .pf-card-title{ margin:0 0 13px; font-size:.72rem; font-weight:800; letter-spacing:.09em; text-transform:uppercase; color:rgba(255,255,255,.38); }

      .pf-verify-row{ display:flex; align-items:center; justify-content:space-between; padding:9px 0; border-top:1px solid rgba(255,255,255,.06); }
      .pf-verify-row:first-of-type{ border-top:none; }
      .pf-verify-label{ display:flex; align-items:center; gap:7px; font-size:.83rem; font-weight:700; color:#FFFFFF; }
      .pf-pill{ display:inline-flex; align-items:center; gap:4px; padding:3px 10px; border-radius:999px; font-size:.68rem; font-weight:800; }
      .pf-pill-ok{ background:rgba(13,166,83,.12); color:var(--live,#00C853); }
      .pf-pill-pending,.pf-pill-unknown{ background:rgba(243,102,0,.08); color:var(--orange,#F36600); }

      .pf-info-row{ display:flex; align-items:center; justify-content:space-between; padding:8px 0; font-size:.82rem; color:rgba(255,255,255,.45); }
      .pf-info-row b{ color:#FFFFFF; font-weight:700; }
      .pf-mono{ font-family:monospace; font-size:.76rem; }

      .pf-form{ display:flex; flex-direction:column; gap:12px; }
      .pf-form-row{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
      .pf-field{ display:flex; flex-direction:column; gap:5px; font-size:.72rem; font-weight:700; color:rgba(255,255,255,.45); text-transform:uppercase; letter-spacing:.05em; }
      .pf-field input{ padding:11px 12px; font-size:.86rem; font-weight:500; color:#FFFFFF; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12); border-radius:8px; outline:0; text-transform:none; letter-spacing:normal; }
      .pf-field select{ padding:11px 12px; font-size:.86rem; font-weight:500; color:#FFFFFF; background:rgba(255,255,255,.07); border:1px solid rgba(255,255,255,.12); border-radius:8px; outline:0; text-transform:none; letter-spacing:normal; cursor:pointer; }
      .pf-field input:focus,.pf-field select:focus{ border-color:var(--orange,#F36600); }
      .pf-field input:disabled{ color:rgba(255,255,255,.25); cursor:not-allowed; }
      .pf-notice{ color:rgba(255,255,255,.45); font-size:.76rem; }

      .pf-link-row{ display:flex; align-items:center; justify-content:space-between; padding:4px 0; font-size:.85rem; font-weight:700; color:#FFFFFF; }
      .pf-link-row:hover{ color:var(--orange,#F36600); }

      @media(max-width:560px){
        .pf-hero{ padding:20px 16px; gap:12px; }
        .pf-avatar{ width:48px; height:48px; font-size:1.15rem; }
        .pf-body{ padding:16px 12px 40px; gap:14px; }
        .pf-form-row{ grid-template-columns:1fr; }
      }
    `}</style>
  );
}