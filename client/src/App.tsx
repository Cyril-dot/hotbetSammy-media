// Super UI / Black Gold Fieldhouse: reference-faithful sportsbook terminal, sharp information density, purposeful motion, green live/action accents.
import { useEffect, useState, type CSSProperties } from "react";
import { Link, Route, Switch, useLocation, useSearch } from "wouter";
import api, { ApiError } from "./lib/api";
import { isBettableMatchId } from "./lib/sportsbook";
import Sportsbook, { type Pick } from "./components/Sportsbook";
import WalletCenter from "./components/WalletCenter";
import DepositCenter from "./components/DepositCenter";
import SupportCenter from "./components/SupportCenter";
import BetslipPage from "./components/BetslipPage";
import AccountCenter from "./components/AccountCenter";
import ProfileCenter from "./components/ProfileCenter";
import MobileBottomNav from "./components/MobileBottomNav";
import SportsPage from "./components/SportsPage";
import MatchDetailsPage from "./components/MatchDetailsPage";
import TransactionsPage from "./components/TransactionsPage";
import BetsCenter from "./components/BetsCenter";
import OpenBetsPage from "./components/OpenBetsPage";
import TicketDetailsPage from "./components/TicketDetailsPage";
import WinCelebrationModal from "./components/WinCelebrationModal";
import NotificationsPage from "./components/NotificationsPage";
import FavoritesPage from "./components/FavoritesPage";
import SettingsPage from "./components/SettingsPage";
import SecurityPage from "./components/SecurityPage";
import ResponsibleGamingPage from "./components/ResponsibleGamingPage";
import SearchPage from "./components/SearchPage";
import BookingCodePage from "./components/BookingCodePage";
import AdminBookingCodeNotice from "./components/AdminBookingCodeNotice";
import { SessionProvider, useSession, pickUserField, getUserRole } from "./lib/session";
import { flagForCountry, codeLabel, flagImageUrl, COUNTRY_OPTIONS, currencyForCountry } from "./lib/countries";
import NotFound from "./pages/NotFound";
import AdminPanelPage from "./pages/AdminPanelPage";
import SuperAdminPage from "./pages/SuperAdminPage";
import AdminEntryGuidePage from "./pages/AdminEntryGuidePage";
import { BarChart3, Bell, ChevronDown, ChevronRight, CircleDot, CircleHelp, Clock3, Copy, CreditCard, Crown, Flame, Gamepad2, Gift, Headphones, Info, Layers3, LayoutGrid, Menu, Minus, MoreHorizontal, Play, Plus, Radio, ScanBarcode, Search, ShieldCheck, Sparkles, Ticket, Trophy, UserRound, WalletCards, X, Zap } from "lucide-react";

const HERO_SLIDES = [
  {
    img: "https://res.cloudinary.com/ybmedia/image/upload/c_crop,e_improve,h_675,w_1200,x_0,y_0/c_fill,f_auto,h_900,q_auto,w_1600/v1/m/e/4/e465ad5b788152ae1ee10f1797f066d5d954a2a7/valencia-cf-v-fc-barcelona-laliga-ea-sports-2026-27.jpg",
    eyebrow: "Live now · 240+ markets",
    eyebrowGreen: true,
    p: "Real odds, live markets, instant payouts. Ghana's fastest sportsbook.",
    cta: { label: "Explore markets", href: "/" },
    ghost: { label: "Play casino", href: "/casino" },
  },
  {
    img: "https://media.istockphoto.com/id/1272839863/vector/jackpot-winner-coins-play-vegas-casino-game-banner-vector.jpg?s=612x612&w=0&k=20&c=uGtlyBmZBmbsxkg_5TbMAukni4zeNlYjmkMLoJ6TqHs=",
    eyebrow: "Daily Jackpot",
    eyebrowGreen: false,
    p: "Pick all 6 results correctly and take home the weekly jackpot pool.",
    cta: { label: "Play jackpot", href: "/promos" },
    ghost: { label: "View promos", href: "/promos" },
  },
  {
    img: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTjP841bX-OFCZWTWTyh6kNfspZlpC4c1p-sL6vqo16W5q-_XIVFujlgro&s=10",
    eyebrow: "Welcome bonus",
    eyebrowGreen: false,
    p: "Double your first deposit up to GHS 500 and start betting with more.",
    cta: { label: "Join now", href: "/register" },
    ghost: { label: "Learn more", href: "/promos" },
  },
];

// ---------------------------------------------------------------------------
// Referral code persistence — same pattern used on AfricaBet's register page.
//
// A referral code is only ever trustworthy when it comes from a real
// `?ref=CODE` link (or was captured from one on an earlier visit and is
// being restored now). Letting people freely type into the referral field
// is exactly how "users can enter anything" happens — so instead:
//
//   1. On landing, if the URL has `?ref=`, we persist it immediately and
//      lock the referral field so it can't be edited or cleared.
//   2. If there's no `?ref=` on this visit but one was stored from an
//      earlier visit (browsed the site, came back later to register), we
//      restore and lock it the same way.
//   3. Only when NEITHER of those apply is the field left open for manual
//      entry — and even then, whatever is typed still has to pass the
//      backend's referral-link lookup on submit (invalid/inactive codes
//      are rejected there, not silently accepted).
// ---------------------------------------------------------------------------
const REFERRAL_STORAGE_KEY = "hotbet_referral_code";
let inMemoryReferralFallback: string | null = null;

function isLocalStorageAvailable(): boolean {
  try {
    const testKey = "__hotbet_ls_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function getStoredReferralCode(): string {
  try {
    if (isLocalStorageAvailable()) return window.localStorage.getItem(REFERRAL_STORAGE_KEY) ?? "";
  } catch {
    // fall through to in-memory
  }
  return inMemoryReferralFallback ?? "";
}

function setStoredReferralCode(code: string): void {
  const trimmed = code.trim();
  if (!trimmed) return;
  try {
    if (isLocalStorageAvailable()) {
      window.localStorage.setItem(REFERRAL_STORAGE_KEY, trimmed);
      return;
    }
  } catch {
    // fall through to in-memory
  }
  inMemoryReferralFallback = trimmed;
}

function clearStoredReferralCode(): void {
  try {
    if (isLocalStorageAvailable()) window.localStorage.removeItem(REFERRAL_STORAGE_KEY);
  } catch {
    // ignore
  }
  inMemoryReferralFallback = null;
}

// The match list already knows exactly which sport a match belongs to (and
// whether it's an admin-created special) since it came straight off that
// sport's own fetch. Passing that through as a query param means the detail
// page can go directly to the right backend endpoint instead of guessing by
// trying every sport's endpoint in turn — which previously could land a
// perfectly ordinary football match on the admin endpoint and mislabel it as
// a "HotBet Special" if football's own /matches/:id lookup 404'd for it (e.g.
// a match only indexed in bulk/list endpoints, not individually).
function MatchDetailsRoute({ id, picks, onPick }: { id: string; picks: Pick[]; onPick: (p: Pick) => void }) {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const sportHint = params.get("sport") ?? undefined;
  const adminHint = params.get("admin") === "1";
  return <MatchDetailsPage id={id} picks={picks} onPick={onPick} sportHint={sportHint} adminHint={adminHint} />;
}

const casinoFeature = "https://images.unsplash.com/photo-1596838132731-3301c3fd4317?q=80&w=1200&auto=format&fit=crop";
const mark = "/hotbet-mark.svg";

const nav = [["Sports", "/"], ["Live", "/live"], ["Casino", "/casino"], ["Promos", "/promos"], ["Affiliate", "/affiliate"]];

function Header({ onMenu }: { onMenu: () => void }) {
  const [location] = useLocation();
  const { balance, token, user } = useSession();
  const userCountry = pickUserField(user, "country", "countryCode", "country_code");
  const flagCode = codeLabel(userCountry);
  const { code: headerCurr } = currencyForCountry(userCountry);
  const [flagImgFailed, setFlagImgFailed] = useState(false);
  useEffect(() => {
    const closeMenuOnScroll = () => document.body.classList.remove("menu-open");
    window.addEventListener("scroll", closeMenuOnScroll, { passive: true });
    return () => window.removeEventListener("scroll", closeMenuOnScroll);
  }, []);
  return <>
    <div className="utility"><div className="wrap utility-inner"><Link href="/" aria-label="HotBet home" className="utility-brand">{flagImgFailed ? <span className="flag-emoji" aria-hidden>{flagForCountry(userCountry)}</span> : <img className="flag-img" src={flagImageUrl(userCountry)} alt={flagCode} onError={() => setFlagImgFailed(true)} />} HotBet</Link><span className="utility-links"><Link href="/bets">My bets</Link><Link href="/account">My account</Link></span></div></div>
    <header className="header"><div className="wrap header-inner"><button className="mobile-menu" aria-label="Open navigation menu" aria-controls="primary-navigation" onClick={onMenu}><Menu size={20}/></button><Link href="/" className="brand" aria-label="HotBet home"><img src={mark} alt="HotBet" /></Link><nav id="primary-navigation" className="main-nav">{nav.map(([label, href]) => <Link key={href} href={href} className={location === href ? "active" : ""} onClick={() => document.body.classList.remove("menu-open")}>{label}{label === "Live" && <i className="live-dot"/>}</Link>)}</nav><div className="header-actions"><button className="icon-button" aria-label="Search" onClick={()=>window.location.href="/search"}><Search size={17}/></button>{token ? <><Link href="/wallet" className="header-balance">{balance !== null ? `${headerCurr} ${balance.toFixed(2)}` : `${headerCurr} 0.00`}</Link><Link href="/account" className="login-link">My account</Link></> : <><Link href="/login" className="login-link">Log in</Link><Link href="/register" className="gold-button">Join now</Link></>}</div></div></header>
  </>;
}
function Footer(){ return <footer><div className="wrap footer-grid"><div className="footer-brand"><Link href="/" className="brand"><img src={mark}/><span>Hot<span>Bet</span></span></Link><p className="muted" style={{marginTop:10,lineHeight:1.7}}>Ghana's sharpest sportsbook. Real odds. Fast payouts. Play responsibly.</p><div className="partner-badge"><Trophy size={20}/><span>Official<br/>Partner</span></div></div><div><h4>Sports betting</h4><Link href="/">Football</Link><Link href="/live">Live betting</Link><Link href="/sports">All sports</Link><Link href="/booking-code">Booking codes</Link></div><div><h4>Account</h4><Link href="/promos">Promotions</Link><Link href="/wallet">My wallet</Link><Link href="/bets">Bet history</Link><Link href="/affiliate">Affiliate</Link></div><div><h4>Help &amp; support</h4><Link href="/help"><Headphones size={13}/> Customer support</Link><Link href="/responsible-gaming"><ShieldCheck size={13}/> Responsible gaming</Link><Link href="/login"><Bell size={13}/> Get alerts</Link><Link href="/affiliate"><Copy size={13}/> Referral link</Link></div></div><div className="footer-bottom wrap"><span>18+ · Play responsibly. Gambling can be addictive. </span><span>© 2026 HotBet Ghana Ltd. All rights reserved.</span></div></footer> }

type AuthForm = { identifier: string; password: string; confirm: string; firstName: string; lastName: string; phone: string; referral: string; country: string };

function AuthField({ label, value, onChange, type = "text", placeholder = "" }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return <label className="auth-field"><span>{label}</span><input value={value} onChange={(e) => onChange(e.target.value)} type={type} placeholder={placeholder} /></label>;
}

function AuthPasswordField({ confirm = false, value, onChange, visible, onToggleVisible, password, passwordStrong }: { confirm?: boolean; value: string; onChange: (v: string) => void; visible: boolean; onToggleVisible: () => void; password?: string; passwordStrong?: boolean }) {
  return <label className="auth-field"><span>{confirm ? "Confirm password" : "Password"}</span><div className="auth-input-wrap"><input value={value} onChange={(e) => onChange(e.target.value)} type={visible ? "text" : "password"} placeholder={confirm ? "Repeat your password" : "At least 8 characters"} /><button type="button" onClick={onToggleVisible}>{visible ? "Hide" : "Show"}</button></div>{!confirm && password && <small className={passwordStrong ? "valid-text" : "error-text"}>{passwordStrong ? "Strong password" : "Use 8+ characters with a letter and number"}</small>}</label>;
}

// Referral code field — mirrors AfricaBet's register page: read-only and
// visibly "locked" whenever the code was captured from a `?ref=` link (this
// visit or a previous one), editable only when nothing was ever captured.
// This is what stops the "users can enter anything" problem at the source —
// most of the time there's simply no free-text box to type garbage into.
function AuthReferralField({ value, locked, autoApplied, onChange }: { value: string; locked: boolean; autoApplied: boolean; onChange: (v: string) => void }) {
  return (
    <label className="auth-field">
      <span>Referral code{locked ? "" : " (optional)"}</span>
      <div className="auth-input-wrap" style={{ position: "relative" }}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type="text"
          placeholder="e.g. REF-8K3PQZ"
          readOnly={locked}
          style={locked ? { paddingRight: 34, cursor: "not-allowed", opacity: 0.85 } : undefined}
        />
        {locked && (
          <ShieldCheck
            size={14}
            style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.55, pointerEvents: "none" }}
          />
        )}
      </div>
      {value && locked && (
        <small className="valid-text">
          {autoApplied
            ? "Referral code restored from your earlier visit and locked in — it can't be changed or removed."
            : "Referral code applied from your link and locked in — it can't be changed or removed."}
        </small>
      )}
    </label>
  );
}

function AccountAuth({ mode }: { mode: "login" | "register" }) {
  const isLogin = mode === "login";
  const { refresh } = useSession();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [step, setStep] = useState<1 | 2>(1);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [remember, setRemember] = useState(true);
  const [terms, setTerms] = useState(false);
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // ── Referral resolution order:
  // 1. `?ref=` in the current URL (freshest signal — user just clicked a link)
  // 2. Whatever was previously stored (came from another page, or is
  //    returning after browsing the site / abandoning registration earlier)
  const urlRef = new URLSearchParams(search).get("ref")?.trim() ?? "";
  const [referralLocked, setReferralLocked] = useState<boolean>(() => !!urlRef || !!getStoredReferralCode());
  const [referralAutoApplied] = useState<boolean>(() => !urlRef && !!getStoredReferralCode());

  const [form, setForm] = useState<AuthForm>(() => ({
    identifier: "", password: "", confirm: "", firstName: "", lastName: "", phone: "",
    referral: urlRef || getStoredReferralCode(),
    country: "GH",
  }));

  // Persist a fresh `?ref=` immediately on landing, even before the user
  // reaches the referral field, and lock the field for this session.
  useEffect(() => {
    if (urlRef) {
      setStoredReferralCode(urlRef);
      setForm((f) => ({ ...f, referral: urlRef }));
      setReferralLocked(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlRef]);

  const update = (key: keyof AuthForm, value: string) => {
    // The referral code is locked once auto-applied from a link or a prior
    // visit — block edits/clears so it can't be overwritten with free text.
    if (key === "referral" && referralLocked) return;

    setForm((current) => ({ ...current, [key]: key === "identifier" ? value.toLowerCase() : value }));

    if (key === "referral") {
      const trimmed = value.trim();
      if (trimmed) setStoredReferralCode(trimmed);
      else clearStoredReferralCode();
    }
  };

  const passwordStrong = form.password.length >= 8 && /[A-Za-z]/.test(form.password) && /[0-9]/.test(form.password);
  const email = form.identifier.trim().toLowerCase();
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);
  const phoneDigits = form.phone.replace(/\D/g, "");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setNotice("");
    if (isLogin) {
      if (!validEmail || !form.password) return setNotice("Enter a valid email address and your password.");
      if (form.password.length < 8) return setNotice("Your password must be at least 8 characters.");
      setSubmitting(true);
      try {
        const result = await api.auth.login({ email, password: form.password });
        window.localStorage.setItem("accessToken", result.data.accessToken);
        const role = String(result.data.user?.role ?? "").trim().toUpperCase();
        if (role === "ADMIN" || role === "SUPER_ADMIN") window.localStorage.setItem("fb_token", result.data.accessToken);
        else window.localStorage.removeItem("fb_token");
        refresh();
        setLocation("/");
      } catch (error) {
        setNotice(error instanceof ApiError ? error.message : "We could not sign you in — check your connection and try again.");
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (step === 1) {
      if (!validEmail) return setNotice("Enter a valid email address.");
      if (!passwordStrong) return setNotice("Use at least 8 characters with a letter and a number.");
      if (form.password !== form.confirm) return setNotice("Your passwords do not match.");
      setStep(2);
      return;
    }
    if (!form.firstName.trim() || !form.lastName.trim()) return setNotice("Enter your first and last name.");
    if (phoneDigits.length < 9) return setNotice("Enter a valid phone number.");
    if (!terms) return setNotice("Accept the terms and responsible gaming policy to continue.");
    setSubmitting(true);
    try {
      const result = await api.auth.register({
        email,
        password: form.password,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone,
        country: form.country || "GH",
        ref: form.referral.trim() || undefined,
      });
      window.localStorage.setItem("accessToken", result.data.accessToken);
      refresh();

      // Registration succeeded and the referral code (if any) has been
      // submitted to the server — safe to clear the persisted copy now so
      // it doesn't linger and get mistakenly reused for a future signup on
      // this device.
      clearStoredReferralCode();

      setLocation("/");
    } catch (error) {
      setNotice(error instanceof ApiError ? error.message : "We could not create your account. Please try again.");
      // On failure we deliberately do NOT clear the stored referral code —
      // the user may retry, or leave and come back, and shouldn't lose
      // their referral attribution because of a submission error.
    } finally {
      setSubmitting(false);
    }
  };
  return <><Header onMenu={() => document.body.classList.toggle("menu-open")} /><main className="auth-page"><div className="auth-intro"><span className="eyebrow">{isLogin ? "Welcome back" : "Account setup"}</span><h1>{isLogin ? <>Bet smarter.<br/><em>Stay ahead.</em></> : <>Your next win<br/><em>starts here.</em></>}</h1><p>{isLogin ? "Access your balance, betslip, live markets, and HotBet rewards." : "Create your HotBet account in under two minutes and make every market count."}</p><div className="auth-benefits"><span><ShieldCheck size={16}/> Secure account</span><span><Zap size={16}/> Fast markets</span><span><Gift size={16}/> Exclusive offers</span></div></div><section className="panel auth-card auth-card-premium"><div className="auth-card-head"><div className="auth-crown"><Crown size={20}/></div><div><span className="eyebrow">HotBet Ghana</span><h2>{isLogin ? "Log in" : step === 1 ? "Create your account" : "Complete your profile"}</h2></div></div>{!isLogin && <div className="auth-steps"><span className={step === 1 ? "active" : "done"}>1 <small>Account</small></span><i className={step === 2 ? "active" : ""}/><span className={step === 2 ? "active" : ""}>2 <small>Profile</small></span></div>}<form onSubmit={submit}>{isLogin && <><AuthField label="Phone or email" value={form.identifier} onChange={(v) => update("identifier", v)} placeholder="name@example.com" /><AuthPasswordField value={form.password} onChange={(v) => update("password", v)} visible={showPassword} onToggleVisible={() => setShowPassword(!showPassword)} password={form.password} passwordStrong={passwordStrong} /><div className="auth-row"><label className="check-row"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember me</label><Link href="/help">Forgot password?</Link></div></>}{!isLogin && step === 1 && <><AuthField label="Email address" value={form.identifier} onChange={(v) => update("identifier", v)} type="email" placeholder="name@example.com" /><AuthPasswordField value={form.password} onChange={(v) => update("password", v)} visible={showPassword} onToggleVisible={() => setShowPassword(!showPassword)} password={form.password} passwordStrong={passwordStrong} /><AuthPasswordField confirm value={form.confirm} onChange={(v) => update("confirm", v)} visible={showConfirm} onToggleVisible={() => setShowConfirm(!showConfirm)} /></>}{!isLogin && step === 2 && <><div className="auth-two-col"><AuthField label="First name" value={form.firstName} onChange={(v) => update("firstName", v)} placeholder="Kwame" /><AuthField label="Last name" value={form.lastName} onChange={(v) => update("lastName", v)} placeholder="Mensah" /></div><AuthField label="Phone number" value={form.phone} onChange={(v) => update("phone", v)} type="tel" placeholder="+233 24 000 0000" /><label className="auth-field"><span>Country</span><select value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))}>{COUNTRY_OPTIONS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label><AuthReferralField value={form.referral} locked={referralLocked} autoApplied={referralAutoApplied} onChange={(v) => update("referral", v)} /><label className="check-row terms-row"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} /> I agree to the <Link href="/">terms and responsible gaming policy</Link></label></>}<button className="gold-button full auth-submit" type="submit" disabled={submitting}>{submitting ? "Connecting…" : isLogin ? "Log in to HotBet" : step === 1 ? "Continue" : "Create account"}<ChevronRight size={16}/></button>{notice && <div className="auth-notice" role="alert">{notice}</div>}</form>{!isLogin && step === 2 && <button className="auth-back" type="button" onClick={() => setStep(1)}>Back to account details</button>}<p className="auth-switch">{isLogin ? "New to HotBet?" : "Already have an account?"} <Link href={isLogin ? "/register" : "/login"}>{isLogin ? "Create an account" : "Log in"}</Link></p><div className="auth-safe"><ShieldCheck size={15}/> Your information is protected with secure account controls.</div></section></main><Footer /></>;
}

function Router(){ return <footer><div className="wrap footer-grid"><div><Link href="/" className="brand footer-brand"><img src={mark}/><span>Hot<span>Bet</span></span></Link><p className="muted">The smarter way to follow the moment.</p><div className="partner-badge"><Trophy size={24}/><span>Official<br/>Sports Partner</span></div></div><div><h4>Bet with confidence</h4><Link href="/">About HotBet</Link><Link href="/promos">Promotions</Link><Link href="/wallet">Responsible gaming</Link><Link href="/">Privacy policy</Link></div><div><h4>How to play</h4><Link href="/">FAQ</Link><Link href="/">Bet builder</Link><Link href="/live">Live betting</Link><Link href="/casino">Games</Link></div><div><h4>Connect with us</h4><Link href="/"> <Headphones size={14}/> Customer support</Link><Link href="/affiliate"><Copy size={14}/> Copy referral link</Link><Link href="/login"><Bell size={14}/> Get notifications</Link></div></div><div className="footer-bottom wrap"><span>18+ &nbsp; Play responsibly. Gambling can be addictive.</span><span>© 2026 HotBet. All rights reserved.</span></div></footer> }
function SideNav(){ const leagues:[[string,string],...Array<[string,string]>]=[["Premier League","/"],["UEFA Champions League","/live"],["La Liga","/"],["Serie A","/"],["Bundesliga","/"],["Ligue 1","/"],["Ghana Premier League","/"]]; return <aside className="side-nav panel"><div className="side-title"><Flame size={15}/> Top leagues</div>{leagues.map(([name,href])=><Link href={href} key={name}>{name}<ChevronRight size={14}/></Link>)}<div className="side-title spaced"><Gift size={15}/> Quick links</div>{[["Jackpot","/promos"],["Live TV","/live"],["Sports calendar","/"],["Bet builder","/live"]].map(([x,href])=><Link href={href} key={x}>{x}<ChevronRight size={14}/></Link>)}</aside> }

// ---------------------------------------------------------------------------
// Home quick-nav shell — promo carousel, icon quick-links, quick filter
// pills, feature tabs, and a league icon strip sitting above the match list,
// mirroring the layout pattern of the reference screenshot (promo cards →
// icon nav → filter pills → tabs → league strip → matches) but built from
// HotBet's own existing features rather than a competitor's branding.
// ---------------------------------------------------------------------------

// A generated coin/jackpot motif, embedded directly as an SVG data URI —
// works immediately with no external file needed, standing in for a real
// photo until one is supplied. Every other card still uses the plain
// gradient placeholder; this one specifically now has a real background
// graphic per request.
const JACKPOT_BG_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="220" height="156" viewBox="0 0 220 156">
  <defs>
    <radialGradient id="g" cx="30%" cy="20%" r="90%">
      <stop offset="0%" stop-color="#3a2a06"/>
      <stop offset="100%" stop-color="#16170f"/>
    </radialGradient>
    <linearGradient id="coin" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFD580"/>
      <stop offset="100%" stop-color="#d8a84e"/>
    </linearGradient>
  </defs>
  <rect width="220" height="156" fill="url(#g)"/>
  <circle cx="180" cy="30" r="34" fill="url(#coin)" opacity="0.9"/>
  <circle cx="180" cy="30" r="34" fill="none" stroke="#8a6415" stroke-width="2"/>
  <text x="180" y="38" font-family="Georgia,serif" font-size="26" font-weight="700" fill="#8a6415" text-anchor="middle">$</text>
  <circle cx="150" cy="70" r="24" fill="url(#coin)" opacity="0.85"/>
  <circle cx="150" cy="70" r="24" fill="none" stroke="#8a6415" stroke-width="1.5"/>
  <circle cx="196" cy="88" r="18" fill="url(#coin)" opacity="0.75"/>
  <circle cx="196" cy="88" r="18" fill="none" stroke="#8a6415" stroke-width="1.5"/>
  <circle cx="30" cy="120" r="60" fill="none" stroke="#d8a84e" stroke-width="1" opacity="0.25"/>
  <circle cx="30" cy="120" r="80" fill="none" stroke="#d8a84e" stroke-width="1" opacity="0.15"/>
</svg>
`)}`;

const PROMO_CARDS: { label: string; tag?: string; icon: typeof Flame; href: string; accent: string; image?: string }[] = [
  // `image` is left unset for the rest of these for now — waiting on the
  // actual banner photos to be supplied. Once provided, set e.g.
  // image: "/promos/2h-football.jpg" and PromoCarousel below will render it
  // as the card's background photo instead of the gradient placeholder,
  // exactly like the Jackpot card below already does with its generated
  // background.
  { label: "2H Football", tag: "LIVE", icon: Radio, href: "/live", accent: "var(--nature)" , image: "https://imgs.search.brave.com/DRgPFtUTx092DB-ffcvqreE4mCo8u1AQOvGODBP-9No/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9tZWRp/YS5pc3RvY2twaG90/by5jb20vaWQvMjIy/MDg0OTYyMy92ZWN0/b3Ivc3BvcnRzLWdy/b3VwLW9mLXNwb3J0/cy1hdGhsZXRlcy1z/ZXQtb2YtYWN0aXZl/LXBlb3BsZS1wbGF5/ZXJzLWlzb2xhdGVk/LXZlY3Rvci1zaWxo/b3VldHRlcy5qcGc_/cz02MTJ4NjEyJnc9/MCZrPTIwJmM9STJl/UFU5ZWNiZXRXd0tj/UVAyQld6RVFuc3o0/SmVTN2RpaHN5OXVr/ZjJuUT0"},
  { label: "Jackpot", tag: "HOT", icon: Trophy, href: "/promos", accent: "var(--orange,#F36600)", image: "https://imgs.search.brave.com/qjDCvl93wqiTrVQRHiE7YR6ZMLJXwXqoCRkQVtSoBRc/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9tZWRp/YS5pc3RvY2twaG90/by5jb20vaWQvMTI3/MjgzOTg2My92ZWN0/b3IvamFja3BvdC13/aW5uZXItY29pbnMt/cGxheS12ZWdhcy1j/YXNpbm8tZ2FtZS1i/YW5uZXItdmVjdG9y/LmpwZz9zPTYxMng2/MTImdz0wJms9MjAm/Yz11R3RseUJtWkJt/YnN4a2dfNVRiTUF1/a25pNHplTmxZam1r/TUxvSjZUcUhzPQ" },
  { label: "Aviator", tag: "HOT", icon: Play, href: "/casino", accent: "var(--orange,#F36600)", image: "https://imgs.search.brave.com/uw56ovWiO0ZF8LataEaQx-0W7GMr8Amct7TP-BQrBIc/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9hdmlh/dG9yLXNwb3J0eWJl/dC5jb20vd3AtY29u/dGVudC91cGxvYWRz/LzIwMjQvMTIvYXZp/YXRvci1wbGFuZS53/ZWJw" },
  { label: "Gifts", icon: Gift, href: "/promos", accent: "var(--nature)" , image : "https://imgs.search.brave.com/O7qNPrzqbpPLfxXjN8DmKiOQDezJ2pAi-g6ia4lx-vo/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9tZWRp/YS50aGVldmVyeW1v/bS5jb20vd3AtY29u/dGVudC91cGxvYWRz/LzIwMjQvMTAvMDcw/OTExNTcvdGhlLWV2/ZXJ5bW9tLWZlYXR1/cmUtYmVzdC1zcG9y/dHMtZ2lmdHMuanBn"},
  { label: "Promotions", icon: Sparkles, href: "/promos", accent: "var(--orange,#F36600)" , image : "https://imgs.search.brave.com/Gw7usgFPh3xn1HokVRP7Ct2KnNgy2X9awhUKmXo9DAY/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9iYWd3/ZWxscHJvbW90aW9u/cy5jb20vd3AtY29u/dGVudC91cGxvYWRz/LzIwMTQvMDMvc3Bv/cnRzLmpwZw"},
  { label: "iBot AI", tag: "NEW", icon: Zap, href: "/promos", accent: "var(--nature)", image : "https://imgs.search.brave.com/pr5ceCZvgQeizjDG5rM0z46YogA2m49oNoKvLrhdlSA/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9maXZl/cnItcmVzLmNsb3Vk/aW5hcnkuY29tL3Rf/Z2lnX2NhcmRzX3dl/YixxX2F1dG8sZl9h/dXRvL2dpZ3MvNDgw/NzkxODg1L29yaWdp/bmFsLzQxMDhmOWUx/ZGQ4NGUwN2FiNDA2/YWY0MzRhODI4M2Y2/N2E0ZGU0NDgucG5n" },
  { label: "sFootball", icon: Gamepad2, href: "/casino", accent: "var(--orange,#F36600)", image : "https://imgs.search.brave.com/zkK1oCBSlA5bGvFCXN32Ot2TxeFw47168JObfSeFUUU/rs:fit:860:0:0:0/g:ce/aHR0cHM6Ly9wbGF5/LWxoLmdvb2dsZXVz/ZXJjb250ZW50LmNv/bS9vLWlzY0YwdTl1/QW05amFlbXMyNW5O/VXczY0lneHJ6SUVM/VlR5LURQS2IzQ3hO/MF9ITEJjYVdvZWV0/WmNhX0JCT3BfdV9O/WGV5UUt6MG5Ka1hp/Rk1rQT13MjQwLWg0/ODAtcnc" },
  { label: "Virtual", icon: Layers3, href: "/casino", accent: "var(--nature)", image : "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSl8Yw3V1VMyxXFsR3qBU580V6w85t22IdvCXSObdpB5g&s" },
];

function PromoCarousel() {
  return (
    <div className="promo-carousel">
      {PROMO_CARDS.map((p) => {
        const Icon = p.icon;
        const style: CSSProperties & Record<string, string> = { ["--accent"]: p.accent };
        if (p.image) { style.backgroundImage = `url("${p.image}")`; style.backgroundSize = "cover"; style.backgroundPosition = "center"; }
        return (
          <Link key={p.label} href={p.href} className="promo-card-chip" style={style}>
            {p.tag && <span className="promo-tag">{p.tag}</span>}
            {!p.image && <span className="promo-icon-wrap"><Icon size={12} /></span>}
            <span className="promo-label">{p.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

const ICON_NAV_ITEMS: { label: string; icon: typeof Flame; href: string }[] = [
  { label: "Sports", icon: LayoutGrid, href: "/sports" },
  { label: "Live", icon: Radio, href: "/live" },
  { label: "Booking", icon: ScanBarcode, href: "/booking-code" },
  { label: "Casino", icon: Gamepad2, href: "/casino" },
  { label: "Promos", icon: Gift, href: "/promos" },
  { label: "More", icon: MoreHorizontal, href: "/account" },
];

function HomeIconTabs() {
  return <nav className="home-icon-tabs" aria-label="HotBet quick navigation">
    {ICON_NAV_ITEMS.map((item) => { const Icon = item.icon; return <Link key={item.label} href={item.href} className="home-icon-tab"><span><Icon size={18} /></span><b>{item.label}</b></Link>; })}
  </nav>;
}

function TrustPanel(){ return <section className="panel simple-card" style={{padding:'20px 18px'}}><div className="side-title" style={{padding:'0 0 12px', border:'none'}}><ShieldCheck size={15}/> Why HotBet</div><p className="muted" style={{fontSize:11, lineHeight:1.7}}>Real odds sourced live from our sports data feed. Matches without live pricing yet are clearly marked as estimated and can't be staked on until real odds publish — we don't fake live markets.</p></section> }
function Hero() {
  const [active, setActive] = useState(0);
  useEffect(() => { const timer = window.setInterval(() => setActive((n) => (n + 1) % HERO_SLIDES.length), 6500); return () => window.clearInterval(timer); }, []);
  const slide = HERO_SLIDES[active];
  const title = active === 1 ? <>Chase the<br /><em>upside.</em></> : active === 2 ? <>Start with<br /><em>more.</em></> : <>Feel the<br /><em>moment.</em></>;
  return (
    <section className="hero hero-pulse hero-carousel" aria-label="HotBet sportsbook highlights">
      {HERO_SLIDES.map((item, index) => <img key={item.img} src={item.img} className={`hero-slide-img${index === active ? " active" : ""}`} aria-hidden />)}
      <div className="hero-sheen" />
      <div className="hero-grid-texture" aria-hidden="true" />
      <div className="hero-copy">
        <span className="eyebrow hero-eyebrow"><i className={`hero-status-dot${slide.eyebrowGreen ? "" : " hero-status-dot-orange"}`} />{slide.eyebrow}</span>
        <h1>{title}</h1>
        <p>{slide.p}</p>
        <div className="hero-buttons">
          <Link href={slide.cta.href} className="gold-button">{slide.cta.label} <ChevronRight size={15} /></Link>
          <Link href={slide.ghost.href} className="ghost-button">{slide.ghost.label} <ChevronRight size={15} /></Link>
        </div>
      </div>
      <div className="hero-slide-dots" role="tablist" aria-label="Hero slides">{HERO_SLIDES.map((item, index) => <button key={item.img} className={index === active ? "active" : ""} onClick={() => setActive(index)} aria-label={`Show slide ${index + 1}`} aria-selected={index === active} type="button" />)}</div>
    </section>
  );
}
function BetSlip({ picks, setPicks, onPlace, currency, adminBookingCode, adminBookingCodeError }: { picks: Pick[]; setPicks: (p: Pick[])=>void; onPlace: (stake: number)=>Promise<void>; currency: string; adminBookingCode?: string | null; adminBookingCodeError?: string }){ const [stake,setStake]=useState(10); const [placing,setPlacing]=useState(false); const [notice,setNotice]=useState(""); const total=picks.reduce((a,b)=>a*b.odd,1); const place=async()=>{ setNotice(""); setPlacing(true); try { await onPlace(stake); setPicks([]); setNotice("Bet placed successfully."); } catch (error) { setNotice(error instanceof ApiError ? error.message : "We could not place this bet. Please try again."); } finally { setPlacing(false); } }; return <aside className="betslip panel"><div className="betslip-tabs"><span className="active">Betslip <b>{picks.length}</b></span><span>Cashout</span></div>{picks.length===0?<div className="empty-slip"><WalletCards size={34}/><h3>Your betslip is empty</h3><p>{notice || "Click on the odds to add selections and build your bet."}</p><Link href="/" className="ghost-button">Browse matches</Link></div>:<><div className="slip-header"><span>Singles</span><button onClick={()=>setPicks([])}>Clear all</button></div>{picks.map(p=><div className="slip-pick" key={`${p.id}-${p.selection}`}><div><b>{p.match}</b><small>{p.market} · {p.selection}</small></div><strong>{p.odd.toFixed(2)}</strong><button onClick={()=>setPicks(picks.filter(x=>x!==p))}><X size={14}/></button></div>)}<div className="slip-summary"><div><span>Potential return</span><b>{currency} {(stake*total).toFixed(2)}</b></div><label>Stake<input value={stake} onChange={e=>setStake(Number(e.target.value)||0)} type="number" min="1"/></label><button className="gold-button full" onClick={place} disabled={placing}>{placing ? "Placing…" : "Place bet"} <Zap size={15}/></button>{notice&&<small className="auth-notice" role="alert">{notice}</small>}</div></>}</aside> }
function BetslipFAB({ count }: { count: number }) {
  const hasPicks = count > 0;
  return (
    <Link href={hasPicks ? "/betslip" : "/booking-code"} aria-label={hasPicks ? `Open betslip, ${count} selection${count === 1 ? "" : "s"}` : "Open booking code"} style={{ position: "fixed", bottom: "calc(64px + 16px)", right: 18, zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center", width: 54, height: 54, borderRadius: "50%", background: "linear-gradient(135deg, var(--orange-hi, #FF7A1A), var(--orange-dim, #C45200))", boxShadow: "0 8px 22px rgba(243,102,0,0.42)", color: "#fff", textDecoration: "none", transition: "transform 0.18s ease", animation: "fab-pop .22s ease" }} onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1.08)"; }} onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; }}>
      {hasPicks && <span style={{ position: "absolute", top: -4, right: -4, minWidth: 20, height: 20, padding: "0 4px", display: "flex", alignItems: "center", justifyContent: "center", background: "#141414", color: "#fff", fontSize: 10, fontWeight: 900, border: "2px solid #fff", borderRadius: 999 }}>{count > 99 ? "99+" : count}</span>}
      <Ticket size={22} strokeWidth={2.2} />
    </Link>
  );
}

function Home({ onPick, picks, setPicks, onPlace, adminBookingCode, adminBookingCodeError }: {onPick:(p:Pick)=>void;picks:Pick[];setPicks:(p:Pick[])=>void;onPlace:(stake:number)=>Promise<void>;adminBookingCode?:string|null;adminBookingCodeError?:string}){
  const { user: homeUser } = useSession();
  const homeCurr = currencyForCountry(pickUserField(homeUser, "country", "countryCode", "country_code")).code;
  return <><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><main className="wrap page-grid"><SideNav/><div className="main-column"><Hero/><HomeIconTabs/><Sportsbook picks={picks} onPick={onPick} /></div><div className="right-column"><BetSlip picks={picks} setPicks={setPicks} onPlace={onPlace} adminBookingCode={adminBookingCode} adminBookingCodeError={adminBookingCodeError} currency={homeCurr}/><TrustPanel/></div></main><Footer/><BetslipFAB count={picks.length}/></>
}
function Casino(){ return <><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><main className="wrap casino-page"><div className="casino-hero"><img src={casinoFeature}/><div><span className="eyebrow">HotBet Casino</span><h1>Casino &amp;<br/><em>live games.</em></h1><p>Slots, live tables, crash games and more — real prizes, real excitement.</p><div className="hero-buttons" style={{marginTop:20}}><Link href="/casino" className="gold-button" style={{background:"var(--orange)",color:"#fff"}}>Play now <ChevronRight size={15}/></Link><Link href="/promos" className="ghost-button" style={{background:"rgba(255,255,255,.1)",borderColor:"rgba(255,255,255,.3)",color:"#fff"}}>See bonuses</Link></div></div></div><div className="casino-toolbar"><div className="casino-tabs"><button className="active">All Games</button><button>Live Casino</button><button>Slots</button><button>Crash</button><button>Virtual</button></div></div><p style={{paddingTop:24,color:"var(--grey-500)",fontSize:13}}>Casino games coming soon — our live provider integration is in progress. Check back shortly.</p></main><Footer/></> }

function SimplePage({title,kicker,children}:{title:string;kicker:string;children:any}){ return <><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><main className="wrap simple-page"><div className="simple-hero"><span className="eyebrow">{kicker}</span><h1>{title}</h1></div><div className="simple-grid">{children}</div></main><Footer/></> }
function WalletPage(){ return <><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><WalletCenter/><Footer/></> }
function DepositPage(){ return <><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><DepositCenter/><Footer/></> }
function BetsRoute({ tab, picks, setPicks, onPlace, adminBookingCode, adminBookingCodeError }: { tab: "open" | "history"; picks: Pick[]; setPicks: (p: Pick[]) => void; onPlace: (stake: number) => Promise<void>; adminBookingCode?: string | null; adminBookingCodeError?: string }){ return <><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><BetsCenter defaultTab={tab} picks={picks} setPicks={setPicks} onPlace={onPlace} adminBookingCode={adminBookingCode} adminBookingCodeError={adminBookingCodeError}/><Footer/></> }
function TicketDetailsRoute({ id }: { id: string }){ return <TicketDetailsPage id={id}/> }

function App(){ const { user } = useSession(); const appCurr = currencyForCountry(pickUserField(user, "country", "countryCode", "country_code")).code; const [picks,setPicks]=useState<Pick[]>([]); const [adminBookingCode,setAdminBookingCode]=useState<string | null>(null); const [adminBookingCodeError,setAdminBookingCodeError]=useState(""); const onPick=(p:Pick)=>setPicks(prev=>prev.some(x=>x.id===p.id&&x.market===p.market&&x.selection===p.selection)?prev.filter(x=>!(x.id===p.id&&x.market===p.market&&x.selection===p.selection)):[...prev,p]); const onPlace=async(stake:number)=>{ if(!window.localStorage.getItem("accessToken")){ window.location.href="/login"; return; } if(picks.some((pick)=>!isBettableMatchId(pick.id))){ throw new ApiError("One selection is no longer available for betting. Remove it and choose a match with current odds.",422); } const role=getUserRole(user); const isAdminStake=(role==="ADMIN"||role==="SUPER_ADMIN") && picks.length>0; console.info("[HotBet admin booking] betslip submit", { role, isAdminStake, selectionCount:picks.length, selections:picks.map((pick)=>({ id:pick.id, match:pick.match, market:pick.market, selection:pick.selection, source:pick.isAdmin?"ADMIN":"EXTERNAL", odds:pick.odd })) }); setAdminBookingCode(null); setAdminBookingCodeError(""); await api.bets.place({stake,currency:appCurr,selections:picks.map((pick)=>({matchId:pick.id,market:pick.market,selection:pick.selection,submittedOdds:pick.odd}))}); console.info("[HotBet admin booking] bet placed", { isAdminStake, selectionCount:picks.length }); if(!isAdminStake) { console.info("[HotBet admin booking] skipped: current user is not an admin", { role }); return; } try { const selections=picks.map((pick)=>({fixture_id:pick.id,match:pick.match,market:pick.market,odds:pick.odd,pick:pick.selection,result:null,_source:pick.isAdmin?"ADMIN":"EXTERNAL"})); console.info("[HotBet admin booking] creating mixed booking code", { kind:selections.length>1?"MIXED":selections[0].market, selectionCount:selections.length, sources:selections.map((selection)=>selection._source), selections }); const response=await api.adminBooking.createMixedBookingCode({kind:selections.length>1?"MIXED":selections[0].market,label:`Admin stake · ${picks[0].match}`,stake,currency:appCurr,selections,expiresAt:new Date(Date.now()+24*60*60*1000).toISOString()}); const created=(response.data??response) as unknown as Record<string,unknown>; const code=String(created.code??created.bookingCode??created.value??""); console.info("[HotBet admin booking] booking-code response", { response:created, extractedCode:code || null }); if(!code) throw new Error("The booking-code response did not include a code."); setAdminBookingCode(code); console.info("[HotBet admin booking] SUCCESS: code generated", { code }); } catch(error) { console.error("[HotBet admin booking] FAILED: code generation", error); setAdminBookingCodeError(error instanceof Error ? error.message : "The bet was placed, but the Admin booking code could not be generated."); } }; return <><WinCelebrationModal/><Switch><Route path="/casino"><Casino/></Route><Route path="/wallet"><WalletPage/></Route><Route path="/deposit"><DepositPage/></Route><Route path="/promos"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><main className="wrap" style={{paddingTop:28,paddingBottom:60}}><span className="eyebrow">HotBet Promotions</span><h1 style={{font:"900 44px/1 'Barlow Condensed',sans-serif",textTransform:"uppercase",letterSpacing:"-.03em",color:"#FFFFFF",margin:"10px 0 24px"}}>Exclusive <em style={{fontStyle:"normal",color:"var(--orange)"}}>offers</em></h1><div className="promos-grid"><section className="promo-full-card"><img src="https://images.unsplash.com/photo-1593341646782-e0b495cff86d?q=80&w=800&auto=format&fit=crop" alt=""/><span className="promo-badge-large"><Gift size={10}/> Welcome Bonus</span><h3>100% First Deposit Match</h3><p>Double your first deposit up to GHS 500 and start betting with more.</p><Link href="/deposit" className="promo-cta">Claim now <ChevronRight size={13}/></Link></section><section className="promo-full-card"><img src="https://images.unsplash.com/photo-1576153192396-180ecef2a715?q=80&w=800&auto=format&fit=crop" alt=""/><span className="promo-badge-large"><Zap size={10}/> Daily Boost</span><h3>Enhanced Odds Every Day</h3><p>Selected matches get boosted odds — up to 50% extra on your favourite markets.</p><Link href="/" className="promo-cta">Explore matches <ChevronRight size={13}/></Link></section><section className="promo-full-card"><img src="https://images.unsplash.com/photo-1489944440615-453fc2b6a9a9?q=80&w=800&auto=format&fit=crop" alt=""/><span className="promo-badge-large"><Trophy size={10}/> Jackpot</span><h3>Weekly Jackpot Picks</h3><p>Pick all 6 results correctly and share the weekly jackpot pool.</p><Link href="/sports" className="promo-cta">Play jackpot <ChevronRight size={13}/></Link></section><section className="promo-full-card"><img src="https://images.unsplash.com/photo-1522778119026-d647f0596c20?q=80&w=800&auto=format&fit=crop" alt=""/><span className="promo-badge-large"><Sparkles size={10}/> Refer & Earn</span><h3>Earn from Every Referral</h3><p>Invite friends and earn a percentage of every bet they place — forever.</p><Link href="/affiliate" className="promo-cta">Get your link <ChevronRight size={13}/></Link></section></div></main><Footer/></></Route><Route path="/affiliate"><SimplePage title="Affiliate centre" kicker="Grow with HotBet"><section className="panel simple-card"><Layers3 size={24}/><h2>Your referral toolkit</h2><p>Invite friends, track activity, and request affiliate payouts from one clear workspace.</p></section></SimplePage></Route><Route path="/login"><AccountAuth mode="login" /></Route><Route path="/register"><AccountAuth mode="register" /></Route><Route path="/support"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><main className="wrap support-page"><SupportCenter/></main><Footer/></></Route><Route path="/help"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><main className="wrap support-page"><SupportCenter/></main><Footer/></></Route><Route path="/bets"><BetsRoute tab="history" picks={picks} setPicks={setPicks} onPlace={onPlace} adminBookingCode={adminBookingCode} adminBookingCodeError={adminBookingCodeError}/></Route><Route path="/betslip"><BetsRoute tab="open" picks={picks} setPicks={setPicks} onPlace={onPlace} adminBookingCode={adminBookingCode} adminBookingCodeError={adminBookingCodeError}/></Route><Route path="/admin"><AdminPanelPage /></Route><Route path="/super-admin"><SuperAdminPage /></Route><Route path="/admin-guide"><AdminEntryGuidePage /></Route><Route path="/account"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><AccountCenter/><Footer/></></Route><Route path="/profile"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><ProfileCenter/><Footer/></></Route><Route path="/sports"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><SportsPage picks={picks} onPick={onPick}/><Footer/></></Route><Route path="/match/:id">{(params)=><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><MatchDetailsRoute id={params.id ?? ""} picks={picks} onPick={onPick}/><Footer/></>}</Route><Route path="/transactions"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><TransactionsPage/><Footer/></></Route><Route path="/bets/:id">{(params)=><TicketDetailsRoute id={params.id ?? ""}/>}</Route><Route path="/open-bets"><BetsRoute tab="open" picks={picks} setPicks={setPicks} onPlace={onPlace} adminBookingCode={adminBookingCode} adminBookingCodeError={adminBookingCodeError}/></Route><Route path="/notifications"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><NotificationsPage/><Footer/></></Route><Route path="/favorites"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><FavoritesPage/><Footer/></></Route><Route path="/settings"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><SettingsPage/><Footer/></></Route><Route path="/security"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><SecurityPage/><Footer/></></Route><Route path="/responsible-gaming"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><ResponsibleGamingPage/><Footer/></></Route><Route path="/search"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><SearchPage/><Footer/></></Route><Route path="/booking-code"><><Header onMenu={()=>document.body.classList.toggle("menu-open")}/><BookingCodePage/><Footer/></></Route><Route path="/live"><SimplePage title="Live betting" kicker="Follow the moment"><div className="main-column" style={{gridColumn:"1 / -1"}}><Sportsbook picks={picks} onPick={onPick} mode="live-only" /></div><div style={{gridColumn:"1 / -1"}}><BetSlip picks={picks} setPicks={setPicks} onPlace={onPlace} adminBookingCode={adminBookingCode} adminBookingCodeError={adminBookingCodeError} currency={appCurr}/></div></SimplePage></Route><Route path="/"><Home onPick={onPick} picks={picks} setPicks={setPicks} onPlace={onPlace} adminBookingCode={adminBookingCode} adminBookingCodeError={adminBookingCodeError}/></Route><Route><NotFound/></Route></Switch><MobileBottomNav betslipCount={picks.length}/></> }

export default function Root(){ return <SessionProvider><App/></SessionProvider> }
