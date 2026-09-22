from pathlib import Path
p = Path('/home/ubuntu/hotbet-powerbet-admin-unpacked/client/src/pages/AdminPanelPage.tsx')
s = p.read_text()
s = s.replace('const [tab, setTab] = useState<TabKey>("dashboard");', 'const [tab, setTab] = useState<TabKey>("matches");')
s = s.replace('{ key: "dashboard", label: "Overview", icon: LayoutDashboard },', '')
s = s.replace('const [rows, setRows] = useState<Match[]>([]); const [manual, setManual] = useState<Form>(blank); const [scheduled, setScheduled] = useState<Form>(blank);', 'const [rows, setRows] = useState<Match[]>([]); const [manual, setManual] = useState<Form>(blank); const [scheduled, setScheduled] = useState<Form>(blank); const [matchMode, setMatchMode] = useState<"manual" | "scheduled">("manual");')
old = '<div className="adm-two-col">{formPanel("Create manual match", "Publish a fixture immediately with administrator-controlled details.", manual, setManual, createManual)}{formPanel("Schedule automated match", "Kickoff, goals, and full time are generated from the configured final score.", scheduled, setScheduled, createScheduled, true)}</div>'
new = '<div className="adm-mode-tabs" role="tablist" aria-label="Match creation mode"><button type="button" role="tab" aria-selected={matchMode === "manual"} className={matchMode === "manual" ? "active" : ""} onClick={() => setMatchMode("manual")}>Manual match</button><button type="button" role="tab" aria-selected={matchMode === "scheduled"} className={matchMode === "scheduled" ? "active" : ""} onClick={() => setMatchMode("scheduled")}>Scheduled match</button></div>{matchMode === "manual" ? formPanel("Create manual match", "Publish a fixture immediately with administrator-controlled details.", manual, setManual, createManual) : formPanel("Schedule automated match", "Kickoff, goals, and full time are generated from the configured final score.", scheduled, setScheduled, createScheduled, true)}'
if old not in s:
    raise SystemExit('matches block missing')
s = s.replace(old, new, 1)
s = s.replace('<small>{row.id}</small>', '')
s = s.replace('Open <b>Overview</b> first to check API health.', 'Open <b>Matches</b> to manage fixtures and schedules.')
p.write_text(s)
print('admin panel corrected')
