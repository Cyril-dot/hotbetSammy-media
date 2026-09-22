import { useMemo } from "react";
import { ArrowLeft, ArrowRight, BarChart3, Building2, CheckCircle2, ClipboardList, Coins, FileText, LayoutDashboard, LockKeyhole, MessageSquare, ShieldAlert, ShieldCheck, Ticket, TrendingUp, Users, WalletCards } from "lucide-react";
import { useLocation } from "wouter";
import { isAdminUser, isSuperAdminUser, useSession } from "@/lib/session";

const adminItems = [
  [LayoutDashboard, "Overview", "Platform health, reporting range, protected API status, and affiliate summary."],
  [BarChart3, "Matches", "Create manual or scheduled fixtures, upload team images, update scores, and control match status."],
  [Ticket, "Booking codes", "Create and inspect booking codes used by customer bet slips."],
  [TrendingUp, "Affiliate", "Manage referral links, commission insights, country deposits, payout history, and balances."],
  [WalletCards, "Withdrawals", "Review and process withdrawal requests available to the Admin role."],
  [MessageSquare, "Upgrade chats", "Review administrator upgrade conversations. This tab is visible only to SUPER_ADMIN."],
  [Coins, "Payouts", "Review and settle payout requests. This tab is visible only to SUPER_ADMIN."],
  [Users, "Users & admins", "Manage users, administrators, balances, and account statuses. This tab is visible only to SUPER_ADMIN."],
  [FileText, "Audit & predictions", "Review sensitive audit events and prediction records. This tab is visible only to SUPER_ADMIN."],
] as const;

const superItems = [
  [LayoutDashboard, "Dashboard", "Platform totals, deposit metrics, withdrawal metrics, and quick links to finance queues."],
  [ShieldCheck, "Administrators", "Create administrators, set commission rates, and add administrator funds."],
  [Users, "Users", "Search users, inspect profiles and deposits, change statuses, and adjust balances."],
  [ClipboardList, "Transactions", "Review the platform-wide transaction ledger."],
  [Coins, "Binance deposits", "Review crypto deposit requests and approve or reject them."],
  [Building2, "Bank deposits", "Review bank-transfer deposit requests and approve or reject them."],
  [WalletCards, "Simple deposits", "Review mobile-money deposit requests and approve or reject them."],
  [FileText, "User deposits", "Load deposit history for a specific user ID."],
  [TrendingUp, "Affiliate withdrawals", "Process or reject affiliate withdrawal requests."],
  [Coins, "Payout requests", "Approve, reject, and mark affiliate payouts as paid."],
  [WalletCards, "Withdrawals", "Approve, reject, settle, or mark wallet withdrawals as failed."],
  [BarChart3, "Commission analytics", "Compare daily or weekly commission and deposit performance by country."],
  [MessageSquare, "Upgrade chats", "Read and reply to upgrade conversations and set commission rates."],
  [FileText, "Audit log", "Review sensitive administrative actions for accountability."],
] as const;

export default function AdminEntryGuidePage() {
  const { user, checked } = useSession();
  const [, setLocation] = useLocation();
  const target = useMemo(() => new URLSearchParams(window.location.search).get("target") === "super" ? "super" : "admin", []);
  const superTarget = target === "super";
  const allowed = superTarget ? isSuperAdminUser(user) : isAdminUser(user);
  const items = superTarget ? superItems : adminItems;
  const title = superTarget ? "Before entering Super Bet Super Admin" : "Before entering the Admin Centre";
  const subtitle = superTarget ? "Review what each Super Admin icon opens before entering the protected control centre." : "Review what each Admin Centre icon opens before entering the protected operations panel.";
  if (!checked) return <main className="entry-guide-page"><div className="entry-guide-card"><p>Checking access…</p></div></main>;
  if (!user || !allowed) return <main className="entry-guide-page"><div className="entry-guide-card"><ShieldAlert size={32} /><h1>Restricted guide</h1><p>This guide is available only to the role that can enter the selected panel.</p><button className="entry-guide-secondary" onClick={() => setLocation("/account")}><ArrowLeft size={15} /> Back to account</button></div></main>;
  return <main className="entry-guide-page"><section className="entry-guide-card"><div className="entry-guide-top"><button className="entry-guide-secondary" onClick={() => setLocation("/account")}><ArrowLeft size={15} /> Back to account</button><span className="entry-guide-role"><LockKeyhole size={13} /> {superTarget ? "SUPER_ADMIN" : "ADMIN"}</span></div><div className="entry-guide-heading"><span className="entry-guide-kicker">SUPER BET · ACCESS GUIDE</span><h1>{title}</h1><p>{subtitle}</p></div><div className="entry-guide-notice"><CheckCircle2 size={17} /><span>Each item below corresponds to an icon or tab inside the panel. Select <b>Continue</b> when you are ready.</span></div><div className="entry-guide-grid">{items.map(([Icon, label, description]) => <article className="entry-guide-item" key={label}><span className="entry-guide-icon"><Icon size={17} /></span><div><h2>{label}</h2><p>{description}</p></div></article>)}</div><div className="entry-guide-actions"><button className="entry-guide-primary" onClick={() => setLocation(superTarget ? "/super-admin" : "/admin")}>Continue to {superTarget ? "Super Admin" : "Admin Centre"} <ArrowRight size={16} /></button><button className="entry-guide-secondary" onClick={() => setLocation("/")}>Back to user side</button></div></section><style>{styles}</style></main>;
}

const styles = `.entry-guide-page{min-height:100vh;padding:42px 20px;background:linear-gradient(135deg,#071016,#101b25 60%,#102b25);color:#ecf5f0;font-family:Inter,ui-sans-serif,system-ui,sans-serif}.entry-guide-card{max-width:1080px;margin:0 auto;padding:28px;border:1px solid #263d47;border-radius:18px;background:rgba(10,20,28,.94);box-shadow:0 22px 70px rgba(0,0,0,.25)}.entry-guide-top{display:flex;justify-content:space-between;align-items:center;gap:12px}.entry-guide-heading{max-width:760px;padding:38px 0 20px}.entry-guide-kicker{color:#7be3a1;font-size:10px;font-weight:800;letter-spacing:.14em}.entry-guide-heading h1{margin:10px 0 8px;font-size:32px;line-height:1.15}.entry-guide-heading p{margin:0;color:#94a8b1;line-height:1.6}.entry-guide-role{display:inline-flex;align-items:center;gap:5px;color:#b9f2c9;border:1px solid #286443;background:#112a1d;padding:7px 10px;border-radius:8px;font-size:10px;font-weight:800}.entry-guide-notice{display:flex;gap:9px;align-items:center;padding:12px 14px;border:1px solid #285d42;background:#102b20;border-radius:10px;color:#b8eac8;font-size:11px;line-height:1.45}.entry-guide-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;margin-top:20px;background:#20343e;border:1px solid #20343e}.entry-guide-item{display:flex;gap:11px;padding:15px;background:#0c1820}.entry-guide-icon{display:grid;place-items:center;flex:0 0 32px;height:32px;border-radius:8px;background:#143225;color:#7ee6a4}.entry-guide-item h2{margin:1px 0 5px;font-size:12px}.entry-guide-item p{margin:0;color:#8ea1aa;font-size:10px;line-height:1.5}.entry-guide-actions{display:flex;gap:9px;align-items:center;flex-wrap:wrap;margin-top:22px}.entry-guide-primary,.entry-guide-secondary{display:inline-flex;align-items:center;gap:7px;border-radius:8px;padding:10px 13px;font-size:11px;font-weight:800;cursor:pointer}.entry-guide-primary{border:0;background:#68e49a;color:#06150d}.entry-guide-secondary{border:1px solid #2a444f;background:#12232b;color:#c2d5dc}.entry-guide-primary:hover{background:#8af2b0}.entry-guide-secondary:hover{border-color:#6edda0}@media(max-width:700px){.entry-guide-page{padding:18px 12px}.entry-guide-card{padding:18px}.entry-guide-heading{padding:28px 0 17px}.entry-guide-heading h1{font-size:25px}.entry-guide-grid{grid-template-columns:1fr}.entry-guide-top{align-items:flex-start;flex-direction:column}.entry-guide-role{order:-1}}`;
