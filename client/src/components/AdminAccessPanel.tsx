import { ArrowUpRight, Crown, LayoutDashboard, ShieldCheck } from "lucide-react";
import { getUserRole, useSession } from "@/lib/session";

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

export default function AdminAccessPanel() {
  const { token, user } = useSession();
  const role = getUserRole(user);
  if (!token || !ADMIN_ROLES.has(role)) return null;

  const openConsole = () => {
    // The standalone console predates the React app and reads fb_token.
    // Keep both keys in sync so an already authenticated admin does not have
    // to sign in again just to open the admin workspace.
    window.localStorage.setItem("fb_token", token);
    window.location.assign(isSuperAdmin ? "/super-admin" : "/admin");
  };

  const isSuperAdmin = role === "SUPER_ADMIN";

  return (
    <section className="admin-access-panel" aria-labelledby="admin-access-title">
      <div className="admin-access-icon" aria-hidden="true">
        {isSuperAdmin ? <Crown size={21} /> : <ShieldCheck size={21} />}
      </div>
      <div className="admin-access-copy">
        <span className="admin-access-eyebrow">Staff workspace</span>
        <h2 id="admin-access-title">{isSuperAdmin ? "Super Admin Console" : "Admin Console"}</h2>
        <p>
          Signed in with <strong>{role}</strong>. Manage the HotBet platform from the secure operations dashboard.
        </p>
      </div>
      <button type="button" className="admin-access-button" onClick={openConsole}>
        <LayoutDashboard size={16} /> Open console <ArrowUpRight size={15} />
      </button>
    </section>
  );
}
