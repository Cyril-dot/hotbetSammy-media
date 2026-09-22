import { Link, useLocation } from "wouter";
import { Home, Radio, ScanBarcode, Ticket, UserRound } from "lucide-react";

export default function MobileBottomNav({ betslipCount }: { betslipCount: number }) {
  const [location] = useLocation();
  const items = [
    { href: "/", label: "Home", icon: Home, match: (l: string) => l === "/", isBetslip: false },
    { href: "/live", label: "Live", icon: Radio, match: (l: string) => l === "/live", isBetslip: false },
    { href: "/booking-code", label: "Load Code", icon: ScanBarcode, match: (l: string) => l === "/booking-code", isBetslip: false },
    { href: "/open-bets", label: "Betslip", icon: Ticket, match: (l: string) => l === "/open-bets" || l === "/betslip", isBetslip: true },
    { href: "/account", label: "Account", icon: UserRound, match: (l: string) => l === "/account" || l === "/profile", isBetslip: false },
  ];
  return (
    <>
      <style>{`
        .mobile-bottom-nav {
          display: none;
          position: fixed; left: 0; right: 0; bottom: 0;
          height: 62px;
          background: #1A1C1E;
          border-top: 1px solid rgba(255,255,255,.08);
          z-index: 100;
          box-shadow: 0 -4px 20px rgba(0,0,0,.25);
        }
        @media(max-width:820px){ .mobile-bottom-nav{ display:flex; } }
        .mbn-item {
          flex: 1;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
          color: rgba(255,255,255,.38);
          font-size: 10px; font-weight: 700;
          text-decoration: none;
          transition: color .15s;
          position: relative;
        }
        .mbn-item.active { color: #FF7A1A; }
        .mbn-item.active::after {
          content: ''; position: absolute; top: 0; left: 20%; right: 20%; height: 2px;
          background: #FF7A1A; border-radius: 0 0 3px 3px;
        }
        .mbn-item.mbn-has-bets { color: #FF7A1A; }
        .mbn-icon-wrap { position: relative; display: flex; align-items: center; justify-content: center; }
        .mbn-badge {
          position: absolute; top: -5px; right: -8px;
          min-width: 16px; height: 16px; padding: 0 4px;
          background: #F36600; border-radius: 999px;
          color: #fff; font-size: 9px; font-weight: 800;
          display: flex; align-items: center; justify-content: center;
        }
      `}</style>
      <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
        {items.map((item) => {
          const Icon = item.icon;
          const active = item.match(location);
          const showBadge = item.isBetslip && betslipCount > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mbn-item${active ? " active" : ""}${showBadge && !active ? " mbn-has-bets" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="mbn-icon-wrap">
                <Icon size={21} />
                {showBadge && (
                  <span className="mbn-badge">{betslipCount > 9 ? "9+" : betslipCount}</span>
                )}
              </span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}