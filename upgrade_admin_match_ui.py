from pathlib import Path

root = Path('/home/ubuntu/hotbet-powerbet-admin-unpacked')

# 1) Fix the actual account-menu destination and make role destinations exclusive.
p = root / 'client/src/components/AccountCenter.tsx'
s = p.read_text()
s = s.replace('{ icon: <ShieldCheck size={ICON} />, label: "Admin Panel", href: "/admin", hint: "Operations, users, deposits and bets", badge: { text: "ADMIN", tone: "gold" } },\n          { icon: <Crown size={ICON} />, label: "Super Admin Panel", href: "/admin?panel=super-admin", hint: "Admin management and platform controls", badge: { text: "SUPER_ADMIN", tone: "gold" } },', '{ icon: <Crown size={ICON} />, label: "Super Admin Panel", href: "/super-admin", hint: "Admin management and platform controls", badge: { text: "SUPER_ADMIN", tone: "gold" } },')
p.write_text(s)

# 2) Admin panel is for the exact ADMIN role; Super Admin has its own panel.
p = root / 'client/src/pages/AdminPanelPage.tsx'
s = p.read_text()
s = s.replace('import { isAdminUser, isSuperAdminUser, useSession } from "@/lib/session";', 'import { getUserRole, isSuperAdminUser, useSession } from "@/lib/session";')
s = s.replace('const isAdmin = isAdminUser(user); const isSuper = isSuperAdminUser(user);', 'const isAdmin = getUserRole(user) === "ADMIN"; const isSuper = isSuperAdminUser(user);')
s = s.replace('const active = availableTabs.some((item) => item.key === tab) ? tab : "dashboard";', 'const active = availableTabs.some((item) => item.key === tab) ? tab : "matches";')
# Make the matches mode switch explicit in the source, even if a stale style cache is present.
s = s.replace('<div className="adm-mode-tabs" role="tablist" aria-label="Match creation mode">', '<section className="adm-mode-switch" aria-label="Match creation mode"><span className="adm-mode-label">Create mode</span><div className="adm-mode-tabs" role="tablist">')
s = s.replace('</div>{matchMode === "manual" ? formPanel("Create manual match"', '</div></section>{matchMode === "manual" ? formPanel("Create manual match"', 1)
p.write_text(s)

# 3) Expose existing stats/events/H2H/lineups data on the match details page.
p = root / 'client/src/components/MatchDetailsPage.tsx'
s = p.read_text()
helper = '''\nfunction DetailDataPanel({ title, icon: Icon, data }: { title: string; icon: typeof Activity; data: Record<string, unknown> | null }) {\n  const entries = data ? Object.entries(data).filter(([key, value]) => !["id", "matchId", "eventId"].includes(key) && value !== null && value !== undefined && value !== "") : [];\n  return <section className="md-data-card"><div className="md-data-card-head"><Icon size={16} /><h3>{title}</h3></div>{entries.length ? <div className="md-data-grid">{entries.map(([key, value]) => <div className="md-data-item" key={key}><span>{key.replace(/([A-Z])/g, " $1")}</span><b>{typeof value === "object" ? JSON.stringify(value) : String(value)}</b></div>)}</div> : <p className="md-empty-data">No {title.toLowerCase()} data is available for this match.</p>}</section>;\n}\n\n'''
needle = '// Main component\n// ---------------------------------------------------------------------------\n'
if helper not in s:
    s = s.replace(needle, helper + needle, 1)
old_tabs = '''  const tabs = [\n    { key:"odds", label:"Markets", icon: BarChart3 },\n  ] as const;'''
new_tabs = '''  const tabs: Array<{ key: typeof activeTab; label: string; icon: typeof Activity }> = [\n    { key: "odds", label: "Markets", icon: BarChart3 },\n    ...(stats ? [{ key: "stats" as const, label: "Stats", icon: Activity }] : []),\n    ...(events ? [{ key: "events" as const, label: "Events", icon: Zap }] : []),\n    ...(h2h ? [{ key: "h2h" as const, label: "H2H", icon: Users }] : []),\n    ...(lineups ? [{ key: "lineups" as const, label: "Line-ups", icon: Users }] : []),\n  ];'''
if old_tabs in s:
    s = s.replace(old_tabs, new_tabs, 1)
else:
    raise SystemExit('match tabs declaration not found')
needle_render = '''      </div>\n      {/* Additional CSS for details page elements */}'''
replacement_render = '''      </div>\n      {activeTab === "stats" && <DetailDataPanel title="Match statistics" icon={Activity} data={stats} />}\n      {activeTab === "events" && <DetailDataPanel title="Match events" icon={Zap} data={events} />}\n      {activeTab === "h2h" && <DetailDataPanel title="Head to head" icon={Users} data={h2h} />}\n      {activeTab === "lineups" && <DetailDataPanel title="Line-ups" icon={Users} data={lineups} />}\n      {/* Additional CSS for details page elements */}'''
if needle_render in s:
    s = s.replace(needle_render, replacement_render, 1)
else:
    raise SystemExit('match render insertion point not found')
# Add a final CSS layer inside the component's own style tag, after the old rules.
css_anchor = '''        }\n      `}</style>'''
css_add = '''        }\n        .match-details-page{background:linear-gradient(180deg,#f7f7f8 0%,#eceef0 100%)!important;color:#252a30!important;border-radius:0!important}\n        .match-details-page .md-back{color:#6b7280!important;text-decoration:none!important}\n        .match-details-page .md-header{background:linear-gradient(135deg,#252a30 0%,#3f464d 100%)!important;border:0!important;border-top:5px solid #f36600!important;border-radius:22px!important;box-shadow:0 18px 42px rgba(37,42,48,.22)!important}\n        .match-details-page .md-league{color:#f5f6f7!important;font-weight:800!important}\n        .match-details-page .md-team-name{color:#fff!important;text-shadow:0 2px 10px rgba(0,0,0,.22)!important}\n        .match-details-page .md-score-block{background:#fff!important;border:0!important;box-shadow:0 10px 24px rgba(0,0,0,.16)!important}\n        .match-details-page .md-score{color:#252a30!important}\n        .match-details-page .md-status,.match-details-page .md-time-info{color:#6b7280!important}\n        .match-details-page .md-tab-bar{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(120px,1fr))!important;width:100%!important;min-width:0!important;padding:6px!important;background:#252a30!important;border:0!important;border-radius:14px!important;box-shadow:0 12px 24px rgba(37,42,48,.18)!important}\n        .match-details-page .md-tab{width:100%!important;min-width:0!important;color:#d5d8db!important;border-radius:10px!important}\n        .match-details-page .md-tab.active{background:#f36600!important;color:#fff!important}\n        .match-details-page .md-panel-title{background:#fff!important;color:#252a30!important;border:0!important;border-left:5px solid #f36600!important;box-shadow:0 6px 16px rgba(37,42,48,.10)!important}\n        .match-details-page .md-odds-row,.match-details-page .md-market-section{background:#fff!important;border:0!important;box-shadow:0 8px 20px rgba(37,42,48,.10)!important}\n        .match-details-page .md-market-title{color:#f36600!important}\n        .match-details-page .md-odd{background:#eef0f2!important;color:#252a30!important;border:1px solid #d8dce0!important;box-shadow:none!important}\n        .match-details-page .md-odd span{color:#6b7280!important}\n        .match-details-page .md-odd b{color:#f36600!important}\n        .match-details-page .md-odd.sel{background:#f36600!important;border-color:#f36600!important}\n        .match-details-page .md-data-card{margin:0 0 18px;padding:20px;background:#fff;border-radius:16px;border-left:5px solid #f36600;box-shadow:0 8px 20px rgba(37,42,48,.10)}\n        .match-details-page .md-data-card-head{display:flex;align-items:center;gap:9px;padding-bottom:14px;border-bottom:1px solid #e2e5e8;color:#f36600}.match-details-page .md-data-card-head h3{margin:0;color:#252a30;font-size:18px}.match-details-page .md-data-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:15px}.match-details-page .md-data-item{display:grid;gap:4px;padding:12px;border-radius:10px;background:#f1f3f4}.match-details-page .md-data-item span{color:#6b7280;font-size:11px;text-transform:capitalize}.match-details-page .md-data-item b{color:#252a30;font-size:13px;overflow-wrap:anywhere}.match-details-page .md-empty-data{margin:15px 0 0;color:#6b7280;font-size:13px}\n        .adm-mode-switch{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px;padding:12px 14px;border:1px solid #e0e3e6;border-radius:14px;background:#fff;box-shadow:0 8px 20px rgba(37,42,48,.08)}.adm-mode-label{color:#6b7280;font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.adm-mode-tabs{display:flex;gap:7px;flex-wrap:wrap}.adm-mode-tabs button{min-height:40px;padding:0 16px;border:1px solid #cfd4d8;border-radius:9px;background:#f1f3f4;color:#6b7280;font-size:12px;font-weight:900;cursor:pointer}.adm-mode-tabs button.active{border-color:#f36600;background:#f36600;color:#fff;box-shadow:0 5px 12px rgba(243,102,0,.24)}\n        @media(max-width:700px){.match-details-page{padding:12px 12px 78px!important}.match-details-page .md-teams{grid-template-columns:minmax(0,1fr) 86px minmax(0,1fr)!important;gap:8px!important}.match-details-page .md-tab-bar{grid-template-columns:repeat(2,minmax(0,1fr))!important}.match-details-page .md-data-grid{grid-template-columns:1fr}.adm-mode-switch{align-items:stretch;flex-direction:column}.adm-mode-tabs{display:grid;grid-template-columns:1fr 1fr}.adm-mode-tabs button{width:100%}}\n      `}</style>'''
if css_anchor in s:
    s = s.replace(css_anchor, css_add, 1)
else:
    raise SystemExit('embedded CSS anchor not found')
p.write_text(s)

# 4) Add a fallback stylesheet in the global file too, so the visible switch is
# present even before the match component mounts.
p = root / 'client/src/index.css'
s = p.read_text()
marker = '/* Admin and match UI upgrade */'
if marker not in s:
    s += '''\n\n/* Admin and match UI upgrade */\n.adm-mode-switch{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 14px;padding:12px 14px;border:1px solid #e0e3e6;border-radius:14px;background:#fff}.adm-mode-label{color:#6b7280;font-size:11px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.adm-mode-tabs{display:flex;gap:7px;flex-wrap:wrap}.adm-mode-tabs button{min-height:40px;padding:0 16px;border:1px solid #cfd4d8;border-radius:9px;background:#f1f3f4;color:#6b7280;font-size:12px;font-weight:900}.adm-mode-tabs button.active{border-color:#f36600;background:#f36600;color:#fff}@media(max-width:700px){.adm-mode-switch{align-items:stretch;flex-direction:column}.adm-mode-tabs{display:grid;grid-template-columns:1fr 1fr}.adm-mode-tabs button{width:100%}}\n'''
p.write_text(s)
print('role routing, match tabs, and UI upgrade applied')
