// ─────────────────────────────────────────────────────────────────────────────
// AccountCenter — HotBet account dashboard.
//
// A real account hub: balance you can act on immediately, quick shortcuts,
// then grouped navigation to every account area. Pulls identity/balance from
// the single shared session (useSession) — never fetches its own copy of the
// user, so it can never disagree with the header about who's logged in.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  ArrowUpRight, BarChart3, Bell, ChevronRight, Clock3, CreditCard, Crown, Eye, EyeOff, Gift, Headphones, ListChecks, LogOut,
  Plus, Receipt, Settings as SettingsIcon, ShieldAlert, ShieldCheck, Sparkles, Star, Ticket, TrendingUp,
  UserRound, WalletCards,
} from "lucide-react";
import { useSession, pickUserField, getUserRole } from "@/lib/session";
import { currencyForCountry } from "@/lib/countries";
import { emojiForSeed } from "@/lib/avatars";

interface MenuRow { icon: ReactNode; label: string; href: string; hint?: string; badge?: { text: string; tone: "red" | "green" | "gold" } }

function numeric(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : null;
  return n !== null && Number.isFinite(n) ? n : null;
}

function MenuGroup({ title, rows }: { title: string; rows: MenuRow[] }) {
  return (
    <section className="acct-group">
      <h2 className="acct-group-title">{title}</h2>
      <div className="acct-group-card">
        {rows.map((row) => {
          const content = (
            <>
              <span className="acct-row-icon">{row.icon}</span>
              <span className="acct-row-text">
                <span className="acct-row-label">{row.label}</span>
                {row.hint && <span className="acct-row-hint">{row.hint}</span>}
              </span>
              {row.badge && <span className={`acct-chip acct-chip-${row.badge.tone}`}>{row.badge.text}</span>}
              <ChevronRight size={16} className="acct-row-chevron" />
            </>
          );
          return <Link key={row.href + row.label} href={row.href} className="acct-row">{content}</Link>;
        })}
      </div>
    </section>
  );
}

export default function AccountCenter() {
  const { user, balance, checked, logout, refresh } = useSession();
  const [showBalance, setShowBalance] = useState(true);

  // Re-validate on every visit to this page, the same way the reference
  // account page re-fetches its profile on mount — but through the single
  // shared session (refresh()) rather than a second, independent user fetch.
  useEffect(() => { refresh(); }, [refresh]);

  const ICON = 18;

  if (!checked) {
    return (
      <div className="acct-page acct-page-empty">
        <AcctStyles />
        <div className="acct-loading">Loading your account…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="acct-page acct-page-empty">
        <AcctStyles />
        <section className="acct-signedout">
          <span className="acct-signedout-icon"><UserRound size={26} /></span>
          <h1>Sign in to your account</h1>
          <p>Access your wallet, betslip, bet history, and account settings.</p>
          <Link href="/login" className="gold-button" style={{ marginTop: 16 }}>Log in <ChevronRight size={15} /></Link>
        </section>
      </div>
    );
  }

  const first = pickUserField(user, "firstName", "first_name", "givenName");
  const last = pickUserField(user, "lastName", "last_name", "familyName");
  const email = pickUserField(user, "email", "emailAddress", "username");
  const userId = pickUserField(user, "id", "userId", "accountId");
  const userCountry = pickUserField(user, "country", "countryCode", "country_code");
  const { code: curr } = currencyForCountry(userCountry);
  const fullName = [first, last].filter(Boolean).join(" ") || (email ? email.split("@")[0] : "");
  const avatarEmoji = emojiForSeed(userId || email || "guest");
  const verified = String(user.kycStatus ?? "").toLowerCase() === "verified" || user.emailVerified === true;
  const role = getUserRole(user);
  const isAdmin = role === "ADMIN" || role === "SUPER_ADMIN";
  const bonusBalance = numeric((user as Record<string, unknown>).bonusBalance);

  const money = (v: number | null) => (v === null ? "—" : showBalance ? `${curr} ${v.toFixed(2)}` : `${curr} ••••••`);

  const doLogout = () => { logout(); window.location.href = "/"; };

  const walletMenu: MenuRow[] = [
    { icon: <WalletCards size={ICON} />, label: "My Wallet", href: "/wallet", hint: "Balance, deposits and payouts" },
    { icon: <CreditCard size={ICON} />, label: "Transactions", href: "/transactions", hint: "Full payment history" },
    { icon: <Gift size={ICON} />, label: "Promotions", href: "/promos", hint: "Active offers & bonuses" },
  ];

  const bettingMenu: MenuRow[] = [
    { icon: <Ticket size={ICON} />, label: "Betslip", href: "/betslip", hint: "Review your current selections" },
    { icon: <Clock3 size={ICON} />, label: "Bet History", href: "/bets", hint: "Settled bets & results" },
    { icon: <ListChecks size={ICON} />, label: "Open Bets", href: "/open-bets", hint: "Bets awaiting a result" },
    { icon: <Star size={ICON} />, label: "Favorites", href: "/favorites", hint: "Saved teams & matches" },
  ];

  const accountMenu: MenuRow[] = [
    { icon: <UserRound size={ICON} />, label: "Profile", href: "/profile", hint: "Name, contact & verification" },
    {
      icon: <ShieldCheck size={ICON} />, label: "Verification", href: "/profile",
      badge: verified ? { text: "Verified", tone: "green" } : { text: "Action needed", tone: "red" },
    },
    { icon: <ShieldCheck size={ICON} />, label: "Security", href: "/security", hint: "Password & session" },
    { icon: <Bell size={ICON} />, label: "Notifications", href: "/notifications" },
    { icon: <SettingsIcon size={ICON} />, label: "Settings", href: "/settings" },
  ];

  const safetyMenu: MenuRow[] = [
    { icon: <ShieldAlert size={ICON} />, label: "Responsible Gaming", href: "/responsible-gaming", hint: "Limits & self-exclusion" },
    { icon: <Headphones size={ICON} />, label: "Help & Support", href: "/support", hint: "24/7 assistance" },
  ];

  const staffMenu: MenuRow[] = isAdmin
    ? role === "SUPER_ADMIN"
      ? [
          { icon: <Crown size={ICON} />, label: "Super Admin Panel", href: "/super-admin", hint: "Admin management and platform controls", badge: { text: "SUPER_ADMIN", tone: "gold" } },
        ]
      : [
          { icon: <ShieldCheck size={ICON} />, label: "Admin Panel", href: "/admin", hint: "Operations, users, deposits and bets", badge: { text: "ADMIN", tone: "gold" } },
        ]
    : [];

  return (
    <div className="acct-page">
      <AcctStyles />

      <section className="acct-hero">
        <div className="acct-hero-orb acct-hero-orb-one" />
        <div className="acct-hero-orb acct-hero-orb-two" />
        <div className="acct-hero-top">
          <div className="acct-avatar">
            <span className="acct-avatar-emoji">{avatarEmoji}</span>
            {verified && <span className="acct-avatar-tick"><ShieldCheck size={13} /></span>}
          </div>
          <div className="acct-id">
            <p className="acct-name">{fullName || "Account holder"}</p>
            <p className="acct-email">{email}</p>
          </div>
          {isAdmin && <span className="acct-admin-pill"><Crown size={13} /> {role}</span>}
        </div>

        <div className="acct-balance-block">
          <div className="acct-balance-kicker">
            <span><Sparkles size={13} /> Account overview</span>
            <span className="acct-member-label">{verified ? "Verified account" : "Complete your profile"}</span>
          </div>
          <div className="acct-balance-label">
            Available balance
            <button type="button" className="acct-eye" onClick={() => setShowBalance((v) => !v)} aria-label={showBalance ? "Hide balance" : "Show balance"}>
              {showBalance ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p className="acct-balance-value">{money(balance)}</p>
          {bonusBalance !== null && bonusBalance > 0 && (
            <span className="acct-bonus-pill"><TrendingUp size={12} /> Bonus {money(bonusBalance)}</span>
          )}
        </div>

        <div className="acct-hero-actions">
          <Link href="/deposit" className="acct-hero-btn acct-hero-btn-solid"><Plus size={17} /> Deposit <ArrowUpRight size={15} /></Link>
          <Link href="/wallet" className="acct-hero-btn acct-hero-btn-ghost"><WalletCards size={16} /> Withdraw <ArrowUpRight size={15} /></Link>
        </div>
      </section>

      <div className="acct-body">
        <div className="acct-section-intro">
          <div>
            <span className="acct-eyebrow">Your hub</span>
            <h1>Everything in one place</h1>
          </div>
          <Link href="/transactions" className="acct-overview-link"><BarChart3 size={15} /> Activity</Link>
        </div>
        {!verified && !isAdmin && (
          <div className="acct-alert">
            <ShieldAlert size={20} />
            <div>
              <p className="acct-alert-title">Verify your account</p>
              <p className="acct-alert-sub">Verification is required before your first withdrawal.</p>
            </div>
            <Link href="/profile" className="acct-alert-cta">Verify</Link>
          </div>
        )}

        <div className="acct-shortcuts" aria-label="Quick actions">
          <Link href="/deposit" className="acct-shortcut acct-shortcut-red">
            <span className="acct-shortcut-icon"><Plus size={20} /></span> Deposit
          </Link>
          <Link href="/wallet" className="acct-shortcut acct-shortcut-green">
            <span className="acct-shortcut-icon"><WalletCards size={19} /></span> Withdraw
          </Link>
          <Link href="/transactions" className="acct-shortcut">
            <span className="acct-shortcut-icon"><Receipt size={19} /></span> Transactions
          </Link>
          <Link href="/bets" className="acct-shortcut">
            <span className="acct-shortcut-icon"><Clock3 size={19} /></span> My Bets
          </Link>
        </div>

        <MenuGroup title="Wallet & rewards" rows={walletMenu} />
        <MenuGroup title="Betting" rows={bettingMenu} />
        <MenuGroup title="Account" rows={accountMenu} />
        {staffMenu.length > 0 && <MenuGroup title="Staff access" rows={staffMenu} />}
        <MenuGroup title="Safety & support" rows={safetyMenu} />

        <button onClick={doLogout} className="acct-logout" type="button">
          <LogOut size={18} /> Log out
        </button>

        <p className="acct-footnote">18+ · Play responsibly. Gambling can be addictive.</p>
      </div>
    </div>
  );
}

function AcctStyles() {
  return (
    <style>{`
      .acct-page{ background:var(--bb-900,#060A12); min-height:60vh; }
      .acct-page-empty{ display:flex; align-items:center; justify-content:center; min-height:70vh; }
      .acct-loading{ color:rgba(255,255,255,.45); font-size:13px; }

      .acct-signedout{
        display:flex; flex-direction:column; align-items:center; text-align:center;
        max-width:360px; padding:40px 26px; background:#fff; border:1px solid var(--line);
        box-shadow:var(--shadow); border-radius:14px;
      }
      .acct-signedout-icon{ display:grid; place-items:center; width:52px; height:52px; border-radius:50%; background:rgba(243,102,0,.08); color:var(--orange,#F36600); margin-bottom:14px; }
      .acct-signedout h1{ font:800 22px 'DM Sans',sans-serif; letter-spacing:-.01em; color:#20242d; }
      .acct-signedout p{ margin-top:8px; font-size:12.5px; color:#80867d; line-height:1.6; }

      /* ── Hero ── */
      .acct-hero{
        position:relative; overflow:hidden; padding:30px 22px 26px;
        background:radial-gradient(circle at 88% 18%,rgba(243,102,0,.28),transparent 34%),linear-gradient(135deg,#111c32 0%,#0b1426 58%,#09101e 100%);
        color:#fff; border-bottom:1px solid rgba(243,102,0,.22); box-shadow:0 14px 32px rgba(0,0,0,.22);
      }
      .acct-hero::after{ content:""; position:absolute; left:22px; right:22px; bottom:0; height:2px; background:linear-gradient(90deg,var(--orange,#F36600),rgba(243,102,0,0)); }
      .acct-hero-orb{ position:absolute; border-radius:50%; pointer-events:none; border:1px solid rgba(255,255,255,.08); }
      .acct-hero-orb-one{ width:210px; height:210px; right:-90px; top:-92px; box-shadow:0 0 0 26px rgba(255,255,255,.015),0 0 0 52px rgba(255,255,255,.012); }
      .acct-hero-orb-two{ width:110px; height:110px; right:62px; bottom:-72px; border-color:rgba(243,102,0,.16); }
      .acct-hero-top{ display:flex; align-items:center; gap:13px; }
      .acct-avatar{
        position:relative; flex-shrink:0; width:54px; height:54px; border-radius:50%;
        display:flex; align-items:center; justify-content:center; font-size:1.3rem; font-weight:800;
         background:linear-gradient(145deg,rgba(243,102,0,.9),rgba(200,21,48,.9)); border:2px solid rgba(255,255,255,.25);
        font-family:'DM Sans',sans-serif;
      }
      .acct-avatar-emoji{ font-size:1.6rem; line-height:1; }
       .acct-avatar-tick{ position:absolute; bottom:-2px; right:-2px; display:flex; border-radius:50%; background:var(--nature); color:#fff; border:2px solid #0b1426; padding:1px; }
      .acct-id{ min-width:0; flex:1; }
      .acct-name{ margin:0; font-size:1.15rem; font-weight:800; letter-spacing:-.015em; font-family:'DM Sans',sans-serif; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .acct-email{ margin:2px 0 0; font-size:.76rem; color:rgba(255,255,255,.75); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .acct-admin-pill{ flex-shrink:0; display:flex; align-items:center; gap:5px; padding:5px 10px; border-radius:999px; font-size:.68rem; font-weight:800; background:rgba(255,255,255,.18); border:1px solid rgba(255,255,255,.3); }

      .acct-balance-block{ position:relative; z-index:1; margin-top:24px; }
      .acct-balance-kicker{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:18px; color:rgba(255,255,255,.72); font-size:.68rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
      .acct-balance-kicker span:first-child{ display:flex; align-items:center; gap:6px; color:var(--orange-hi,#FF7A1A); }
      .acct-member-label{ color:rgba(255,255,255,.42); text-align:right; letter-spacing:.04em; }
      .acct-balance-label{
        display:flex; align-items:center; gap:8px; font-size:.68rem; font-weight:700;
        letter-spacing:.12em; text-transform:uppercase; color:rgba(255,255,255,.48);
      }
      .acct-eye{ display:flex; padding:2px; cursor:pointer; background:none; border:none; color:rgba(255,255,255,.7); }
      .acct-eye:hover{ color:#fff; }
      .acct-balance-value{
        margin:5px 0 0; font-family:'DM Sans',sans-serif;
         font-size:clamp(2.1rem,9vw,2.9rem); font-weight:800; letter-spacing:.01em; line-height:1;
        font-variant-numeric:tabular-nums;
      }
      .acct-bonus-pill{
        display:inline-flex; align-items:center; gap:5px; margin-top:11px; padding:5px 11px;
        border-radius:999px; font-size:.7rem; font-weight:700; color:#fff;
        background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.2);
      }

      .acct-hero-actions{ position:relative; z-index:1; display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:24px; max-width:430px; }
      .acct-hero-btn{
        display:flex; align-items:center; justify-content:center; gap:7px;
        min-height:46px; border-radius:10px; font-size:.85rem; font-weight:800; letter-spacing:.01em;
        transition:transform .16s ease, box-shadow .2s ease, background .16s ease;
      }
       .acct-hero-btn-solid{ background:var(--orange,#F36600); color:#fff; box-shadow:0 8px 20px rgba(243,102,0,.24); }
      .acct-hero-btn-solid:hover{ transform:translateY(-2px); }
       .acct-hero-btn-ghost{ background:rgba(255,255,255,.06); color:#fff; border:1px solid rgba(255,255,255,.16); }
      .acct-hero-btn-ghost:hover{ background:rgba(255,255,255,.22); }

      /* ── Body ── */
      .acct-body{ padding:24px 26px 50px; max-width:760px; margin:0 auto; background:var(--bb-900,#060A12); }
      .acct-section-intro{ display:flex; align-items:flex-end; justify-content:space-between; gap:16px; margin-bottom:18px; }
      .acct-eyebrow{ display:block; margin-bottom:5px; color:var(--orange-hi,#FF7A1A); font-size:.64rem; font-weight:800; letter-spacing:.13em; text-transform:uppercase; }
      .acct-section-intro h1{ margin:0; color:#fff; font-size:1.25rem; line-height:1.1; letter-spacing:-.03em; }
      .acct-overview-link{ display:flex; align-items:center; gap:6px; flex-shrink:0; color:rgba(255,255,255,.54); font-size:.72rem; font-weight:800; }
      .acct-overview-link:hover{ color:var(--orange-hi,#FF7A1A); }

      .acct-alert{
        display:flex; align-items:center; gap:12px; margin-bottom:20px; padding:14px 15px;
        background:rgba(243,102,0,.06); border:1px solid rgba(243,102,0,.22); color:var(--orange,#F36600);
        border-radius:12px;
      }
      .acct-alert-title{ margin:0; font-size:.84rem; font-weight:800; color:#FFFFFF; }
      .acct-alert-sub{ margin:3px 0 0; font-size:.74rem; color:rgba(255,255,255,.5); line-height:1.4; }
      .acct-alert-cta{ flex-shrink:0; padding:8px 14px; border-radius:8px; background:var(--orange,#F36600); color:#fff; font-size:.76rem; font-weight:800; }

      .acct-shortcuts{ display:grid; grid-template-columns:repeat(4,1fr); gap:9px; margin-bottom:28px; }
      .acct-shortcut{
        display:flex; flex-direction:column; align-items:center; gap:9px;
         padding:16px 6px; font-size:.7rem; font-weight:700; text-align:center; color:#fff;
         background:linear-gradient(145deg,#111d32,#0d1729); border:1px solid rgba(255,255,255,.09); box-shadow:0 6px 18px rgba(0,0,0,.22); border-radius:12px;
         transition:transform .16s ease, box-shadow .2s ease, border-color .2s ease;
      }
       .acct-shortcut:hover{ transform:translateY(-2px); border-color:rgba(243,102,0,.32); box-shadow:0 10px 24px rgba(0,0,0,.3); }
      .acct-shortcut-icon{ display:flex; align-items:center; justify-content:center; width:42px; height:42px; border-radius:50%; background:rgba(255,255,255,.08); color:rgba(255,255,255,.55); }
       .acct-shortcut-red .acct-shortcut-icon{ background:rgba(243,102,0,.16); color:var(--orange-hi,#FF7A1A); }
      .acct-shortcut-green .acct-shortcut-icon{ background:rgba(13,166,83,.12); color:var(--nature); }

      .acct-group{ margin-bottom:22px; }
      .acct-group-title{
        margin:0 0 9px; font-size:.68rem; font-weight:800; letter-spacing:.1em; text-transform:uppercase; color:rgba(255,255,255,.40);
      }
      .acct-group-card{ background:rgba(13,21,40,1); border:1px solid rgba(255,255,255,.08); box-shadow:0 4px 16px rgba(0,0,0,.35); overflow:hidden; border-radius:12px; }
      .acct-row{
        display:flex; align-items:center; gap:13px; padding:13px 15px;
        border-bottom:1px solid rgba(255,255,255,.06); transition:background-color .14s ease;
      }
      .acct-row:last-child{ border-bottom:none; }
      .acct-row:hover{ background:rgba(255,255,255,.04); }
      .acct-row-icon{
        display:flex; align-items:center; justify-content:center; flex-shrink:0;
        width:36px; height:36px; border-radius:10px; background:rgba(31,138,76,.1); color:var(--nature);
      }
      .acct-row:hover .acct-row-icon{ background:rgba(243,102,0,.08); color:var(--orange,#F36600); }
      .acct-row-text{ flex:1; min-width:0; }
      .acct-row-label{ display:block; font-size:.87rem; font-weight:700; color:#FFFFFF; }
      .acct-row-hint{ display:block; margin-top:2px; font-size:.71rem; color:rgba(255,255,255,.40); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .acct-row-chevron{ flex-shrink:0; color:rgba(255,255,255,.25); }
      .acct-chip{ flex-shrink:0; padding:3px 10px; border-radius:999px; font-size:.66rem; font-weight:800; }
      .acct-chip-red{ background:rgba(243,102,0,.1); color:var(--orange,#F36600); }
      .acct-chip-green{ background:rgba(13,166,83,.12); color:var(--nature); }
      .acct-chip-gold{ background:rgba(243,102,0,.16); color:#a8792c; }

      .acct-logout{
        display:flex; align-items:center; justify-content:center; gap:9px; width:100%;
        padding:14px; cursor:pointer; font-family:inherit; font-size:.88rem; font-weight:800;
        background:rgba(13,21,40,1); color:var(--orange,#F36600); border:1.5px solid rgba(243,102,0,.35); border-radius:12px;
        transition:background-color .14s ease, color .14s ease;
      }
      .acct-logout:hover{ background:var(--orange,#F36600); color:#fff; }

      .acct-footnote{ margin:18px 0 0; text-align:center; font-size:.7rem; color:rgba(255,255,255,.30); }

      @media(max-width:560px){
        .acct-hero{ padding:22px 16px 22px; }
        .acct-hero::after{ left:16px; right:16px; }
        .acct-body{ padding-left:12px; padding-right:12px; }
        .acct-shortcuts{ gap:7px; }
        .acct-shortcut{ padding:13px 4px; font-size:.64rem; }
        .acct-shortcut-icon{ width:36px; height:36px; }
        .acct-balance-value{ font-size:2rem; }
        .acct-balance-kicker{ align-items:flex-start; flex-direction:column; gap:5px; }
        .acct-member-label{ text-align:left; }
        .acct-section-intro{ align-items:flex-start; }
        .acct-section-intro h1{ font-size:1.08rem; }
        .acct-overview-link{ margin-top:3px; }
      }
    `}</style>
  );
}
