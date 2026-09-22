// ============================================================
// HotBet — SUPER ADMIN PANEL (MERGED BUILD)
// ============================================================
// Combines every feature from both source files:
//   • Material-symbol icon helper + emoji fallbacks
//   • XSS-safe escaping on all user-controlled strings
//   • Row cache for detail modals (no JSON-in-onclick)
//   • 401 auto-redirect to sign-in
//   • Admin: create, create-with-commission, set commission, add funds
//   • Users: search / role / status filters, activate / deactivate / toggle,
//            find-by-email + add funds to ANY user (not just admins)
//   • Transactions, Crypto deposits, Bank + MoMo deposits, Simple deposits
//   • Upgrade chats, Affiliate payouts, Payout requests, Audit log
//   • Withdrawals (full lifecycle), User deposit history
//   • Commission & deposit analytics split by country
// ============================================================

// ==================== CONFIG ====================
const BASE_URL = 'https://futballbackend-production-f14d.up.railway.app';
// Alternate backend kept for reference:
// const BASE_URL = 'https://futballbackend-production-ee88.up.railway.app';

let config = { baseUrl: BASE_URL, token: '' };

// ==================== ICON HELPER ====================
function ic(name, cls = '') { return `<span class="ms ms-outline ${cls}">${name}</span>`; }

// ==================== SIDEBAR ====================
function openSidebar() {
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('open');
}
function closeSidebar() {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  if (sb) sb.classList.remove('open');
  if (ov) ov.classList.remove('open');
}

// ==================== AUTH ====================
function logout() {
  if (!confirm('Sign out of the Super Admin console?')) return;
  localStorage.removeItem('fb_token');
  localStorage.removeItem('accessToken');
  window.location.href = 'auth.html';
}

function forceSignIn(reason) {
  localStorage.removeItem('fb_token');
  localStorage.removeItem('accessToken');
  const q = reason ? `?reason=${encodeURIComponent(reason)}` : '';
  window.location.href = `auth.html${q}`;
}

// ==================== API ====================
async function api(path, method = 'GET', body = null) {
  if (!config.token) throw new Error('Session expired — please sign in again.');

  const opts = {
    method,
    headers: {
      'Authorization': 'Bearer ' + config.token,
      'Content-Type': 'application/json'
    }
  };
  if (body !== null) opts.body = JSON.stringify(body);

  const res = await fetch(config.baseUrl + path, opts);

  // Session expired — bounce to sign-in rather than painting every panel red.
  if (res.status === 401) {
    forceSignIn('expired');
    throw new Error('Session expired. Redirecting to sign in…');
  }

  let json;
  try {
    json = await res.json();
  } catch (e) {
    throw new Error(`HTTP ${res.status} — no response body`);
  }

  if (!res.ok) {
    if (res.status === 403) throw new Error('You do not have permission to do that.');
    if (res.status === 404) throw new Error(`Endpoint not found (404): ${path}`);
    const msg = json.message || json.error ||
      (json.errors && JSON.stringify(json.errors)) || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return json.data !== undefined ? json.data : json;
}

// ==================== ALERTS (toasts) ====================
function showAlert(msg, type = 'info', duration = 4500) {
  const el = document.getElementById('alert-container');
  if (!el) return;
  const icons = { success: 'check_circle', error: 'error', info: 'info', warning: 'warning' };
  const div = document.createElement('div');
  div.className = `alert alert-${type}`;
  div.innerHTML = `<span class="ms ms-sm">${icons[type] || 'info'}</span><span>${esc(msg)}</span>`;
  el.appendChild(div);
  setTimeout(() => {
    div.style.transition = 'opacity .3s, transform .3s';
    div.style.opacity = '0';
    div.style.transform = 'translateX(12px)';
    setTimeout(() => div.remove(), 300);
  }, duration);
}

// ==================== MODAL ====================
function openModal(title, html) {
  const t = document.getElementById('modal-title');
  if (t) t.textContent = title || 'Detail';
  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-bg').classList.add('open');
}
function closeModal(e) {
  if (!e || e.target === document.getElementById('modal-bg'))
    document.getElementById('modal-bg').classList.remove('open');
}
function modalIsOpen() {
  const m = document.getElementById('modal-bg');
  return !!m && m.classList.contains('open');
}
function setModalContent(html) {
  const el = document.getElementById('modal-content');
  if (el) el.innerHTML = html;
}

// Escape key closes the modal.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modalIsOpen())
    document.getElementById('modal-bg').classList.remove('open');
});

// ==================== UTILS ====================

/** Escape untrusted text before it goes anywhere near innerHTML. */
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmt(n) {
  const v = Number(n);
  if (!isFinite(v)) return '0.00';
  return v.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtInt(n) {
  const v = Number(n);
  return isFinite(v) ? v.toLocaleString() : '0';
}

function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function truncate(s, n = 28) {
  if (s === null || s === undefined || s === '') return '—';
  const str = String(s);
  return str.length > n ? str.slice(0, n) + '…' : str;
}

function coalesce(...args) {
  for (const a of args) if (a !== null && a !== undefined && a !== '') return a;
  return '—';
}

/** Escaped truncate — use for anything user-supplied. */
function truncEsc(s, n = 28) { return esc(truncate(s, n)); }

/** Safe single-quoted inline-JS argument. */
function jsArg(s) { return String(s === null || s === undefined ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

// ── Deposit type helpers ──────────────────────────────────────────────────────
// Amounts below 30,000 are MoMo deposits (GHS ₵).
// Amounts 30,000+ are NGN bank transfers (₦).
// NOTE: this infers currency from magnitude. A genuine ₵35,000 MoMo deposit
// will display as ₦. Storing the currency on the record would remove the guess.
function isMomo(amount) { return Number(amount) < 30000; }
function depositSymbol(amount) { return isMomo(amount) ? '₵' : '₦'; }
function depositLabel(amount) { return isMomo(amount) ? 'MoMo' : 'Bank Transfer'; }
function depositCurrency(amount) { return isMomo(amount) ? 'GHS' : 'NGN'; }

// ── Country helpers ───────────────────────────────────────────────────────────
function normalizeCountry(raw) {
  if (!raw) return 'UNKNOWN';
  const c = String(raw).trim().toUpperCase();
  if (c === 'GH' || c === 'GHA' || c === '233' || c.startsWith('GHANA')) return 'GH';
  if (c === 'NG' || c === 'NGA' || c === '234' || c.startsWith('NIGERIA')) return 'NG';
  return 'OTHER';
}

function countrySymbol(country) { return country === 'NG' ? '₦' : '₵'; }
function countryCurrency(country) { return country === 'NG' ? 'NGN' : 'GHS'; }

/** Amount formatted with the symbol for that row's country. */
function fmtByCountry(amount, country) {
  return `${countrySymbol(country)}${fmt(amount)}`;
}

function countryBadge(country) {
  const map = {
    GH: { cls: 'badge-green', text: '🇬🇭 Ghana' },
    NG: { cls: 'badge-blue', text: '🇳🇬 Nigeria' },
    OTHER: { cls: 'badge-gray', text: '🌍 Other' },
    UNKNOWN: { cls: 'badge-gray', text: '❓ Unknown' }
  };
  const m = map[country] || map.UNKNOWN;
  return `<span class="badge ${m.cls}">${m.text}</span>`;
}

function statusBadge(s) {
  const map = {
    COMPLETED: 'badge-green', APPROVED: 'badge-green', PROCESSED: 'badge-green',
    PAID: 'badge-green', COMMISSION_SET: 'badge-green', CLOSED: 'badge-gray',
    SETTLED: 'badge-green',
    PENDING: 'badge-yellow', PENDING_COMMISSION: 'badge-yellow', REQUESTED: 'badge-yellow',
    FAILED: 'badge-red', REJECTED: 'badge-red',
    ACTIVE: 'badge-green', DISABLED: 'badge-red', LOCKED: 'badge-yellow',
    SUSPENDED: 'badge-red',
    ADMIN: 'badge-blue', SUPER_ADMIN: 'badge-purple', USER: 'badge-gray'
  };
  return `<span class="badge ${map[s] || 'badge-gray'}">${esc(s) || '—'}</span>`;
}

function kindBadge(k) {
  const map = {
    DEPOSIT: 'badge-green', WITHDRAW: 'badge-red', WITHDRAW_HOLD: 'badge-yellow',
    WITHDRAW_RELEASE: 'badge-blue', BET_STAKE: 'badge-yellow', BET_WIN: 'badge-blue',
    REFERRAL_COMMISSION: 'badge-purple', PAYOUT: 'badge-red', ADJUSTMENT: 'badge-gray',
    VIP_CASHBACK: 'badge-purple', VIP_MEMBERSHIP: 'badge-purple',
    WELCOME_BONUS: 'badge-blue', WITHDRAWAL_REFUND: 'badge-yellow',
    ADMIN_UPGRADE_FEE: 'badge-yellow', ADMIN_CREDIT: 'badge-green'
  };
  return `<span class="badge ${map[k] || 'badge-gray'}">${esc(k) || '—'}</span>`;
}

function networkBadge(n) {
  const map = { MTN: 'badge-yellow', TELECEL: 'badge-blue', AIRTELTIGO: 'badge-red' };
  return `<span class="badge ${map[n] || 'badge-gray'}">${esc(n) || '—'}</span>`;
}

function purposeBadge(p) {
  const map = { WALLET_FUNDING: 'badge-green', CASINO_PLAY: 'badge-purple', OTHER: 'badge-gray' };
  return `<span class="badge ${map[p] || 'badge-gray'}">${esc(p) || '—'}</span>`;
}

function loading(msg = 'Loading…') {
  return `<div class="loading-row"><span class="spinner"></span>${esc(msg)}</div>`;
}

function empty(msg = 'Nothing here yet.', icon = 'inbox') {
  return `<div class="empty"><span class="ms empty-icon">${icon}</span>${esc(msg)}</div>`;
}

function errorBox(msg) {
  return `<div class="alert alert-error">${ic('error', 'ms-sm')} ${esc(msg)}</div>`;
}

function labeledTd(label, content) {
  return `<td data-label="${esc(label)}">${content}</td>`;
}

function detailRow(key, val) {
  const v = (val !== null && val !== undefined && val !== '')
    ? val : '<span style="color:var(--text-dim)">—</span>';
  return `<div class="detail-item"><div class="key">${esc(key)}</div><div class="val">${v}</div></div>`;
}

function paginator(page, totalPages, onPage) {
  if (!totalPages || totalPages <= 1) return '';
  return `<div class="pager">
    <button class="btn-ghost btn-sm" onclick="${onPage}(${page - 1})" ${page === 0 ? 'disabled' : ''}>${ic('chevron_left', 'ms-sm')} Prev</button>
    <span class="pager-info">Page ${page + 1} of ${totalPages}</span>
    <button class="btn-ghost btn-sm" onclick="${onPage}(${page + 1})" ${page >= totalPages - 1 ? 'disabled' : ''}>Next ${ic('chevron_right', 'ms-sm')}</button>
  </div>`;
}

/** Horizontal proportion bar for at-a-glance comparison inside tables. */
function miniBar(value, max, color = 'var(--green-text)') {
  const v = Number(value) || 0;
  const pct = max > 0 ? Math.max(v > 0 ? 2 : 0, (v / max) * 100) : 0;
  return `<div style="height:6px;min-width:70px;border-radius:3px;background:rgba(127,127,127,.18);overflow:hidden">
            <div style="height:100%;width:${pct}%;background:${color};border-radius:3px"></div>
          </div>`;
}

function statCard(icon, label, value, sub = '', color = '') {
  return `<div class="stat">
    <span class="stat-icon">${icon}</span>
    <div class="stat-label">${esc(label)}</div>
    <div class="stat-value"${color ? ` style="color:${color}"` : ''}>${value}</div>
    ${sub ? `<div class="stat-sub">${sub}</div>` : ''}
  </div>`;
}

// ==================== ROW CACHE ====================
// Detail modals used to receive a JSON.stringify'd row through an onclick
// attribute, which breaks on quotes/newlines and is an injection vector.
// Rows are stashed here and looked up by id instead.
const rowCache = { withdrawals: {}, transactions: {} };

function cacheRows(bucket, rows) {
  rowCache[bucket] = {};
  for (const r of rows) if (r && r.id) rowCache[bucket][r.id] = r;
}

// ==================== CSV EXPORT ====================
function exportCSV(filename, headers, rows) {
  const escCsv = v => {
    const s = (v === null || v === undefined) ? '' : String(v);
    return (s.includes(',') || s.includes('"') || s.includes('\n'))
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.map(escCsv).join(','), ...rows.map(r => r.map(escCsv).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ==================== NAVIGATION ====================
let currentPage = 'dashboard';

function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.nav-item')
    .forEach(n => n.classList.toggle('active', n.dataset.page === page));
  const titles = {
    dashboard: 'Dashboard',
    admins: 'Admin Accounts',
    users: 'All Users',
    transactions: 'Platform Transactions',
    binance: 'Crypto Deposits',
    'bank-deposits': 'Bank Transfer & MoMo Deposits',
    'upgrade-chats': 'Admin Upgrade Chats',
    'affiliate-withdrawals': 'Affiliate Payouts',
    'payout-requests': 'Payout Requests',
    'audit-log': 'Audit Log',
    'withdrawals': 'Withdrawal Requests',
    'user-deposits': 'User Deposit History',
    'simple-deposits': 'Simple Deposits (MoMo)',
    'commission-analytics': 'Commission & Deposit Analytics'
  };
  const t = document.getElementById('page-title');
  if (t) t.textContent = titles[page] || page;
  const ac = document.getElementById('alert-container');
  if (ac) ac.innerHTML = '';
  closeSidebar();
  reloadPage();
}

function reloadPage() {
  const pages = {
    dashboard: renderDashboard,
    admins: renderAdmins,
    users: renderUsers,
    transactions: renderTransactions,
    binance: renderBinance,
    'bank-deposits': renderBankDeposits,
    'upgrade-chats': renderUpgradeChats,
    'affiliate-withdrawals': renderAffiliateWithdrawals,
    'payout-requests': renderPayoutRequests,
    'audit-log': renderAuditLog,
    'withdrawals': renderWithdrawals,
    'user-deposits': renderUserDeposits,
    'simple-deposits': renderSimpleDeposits,
    'commission-analytics': renderCommissionAnalytics
  };
  (pages[currentPage] || renderDashboard)();
}

// ============================================================
// 1. DASHBOARD
// ============================================================
// ============================================================
// 1. DASHBOARD
// ============================================================
async function renderDashboard() {
  const c = document.getElementById('page-content');
  c.innerHTML = loading('Fetching platform metrics…');
  try {
    const [metrics, rev] = await Promise.all([
      api('/api/super-admin/metrics'),
      api('/api/super-admin/metrics/deposits/by-country')
    ]);

    // rev = { ghana: {...}, nigeria: {...} } — see CountryRevenueOverviewDto.
    // These two blocks are rendered as fully separate cards and are NEVER
    // summed into a single platform-wide figure: GH is cedis, NG is naira.
    const countryBlocks = [
      { key: 'ghana',   flag: '🇬🇭', label: 'Ghana',   data: rev.ghana },
      { key: 'nigeria', flag: '🇳🇬', label: 'Nigeria', data: rev.nigeria }
    ].filter(b => b.data);

    c.innerHTML = `
      <div class="section-title">Platform</div>
      <div class="stat-grid">
        ${statCard(ic('group'), 'Total Users', fmtInt(metrics.totalUsers))}
        ${statCard(ic('shield_person'), 'Total Admins', fmtInt(metrics.totalAdmins))}
        ${statCard(ic('language'), 'Platform', `<span style="font-size:18px">${esc(metrics.platform)}</span>`)}
      </div>

      <div class="alert alert-info" style="margin:16px 0">
        ${ic('info', 'ms-sm')} Ghana figures are in cedis and Nigeria's in naira.
        They're shown separately below and are never added together into one number.
      </div>

      ${countryBlocks.map(({ flag, label, data }) => {
        const sym = data.currency === 'NGN' ? '₦' : '₵';
        const netFlow = Number(data.totalDepositsAllTime || 0) - Number(data.totalWithdrawalsAllTime || 0);
        return `
          <div class="section-title">${flag} ${esc(label)} Revenue — ${esc(data.currency)}</div>
          <div class="stat-grid">
            ${statCard(ic('south_west'), 'Deposits · All Time', `${sym}${fmt(data.totalDepositsAllTime)}`,
              `${fmtInt(data.totalDepositCount)} transactions`)}
            ${statCard(ic('calendar_month'), 'Deposits · This Month', `${sym}${fmt(data.totalDepositsThisMonth)}`)}
            ${statCard(ic('today'), 'Deposits · Today', `${sym}${fmt(data.totalDepositsToday)}`)}
            ${statCard(ic('north_east'), 'Withdrawals · All Time', `${sym}${fmt(data.totalWithdrawalsAllTime)}`,
              `${fmtInt(data.totalWithdrawalCount)} transactions`, 'var(--red-text)')}
            ${statCard(ic('trending_down'), 'Withdrawals · This Month', `${sym}${fmt(data.totalWithdrawalsThisMonth)}`,
              '', 'var(--red-text)')}
            ${statCard(ic('balance'), 'Net Position', `${sym}${fmt(netFlow)}`,
              'deposits minus withdrawals, all time',
              netFlow >= 0 ? 'var(--green-text)' : 'var(--red-text)')}
          </div>`;
      }).join('')}

      <div style="display:flex;gap:8px;padding-top:16px;flex-wrap:wrap">
        <button class="btn-primary btn-sm" onclick="openFindUserAddFundsModal()">${ic('person_search', 'ms-sm')} Find user &amp; add funds</button>
        <button class="btn-ghost btn-sm" onclick="navigate('commission-analytics')">${ic('analytics', 'ms-sm')} Open analytics</button>
        <button class="btn-ghost btn-sm" onclick="navigate('simple-deposits')">${ic('hourglass_top', 'ms-sm')} Review pending deposits</button>
        <button class="btn-ghost btn-sm" onclick="navigate('withdrawals')">${ic('payments', 'ms-sm')} Review withdrawals</button>
      </div>`;
  } catch (e) {
    c.innerHTML = errorBox(e.message);
  }
}
// ============================================================
// 2. ADMINS
// ============================================================
async function renderAdmins() {
  const c = document.getElementById('page-content');
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>Admin Accounts</h2>
        <div class="btn-row" style="flex-wrap:wrap">
          <button class="btn-ghost btn-sm" onclick="openCreateAdminModal()">${ic('person_add', 'ms-sm')} New Admin</button>
          <button class="btn-primary btn-sm" onclick="openCreateAdminWithCommissionModal()">${ic('person_add', 'ms-sm')} New Admin + Commission</button>
        </div>
      </div>
      <div class="card-body"><div id="admins-list">${loading()}</div></div>
    </div>`;
  try {
    const data = await api('/api/super-admin/admins');
    const list = Array.isArray(data) ? data : (data.content || []);
    if (!list.length) {
      document.getElementById('admins-list').innerHTML =
        empty('No admins yet. Create one to get started.', 'shield_person');
      return;
    }
    document.getElementById('admins-list').innerHTML = `
      <div class="tbl-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Actions</th></tr></thead>
        <tbody>${list.map(a => {
          const safeName = jsArg(a.firstName || 'this admin');
          return `<tr>
          ${labeledTd('Name', esc(`${a.firstName || ''} ${a.lastName || ''}`.trim()) || '—')}
          ${labeledTd('Email', esc(a.email))}
          ${labeledTd('Role', statusBadge(a.role))}
          ${labeledTd('Actions', `<div class="btn-row">
            <button class="btn-ghost btn-sm" onclick="viewAdmin('${esc(a.id)}')">View</button>
            <button class="btn-ghost btn-sm" onclick="openAdminAnalytics('${esc(a.id)}')">${ic('analytics', 'ms-sm')} Commission</button>
            ${a.role === 'ADMIN' ? `<button class="btn-ghost btn-sm" onclick="openSetAdminCommissionModal('${esc(a.id)}', '${esc(safeName)}')">Set Rate</button>` : ''}
            ${a.role === 'ADMIN' ? `<button class="btn-success btn-sm" onclick="openAddFundsModal('${esc(a.id)}', '${esc(safeName)}')">${ic('add_card', 'ms-sm')} Add Funds</button>` : ''}
          </div>`)}
        </tr>`;
        }).join('')}</tbody>
      </table></div>`;
  } catch (e) {
    document.getElementById('admins-list').innerHTML = errorBox(e.message);
  }
}

async function viewAdmin(id) {
  openModal('Admin Detail', loading());
  try {
    const d = await api(`/api/super-admin/admins/${id}`);
    const isSuperAdmin = d.role === 'SUPER_ADMIN';
    const safeName = jsArg(d.firstName || 'this admin');
    setModalContent(`
      <div class="section-title">Profile</div>
      <div class="detail-grid">
        ${detailRow('ID', `<span class="mono">${esc(d.id)}</span>`)}
        ${detailRow('Email', esc(d.email))}
        ${detailRow('Name', esc(`${d.firstName || ''} ${d.lastName || ''}`.trim()))}
        ${detailRow('Phone', esc(d.phone))}
        ${detailRow('Country', esc(d.country))}
        ${detailRow('Role', statusBadge(d.role))}
        ${detailRow('Email Verified', d.emailVerified ? 'Yes' : 'No')}
        ${detailRow('Created', fmtDate(d.createdAt))}
      </div>
      ${d.wallet ? `
        <div class="section-title">Wallet</div>
        <div class="detail-grid">
          ${detailRow('Wallet ID', `<span class="mono">${esc(d.wallet.walletId)}</span>`)}
          ${detailRow('Balance', `₵${fmt(d.wallet.balance)}`)}
          ${detailRow('Currency', esc(d.wallet.currency))}
          ${detailRow('Total Deposited', `₵${fmt(d.wallet.totalDeposited)}`)}
          ${detailRow('Total Withdrawn', `₵${fmt(d.wallet.totalWithdrawn)}`)}
          ${detailRow('Total Transactions', fmtInt(d.wallet.totalTransactions))}
        </div>` : ''}
      ${d.referral ? `
        <div class="section-title">Referral Link</div>
        <div class="detail-grid">
          ${detailRow('Link ID', `<span class="mono">${esc(d.referral.linkId)}</span>`)}
          ${detailRow('Code', esc(d.referral.code))}
          ${detailRow('Commission Rate', `${esc(d.referral.commissionPercent)}%`)}
          ${detailRow('Total Referrals', d.referral.totalReferrals ?? 'N/A')}
          ${detailRow('Total Earnings', d.referral.totalEarnings != null
            ? '₵' + fmt(d.referral.totalEarnings) : 'N/A')}
        </div>` : ''}
      <div class="modal-footer">
        <button class="btn-ghost btn-sm" onclick="closeModal();openAdminAnalytics('${esc(d.id)}')">${ic('analytics', 'ms-sm')} Commission history</button>
        ${!isSuperAdmin ? `<button class="btn-success btn-sm" onclick="closeModal();openAddFundsModal('${esc(d.id)}', '${esc(safeName)}')">${ic('add_card', 'ms-sm')} Add Funds</button>` : ''}
        ${!isSuperAdmin ? `<button class="btn-primary btn-sm" onclick="closeModal();openSetAdminCommissionModal('${esc(d.id)}', '${esc(safeName)}')">Set Commission Rate</button>` : ''}
        <button class="btn-ghost" onclick="closeModal()">Close</button>
      </div>`);
  } catch (e) {
    setModalContent(errorBox(e.message));
  }
}

// ─── Create Admin ────────────────────────────────────────────
function openCreateAdminModal() {
  openModal('Create New Admin', `
    <div class="form-group" style="margin-bottom:12px">
      <label>Email *</label>
      <input id="ca-email" type="email" placeholder="admin@example.com">
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label>Password *</label>
      <input id="ca-pass" type="password" placeholder="Secure password (min 8 chars)">
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div class="form-group"><label>First Name *</label><input id="ca-fn" type="text" placeholder="Jane"></div>
      <div class="form-group"><label>Last Name</label><input id="ca-ln" type="text" placeholder="Smith"></div>
    </div>
    <div id="ca-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="ca-btn" onclick="createAdmin()">Create Admin</button>
    </div>`);
}

async function createAdmin() {
  const email = document.getElementById('ca-email').value.trim();
  const password = document.getElementById('ca-pass').value;
  const firstName = document.getElementById('ca-fn').value.trim();
  const lastName = document.getElementById('ca-ln').value.trim();

  if (!email || !password || !firstName) {
    document.getElementById('ca-msg').innerHTML =
      errorBox('Email, password and first name are required.');
    return;
  }
  const btn = document.getElementById('ca-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Creating…';
  try {
    await api('/api/super-admin/admins', 'POST', { email, password, firstName, lastName });
    closeModal();
    showAlert('Admin created.', 'success');
    renderAdmins();
  } catch (e) {
    document.getElementById('ca-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = 'Create Admin';
  }
}

// ─── Create Admin WITH Commission Rate ───────────────────────
function openCreateAdminWithCommissionModal() {
  openModal('Create New Admin (with Commission)', `
    <div class="alert alert-info" style="margin-bottom:12px">
      ${ic('info', 'ms-sm')} Creates the admin and sets up their referral link at the commission rate below.
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label>Email *</label>
      <input id="cac-email" type="email" placeholder="admin@example.com">
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label>Password *</label>
      <input id="cac-pass" type="password" placeholder="Secure password (min 8 chars)">
    </div>
    <div class="form-row" style="margin-bottom:12px">
      <div class="form-group" style="flex:1;min-width:140px"><label>First Name *</label><input id="cac-fn" type="text" placeholder="Jane"></div>
      <div class="form-group" style="flex:1;min-width:140px"><label>Last Name</label><input id="cac-ln" type="text" placeholder="Smith"></div>
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label>Commission Rate (%) * — 0 to 100</label>
      <input id="cac-rate" type="number" step="0.1" min="0" max="100" placeholder="60">
    </div>
    <div id="cac-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="cac-btn" onclick="createAdminWithCommission()">Create Admin</button>
    </div>`);
}

async function createAdminWithCommission() {
  const email = document.getElementById('cac-email').value.trim();
  const password = document.getElementById('cac-pass').value;
  const firstName = document.getElementById('cac-fn').value.trim();
  const lastName = document.getElementById('cac-ln').value.trim();
  const commissionRate = document.getElementById('cac-rate').value.trim();
  const rateNum = parseFloat(commissionRate);

  if (!email || !password || !firstName) {
    document.getElementById('cac-msg').innerHTML =
      errorBox('Email, password and first name are required.');
    return;
  }
  if (commissionRate === '' || isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
    document.getElementById('cac-msg').innerHTML =
      errorBox('Enter a commission rate between 0 and 100.');
    return;
  }

  const btn = document.getElementById('cac-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Creating…';
  try {
    await api('/api/super-admin/admins/with-commission', 'POST', {
      email, password, firstName, lastName,
      commissionRate: String(rateNum)
    });
    closeModal();
    showAlert(`Admin created with a ${rateNum}% commission rate.`, 'success');
    renderAdmins();
  } catch (e) {
    document.getElementById('cac-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = 'Create Admin';
  }
}

// ─── Update Commission Rate on an existing Admin ─────────────
function openSetAdminCommissionModal(adminId, name) {
  openModal('Set Commission Rate', `
    <p style="margin-bottom:16px">
      Update the commission rate on <strong>${esc(name)}</strong>'s active referral link.
      Valid range: <strong>0 – 100</strong>. Takes effect on their next referred deposit —
      earlier earnings aren't recalculated.
    </p>
    <div class="form-group" style="margin-bottom:12px">
      <label>Commission Rate (%)</label>
      <input id="sac-rate" type="number" step="0.1" min="0" max="100" placeholder="55.0">
    </div>
    <div id="sac-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="sac-btn" onclick="setAdminCommissionRate('${esc(adminId)}')">Save Rate</button>
    </div>`);
}

async function setAdminCommissionRate(adminId) {
  const rateVal = document.getElementById('sac-rate').value.trim();
  const rateNum = parseFloat(rateVal);
  if (rateVal === '' || isNaN(rateNum) || rateNum < 0 || rateNum > 100) {
    document.getElementById('sac-msg').innerHTML = errorBox('Enter a value between 0 and 100.');
    return;
  }
  const btn = document.getElementById('sac-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…';
  try {
    await api(`/api/super-admin/admins/${adminId}/commission-rate`, 'PATCH', {
      commissionRate: String(rateNum)
    });
    closeModal();
    showAlert(`Commission rate set to ${rateNum}%.`, 'success');
    if (currentPage === 'admins') renderAdmins(); else reloadPage();
  } catch (e) {
    document.getElementById('sac-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = 'Save Rate';
  }
}

// ─── Add Funds to an existing Admin's wallet ─────────────────
// POST /api/super-admin/admins/{adminId}/add-funds
// Body: { amount: "500.00", reason?: "free text" }
function openAddFundsModal(adminId, name) {
  openModal('Add Funds to Admin', `
    <div class="alert alert-info" style="margin-bottom:14px">
      ${ic('info', 'ms-sm')} Credits <strong>${esc(name)}</strong>'s wallet directly — e.g. topping them up
      so they can pay out affiliate withdrawals. This is logged in the audit trail.
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label>Amount (₵) *</label>
      <input id="af-amount" type="number" step="0.01" min="0.01" placeholder="500.00">
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label>Reason (optional)</label>
      <textarea id="af-reason" maxlength="500" placeholder="Top-up for affiliate payouts this week."></textarea>
    </div>
    <div id="af-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-success" id="af-btn" onclick="addFundsToAdmin('${esc(adminId)}')">${ic('add_card', 'ms-sm')} Add Funds</button>
    </div>`);
}

async function addFundsToAdmin(adminId) {
  const amountVal = document.getElementById('af-amount').value.trim();
  const amountNum = parseFloat(amountVal);
  const reason = document.getElementById('af-reason').value.trim();

  if (amountVal === '' || isNaN(amountNum) || amountNum <= 0) {
    document.getElementById('af-msg').innerHTML = errorBox('Enter an amount greater than zero.');
    return;
  }

  const btn = document.getElementById('af-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Adding…';
  try {
    const body = { amount: amountNum.toFixed(2) };
    if (reason) body.reason = reason;

    const result = await api(`/api/super-admin/admins/${adminId}/add-funds`, 'POST', body);

    closeModal();
    showAlert(
      `Added ₵${fmt(amountNum)} to admin's wallet. New balance: ₵${fmt(result.balanceAfter)}.`,
      'success', 6000
    );
    if (currentPage === 'admins') renderAdmins(); else reloadPage();
  } catch (e) {
    document.getElementById('af-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = `${ic('add_card', 'ms-sm')} Add Funds`;
  }
}

// ─── Add Funds to ANY user (regular USER or ADMIN) ───────────
// POST /api/super-admin/users/{userId}/add-funds
// Body: { amount: "500.00", reason?: "free text" }
// This is the generic endpoint — works for both roles, unlike the
// admin-only endpoint above which is scoped to /admins/{adminId}/add-funds.
function openAddFundsToUserModal(userId, name) {
  openModal('Add Funds to User', `
    <div class="alert alert-info" style="margin-bottom:14px">
      ${ic('info', 'ms-sm')} Credits <strong>${esc(name)}</strong>'s wallet directly. This is logged
      in the audit trail as a normal deposit.
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label>Amount (₵) *</label>
      <input id="afu-amount" type="number" step="0.01" min="0.01" placeholder="500.00">
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label>Reason (optional)</label>
      <textarea id="afu-reason" maxlength="500" placeholder="Manual credit — reason for the top-up."></textarea>
    </div>
    <div id="afu-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-success" id="afu-btn" onclick="addFundsToUserWallet('${esc(userId)}')">${ic('add_card', 'ms-sm')} Add Funds</button>
    </div>`);
}

async function addFundsToUserWallet(userId) {
  const amountVal = document.getElementById('afu-amount').value.trim();
  const amountNum = parseFloat(amountVal);
  const reason = document.getElementById('afu-reason').value.trim();

  if (amountVal === '' || isNaN(amountNum) || amountNum <= 0) {
    document.getElementById('afu-msg').innerHTML = errorBox('Enter an amount greater than zero.');
    return;
  }

  const btn = document.getElementById('afu-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Adding…';
  try {
    const body = { amount: amountNum.toFixed(2) };
    if (reason) body.reason = reason;

    const result = await api(`/api/super-admin/users/${userId}/add-funds`, 'POST', body);

    closeModal();
    showAlert(
      `Added ₵${fmt(amountNum)} to the user's wallet. New balance: ₵${fmt(result.balanceAfter)}.`,
      'success', 6000
    );
    if (currentPage === 'users') renderUsers(usersPage);
    else if (currentPage === 'admins') renderAdmins();
  } catch (e) {
    document.getElementById('afu-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = `${ic('add_card', 'ms-sm')} Add Funds`;
  }
}

// ─── Find User by Email → Add Funds (quick action, any page) ────────────────
// Reuses the existing paginated/search users endpoint
// (GET /api/super-admin/users?search=…) so results honor whatever search
// the backend already supports (email or name).
function openFindUserAddFundsModal() {
  openModal('Find User &amp; Add Funds', `
    <div class="form-group" style="margin-bottom:12px">
      <label>Search by email or name</label>
      <div style="display:flex;gap:8px">
        <input id="fu-search" type="text" placeholder="john@example.com…" style="flex:1"
          onkeydown="if(event.key==='Enter'){event.preventDefault();searchUsersForFunds();}">
        <button class="btn-primary btn-sm" onclick="searchUsersForFunds()">${ic('search', 'ms-sm')} Search</button>
      </div>
    </div>
    <div id="fu-results">${empty('Search for a user by email to get started.', 'person_search')}</div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Close</button>
    </div>`);
  setTimeout(() => { const el = document.getElementById('fu-search'); if (el) el.focus(); }, 50);
}

async function searchUsersForFunds() {
  const input = document.getElementById('fu-search');
  const q = input ? input.value.trim() : '';
  const resultsEl = document.getElementById('fu-results');
  if (!q) { resultsEl.innerHTML = errorBox('Enter an email or name to search.'); return; }
  resultsEl.innerHTML = loading('Searching…');
  try {
    const data = await api(`/api/super-admin/users?page=0&size=10&search=${encodeURIComponent(q)}`);
    const list = data.content || [];
    if (!list.length) {
      resultsEl.innerHTML = empty('No users matched that search.', 'person_search');
      return;
    }
    resultsEl.innerHTML = `
      <div class="tbl-wrap"><table>
        <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map(u => {
          const safeName = jsArg(u.firstName || 'this user');
          const isSuperAdmin = u.role === 'SUPER_ADMIN';
          return `<tr>
            ${labeledTd('Name', esc(`${u.firstName || ''} ${u.lastName || ''}`.trim()) || '—')}
            ${labeledTd('Email', esc(u.email))}
            ${labeledTd('Role', statusBadge(u.role))}
            ${labeledTd('Status', statusBadge(u.status || 'ACTIVE'))}
            ${labeledTd('', isSuperAdmin
              ? '<span style="color:var(--text-dim);font-size:12px">—</span>'
              : `<button class="btn-success btn-sm"
                   onclick="closeModal();openAddFundsToUserModal('${esc(u.id)}', '${esc(safeName)}')">
                   ${ic('add_card', 'ms-sm')} Add Funds
                 </button>`)}
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
  } catch (e) {
    resultsEl.innerHTML = errorBox(e.message);
  }
}

// ============================================================
// 3. USERS
// ============================================================
let usersPage = 0, usersSearch = '', usersRole = '', usersStatus = '';

async function renderUsers(page = 0) {
  usersPage = page;
  const c = document.getElementById('page-content');
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>All Users</h2>
        <button class="btn-primary btn-sm" onclick="openFindUserAddFundsModal()">${ic('add_card', 'ms-sm')} Add Funds by Email</button>
      </div>
      <div class="card-body">
        <div class="form-row" style="margin-bottom:16px">
          <div class="form-group" style="flex:1;min-width:180px">
            <label>Search (email / name)</label>
            <input id="usr-search" type="text" placeholder="john@example.com…"
              value="${esc(usersSearch)}"
              oninput="usersSearch=this.value"
              onkeydown="if(event.key==='Enter')renderUsers(0)">
          </div>
          <div class="form-group">
            <label>Role</label>
            <select onchange="usersRole=this.value;renderUsers(0)">
              <option value=""            ${usersRole === '' ? 'selected' : ''}>All roles</option>
              <option value="USER"        ${usersRole === 'USER' ? 'selected' : ''}>USER</option>
              <option value="ADMIN"       ${usersRole === 'ADMIN' ? 'selected' : ''}>ADMIN</option>
              <option value="SUPER_ADMIN" ${usersRole === 'SUPER_ADMIN' ? 'selected' : ''}>SUPER_ADMIN</option>
            </select>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select onchange="usersStatus=this.value;renderUsers(0)">
              <option value=""          ${usersStatus === '' ? 'selected' : ''}>All statuses</option>
              <option value="ACTIVE"    ${usersStatus === 'ACTIVE' ? 'selected' : ''}>Active</option>
              <option value="DISABLED"  ${usersStatus === 'DISABLED' ? 'selected' : ''}>Deactivated</option>
              <option value="LOCKED"    ${usersStatus === 'LOCKED' ? 'selected' : ''}>Locked</option>
            </select>
          </div>
          <button class="btn-primary" style="align-self:flex-end" onclick="renderUsers(0)">Search</button>
          <button class="btn-ghost" style="align-self:flex-end"
            onclick="usersSearch='';usersRole='';usersStatus='';renderUsers(0)">Clear</button>
        </div>
        <div id="users-list">${loading()}</div>
      </div>
    </div>`;

  try {
    let q = `?page=${usersPage}&size=20`;
    if (usersSearch && usersSearch.trim()) q += `&search=${encodeURIComponent(usersSearch.trim())}`;
    if (usersRole) q += `&role=${encodeURIComponent(usersRole)}`;
    if (usersStatus) q += `&status=${encodeURIComponent(usersStatus)}`;

    const data = await api(`/api/super-admin/users${q}`);
    let list = data.content || [];

    // Client-side safety net if the API ignores the status filter.
    if (usersStatus) list = list.filter(u => (u.status || 'ACTIVE') === usersStatus);

    document.getElementById('users-list').innerHTML = list.length ? `
      <div class="tbl-wrap"><table>
        <thead><tr>
          <th>Name</th><th>Email</th><th>Phone</th><th>Country</th>
          <th>Role</th><th>Status</th><th>Verified</th><th>Joined</th><th>Actions</th>
        </tr></thead>
        <tbody>${list.map(u => {
          const status = u.status || 'ACTIVE';
          const isActive = status === 'ACTIVE';
          const isSuperAdmin = u.role === 'SUPER_ADMIN';
          const safeName = jsArg(u.firstName || 'this user');
          const toggleBtn = isSuperAdmin ? '' : (isActive
            ? `<button class="btn-danger btn-sm" onclick="confirmDeactivateUser('${esc(u.id)}', '${esc(safeName)}')">${ic('lock', 'ms-sm')} Deactivate</button>`
            : `<button class="btn-success btn-sm" onclick="confirmActivateUser('${esc(u.id)}', '${esc(safeName)}')">${ic('lock_open', 'ms-sm')} Activate</button>`);
          const addFundsBtn = isSuperAdmin ? '' :
            `<button class="btn-success btn-sm" onclick="openAddFundsToUserModal('${esc(u.id)}', '${esc(safeName)}')">${ic('add_card', 'ms-sm')} Add Funds</button>`;
          return `<tr>
          ${labeledTd('Name', esc(`${u.firstName || ''} ${u.lastName || ''}`.trim()) || '—')}
          ${labeledTd('Email', esc(u.email))}
          ${labeledTd('Phone', `<span class="mono">${esc(u.phone) || '—'}</span>`)}
          ${labeledTd('Country', u.country
            ? `${countryBadge(normalizeCountry(u.country))}
               <span style="font-size:11px;color:var(--text-dim)"> ${esc(u.country)}</span>`
            : countryBadge('UNKNOWN'))}
          ${labeledTd('Role', statusBadge(u.role))}
          ${labeledTd('Status', statusBadge(status))}
          ${labeledTd('Verified', u.emailVerified ? ic('verified', 'ms-sm') : '—')}
          ${labeledTd('Joined', `<span class="mono">${fmtDate(u.createdAt)}</span>`)}
          ${labeledTd('Actions', `<div class="btn-row">
            <button class="btn-ghost btn-sm" onclick="viewUser('${esc(u.id)}')">View</button>
            ${addFundsBtn}
            ${toggleBtn}
          </div>`)}
        </tr>`;
        }).join('')}</tbody>
      </table></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;flex-wrap:wrap;gap:8px">
        <span class="pager-info">${fmtInt(data.totalElements)} total users${usersStatus ? ` (${list.length} shown on this page)` : ''}</span>
        ${paginator(usersPage, data.totalPages, 'renderUsers')}
      </div>` : empty('No users match your filters.', 'person_search');
  } catch (e) {
    document.getElementById('users-list').innerHTML = errorBox(e.message);
  }
}

async function viewUser(id) {
  openModal('User Detail', loading());
  try {
    const d = await api(`/api/super-admin/users/${id}`);
    const status = d.status || 'ACTIVE';
    const isActive = status === 'ACTIVE';
    const isDisabled = status === 'DISABLED';
    const isLocked = status === 'LOCKED';
    const isSuperAdmin = d.role === 'SUPER_ADMIN';
    const safeName = jsArg(d.firstName || 'this user');

    const statusActionBtn = isSuperAdmin ? '' : (isActive
      ? `<button class="btn-danger btn-sm"
           onclick="confirmDeactivateUser('${esc(d.id)}', '${esc(safeName)}')">
           ${ic('lock', 'ms-sm')} Deactivate Account
         </button>`
      : `<button class="btn-success btn-sm"
           onclick="confirmActivateUser('${esc(d.id)}', '${esc(safeName)}')">
           ${ic('lock_open', 'ms-sm')} Activate Account
         </button>`);

    setModalContent(`
      <div class="section-title">Profile</div>
      <div class="detail-grid">
        ${detailRow('ID', `<span class="mono">${esc(d.id)}</span>`)}
        ${detailRow('Email', esc(d.email))}
        ${detailRow('Name', esc(`${d.firstName || ''} ${d.lastName || ''}`.trim()))}
        ${detailRow('Phone', esc(d.phone))}
        ${detailRow('Country', d.country
          ? `${countryBadge(normalizeCountry(d.country))}
             <span style="font-size:11px;color:var(--text-dim)"> ${esc(d.country)}</span>`
          : countryBadge('UNKNOWN'))}
        ${detailRow('Role', statusBadge(d.role))}
        ${detailRow('Account Status', statusBadge(status))}
        ${detailRow('Email Verified', d.emailVerified ? 'Yes' : 'No')}
        ${detailRow('Created', fmtDate(d.createdAt))}
      </div>
      ${isDisabled ? `
        <div class="alert alert-warning" style="margin-top:12px">
          ${ic('warning', 'ms-sm')} This account is <strong>disabled</strong>. The user can't sign in.
        </div>` : ''}
      ${isLocked ? `
        <div class="alert alert-warning" style="margin-top:12px">
          ${ic('warning', 'ms-sm')} This account is <strong>locked</strong> (e.g. too many failed sign-in attempts).
        </div>` : ''}
      ${d.wallet ? `
        <div class="section-title">Wallet</div>
        <div class="detail-grid">
          ${detailRow('Wallet ID', `<span class="mono">${esc(d.wallet.walletId)}</span>`)}
          ${detailRow('Balance', `₵${fmt(d.wallet.balance)}`)}
          ${detailRow('Currency', esc(d.wallet.currency))}
          ${detailRow('Total Deposited', `₵${fmt(d.wallet.totalDeposited)}`)}
          ${detailRow('Total Withdrawn', `₵${fmt(d.wallet.totalWithdrawn)}`)}
          ${detailRow('Total Transactions', fmtInt(d.wallet.totalTransactions))}
        </div>` : `<div class="alert alert-info" style="margin-top:12px">${ic('info', 'ms-sm')} No wallet found for this user.</div>`}
      <div class="modal-footer">
        <button class="btn-ghost btn-sm" onclick="viewUserDepositsModal('${esc(id)}','${esc(jsArg(d.email || ''))}')">${ic('receipt_long', 'ms-sm')} Deposits</button>
        <button class="btn-ghost btn-sm" onclick="viewUserTx('${esc(id)}','${esc(d.wallet ? d.wallet.walletId : '')}')">Transactions</button>
        <button class="btn-ghost btn-sm" onclick="viewUserWithdrawals('${esc(id)}','${esc(jsArg(d.email || ''))}')">Withdrawals</button>
        ${!isSuperAdmin ? `<button class="btn-success btn-sm" onclick="closeModal();openAddFundsToUserModal('${esc(d.id)}', '${esc(safeName)}')">${ic('add_card', 'ms-sm')} Add Funds</button>` : ''}
        ${statusActionBtn}
        <button class="btn-ghost" onclick="closeModal()">Close</button>
      </div>`);
  } catch (e) {
    setModalContent(errorBox(e.message));
  }
}

// ─── Activate / Deactivate ─────────────────────────────────
// PATCH /api/v1/super-admin/users/{userId}/deactivate
// PATCH /api/v1/super-admin/users/{userId}/activate
// PATCH /api/v1/super-admin/users/{userId}/toggle-status
function confirmDeactivateUser(userId, name) {
  openModal('Deactivate Account', `
    <div class="alert alert-warning" style="margin-bottom:16px">
      ${ic('warning', 'ms-sm')} You're about to <strong>deactivate</strong> the account for
      <strong>${esc(name)}</strong>.<br><br>
      They'll be locked out immediately and unable to sign in.
      Their wallet and data are preserved. You can reactivate any time.
    </div>
    <div id="da-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="viewUser('${esc(userId)}')">${ic('arrow_back', 'ms-sm')} Back</button>
      <button class="btn-danger" id="da-btn" onclick="deactivateUser('${esc(userId)}')">
        ${ic('lock', 'ms-sm')} Deactivate
      </button>
    </div>`);
}

async function deactivateUser(userId) {
  const btn = document.getElementById('da-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Deactivating…';
  try {
    const result = await api(`/api/v1/super-admin/users/${userId}/deactivate`, 'PATCH');
    closeModal();
    showAlert(result.message ||
      `${result.firstName || 'User'}'s account is deactivated. They can no longer sign in.`,
      'success', 5500);
    if (currentPage === 'users') renderUsers(usersPage); else reloadPage();
  } catch (e) {
    document.getElementById('da-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = `${ic('lock', 'ms-sm')} Deactivate`;
  }
}

function confirmActivateUser(userId, name) {
  openModal('Activate Account', `
    <div class="alert alert-info" style="margin-bottom:16px">
      ${ic('info', 'ms-sm')} You're about to <strong>activate</strong> the account for
      <strong>${esc(name)}</strong>.<br><br>
      They'll be able to sign in again right away.
    </div>
    <div id="ac-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="viewUser('${esc(userId)}')">${ic('arrow_back', 'ms-sm')} Back</button>
      <button class="btn-success" id="ac-btn" onclick="activateUser('${esc(userId)}')">
        ${ic('lock_open', 'ms-sm')} Activate
      </button>
    </div>`);
}

async function activateUser(userId) {
  const btn = document.getElementById('ac-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Activating…';
  try {
    const result = await api(`/api/v1/super-admin/users/${userId}/activate`, 'PATCH');
    closeModal();
    showAlert(result.message ||
      `${result.firstName || 'User'}'s account is active. They can sign in now.`,
      'success', 5500);
    if (currentPage === 'users') renderUsers(usersPage); else reloadPage();
  } catch (e) {
    document.getElementById('ac-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = `${ic('lock_open', 'ms-sm')} Activate`;
  }
}

/** Generic confirm-and-go variant (no modal step). */
async function changeUserStatus(userId, action) {
  const verb = action === 'deactivate' ? 'Deactivate' : 'Activate';
  const warn = action === 'deactivate'
    ? ' They will be unable to sign in immediately.'
    : ' They will regain access to their account.';
  if (!confirm(`${verb} this user's account?${warn}`)) return;
  try {
    const d = await api(`/api/v1/super-admin/users/${userId}/${action}`, 'PATCH');
    showAlert(d.message || `Account ${action}d.`, 'success');
    if (currentPage === 'users') renderUsers(usersPage);
    if (modalIsOpen()) viewUser(userId);
  } catch (e) {
    showAlert('Error: ' + e.message, 'error');
  }
}

async function toggleUserAccountStatus(userId) {
  if (!confirm("Toggle this user's account status?")) return;
  try {
    const d = await api(`/api/v1/super-admin/users/${userId}/toggle-status`, 'PATCH');
    showAlert(d.message || `Status updated to ${d.status}.`, 'success');
    if (currentPage === 'users') renderUsers(usersPage);
    if (modalIsOpen()) viewUser(userId);
  } catch (e) {
    showAlert('Error: ' + e.message, 'error');
  }
}

// Alias kept for backwards compatibility.
async function toggleUserStatusQuick(userId) { return toggleUserAccountStatus(userId); }

// ─── User sub-views ────────────────────────────────────────
/** Jump to the transactions page pre-filtered by this user's wallet. */
function viewUserTx(userId, walletId) {
  closeModal();
  txWalletId = walletId || '';
  navigate('transactions');
  if (!walletId) {
    showAlert('No wallet on file — open the user detail to copy a Wallet ID.', 'info', 7000);
  } else {
    setTimeout(() => renderTransactions(0), 0);
  }
}

async function viewUserWithdrawals(userId, userEmail) {
  openModal(`Withdrawals — ${userEmail || userId}`, loading('Fetching withdrawal history…'));
  try {
    // No server-side user filter on this endpoint yet, so page through and
    // filter locally. Capped at 10 pages to avoid hammering the API.
    let allRows = [], p = 0, total = 1;
    while (p < total && p < 10) {
      const d = await api(`/api/wallet/withdrawals/admin/all?page=${p}&size=50`);
      allRows = allRows.concat(d.content || []);
      total = d.totalPages || 1;
      p++;
      if ((d.content || []).length === 0) break;
    }

    const list = allRows.filter(w =>
      (w.userId && w.userId === userId) || (w.user && w.user.id === userId));

    cacheRows('withdrawals', list);

    if (!list.length) {
      setModalContent(`
        ${empty('No withdrawal requests for this user.', 'account_balance_wallet')}
        <div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Close</button></div>`);
      return;
    }

    const totalOut = list.reduce((s, w) => s + (Number(w.amount) || 0), 0);

    setModalContent(`
      <div class="alert alert-info" style="margin-bottom:14px">
        ${ic('info', 'ms-sm')} <strong>${list.length}</strong> withdrawal request${list.length !== 1 ? 's' : ''} ·
        total <strong style="color:var(--red-text)">₵${fmt(totalOut)}</strong>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Date</th><th>Amount</th><th>Method</th><th>Account</th><th>Status</th><th></th></tr></thead>
        <tbody>${list.map(w => `<tr>
          ${labeledTd('Date', `<span class="mono" style="font-size:12px">${fmtDate(w.createdAt)}</span>`)}
          ${labeledTd('Amount', `<strong style="color:var(--red-text)">₵${fmt(w.amount)}</strong>`)}
          ${labeledTd('Method', `<span class="badge badge-blue">${esc(w.method) || '—'}</span>`)}
          ${labeledTd('Account', `<span class="mono" style="font-size:11px">${esc(w.accountNumber) || '—'}<br>${esc(w.accountName) || ''}</span>`)}
          ${labeledTd('Status', statusBadge(w.status))}
          ${labeledTd('', `<button class="btn-ghost btn-sm" onclick="viewWithdrawal('${esc(w.id)}')">Detail</button>`)}
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="modal-footer">
        <button class="btn-ghost btn-sm" onclick="closeModal();navigate('withdrawals')">Open withdrawals page</button>
        <button class="btn-ghost" onclick="closeModal()">Close</button>
      </div>`);
  } catch (e) {
    setModalContent(`${errorBox(e.message)}
      <div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Close</button></div>`);
  }
}

async function viewUserDepositsModal(userId, userEmail) {
  openModal(`Deposits — ${userEmail || userId}`, loading('Fetching deposit history…'));
  try {
    const data = await api(`/api/super-admin/users/${userId}/deposits?page=0&size=50`);
    const list = data.content || [];

    if (!list.length) {
      setModalContent(`
        ${empty('No deposits for this user.', 'receipt_long')}
        <div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Close</button></div>`);
      return;
    }

    const totalDeposited = list.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);

    // All rows belong to one user, so they share a country and a currency.
    const country = list[0]?.userCountry || 'UNKNOWN';

    setModalContent(`
      <div class="alert alert-info" style="margin-bottom:14px">
        ${ic('info', 'ms-sm')} <strong>${list.length}</strong> deposit${list.length !== 1 ? 's' : ''} shown
        ${data.totalElements > list.length ? `(${fmtInt(data.totalElements)} total — open the full page for all)` : ''}
        · ${countryBadge(country)}.
        Total shown: <strong style="color:var(--green-text)">${fmtByCountry(totalDeposited, country)}</strong>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr><th>Date</th><th>Amount</th><th>Balance After</th><th>Status</th><th>Provider Ref</th></tr></thead>
        <tbody>${list.map(d => `<tr>
          ${labeledTd('Date', `<span class="mono" style="font-size:12px">${fmtDate(d.createdAt)}</span>`)}
          ${labeledTd('Amount', `<strong style="color:var(--green-text)">${fmtByCountry(d.amount, d.userCountry || country)}</strong>`)}
          ${labeledTd('Balance After', fmtByCountry(d.balanceAfter, d.userCountry || country))}
          ${labeledTd('Status', statusBadge(d.status))}
          ${labeledTd('Provider Ref', `<span class="mono" style="font-size:11px">${truncEsc(d.providerRef, 22)}</span>`)}
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="modal-footer">
        <button class="btn-ghost btn-sm"
          onclick="closeModal();navigateToUserDeposits('${esc(userId)}','${esc(jsArg(userEmail || ''))}')">Open full deposit page</button>
        <button class="btn-ghost" onclick="closeModal()">Close</button>
      </div>`);
  } catch (e) {
    setModalContent(`${errorBox(e.message)}
      <div class="modal-footer"><button class="btn-ghost" onclick="closeModal()">Close</button></div>`);
  }
}

function navigateToUserDeposits(userId, userEmail) {
  udFilterUserId = userId;
  udFilterUserEmail = userEmail;
  navigate('user-deposits');
}

// ============================================================
// 4. TRANSACTIONS
// ============================================================
let txPage = 0, txKind = '', txStatus = '', txFrom = '', txTo = '', txWalletId = '';

const TX_KINDS = ['DEPOSIT', 'WITHDRAW', 'WITHDRAW_HOLD', 'WITHDRAW_RELEASE', 'BET_STAKE', 'BET_WIN',
  'REFERRAL_COMMISSION', 'PAYOUT', 'ADJUSTMENT', 'VIP_CASHBACK', 'VIP_MEMBERSHIP',
  'WELCOME_BONUS', 'WITHDRAWAL_REFUND', 'ADMIN_UPGRADE_FEE', 'ADMIN_CREDIT'];

const CREDIT_KINDS = new Set(['DEPOSIT', 'BET_WIN', 'REFERRAL_COMMISSION',
  'WELCOME_BONUS', 'VIP_CASHBACK', 'WITHDRAW_RELEASE', 'ADMIN_CREDIT']);

function txQuery(page, size) {
  let q = `?page=${page}&size=${size}`;
  if (txKind) q += `&kind=${encodeURIComponent(txKind)}`;
  if (txStatus) q += `&status=${encodeURIComponent(txStatus)}`;
  if (txFrom) q += `&from=${encodeURIComponent(txFrom)}`;
  if (txTo) q += `&to=${encodeURIComponent(txTo)}`;
  if (txWalletId) q += `&walletId=${encodeURIComponent(txWalletId)}`;
  return q;
}

async function renderTransactions(page = 0) {
  txPage = page;
  const c = document.getElementById('page-content');
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>Platform Transactions</h2>
        <button class="btn-ghost btn-sm" onclick="exportTransactionsCSV()">${ic('download', 'ms-sm')} Export CSV</button>
      </div>
      <div class="card-body">
        <div class="form-row" style="margin-bottom:16px">
          <div class="form-group">
            <label>Kind</label>
            <select id="tx-kind" onchange="txKind=this.value">
              <option value="">All kinds</option>
              ${TX_KINDS.map(k => `<option value="${k}" ${txKind === k ? 'selected' : ''}>${k}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="tx-status" onchange="txStatus=this.value">
              <option value="">All</option>
              <option value="COMPLETED" ${txStatus === 'COMPLETED' ? 'selected' : ''}>COMPLETED</option>
              <option value="PENDING"   ${txStatus === 'PENDING' ? 'selected' : ''}>PENDING</option>
              <option value="FAILED"    ${txStatus === 'FAILED' ? 'selected' : ''}>FAILED</option>
            </select>
          </div>
          <div class="form-group">
            <label>From</label>
            <input id="tx-from" type="datetime-local"
              onchange="txFrom=this.value?new Date(this.value).toISOString():''">
          </div>
          <div class="form-group">
            <label>To</label>
            <input id="tx-to" type="datetime-local"
              onchange="txTo=this.value?new Date(this.value).toISOString():''">
          </div>
          <div class="form-group" style="flex:1;min-width:150px">
            <label>Wallet ID (UUID)</label>
            <input id="tx-wallet" type="text" placeholder="Filter by wallet…"
              value="${esc(txWalletId)}" oninput="txWalletId=this.value">
          </div>
          <div style="display:flex;gap:6px;align-self:flex-end">
            <button class="btn-primary" onclick="renderTransactions(0)">Filter</button>
            <button class="btn-ghost"
              onclick="txKind='';txStatus='';txFrom='';txTo='';txWalletId='';renderTransactions(0)">Clear</button>
          </div>
        </div>
        <div id="tx-list">${loading()}</div>
      </div>
    </div>`;

  try {
    const data = await api(`/api/super-admin/transactions${txQuery(txPage, 50)}`);
    const list = data.content || [];
    cacheRows('transactions', list);

    document.getElementById('tx-list').innerHTML = list.length ? `
      <div class="tbl-wrap"><table>
        <thead><tr>
          <th>Date</th><th>User Email</th><th>Country</th><th>Kind</th><th>Amount</th>
          <th>Balance After</th><th>Status</th><th>Provider Ref</th><th></th>
        </tr></thead>
        <tbody>${list.map(t => `<tr>
          ${labeledTd('Date', `<span class="mono">${fmtDate(t.createdAt)}</span>`)}
          ${labeledTd('User Email', esc(t.userEmail) || '—')}
          ${labeledTd('Country', countryBadge(t.userCountry))}
          ${labeledTd('Kind', kindBadge(t.kind))}
          ${labeledTd('Amount', `<strong style="color:${CREDIT_KINDS.has(t.kind) ? 'var(--green-text)' : 'var(--red-text)'}">${fmtByCountry(t.amount, t.userCountry)}</strong>`)}
          ${labeledTd('Balance After', fmtByCountry(t.balanceAfter, t.userCountry))}
          ${labeledTd('Status', statusBadge(t.status))}
          ${labeledTd('Provider Ref', `<span class="mono">${truncEsc(t.providerRef, 20)}</span>`)}
          ${labeledTd('', `<button class="btn-ghost btn-sm" onclick="viewTx('${esc(t.id)}')">Detail</button>`)}
        </tr>`).join('')}</tbody>
      </table></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;flex-wrap:wrap;gap:8px">
        <span class="pager-info">${fmtInt(data.totalElements)} total transactions</span>
        ${paginator(txPage, data.totalPages, 'renderTransactions')}
      </div>` : empty('No transactions match your filters.', 'swap_horiz');
  } catch (e) {
    document.getElementById('tx-list').innerHTML = errorBox(e.message);
  }
}

function viewTx(id) {
  const t = rowCache.transactions[id];
  if (!t) { showAlert('That row is no longer loaded — refresh the page.', 'error'); return; }
  openModal('Transaction Detail', `
    <div class="section-title">Transaction</div>
    <div class="detail-grid">
      ${detailRow('ID', `<span class="mono">${esc(t.id)}</span>`)}
      ${detailRow('Kind', kindBadge(t.kind))}
      ${detailRow('Status', statusBadge(t.status))}
      ${detailRow('Amount', `${fmtByCountry(t.amount, t.userCountry)}
        <span style="font-size:11px;color:var(--text-dim)">${countryCurrency(t.userCountry)}</span>`)}
      ${detailRow('Balance After', fmtByCountry(t.balanceAfter, t.userCountry))}
      ${detailRow('Country', countryBadge(t.userCountry))}
      ${detailRow('User Email', esc(t.userEmail))}
      ${detailRow('User ID', `<span class="mono">${esc(t.userId)}</span>`)}
      ${detailRow('Wallet ID', `<span class="mono">${esc(t.walletId)}</span>`)}
      ${detailRow('Provider Ref', esc(t.providerRef))}
      ${detailRow('Date', fmtDate(t.createdAt))}
    </div>
    ${t.metadata ? `<div class="section-title">Metadata</div>
      <pre class="json-pre">${esc(JSON.stringify(t.metadata, null, 2))}</pre>` : ''}
    <div class="modal-footer">
      ${t.userId ? `<button class="btn-ghost btn-sm" onclick="closeModal();viewUser('${esc(t.userId)}')">View user</button>` : ''}
      <button class="btn-ghost" onclick="closeModal()">Close</button>
    </div>`);
}

async function exportTransactionsCSV() {
  const btn = document.querySelector('[onclick="exportTransactionsCSV()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Exporting…'; }
  try {
    let rows = [], p = 0, total = 1;
    while (p < total) {
      const d = await api(`/api/super-admin/transactions${txQuery(p, 500)}`);
      rows = rows.concat(d.content || []);
      total = d.totalPages || 1;
      p++;
    }
    if (!rows.length) { showAlert('Nothing to export.', 'warning'); return; }
    exportCSV(`transactions-${new Date().toISOString().slice(0, 10)}.csv`,
      ['ID', 'User Email', 'User ID', 'Country', 'Currency', 'Wallet ID', 'Kind',
        'Amount', 'Balance After', 'Status', 'Provider Ref', 'Date'],
      rows.map(t => [t.id, t.userEmail, t.userId,
        t.userCountry || 'UNKNOWN', countryCurrency(t.userCountry),
        t.walletId, t.kind, t.amount, t.balanceAfter,
        t.status, t.providerRef || '', t.createdAt]));
    showAlert(`Exported ${rows.length} rows.`, 'success');
  } catch (e) {
    showAlert('Export failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `${ic('download', 'ms-sm')} Export CSV`; }
  }
}

// ============================================================
// 5. CRYPTO / BINANCE DEPOSITS
// ============================================================
let binancePage = 0, binanceTab = 'all';

async function renderBinance(page = 0) {
  binancePage = page;
  const c = document.getElementById('page-content');
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>Crypto / Binance Deposits</h2>
        <button class="btn-ghost btn-sm" onclick="exportBinanceCSV()">${ic('download', 'ms-sm')} Export CSV</button>
      </div>
      <div class="card-body">
        <div class="tabs">
          <button class="tab ${binanceTab === 'all' ? 'active' : ''}"
            onclick="binanceTab='all';renderBinance(0)">All Deposits</button>
          <button class="tab ${binanceTab === 'pending' ? 'active' : ''}"
            onclick="binanceTab='pending';renderBinance(0)">${ic('hourglass_top', 'ms-sm')} Pending Review</button>
        </div>
        <div id="binance-list">${loading()}</div>
      </div>
    </div>`;

  try {
    const ep = binanceTab === 'pending'
      ? `/api/admin/binance-deposits/pending?page=${page}&size=20`
      : `/api/admin/binance-deposits?page=${page}&size=20`;
    const data = await api(ep);
    const list = data.content || [];

    document.getElementById('binance-list').innerHTML = list.length ? `
      <div class="tbl-wrap"><table>
        <thead><tr>
          <th>Date</th><th>User ID</th><th>Coin/Network</th><th>Crypto Amt</th>
          <th>Expected GHS</th><th>Credited GHS</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>${list.map(d => `<tr>
          ${labeledTd('Date', `<span class="mono">${fmtDate(d.createdAt)}</span>`)}
          ${labeledTd('User ID', `<span class="mono">${truncEsc(d.userId, 14)}</span>`)}
          ${labeledTd('Coin/Network', `<span class="badge badge-yellow">${esc(d.coin)}/${esc(d.network)}</span>`)}
          ${labeledTd('Crypto Amt', esc(d.cryptoAmount))}
          ${labeledTd('Expected GHS', `₵${fmt(d.expectedGhsAmount)}`)}
          ${labeledTd('Credited GHS', d.creditedGhsAmount != null ? `₵${fmt(d.creditedGhsAmount)}` : '—')}
          ${labeledTd('Status', statusBadge(d.status))}
          ${labeledTd('Actions', `<div class="btn-row">
            <button class="btn-ghost btn-sm" onclick="viewBinanceDeposit('${esc(d.id)}')">View</button>
            ${d.status === 'PENDING'
              ? `<button class="btn-success btn-sm" onclick="openApproveDeposit('${esc(d.id)}',${Number(d.expectedGhsAmount) || 0})">Approve</button>
                 <button class="btn-danger btn-sm" onclick="openRejectDeposit('${esc(d.id)}')">Reject</button>`
              : ''}
          </div>`)}
        </tr>`).join('')}</tbody>
      </table></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;flex-wrap:wrap;gap:8px">
        <span class="pager-info">${fmtInt(data.totalElements)} total</span>
        ${paginator(binancePage, data.totalPages, 'renderBinance')}
      </div>` : empty(binanceTab === 'pending' ? 'Nothing awaiting review.' : 'No crypto deposits yet.', 'currency_bitcoin');
  } catch (e) {
    document.getElementById('binance-list').innerHTML = errorBox(e.message);
  }
}

async function viewBinanceDeposit(id) {
  openModal('Crypto Deposit Detail', loading());
  try {
    const d = await api(`/api/admin/binance-deposits/${id}`);
    setModalContent(`
      <div class="section-title">Deposit Info</div>
      <div class="detail-grid">
        ${detailRow('ID', `<span class="mono">${esc(d.id)}</span>`)}
        ${detailRow('Status', statusBadge(d.status))}
        ${detailRow('Coin', esc(d.coin))}
        ${detailRow('Network', esc(d.network))}
        ${detailRow('Crypto Amount', esc(d.cryptoAmount))}
        ${detailRow('Expected GHS', `₵${fmt(d.expectedGhsAmount)}`)}
        ${detailRow('Credited GHS', d.creditedGhsAmount != null ? `₵${fmt(d.creditedGhsAmount)}` : '—')}
        ${detailRow('TXID', `<span class="mono">${esc(d.txid) || '—'}</span>`)}
        ${detailRow('Sender Address', `<span class="mono" style="font-size:11px">${esc(d.senderAddress) || '—'}</span>`)}
        ${detailRow('User Note', esc(d.userNote))}
        ${detailRow('Admin Note', esc(d.adminNote))}
        ${detailRow('Reviewed By', d.reviewedBy ? `<span class="mono">${esc(d.reviewedBy)}</span>` : '—')}
        ${detailRow('Reviewed At', fmtDate(d.reviewedAt))}
        ${detailRow('Wallet Tx ID', d.walletTransactionId ? `<span class="mono">${esc(d.walletTransactionId)}</span>` : '—')}
        ${detailRow('User ID', `<span class="mono">${esc(d.userId)}</span>`)}
        ${detailRow('Created', fmtDate(d.createdAt))}
        ${detailRow('Updated', fmtDate(d.updatedAt))}
      </div>
      ${d.screenshotUrl ? `
        <div class="section-title">Payment Screenshot</div>
        <img class="screenshot-img" src="${encodeURI(d.screenshotUrl)}"
             onclick="window.open('${encodeURI(d.screenshotUrl)}','_blank')" alt="Payment proof">` : ''}
      <div class="modal-footer">
        ${d.status === 'PENDING' ? `
          <button class="btn-success" onclick="closeModal();openApproveDeposit('${esc(d.id)}',${Number(d.expectedGhsAmount) || 0})">Approve</button>
          <button class="btn-danger" onclick="closeModal();openRejectDeposit('${esc(d.id)}')">Reject</button>` : ''}
        <button class="btn-ghost" onclick="closeModal()">Close</button>
      </div>`);
  } catch (e) {
    setModalContent(errorBox(e.message));
  }
}

function openApproveDeposit(id, expectedGhs) {
  openModal('Approve Deposit', `
    <div class="alert alert-info">${ic('info', 'ms-sm')} The user's GHS wallet is credited immediately on approval.</div>
    <div class="form-group" style="margin-bottom:12px">
      <label>GHS Amount to Credit * (adjust if the rate differs)</label>
      <input id="appr-amt" type="number" step="0.01" min="0.01" value="${Number(expectedGhs) || 0}">
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label>Admin Note (optional)</label>
      <textarea id="appr-note" placeholder="Verified on-chain. Rate: 140 GHS/USDT."></textarea>
    </div>
    <div id="appr-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-success" id="appr-btn" onclick="approveDeposit('${esc(id)}')">Approve &amp; Credit</button>
    </div>`);
}

async function approveDeposit(id) {
  const creditedGhsAmount = parseFloat(document.getElementById('appr-amt').value);
  const adminNote = document.getElementById('appr-note').value.trim();
  if (!creditedGhsAmount || creditedGhsAmount <= 0) {
    document.getElementById('appr-msg').innerHTML = errorBox('Enter a valid GHS amount.');
    return;
  }
  const btn = document.getElementById('appr-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Approving…';
  try {
    await api(`/api/admin/binance-deposits/${id}/approve`, 'POST', { creditedGhsAmount, adminNote });
    closeModal();
    showAlert(`Deposit approved — ₵${fmt(creditedGhsAmount)} credited.`, 'success');
    renderBinance(binancePage);
  } catch (e) {
    document.getElementById('appr-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = 'Approve &amp; Credit';
  }
}

function openRejectDeposit(id) {
  openModal('Reject Deposit', `
    <div class="alert alert-warning">${ic('warning', 'ms-sm')} The wallet won't be credited. This note is visible to the user.</div>
    <div class="form-group" style="margin-bottom:12px;margin-top:4px">
      <label>Rejection Reason * (max 1000 chars)</label>
      <textarea id="rej-note" maxlength="1000" placeholder="TXID not found on the TRC20 network after 24h."></textarea>
    </div>
    <div id="rej-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-danger" id="rej-btn" onclick="rejectDeposit('${esc(id)}')">Reject</button>
    </div>`);
}

async function rejectDeposit(id) {
  const adminNote = document.getElementById('rej-note').value.trim();
  if (!adminNote) {
    document.getElementById('rej-msg').innerHTML = errorBox('A rejection reason is required.');
    return;
  }
  const btn = document.getElementById('rej-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Rejecting…';
  try {
    await api(`/api/admin/binance-deposits/${id}/reject`, 'POST', { adminNote });
    closeModal();
    showAlert('Deposit rejected.', 'success');
    renderBinance(binancePage);
  } catch (e) {
    document.getElementById('rej-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = 'Reject';
  }
}

async function exportBinanceCSV() {
  const btn = document.querySelector('[onclick="exportBinanceCSV()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Exporting…'; }
  try {
    let rows = [], p = 0, total = 1;
    while (p < total) {
      const ep = binanceTab === 'pending'
        ? `/api/admin/binance-deposits/pending?page=${p}&size=100`
        : `/api/admin/binance-deposits?page=${p}&size=100`;
      const d = await api(ep);
      rows = rows.concat(d.content || []);
      total = d.totalPages || 1;
      p++;
    }
    if (!rows.length) { showAlert('Nothing to export.', 'warning'); return; }
    exportCSV(`crypto-deposits-${new Date().toISOString().slice(0, 10)}.csv`,
      ['ID', 'User ID', 'TXID', 'Coin', 'Network', 'Crypto Amount', 'Expected GHS', 'Credited GHS',
        'Status', 'Sender Address', 'User Note', 'Admin Note', 'Reviewed By', 'Reviewed At',
        'Wallet Tx ID', 'Created At', 'Updated At'],
      rows.map(d => [d.id, d.userId, d.txid, d.coin, d.network, d.cryptoAmount,
        d.expectedGhsAmount, d.creditedGhsAmount ?? '', d.status, d.senderAddress ?? '',
        d.userNote ?? '', d.adminNote ?? '', d.reviewedBy ?? '', d.reviewedAt ?? '',
        d.walletTransactionId ?? '', d.createdAt, d.updatedAt ?? '']));
    showAlert(`Exported ${rows.length} deposits.`, 'success');
  } catch (e) {
    showAlert('Export failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `${ic('download', 'ms-sm')} Export CSV`; }
  }
}

// ============================================================
// 6. BANK TRANSFER & MOMO DEPOSITS
// ============================================================
// Tabs:
//   'all'     – everything, newest first
//   'momo'    – ngnAmountSent < 30000 (GHS ₵)
//   'bank'    – ngnAmountSent >= 30000 (NGN ₦)
//   'pending' – awaiting review
// ─────────────────────────────────────────────────────────────
let bankDepositPage = 0, bankDepositTab = 'all';

async function renderBankDeposits(page = 0) {
  bankDepositPage = page;
  const c = document.getElementById('page-content');
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>Bank Transfer &amp; MoMo Deposits</h2>
        <button class="btn-ghost btn-sm" onclick="exportBankDepositsCSV()">${ic('download', 'ms-sm')} Export CSV</button>
      </div>
      <div class="card-body">
        <div class="alert alert-info" style="margin-bottom:14px">
          ${ic('info', 'ms-sm')} <strong>MoMo</strong> (under ₵30,000) shows in cedis.
          <strong>Bank transfers</strong> (30,000 and above) show in naira. Newest first.
          Review the screenshot and reference, then approve to credit the wallet or reject.
        </div>
        <div class="tabs">
          <button class="tab ${bankDepositTab === 'all' ? 'active' : ''}"
            onclick="bankDepositTab='all';renderBankDeposits(0)">All Deposits</button>
          <button class="tab ${bankDepositTab === 'momo' ? 'active' : ''}"
            onclick="bankDepositTab='momo';renderBankDeposits(0)">📱 MoMo (₵)</button>
          <button class="tab ${bankDepositTab === 'bank' ? 'active' : ''}"
            onclick="bankDepositTab='bank';renderBankDeposits(0)">🏦 Bank Transfer (₦)</button>
          <button class="tab ${bankDepositTab === 'pending' ? 'active' : ''}"
            onclick="bankDepositTab='pending';renderBankDeposits(0)">${ic('hourglass_top', 'ms-sm')} Pending Review</button>
        </div>
        <div id="bank-deposit-list">${loading()}</div>
      </div>
    </div>`;

  try {
    const isPendingTab = bankDepositTab === 'pending';
    const ep = isPendingTab
      ? `/api/admin/bank-deposits/pending?page=${page}&size=50&sort=createdAt,desc`
      : `/api/admin/bank-deposits?page=${page}&size=50&sort=createdAt,desc`;

    const data = await api(ep);

    // Safety net in case the API ignores the sort param.
    let list = (data.content || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (bankDepositTab === 'momo') list = list.filter(d => isMomo(d.ngnAmountSent));
    else if (bankDepositTab === 'bank') list = list.filter(d => !isMomo(d.ngnAmountSent));

    const emptyMsgs = {
      all: 'No deposit submissions yet.',
      momo: 'No MoMo submissions on this page.',
      bank: 'No bank transfer submissions on this page.',
      pending: 'Nothing awaiting review.'
    };

    document.getElementById('bank-deposit-list').innerHTML = list.length ? `
      <div class="tbl-wrap"><table>
        <thead><tr>
          <th>Date</th><th>Type</th><th>User ID</th><th>Transfer Ref</th>
          <th>Sent</th><th>Expected Credit</th><th>Credited</th>
          <th>Sender Name</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>${list.map(d => {
          const sym = depositSymbol(d.ngnAmountSent);
          const typeBadge = isMomo(d.ngnAmountSent)
            ? `<span class="badge badge-green">📱 MoMo</span>`
            : `<span class="badge badge-blue">🏦 Bank</span>`;
          return `<tr>
            ${labeledTd('Date', `<span class="mono" style="font-size:12px">${fmtDate(d.createdAt)}</span>`)}
            ${labeledTd('Type', typeBadge)}
            ${labeledTd('User ID', `<span class="mono">${truncEsc(d.userId, 14)}</span>`)}
            ${labeledTd('Transfer Ref', `<span class="mono" style="font-size:12px">${truncEsc(d.transferReference, 20)}</span>`)}
            ${labeledTd('Sent', `<strong>${sym}${fmt(d.ngnAmountSent)}</strong>`)}
            ${labeledTd('Expected Credit', `${sym}${fmt(d.expectedNgnCredit)}`)}
            ${labeledTd('Credited', d.creditedNgnAmount != null
              ? `<strong style="color:var(--green-text)">${sym}${fmt(d.creditedNgnAmount)}</strong>` : '—')}
            ${labeledTd('Sender Name', esc(d.senderAccountName) || '—')}
            ${labeledTd('Status', statusBadge(d.status))}
            ${labeledTd('Actions', `<div class="btn-row">
              <button class="btn-ghost btn-sm" onclick="viewBankDeposit('${esc(d.id)}')">View</button>
              ${d.status === 'PENDING' ? `
                <button class="btn-success btn-sm" onclick="openApproveBankDeposit('${esc(d.id)}',${Number(d.expectedNgnCredit) || 0},${Number(d.ngnAmountSent) || 0})">Approve</button>
                <button class="btn-danger btn-sm" onclick="openRejectBankDeposit('${esc(d.id)}')">Reject</button>` : ''}
            </div>`)}
          </tr>`;
        }).join('')}</tbody>
      </table></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;flex-wrap:wrap;gap:8px">
        <span class="pager-info">${fmtInt(data.totalElements)} total</span>
        ${paginator(bankDepositPage, data.totalPages, 'renderBankDeposits')}
      </div>` : empty(emptyMsgs[bankDepositTab] || 'No records found.', 'account_balance');
  } catch (e) {
    document.getElementById('bank-deposit-list').innerHTML = errorBox(e.message);
  }
}

async function viewBankDeposit(id) {
  openModal('Deposit Detail', loading());
  try {
    const d = await api(`/api/admin/bank-deposits/${id}`);
    const sym = depositSymbol(d.ngnAmountSent);
    const typeBadge = isMomo(d.ngnAmountSent)
      ? `<span class="badge badge-green">📱 MoMo Deposit (₵ GHS)</span>`
      : `<span class="badge badge-blue">🏦 Bank Transfer (₦ NGN)</span>`;

    setModalContent(`
      <div class="section-title">Deposit Info</div>
      <div class="detail-grid">
        ${detailRow('ID', `<span class="mono">${esc(d.id)}</span>`)}
        ${detailRow('Type', typeBadge)}
        ${detailRow('Status', statusBadge(d.status))}
        ${detailRow('Transfer Reference', `<span class="mono">${esc(d.transferReference) || '—'}</span>`)}
        ${detailRow('Amount Sent', `${sym}${fmt(d.ngnAmountSent)}`)}
        ${detailRow('Expected Credit', `${sym}${fmt(d.expectedNgnCredit)}`)}
        ${detailRow('Credited Amount', d.creditedNgnAmount != null
          ? `<strong style="color:var(--green-text)">${sym}${fmt(d.creditedNgnAmount)}</strong>` : '—')}
        ${detailRow('Sender Account Name', esc(d.senderAccountName) || '—')}
        ${detailRow('User Note', esc(d.userNote) || '—')}
        ${detailRow('Admin Note', esc(d.adminNote) || '—')}
        ${detailRow('Reviewed By', d.reviewedBy ? `<span class="mono">${esc(d.reviewedBy)}</span>` : '—')}
        ${detailRow('Reviewed At', fmtDate(d.reviewedAt))}
        ${detailRow('Wallet Tx ID', d.walletTransactionId ? `<span class="mono">${esc(d.walletTransactionId)}</span>` : '—')}
        ${detailRow('User ID', `<span class="mono">${esc(d.userId)}</span>`)}
        ${detailRow('Created', fmtDate(d.createdAt))}
        ${detailRow('Updated', fmtDate(d.updatedAt))}
      </div>

      ${d.screenshotUrl ? `
        <div class="section-title">Payment Screenshot / Proof</div>
        <div style="text-align:center;margin-bottom:10px">
          <img class="screenshot-img" src="${encodeURI(d.screenshotUrl)}"
               onclick="window.open('${encodeURI(d.screenshotUrl)}','_blank')"
               alt="Payment proof" style="max-width:100%;border-radius:8px;cursor:zoom-in">
          <div style="font-size:11px;color:var(--text-dim);margin-top:4px">Tap the image to open full size</div>
        </div>` : `
        <div class="alert alert-warning" style="margin-top:12px">${ic('warning', 'ms-sm')} No screenshot was provided.</div>`}

      <div class="modal-footer">
        ${d.status === 'PENDING' ? `
          <button class="btn-success"
            onclick="closeModal();openApproveBankDeposit('${esc(d.id)}',${Number(d.expectedNgnCredit) || 0},${Number(d.ngnAmountSent) || 0})">Approve</button>
          <button class="btn-danger" onclick="closeModal();openRejectBankDeposit('${esc(d.id)}')">Reject</button>` : ''}
        <button class="btn-ghost" onclick="closeModal()">Close</button>
      </div>`);
  } catch (e) {
    setModalContent(errorBox(e.message));
  }
}

function openApproveBankDeposit(id, expectedNgn, ngnAmountSent) {
  const basis = ngnAmountSent != null ? ngnAmountSent : expectedNgn;
  const sym = depositSymbol(basis);
  const isMomoTx = isMomo(basis);
  openModal(`Approve ${isMomoTx ? 'MoMo' : 'Bank Transfer'} Deposit`, `
    <div class="alert alert-info" style="margin-bottom:14px">
      ${ic('info', 'ms-sm')} The wallet is credited immediately on approval.
      ${isMomoTx ? 'Check the MoMo reference and screenshot first.' : 'Check the transfer reference and screenshot first.'}
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label>Amount to Credit * <span style="color:var(--text-dim);font-size:12px">
        (adjust if the received amount differs)</span></label>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:18px;font-weight:600">${sym}</span>
        <input id="bd-appr-amt" type="number" step="0.01" min="0.01" value="${Number(expectedNgn) || 0}" style="flex:1">
      </div>
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label>Admin Note (optional)</label>
      <textarea id="bd-appr-note" placeholder="${isMomoTx ? 'MoMo transaction confirmed. Ref matches.' : 'Confirmed against bank statement. Ref matches.'}"></textarea>
    </div>
    <div id="bd-appr-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-success" id="bd-appr-btn"
        onclick="approveBankDeposit('${esc(id)}','${sym}')">Approve &amp; Credit</button>
    </div>`);
}

async function approveBankDeposit(id, sym) {
  const creditedNgnAmount = parseFloat(document.getElementById('bd-appr-amt').value);
  const adminNote = document.getElementById('bd-appr-note').value.trim();
  if (!creditedNgnAmount || creditedNgnAmount <= 0) {
    document.getElementById('bd-appr-msg').innerHTML = errorBox('Enter a valid amount to credit.');
    return;
  }
  const btn = document.getElementById('bd-appr-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Approving…';
  try {
    await api(`/api/admin/bank-deposits/${id}/approve`, 'POST', { creditedNgnAmount, adminNote });
    closeModal();
    showAlert(`Approved. ${sym || '₦'}${fmt(creditedNgnAmount)} credited to the user's wallet.`, 'success');
    renderBankDeposits(bankDepositPage);
  } catch (e) {
    document.getElementById('bd-appr-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = 'Approve &amp; Credit';
  }
}

function openRejectBankDeposit(id) {
  openModal('Reject Deposit', `
    <div class="alert alert-warning" style="margin-bottom:14px">
      ${ic('warning', 'ms-sm')} The wallet will <strong>not</strong> be credited. Your note is stored on the record.
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label>Rejection Reason * (max 1000 chars)</label>
      <textarea id="bd-rej-note" maxlength="1000"
        placeholder="Reference not found on our statement after 48h. Re-submit with the correct reference."></textarea>
    </div>
    <div id="bd-rej-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-danger" id="bd-rej-btn" onclick="rejectBankDeposit('${esc(id)}')">Reject</button>
    </div>`);
}

async function rejectBankDeposit(id) {
  const adminNote = document.getElementById('bd-rej-note').value.trim();
  if (!adminNote) {
    document.getElementById('bd-rej-msg').innerHTML = errorBox('A rejection reason is required.');
    return;
  }
  const btn = document.getElementById('bd-rej-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Rejecting…';
  try {
    await api(`/api/admin/bank-deposits/${id}/reject`, 'POST', { adminNote });
    closeModal();
    showAlert('Deposit rejected.', 'success');
    renderBankDeposits(bankDepositPage);
  } catch (e) {
    document.getElementById('bd-rej-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = 'Reject';
  }
}

async function exportBankDepositsCSV() {
  const btn = document.querySelector('[onclick="exportBankDepositsCSV()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Exporting…'; }
  try {
    let rows = [], p = 0, total = 1;
    while (p < total) {
      const isPendingTab = bankDepositTab === 'pending';
      const ep = isPendingTab
        ? `/api/admin/bank-deposits/pending?page=${p}&size=100&sort=createdAt,desc`
        : `/api/admin/bank-deposits?page=${p}&size=100&sort=createdAt,desc`;
      const d = await api(ep);
      rows = rows.concat(d.content || []);
      total = d.totalPages || 1;
      p++;
    }
    if (!rows.length) { showAlert('Nothing to export.', 'warning'); return; }

    rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (bankDepositTab === 'momo') rows = rows.filter(d => isMomo(d.ngnAmountSent));
    else if (bankDepositTab === 'bank') rows = rows.filter(d => !isMomo(d.ngnAmountSent));

    exportCSV(`bank-momo-deposits-${bankDepositTab}-${new Date().toISOString().slice(0, 10)}.csv`,
      ['ID', 'Type', 'User ID', 'Transfer Reference', 'Amount Sent', 'Currency',
        'Expected Credit', 'Credited Amount', 'Sender Account Name', 'Status',
        'User Note', 'Admin Note', 'Reviewed By', 'Reviewed At', 'Wallet Tx ID',
        'Created At', 'Updated At'],
      rows.map(d => [d.id, depositLabel(d.ngnAmountSent), d.userId, d.transferReference,
        d.ngnAmountSent, depositCurrency(d.ngnAmountSent), d.expectedNgnCredit,
        d.creditedNgnAmount ?? '', d.senderAccountName ?? '', d.status,
        d.userNote ?? '', d.adminNote ?? '', d.reviewedBy ?? '', d.reviewedAt ?? '',
        d.walletTransactionId ?? '', d.createdAt, d.updatedAt ?? '']));
    showAlert(`Exported ${rows.length} rows.`, 'success');
  } catch (e) {
    showAlert('Export failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `${ic('download', 'ms-sm')} Export CSV`; }
  }
}

// ============================================================
// 7. UPGRADE CHATS
// ============================================================
let chatTab = 'all';

async function renderUpgradeChats() {
  const c = document.getElementById('page-content');
  c.innerHTML = `
    <div class="card">
      <div class="card-header"><h2>Admin Upgrade Chats</h2></div>
      <div class="card-body">
        <div class="tabs">
          <button class="tab ${chatTab === 'all' ? 'active' : ''}"
            onclick="chatTab='all';renderUpgradeChats()">All Chats</button>
          <button class="tab ${chatTab === 'pending' ? 'active' : ''}"
            onclick="chatTab='pending';renderUpgradeChats()">${ic('hourglass_top', 'ms-sm')} Pending Commission</button>
        </div>
        <div id="chats-list">${loading()}</div>
      </div>
    </div>`;
  try {
    const ep = chatTab === 'pending'
      ? '/api/super-admin/upgrade-chats/pending'
      : '/api/super-admin/upgrade-chats';
    const data = await api(ep);
    const list = Array.isArray(data) ? data : (data.content || []);

    document.getElementById('chats-list').innerHTML = list.length ? `
      <div class="tbl-wrap"><table>
        <thead><tr><th>Chat ID</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody>${list.map(ch => `<tr>
          ${labeledTd('Chat ID', `<span class="mono">${truncEsc(ch.id, 32)}</span>`)}
          ${labeledTd('Status', statusBadge(ch.status))}
          ${labeledTd('Created', `<span class="mono">${fmtDate(ch.createdAt)}</span>`)}
          ${labeledTd('Actions', `<div class="btn-row">
            <button class="btn-ghost btn-sm" onclick="openChat('${esc(ch.id)}','${esc(ch.status)}')">Open Chat</button>
            ${ch.status === 'PENDING_COMMISSION'
              ? `<button class="btn-primary btn-sm" onclick="openSetCommission('${esc(ch.id)}')">Set Commission</button>`
              : ''}
          </div>`)}
        </tr>`).join('')}</tbody>
      </table></div>` : empty('No upgrade chats here.', 'forum');
  } catch (e) {
    document.getElementById('chats-list').innerHTML = errorBox(e.message);
  }
}

async function openChat(chatId, status) {
  openModal('Upgrade Chat', loading());
  try {
    const msgs = await api(`/api/super-admin/upgrade-chats/${chatId}/messages`);
    const list = Array.isArray(msgs) ? msgs : (msgs.content || []);

    setModalContent(`
      ${status === 'PENDING_COMMISSION' ? `
        <div class="alert alert-warning" style="margin-bottom:14px">
          ${ic('warning', 'ms-sm')} This chat is awaiting a commission rate.
          <button class="btn-primary btn-sm" style="margin-left:10px"
            onclick="closeModal();openSetCommission('${esc(chatId)}')">Set Commission</button>
        </div>` : ''}
      <div class="chat-messages" id="chat-msgs">
        ${list.length ? list.map(m => `
          <div class="msg ${esc((m.senderRole || 'system').toLowerCase())}">
            <div>${esc(m.content)}</div>
            <div class="msg-meta">${esc(m.senderRole)} · ${fmtDate(m.sentAt)}</div>
          </div>`).join('')
        : '<div style="text-align:center;color:var(--text-dim);padding:24px">No messages yet.</div>'}
      </div>
      <div class="form-group" style="margin-bottom:10px">
        <label>Reply as Super Admin (max 2000 chars)</label>
        <textarea id="chat-reply" maxlength="2000" placeholder="Type your message…"></textarea>
      </div>
      <div id="chat-alert"></div>
      <div class="modal-footer">
        <button class="btn-ghost" onclick="closeModal()">Close</button>
        <button class="btn-primary" id="chat-send-btn"
          onclick="sendChatMessage('${esc(chatId)}','${esc(status)}')">Send Message</button>
      </div>`);

    const box = document.getElementById('chat-msgs');
    if (box) box.scrollTop = box.scrollHeight;
  } catch (e) {
    setModalContent(errorBox(e.message));
  }
}

async function sendChatMessage(chatId, status) {
  const content = document.getElementById('chat-reply').value.trim();
  if (!content) {
    document.getElementById('chat-alert').innerHTML = errorBox("Message can't be empty.");
    return;
  }
  const btn = document.getElementById('chat-send-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Sending…';
  try {
    await api(`/api/super-admin/upgrade-chats/${chatId}/messages`, 'POST', { content });
    openChat(chatId, status);
  } catch (e) {
    document.getElementById('chat-alert').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = 'Send Message';
  }
}

function openSetCommission(chatId) {
  openModal('Set Commission Rate', `
    <p style="margin-bottom:16px">
      Finish admin onboarding by setting the referral commission percentage.
      Valid range: <strong>0.1 – 100.0</strong>.
      Status becomes <span class="badge badge-green">COMMISSION_SET</span>.
    </p>
    <div class="form-group" style="margin-bottom:12px">
      <label>Commission Rate (%)</label>
      <input id="comm-rate" type="number" step="0.1" min="0.1" max="100" placeholder="55.0">
    </div>
    <div id="comm-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" id="comm-btn" onclick="setCommission('${esc(chatId)}')">Save Rate</button>
    </div>`);
}

async function setCommission(chatId) {
  const commissionRate = parseFloat(document.getElementById('comm-rate').value);
  if (!commissionRate || commissionRate < 0.1 || commissionRate > 100) {
    document.getElementById('comm-msg').innerHTML = errorBox('Enter a value between 0.1 and 100.');
    return;
  }
  const btn = document.getElementById('comm-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Saving…';
  try {
    await api(`/api/super-admin/upgrade-chats/${chatId}/set-commission`, 'POST', { commissionRate });
    closeModal();
    showAlert(`Commission set to ${commissionRate}%.`, 'success');
    renderUpgradeChats();
  } catch (e) {
    document.getElementById('comm-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = 'Save Rate';
  }
}

// ============================================================
// 8. AFFILIATE WITHDRAWALS / PAYOUTS
// ============================================================
let affPage = 0, affStatus = '';

async function renderAffiliateWithdrawals(page = 0) {
  affPage = page;
  const c = document.getElementById('page-content');
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>Affiliate Payouts</h2>
        <button class="btn-ghost btn-sm" onclick="exportAffWithdrawalsCSV()">${ic('download', 'ms-sm')} Export CSV</button>
      </div>
      <div class="card-body">
        <div class="form-row" style="margin-bottom:16px">
          <div class="form-group">
            <label>Status</label>
            <select onchange="affStatus=this.value;renderAffiliateWithdrawals(0)">
              <option value=""          ${affStatus === '' ? 'selected' : ''}>All statuses</option>
              <option value="PENDING"   ${affStatus === 'PENDING' ? 'selected' : ''}>PENDING</option>
              <option value="PROCESSED" ${affStatus === 'PROCESSED' ? 'selected' : ''}>PROCESSED</option>
              <option value="REJECTED"  ${affStatus === 'REJECTED' ? 'selected' : ''}>REJECTED</option>
            </select>
          </div>
        </div>
        <div id="aff-list">${loading()}</div>
      </div>
    </div>`;

  try {
    let q = `?page=${affPage}&size=20`;
    if (affStatus) q += `&status=${encodeURIComponent(affStatus)}`;
    const data = await api(`/api/super-admin/affiliate-withdrawals${q}`);
    const list = data.content || [];

    document.getElementById('aff-list').innerHTML = list.length ? `
      <div class="tbl-wrap"><table>
        <thead><tr>
          <th>ID</th><th>User ID</th><th>Amount</th><th>Reference</th>
          <th>Status</th><th>Requested</th><th>Processed At</th><th>Reject Reason</th><th>Actions</th>
        </tr></thead>
        <tbody>${list.map(w => `<tr>
          ${labeledTd('ID', `<span class="mono">${truncEsc(w.id, 16)}</span>`)}
          ${labeledTd('User ID', `<span class="mono">${truncEsc(w.userId, 14)}</span>`)}
          ${labeledTd('Amount', `<strong>₵${fmt(w.amount)}</strong>`)}
          ${labeledTd('Reference', `<span class="mono">${esc(w.reference) || '—'}</span>`)}
          ${labeledTd('Status', statusBadge(w.status))}
          ${labeledTd('Requested', `<span class="mono">${fmtDate(w.requestedAt || w.createdAt)}</span>`)}
          ${labeledTd('Processed At', `<span class="mono">${fmtDate(w.processedAt)}</span>`)}
          ${labeledTd('Reject Reason', esc(w.rejectReason) || '—')}
          ${labeledTd('Actions', w.status === 'PENDING' ? `<div class="btn-row">
            <button class="btn-success btn-sm" onclick="processAffWithdrawal('${esc(w.id)}')">Mark Processed</button>
            <button class="btn-danger btn-sm" onclick="openRejectAffWithdrawal('${esc(w.id)}')">Reject</button>
          </div>` : '—')}
        </tr>`).join('')}</tbody>
      </table></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;flex-wrap:wrap;gap:8px">
        <span class="pager-info">${fmtInt(data.totalElements)} total</span>
        ${paginator(affPage, data.totalPages, 'renderAffiliateWithdrawals')}
      </div>` : empty('No affiliate payouts here.', 'handshake');
  } catch (e) {
    document.getElementById('aff-list').innerHTML = errorBox(e.message);
  }
}

async function processAffWithdrawal(id) {
  if (!confirm('Mark this payout as PROCESSED? This records the payment as completed.')) return;
  try {
    await api(`/api/super-admin/affiliate-withdrawals/${id}/process`, 'POST');
    showAlert('Payout marked as processed.', 'success');
    renderAffiliateWithdrawals(affPage);
  } catch (e) {
    showAlert('Error: ' + e.message, 'error');
  }
}

function openRejectAffWithdrawal(id) {
  openModal('Reject Payout', `
    <div class="alert alert-warning">${ic('warning', 'ms-sm')} Rejecting re-credits the user's affiliate wallet.</div>
    <div class="form-group" style="margin-bottom:12px;margin-top:4px">
      <label>Reason *</label>
      <textarea id="aff-rej-reason" placeholder="Bank account details don't match…"></textarea>
    </div>
    <div id="aff-rej-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-danger" id="aff-rej-btn"
        onclick="rejectAffWithdrawal('${esc(id)}')">Reject &amp; Re-credit</button>
    </div>`);
}

async function rejectAffWithdrawal(id) {
  const reason = document.getElementById('aff-rej-reason').value.trim();
  if (!reason) {
    document.getElementById('aff-rej-msg').innerHTML = errorBox('A reason is required.');
    return;
  }
  const btn = document.getElementById('aff-rej-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Rejecting…';
  try {
    await api(`/api/super-admin/affiliate-withdrawals/${id}/reject`, 'POST', { reason });
    closeModal();
    showAlert('Payout rejected. Wallet re-credited.', 'success');
    renderAffiliateWithdrawals(affPage);
  } catch (e) {
    document.getElementById('aff-rej-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = 'Reject &amp; Re-credit';
  }
}

async function exportAffWithdrawalsCSV() {
  const btn = document.querySelector('[onclick="exportAffWithdrawalsCSV()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Exporting…'; }
  try {
    let rows = [], p = 0, total = 1;
    while (p < total) {
      let q = `?page=${p}&size=100`;
      if (affStatus) q += `&status=${encodeURIComponent(affStatus)}`;
      const d = await api(`/api/super-admin/affiliate-withdrawals${q}`);
      rows = rows.concat(d.content || []);
      total = d.totalPages || 1;
      p++;
    }
    if (!rows.length) { showAlert('Nothing to export.', 'warning'); return; }
    exportCSV(`affiliate-payouts-${new Date().toISOString().slice(0, 10)}.csv`,
      ['ID', 'User ID', 'Amount (GHS)', 'Reference', 'Status', 'Requested At', 'Processed At', 'Reject Reason'],
      rows.map(w => [w.id, w.userId, w.amount, w.reference, w.status,
        w.requestedAt || w.createdAt, w.processedAt ?? '', w.rejectReason ?? '']));
    showAlert(`Exported ${rows.length} rows.`, 'success');
  } catch (e) {
    showAlert('Export failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `${ic('download', 'ms-sm')} Export CSV`; }
  }
}

// ============================================================
// 9. PAYOUT REQUESTS
// ============================================================
async function renderPayoutRequests() {
  const c = document.getElementById('page-content');
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>Admin Payout Requests</h2>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;color:var(--text-muted)">API returns REQUESTED only</span>
          <button class="btn-ghost btn-sm" onclick="renderPayoutRequests()">${ic('refresh', 'ms-sm')} Refresh</button>
        </div>
      </div>
      <div class="card-body"><div id="payout-list">${loading()}</div></div>
    </div>`;
  try {
    const data = await api('/api/super-admin/payout-requests');
    const list = Array.isArray(data) ? data : (data.content || []);

    document.getElementById('payout-list').innerHTML = list.length ? `
      <div class="tbl-wrap"><table>
        <thead><tr><th>ID</th><th>Amount</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
        <tbody>${list.map(p => `<tr>
          ${labeledTd('ID', `<span class="mono">${truncEsc(p.id, 22)}</span>`)}
          ${labeledTd('Amount', `<strong>₵${fmt(p.amount)}</strong>`)}
          ${labeledTd('Status', statusBadge(p.status))}
          ${labeledTd('Created', `<span class="mono">${fmtDate(p.createdAt)}</span>`)}
          ${labeledTd('Actions', `<div class="btn-row">
            ${p.status === 'REQUESTED' ? `
              <button class="btn-success btn-sm" onclick="approvePayoutReq('${esc(p.id)}')">Approve</button>
              <button class="btn-danger btn-sm" onclick="openRejectPayoutReq('${esc(p.id)}')">Reject</button>` : ''}
            ${p.status === 'APPROVED' ? `
              <button class="btn-primary btn-sm" onclick="markPayoutPaid('${esc(p.id)}')">Mark Paid</button>
              <button class="btn-danger btn-sm" onclick="openRejectPayoutReq('${esc(p.id)}')">Reject</button>` : ''}
          </div>`)}
        </tr>`).join('')}</tbody>
      </table></div>` : empty('No pending payout requests.', 'payments');
  } catch (e) {
    document.getElementById('payout-list').innerHTML = errorBox(e.message);
  }
}

async function approvePayoutReq(id) {
  if (!confirm('Approve this payout request? The wallet is debited later, when you mark it paid.')) return;
  try {
    await api(`/api/super-admin/payout-requests/${id}/approve`, 'POST');
    showAlert('Payout approved. Use "Mark Paid" to debit the wallet once payment is sent.', 'success', 6000);
    renderPayoutRequests();
  } catch (e) {
    showAlert('Error: ' + e.message, 'error');
  }
}

async function markPayoutPaid(id) {
  if (!confirm("Mark as paid? This immediately debits the admin's affiliate wallet.")) return;
  try {
    await api(`/api/super-admin/payout-requests/${id}/mark-paid`, 'POST');
    showAlert('Payout marked as paid. Affiliate wallet debited.', 'success');
    renderPayoutRequests();
  } catch (e) {
    showAlert('Error: ' + e.message, 'error');
  }
}

function openRejectPayoutReq(id) {
  openModal('Reject Payout Request', `
    <div class="form-group" style="margin-bottom:12px">
      <label>Rejection Reason *</label>
      <textarea id="pr-rej-reason" placeholder="Insufficient verification…"></textarea>
    </div>
    <div id="pr-rej-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-danger" id="pr-rej-btn" onclick="rejectPayoutReq('${esc(id)}')">Reject</button>
    </div>`);
}

async function rejectPayoutReq(id) {
  const reason = document.getElementById('pr-rej-reason').value.trim();
  if (!reason) {
    document.getElementById('pr-rej-msg').innerHTML = errorBox('A reason is required.');
    return;
  }
  const btn = document.getElementById('pr-rej-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Rejecting…';
  try {
    await api(`/api/super-admin/payout-requests/${id}/reject`, 'POST', { reason });
    closeModal();
    showAlert('Payout request rejected.', 'success');
    renderPayoutRequests();
  } catch (e) {
    document.getElementById('pr-rej-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = 'Reject';
  }
}

// ============================================================
// 10. AUDIT LOG
// ============================================================
let auditPage = 0;

async function renderAuditLog(page = 0) {
  auditPage = page;
  const c = document.getElementById('page-content');
  c.innerHTML = `
    <div class="card">
      <div class="card-header"><h2>Audit Log</h2></div>
      <div class="card-body"><div id="audit-list">${loading()}</div></div>
    </div>`;
  try {
    const data = await api(`/api/super-admin/audit-log?page=${auditPage}&size=50`);
    const list = data.content || [];

    document.getElementById('audit-list').innerHTML = list.length ? `
      <div class="tbl-wrap"><table>
        <thead><tr>
          <th>Date</th><th>Action</th><th>Resource</th>
          <th>Resource ID</th><th>Actor ID</th><th>Metadata</th>
        </tr></thead>
        <tbody>${list.map(a => `<tr>
          ${labeledTd('Date', `<span class="mono">${fmtDate(a.createdAt)}</span>`)}
          ${labeledTd('Action', `<span class="badge badge-blue">${esc(a.action) || '—'}</span>`)}
          ${labeledTd('Resource', esc(a.resource) || '—')}
          ${labeledTd('Resource ID', `<span class="mono">${truncEsc(a.resourceId, 20)}</span>`)}
          ${labeledTd('Actor ID', `<span class="mono">${truncEsc(a.actorId, 20)}</span>`)}
          ${labeledTd('Metadata', a.metadata
            ? `<span style="font-size:11px;color:var(--text-muted)">${esc(JSON.stringify(a.metadata))}</span>`
            : '—')}
        </tr>`).join('')}</tbody>
      </table></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;flex-wrap:wrap;gap:8px">
        <span class="pager-info">${fmtInt(data.totalElements)} total entries</span>
        ${paginator(auditPage, data.totalPages, 'renderAuditLog')}
      </div>` : empty('No audit entries yet.', 'fact_check');
  } catch (e) {
    document.getElementById('audit-list').innerHTML = errorBox(e.message);
  }
}

// ============================================================
// 11. WITHDRAWAL REQUESTS
// ============================================================
let wdPage = 0, wdStatus = '';

async function renderWithdrawals(page = 0) {
  wdPage = page;
  const c = document.getElementById('page-content');
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>Withdrawal Requests</h2>
        <div style="display:flex;gap:8px;align-items:center">
          <button class="btn-ghost btn-sm" onclick="exportWithdrawalsCSV()">${ic('download', 'ms-sm')} Export CSV</button>
          <button class="btn-ghost btn-sm" onclick="renderWithdrawals(${wdPage})">${ic('refresh', 'ms-sm')} Refresh</button>
        </div>
      </div>
      <div class="card-body">
        <div class="alert alert-info" style="margin-bottom:16px">
          ${ic('info', 'ms-sm')} <strong>Flow:</strong>
          User submits → wallet debited →
          <span class="badge badge-yellow">PENDING</span> → Approve →
          <span class="badge badge-green">APPROVED</span> → Settle once paid →
          <span class="badge badge-green">SETTLED</span>.
          Rejecting or marking failed at any stage <strong>re-credits</strong> the wallet.
        </div>
        <div class="form-row" style="margin-bottom:16px">
          <div class="form-group">
            <label>Status</label>
            <select onchange="wdStatus=this.value;renderWithdrawals(0)">
              <option value=""         ${wdStatus === '' ? 'selected' : ''}>All statuses</option>
              <option value="PENDING"  ${wdStatus === 'PENDING' ? 'selected' : ''}>PENDING</option>
              <option value="APPROVED" ${wdStatus === 'APPROVED' ? 'selected' : ''}>APPROVED</option>
              <option value="SETTLED"  ${wdStatus === 'SETTLED' ? 'selected' : ''}>SETTLED</option>
              <option value="REJECTED" ${wdStatus === 'REJECTED' ? 'selected' : ''}>REJECTED</option>
              <option value="FAILED"   ${wdStatus === 'FAILED' ? 'selected' : ''}>FAILED</option>
            </select>
          </div>
          <button class="btn-ghost" style="align-self:flex-end"
            onclick="wdStatus='';renderWithdrawals(0)">Clear</button>
        </div>
        <div id="wd-list">${loading()}</div>
      </div>
    </div>`;

  try {
    let q = `?page=${wdPage}&size=20`;
    if (wdStatus) q += `&status=${encodeURIComponent(wdStatus)}`;
    const data = await api(`/api/wallet/withdrawals/admin/all${q}`);
    const list = data.content || [];
    cacheRows('withdrawals', list);

    document.getElementById('wd-list').innerHTML = list.length ? `
      <div class="tbl-wrap"><table>
        <thead><tr>
          <th>Date</th><th>User</th><th>Amount</th><th>Method</th>
          <th>Account</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>${list.map(w => `<tr>
          ${labeledTd('Date', `<span class="mono">${fmtDate(w.createdAt)}</span>`)}
          ${labeledTd('User', w.user
            ? `<span style="font-size:12px">${esc(`${w.user.firstName || ''} ${w.user.lastName || ''}`.trim())}<br>
               <span class="mono" style="color:var(--text-dim)">${esc(w.user.email || '')}</span></span>`
            : `<span class="mono">${truncEsc(w.userId, 16)}</span>`)}
          ${labeledTd('Amount', `<strong style="color:var(--red-text)">₵${fmt(w.amount)}</strong>`)}
          ${labeledTd('Method', `<span class="badge badge-blue">${esc(w.method) || '—'}</span>${
            w.network ? `<span class="badge badge-gray" style="margin-left:4px">${esc(w.network)}</span>` : ''}`)}
          ${labeledTd('Account', `<span class="mono" style="font-size:12px">${esc(w.accountNumber) || '—'}<br>${esc(w.accountName) || ''}</span>`)}
          ${labeledTd('Status', statusBadge(w.status))}
          ${labeledTd('Actions', `<div class="btn-row">
            <button class="btn-ghost btn-sm" onclick="viewWithdrawal('${esc(w.id)}')">Detail</button>
            ${w.status === 'PENDING' ? `
              <button class="btn-success btn-sm" onclick="approveWithdrawal('${esc(w.id)}')">Approve</button>
              <button class="btn-danger btn-sm" onclick="openRejectWithdrawal('${esc(w.id)}')">Reject</button>` : ''}
            ${w.status === 'APPROVED' ? `
              <button class="btn-primary btn-sm" onclick="openSettleWithdrawal('${esc(w.id)}',${Number(w.amount) || 0})">Settle</button>
              <button class="btn-danger btn-sm" onclick="openFailWithdrawal('${esc(w.id)}')">Mark Failed</button>` : ''}
          </div>`)}
        </tr>`).join('')}</tbody>
      </table></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;flex-wrap:wrap;gap:8px">
        <span class="pager-info">${fmtInt(data.totalElements)} total withdrawal requests</span>
        ${paginator(wdPage, data.totalPages, 'renderWithdrawals')}
      </div>` : empty('No withdrawal requests here.', 'account_balance_wallet');
  } catch (e) {
    document.getElementById('wd-list').innerHTML = errorBox(e.message);
  }
}

function viewWithdrawal(id) {
  const w = rowCache.withdrawals[id];
  if (!w) { showAlert('That row is no longer loaded — refresh the page.', 'error'); return; }
  const user = w.user || {};

  openModal('Withdrawal Request Detail', `
    <div class="section-title">Request</div>
    <div class="detail-grid">
      ${detailRow('ID', `<span class="mono">${esc(w.id)}</span>`)}
      ${detailRow('Status', statusBadge(w.status))}
      ${detailRow('Amount', `<strong>₵${fmt(w.amount)}</strong>`)}
      ${detailRow('Currency', esc(w.currency || 'GHS'))}
      ${detailRow('Method', esc(w.method) || '—')}
      ${detailRow('Network', esc(w.network) || '—')}
      ${detailRow('Account Number', esc(w.accountNumber) || '—')}
      ${detailRow('Account Name', esc(w.accountName) || '—')}
      ${detailRow('Submitted', fmtDate(w.createdAt))}
      ${detailRow('Reviewed At', fmtDate(w.reviewedAt))}
      ${detailRow('Settled At', fmtDate(w.settledAt))}
      ${detailRow('Admin Note', esc(w.adminNote) || '—')}
      ${detailRow('Super Admin Note', esc(w.superAdminNote) || '—')}
    </div>
    ${w.user ? `
      <div class="section-title">User</div>
      <div class="detail-grid">
        ${detailRow('Name', esc(`${user.firstName || ''} ${user.lastName || ''}`.trim()))}
        ${detailRow('Email', esc(user.email) || '—')}
        ${detailRow('ID', `<span class="mono">${esc(user.id || w.userId)}</span>`)}
      </div>` : ''}
    <div class="modal-footer">
      ${w.status === 'PENDING' ? `
        <button class="btn-success" onclick="closeModal();approveWithdrawal('${esc(w.id)}')">Approve</button>
        <button class="btn-danger" onclick="closeModal();openRejectWithdrawal('${esc(w.id)}')">Reject</button>` : ''}
      ${w.status === 'APPROVED' ? `
        <button class="btn-primary" onclick="closeModal();openSettleWithdrawal('${esc(w.id)}',${Number(w.amount) || 0})">Settle</button>
        <button class="btn-danger" onclick="closeModal();openFailWithdrawal('${esc(w.id)}')">Mark Failed</button>` : ''}
      <button class="btn-ghost" onclick="closeModal()">Close</button>
    </div>`);
}

async function approveWithdrawal(id) {
  if (!confirm('Approve this withdrawal?\n\nThe wallet is already debited — this moves it to APPROVED for settlement.')) return;
  try {
    await api(`/api/wallet/withdrawals/admin/${id}/approve`, 'POST', { note: '' });
    showAlert('Withdrawal approved. Settle it once payment is sent.', 'success', 6000);
    renderWithdrawals(wdPage);
  } catch (e) {
    showAlert('Error: ' + e.message, 'error');
  }
}

function openRejectWithdrawal(id) {
  openModal('Reject Withdrawal', `
    <div class="alert alert-warning">${ic('warning', 'ms-sm')} Rejecting <strong>re-credits</strong> the full amount to the user's wallet.</div>
    <div class="form-group" style="margin-bottom:12px;margin-top:12px">
      <label>Rejection Note * (visible to the admin)</label>
      <textarea id="wd-rej-note" placeholder="Couldn't verify account details…"></textarea>
    </div>
    <div id="wd-rej-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-danger" id="wd-rej-btn"
        onclick="rejectWithdrawal('${esc(id)}')">Reject &amp; Re-credit</button>
    </div>`);
}

async function rejectWithdrawal(id) {
  const note = document.getElementById('wd-rej-note').value.trim();
  if (!note) {
    document.getElementById('wd-rej-msg').innerHTML = errorBox('A rejection note is required.');
    return;
  }
  const btn = document.getElementById('wd-rej-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Rejecting…';
  try {
    await api(`/api/wallet/withdrawals/admin/${id}/reject`, 'POST', { note });
    closeModal();
    showAlert('Withdrawal rejected. Wallet re-credited.', 'success');
    renderWithdrawals(wdPage);
  } catch (e) {
    document.getElementById('wd-rej-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = 'Reject &amp; Re-credit';
  }
}

function openSettleWithdrawal(id, amount) {
  openModal('Settle Withdrawal', `
    <div class="alert alert-info">${ic('info', 'ms-sm')} Settling confirms you've
      <strong>sent ₵${fmt(amount)}</strong> to the user. The WITHDRAW_HOLD becomes a WITHDRAW.</div>
    <div class="form-group" style="margin-bottom:12px;margin-top:12px">
      <label>Super Admin Note (optional)</label>
      <textarea id="wd-settle-note" placeholder="Sent via MTN Mobile Money. Ref: XXXXXXXX"></textarea>
    </div>
    <div id="wd-settle-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-success" id="wd-settle-btn"
        onclick="settleWithdrawal('${esc(id)}')">Confirm Settlement</button>
    </div>`);
}

async function settleWithdrawal(id) {
  const note = document.getElementById('wd-settle-note').value.trim();
  const btn = document.getElementById('wd-settle-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Settling…';
  try {
    await api(`/api/wallet/withdrawals/super-admin/${id}/settle`, 'POST', { note });
    closeModal();
    showAlert('Withdrawal settled. Payment confirmed.', 'success');
    renderWithdrawals(wdPage);
  } catch (e) {
    document.getElementById('wd-settle-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = 'Confirm Settlement';
  }
}

function openFailWithdrawal(id) {
  openModal('Mark Withdrawal Failed', `
    <div class="alert alert-warning">${ic('warning', 'ms-sm')} Marking as failed <strong>re-credits</strong> the full amount to the user's wallet.</div>
    <div class="form-group" style="margin-bottom:12px;margin-top:12px">
      <label>Failure Reason * (visible in the super admin log)</label>
      <textarea id="wd-fail-note" placeholder="Mobile Money transaction declined by the provider…"></textarea>
    </div>
    <div id="wd-fail-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-danger" id="wd-fail-btn"
        onclick="failWithdrawal('${esc(id)}')">Mark Failed &amp; Re-credit</button>
    </div>`);
}

async function failWithdrawal(id) {
  const note = document.getElementById('wd-fail-note').value.trim();
  if (!note) {
    document.getElementById('wd-fail-msg').innerHTML = errorBox('A failure reason is required.');
    return;
  }
  const btn = document.getElementById('wd-fail-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Processing…';
  try {
    await api(`/api/wallet/withdrawals/super-admin/${id}/mark-failed`, 'POST', { note });
    closeModal();
    showAlert('Withdrawal marked as failed. Wallet re-credited.', 'success');
    renderWithdrawals(wdPage);
  } catch (e) {
    document.getElementById('wd-fail-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = 'Mark Failed &amp; Re-credit';
  }
}

async function exportWithdrawalsCSV() {
  const btn = document.querySelector('[onclick="exportWithdrawalsCSV()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Exporting…'; }
  try {
    let rows = [], p = 0, total = 1;
    while (p < total) {
      let q = `?page=${p}&size=100`;
      if (wdStatus) q += `&status=${encodeURIComponent(wdStatus)}`;
      const d = await api(`/api/wallet/withdrawals/admin/all${q}`);
      rows = rows.concat(d.content || []);
      total = d.totalPages || 1;
      p++;
    }
    if (!rows.length) { showAlert('Nothing to export.', 'warning'); return; }
    exportCSV(`withdrawals-${new Date().toISOString().slice(0, 10)}.csv`,
      ['ID', 'User Email', 'User ID', 'Amount (GHS)', 'Currency', 'Method', 'Network',
        'Account Number', 'Account Name', 'Status', 'Admin Note', 'Super Admin Note',
        'Reviewed At', 'Settled At', 'Created At'],
      rows.map(w => [w.id, w.user?.email ?? '', w.user?.id ?? w.userId ?? '',
        w.amount, w.currency || 'GHS', w.method || '', w.network || '',
        w.accountNumber || '', w.accountName || '', w.status,
        w.adminNote || '', w.superAdminNote || '',
        w.reviewedAt ?? '', w.settledAt ?? '', w.createdAt]));
    showAlert(`Exported ${rows.length} rows.`, 'success');
  } catch (e) {
    showAlert('Export failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `${ic('download', 'ms-sm')} Export CSV`; }
  }
}

// ============================================================
// 12. USER DEPOSIT HISTORY
// ============================================================
let udPage = 0, udFilterUserId = '', udFilterUserEmail = '';

async function renderUserDeposits(page = 0) {
  udPage = page;
  const c = document.getElementById('page-content');
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>User Deposit History</h2>
        <button class="btn-ghost btn-sm" onclick="exportUserDepositsCSV()">${ic('download', 'ms-sm')} Export CSV</button>
      </div>
      <div class="card-body">
        <div class="alert alert-info" style="margin-bottom:16px">
          ${ic('info', 'ms-sm')} Enter a User ID to load their full deposit history, paginated from the server.
          Calls <code>GET /api/super-admin/users/{userId}/deposits</code>.
        </div>
        <div class="form-row" style="margin-bottom:16px">
          <div class="form-group" style="flex:1;min-width:260px">
            <label>User ID (UUID) *</label>
            <input id="ud-userid" type="text" placeholder="e.g. c9d0e1f2-…"
              value="${esc(udFilterUserId)}"
              oninput="udFilterUserId=this.value"
              onkeydown="if(event.key==='Enter')renderUserDeposits(0)">
          </div>
          <div class="form-group" style="flex:1;min-width:180px">
            <label>User Email (display only)</label>
            <input id="ud-email" type="text" placeholder="For reference…"
              value="${esc(udFilterUserEmail)}" oninput="udFilterUserEmail=this.value">
          </div>
          <div style="display:flex;gap:6px;align-self:flex-end">
            <button class="btn-primary" onclick="loadUserDepositsFromInputs()">Load Deposits</button>
            <button class="btn-ghost"
              onclick="udFilterUserId='';udFilterUserEmail='';renderUserDeposits(0)">Clear</button>
          </div>
        </div>
        <div id="ud-list">${udFilterUserId
          ? loading('Fetching deposits…')
          : empty('Enter a User ID above, then load their deposits.', 'receipt_long')}</div>
      </div>
    </div>`;

  if (!udFilterUserId) return;

  try {
    const data = await api(
      `/api/super-admin/users/${encodeURIComponent(udFilterUserId)}/deposits?page=${udPage}&size=25`);
    const list = data.content || [];

    if (!list.length && udPage === 0) {
      document.getElementById('ud-list').innerHTML = empty('No deposits for this user.', 'receipt_long');
      return;
    }

    const firstName = list[0]?.firstName || '';
    const lastName = list[0]?.lastName || '';
    const email = list[0]?.userEmail || udFilterUserEmail || '—';
    const userId = list[0]?.userId || udFilterUserId;
    const pageTotal = list.reduce((s, d) => s + (Number(d.amount) || 0), 0);
    const country = list[0]?.userCountry || 'UNKNOWN';

    document.getElementById('ud-list').innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
        <div style="background:var(--surface2,var(--surface-alt,#1e2433));border:1px solid var(--border);border-radius:12px;padding:12px 18px;display:flex;gap:26px;flex-wrap:wrap">
          <span><span style="color:var(--text-dim);font-size:11px;text-transform:uppercase;letter-spacing:.5px">User</span><br>
            <strong>${esc(`${firstName} ${lastName}`.trim())}</strong>
            <span style="color:var(--text-dim);font-size:12px;margin-left:6px">${esc(email)}</span></span>
          <span><span style="color:var(--text-dim);font-size:11px;text-transform:uppercase;letter-spacing:.5px">Country</span><br>
            ${countryBadge(country)}</span>
          <span><span style="color:var(--text-dim);font-size:11px;text-transform:uppercase;letter-spacing:.5px">Total Records</span><br>
            <strong>${fmtInt(data.totalElements)}</strong></span>
          <span><span style="color:var(--text-dim);font-size:11px;text-transform:uppercase;letter-spacing:.5px">Page Total</span><br>
            <strong style="color:var(--green-text)">${fmtByCountry(pageTotal, country)}</strong></span>
        </div>
        <button class="btn-ghost btn-sm" onclick="viewUser('${esc(userId)}')">View Full Profile</button>
        <button class="btn-success btn-sm"
          onclick="openAddFundsToUserModal('${esc(userId)}', '${esc(jsArg(`${firstName} ${lastName}`.trim() || 'this user'))}')">
          ${ic('add_card', 'ms-sm')} Add Funds
        </button>
      </div>
      <div class="tbl-wrap"><table>
        <thead><tr>
          <th>#</th><th>Date</th><th>Amount</th><th>Balance After</th>
          <th>Status</th><th>Provider Ref</th><th>Tx ID</th>
        </tr></thead>
        <tbody>${list.map((d, i) => `<tr>
          ${labeledTd('#', String(udPage * 25 + i + 1))}
          ${labeledTd('Date', `<span class="mono" style="font-size:12px">${fmtDate(d.createdAt)}</span>`)}
          ${labeledTd('Amount', `<strong style="color:var(--green-text)">${fmtByCountry(d.amount, d.userCountry || country)}</strong>`)}
          ${labeledTd('Balance After', fmtByCountry(d.balanceAfter, d.userCountry || country))}
          ${labeledTd('Status', statusBadge(d.status))}
          ${labeledTd('Provider Ref', `<span class="mono" style="font-size:11px">${truncEsc(d.providerRef, 24)}</span>`)}
          ${labeledTd('Tx ID', `<span class="mono" style="font-size:11px">${truncEsc(d.transactionId, 20)}</span>`)}
        </tr>`).join('')}</tbody>
      </table></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;flex-wrap:wrap;gap:8px">
        <span class="pager-info">${fmtInt(data.totalElements)} total deposits</span>
        ${paginator(udPage, data.totalPages, 'renderUserDeposits')}
      </div>`;
  } catch (e) {
    document.getElementById('ud-list').innerHTML = errorBox(e.message);
  }
}

function loadUserDepositsFromInputs() {
  udFilterUserId = document.getElementById('ud-userid').value.trim();
  udFilterUserEmail = document.getElementById('ud-email').value.trim();
  renderUserDeposits(0);
}

async function exportUserDepositsCSV() {
  if (!udFilterUserId) { showAlert('Enter a User ID first.', 'warning'); return; }
  const btn = document.querySelector('[onclick="exportUserDepositsCSV()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Exporting…'; }
  try {
    let rows = [], p = 0, total = 1;
    while (p < total) {
      const d = await api(
        `/api/super-admin/users/${encodeURIComponent(udFilterUserId)}/deposits?page=${p}&size=100`);
      rows = rows.concat(d.content || []);
      total = d.totalPages || 1;
      p++;
    }
    if (!rows.length) { showAlert('Nothing to export.', 'warning'); return; }
    const safeEmail = (rows[0]?.userEmail || udFilterUserId).replace(/[^a-z0-9]/gi, '_');
    exportCSV(`deposits-${safeEmail}-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Tx ID', 'Wallet ID', 'User ID', 'User Email', 'First Name', 'Last Name',
        'Country', 'Currency', 'Amount', 'Balance After',
        'Provider Ref', 'Status', 'Created At'],
      rows.map(d => [d.transactionId, d.walletId, d.userId, d.userEmail,
        d.firstName, d.lastName,
        d.userCountry || 'UNKNOWN', d.currency || countryCurrency(d.userCountry),
        d.amount, d.balanceAfter,
        d.providerRef || '', d.status, d.createdAt]));
    showAlert(`Exported ${rows.length} rows.`, 'success');
  } catch (e) {
    showAlert('Export failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `${ic('download', 'ms-sm')} Export CSV`; }
  }
}

// ============================================================
// 13. SIMPLE DEPOSITS (MoMo — phone/account submission flow)
// ============================================================
//   GET  /api/admin/simple-deposits
//   GET  /api/admin/simple-deposits/pending
//   GET  /api/admin/simple-deposits/{id}
//   POST /api/admin/simple-deposits/{id}/approve  { creditedAmount, adminNote }
//   POST /api/admin/simple-deposits/{id}/reject   { adminNote }
// ─────────────────────────────────────────────────────────────
let simpleDepositPage = 0, simpleDepositTab = 'pending';

async function renderSimpleDeposits(page = 0) {
  simpleDepositPage = page;
  const c = document.getElementById('page-content');
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>Simple Deposits (MoMo)</h2>
        <button class="btn-ghost btn-sm" onclick="exportSimpleDepositsCSV()">${ic('download', 'ms-sm')} Export CSV</button>
      </div>
      <div class="card-body">
        <div class="alert alert-info" style="margin-bottom:14px">
          ${ic('info', 'ms-sm')} Users submit amount, phone number, account name and network directly — no screenshot.
          Approving credits the wallet and attributes referral commission.
        </div>
        <div class="tabs">
          <button class="tab ${simpleDepositTab === 'pending' ? 'active' : ''}"
            onclick="simpleDepositTab='pending';renderSimpleDeposits(0)">${ic('hourglass_top', 'ms-sm')} Pending Review</button>
          <button class="tab ${simpleDepositTab === 'all' ? 'active' : ''}"
            onclick="simpleDepositTab='all';renderSimpleDeposits(0)">All Deposits</button>
        </div>
        <div id="simple-deposit-list">${loading()}</div>
      </div>
    </div>`;

  try {
    const isPendingTab = simpleDepositTab === 'pending';
    const ep = isPendingTab
      ? `/api/admin/simple-deposits/pending?page=${page}&size=20`
      : `/api/admin/simple-deposits?page=${page}&size=20`;

    const data = await api(ep);
    const list = data.content || [];

    document.getElementById('simple-deposit-list').innerHTML = list.length ? `
      <div class="tbl-wrap"><table>
        <thead><tr>
          <th>Date</th><th>Phone</th><th>Account Name</th><th>Network</th>
          <th>Purpose</th><th>Amount Claimed</th><th>Credited</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>${list.map(d => `<tr>
          ${labeledTd('Date', `<span class="mono" style="font-size:12px">${fmtDate(d.createdAt)}</span>`)}
          ${labeledTd('Phone', `<span class="mono">${esc(d.phoneNumber) || '—'}</span>`)}
          ${labeledTd('Account Name', esc(d.accountName) || '—')}
          ${labeledTd('Network', networkBadge(d.network))}
          ${labeledTd('Purpose', purposeBadge(d.purpose))}
          ${labeledTd('Amount Claimed', `<strong>₵${fmt(d.amount)}</strong>`)}
          ${labeledTd('Credited', d.creditedAmount != null
            ? `<strong style="color:var(--green-text)">₵${fmt(d.creditedAmount)}</strong>` : '—')}
          ${labeledTd('Status', statusBadge(d.status))}
          ${labeledTd('Actions', `<div class="btn-row">
            <button class="btn-ghost btn-sm" onclick="viewSimpleDeposit('${esc(d.id)}')">View</button>
            ${d.status === 'PENDING' ? `
              <button class="btn-success btn-sm" onclick="openApproveSimpleDeposit('${esc(d.id)}',${Number(d.amount) || 0})">Approve</button>
              <button class="btn-danger btn-sm" onclick="openRejectSimpleDeposit('${esc(d.id)}')">Reject</button>` : ''}
          </div>`)}
        </tr>`).join('')}</tbody>
      </table></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;flex-wrap:wrap;gap:8px">
        <span class="pager-info">${fmtInt(data.totalElements)} total</span>
        ${paginator(simpleDepositPage, data.totalPages, 'renderSimpleDeposits')}
      </div>` : empty(isPendingTab ? 'Nothing awaiting review.' : 'No simple deposits yet.', 'smartphone');
  } catch (e) {
    document.getElementById('simple-deposit-list').innerHTML = errorBox(e.message);
  }
}

async function viewSimpleDeposit(id) {
  openModal('Simple Deposit Detail', loading());
  try {
    const d = await api(`/api/admin/simple-deposits/${id}`);
    setModalContent(`
      <div class="section-title">Deposit Info</div>
      <div class="detail-grid">
        ${detailRow('ID', `<span class="mono">${esc(d.id)}</span>`)}
        ${detailRow('Status', statusBadge(d.status))}
        ${detailRow('Network', networkBadge(d.network))}
        ${detailRow('Purpose', purposeBadge(d.purpose))}
        ${detailRow('Phone Number', `<span class="mono">${esc(d.phoneNumber) || '—'}</span>`)}
        ${detailRow('Account Name', esc(d.accountName) || '—')}
        ${detailRow('Amount Claimed', `₵${fmt(d.amount)}`)}
        ${detailRow('Credited Amount', d.creditedAmount != null
          ? `<strong style="color:var(--green-text)">₵${fmt(d.creditedAmount)}</strong>` : '—')}
        ${detailRow('Admin Note', esc(d.adminNote) || '—')}
        ${detailRow('Reviewed By', d.reviewedBy ? `<span class="mono">${esc(d.reviewedBy)}</span>` : '—')}
        ${detailRow('Reviewed At', fmtDate(d.reviewedAt))}
        ${detailRow('Created', fmtDate(d.createdAt))}
      </div>
      <div class="modal-footer">
        ${d.status === 'PENDING' ? `
          <button class="btn-success"
            onclick="closeModal();openApproveSimpleDeposit('${esc(d.id)}',${Number(d.amount) || 0})">Approve</button>
          <button class="btn-danger"
            onclick="closeModal();openRejectSimpleDeposit('${esc(d.id)}')">Reject</button>` : ''}
        <button class="btn-ghost" onclick="closeModal()">Close</button>
      </div>`);
  } catch (e) {
    setModalContent(errorBox(e.message));
  }
}

function openApproveSimpleDeposit(id, claimedAmount) {
  openModal('Approve Simple Deposit', `
    <div class="alert alert-info" style="margin-bottom:14px">
      ${ic('info', 'ms-sm')} The wallet is credited immediately, and referral commission is attributed
      if this user was referred.
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label>Amount to Credit * <span style="color:var(--text-dim);font-size:12px">
        (adjust if it differs from the claimed amount)</span></label>
      <div style="display:flex;align-items:center;gap:8px">
        <span style="font-size:18px;font-weight:600">₵</span>
        <input id="sd-appr-amt" type="number" step="0.01" min="0.01" value="${Number(claimedAmount) || 0}" style="flex:1">
      </div>
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label>Admin Note (optional)</label>
      <textarea id="sd-appr-note" placeholder="MoMo transaction confirmed against the network statement."></textarea>
    </div>
    <div id="sd-appr-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-success" id="sd-appr-btn"
        onclick="approveSimpleDeposit('${esc(id)}')">Approve &amp; Credit</button>
    </div>`);
}

async function approveSimpleDeposit(id) {
  const creditedAmount = parseFloat(document.getElementById('sd-appr-amt').value);
  const adminNote = document.getElementById('sd-appr-note').value.trim();
  if (!creditedAmount || creditedAmount <= 0) {
    document.getElementById('sd-appr-msg').innerHTML = errorBox('Enter a valid amount to credit.');
    return;
  }
  const btn = document.getElementById('sd-appr-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Approving…';
  try {
    await api(`/api/admin/simple-deposits/${id}/approve`, 'POST', { creditedAmount, adminNote });
    closeModal();
    showAlert(`Approved. ₵${fmt(creditedAmount)} credited to the user's wallet.`, 'success');
    renderSimpleDeposits(simpleDepositPage);
  } catch (e) {
    document.getElementById('sd-appr-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = 'Approve &amp; Credit';
  }
}

function openRejectSimpleDeposit(id) {
  openModal('Reject Simple Deposit', `
    <div class="alert alert-warning" style="margin-bottom:14px">
      ${ic('warning', 'ms-sm')} The wallet will <strong>not</strong> be credited. Your note is stored on the record.
    </div>
    <div class="form-group" style="margin-bottom:12px">
      <label>Rejection Reason *</label>
      <textarea id="sd-rej-note" placeholder="Could not confirm the MoMo transaction from that number."></textarea>
    </div>
    <div id="sd-rej-msg"></div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-danger" id="sd-rej-btn"
        onclick="rejectSimpleDeposit('${esc(id)}')">Reject</button>
    </div>`);
}

async function rejectSimpleDeposit(id) {
  const adminNote = document.getElementById('sd-rej-note').value.trim();
  if (!adminNote) {
    document.getElementById('sd-rej-msg').innerHTML = errorBox('A rejection reason is required.');
    return;
  }
  const btn = document.getElementById('sd-rej-btn');
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Rejecting…';
  try {
    await api(`/api/admin/simple-deposits/${id}/reject`, 'POST', { adminNote });
    closeModal();
    showAlert('Deposit rejected.', 'success');
    renderSimpleDeposits(simpleDepositPage);
  } catch (e) {
    document.getElementById('sd-rej-msg').innerHTML = errorBox(e.message);
    btn.disabled = false; btn.innerHTML = 'Reject';
  }
}

async function exportSimpleDepositsCSV() {
  const btn = document.querySelector('[onclick="exportSimpleDepositsCSV()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Exporting…'; }
  try {
    let rows = [], p = 0, total = 1;
    while (p < total) {
      const isPendingTab = simpleDepositTab === 'pending';
      const ep = isPendingTab
        ? `/api/admin/simple-deposits/pending?page=${p}&size=100`
        : `/api/admin/simple-deposits?page=${p}&size=100`;
      const d = await api(ep);
      rows = rows.concat(d.content || []);
      total = d.totalPages || 1;
      p++;
    }
    if (!rows.length) { showAlert('Nothing to export.', 'warning'); return; }
    exportCSV(`simple-deposits-${simpleDepositTab}-${new Date().toISOString().slice(0, 10)}.csv`,
      ['ID', 'Phone Number', 'Account Name', 'Network', 'Purpose',
        'Amount Claimed', 'Credited Amount', 'Status', 'Admin Note',
        'Reviewed By', 'Reviewed At', 'Wallet Tx ID', 'Created At'],
      rows.map(d => [d.id, d.phoneNumber, d.accountName, d.network, d.purpose,
        d.amount, d.creditedAmount ?? '', d.status, d.adminNote ?? '',
        d.reviewedBy ?? '', d.reviewedAt ?? '', d.walletTransactionId ?? '', d.createdAt]));
    showAlert(`Exported ${rows.length} rows.`, 'success');
  } catch (e) {
    showAlert('Export failed: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `${ic('download', 'ms-sm')} Export CSV`; }
  }
}

// ============================================================
// 14. COMMISSION & DEPOSIT ANALYTICS — split by country
// ============================================================
//   GET /api/super-admin/commission/country-report/daily?days=N
//   GET /api/super-admin/commission/country-report/weekly?weeks=N
//
// Ghana deposits arrive as MoMo in cedis; Nigeria's are mostly bank transfers
// in naira. Two currencies, so GH and NG figures are shown side by side and
// are never added together — a combined "total" across both would be a
// meaningless number. Two independent toggles: country and admin.
// ─────────────────────────────────────────────────────────────
let analyticsPeriod = 'daily';   // 'daily' | 'weekly'
let analyticsDays = 30;
let analyticsWeeks = 12;
let analyticsCountry = '';       // '' = both, or 'GH' | 'NG' | 'OTHER' | 'UNKNOWN'
let analyticsAdminId = '';       // '' = all admins
let analyticsReport = null;      // cached CountrySplitReportDto
let analyticsAdmins = [];        // roster, so zero-earning admins still list

const COUNTRY_META = {
  GH: { flag: '🇬🇭', symbol: '₵', name: 'Ghana', note: 'MoMo / wallet funding' },
  NG: { flag: '🇳🇬', symbol: '₦', name: 'Nigeria', note: 'mostly bank transfer' },
  OTHER: { flag: '🌍', symbol: '₵', name: 'Other countries', note: '' },
  UNKNOWN: { flag: '❓', symbol: '₵', name: 'Unknown country', note: 'no country on file' }
};

function countryMeta(code) { return COUNTRY_META[code] || COUNTRY_META.UNKNOWN; }

/** Format an amount with the symbol matching its own currency. */
function fmtCur(amount, currency) {
  const sym = currency === 'NGN' ? '₦' : currency === 'MIXED' ? '' : '₵';
  return `${sym}${fmt(amount)}`;
}

function analyticsRangeLabel() {
  return analyticsPeriod === 'daily'
    ? `last ${analyticsDays} day${analyticsDays !== 1 ? 's' : ''}`
    : `last ${analyticsWeeks} week${analyticsWeeks !== 1 ? 's' : ''}`;
}

function analyticsEndpoint() {
  return analyticsPeriod === 'daily'
    ? `/api/super-admin/commission/country-report/daily?days=${analyticsDays}`
    : `/api/super-admin/commission/country-report/weekly?weeks=${analyticsWeeks}`;
}

/** Open analytics focused on one admin — used from the admins page. */
function openAdminAnalytics(adminId) {
  analyticsAdminId = adminId || '';
  analyticsCountry = '';
  analyticsReport = null;
  navigate('commission-analytics');
}

// ── Data ─────────────────────────────────────────────────────────────────────
async function fetchAnalytics() {
  const [report, admins] = await Promise.allSettled([
    api(analyticsEndpoint()),
    api('/api/super-admin/admins')
  ]);

  if (report.status !== 'fulfilled') {
    throw new Error(report.reason?.message || 'Could not load the country report.');
  }

  analyticsReport = report.value;
  analyticsAdmins = admins.status === 'fulfilled'
    ? (Array.isArray(admins.value) ? admins.value : (admins.value?.content || []))
    : [];

  return analyticsReport;
}

/** Country buckets present in this range, GH and NG always first. */
function activeCountries() {
  const summaries = analyticsReport?.summaries || [];
  const order = { GH: 0, NG: 1, OTHER: 2, UNKNOWN: 3 };
  return [...summaries].sort((a, b) => (order[a.country] ?? 9) - (order[b.country] ?? 9));
}

/** Rows filtered by the current country toggle. */
function filterByCountry(rows) {
  if (!analyticsCountry) return rows || [];
  return (rows || []).filter(r => r.country === analyticsCountry);
}

/**
 * Group commissionByAdmin rows into per-admin, per-country totals.
 * Admins with no commission in the range are included at zero so they don't
 * silently disappear from the list.
 */
function groupAdmins() {
  const rows = filterByCountry(analyticsReport?.commissionByAdmin);
  const map = new Map();

  for (const a of analyticsAdmins) {
    if (!a?.id) continue;
    map.set(a.id, {
      adminId: a.id,
      adminEmail: a.email || '—',
      name: `${a.firstName || ''} ${a.lastName || ''}`.trim(),
      byCountry: {},
      periods: [],
      grandCount: 0
    });
  }

  for (const r of rows) {
    if (!map.has(r.adminId)) {
      map.set(r.adminId, {
        adminId: r.adminId, adminEmail: r.adminEmail || '—', name: '',
        byCountry: {}, periods: [], grandCount: 0
      });
    }
    const g = map.get(r.adminId);
    const amt = Number(r.amount) || 0;
    const cnt = Number(r.count) || 0;

    const b = g.byCountry[r.country] ||
      (g.byCountry[r.country] = { amount: 0, count: 0, currency: r.currency });
    b.amount += amt;
    b.count += cnt;
    b.currency = r.currency || b.currency;

    g.grandCount += cnt;
    g.periods.push({
      label: r.periodLabel, country: r.country,
      amount: amt, count: cnt, currency: r.currency
    });
  }

  for (const g of map.values()) {
    g.periods.sort((a, b) => (a.label < b.label ? 1 : a.label > b.label ? -1 : 0));
    // Rank by the selected country, or by GH then NG when showing both.
    g.rankValue = analyticsCountry
      ? (g.byCountry[analyticsCountry]?.amount || 0)
      : (g.byCountry.GH?.amount || 0) + (g.byCountry.NG?.amount || 0);
  }

  return [...map.values()].sort((a, b) => b.rankValue - a.rankValue);
}

/** Collapse period rows into one entry per period, keeping countries separate. */
function pivotByPeriod(rows) {
  const map = new Map();
  for (const r of rows || []) {
    if (!map.has(r.periodLabel)) map.set(r.periodLabel, { label: r.periodLabel, byCountry: {} });
    const p = map.get(r.periodLabel);
    const b = p.byCountry[r.country] ||
      (p.byCountry[r.country] = { amount: 0, count: 0, currency: r.currency });
    b.amount += Number(r.amount) || 0;
    b.count += Number(r.count) || 0;
    b.currency = r.currency || b.currency;
  }
  return [...map.values()].sort((a, b) => (a.label < b.label ? 1 : a.label > b.label ? -1 : 0));
}

// ── Page shell ───────────────────────────────────────────────────────────────
async function renderCommissionAnalytics() {
  const c = document.getElementById('page-content');
  c.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h2>Commission &amp; Deposit Analytics</h2>
        <button class="btn-ghost btn-sm"
          onclick="analyticsReport=null;renderCommissionAnalytics()">${ic('refresh', 'ms-sm')} Refresh</button>
      </div>
      <div class="card-body">
        <div class="tabs">
          <button class="tab ${analyticsPeriod === 'daily' ? 'active' : ''}"
            onclick="analyticsPeriod='daily';analyticsReport=null;renderCommissionAnalytics()">Daily</button>
          <button class="tab ${analyticsPeriod === 'weekly' ? 'active' : ''}"
            onclick="analyticsPeriod='weekly';analyticsReport=null;renderCommissionAnalytics()">Weekly</button>
        </div>

        <div class="form-row" style="margin:16px 0;align-items:flex-end">
          ${analyticsPeriod === 'daily' ? `
            <div class="form-group" style="max-width:120px">
              <label>Days</label>
              <input id="an-days" type="number" min="1" max="365" value="${analyticsDays}"
                onkeydown="if(event.key==='Enter')applyAnalyticsRange()">
            </div>` : `
            <div class="form-group" style="max-width:120px">
              <label>Weeks</label>
              <input id="an-weeks" type="number" min="1" max="52" value="${analyticsWeeks}"
                onkeydown="if(event.key==='Enter')applyAnalyticsRange()">
            </div>`}
          <button class="btn-primary" onclick="applyAnalyticsRange()">Apply</button>

          <div class="form-group" style="min-width:180px">
            <label>Country</label>
            <select id="an-country-select" onchange="selectAnalyticsCountry(this.value)">
              <option value="">🌍 Both countries</option>
            </select>
          </div>

          <div class="form-group" style="flex:1;min-width:220px">
            <label>Admin</label>
            <select id="an-admin-select" onchange="selectAnalyticsAdmin(this.value)">
              <option value="">👥 All admins</option>
            </select>
          </div>
        </div>

        <div id="an-body">${loading('Loading analytics…')}</div>
      </div>
    </div>`;

  try {
    if (!analyticsReport) await fetchAnalytics();
    renderAnalyticsBody();
  } catch (e) {
    document.getElementById('an-body').innerHTML = errorBox(e.message);
  }
}

function applyAnalyticsRange() {
  if (analyticsPeriod === 'daily') {
    const v = parseInt(document.getElementById('an-days')?.value, 10);
    analyticsDays = (v && v > 0 && v <= 365) ? v : 30;
  } else {
    const v = parseInt(document.getElementById('an-weeks')?.value, 10);
    analyticsWeeks = (v && v > 0 && v <= 52) ? v : 12;
  }
  analyticsReport = null;
  renderCommissionAnalytics();
}

function selectAnalyticsCountry(code) {
  analyticsCountry = code || '';
  renderAnalyticsBody();
}

function selectAnalyticsAdmin(id) {
  analyticsAdminId = id || '';
  renderAnalyticsBody();
}

function renderAnalyticsBody() {
  const countries = activeCountries();
  const admins = groupAdmins();

  const cSel = document.getElementById('an-country-select');
  if (cSel) {
    cSel.innerHTML = `<option value="">🌍 Both countries</option>` +
      countries.map(s => {
        const m = countryMeta(s.country);
        return `<option value="${esc(s.country)}" ${analyticsCountry === s.country ? 'selected' : ''}>
          ${m.flag} ${esc(s.countryName)}
        </option>`;
      }).join('');
  }

  const aSel = document.getElementById('an-admin-select');
  if (aSel) {
    aSel.innerHTML = `<option value="">👥 All admins</option>` +
      admins.map(g => `<option value="${esc(g.adminId)}" ${analyticsAdminId === g.adminId ? 'selected' : ''}>
        ${esc(g.adminEmail)}
      </option>`).join('');
  }

  const el = document.getElementById('an-body');
  if (!el) return;

  el.innerHTML = analyticsAdminId
    ? renderAdminAnalytics(admins.find(g => g.adminId === analyticsAdminId))
    : renderAnalyticsOverview(countries, admins);
}

// ── View A: overview ─────────────────────────────────────────────────────────
function renderAnalyticsOverview(countries, admins) {
  const shown = analyticsCountry
    ? countries.filter(s => s.country === analyticsCountry)
    : countries;

  if (!shown.length) {
    return empty(`No activity recorded in the ${analyticsRangeLabel()}.`, 'analytics');
  }

  // One card per country. Deposits and commission stay in their own currency
  // and are never combined into a platform-wide figure.
  const cards = shown.map(s => {
    const m = countryMeta(s.country);
    return `
      <div class="stat" style="min-width:260px">
        <span class="stat-icon">${m.flag}</span>
        <div class="stat-label">${esc(s.countryName)}${m.note ? ` · ${esc(m.note)}` : ''}</div>
        <div class="stat-value">${fmtCur(s.depositTotal, s.currency)}</div>
        <div class="stat-sub">${fmtInt(s.depositCount)} deposits ·
          avg ${fmtCur(s.averageDeposit, s.currency)}</div>
        <div style="margin-top:10px;padding-top:10px;border-top:1px solid rgba(127,127,127,.2)">
          <div class="stat-label">Commission paid</div>
          <div style="font-size:19px;font-weight:600;color:var(--green-text)">
            ${fmtCur(s.commissionTotal, s.currency)}</div>
          <div class="stat-sub">${fmtInt(s.commissionCount)} entries ·
            ${Number(s.effectiveCommissionRate).toFixed(2)}% of deposits</div>
        </div>
      </div>`;
  }).join('');

  const depositPeriods = pivotByPeriod(filterByCountry(analyticsReport.depositsByPeriod));
  const commissionPeriods = pivotByPeriod(filterByCountry(analyticsReport.commissionByPeriod));
  const cols = shown.map(s => s.country);

  return `
    <div class="alert alert-info" style="margin-bottom:14px">
      ${ic('info', 'ms-sm')} Ghana figures are in cedis and Nigeria's in naira. The two are shown
      separately and never added together.
    </div>

    <div class="stat-grid">${cards}</div>

    <div class="section-title">Deposits by period — ${esc(analyticsRangeLabel())}</div>
    ${periodTable(depositPeriods, cols, 'No deposits in this range.')}

    <div class="section-title">Commission by period</div>
    ${periodTable(commissionPeriods, cols, 'No commission in this range.')}

    <div class="section-title">Commission by admin — select a row to drill in</div>
    ${admins.length ? `
      <div class="tbl-wrap"><table>
        <thead><tr>
          <th>#</th><th>Admin</th>
          ${cols.map(c => `<th>${countryMeta(c).flag} ${esc(countryMeta(c).name)}</th>`).join('')}
          <th>Entries</th><th></th>
        </tr></thead>
        <tbody>${admins.map((g, i) => `
          <tr style="cursor:pointer" onclick="selectAnalyticsAdmin('${esc(g.adminId)}')">
            ${labeledTd('#', `<span style="color:var(--text-dim)">${i + 1}</span>`)}
            ${labeledTd('Admin', `<div>${esc(g.name) || '—'}</div>
              <div class="mono" style="font-size:11px;color:var(--text-dim)">${esc(g.adminEmail)}</div>`)}
            ${cols.map(c => {
              const b = g.byCountry[c];
              return labeledTd(countryMeta(c).name, b && b.amount > 0
                ? `<strong style="color:var(--green-text)">${fmtCur(b.amount, b.currency)}</strong>`
                : `<span style="color:var(--text-dim)">—</span>`);
            }).join('')}
            ${labeledTd('Entries', fmtInt(g.grandCount))}
            ${labeledTd('', `<button class="btn-ghost btn-sm">View →</button>`)}
          </tr>`).join('')}</tbody>
      </table></div>` : empty('No admins found.', 'shield_person')}

    <div style="display:flex;gap:8px;padding-top:14px;flex-wrap:wrap">
      <button class="btn-ghost btn-sm" onclick="exportCountryCommissionCSV()">${ic('download', 'ms-sm')} Export commission by country</button>
      <button class="btn-ghost btn-sm" onclick="exportCountryDepositsCSV()">${ic('download', 'ms-sm')} Export deposits by country</button>
    </div>`;
}

/** Shared period table: one row per period, one column per country. */
function periodTable(periods, cols, emptyMsg) {
  if (!periods.length) return empty(emptyMsg || 'Nothing in this range.', 'analytics');

  // Bars are scaled per country so the shape of each series is readable on its
  // own terms; scaling across currencies would imply they are comparable.
  const maxByCountry = {};
  for (const c of cols) {
    maxByCountry[c] = Math.max(...periods.map(p => p.byCountry[c]?.amount || 0), 0);
  }

  return `
    <div class="tbl-wrap"><table>
      <thead><tr>
        <th>Period</th>
        ${cols.map(c => `<th>${countryMeta(c).flag} ${esc(countryMeta(c).name)}</th>`).join('')}
      </tr></thead>
      <tbody>${periods.map(p => `<tr>
        ${labeledTd('Period', `<span class="mono">${esc(p.label)}</span>`)}
        ${cols.map(c => {
          const b = p.byCountry[c];
          if (!b || b.amount === 0) {
            return labeledTd(countryMeta(c).name, `<span style="color:var(--text-dim)">—</span>`);
          }
          return labeledTd(countryMeta(c).name, `
            <div><strong>${fmtCur(b.amount, b.currency)}</strong>
              <span style="font-size:11px;color:var(--text-dim)"> · ${fmtInt(b.count)}</span></div>
            ${miniBar(b.amount, maxByCountry[c],
              c === 'NG' ? 'var(--blue-text, #5b9dff)' : 'var(--green-text)')}`);
        }).join('')}
      </tr>`).join('')}</tbody>
    </table></div>`;
}

// ── View B: a single admin ───────────────────────────────────────────────────
function renderAdminAnalytics(g) {
  if (!g) return `
    <div class="alert alert-warning">${ic('warning', 'ms-sm')} That admin is not in the current result set.</div>
    <button class="btn-ghost btn-sm" onclick="selectAnalyticsAdmin('')">← Back to all admins</button>`;

  const countries = activeCountries();
  const cols = (analyticsCountry ? countries.filter(s => s.country === analyticsCountry) : countries)
    .map(s => s.country);

  // Platform commission per country, so this admin's share is expressed within
  // each currency rather than against a mixed denominator.
  const platformByCountry = {};
  for (const s of countries) platformByCountry[s.country] = Number(s.commissionTotal) || 0;

  const cards = cols.map(c => {
    const b = g.byCountry[c];
    const m = countryMeta(c);
    const total = b?.amount || 0;
    const platform = platformByCountry[c] || 0;
    const share = platform > 0 ? (total / platform) * 100 : 0;
    return `
      <div class="stat" style="min-width:230px">
        <span class="stat-icon">${m.flag}</span>
        <div class="stat-label">${esc(m.name)}</div>
        <div class="stat-value" style="color:var(--green-text)">
          ${fmtCur(total, b?.currency || (c === 'NG' ? 'NGN' : 'GHS'))}</div>
        <div class="stat-sub">${share.toFixed(1)}% of ${esc(m.name)} commission ·
          ${fmtInt(b?.count || 0)} entries</div>
      </div>`;
  }).join('');

  const periods = analyticsCountry
    ? g.periods.filter(p => p.country === analyticsCountry)
    : g.periods;

  const pivoted = pivotByPeriod(periods);

  return `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap">
      <button class="btn-ghost btn-sm" onclick="selectAnalyticsAdmin('')">← All admins</button>
      <div>
        <strong style="font-size:15px">${esc(g.name || g.adminEmail)}</strong>
        <div class="mono" style="font-size:11px;color:var(--text-dim)">${esc(g.adminEmail)}</div>
      </div>
      <button class="btn-ghost btn-sm" style="margin-left:auto"
        onclick="viewAdmin('${esc(g.adminId)}')">Open full admin profile</button>
    </div>

    <div class="stat-grid">${cards}</div>

    <div class="section-title">${analyticsPeriod === 'daily' ? 'Daily' : 'Weekly'} breakdown — ${esc(analyticsRangeLabel())}</div>
    ${pivoted.length
      ? periodTable(pivoted, cols, '')
      : empty(`No commission for this admin in the ${analyticsRangeLabel()}.`, 'analytics')}

    ${pivoted.length ? `
      <div style="display:flex;gap:8px;padding-top:14px">
        <button class="btn-ghost btn-sm"
          onclick="exportAdminCommissionCSV('${esc(g.adminId)}')">${ic('download', 'ms-sm')} Export this admin</button>
      </div>` : ''}`;
}

// ── Analytics exports ────────────────────────────────────────────────────────
function exportCountryCommissionCSV() {
  const rows = filterByCountry(analyticsReport?.commissionByAdmin);
  if (!rows.length) { showAlert('No commission data to export.', 'warning'); return; }
  exportCSV(`commission-by-country-${analyticsPeriod}-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Period', 'Country', 'Admin Email', 'Admin ID', 'Amount', 'Currency', 'Entries'],
    rows.map(r => [r.periodLabel, r.countryName, r.adminEmail, r.adminId,
      r.amount, r.currency, r.count]));
  showAlert(`Exported ${rows.length} rows.`, 'success');
}

function exportCountryDepositsCSV() {
  const rows = filterByCountry(analyticsReport?.depositsByPeriod);
  if (!rows.length) { showAlert('No deposit data to export.', 'warning'); return; }
  exportCSV(`deposits-by-country-${analyticsPeriod}-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Period', 'Country', 'Total', 'Currency', 'Count'],
    rows.map(r => [r.periodLabel, r.countryName, r.amount, r.currency, r.count]));
  showAlert(`Exported ${rows.length} rows.`, 'success');
}

function exportAdminCommissionCSV(adminId) {
  const g = groupAdmins().find(x => x.adminId === adminId);
  if (!g || !g.periods.length) { showAlert('Nothing to export for this admin.', 'warning'); return; }
  const rows = analyticsCountry
    ? g.periods.filter(p => p.country === analyticsCountry)
    : g.periods;
  const safe = (g.adminEmail || adminId).replace(/[^a-z0-9]/gi, '_');
  exportCSV(`commission-${safe}-${analyticsPeriod}-${new Date().toISOString().slice(0, 10)}.csv`,
    ['Period', 'Country', 'Amount', 'Currency', 'Entries'],
    rows.map(p => [p.label, countryMeta(p.country).name, p.amount, p.currency, p.count]));
  showAlert(`Exported ${rows.length} rows.`, 'success');
}

// ============================================================
// INIT
// ============================================================
function bootstrapConsole() {
  const token = localStorage.getItem('fb_token') || localStorage.getItem('accessToken');
  if (token) localStorage.setItem('fb_token', token);
  if (!token) {
    window.location.href = 'auth.html';
    return;
  }
  config.token = token;
  renderDashboard();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapConsole);
} else {
  bootstrapConsole();
}
