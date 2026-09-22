from pathlib import Path
import re

root = Path('/home/ubuntu/hotbet-powerbet-admin-unpacked')

# Staff shortcut: send each role to its React panel rather than the legacy console.
p = root / 'client/src/components/AdminAccessPanel.tsx'
s = p.read_text()
s = s.replace('window.location.assign("/admin/index.html");', 'window.location.assign(isSuperAdmin ? "/super-admin" : "/admin");')
p.write_text(s)

# Admin panel: remove the operations overview from the admin-facing tabs, keep the
# super-admin-only controls scoped, and add a mobile-friendly manual/scheduled switch.
p = root / 'client/src/pages/AdminPanelPage.tsx'
s = p.read_text()
s = s.replace('const [tab, setTab] = useState<TabKey>("dashboard");', 'const [tab, setTab] = useState<TabKey>("matches");')
s = s.replace('{ key: "dashboard", label: "Overview", icon: LayoutDashboard },', '')
s = s.replace('const [rows, setRows] = useState<Match[]>([]); const [manual, setManual] = useState<Form>(blank); const [scheduled, setScheduled] = useState<Form>(blank);', 'const [rows, setRows] = useState<Match[]>([]); const [manual, setManual] = useState<Form>(blank); const [scheduled, setScheduled] = useState<Form>(blank); const [matchMode, setMatchMode] = useState<"manual" | "scheduled">("manual");')
pattern = re.compile(r'\{formPanel\("Create manual match".*?createManual\)\}\{formPanel\("Schedule automated match".*?createScheduled\)\}', re.S)
replacement = '<div className="adm-mode-tabs" role="tablist" aria-label="Match creation mode"><button type="button" role="tab" aria-selected={matchMode === "manual"} className={matchMode === "manual" ? "active" : ""} onClick={() => setMatchMode("manual")}>Manual match</button><button type="button" role="tab" aria-selected={matchMode === "scheduled"} className={matchMode === "scheduled" ? "active" : ""} onClick={() => setMatchMode("scheduled")}>Scheduled match</button></div>{matchMode === "manual" ? formPanel("Create manual match", "Publish a fixture immediately with administrator-controlled details.", manual, setManual, createManual) : formPanel("Schedule automated match", "Kickoff, goals, and full time are generated from the schedule.", scheduled, setScheduled, createScheduled, true)}'
s, n = pattern.subn(replacement, s, count=1)
if n != 1:
    raise SystemExit(f'Could not locate admin match form pair (matches={n})')
# Hide internal IDs in all admin tables while keeping them available to action handlers.
s = s.replace('<tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>', '<tr>{columns.filter((c) => !["id", "userId", "adminId", "walletId"].includes(c)).map((c) => <th key={c}>{c}</th>)}</tr>')
s = s.replace('{columns.map((column) => <td key={column}>{asText(row[column])}</td>)}', '{columns.filter((column) => !["id", "userId", "adminId", "walletId"].includes(column)).map((column) => <td key={column}>{asText(row[column])}</td>)}')
# Update the guide copy so it no longer advertises an admin Overview tab.
s = s.replace('Open <b>Overview</b> first to check API health.', 'Open <b>Matches</b> to manage fixtures and schedules.')
# Add named icons and orange/white/grey responsive overrides to the component stylesheet.
s = s.replace('.adm-primary{border:0;background:#64df92;', '.adm-primary{border:0;background:#f36600;')
s = s.replace('.adm-primary:hover{background:#85eeaa}', '.adm-primary:hover{background:#ff7a1a}')
s = s.replace('.adm-mode-tabs{', '.adm-mode-tabs{') if '.adm-mode-tabs{' in s else s.replace(' .adm-guide-grid{display:grid;', ' .adm-mode-tabs{display:flex;gap:8px;flex-wrap:wrap;padding:0 18px 14px}.adm-mode-tabs button{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border:1px solid #394650;border-radius:9px;background:#111a22;color:#aeb8bf;font-size:12px;font-weight:800;cursor:pointer}.adm-mode-tabs button.active{border-color:#ff7a1a;background:#f36600;color:#fff}.adm-mode-tabs button:focus-visible{outline:2px solid #ff7a1a;outline-offset:2px}.adm-guide-grid{display:grid;')
p.write_text(s)

# Super-admin tables: suppress identifiers from visible columns and redact detail JSON.
p = root / 'client/src/pages/SuperAdminPage.tsx'
s = p.read_text()
s = s.replace('<tr><th>{columns.map((c) => <th key={c}>{c.replace(/([A-Z])/g, " $1")}</th>)}</tr>', '<tr>{columns.filter((c) => !["id", "userId", "adminId", "walletId"].includes(c)).map((c) => <th key={c}>{c.replace(/([A-Z])/g, " $1")}</th>)}</tr>')
# The actual table header uses a single tr; handle that exact source form too.
s = s.replace('<thead><tr>{columns.map((c) => <th key={c}>{c.replace(/([A-Z])/g, " $1")}</th>)}{onRow && <th>Actions</th>}</tr></thead>', '<thead><tr>{columns.filter((c) => !["id", "userId", "adminId", "walletId"].includes(c)).map((c) => <th key={c}>{c.replace(/([A-Z])/g, " $1")}</th>)}{onRow && <th>Actions</th>}</tr></thead>')
s = s.replace('{columns.map((c) => <td key={c}>{c === "id" ? <code>{text(row[c])}</code> : text(row[c])}</td>)}', '{columns.filter((c) => !["id", "userId", "adminId", "walletId"].includes(c)).map((c) => <td key={c}>{text(row[c])}</td>)}')
s = s.replace('User detail · ${idOf(detail)}', 'User detail')
s = s.replace('JSON.stringify(detail, null, 2)', 'JSON.stringify(Object.fromEntries(Object.entries(detail).filter(([key]) => !["id", "userId", "adminId", "walletId"].includes(key))), null, 2)')
# Consistent orange accent for the super-admin action buttons.
s = s.replace('.sa-primary{border:0;background:#68e49a;', '.sa-primary{border:0;background:#f36600;')
s = s.replace('.sa-primary:hover{background:#8af2b0}', '.sa-primary:hover{background:#ff7a1a}')
p.write_text(s)

# Match details: keep the existing API and layout, but make market labels/values use
# the requested orange, white, and grey palette.
p = root / 'client/src/components/MatchDetailsPage.tsx'
s = p.read_text()
s = s.replace('color:#2b6cc4!important', 'color:#f36600!important')
s = s.replace('color:#415b75!important', 'color:#6b7280!important')
s = s.replace('color:#164d96!important', 'color:#f36600!important')
p.write_text(s)

# Fast, low-risk rendering improvements for dense admin tables and panels.
p = root / 'client/src/index.css'
s = p.read_text()
s += '\n/* Keep dense staff workspaces responsive without changing their data flow. */\n.adm-panel, .sa-panel { content-visibility: auto; contain-intrinsic-size: 240px; }\n@media (max-width: 650px) { .adm-mode-tabs { padding-inline: 12px; } .adm-mode-tabs button { flex: 1 1 140px; } }\n'
p.write_text(s)

print('Applied focused HotBet admin and match-detail fixes.')
