const STAGES = [
  { key: 'new', label: 'New Lead', color: '#6C5CE7' },
  { key: 'confirmed', label: 'Contacted', color: '#8C7FEA' },
  { key: 'held', label: 'Meeting Held', color: '#2196F3' },
  { key: 'proposal', label: 'Proposal Sent', color: '#F4B942' },
  { key: 'client', label: 'Client', color: '#43B883' },
  { key: 'lost', label: 'Lost', color: '#E05A6D' },
];
const HEALTH_META = {
  healthy: { label: 'Healthy', icon: '🟢', cls: 'health-healthy' },
  attention: { label: 'Needs Attention', icon: '🟡', cls: 'health-attention' },
  risk: { label: 'At Risk', icon: '🔴', cls: 'health-risk' },
};
const DOCUMENT_TYPES = ['Contract', 'Proposal', 'Invoice', 'Estimate', 'Agreement', 'Attachment', 'Other'];
const DAY = 24 * 60 * 60 * 1000;
const OVERDUE_DAYS = 3;

let contacts = [];
let tasks = [];
let invoices = [];
let projects = [];
let documents = [];
let jobs = [];
let jobProfile = {
  fullName: '', professionalTitle: '', summary: '',
  services: [], skills: [], tools: [], crmCapabilities: [],
  workHistory: [], languages: [], education: [],
  preferredRoles: [], preferredEmploymentType: '', preferredSalary: '', workPreferences: '', portfolioUrl: '', cvReference: '',
};
let searchTerm = '';
let currentView = 'dashboard';
let contactsFilter = null; // extra predicate set when jumping in from Dashboard focus cards
let contactChip = 'all';
let taskChip = 'all';
let dashTrendDays = 30;
let calendarMonth = (() => { const d = new Date(); d.setDate(1); return d; })();
let calSelectedDate = new Date().toISOString().slice(0, 10);
let calFilter = 'all';
let taskSearchTerm = '';
let taskPriorityFilter = 'all';
let taskClientFilter = 'all';
let taskSelectedId = null;
let fuFilter = 'all';
let fuSearchTerm = '';
let fuSourceFilter = 'all';
let fuSelectedId = null;
let anKpiSelected = null;
let anStageSelected = null;
let anAgingSelected = null;
let anPeriodSort = { key: 'period', dir: 'asc' };
let anPeriodSelected = null;
let jhSearchTerm = '';
let jhSourceFilter = 'all';
let jhEmploymentFilter = 'all';
let jhMatchFilter = 'all';
let jhStatusFilter = 'all';
let jhFunnelFilter = null;
let jhChartRange = 'month';
let jhSort = { key: 'dateAdded', dir: 'desc' };
let jhPage = 1;
let jhPageSize = 10;
let jhSelectedId = null;
let jhDetailTab = 'overview';
let jhQuestionsDraft = [];
// Buffers in-progress (unsaved) Application-tab edits, keyed by job id, so
// switching tabs or a background data refresh never silently discards them —
// only an explicit Save Draft / Regenerate clears it.
let jhAppDraftBuffer = null;

/* ---- Phase 2F: Job Finder (discovery layer — separate from Job Opportunities) ---- */
let jfKeywords = [];               // persisted: [{id, keyword, createdAt}]
let jfHistory = [];                // persisted: [{id, keyword, resultCount, searchedAt, error}]
let jfConfigured = null;           // null = unknown yet, true/false once /status responds
let jfResults = [];                // in-memory only: last search's combined, deduped results
let jfPerKeywordCounts = {};       // { keyword: count } from the last search
let jfPerKeywordErrors = {};       // { keyword: errorMessage } for keywords that failed in the last search
let jfSearchStatus = 'ready';      // ready | searching | completed | no_results | error | not_configured
let jfSearchError = '';
let jfSearchWarning = '';          // partial-failure notice shown alongside otherwise-successful results
let jfResultsPerKeyword = 10;
let jfSelectedResultId = null;
let jfSelectedIds = new Set();     // bulk-save checkboxes
let jfSearchTerm = '';
let jfSourceFilter = 'all';
let jfKeywordFilter = 'all';
let jfMatchFilter = 'all';
let jfStatusFilter = 'all';        // all | new | saved
let jfEmploymentFilter = 'all';
let jfCompensationFilter = 'all';
let jfHasSearched = false;         // distinguishes "never searched" (—) from "searched, 0 results" (0)
const JOB_SOURCES = ['OnlineJobs.ph', 'LinkedIn', 'Indeed', 'Upwork', 'Referral', 'Website', 'Direct', 'Other'];
const JOB_EMPLOYMENT_TYPES = ['Full-Time', 'Part-Time', 'Contract', 'Freelance', 'Temporary', 'Other'];
const JOB_STATUSES = ['Saved', 'Reviewing', 'Ready to Apply', 'Applied', 'Follow-Up', 'Interview', 'Rejected', 'Hired'];
const JOB_STATUS_COLORS = {
  Saved: 'var(--text-muted)', Reviewing: 'var(--blue, #2196F3)', 'Ready to Apply': 'var(--primary)',
  Applied: 'var(--warning)', 'Follow-Up': 'var(--warning)', Interview: 'var(--plum)',
  Rejected: 'var(--error)', Hired: 'var(--success)',
};
let pendingUploadContactId = '';
let apptSelectedDate = new Date().toISOString().slice(0, 10);
let apptWeekAnchor = apptSelectedDate;
let apptFilter = 'all';
let apptSourceFilter = 'all';
let apptServiceFilter = 'all';
let apptSelectedId = null;
const APPT_SERVICES = ['Customer Support', 'Appointment Setting', 'CRM Management', 'Lead Follow-Up', 'AI & Automation'];
const APPT_SOURCES = ['LinkedIn', 'OnlineJobs.ph', 'Upwork', 'Referral', 'Website', 'Facebook', 'Direct', 'Other'];

const $ = (sel) => document.querySelector(sel);
const todayStr = () => new Date().toISOString().slice(0, 10);

async function loadContacts() { contacts = await (await fetch('/api/contacts')).json(); render(); }
async function loadTasks() { tasks = await (await fetch('/api/tasks')).json(); if (['tasks', 'dashboard', 'calendar'].includes(currentView)) render(); }
async function loadInvoices() { invoices = await (await fetch('/api/invoices')).json(); if (['billing', 'dashboard', 'calendar'].includes(currentView)) render(); }
async function loadProjects() { projects = await (await fetch('/api/projects')).json(); if (currentView === 'projects') render(); }
async function loadDocuments() { documents = await (await fetch('/api/documents')).json(); if (currentView === 'documents') render(); }
async function loadJobs() { jobs = await (await fetch('/api/jobs')).json(); if (['jobhunt', 'jobfinder'].includes(currentView)) render(); }
async function loadJobProfile() { jobProfile = await (await fetch('/api/job-profile')).json(); if (['jobhunt', 'jobfinder'].includes(currentView)) render(); }
async function loadJobFinderKeywords() { jfKeywords = await (await fetch('/api/job-finder/keywords')).json(); if (currentView === 'jobfinder') render(); }
let jfInitialResultsRestoreAttempted = false; // ensures the one-time page-load restore never re-fires on later history refreshes (e.g. after a live search)
async function loadJobFinderHistory() {
  jfHistory = await (await fetch('/api/job-finder/history')).json();
  if (!jfInitialResultsRestoreAttempted) {
    jfInitialResultsRestoreAttempted = true;
    const latest = jfHistory[0];
    if (!jfHasSearched && latest && Array.isArray(latest.results) && latest.results.length) {
      jfRestoreResultsFromHistoryEntry(latest);
    }
  }
  if (currentView === 'jobfinder') render();
}
async function loadJobFinderStatus() { const r = await (await fetch('/api/job-finder/status')).json(); jfConfigured = !!r.configured; if (currentView === 'jobfinder') render(); }

function baseFiltered() {
  if (!searchTerm) return contacts;
  const t = searchTerm.toLowerCase();
  return contacts.filter(c =>
    (c.name || '').toLowerCase().includes(t) ||
    (c.email || '').toLowerCase().includes(t) ||
    (c.company || '').toLowerCase().includes(t) ||
    (c.service || '').toLowerCase().includes(t)
  );
}
function filteredContacts() {
  const base = baseFiltered();
  return contactsFilter ? base.filter(contactsFilter.predicate) : base;
}
function initials(name) { return (name || '?').split(' ').filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join(''); }
function fmtMoney(n) { return '$' + (Number(n) || 0).toLocaleString(); }
function fmtRelative(iso) {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}
function fmtDateShort(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - new Date(todayStr() + 'T00:00:00').getTime()) / DAY);
}
function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}
// Display-only cleanup for third-party search snippets (e.g. Brave): strips
// HTML markup the provider embeds for highlighting, decodes HTML entities so
// real punctuation/apostrophes read correctly, and drops encoding-artifact
// characters. It never adds or infers words — only removes noise around the
// text the source actually returned.
function cleanSnippetText(str) {
  if (!str) return '';
  const HTML_ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', 39: "'", apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…' };
  return String(str)
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp|rsquo|lsquo|rdquo|ldquo|ndash|mdash|hellip);/g, (_, name) => HTML_ENTITIES[name])
    .replace(/�/g, '')
    .replace(/\?{2,}/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, ' ')
    .trim();
}
function stageOf(c) { return STAGES.find(s => s.key === c.stage) || STAGES[0]; }

// Derived data helpers — everything below reads only real fields already on each record
function isActive(c) { return !['client', 'lost'].includes(c.stage); }
function isOverdue(c) { return isActive(c) && (Date.now() - new Date(c.lastActivity || c.createdAt).getTime()) > OVERDUE_DAYS * DAY; }
function isTodayAppointment(c) { return c.bookingDate === todayStr(); }
function isNewLead(c) { return (Date.now() - new Date(c.createdAt).getTime()) <= 3 * DAY; }
function isReactivation(c) { return c.stage === 'lost'; }

// Follow-up bucket: prefers an explicit nextFollowUp date; falls back to the original
// stage + lastActivity logic when it isn't set, so existing contacts behave exactly as before.
function followupBucket(c) {
  if (!isActive(c)) return 'completed';
  if (c.nextFollowUp) {
    const d = daysUntil(c.nextFollowUp);
    if (d < 0) return 'overdue';
    if (d === 0) return 'today';
    return 'upcoming';
  }
  if (isOverdue(c)) return 'overdue';
  if (isTodayAppointment(c)) return 'today';
  return 'upcoming';
}

function taskBucket(t) {
  if (t.status === 'done') return 'completed';
  if (!t.dueDate) return 'upcoming';
  const d = daysUntil(t.dueDate);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  return 'upcoming';
}

function invoiceEffectiveStatus(inv) {
  if (inv.status === 'Paid') return 'Paid';
  if (inv.dueDate && daysUntil(inv.dueDate) < 0) return 'Overdue';
  return inv.status || 'Pending';
}

// Client health: computed from real overdue signals, unless manually overridden.
function computeHealth(c) {
  if (c.healthOverride) return c.healthOverride;
  if (c.stage === 'lost') return 'risk';
  const overdueFollowup = followupBucket(c) === 'overdue';
  const overdueTasks = tasks.filter(t => t.contactId === c.id && t.status === 'open' && t.dueDate && daysUntil(t.dueDate) < 0).length;
  const overdueInvoices = invoices.filter(i => i.contactId === c.id && invoiceEffectiveStatus(i) === 'Overdue').length;
  const signals = (overdueFollowup ? 1 : 0) + (overdueTasks > 0 ? 1 : 0) + (overdueInvoices > 0 ? 1 : 0);
  if (signals >= 2) return 'risk';
  if (signals === 1) return 'attention';
  return 'healthy';
}
function healthBadgeHtml(c) {
  const h = HEALTH_META[computeHealth(c)];
  return `<span class="health-badge ${h.cls}">${h.icon} ${h.label}</span>`;
}

function emptyStateHtml(title, text, compact) {
  return `
    <div class="empty-state${compact ? ' compact' : ''}">
      <div class="empty-icon"><svg viewBox="0 0 24 24"><path d="M9 11l3 3 8-8"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg></div>
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(text)}</p>
    </div>
  `;
}

function render() {
  if (currentView === 'dashboard') renderDashboard();
  if (currentView === 'pipeline') renderBoard();
  if (currentView === 'contacts') renderTable();
  if (currentView === 'appointments') renderAppointments();
  if (currentView === 'calendar') renderCalendar();
  if (currentView === 'tasks') renderTasksPage();
  if (currentView === 'followups') renderFollowups();
  if (currentView === 'jobhunt') renderJobHunt();
  if (currentView === 'jobfinder') renderJobFinder();
  if (currentView === 'billing') renderBilling();
  if (currentView === 'documents') renderDocuments();
  if (currentView === 'projects') renderProjects();
  if (currentView === 'analytics') renderAnalytics();
  if (typeof kaiUpdateFabBadge === 'function') kaiUpdateFabBadge();
}

/* ================= DASHBOARD ================= */
function renderDashboard() {
  const weekAgo = Date.now() - 7 * DAY;
  const appts = contacts.filter(c => c.bookingDate);
  const apptsThisWeek = appts.filter(c => new Date(c.createdAt).getTime() >= weekAgo).length;
  const leadsThisWeek = contacts.filter(c => new Date(c.createdAt).getTime() >= weekAgo).length;
  const followupsNeeded = contacts.filter(isActive);
  const overdue = contacts.filter(c => followupBucket(c) === 'overdue');
  const pipelineValue = contacts.filter(isActive).reduce((s, c) => s + (Number(c.value) || 0), 0);
  const wonValue = contacts.filter(c => c.stage === 'client').reduce((s, c) => s + (Number(c.value) || 0), 0);

  animateValue($('#kpiAppointments'), appts.length);
  $('#kpiAppointmentsDelta').textContent = apptsThisWeek ? `+${apptsThisWeek} this week` : 'No new bookings this week';
  animateValue($('#kpiLeads'), contacts.length);
  $('#kpiLeadsDelta').textContent = leadsThisWeek ? `+${leadsThisWeek} this week` : 'No new leads this week';
  animateValue($('#kpiFollowups'), followupsNeeded.length);
  $('#kpiFollowupsDelta').textContent = overdue.length ? `${overdue.length} overdue` : 'All caught up';
  animateValue($('#kpiValue'), pipelineValue, true);
  $('#kpiValueDelta').textContent = wonValue ? `${fmtMoney(wonValue)} won` : 'No won deals yet';
  renderKpiSparklines();

  const tasksToday = tasks.filter(t => t.status === 'open' && t.dueDate === todayStr());
  const billingDue = invoices.filter(i => invoiceEffectiveStatus(i) !== 'Paid' && i.dueDate && daysUntil(i.dueDate) <= 3 && daysUntil(i.dueDate) >= 0);
  const overdueContacts = contacts.filter(c => followupBucket(c) === 'overdue');
  const todayAppts = contacts.filter(isTodayAppointment);

  renderStatusLine(overdueContacts.length + todayAppts.length + tasksToday.length + billingDue.length, overdueContacts.length);
  renderFocusFeed({ overdueContacts, todayAppts, tasksToday, billingDue });
  renderClientHealthWidget();
  renderTopSources();
  renderDashboardLeadActivity(dashTrendDays);
  renderPipelineOverview();
  renderUpcomingAppointments();
  renderHeaderDate();

  const recent = [...contacts].sort((a, b) => new Date(b.lastActivity || b.createdAt) - new Date(a.lastActivity || a.createdAt)).slice(0, 6);
  const recentList = $('#recentList');
  if (!recent.length) {
    recentList.innerHTML = emptyStateHtml('No activity yet', 'New bookings and updates will show up here.');
  } else {
    recentList.innerHTML = recent.map(c => `
      <div class="mini-row" data-id="${c.id}">
        <div class="avatar">${initials(c.name)}</div>
        <div>
          <div class="mini-name">${escapeHtml(c.name)}</div>
          <div class="mini-meta">${escapeHtml(stageOf(c).label)} · updated ${fmtRelative(c.lastActivity || c.createdAt)}</div>
        </div>
        <div class="mini-right"><span class="status-badge" style="background:${stageOf(c).color}1a;color:${stageOf(c).color}">${escapeHtml(stageOf(c).label)}</span></div>
      </div>
    `).join('');
    recentList.querySelectorAll('.mini-row').forEach(row => {
      row.addEventListener('click', () => { const c = contacts.find(x => x.id === row.dataset.id); if (c) openModal(c); });
    });
  }
}

function renderStatusLine(attentionCount, urgentCount) {
  const el = $('#dashStatusLine');
  el.classList.remove('attention', 'clear');
  if (attentionCount === 0) {
    el.classList.add('clear');
    el.innerHTML = `<span class="status-dot"></span> You're all caught up today.`;
  } else {
    el.classList.add(urgentCount > 0 ? 'attention' : '');
    el.innerHTML = `<span class="status-dot"></span> Let's make today productive. You have ${attentionCount} item${attentionCount === 1 ? '' : 's'} that need${attentionCount === 1 ? 's' : ''} your attention today.`;
  }
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function animateValue(el, target, isMoney) {
  if (!el) return;
  const prev = Number(el.dataset.raw || 0);
  el.dataset.raw = target;
  if (prev === target || prefersReducedMotion()) { el.textContent = isMoney ? fmtMoney(target) : target; return; }
  const duration = 650, start = performance_now(), from = prev;
  function tick() {
    const elapsed = performance_now() - start;
    const t = Math.min(1, elapsed / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = Math.round(from + (target - from) * eased);
    el.textContent = isMoney ? fmtMoney(value) : value;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function performance_now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }
function wireRowSelect(container, rowSelector) {
  if (!container) return;
  container.querySelectorAll(rowSelector).forEach(row => {
    row.addEventListener('click', () => {
      const already = row.classList.contains('row-selected');
      container.querySelectorAll(rowSelector).forEach(r => r.classList.remove('row-selected'));
      if (!already) row.classList.add('row-selected');
    });
  });
}

function showToast(message) {
  const stack = $('#toastStack');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="toast-dot"></span>${escapeHtml(message)}`;
  stack.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 200); }, 2600);
}

/* ================= Today's Focus (actionable feed) ================= */
function renderFocusFeed({ overdueContacts, todayAppts, tasksToday, billingDue }) {
  // Today's Focus is for items that require action — a new lead or a reactivation
  // candidate is passive information and belongs in Recent Activity instead.
  const items = [];
  overdueContacts.forEach(c => {
    const days = Math.floor((Date.now() - new Date(c.lastActivity || c.createdAt).getTime()) / DAY);
    items.push({ priority: 'urgent', icon: '🔴', name: c.name, context: `Follow-up about ${c.service || 'their inquiry'}`, meta: `${days} day${days === 1 ? '' : 's'} overdue`, action: 'Open', onClick: () => openModal(c) });
  });
  todayAppts.forEach(c => {
    items.push({ priority: 'attention', icon: '🟡', name: c.name, context: 'Meeting today', meta: c.bookingTime || 'Time TBD', action: 'View', onClick: () => openModal(c) });
  });
  tasksToday.forEach(t => {
    const contact = contacts.find(c => c.id === t.contactId);
    items.push({ priority: 'attention', icon: '✓', name: t.title, context: contact ? `Task for ${contact.name}` : 'Task', meta: 'Due today', action: 'Open', onClick: () => (contact ? openModal(contact) : goToView('tasks')) });
  });
  billingDue.forEach(i => {
    const contact = contacts.find(c => c.id === i.contactId);
    const when = daysUntil(i.dueDate) === 0 ? 'today' : daysUntil(i.dueDate) === 1 ? 'tomorrow' : `in ${daysUntil(i.dueDate)} days`;
    items.push({ priority: 'info', icon: '💰', name: contact ? contact.name : 'Unassigned', context: 'Invoice due', meta: `${fmtMoney(i.amount)} · Due ${when}`, action: 'Review', onClick: () => (contact ? openModal(contact) : goToView('billing')) });
  });

  const order = { urgent: 0, attention: 1, info: 2 };
  items.sort((a, b) => order[a.priority] - order[b.priority]);
  const shown = items.slice(0, 4);
  const remaining = items.length - shown.length;

  const feed = $('#focusGrid');
  if (!shown.length) {
    feed.innerHTML = `<div class="focus-empty"><span class="fe-icon">✓</span><span class="fe-title">You're all caught up today.</span></div>`;
    return;
  }
  feed.innerHTML = shown.map((it, i) => `
    <div class="focus-row ${it.priority}" data-i="${i}">
      <span class="focus-icon">${it.icon}</span>
      <div class="focus-main">
        <div class="focus-name">${escapeHtml(it.name)}</div>
        <div class="focus-context">${escapeHtml(it.context)} · <strong>${escapeHtml(it.meta)}</strong></div>
      </div>
      <button class="btn btn-secondary btn-sm">${it.action}</button>
    </div>
  `).join('') + (remaining > 0 ? `<div class="focus-more-row" id="focusMoreRow">+ ${remaining} more</div>` : '');
  const moreRow = $('#focusMoreRow');
  if (moreRow) moreRow.addEventListener('click', () => goToView('followups'));
  feed.querySelectorAll('.focus-row').forEach((row, i) => {
    row.addEventListener('click', () => shown[i].onClick());
  });
}
function initFocusViewAll() {
  $('#focusViewAll').addEventListener('click', () => goToView('followups'));
}

/* ================= Client Health widget ================= */
const HEALTH_COLORS = { healthy: '#43B883', attention: '#F4B942', risk: '#E05A6D' };
function renderClientHealthWidget() {
  const counts = { healthy: 0, attention: 0, risk: 0 };
  contacts.forEach(c => counts[computeHealth(c)]++);
  const total = contacts.length;
  const donutEl = $('#clientHealthDonut');
  if (!total) {
    donutEl.innerHTML = '';
  } else {
    const donut = buildDonut(Object.keys(HEALTH_META).map(key => ({ label: HEALTH_META[key].label, count: counts[key], color: HEALTH_COLORS[key], key })));
    donutEl.innerHTML = `${donut}<div class="donut-center"><div class="dc-value">${total}</div><div class="dc-label">Contacts</div></div>`;
  }
  const el = $('#clientHealthWidget');
  if (!total) { el.innerHTML = emptyStateHtml('No contacts yet', 'Client health will appear here once you have contacts.'); }
  else {
    el.innerHTML = Object.keys(HEALTH_META).map(key => {
      const pct = Math.round((counts[key] / total) * 100);
      return `
        <div class="donut-row" data-key="${key}">
          <span class="dot" style="background:${HEALTH_COLORS[key]}"></span>
          <span class="dr-label">${HEALTH_META[key].icon} ${HEALTH_META[key].label}</span>
          <div class="dr-track"><div class="dr-fill" style="width:${pct}%;background:${HEALTH_COLORS[key]}"></div></div>
          <span class="dr-count">${counts[key]}</span>
          <span class="dr-pct">${pct}%</span>
        </div>
      `;
    }).join('');
    el.querySelectorAll('.donut-row').forEach(row => {
      row.addEventListener('click', () => {
        const key = row.dataset.key;
        contactsFilter = { label: HEALTH_META[key].label, predicate: (c) => computeHealth(c) === key };
        goToView('contacts');
      });
    });
    syncDonutHover(donutEl, el);
  }
  const insight = $('#clientHealthInsight');
  if (insight) {
    const needsAttention = counts.attention + counts.risk;
    insight.textContent = total === 0 ? '' : needsAttention > 0 ? `${needsAttention} client${needsAttention === 1 ? '' : 's'} may need attention.` : 'All contacts are healthy.';
  }
}

/* ---- Performance Snapshot (dashboard summary, fixed 30-day window) ---- */
/* ---- Key Metrics Overview table ---- */
let dashKmoRangeDays = 30;
function dashKmoBounds() {
  const now = new Date(); now.setHours(23, 59, 59, 999);
  let start;
  if (dashKmoRangeDays === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
  } else {
    start = new Date(now); start.setDate(start.getDate() - (Number(dashKmoRangeDays) - 1)); start.setHours(0, 0, 0, 0);
  }
  return { start, end: now };
}
function dashKmoPrevBounds(bounds) {
  const len = bounds.end.getTime() - bounds.start.getTime();
  return { start: new Date(bounds.start.getTime() - len), end: new Date(bounds.start.getTime() - 1) };
}
function buildSparkline(values, color) {
  if (!values.length || values.every(v => v === 0)) return null;
  const w = 72, h = 26, pad = 2;
  const max = Math.max(1, ...values);
  const stepX = (w - pad * 2) / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${(pad + i * stepX).toFixed(1)},${(h - pad - (v / max) * (h - pad * 2)).toFixed(1)}`);
  return `<svg class="kmo-sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function dailyCountSeries(days, dateField) {
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    out.push(contacts.filter(c => (c[dateField] || '').slice(0, 10) === key).length);
  }
  return out;
}
/* ---- KPI card sparklines (real daily series, last 14 days) ---- */
function renderKpiSparklines() {
  const days = 14;
  const put = (id, values) => {
    const el = $(id);
    if (!el) return;
    const spark = contacts.length ? buildSparkline(values, '#6C5CE7') : null;
    el.innerHTML = spark || '<span class="no-spark">No trend data</span>';
  };
  put('#kpiLeadsSpark', dailyCountSeries(days, 'createdAt'));
  put('#kpiAppointmentsSpark', dailyCountSeries(days, 'bookingDate'));
  $('#kpiFollowupsSpark').innerHTML = '<span class="no-spark">No trend data</span>';
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));
  const valueSeries = [];
  for (let i = 0; i < days; i++) { const d = new Date(start); d.setDate(start.getDate() + i); const key = d.toISOString().slice(0, 10);
    valueSeries.push(contacts.filter(c => (c.createdAt || '').slice(0, 10) <= key).reduce((s, c) => s + (Number(c.value) || 0), 0)); }
  put('#kpiValueSpark', valueSeries);
}

function renderHeaderDate() {
  const el = $('#headerDatePill');
  if (el) el.textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

/* ---- Top Lead Sources (dashboard — always visible, with a real period filter) ---- */
let topSourcesRangeFilter = '30';
function topSourcesBounds() {
  const now = new Date(); now.setHours(23, 59, 59, 999);
  if (topSourcesRangeFilter === 'all') return null;
  let start;
  if (topSourcesRangeFilter === 'month') { start = new Date(now.getFullYear(), now.getMonth(), 1); }
  else { start = new Date(now); start.setDate(start.getDate() - (Number(topSourcesRangeFilter) - 1)); start.setHours(0, 0, 0, 0); }
  return { start, end: now };
}
function renderTopSources() {
  const bounds = topSourcesBounds();
  const inScope = bounds ? contacts.filter(c => inRange(c.createdAt, bounds)) : contacts;
  const withSource = inScope.filter(c => c.leadSource);
  const listEl = $('#topSourcesList');
  if (!withSource.length) {
    listEl.innerHTML = emptyStateHtml('No data yet', 'No lead sources have been recorded for this period.');
    return;
  }
  const counts = {};
  withSource.forEach(c => { counts[c.leadSource] = (counts[c.leadSource] || 0) + 1; });
  const total = withSource.length;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...sorted.map(([, c]) => c));
  listEl.innerHTML = sorted.map(([name, count]) => {
    const pct = Math.round((count / total) * 100);
    const barPct = Math.round((count / max) * 100);
    const emphasize = name === 'LinkedIn' || name === 'OnlineJobs.ph';
    return `
      <div class="aging-row ${emphasize ? 'emphasize' : ''}" data-source="${escapeHtml(name)}">
        <span class="aging-label">${escapeHtml(name)}</span>
        <div class="aging-track"><div class="aging-fill" style="width:${Math.max(6, barPct)}%;background:${emphasize ? '#6C5CE7' : '#8C7FEA'}"></div></div>
        <span class="aging-count">${count}</span>
        <span class="aging-pct">${pct}%</span>
      </div>
    `;
  }).join('');
  listEl.querySelectorAll('.aging-row').forEach(row => {
    row.addEventListener('click', () => {
      contactSourceFilter = row.dataset.source;
      const sel = $('#contactSourceFilter'); if (sel) sel.value = row.dataset.source;
      goToView('contacts');
    });
  });
}
function initTopSourcesRange() {
  $('#topSourcesRange').addEventListener('change', (e) => {
    topSourcesRangeFilter = e.target.value;
    renderTopSources();
  });
}

/* ---- Donut chart builder (shared by Pipeline Overview and Client Health) ---- */
function buildDonut(segments, size, thickness) {
  size = size || 120; thickness = thickness || 14;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, seg) => s + seg.count, 0);
  if (!total) return null;
  let offset = 0;
  const circles = segments.filter(seg => seg.count > 0).map(seg => {
    const frac = seg.count / total;
    const dash = frac * c;
    const circle = `<circle class="donut-segment" data-key="${escapeHtml(seg.key || seg.label)}" style="color:${seg.color}" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${thickness}" stroke-dasharray="${dash.toFixed(2)} ${(c - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" stroke-linecap="butt"><title>${escapeHtml(seg.label)}: ${seg.count}</title></circle>`;
    offset += dash;
    return circle;
  }).join('');
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--lavender)" stroke-width="${thickness}"/>
    ${circles}
  </svg>`;
}

/* Hover-sync a donut's segments with its breakdown row list (dims unrelated, brightens hovered). */
function syncDonutHover(donutWrapEl, breakdownEl) {
  const segments = donutWrapEl.querySelectorAll('.donut-segment');
  const rows = breakdownEl.querySelectorAll('.donut-row');
  function setActive(key) {
    donutWrapEl.classList.toggle('has-selection', !!key);
    segments.forEach(seg => seg.classList.toggle('dash-selected', seg.dataset.key === key));
    rows.forEach(row => row.classList.toggle('dash-dimmed', !!key && row.dataset.key !== key));
  }
  segments.forEach(seg => {
    seg.addEventListener('mouseenter', () => setActive(seg.dataset.key));
    seg.addEventListener('mouseleave', () => setActive(null));
  });
  rows.forEach(row => {
    row.addEventListener('mouseenter', () => setActive(row.dataset.key));
    row.addEventListener('mouseleave', () => setActive(null));
  });
}

/* ---- Pipeline Overview (donut + breakdown, dashboard) ---- */
function renderPipelineOverview() {
  const donutEl = $('#pipelineDonut');
  const breakdownEl = $('#pipelineBreakdown');
  const stages = STAGES.filter(s => s.key !== 'lost').map(s => ({ label: s.label, key: s.key, color: s.color, count: contacts.filter(c => c.stage === s.key).length }));
  const total = stages.reduce((s, x) => s + x.count, 0);
  if (!total) {
    donutEl.innerHTML = '';
    breakdownEl.innerHTML = emptyStateHtml('No pipeline data yet', 'Your pipeline will appear here as leads progress.');
    return;
  }
  const donut = buildDonut(stages.map(s => ({ label: s.label, count: s.count, color: s.color, key: s.key })));
  donutEl.innerHTML = `${donut}<div class="donut-center"><div class="dc-value">${total}</div><div class="dc-label">Total Leads</div></div>`;
  breakdownEl.innerHTML = stages.map(s => {
    const pct = Math.round((s.count / total) * 100);
    return `
      <div class="donut-row" data-key="${s.key}">
        <span class="dot" style="background:${s.color}"></span>
        <span class="dr-label">${s.label}</span>
        <div class="dr-track"><div class="dr-fill" style="width:${pct}%;background:${s.color}"></div></div>
        <span class="dr-count">${s.count}</span>
        <span class="dr-pct">${pct}%</span>
      </div>
    `;
  }).join('');
  breakdownEl.querySelectorAll('.donut-row').forEach(row => {
    row.addEventListener('click', () => {
      contactsFilter = { label: STAGES.find(s => s.key === row.dataset.key).label, predicate: (c) => c.stage === row.dataset.key };
      goToView('contacts');
    });
  });
  syncDonutHover(donutEl, breakdownEl);
}

/* ---- Multi-series Lead Activity chart (dashboard) — only series with real data are shown ---- */
function renderDashboardLeadActivity(days) {
  const container = $('#lineChartWrap');
  const legendEl = $('#leadActivityLegend');
  if (!contacts.length) {
    legendEl.innerHTML = '';
    container.innerHTML = emptyStateHtml('Not enough data yet', 'Lead activity will appear here once you have contacts.');
    return;
  }
  const series = [];
  series.push({ label: 'New Leads', color: '#6C5CE7', values: dailyCountSeries(days, 'createdAt') });
  if (contacts.some(c => c.bookingDate)) series.push({ label: 'Meetings', color: '#F4B942', values: dailyCountSeries(days, 'bookingDate') });
  if (tasks.length) {
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));
    const values = [];
    for (let i = 0; i < days; i++) { const d = new Date(start); d.setDate(start.getDate() + i); const key = d.toISOString().slice(0, 10);
      values.push(tasks.filter(t => (t.createdAt || '').slice(0, 10) === key).length); }
    series.push({ label: 'Follow-Ups', color: '#3B82F6', values });
  }
  if (contacts.some(c => c.stage === 'client')) {
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));
    const values = [];
    for (let i = 0; i < days; i++) { const d = new Date(start); d.setDate(start.getDate() + i); const key = d.toISOString().slice(0, 10);
      values.push(contacts.filter(c => c.stage === 'client' && (c.lastActivity || '').slice(0, 10) === key).length); }
    series.push({ label: 'Clients', color: '#43B883', values });
  }
  legendEl.innerHTML = series.map(s => `<div class="chart-legend-item"><span class="dot" style="background:${s.color}"></span>${s.label}</div>`).join('');
  renderMultiLineChart(container, series, days);
}
function renderMultiLineChart(container, series, days) {
  const w = Math.max(560, days * 30), h = 220, padTop = 24, padBottom = 30, padX = 24;
  const max = Math.max(1, ...series.flatMap(s => s.values));
  const stepX = (w - padX * 2) / Math.max(1, days - 1);
  const dateLabels = []; { const start = new Date(); start.setDate(start.getDate() - (days - 1));
    for (let i = 0; i < days; i++) { const d = new Date(start); d.setDate(start.getDate() + i); dateLabels.push(d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })); } }
  const showEvery = days > 10 ? Math.ceil(days / 10) : 1;

  const allCoords = series.map(s => s.values.map((v, i) => ({ x: padX + i * stepX, y: padTop + (1 - v / max) * (h - padTop - padBottom), v })));
  const lines = series.map((s, si) => {
    const coords = allCoords[si];
    const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
    const points = coords.map((c, i) => `<circle cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="2.5" fill="${s.color}"><title>${dateLabels[i]} · ${s.label}: ${c.v}</title></circle>`).join('');
    return `<path d="${pathD}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${points}`;
  }).join('');
  const axisLabels = dateLabels.map((lbl, i) => i % showEvery === 0 ? `<text class="line-chart-label" x="${(padX + i * stepX).toFixed(1)}" y="${h - 8}" text-anchor="middle">${lbl}</text>` : '').join('');
  const guideLine = `<line class="chart-guide-line" x1="${padX}" y1="${padTop}" x2="${padX}" y2="${h - padBottom}"></line>`;
  const hoverDots = series.map(s => `<circle class="chart-hover-dot" r="5" fill="${s.color}" cx="${padX}" cy="${padTop}"></circle>`).join('');

  container.style.position = 'relative';
  container.innerHTML = `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMinYMid meet">
    <rect class="chart-overlay-rect" x="0" y="0" width="${w}" height="${h}"></rect>
    ${lines}${axisLabels}${guideLine}${hoverDots}
  </svg>`;

  const svgEl = container.querySelector('.chart-svg');
  const overlay = container.querySelector('.chart-overlay-rect');
  const guideLineEl = container.querySelector('.chart-guide-line');
  const hoverDotEls = container.querySelectorAll('.chart-hover-dot');
  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  container.appendChild(tooltip);

  let pinnedIndex = null;
  function showAt(index) {
    const x = padX + index * stepX;
    guideLineEl.setAttribute('x1', x); guideLineEl.setAttribute('x2', x); guideLineEl.classList.add('visible');
    hoverDotEls.forEach((dot, si) => {
      const c = allCoords[si][index];
      dot.setAttribute('cx', c.x); dot.setAttribute('cy', c.y); dot.classList.add('visible');
    });
    tooltip.innerHTML = `<div class="ct-date">${dateLabels[index]}</div>` +
      series.map((s, si) => `<div class="ct-row"><span class="ct-dot" style="background:${s.color}"></span>${s.label}: <strong>${allCoords[si][index].v}</strong></div>`).join('');
    const rect = svgEl.getBoundingClientRect();
    if (rect.width) {
      const scaleX = rect.width / w;
      const px = x * scaleX;
      tooltip.style.left = Math.min(rect.width - 150, Math.max(0, px + 10)) + 'px';
      tooltip.style.top = '4px';
    }
    tooltip.classList.add('visible');
  }
  function hideAll() {
    guideLineEl.classList.remove('visible');
    hoverDotEls.forEach(d => d.classList.remove('visible'));
    tooltip.classList.remove('visible');
  }
  function indexFromEvent(e) {
    const rect = svgEl.getBoundingClientRect();
    if (!rect.width) return 0;
    const relX = (e.clientX - rect.left) / rect.width * w;
    return Math.max(0, Math.min(days - 1, Math.round((relX - padX) / stepX)));
  }
  overlay.addEventListener('mousemove', (e) => showAt(indexFromEvent(e)));
  overlay.addEventListener('mouseleave', () => { if (pinnedIndex !== null) showAt(pinnedIndex); else hideAll(); });
  overlay.addEventListener('click', (e) => {
    const idx = indexFromEvent(e);
    pinnedIndex = (pinnedIndex === idx) ? null : idx;
    if (pinnedIndex !== null) showAt(pinnedIndex); else hideAll();
  });
}

/* ---- Upcoming Appointments (dashboard, full-width table) ---- */
function apptStatusFor(c) {
  if (c.stage === 'lost') return 'Cancelled';
  return 'Confirmed';
}
function renderUpcomingAppointments() {
  const el = $('#upcomingApptsTableWrap');
  const upcoming = contacts.filter(c => c.bookingDate && daysUntil(c.bookingDate) >= 0).sort((a, b) => a.bookingDate.localeCompare(b.bookingDate)).slice(0, 8);
  if (!upcoming.length) { el.innerHTML = emptyStateHtml('No appointments scheduled', 'Upcoming bookings from your automation will appear here.'); return; }
  el.innerHTML = `
    <table class="kmo-table">
      <thead><tr><th>Date</th><th>Time</th><th>Contact</th><th>Type</th><th>Status</th><th>Actions</th></tr></thead>
      <tbody>
        ${upcoming.map(c => {
          const status = apptStatusFor(c);
          const statusColor = status === 'Cancelled' ? 'var(--error)' : 'var(--success)';
          return `
            <tr class="exec-clickable-row" data-id="${c.id}">
              <td>${fmtDateShort(c.bookingDate)}, ${new Date(c.bookingDate + 'T00:00:00').getFullYear()}</td>
              <td>${escapeHtml(c.bookingTime || '—')}</td>
              <td><div class="kmo-metric-cell"><div class="avatar" style="width:26px;height:26px;font-size:10.5px;">${initials(c.name)}</div>${escapeHtml(c.name)}</div></td>
              <td>${escapeHtml(c.opportunity || c.service || 'General')}</td>
              <td><span class="status-badge" style="background:${statusColor}1a;color:${statusColor}">${status}</span></td>
              <td>${c.meetingLink ? `<a href="${escapeHtml(c.meetingLink)}" target="_blank" rel="noopener" class="row-link" onclick="event.stopPropagation()">Join</a>` : '<span class="kmo-dash">—</span>'}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
  el.querySelectorAll('.exec-clickable-row').forEach(row => {
    row.addEventListener('click', () => { const c = contacts.find(x => x.id === row.dataset.id); if (c) openModal(c); });
  });
}

/* ================= Quick Actions bar ================= */
function quickCreateInvoiceFlow(presetContactId) {
  if (!contacts.length) { alert('Add a contact first.'); return; }
  let contactId = presetContactId;
  if (!contactId) {
    const names = contacts.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    const pick = prompt(`Create invoice for which client? Enter a number:\n${names}`);
    const idx = Number(pick) - 1;
    if (!contacts[idx]) return;
    contactId = contacts[idx].id;
  }
  const amount = prompt('Invoice amount ($):');
  if (!amount) return;
  const dueDate = prompt('Due date (YYYY-MM-DD):', '');
  createInvoice(contactId, amount, dueDate).then(() => showToast('Invoice created'));
}
function quickUploadDocumentFlow(presetContactId) {
  pendingUploadContactId = presetContactId || '';
  $('#documentFileInput').click();
  const handler = (e) => {
    const file = e.target.files[0];
    if (file) {
      let contactId = pendingUploadContactId;
      if (!contactId && contacts.length) {
        const names = contacts.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
        const pick = prompt(`Assign to which client? Enter a number, or leave blank for unassigned:\n${names}`);
        const idx = Number(pick) - 1;
        if (contacts[idx]) contactId = contacts[idx].id;
      }
      const type = prompt(`Document type (${DOCUMENT_TYPES.join(', ')}):`, 'Other');
      uploadDocument(file, file.name, contactId, DOCUMENT_TYPES.includes(type) ? type : 'Other').then(() => showToast('Document uploaded'));
    }
    e.target.value = '';
    $('#documentFileInput').removeEventListener('change', handler);
  };
  $('#documentFileInput').addEventListener('change', handler);
}
function quickScheduleFlow() {
  if (!contacts.length) { alert('Add a contact first.'); return; }
  const names = contacts.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
  const pick = prompt(`Schedule with which client? Enter a number:\n${names}`);
  const idx = Number(pick) - 1;
  if (!contacts[idx]) return;
  const date = prompt('Appointment date (YYYY-MM-DD):', todayStr());
  if (!date) return;
  const time = prompt('Appointment time:', '10:00 AM');
  updateContact(contacts[idx].id, { bookingDate: date, bookingTime: time || '' }).then(() => showToast('Appointment scheduled'));
}
function quickAddFollowUpFlow() {
  if (!contacts.length) { alert('Add a contact first.'); return; }
  const names = contacts.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
  const pick = prompt(`Add a follow-up for which client? Enter a number:\n${names}`);
  const idx = Number(pick) - 1;
  if (!contacts[idx]) return;
  const date = prompt('Follow-up date (YYYY-MM-DD):', todayStr());
  if (!date) return;
  updateContact(contacts[idx].id, { nextFollowUp: date }).then(() => showToast('Follow-up added'));
}
function quickCreateTaskFlow() {
  const title = prompt('Task title:');
  if (!title) return;
  let contactId = '';
  if (contacts.length) {
    const names = contacts.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
    const pick = prompt(`Link to which client? Enter a number, or leave blank:\n${names}`);
    const idx = Number(pick) - 1;
    if (contacts[idx]) contactId = contacts[idx].id;
  }
  const due = prompt('Due date (YYYY-MM-DD), optional:', '');
  createTask(title, due, contactId, 'Medium').then(() => showToast('Task created'));
}
function initQuickActionsBar() {
  $('#qaAddContact').addEventListener('click', () => openModal(null));
  $('#qaSchedule').addEventListener('click', quickScheduleFlow);
  $('#qaCreateTask').addEventListener('click', quickCreateTaskFlow);
  $('#qaAddFollowUp').addEventListener('click', quickAddFollowUpFlow);
  $('#qaCreateInvoice').addEventListener('click', () => quickCreateInvoiceFlow());
  $('#qaUploadDocument').addEventListener('click', () => quickUploadDocumentFlow());
}

/* ================= Line chart & Funnel ================= */
function buildDailySeries(days, mode) {
  const points = [];
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    let value;
    if (mode === 'value') {
      value = contacts.filter(c => (c.createdAt || '').slice(0, 10) <= key).reduce((s, c) => s + (Number(c.value) || 0), 0);
    } else {
      value = contacts.filter(c => (c.createdAt || '').slice(0, 10) === key).length;
    }
    points.push({ label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value });
  }
  return points;
}
function renderLineChart(container, series, mode) {
  if (!series.length) { container.innerHTML = emptyStateHtml('No data yet', 'This chart fills in as bookings come through.'); return; }
  const w = Math.max(560, series.length * 46);
  const h = 220, padTop = 24, padBottom = 30, padX = 24;
  const max = Math.max(1, ...series.map(p => p.value));
  const stepX = (w - padX * 2) / Math.max(1, series.length - 1);
  const coords = series.map((p, i) => {
    const x = padX + i * stepX;
    const y = padTop + (1 - p.value / max) * (h - padTop - padBottom);
    return { x, y, ...p };
  });
  const pathD = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const areaD = `${pathD} L${coords[coords.length - 1].x.toFixed(1)},${h - padBottom} L${coords[0].x.toFixed(1)},${h - padBottom} Z`;
  const showEvery = series.length > 10 ? Math.ceil(series.length / 10) : 1;
  const guideLine = `<line class="chart-guide-line" x1="${padX}" y1="${padTop}" x2="${padX}" y2="${h - padBottom}"></line>`;
  const hoverDot = `<circle class="chart-hover-dot" r="5" fill="#8B6CFF" cx="${padX}" cy="${padTop}"></circle>`;

  container.style.position = 'relative';
  container.innerHTML = `
    <svg class="chart-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMinYMid meet">
      <defs><linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6C5CE7" stop-opacity="0.18"/><stop offset="100%" stop-color="#6C5CE7" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${areaD}" fill="url(#lineFill)" stroke="none" class="chart-area-path"></path>
      <path d="${pathD}" fill="none" stroke="#6C5CE7" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" class="chart-line-path"></path>
      <rect class="chart-overlay-rect" x="0" y="0" width="${w}" height="${h}"></rect>
      ${coords.map((c, i) => `
        <circle class="line-chart-point" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5"></circle>
        ${i % showEvery === 0 ? `<text class="line-chart-label" x="${c.x.toFixed(1)}" y="${h - 8}" text-anchor="middle">${escapeHtml(c.label)}</text>` : ''}
      `).join('')}
      ${guideLine}${hoverDot}
    </svg>
  `;
  if (!prefersReducedMotion()) {
    const linePath = container.querySelector('.chart-line-path');
    const len = linePath.getTotalLength();
    linePath.style.strokeDasharray = len;
    linePath.style.strokeDashoffset = len;
    linePath.getBoundingClientRect();
    linePath.style.transition = 'stroke-dashoffset .6s ease';
    linePath.style.strokeDashoffset = '0';
  }

  const svgEl = container.querySelector('.chart-svg');
  const overlay = container.querySelector('.chart-overlay-rect');
  const guideLineEl = container.querySelector('.chart-guide-line');
  const hoverDotEl = container.querySelector('.chart-hover-dot');
  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  container.appendChild(tooltip);

  let pinnedIndex = null;
  function showAt(index) {
    const c = coords[index];
    guideLineEl.setAttribute('x1', c.x); guideLineEl.setAttribute('x2', c.x); guideLineEl.classList.add('visible');
    hoverDotEl.setAttribute('cx', c.x); hoverDotEl.setAttribute('cy', c.y); hoverDotEl.classList.add('visible');
    tooltip.innerHTML = `<div class="ct-date">${escapeHtml(c.label)}</div><div class="ct-row"><span class="ct-dot" style="background:#6C5CE7"></span>${mode === 'value' ? fmtMoney(c.value) : c.value}</div>`;
    const rect = svgEl.getBoundingClientRect();
    if (rect.width) {
      const scaleX = rect.width / w;
      const px = c.x * scaleX;
      tooltip.style.left = Math.min(rect.width - 150, Math.max(0, px + 10)) + 'px';
      tooltip.style.top = '4px';
    }
    tooltip.classList.add('visible');
  }
  function hideAll() {
    guideLineEl.classList.remove('visible');
    hoverDotEl.classList.remove('visible');
    tooltip.classList.remove('visible');
  }
  function indexFromEvent(e) {
    const rect = svgEl.getBoundingClientRect();
    if (!rect.width) return 0;
    const relX = (e.clientX - rect.left) / rect.width * w;
    return Math.max(0, Math.min(coords.length - 1, Math.round((relX - padX) / stepX)));
  }
  overlay.addEventListener('mousemove', (e) => showAt(indexFromEvent(e)));
  overlay.addEventListener('mouseleave', () => { if (pinnedIndex !== null) showAt(pinnedIndex); else hideAll(); });
  overlay.addEventListener('click', (e) => {
    const idx = indexFromEvent(e);
    pinnedIndex = (pinnedIndex === idx) ? null : idx;
    if (pinnedIndex !== null) showAt(pinnedIndex); else hideAll();
  });
}
const FUNNEL_ORDER = ['new', 'confirmed', 'held', 'proposal', 'client'];
function renderFunnel(container) {
  const active = contacts.filter(c => c.stage !== 'lost');
  const lost = contacts.filter(c => c.stage === 'lost');
  const idxOf = (c) => FUNNEL_ORDER.indexOf(c.stage);
  const counts = FUNNEL_ORDER.map((key, i) => active.filter(c => idxOf(c) >= i).length);
  const max = Math.max(1, counts[0]);
  if (!contacts.length) { container.innerHTML = emptyStateHtml('No pipeline data yet', 'Your funnel fills in as leads move through stages.'); return; }
  container.innerHTML = `
    <div class="funnel">
      ${FUNNEL_ORDER.map((key, i) => {
        const stage = STAGES.find(s => s.key === key);
        const count = counts[i];
        const pct = Math.round((count / max) * 100);
        const dropFromPrev = i > 0 && counts[i - 1] > 0 ? Math.round(((counts[i - 1] - count) / counts[i - 1]) * 100) : null;
        return `
          <div class="funnel-row">
            <div class="funnel-labels">
              <span class="funnel-stage"><span class="dot" style="background:${stage.color}"></span>${stage.label}</span>
              <span class="funnel-stats">${count} ${dropFromPrev ? `<span class="funnel-drop">−${dropFromPrev}%</span>` : ''}</span>
            </div>
            <div class="funnel-bar-track"><div class="funnel-bar-fill" style="width:${Math.max(pct, count ? 10 : 0)}%;background:${stage.color}"><span>${count}</span></div></div>
          </div>
        `;
      }).join('')}
      ${lost.length ? `<div class="funnel-lost-note">● ${lost.length} lead${lost.length === 1 ? '' : 's'} marked Lost along the way (excluded above)</div>` : ''}
    </div>
  `;
}

/* ================= PIPELINE ================= */
let pipelineSourceFilter = 'all';
function renderBoard() {
  const board = $('#board');
  board.innerHTML = '';
  const list = filteredContacts().filter(c => pipelineSourceFilter === 'all' || c.leadSource === pipelineSourceFilter);
  STAGES.forEach((stage, colIndex) => {
    const items = list.filter(c => c.stage === stage.key);
    const total = items.reduce((s, c) => s + (Number(c.value) || 0), 0);
    const col = document.createElement('div');
    col.className = 'column';
    col.style.setProperty('--col-i', colIndex);
    col.innerHTML = `
      <div class="column-header">
        <div class="column-title"><span class="dot" style="background:${stage.color}"></span>${stage.label}</div>
        <span class="column-count">${items.length}</span>
      </div>
      <div class="column-total">${fmtMoney(total)}</div>
      <div class="column-cards" data-stage="${stage.key}"></div>
    `;
    const cardsEl = col.querySelector('.column-cards');
    items.forEach(c => cardsEl.appendChild(renderCard(c)));
    cardsEl.addEventListener('dragover', (e) => { e.preventDefault(); cardsEl.classList.add('drag-over'); });
    cardsEl.addEventListener('dragleave', () => cardsEl.classList.remove('drag-over'));
    cardsEl.addEventListener('drop', async (e) => {
      e.preventDefault(); cardsEl.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      await updateContact(id, { stage: stage.key });
    });
    board.appendChild(col);
  });
}
function nextActionText(c) {
  if (followupBucket(c) === 'overdue') return 'Follow-up overdue';
  if (isTodayAppointment(c)) return 'Appointment today';
  return null;
}
function renderCard(c) {
  const card = document.createElement('div');
  card.className = 'card';
  card.draggable = true;
  card.dataset.id = c.id;
  card.style.setProperty('--card-accent', stageOf(c).color);
  const na = nextActionText(c);
  card.innerHTML = `
    <div class="card-top">
      <div class="avatar">${initials(c.name)}</div>
      <div><div class="card-name">${escapeHtml(c.name)}</div><div class="card-service">${escapeHtml(c.opportunity || c.service || 'General inquiry')}</div>${c.leadSource ? `<div class="card-source">${escapeHtml(c.leadSource)}</div>` : ''}</div>
    </div>
    <div class="card-meta">
      ${c.email ? `<span>✉ ${escapeHtml(c.email)}</span>` : ''}
      ${c.phone ? `<span>☎ ${escapeHtml(c.phone)}</span>` : ''}
    </div>
    <div class="card-footer">
      <span class="card-value">${c.value ? fmtMoney(c.value) : ''}</span>
      <span class="card-date">${escapeHtml(c.bookingDate || '')}</span>
    </div>
    ${na ? `<div class="card-next-action">● ${na}</div>` : ''}
  `;
  card.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', c.id); card.classList.add('dragging'); });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('click', () => {
    document.querySelectorAll('.card.row-selected').forEach(x => x.classList.remove('row-selected'));
    card.classList.add('row-selected');
    openModal(c);
  });
  return card;
}

/* ================= CONTACTS ================= */
let contactSourceFilter = 'all';
function contactChipPredicate(c) {
  if (contactChip === 'leads') return isActive(c);
  if (contactChip === 'clients') return c.stage === 'client';
  if (contactChip === 'active') return c.stage !== 'lost';
  if (contactChip === 'inactive') return c.stage === 'lost';
  return true;
}
function contactSourcePredicate(c) {
  if (contactSourceFilter === 'all') return true;
  return c.leadSource === contactSourceFilter;
}
function sourceBadgeHtml(c) {
  return c.leadSource ? `<span class="source-badge">${escapeHtml(c.leadSource)}</span>` : '<span class="kmo-dash">—</span>';
}
function renderTable() {
  const body = $('#contactsTableBody');
  const list = filteredContacts().filter(contactChipPredicate).filter(contactSourcePredicate);
  body.innerHTML = '';
  $('#contactsEmpty').innerHTML = list.length ? '' : emptyStateHtml('No contacts found', 'Try clearing your search or filters.');
  list.forEach(c => {
    const stage = stageOf(c);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div class="name-cell"><div class="avatar">${initials(c.name)}</div>${escapeHtml(c.name)}</div></td>
      <td>${escapeHtml(c.company || '—')}</td>
      <td>${sourceBadgeHtml(c)}</td>
      <td>${escapeHtml(c.email || '—')}</td>
      <td>${escapeHtml(c.phone || '—')}</td>
      <td><span class="status-badge" style="background:${stage.color}1a;color:${stage.color}"><span class="dot" style="background:${stage.color}"></span>${stage.label}</span></td>
      <td>${healthBadgeHtml(c)}</td>
      <td>${c.value ? fmtMoney(c.value) : '—'}</td>
      <td><button class="row-link">View</button></td>
    `;
    tr.addEventListener('click', () => {
      body.querySelectorAll('tr.row-selected').forEach(r => r.classList.remove('row-selected'));
      tr.classList.add('row-selected');
      openModal(c);
    });
    body.appendChild(tr);
  });
}
function initContactFilters() {
  document.querySelectorAll('#contactFilters .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#contactFilters .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      contactChip = chip.dataset.filter;
      renderTable();
    });
  });
  $('#contactSourceFilter').addEventListener('change', (e) => {
    contactSourceFilter = e.target.value;
    renderTable();
  });
}

/* ================= APPOINTMENTS — Scheduling Command Center ================= */
function parseApptMinutes(t) {
  if (!t) return null;
  const m = String(t).trim().match(/^(\d{1,2}):?(\d{2})?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3] ? m[3].toUpperCase() : null;
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  if (h > 23 || min > 59 || h < 0) return null;
  return h * 60 + min;
}
function weekDatesFor(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d); monday.setDate(d.getDate() + mondayOffset);
  const out = [];
  for (let i = 0; i < 7; i++) { const x = new Date(monday); x.setDate(monday.getDate() + i); out.push(x.toISOString().slice(0, 10)); }
  return out;
}
function apptStatus(c) {
  if (c.stage === 'lost') return 'Cancelled';
  if (daysUntil(c.bookingDate) < 0) return 'Completed';
  return 'Scheduled';
}
function apptStatusColor(status) {
  return { Cancelled: 'var(--error)', Completed: 'var(--success)', Scheduled: 'var(--primary)' }[status] || 'var(--primary)';
}
function apptDayList(dateStr) {
  return baseFiltered().filter(c => c.bookingDate === dateStr)
    .filter(c => apptFilter === 'all' || apptStatus(c) === apptFilter)
    .filter(c => apptSourceFilter === 'all' || c.leadSource === apptSourceFilter)
    .filter(c => apptServiceFilter === 'all' || c.service === apptServiceFilter);
}
function renderAppointments() {
  const el = $('#appointmentsContent');
  const withBooking = contacts.filter(c => c.bookingDate);
  if (!withBooking.length) {
    el.innerHTML = `
      <div class="appt-header-row">
        <div><h2 class="appt-title">Scheduling Command Center</h2><p class="muted-sub">Manage today's schedule, upcoming meetings, and appointment activity.</p></div>
        <button class="btn btn-primary" id="apptScheduleBtn">+ Schedule Appointment</button>
      </div>
      ${emptyStateHtml('No appointments yet', 'Booked meetings from your automation will appear here.')}
    `;
    $('#apptScheduleBtn').addEventListener('click', quickScheduleFlow);
    return;
  }

  const todayCount = withBooking.filter(c => c.bookingDate === todayStr()).length;
  const upcomingCount = withBooking.filter(c => { const d = daysUntil(c.bookingDate); return d >= 1 && d <= 7; }).length;
  const completedCount = withBooking.filter(c => apptStatus(c) === 'Completed').length;
  const cancelledCount = withBooking.filter(c => apptStatus(c) === 'Cancelled').length;

  const weekDates = weekDatesFor(apptWeekAnchor);
  const railHtml = weekDates.map(d => {
    const dt = new Date(d + 'T00:00:00');
    const hasAppt = withBooking.some(c => c.bookingDate === d);
    return `
      <button class="appt-rail-day ${d === apptSelectedDate ? 'selected' : ''} ${d === todayStr() ? 'is-today' : ''}" data-date="${d}">
        <span class="rd-dow">${dt.toLocaleDateString(undefined, { weekday: 'short' })}</span>
        <span class="rd-num">${dt.getDate()}</span>
        <span class="rd-mon">${dt.toLocaleDateString(undefined, { month: 'short' })}</span>
        ${hasAppt ? '<span class="rd-dot"></span>' : ''}
      </button>
    `;
  }).join('');

  const filters = ['all', 'Scheduled', 'Completed', 'Cancelled'];
  const filterHtml = filters.map(f => `<button class="filter-chip ${apptFilter === f ? 'active' : ''}" data-appt-filter="${f}">${f === 'all' ? 'All' : f}</button>`).join('');
  const sourceOptionsHtml = ['<option value="all">All Sources</option>', ...APPT_SOURCES.map(s => `<option ${apptSourceFilter === s ? 'selected' : ''}>${s}</option>`)].join('');
  const serviceOptionsHtml = ['<option value="all">All Services</option>', ...APPT_SERVICES.map(s => `<option ${apptServiceFilter === s ? 'selected' : ''}>${s}</option>`)].join('');

  const dayList = apptDayList(apptSelectedDate);
  const withMinutes = dayList.map(c => ({ c, mins: parseApptMinutes(c.bookingTime) }))
    .sort((a, b) => (a.mins ?? 9999) - (b.mins ?? 9999));
  const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
  const isToday = apptSelectedDate === todayStr();
  let nowInserted = !isToday;
  let timelineHtml = '';
  if (!withMinutes.length) {
    timelineHtml = emptyStateHtml('No appointments scheduled', 'Your schedule is clear for this day.');
  } else {
    timelineHtml = '<div class="appt-timeline">';
    withMinutes.forEach(({ c, mins }) => {
      if (!nowInserted && mins !== null && mins >= nowMins) {
        timelineHtml += apptNowRowHtml();
        nowInserted = true;
      }
      timelineHtml += apptTimelineRowHtml(c);
    });
    if (!nowInserted) timelineHtml += apptNowRowHtml();
    timelineHtml += '</div>';
  }

  el.innerHTML = `
    <div class="appt-header-row">
      <div><h2 class="appt-title">Scheduling Command Center</h2><p class="muted-sub">Manage today's schedule, upcoming meetings, and appointment activity.</p></div>
      <button class="btn btn-primary" id="apptScheduleBtn">+ Schedule Appointment</button>
    </div>
    <div class="appt-kpi-row">
      <div class="appt-kpi"><div class="appt-kpi-icon">📅</div><div><div class="appt-kpi-label">Today</div><div class="appt-kpi-value">${todayCount}</div><div class="appt-kpi-sub">Appointments scheduled</div></div></div>
      <div class="appt-kpi"><div class="appt-kpi-icon">🗓️</div><div><div class="appt-kpi-label">Upcoming</div><div class="appt-kpi-value">${upcomingCount}</div><div class="appt-kpi-sub">Next 7 days</div></div></div>
      <div class="appt-kpi"><div class="appt-kpi-icon">✅</div><div><div class="appt-kpi-label">Completed</div><div class="appt-kpi-value">${completedCount}</div><div class="appt-kpi-sub">Completed appointments</div></div></div>
      <div class="appt-kpi"><div class="appt-kpi-icon">⛔</div><div><div class="appt-kpi-label">Cancelled</div><div class="appt-kpi-value">${cancelledCount}</div><div class="appt-kpi-sub">Cancelled appointments</div></div></div>
    </div>
    <div class="appt-date-rail">
      <button class="appt-rail-nav" id="apptWeekPrev">‹</button>
      <div class="appt-rail-days">${railHtml}</div>
      <button class="appt-rail-nav" id="apptWeekNext">›</button>
    </div>
    <div class="appt-filter-bar">
      <div class="filter-chips">${filterHtml}</div>
      <div class="appt-filter-selects">
        <select class="exec-range-select" id="apptSourceSelect">${sourceOptionsHtml}</select>
        <select class="exec-range-select" id="apptServiceSelect">${serviceOptionsHtml}</select>
      </div>
    </div>
    <div class="appt-main-grid">
      <div class="appt-timeline-col">
        <div class="panel appt-timeline-panel">${timelineHtml}</div>
      </div>
      <div class="appt-side-col">
        <div class="panel appt-agenda" id="apptAgenda"></div>
        <div class="panel appt-quick-info" id="apptQuickInfo"></div>
      </div>
    </div>
  `;
  initAppointmentsInteractions(el, withBooking);
  renderApptAgenda(withBooking);
  renderApptQuickInfo(withBooking);
}
function apptNowRowHtml() {
  return `<div class="appt-now-row"><div class="appt-now-dot"></div><div class="appt-now-line"><span class="appt-now-label">NOW</span></div></div>`;
}
function apptTimelineRowHtml(c) {
  const status = apptStatus(c);
  const timeLabel = c.bookingTime ? escapeHtml(c.bookingTime) : '—';
  return `
    <div class="appt-timeline-row">
      <div class="appt-time-label">${timeLabel}</div>
      <div class="appt-node"></div>
      <div class="appt-card ${apptSelectedId === c.id ? 'row-selected' : ''}" data-id="${c.id}">
        <div class="avatar">${initials(c.name)}</div>
        <div class="appt-card-main">
          <div class="appt-card-name">${escapeHtml(c.name)}</div>
          <div class="appt-card-sub">${escapeHtml(c.opportunity || c.service || 'General inquiry')}</div>
          <div class="appt-card-meta">
            ${c.leadSource ? sourceBadgeHtml(c) : ''}
            <span class="status-badge" style="background:${stageOf(c).color}1a;color:${stageOf(c).color}">${stageOf(c).label}</span>
            <span class="status-badge" style="background:${apptStatusColor(status)}1a;color:${apptStatusColor(status)}">${status}</span>
          </div>
        </div>
        ${c.value ? `<div class="appt-card-value">${fmtMoney(c.value)}</div>` : ''}
        <div class="appt-card-actions">
          <button class="btn btn-ghost btn-sm appt-view-btn" data-id="${c.id}">View</button>
          ${status === 'Scheduled' ? `<button class="btn btn-ghost btn-sm appt-cancel-btn" data-id="${c.id}" style="color:var(--error);">Cancel</button>` : ''}
        </div>
      </div>
    </div>
  `;
}
function initAppointmentsInteractions(el, withBooking) {
  $('#apptScheduleBtn').addEventListener('click', quickScheduleFlow);
  $('#apptWeekPrev').addEventListener('click', () => {
    const d = new Date(apptWeekAnchor + 'T00:00:00'); d.setDate(d.getDate() - 7);
    apptWeekAnchor = d.toISOString().slice(0, 10);
    apptSelectedDate = weekDatesFor(apptWeekAnchor)[0];
    renderAppointments();
  });
  $('#apptWeekNext').addEventListener('click', () => {
    const d = new Date(apptWeekAnchor + 'T00:00:00'); d.setDate(d.getDate() + 7);
    apptWeekAnchor = d.toISOString().slice(0, 10);
    apptSelectedDate = weekDatesFor(apptWeekAnchor)[0];
    renderAppointments();
  });
  el.querySelectorAll('.appt-rail-day').forEach(btn => {
    btn.addEventListener('click', () => { apptSelectedDate = btn.dataset.date; apptSelectedId = null; renderAppointments(); });
  });
  el.querySelectorAll('[data-appt-filter]').forEach(btn => {
    btn.addEventListener('click', () => { apptFilter = btn.dataset.apptFilter; renderAppointments(); });
  });
  $('#apptSourceSelect').addEventListener('change', (e) => { apptSourceFilter = e.target.value; renderAppointments(); });
  $('#apptServiceSelect').addEventListener('change', (e) => { apptServiceFilter = e.target.value; renderAppointments(); });
  el.querySelectorAll('.appt-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      apptSelectedId = card.dataset.id;
      el.querySelectorAll('.appt-card.row-selected').forEach(x => x.classList.remove('row-selected'));
      card.classList.add('row-selected');
      renderApptQuickInfo(withBooking);
      const c = contacts.find(x => x.id === card.dataset.id);
      if (c) openModal(c);
    });
  });
  el.querySelectorAll('.appt-view-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      apptSelectedId = btn.dataset.id;
      el.querySelectorAll('.appt-card.row-selected').forEach(x => x.classList.remove('row-selected'));
      btn.closest('.appt-card')?.classList.add('row-selected');
      renderApptQuickInfo(withBooking);
      const c = contacts.find(x => x.id === btn.dataset.id);
      if (c) openModal(c);
    });
  });
  el.querySelectorAll('.appt-cancel-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('Cancel this appointment?')) updateContact(btn.dataset.id, { stage: 'lost' });
    });
  });
}
function renderApptQuickInfo(withBooking) {
  const container = $('#apptQuickInfo');
  const c = apptSelectedId ? contacts.find(x => x.id === apptSelectedId) : null;
  if (!c || !c.bookingDate) {
    container.innerHTML = `<h4>Selected Appointment</h4><p class="muted-sub" style="margin:0;">Select an appointment to view details.</p>`;
    return;
  }
  const status = apptStatus(c);
  container.innerHTML = `
    <h4>Selected Appointment</h4>
    <div class="appt-qi-row"><span class="appt-qi-label">Client</span><span class="appt-qi-value">${escapeHtml(c.name)}</span></div>
    <div class="appt-qi-row"><span class="appt-qi-label">Service</span><span class="appt-qi-value">${escapeHtml(c.opportunity || c.service || '—')}</span></div>
    <div class="appt-qi-row"><span class="appt-qi-label">Date</span><span class="appt-qi-value">${fmtDateShort(c.bookingDate)}</span></div>
    <div class="appt-qi-row"><span class="appt-qi-label">Time</span><span class="appt-qi-value">${c.bookingTime ? escapeHtml(c.bookingTime) : '—'}</span></div>
    <div class="appt-qi-row"><span class="appt-qi-label">Status</span><span class="status-badge" style="background:${apptStatusColor(status)}1a;color:${apptStatusColor(status)}">${status}</span></div>
    <div class="appt-qi-row"><span class="appt-qi-label">Value</span><span class="appt-qi-value">${c.value ? fmtMoney(c.value) : '—'}</span></div>
    <div class="appt-qi-actions">
      <button class="btn btn-secondary btn-sm" id="apptQiView">View / Edit</button>
      ${status === 'Scheduled' ? `<button class="btn btn-ghost btn-sm" id="apptQiCancel" style="color:var(--error);">Cancel</button>` : ''}
    </div>
  `;
  $('#apptQiView').addEventListener('click', () => openModal(c));
  const cancelBtn = $('#apptQiCancel');
  if (cancelBtn) cancelBtn.addEventListener('click', () => { if (confirm('Cancel this appointment?')) updateContact(c.id, { stage: 'lost' }); });
}
function renderApptAgenda(withBooking) {
  const container = $('#apptAgenda');
  const today = withBooking.filter(c => c.bookingDate === todayStr())
    .map(c => ({ c, mins: parseApptMinutes(c.bookingTime) }))
    .sort((a, b) => (a.mins ?? 9999) - (b.mins ?? 9999));
  container.innerHTML = `<h4>Today's Agenda</h4>` + (
    today.length
      ? today.map(({ c }) => `
        <div class="appt-agenda-item ${apptSelectedId === c.id ? 'row-selected' : ''}" data-id="${c.id}">
          <div class="appt-agenda-time">${c.bookingTime ? escapeHtml(c.bookingTime) : '—'}</div>
          <div><div class="appt-agenda-name">${escapeHtml(c.name)}</div><div class="appt-agenda-sub">${escapeHtml(c.opportunity || c.service || 'General inquiry')}</div></div>
        </div>
      `).join('')
      : `<p class="muted-sub" style="margin:0;">No appointments scheduled for today.</p>`
  );
  container.querySelectorAll('.appt-agenda-item').forEach(item => {
    item.addEventListener('click', () => {
      apptSelectedDate = todayStr();
      apptWeekAnchor = apptSelectedDate;
      apptSelectedId = item.dataset.id;
      renderAppointments();
    });
  });
}

/* ================= CALENDAR — Master Business Calendar ================= */
const CAL_CATEGORY_META = {
  appointments: { label: 'Appointments', color: '#6C5CE7' },
  tasks: { label: 'Tasks', color: '#2196F3' },
  followups: { label: 'Follow-Ups', color: '#EC4899' },
  billing: { label: 'Billing', color: '#F4B942' },
  projects: { label: 'Projects', color: '#43D39E' },
};
function calAllEvents() {
  const events = [];
  contacts.filter(c => c.bookingDate).forEach(c => events.push({
    id: `appt-${c.id}`, category: 'appointments', date: c.bookingDate, time: c.bookingTime || '',
    title: c.name, sub: c.opportunity || c.service || 'Appointment', contactId: c.id,
  }));
  contacts.filter(c => c.nextFollowUp).forEach(c => events.push({
    id: `fu-${c.id}`, category: 'followups', date: c.nextFollowUp, time: '',
    title: c.name, sub: 'Follow-up due', contactId: c.id,
  }));
  tasks.filter(t => t.dueDate && t.status !== 'done').forEach(t => events.push({
    id: `task-${t.id}`, category: 'tasks', date: t.dueDate, time: '',
    title: t.title, sub: 'Task due', taskId: t.id,
  }));
  invoices.filter(i => i.dueDate && invoiceEffectiveStatus(i) !== 'Paid').forEach(i => events.push({
    id: `inv-${i.id}`, category: 'billing', date: i.dueDate, time: '',
    title: `Invoice ${i.invoiceNumber}`, sub: 'Payment due', invoiceId: i.id,
  }));
  projects.filter(p => p.dueDate).forEach(p => events.push({
    id: `proj-${p.id}`, category: 'projects', date: p.dueDate, time: '',
    title: p.name, sub: 'Project deadline', projectId: p.id,
  }));
  return events;
}
function calOpenEvent(ev) {
  if (ev.contactId) { const c = contacts.find(x => x.id === ev.contactId); if (c) openModal(c); return; }
  if (ev.taskId) { goToView('tasks'); return; }
  if (ev.invoiceId) { goToView('billing'); return; }
  if (ev.projectId) {
    const p = projects.find(x => x.id === ev.projectId);
    const c = p && contacts.find(x => x.id === p.contactId);
    if (c) openModal(c); else goToView('projects');
  }
}
function calEventIsOverdue(ev) {
  return ev.category !== 'appointments' && daysUntil(ev.date) < 0;
}
function renderCalendar() {
  const el = $('#calendarContent');
  const allEvents = calAllEvents();
  const visibleEvents = calFilter === 'all' ? allEvents : allEvents.filter(e => e.category === calFilter);

  const countFor = (cat) => allEvents.filter(e => e.category === cat).length;
  const kpis = [
    { key: 'all', label: 'Total Events', value: allEvents.length },
    { key: 'appointments', label: 'Appointments', value: countFor('appointments') },
    { key: 'tasks', label: 'Tasks', value: countFor('tasks') },
    { key: 'followups', label: 'Follow-Ups', value: countFor('followups') },
    { key: 'billing', label: 'Billing', value: countFor('billing') },
    { key: 'projects', label: 'Projects', value: countFor('projects') },
  ];
  const kpiHtml = kpis.map(k => `
    <div class="cal2-kpi ${calFilter === k.key ? 'active' : ''}" data-cal-kpi="${k.key}">
      <div class="cal2-kpi-value">${k.value}</div>
      <div class="cal2-kpi-label">${k.label}</div>
    </div>
  `).join('');

  const filterHtml = ['all', 'appointments', 'tasks', 'followups', 'billing', 'projects'].map(cat => {
    const meta = cat === 'all' ? { label: 'All', color: null } : CAL_CATEGORY_META[cat];
    return `<button class="filter-chip ${calFilter === cat ? 'active' : ''}" data-cal-filter="${cat}">${meta.color ? `<span class="cal2-dot" style="background:${meta.color}"></span>` : ''}${meta.label}</button>`;
  }).join('');

  const year = calendarMonth.getFullYear(), month = calendarMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let grid = dows.map(d => `<div class="calendar-dow">${d}</div>`).join('');
  for (let i = 0; i < startOffset; i++) grid += `<div class="cal2-day empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayEvents = visibleEvents.filter(e => e.date === dateStr).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
    const isToday = dateStr === todayStr();
    const isSelected = dateStr === calSelectedDate;
    const shown = dayEvents.slice(0, 2);
    const extra = dayEvents.length - shown.length;
    grid += `
      <div class="cal2-day ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}" data-date="${dateStr}">
        <div class="cal2-day-top"><span class="cal2-day-num">${day}</span>${isToday ? '<span class="cal2-today-tag">Today</span>' : ''}</div>
        <div class="cal2-day-events">
          ${shown.map(e => `<div class="cal2-event-chip" style="background:${CAL_CATEGORY_META[e.category].color}22;color:${CAL_CATEGORY_META[e.category].color}" data-event-id="${e.id}">${e.time ? escapeHtml(e.time) + ' · ' : ''}${escapeHtml(e.title)}</div>`).join('')}
          ${extra > 0 ? `<div class="cal2-more">+${extra} more</div>` : ''}
        </div>
      </div>
    `;
  }

  el.innerHTML = `
    <div class="appt-header-row">
      <div><h2 class="appt-title">Master Business Calendar</h2><p class="muted-sub">See appointments, tasks, follow-ups, billing dates, and project deadlines at a glance.</p></div>
    </div>
    <div class="cal2-kpi-row">${kpiHtml}</div>
    <div class="cal2-controls">
      <div class="cal2-controls-left">
        <button class="appt-rail-nav" id="calPrev">‹</button>
        <button class="btn btn-secondary btn-sm" id="calToday">Today</button>
        <h3 class="cal2-month-label">${calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
        <button class="appt-rail-nav" id="calNext">›</button>
      </div>
    </div>
    <div class="appt-filter-bar"><div class="filter-chips">${filterHtml}</div></div>
    <div class="cal2-main-grid">
      <div class="panel cal2-grid-panel">
        <div class="cal2-grid">${grid}</div>
      </div>
      <div class="cal2-side-col">
        <div class="panel cal2-agenda" id="calAgenda"></div>
        <div class="panel cal2-upcoming" id="calUpcoming"></div>
      </div>
    </div>
  `;
  initCalendarInteractions(el, allEvents);
  renderCalAgenda(allEvents);
  renderCalUpcoming(allEvents);
}
function initCalendarInteractions(el, allEvents) {
  $('#calPrev').addEventListener('click', () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1); renderCalendar(); });
  $('#calNext').addEventListener('click', () => { calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1); renderCalendar(); });
  $('#calToday').addEventListener('click', () => {
    calendarMonth = (() => { const d = new Date(); d.setDate(1); return d; })();
    calSelectedDate = todayStr();
    renderCalendar();
  });
  el.querySelectorAll('[data-cal-kpi]').forEach(btn => {
    btn.addEventListener('click', () => { calFilter = btn.dataset.calKpi; renderCalendar(); });
  });
  el.querySelectorAll('[data-cal-filter]').forEach(btn => {
    btn.addEventListener('click', () => { calFilter = btn.dataset.calFilter; renderCalendar(); });
  });
  el.querySelectorAll('.cal2-day[data-date]').forEach(day => {
    day.addEventListener('click', (e) => {
      if (e.target.closest('.cal2-event-chip')) return;
      calSelectedDate = day.dataset.date;
      renderCalendar();
    });
  });
  el.querySelectorAll('.cal2-event-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const ev = allEvents.find(x => x.id === chip.dataset.eventId);
      if (ev) calOpenEvent(ev);
    });
  });
}
function renderCalAgenda(allEvents) {
  const container = $('#calAgenda');
  const dayEvents = allEvents.filter(e => e.date === calSelectedDate).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const counts = {};
  ['appointments', 'tasks', 'followups', 'billing', 'projects'].forEach(cat => { counts[cat] = dayEvents.filter(e => e.category === cat).length; });
  const isToday = calSelectedDate === todayStr();
  const dateLabel = new Date(calSelectedDate + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  container.innerHTML = `
    <h4>${isToday ? "Today's Agenda" : 'Selected Day'}</h4>
    <p class="muted-sub" style="margin:0 0 12px;">${dateLabel}</p>
    <div class="cal2-summary-row">
      ${['appointments', 'tasks', 'followups', 'billing', 'projects'].map(cat => `
        <div class="cal2-summary-item">
          <span class="cal2-dot" style="background:${CAL_CATEGORY_META[cat].color}"></span>
          <span>${counts[cat]} ${CAL_CATEGORY_META[cat].label}</span>
        </div>
      `).join('')}
    </div>
    <div class="cal2-agenda-list">
      ${dayEvents.length ? dayEvents.map(e => `
        <div class="cal2-agenda-item ${calEventIsOverdue(e) ? 'overdue' : ''}" data-event-id="${e.id}">
          <span class="cal2-dot" style="background:${CAL_CATEGORY_META[e.category].color}"></span>
          <div class="cal2-agenda-main">
            <div class="cal2-agenda-title">${e.time ? escapeHtml(e.time) + ' · ' : ''}${escapeHtml(e.title)}</div>
            <div class="cal2-agenda-sub">${escapeHtml(e.sub)}${calEventIsOverdue(e) ? ' · Overdue' : ''}</div>
          </div>
        </div>
      `).join('') : `<p class="muted-sub" style="margin:0;">No activity scheduled for this day.</p>`}
    </div>
  `;
  container.querySelectorAll('.cal2-agenda-item').forEach(item => {
    item.addEventListener('click', () => { const ev = allEvents.find(x => x.id === item.dataset.eventId); if (ev) calOpenEvent(ev); });
  });
}
function renderCalUpcoming(allEvents) {
  const container = $('#calUpcoming');
  const upcoming = allEvents.filter(e => daysUntil(e.date) > 0).sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || '')).slice(0, 6);
  const overdue = allEvents.filter(e => calEventIsOverdue(e));
  container.innerHTML = `
    ${overdue.length ? `
      <h4 style="color:var(--error);">Overdue</h4>
      <div class="cal2-agenda-list" style="margin-bottom:14px;">
        ${overdue.slice(0, 5).map(e => `
          <div class="cal2-agenda-item overdue" data-event-id="${e.id}">
            <span class="cal2-dot" style="background:${CAL_CATEGORY_META[e.category].color}"></span>
            <div class="cal2-agenda-main">
              <div class="cal2-agenda-title">${escapeHtml(e.title)}</div>
              <div class="cal2-agenda-sub">${escapeHtml(e.sub)} · ${fmtDateShort(e.date)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}
    <h4>Upcoming Events</h4>
    <div class="cal2-agenda-list">
      ${upcoming.length ? upcoming.map(e => {
        const dayLabel = daysUntil(e.date) === 1 ? 'Tomorrow' : new Date(e.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long' });
        return `
          <div class="cal2-agenda-item" data-event-id="${e.id}">
            <span class="cal2-dot" style="background:${CAL_CATEGORY_META[e.category].color}"></span>
            <div class="cal2-agenda-main">
              <div class="cal2-agenda-title">${escapeHtml(e.title)}</div>
              <div class="cal2-agenda-sub">${dayLabel}${e.time ? ' · ' + escapeHtml(e.time) : ''} · ${escapeHtml(e.sub)}</div>
            </div>
          </div>
        `;
      }).join('') : `<p class="muted-sub" style="margin:0;">No upcoming events.</p>`}
    </div>
  `;
  container.querySelectorAll('.cal2-agenda-item').forEach(item => {
    item.addEventListener('click', () => { const ev = allEvents.find(x => x.id === item.dataset.eventId); if (ev) calOpenEvent(ev); });
  });
}

/* ================= TASKS ================= */
async function createTask(title, dueDate, contactId, priority) {
  const res = await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, dueDate, contactId: contactId || '', priority: priority || 'Medium' }) });
  const created = await res.json();
  tasks.unshift(created);
  render();
}
async function toggleTask(id, status) {
  const res = await fetch(`/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  const updated = await res.json();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx !== -1) tasks[idx] = updated;
  render();
}
async function deleteTask(id) {
  await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
  tasks = tasks.filter(t => t.id !== id);
  render();
}
function populateTaskContactSelect() {
  const sel = $('#taskContact');
  const current = sel.value;
  sel.innerHTML = '<option value="">No client</option>' + contacts.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  sel.value = current;
}
function taskDueLabel(t) {
  if (!t.dueDate) return 'No due date';
  const d = daysUntil(t.dueDate);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return fmtDateShort(t.dueDate);
}
function taskStatusLabel(t) { return t.status === 'done' ? 'Completed' : 'To Do'; }
function taskStatusColor(t) { return t.status === 'done' ? 'var(--success)' : 'var(--plum)'; }
const TASK_BUCKET_ORDER = { overdue: 0, today: 1, upcoming: 2, completed: 3 };
function taskFilteredList() {
  const term = taskSearchTerm.trim().toLowerCase();
  return tasks
    .filter(t => taskChip === 'all' || taskBucket(t) === taskChip)
    .filter(t => taskPriorityFilter === 'all' || t.priority === taskPriorityFilter)
    .filter(t => taskClientFilter === 'all' || t.contactId === taskClientFilter)
    .filter(t => {
      if (!term) return true;
      const contact = contacts.find(c => c.id === t.contactId);
      return t.title.toLowerCase().includes(term) ||
        (contact && contact.name.toLowerCase().includes(term)) ||
        (contact && (contact.company || '').toLowerCase().includes(term));
    });
}
function renderTasksPage() {
  const el = $('#tasksPageContent');
  const total = tasks.length;
  const dueToday = tasks.filter(t => taskBucket(t) === 'today').length;
  const overdue = tasks.filter(t => taskBucket(t) === 'overdue').length;
  const completed = tasks.filter(t => t.status === 'done').length;

  const focusTasks = [
    ...tasks.filter(t => taskBucket(t) === 'overdue'),
    ...tasks.filter(t => taskBucket(t) === 'today' && t.priority === 'High'),
    ...tasks.filter(t => taskBucket(t) === 'today' && t.priority !== 'High'),
  ].filter((t, i, arr) => arr.findIndex(x => x.id === t.id) === i).slice(0, 4);

  const filterTabs = ['all', 'today', 'upcoming', 'overdue', 'completed'];
  const tabLabels = { all: 'All', today: 'Today', upcoming: 'Upcoming', overdue: 'Overdue', completed: 'Completed' };
  const tabsHtml = filterTabs.map(f => `<button class="filter-chip ${taskChip === f ? 'active' : ''}" data-task-chip="${f}">${tabLabels[f]}</button>`).join('');

  const clientOptions = ['<option value="all">All Clients</option>', '<option value="">Internal</option>',
    ...contacts.map(c => `<option value="${c.id}" ${taskClientFilter === c.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`)].join('');
  const priorityOptions = ['all', 'High', 'Medium', 'Low'].map(p => `<option value="${p}" ${taskPriorityFilter === p ? 'selected' : ''}>${p === 'all' ? 'All Priorities' : p}</option>`).join('');

  const filteredList = taskFilteredList();
  const sorted = [...filteredList].sort((a, b) => {
    const ba = TASK_BUCKET_ORDER[taskBucket(a)], bb = TASK_BUCKET_ORDER[taskBucket(b)];
    if (ba !== bb) return ba - bb;
    return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
  });

  el.innerHTML = `
    <div class="appt-header-row">
      <div><h2 class="appt-title">Work Management Center</h2><p class="muted-sub">Everything you need to get done, organized by priority and deadline.</p></div>
    </div>
    <div class="appt-kpi-row">
      <div class="appt-kpi"><div class="appt-kpi-icon">📋</div><div><div class="appt-kpi-label">Total Tasks</div><div class="appt-kpi-value">${total}</div><div class="appt-kpi-sub">Active tasks</div></div></div>
      <div class="appt-kpi"><div class="appt-kpi-icon">📅</div><div><div class="appt-kpi-label">Due Today</div><div class="appt-kpi-value">${dueToday}</div><div class="appt-kpi-sub">Needs attention today</div></div></div>
      <div class="appt-kpi"><div class="appt-kpi-icon">⚠️</div><div><div class="appt-kpi-label">Overdue</div><div class="appt-kpi-value">${overdue}</div><div class="appt-kpi-sub">Past due</div></div></div>
      <div class="appt-kpi"><div class="appt-kpi-icon">✅</div><div><div class="appt-kpi-label">Completed</div><div class="appt-kpi-value">${completed}</div><div class="appt-kpi-sub">Completed tasks</div></div></div>
    </div>
    <div class="panel task-focus-panel">
      <h4>Today's Focus</h4>
      ${focusTasks.length ? `<div class="task-focus-list">${focusTasks.map(t => taskFocusItemHtml(t)).join('')}</div>` : `<p class="muted-sub" style="margin:0;">You're all caught up.</p>`}
    </div>
    <div class="task-action-bar">
      <div class="search task-search"><svg viewBox="0 0 24 24"><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35"/></svg><input type="text" id="taskSearchInput" placeholder="Search tasks..." value="${escapeHtml(taskSearchTerm)}" /></div>
      <select class="exec-range-select" id="taskClientSelect">${clientOptions}</select>
      <select class="exec-range-select" id="taskPrioritySelect">${priorityOptions}</select>
      <form id="taskQuickAddForm" class="task-quick-add">
        <input id="taskTitle" type="text" placeholder="New task title..." required />
        <select id="taskContact"><option value="">No client</option></select>
        <select id="taskPriority"><option>Medium</option><option>High</option><option>Low</option></select>
        <input id="taskDue" type="date" />
        <button type="submit" class="btn btn-primary btn-sm">+ Add Task</button>
      </form>
    </div>
    <div class="appt-filter-bar filter-chips">${tabsHtml}</div>
    <div class="table-wrap">
      <table class="contacts-table task-mgmt-table">
        <thead>
          <tr><th></th><th>Task</th><th>Client</th><th>Due Date</th><th>Priority</th><th>Status</th><th></th></tr>
        </thead>
        <tbody id="taskTableBody"></tbody>
      </table>
      <div id="tasksEmpty"></div>
    </div>
  `;
  populateTaskContactSelect();
  const body = $('#taskTableBody');
  const emptyEl = $('#tasksEmpty');
  if (!tasks.length) {
    emptyEl.innerHTML = emptyStateHtml('No tasks yet', 'Add a task above to keep track of client work.');
  } else if (!sorted.length) {
    emptyEl.innerHTML = emptyStateHtml('No tasks found', 'Nothing matches this view.');
  } else {
    emptyEl.innerHTML = '';
    body.innerHTML = sorted.map(taskTableRowHtml).join('');
  }
  initTasksInteractions(el);
}
function taskFocusItemHtml(t) {
  const contact = contacts.find(c => c.id === t.contactId);
  const overdue = taskBucket(t) === 'overdue';
  return `
    <div class="task-focus-item" data-id="${t.id}">
      <span class="task-priority ${t.priority}">${t.priority}</span>
      <div class="task-focus-main">
        <div class="task-focus-title">${escapeHtml(t.title)}</div>
        <div class="task-focus-sub">${contact ? escapeHtml(contact.name) : 'Internal'} · ${overdue ? `<span style="color:var(--error);font-weight:700;">Overdue</span>` : taskDueLabel(t)}</div>
      </div>
    </div>
  `;
}
function taskTableRowHtml(t) {
  const done = t.status === 'done';
  const contact = contacts.find(c => c.id === t.contactId);
  const overdue = taskBucket(t) === 'overdue';
  return `
    <tr class="${done ? 'task-row-done' : ''} ${taskSelectedId === t.id ? 'row-selected' : ''}" data-id="${t.id}">
      <td><button class="task-check ${done ? 'checked' : ''}" data-id="${t.id}" data-done="${done}">${done ? '✓' : ''}</button></td>
      <td><div class="task-title-cell">${escapeHtml(t.title)}</div></td>
      <td>${contact ? `<a href="#" class="task-client-link" data-id="${contact.id}">${escapeHtml(contact.name)}</a>${contact.company ? `<div class="task-client-company">${escapeHtml(contact.company)}</div>` : ''}` : '<span class="kmo-dash">Internal</span>'}</td>
      <td>${overdue ? `<span style="color:var(--error);font-weight:700;">Overdue</span><div class="task-client-company">${fmtDateShort(t.dueDate)}</div>` : taskDueLabel(t)}</td>
      <td><span class="task-priority ${t.priority}">${t.priority}</span></td>
      <td><span class="status-badge" style="background:${taskStatusColor(t)}1a;color:${taskStatusColor(t)}">${taskStatusLabel(t)}</span></td>
      <td><button class="btn btn-ghost btn-sm task-delete" data-id="${t.id}">Delete</button></td>
    </tr>
  `;
}
function initTasksInteractions(el) {
  $('#taskSearchInput').addEventListener('input', (e) => { taskSearchTerm = e.target.value; renderTasksPage(); });
  $('#taskClientSelect').addEventListener('change', (e) => { taskClientFilter = e.target.value; renderTasksPage(); });
  $('#taskPrioritySelect').addEventListener('change', (e) => { taskPriorityFilter = e.target.value; renderTasksPage(); });
  $('#taskQuickAddForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#taskTitle').value.trim();
    if (!title) return;
    createTask(title, $('#taskDue').value, $('#taskContact').value, $('#taskPriority').value);
  });
  el.querySelectorAll('[data-task-chip]').forEach(btn => {
    btn.addEventListener('click', () => { taskChip = btn.dataset.taskChip; renderTasksPage(); });
  });
  el.querySelectorAll('.task-check').forEach(box => box.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTask(box.dataset.id, box.dataset.done === 'true' ? 'open' : 'done');
  }));
  el.querySelectorAll('.task-delete').forEach(btn => btn.addEventListener('click', (e) => { e.stopPropagation(); deleteTask(btn.dataset.id); }));
  el.querySelectorAll('.task-client-link').forEach(link => link.addEventListener('click', (e) => { e.stopPropagation(); const c = contacts.find(x => x.id === link.dataset.id); if (c) openModal(c); }));
  el.querySelectorAll('#taskTableBody tr[data-id]').forEach(row => {
    row.addEventListener('click', () => { taskSelectedId = row.dataset.id; el.querySelectorAll('#taskTableBody tr.row-selected').forEach(r => r.classList.remove('row-selected')); row.classList.add('row-selected'); });
  });
  el.querySelectorAll('.task-focus-item').forEach(item => {
    item.addEventListener('click', () => {
      taskSelectedId = item.dataset.id;
      const row = el.querySelector(`#taskTableBody tr[data-id="${item.dataset.id}"]`);
      if (row) { row.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' }); row.classList.add('row-selected'); }
    });
  });
}

/* ================= FOLLOW-UPS ================= */
/* ================= FOLLOW-UPS — Follow-Up Command Center ================= */
const FU_BUCKET_ORDER = { overdue: 0, today: 1, upcoming: 2, waiting: 3, completed: 4 };
function fuIsWaiting(c) { return followupBucket(c) !== 'completed' && c.sourceStatus === 'Contacted'; }
function fuEffectiveBucket(c) {
  const b = followupBucket(c);
  if (b === 'overdue' || b === 'today' || b === 'completed') return b;
  return fuIsWaiting(c) ? 'waiting' : 'upcoming';
}
function fuStatusLabel(c) {
  return { overdue: 'Overdue', today: 'Due Today', waiting: 'Waiting for Reply', upcoming: 'Upcoming', completed: 'Completed' }[fuEffectiveBucket(c)];
}
function fuStatusColor(c) {
  return { overdue: 'var(--error)', today: 'var(--warning)', waiting: 'var(--warning)', upcoming: 'var(--primary)', completed: 'var(--success)' }[fuEffectiveBucket(c)];
}
function fuNextLabel(c) {
  if (!c.nextFollowUp) return '<span class="kmo-dash">No date set</span>';
  const d = daysUntil(c.nextFollowUp);
  if (d < 0) return `<span style="color:var(--error);font-weight:700;">Overdue</span><div class="task-client-company">${fmtDateShort(c.nextFollowUp)}</div>`;
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  return fmtDateShort(c.nextFollowUp);
}
function fuFilteredList() {
  const term = fuSearchTerm.trim().toLowerCase();
  return baseFiltered()
    .filter(isActive)
    .filter(c => fuFilter === 'all' || fuEffectiveBucket(c) === fuFilter)
    .filter(c => fuSourceFilter === 'all' || c.leadSource === fuSourceFilter)
    .filter(c => {
      if (!term) return true;
      return (c.name || '').toLowerCase().includes(term) ||
        (c.company || '').toLowerCase().includes(term) ||
        (c.notes || '').toLowerCase().includes(term) ||
        (c.opportunity || '').toLowerCase().includes(term) ||
        (c.leadSource || '').toLowerCase().includes(term);
    });
}
function renderFollowups() {
  const el = $('#followupsContent');
  const all = contacts.filter(isActive);
  const total = all.length;
  const dueToday = all.filter(c => followupBucket(c) === 'today').length;
  const overdue = all.filter(c => followupBucket(c) === 'overdue').length;
  const completed = contacts.filter(c => followupBucket(c) === 'completed').length;

  const tabs = ['all', 'today', 'upcoming', 'overdue', 'waiting', 'completed'];
  const tabLabels = { all: 'All', today: 'Due Today', upcoming: 'Upcoming', overdue: 'Overdue', waiting: 'Waiting for Reply', completed: 'Completed' };
  const tabsHtml = tabs.map(f => `<button class="filter-chip ${fuFilter === f ? 'active' : ''}" data-fu-filter="${f}">${tabLabels[f]}</button>`).join('');
  const sourceOptions = ['<option value="all">All Sources</option>', ...APPT_SOURCES.map(s => `<option ${fuSourceFilter === s ? 'selected' : ''}>${s}</option>`)].join('');

  const sorted = [...fuFilteredList()].sort((a, b) => {
    const ba = FU_BUCKET_ORDER[fuEffectiveBucket(a)], bb = FU_BUCKET_ORDER[fuEffectiveBucket(b)];
    if (ba !== bb) return ba - bb;
    return (a.nextFollowUp || '9999').localeCompare(b.nextFollowUp || '9999');
  });

  el.innerHTML = `
    <div class="appt-header-row">
      <div><h2 class="appt-title">Follow-Up Command Center</h2><p class="muted-sub">Never lose track of a lead, client, or conversation.</p></div>
      <button class="btn btn-primary" id="fuAddBtn">+ Add Follow-Up</button>
    </div>
    <div class="appt-kpi-row">
      <div class="appt-kpi"><div class="appt-kpi-icon">📇</div><div><div class="appt-kpi-label">Total Follow-Ups</div><div class="appt-kpi-value">${total}</div><div class="appt-kpi-sub">Active follow-ups</div></div></div>
      <div class="appt-kpi"><div class="appt-kpi-icon">📅</div><div><div class="appt-kpi-label">Due Today</div><div class="appt-kpi-value">${dueToday}</div><div class="appt-kpi-sub">Need contact today</div></div></div>
      <div class="appt-kpi"><div class="appt-kpi-icon">⚠️</div><div><div class="appt-kpi-label">Overdue</div><div class="appt-kpi-value">${overdue}</div><div class="appt-kpi-sub">Past due</div></div></div>
      <div class="appt-kpi"><div class="appt-kpi-icon">✅</div><div><div class="appt-kpi-label">Completed</div><div class="appt-kpi-value">${completed}</div><div class="appt-kpi-sub">Completed follow-ups</div></div></div>
    </div>
    <div class="appt-filter-bar filter-chips">${tabsHtml}</div>
    <div class="task-action-bar">
      <div class="search task-search"><svg viewBox="0 0 24 24"><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35"/></svg><input type="text" id="fuSearchInput" placeholder="Search name, company, notes..." value="${escapeHtml(fuSearchTerm)}" /></div>
      <select class="exec-range-select" id="fuSourceSelect">${sourceOptions}</select>
    </div>
    <div class="appt-main-grid">
      <div class="appt-timeline-col">
        <div class="table-wrap">
          <table class="contacts-table task-mgmt-table">
            <thead><tr><th></th><th>Contact / Company</th><th>Last Contact</th><th>Next Follow-Up</th><th>Contact Via</th><th>Status</th><th></th></tr></thead>
            <tbody id="fuTableBody"></tbody>
          </table>
          <div id="fuEmpty"></div>
        </div>
      </div>
      <div class="appt-side-col">
        <div class="panel appt-agenda" id="fuToday"></div>
        <div class="panel appt-agenda" id="fuUpcoming"></div>
        <div class="panel appt-quick-info" id="fuSelected"></div>
      </div>
    </div>
  `;
  const body = $('#fuTableBody');
  const emptyEl = $('#fuEmpty');
  if (!all.length) {
    emptyEl.innerHTML = emptyStateHtml('No follow-ups yet', 'Add a follow-up to keep track of important conversations.');
  } else if (!sorted.length) {
    emptyEl.innerHTML = emptyStateHtml('No follow-ups found', 'Nothing matches this view.');
  } else {
    emptyEl.innerHTML = '';
    body.innerHTML = sorted.map(fuTableRowHtml).join('');
  }
  initFollowupsInteractions(el);
  renderFuToday();
  renderFuUpcoming();
  renderFuSelected();
}
function fuTableRowHtml(c) {
  const done = followupBucket(c) === 'completed';
  return `
    <tr class="${fuSelectedId === c.id ? 'row-selected' : ''}" data-id="${c.id}">
      <td><button class="task-check ${done ? 'checked' : ''}" data-id="${c.id}" ${done ? 'disabled' : ''}>${done ? '✓' : ''}</button></td>
      <td><div class="name-cell"><div class="avatar">${initials(c.name)}</div><div><div class="task-title-cell">${escapeHtml(c.name)}</div>${c.company ? `<div class="task-client-company">${escapeHtml(c.company)}</div>` : ''}</div></div></td>
      <td>${c.lastContactedAt ? fmtDateShort(c.lastContactedAt) : 'No contact yet'}</td>
      <td>${fuNextLabel(c)}</td>
      <td>${c.phone ? `<a href="tel:${escapeHtml(c.phone)}" class="row-link" onclick="event.stopPropagation()">Call</a>` : ''}${c.phone && c.email ? ' · ' : ''}${c.email ? `<a href="mailto:${escapeHtml(c.email)}" class="row-link" onclick="event.stopPropagation()">Email</a>` : ''}${!c.phone && !c.email ? '<span class="kmo-dash">—</span>' : ''}</td>
      <td><span class="status-badge" style="background:${fuStatusColor(c)}1a;color:${fuStatusColor(c)}">${fuStatusLabel(c)}</span></td>
      <td>${!done ? `<button class="btn btn-ghost btn-sm fu-complete" data-id="${c.id}">Complete</button>` : ''}</td>
    </tr>
  `;
}
function fuSelectAndRefresh(id) {
  fuSelectedId = id;
  document.querySelectorAll('#fuTableBody tr.row-selected').forEach(r => r.classList.remove('row-selected'));
  const row = document.querySelector(`#fuTableBody tr[data-id="${id}"]`);
  if (row) row.classList.add('row-selected');
  renderFuSelected();
}
function initFollowupsInteractions(el) {
  $('#fuAddBtn').addEventListener('click', quickAddFollowUpFlow);
  $('#fuSearchInput').addEventListener('input', (e) => { fuSearchTerm = e.target.value; renderFollowups(); });
  $('#fuSourceSelect').addEventListener('change', (e) => { fuSourceFilter = e.target.value; renderFollowups(); });
  el.querySelectorAll('[data-fu-filter]').forEach(btn => {
    btn.addEventListener('click', () => { fuFilter = btn.dataset.fuFilter; renderFollowups(); });
  });
  el.querySelectorAll('#fuTableBody tr[data-id]').forEach(row => {
    row.addEventListener('click', () => fuSelectAndRefresh(row.dataset.id));
  });
  el.querySelectorAll('.task-check:not([disabled])').forEach(box => box.addEventListener('click', (e) => {
    e.stopPropagation();
    updateContact(box.dataset.id, { nextFollowUp: '', lastContactedAt: todayStr() });
  }));
  el.querySelectorAll('.fu-complete').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    updateContact(btn.dataset.id, { nextFollowUp: '', lastContactedAt: todayStr() });
  }));
}
function renderFuToday() {
  const container = $('#fuToday');
  const list = contacts.filter(c => c.nextFollowUp === todayStr());
  container.innerHTML = `<h4>Today's Follow-Ups</h4>` + (
    list.length
      ? list.map(c => `
        <div class="appt-agenda-item ${fuSelectedId === c.id ? 'row-selected' : ''}" data-id="${c.id}">
          <div><div class="appt-agenda-name">${escapeHtml(c.name)}</div><div class="appt-agenda-sub">${c.company ? escapeHtml(c.company) + ' · ' : ''}${c.phone ? 'Phone' : c.email ? 'Email' : 'No contact info'}</div></div>
        </div>
      `).join('')
      : `<p class="muted-sub" style="margin:0;">No follow-ups scheduled today.</p>`
  );
  container.querySelectorAll('.appt-agenda-item').forEach(item => item.addEventListener('click', () => fuSelectAndRefresh(item.dataset.id)));
}
function renderFuUpcoming() {
  const container = $('#fuUpcoming');
  const list = contacts.filter(c => c.nextFollowUp && daysUntil(c.nextFollowUp) > 0)
    .sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp)).slice(0, 6);
  container.innerHTML = `<h4>Upcoming Follow-Ups</h4>` + (
    list.length
      ? list.map(c => {
        const dayLabel = daysUntil(c.nextFollowUp) === 1 ? 'Tomorrow' : fmtDateShort(c.nextFollowUp);
        return `
          <div class="appt-agenda-item ${fuSelectedId === c.id ? 'row-selected' : ''}" data-id="${c.id}">
            <div><div class="appt-agenda-name">${escapeHtml(c.name)}</div><div class="appt-agenda-sub">${dayLabel}</div></div>
          </div>
        `;
      }).join('')
      : `<p class="muted-sub" style="margin:0;">No upcoming follow-ups.</p>`
  );
  container.querySelectorAll('.appt-agenda-item').forEach(item => item.addEventListener('click', () => fuSelectAndRefresh(item.dataset.id)));
}
function renderFuSelected() {
  const container = $('#fuSelected');
  const c = fuSelectedId ? contacts.find(x => x.id === fuSelectedId) : null;
  if (!c) {
    container.innerHTML = `<h4>Selected Contact</h4><p class="muted-sub" style="margin:0;">Select a follow-up to view details.</p>`;
    return;
  }
  container.innerHTML = `
    <h4>${escapeHtml(c.name)}</h4>
    ${c.company ? `<p class="muted-sub" style="margin:0 0 12px;">${escapeHtml(c.company)}</p>` : ''}
    <div class="appt-qi-row"><span class="appt-qi-label">Next Follow-Up</span><span class="appt-qi-value">${c.nextFollowUp ? fmtDateShort(c.nextFollowUp) : '—'}</span></div>
    <div class="appt-qi-row"><span class="appt-qi-label">Status</span><span class="status-badge" style="background:${fuStatusColor(c)}1a;color:${fuStatusColor(c)}">${fuStatusLabel(c)}</span></div>
    <div class="appt-qi-row"><span class="appt-qi-label">Last Contact</span><span class="appt-qi-value">${c.lastContactedAt ? fmtDateShort(c.lastContactedAt) : 'No contact yet'}</span></div>
    ${c.leadSource ? `<div class="appt-qi-row"><span class="appt-qi-label">Lead Source</span><span class="appt-qi-value">${escapeHtml(c.leadSource)}</span></div>` : ''}
    ${c.opportunity || c.service ? `<div class="appt-qi-row"><span class="appt-qi-label">Opportunity</span><span class="appt-qi-value">${escapeHtml(c.opportunity || c.service)}</span></div>` : ''}
    ${c.notes ? `<div class="appt-qi-row" style="display:block;"><span class="appt-qi-label">Notes</span><p class="muted-sub" style="margin:4px 0 0;">${escapeHtml(c.notes)}</p></div>` : ''}
    <div class="appt-qi-actions">
      ${c.phone ? `<a class="btn btn-secondary btn-sm" href="tel:${escapeHtml(c.phone)}">Call</a>` : ''}
      ${c.email ? `<a class="btn btn-secondary btn-sm" href="mailto:${escapeHtml(c.email)}">Email</a>` : ''}
      <button class="btn btn-secondary btn-sm" id="fuQiView">View Contact</button>
      ${followupBucket(c) !== 'completed' ? `<button class="btn btn-ghost btn-sm" id="fuQiComplete">Complete</button>` : ''}
    </div>
  `;
  $('#fuQiView').addEventListener('click', () => openModal(c));
  const completeBtn = $('#fuQiComplete');
  if (completeBtn) completeBtn.addEventListener('click', () => updateContact(c.id, { nextFollowUp: '', lastContactedAt: todayStr() }));
}

/* ================= JOB HUNT — manual entry / paste-a-URL only; no scraping,
   no automated login, no browser automation of any job site. ================= */
async function createJob(payload) {
  const res = await fetch('/api/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not save job');
  jobs.unshift(data);
  render();
  return data;
}
async function updateJob(id, updates) {
  const res = await fetch(`/api/jobs/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not update job');
  const idx = jobs.findIndex(j => j.id === id);
  if (idx !== -1) jobs[idx] = data;
  render();
  return data;
}
async function deleteJob(id) {
  await fetch(`/api/jobs/${id}`, { method: 'DELETE' });
  jobs = jobs.filter(j => j.id !== id);
  if (jhSelectedId === id) jhSelectedId = null;
  render();
  showToast('Job opportunity deleted');
}
async function saveJobProfile(updates) {
  const res = await fetch('/api/job-profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
  jobProfile = await res.json();
  render();
}

/* ================= JOB PROFILE / CV — read-only source of truth for future
   Kai matching. Every field reflects only what the user actually entered;
   nothing here is invented or defaulted to a plausible-sounding value. ================= */
const JOB_PROFILE_COMPLETENESS_FIELDS = ['fullName', 'professionalTitle', 'summary', 'services', 'skills', 'tools', 'crmCapabilities', 'workHistory', 'languages', 'education'];
function jobProfileCompleteness() {
  const filled = JOB_PROFILE_COMPLETENESS_FIELDS.filter(f => {
    const v = jobProfile[f];
    return Array.isArray(v) ? v.length > 0 : !!(v && String(v).trim());
  }).length;
  return Math.round((filled / JOB_PROFILE_COMPLETENESS_FIELDS.length) * 100);
}
function badgeListHtml(items, emptyText) {
  if (!items || !items.length) return `<p class="muted-sub" style="margin:0;">${escapeHtml(emptyText)}</p>`;
  return `<div class="kai-suggestions">${items.map(i => `<span class="kai-suggestion" style="cursor:default;">${escapeHtml(i)}</span>`).join('')}</div>`;
}

let jpEditMode = false;
function openJobProfileModal() {
  jpEditMode = false;
  renderJobProfileModal();
  $('#jobProfileModalOverlay').classList.remove('hidden');
}
function closeJobProfileModal() { $('#jobProfileModalOverlay').classList.add('hidden'); }
function initJobProfileModal() {
  $('#jobProfileModalClose').addEventListener('click', closeJobProfileModal);
  $('#jobProfileModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'jobProfileModalOverlay') closeJobProfileModal(); });
}

function renderJobProfileModal() {
  const body = $('#jobProfileModalBody');
  body.innerHTML = jpEditMode ? jobProfileEditHtml() : jobProfileViewHtml();
  if (jpEditMode) initJobProfileEditForm();
  else {
    $('#jpEditBtn').addEventListener('click', () => { jpEditMode = true; renderJobProfileModal(); });
    $('#jpAddExperienceBtn').addEventListener('click', () => openExperienceModal(null));
    body.querySelectorAll('.jp-exp-edit').forEach(btn => btn.addEventListener('click', () => openExperienceModal(Number(btn.dataset.idx))));
    body.querySelectorAll('.jp-exp-delete').forEach(btn => btn.addEventListener('click', () => deleteExperienceEntry(Number(btn.dataset.idx))));
  }
}

function jobProfileViewHtml() {
  const p = jobProfile;
  const pct = jobProfileCompleteness();
  return `
    <div style="margin-bottom:16px;">
      <h2 style="margin:0 0 4px;">${p.fullName ? escapeHtml(p.fullName) : 'Not provided'}</h2>
      <p class="muted-sub" style="margin:0;">${p.professionalTitle ? escapeHtml(p.professionalTitle) : 'Not provided'}</p>
      <p class="muted-sub" style="margin:6px 0 0;">Profile completeness: ${pct}%</p>
    </div>
    <div class="jp-section"><h3>Professional Summary</h3><p class="muted-sub" style="margin:0;white-space:pre-line;">${p.summary ? escapeHtml(p.summary) : 'Not provided'}</p></div>
    <div class="jp-section"><h3>Services &amp; Capabilities</h3>${badgeListHtml(p.services, 'Not provided')}</div>
    <div class="jp-section"><h3>Core Skills</h3>${badgeListHtml(p.skills, 'Not provided')}</div>
    <div class="jp-section"><h3>Tools &amp; Platforms</h3>${badgeListHtml(p.tools, 'Not provided')}</div>
    <div class="jp-section"><h3>CRM Capabilities</h3>${badgeListHtml(p.crmCapabilities, 'Not provided')}</div>
    <div class="jp-section">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;">Work Experience</h3>
        <button class="btn btn-ghost btn-sm" id="jpAddExperienceBtn">+ Add Experience</button>
      </div>
      ${p.workHistory && p.workHistory.length ? p.workHistory.map((w, i) => `
        <div class="appt-quick-info" style="margin-top:10px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
            <div>
              <h4 style="margin:0;">${escapeHtml(w.role || 'Not provided')}</h4>
              <p class="muted-sub" style="margin:2px 0 0;">${escapeHtml(w.company || 'Not provided')}${w.type ? ' · ' + escapeHtml(w.type) : ''}${w.location ? ' · ' + escapeHtml(w.location) : ''}</p>
              <p class="muted-sub" style="margin:2px 0 0;">${w.dates ? escapeHtml(w.dates) : 'Not provided'}</p>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button class="btn btn-ghost btn-sm jp-exp-edit" data-idx="${i}">Edit</button>
              <button class="btn btn-ghost btn-sm jp-exp-delete" data-idx="${i}">Delete</button>
            </div>
          </div>
          ${w.responsibilities && w.responsibilities.length ? `<ul style="margin:8px 0 0;padding-left:18px;font-size:12px;">${w.responsibilities.map(r => `<li style="margin-bottom:4px;">${escapeHtml(r)}</li>`).join('')}</ul>` : ''}
        </div>
      `).join('') : `<p class="muted-sub" style="margin-top:10px;">Not provided</p>`}
    </div>
    <div class="jp-section"><h3>Languages</h3>${p.languages && p.languages.length ? `<ul style="margin:0;padding-left:18px;font-size:12.5px;">${p.languages.map(l => `<li>${escapeHtml(l.language || '')} — ${escapeHtml(l.level || '')}</li>`).join('')}</ul>` : `<p class="muted-sub" style="margin:0;">Not provided</p>`}</div>
    <div class="jp-section"><h3>Education</h3>${p.education && p.education.length ? `<ul style="margin:0;padding-left:18px;font-size:12.5px;">${p.education.map(e => `<li>${escapeHtml(e.school || '')}${e.credential ? ' — ' + escapeHtml(e.credential) : ''}</li>`).join('')}</ul>` : `<p class="muted-sub" style="margin:0;">Not provided</p>`}</div>
    <div class="modal-actions"><span class="spacer"></span><button class="btn btn-primary btn-sm" id="jpEditBtn">Edit Profile</button></div>
  `;
}

function jobProfileEditHtml() {
  const p = jobProfile;
  const langRows = (p.languages && p.languages.length ? p.languages : [{ language: '', level: '' }])
    .map((l, i) => `
      <div class="form-row jp-lang-row" data-idx="${i}">
        <label>Language<input type="text" class="jp-lang-name" value="${escapeHtml(l.language || '')}" /></label>
        <label>Level<input type="text" class="jp-lang-level" value="${escapeHtml(l.level || '')}" placeholder="e.g. Fluent" /></label>
        <button type="button" class="btn btn-ghost btn-sm jp-remove-row">Remove</button>
      </div>`).join('');
  const eduRows = (p.education && p.education.length ? p.education : [{ school: '', credential: '' }])
    .map((e, i) => `
      <div class="form-row jp-edu-row" data-idx="${i}">
        <label>School<input type="text" class="jp-edu-school" value="${escapeHtml(e.school || '')}" /></label>
        <label>Credential<input type="text" class="jp-edu-credential" value="${escapeHtml(e.credential || '')}" placeholder="e.g. High School Graduate" /></label>
        <button type="button" class="btn btn-ghost btn-sm jp-remove-row">Remove</button>
      </div>`).join('');
  return `
    <form id="jpEditForm" style="display:flex;flex-direction:column;gap:12px;">
      <div class="form-row"><label class="full">Full Name<input id="jpFullName" type="text" value="${escapeHtml(p.fullName || '')}" /></label></div>
      <div class="form-row"><label class="full">Professional Title<input id="jpTitle" type="text" value="${escapeHtml(p.professionalTitle || '')}" placeholder="e.g. Virtual Assistant | Customer Service Specialist" /></label></div>
      <label class="full">Professional Summary<textarea id="jpSummary" rows="4">${escapeHtml(p.summary || '')}</textarea></label>
      <label class="full">Services &amp; Capabilities (one per line)<textarea id="jpServices" rows="4">${(p.services || []).join('\n')}</textarea></label>
      <label class="full">Core Skills (one per line)<textarea id="jpSkills" rows="4">${(p.skills || []).join('\n')}</textarea></label>
      <label class="full">Tools &amp; Platforms (one per line)<textarea id="jpTools" rows="3">${(p.tools || []).join('\n')}</textarea></label>
      <label class="full">CRM Capabilities (one per line)<textarea id="jpCrm" rows="3">${(p.crmCapabilities || []).join('\n')}</textarea></label>
      <div class="jp-section"><h3 style="margin:0 0 8px;">Languages</h3><div id="jpLangRows">${langRows}</div><button type="button" class="btn btn-ghost btn-sm" id="jpAddLang">+ Add Language</button></div>
      <div class="jp-section"><h3 style="margin:0 0 8px;">Education</h3><div id="jpEduRows">${eduRows}</div><button type="button" class="btn btn-ghost btn-sm" id="jpAddEdu">+ Add Education</button></div>
      <p class="muted-sub" style="margin:0;">Work Experience entries are edited individually — use Edit/Delete/+ Add Experience on the profile view.</p>
      <div class="modal-actions">
        <span class="spacer"></span>
        <button type="button" class="btn btn-ghost" id="jpCancelEdit">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Profile</button>
      </div>
    </form>
  `;
}

function initJobProfileEditForm() {
  const body = $('#jobProfileModalBody');
  $('#jpCancelEdit').addEventListener('click', () => { jpEditMode = false; renderJobProfileModal(); });
  $('#jpAddLang').addEventListener('click', () => {
    $('#jpLangRows').insertAdjacentHTML('beforeend', `<div class="form-row jp-lang-row"><label>Language<input type="text" class="jp-lang-name" /></label><label>Level<input type="text" class="jp-lang-level" placeholder="e.g. Fluent" /></label><button type="button" class="btn btn-ghost btn-sm jp-remove-row">Remove</button></div>`);
    wireJpRemoveButtons();
  });
  $('#jpAddEdu').addEventListener('click', () => {
    $('#jpEduRows').insertAdjacentHTML('beforeend', `<div class="form-row jp-edu-row"><label>School<input type="text" class="jp-edu-school" /></label><label>Credential<input type="text" class="jp-edu-credential" placeholder="e.g. High School Graduate" /></label><button type="button" class="btn btn-ghost btn-sm jp-remove-row">Remove</button></div>`);
    wireJpRemoveButtons();
  });
  wireJpRemoveButtons();
  function wireJpRemoveButtons() {
    body.querySelectorAll('.jp-remove-row').forEach(btn => {
      btn.onclick = () => btn.closest('.jp-lang-row, .jp-edu-row').remove();
    });
  }
  $('#jpEditForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const languages = [...body.querySelectorAll('.jp-lang-row')]
      .map(row => ({ language: row.querySelector('.jp-lang-name').value.trim(), level: row.querySelector('.jp-lang-level').value.trim() }))
      .filter(l => l.language || l.level);
    const education = [...body.querySelectorAll('.jp-edu-row')]
      .map(row => ({ school: row.querySelector('.jp-edu-school').value.trim(), credential: row.querySelector('.jp-edu-credential').value.trim() }))
      .filter(ed => ed.school || ed.credential);
    const updates = {
      fullName: $('#jpFullName').value.trim(),
      professionalTitle: $('#jpTitle').value.trim(),
      summary: $('#jpSummary').value.trim(),
      services: $('#jpServices').value.split('\n').map(s => s.trim()).filter(Boolean),
      skills: $('#jpSkills').value.split('\n').map(s => s.trim()).filter(Boolean),
      tools: $('#jpTools').value.split('\n').map(s => s.trim()).filter(Boolean),
      crmCapabilities: $('#jpCrm').value.split('\n').map(s => s.trim()).filter(Boolean),
      languages, education,
    };
    saveJobProfile(updates).then(() => {
      jpEditMode = false;
      renderJobProfileModal();
      showToast('Job profile updated');
    });
  });
}

/* ---- Work Experience entries: edited individually via a small sub-modal,
   then saved as a whole-array PATCH to /api/job-profile (single-user profile,
   so there's no need for a separate collection route). ---- */
function openExperienceModal(idx) {
  const entry = idx !== null ? jobProfile.workHistory[idx] : null;
  $('#experienceModalTitle').textContent = entry ? 'Edit Experience' : 'Add Experience';
  $('#fExpIdx').value = idx !== null ? idx : '';
  $('#fExpCompany').value = entry ? (entry.company || '') : '';
  $('#fExpRole').value = entry ? (entry.role || '') : '';
  $('#fExpType').value = entry ? (entry.type || '') : '';
  $('#fExpLocation').value = entry ? (entry.location || '') : '';
  $('#fExpDates').value = entry ? (entry.dates || '') : '';
  $('#fExpResponsibilities').value = entry && entry.responsibilities ? entry.responsibilities.join('\n') : '';
  $('#experienceModalOverlay').classList.remove('hidden');
}
function closeExperienceModal() { $('#experienceModalOverlay').classList.add('hidden'); }
function deleteExperienceEntry(idx) {
  if (!confirm('Delete this work experience entry?')) return;
  const workHistory = jobProfile.workHistory.filter((_, i) => i !== idx);
  saveJobProfile({ workHistory }).then(() => { renderJobProfileModal(); showToast('Experience entry deleted'); });
}
function initExperienceForm() {
  $('#experienceModalClose').addEventListener('click', closeExperienceModal);
  $('#experienceModalCancel').addEventListener('click', closeExperienceModal);
  $('#experienceModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'experienceModalOverlay') closeExperienceModal(); });
  $('#experienceForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const company = $('#fExpCompany').value.trim();
    const role = $('#fExpRole').value.trim();
    if (!company) { showToast('Company is required'); $('#fExpCompany').focus(); return; }
    if (!role) { showToast('Role is required'); $('#fExpRole').focus(); return; }
    const entry = {
      company, role,
      type: $('#fExpType').value.trim(),
      location: $('#fExpLocation').value.trim(),
      dates: $('#fExpDates').value.trim(),
      responsibilities: $('#fExpResponsibilities').value.split('\n').map(s => s.trim()).filter(Boolean),
    };
    const idxRaw = $('#fExpIdx').value;
    const workHistory = [...(jobProfile.workHistory || [])];
    if (idxRaw !== '') workHistory[Number(idxRaw)] = entry; else workHistory.push(entry);
    saveJobProfile({ workHistory }).then(() => {
      closeExperienceModal();
      renderJobProfileModal();
      showToast(idxRaw !== '' ? 'Experience entry updated' : 'Experience entry added');
    });
  });
}

function jobSalaryDisplay(job) {
  if (job.salary) return job.salary;
  const hasMin = job.salaryMin !== null && job.salaryMin !== undefined && job.salaryMin !== '';
  const hasMax = job.salaryMax !== null && job.salaryMax !== undefined && job.salaryMax !== '';
  if (!hasMin && !hasMax) return 'Not provided';
  const range = hasMin && hasMax ? `${job.salaryMin}–${job.salaryMax}` : hasMin ? `${job.salaryMin}+` : `Up to ${job.salaryMax}`;
  return job.salaryType ? `${range} (${job.salaryType})` : range;
}
function jobMatchLabel(score) {
  if (score === null || score === undefined) return 'Not analyzed';
  if (score >= 90) return 'Strong Match';
  if (score >= 75) return 'Good Match';
  if (score >= 60) return 'Moderate Match';
  return 'Low Match';
}
function jobMatchColor(score) {
  if (score === null || score === undefined) return 'var(--text-muted)';
  if (score >= 90) return 'var(--success)';
  if (score >= 75) return 'var(--primary)';
  if (score >= 60) return 'var(--warning)';
  return 'var(--error)';
}
function jobStatusColor(status) { return JOB_STATUS_COLORS[status] || 'var(--text-muted)'; }
// Single source of truth for how Kai (and anywhere else) describes a job's
// match result — always reads the stored fields, never recalculates them.
function jobSummaryLine(job) {
  const scoreText = job.matchScore !== null && job.matchScore !== undefined
    ? `${job.matchScore}% ${matchCategory(job.matchScore)}`
    : (job.matchStatus === 'Not enough data' ? 'Not enough data' : 'Not analyzed');
  return `${job.title} — ${job.company}\n${scoreText}`;
}
function jobProfileTerms() {
  return [...(jobProfile.skills || []), ...(jobProfile.tools || []), ...(jobProfile.services || [])]
    .map(s => (s || '').toLowerCase().trim()).filter(Boolean);
}
// Real (not AI-generated) skill-overlap: compares the job's own listed skills
// against the user's actual Job Profile terms. Never invents a skill the
// profile doesn't actually contain.
function jobSkillOverlap(job) {
  const profileTerms = jobProfileTerms();
  const jobSkills = (job.skills && job.skills.length) ? job.skills : [];
  const matching = jobSkills.filter(s => profileTerms.some(p => p === s.toLowerCase().trim() || p.includes(s.toLowerCase().trim()) || s.toLowerCase().trim().includes(p)));
  const missing = jobSkills.filter(s => !matching.includes(s));
  return { matching, missing, hasProfile: profileTerms.length > 0, hasJobSkills: jobSkills.length > 0 };
}
/* ================= Phase 2F — Job Finder (discovery layer).
   Separate from Job Opportunities: this page only DISCOVERS candidate jobs
   via a server-side Google Programmable Search of OnlineJobs.ph (no scraping,
   no login, no browser automation). Results live in memory for the current
   session only — nothing is saved into Job Opportunities until the user
   explicitly clicks Save/Save Selected, which reuses the existing createJob()
   flow. Matching reuses the exact same calculateJobMatch() engine as Job
   Opportunities — no second scoring system. ================= */
async function addJobFinderKeyword(keyword) {
  const res = await fetch('/api/job-finder/keywords', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyword }) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not add keyword');
  jfKeywords.push(data);
  renderJobFinder();
  return data;
}
async function removeJobFinderKeyword(id) {
  await fetch(`/api/job-finder/keywords/${id}`, { method: 'DELETE' });
  jfKeywords = jfKeywords.filter(k => k.id !== id);
  renderJobFinder();
}
// Phase 2H — the approved Job Finder keyword library. Kept as its own list
// rather than reading jobProfile.services directly: it needs role-style
// phrasing ("Appointment Setter", not the profile's "Appointment Setting")
// and includes "Virtual Assistant", which isn't a listed profile service.
// This never writes to or reads live values out of the real Job Profile —
// that data stays exactly as Karen entered it.
const JOB_FINDER_SUGGESTED_KEYWORDS = [
  'Appointment Setter', 'Virtual Assistant', 'Customer Support', 'CRM Management',
  'CRM Setup & Automation', 'Lead Follow-Up', 'AI & Automation', 'Workflow Automation',
  'Process Optimization', 'Lead Generation', 'Data Entry', 'Sales Support',
];
function jfSuggestedKeywords() {
  const already = new Set(jfKeywords.map(k => k.keyword.toLowerCase()));
  return [...new Set(JOB_FINDER_SUGGESTED_KEYWORDS)].filter(s => !already.has(s.toLowerCase()));
}
// Builds a job-shaped object from a search result so it can go through the
// exact same calculateJobMatch() used by Job Opportunities — title and
// snippet are the only real signals a generic web search provides, and the
// engine already knows how to infer from title/description alone (Phase 2C).
function jfPseudoJobFor(result) {
  return {
    title: result.title || '',
    description: result.snippet || '',
    skills: [], requirements: [],
  };
}
// Employment type and compensation are extracted from the job's own title +
// snippet only — never from its service/keyword — and kept fully separate
// from the skill-match score computed below (Phase 2G section 7).
function jfExtractionSourceText(result) {
  return `${result.title || ''} ${cleanSnippetText(result.snippet || '')}`.trim();
}
function jfAnalyzeResult(result) {
  const match = calculateJobMatch(jfPseudoJobFor(result), jobProfile);
  const extraction = extractEmploymentAndCompensation(jfExtractionSourceText(result));
  return { ...result, ...match, ...extraction };
}
// Small inline note next to an extracted value — omitted entirely when there
// was nothing to extract, so "Not specified" never gets a false confidence label.
function jfConfidenceNoteHtml(confidence) {
  if (!confidence || confidence === 'Not specified') return '';
  return ` <span class="muted-sub" style="font-size:10.5px;">(Confidence: ${escapeHtml(confidence)})</span>`;
}
function jfBuildSearchWarning(perKeywordErrors, uniqueResultCount, totalKeywordCount) {
  const failedKeywords = Object.keys(perKeywordErrors || {});
  if (!failedKeywords.length) return '';
  const successCount = uniqueResultCount || 0;
  return `${failedKeywords.join(', ')} search${failedKeywords.length === 1 ? '' : 'es'} failed. ${successCount} result${successCount === 1 ? '' : 's'} ${successCount === 1 ? 'was' : 'were'} returned from the other keyword${totalKeywordCount - failedKeywords.length === 1 ? '' : 's'}.`;
}
// Same URL normalization as the server's normalizeUrlForDedup (server.js),
// duplicated client-side only to freshly recompute "already saved" against
// the current jobs list when restoring old results — the actual save/dedup
// pipeline itself is untouched.
function jfNormalizeUrlForRestore(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = u.pathname.replace(/\/+$/, '');
    return `${host}${pathname}`.toLowerCase();
  } catch { return String(url).trim().toLowerCase(); }
}
// Restores a persisted Job Finder history entry's raw results into jfResults
// — used both for the one-time page-load restore and for clicking an older
// Recent Search entry. Never calls Brave/Google: it re-runs the same
// deterministic jfAnalyzeResult() pipeline already used for live results
// against the entry's stored raw discovery data, and recomputes "already
// saved" against the currently-loaded jobs list (in case a save happened
// since this search ran).
function jfRestoreResultsFromHistoryEntry(entry) {
  const savedUrls = new Set((jobs || []).map(j => jfNormalizeUrlForRestore(j.sourceUrl)).filter(Boolean));
  jfResults = (entry.results || []).map(r => {
    const analyzed = jfAnalyzeResult(r);
    analyzed.alreadySaved = analyzed.sourceUrl ? savedUrls.has(jfNormalizeUrlForRestore(analyzed.sourceUrl)) : false;
    return analyzed;
  });
  jfPerKeywordCounts = entry.perKeywordCounts || {};
  jfPerKeywordErrors = entry.perKeywordErrors || {};
  jfHasSearched = true;
  jfSearchStatus = jfResults.length ? 'completed' : 'no_results';
  jfSearchError = '';
  jfSearchWarning = jfBuildSearchWarning(jfPerKeywordErrors, entry.uniqueResultCount, (entry.keywords || []).length);
  jfSelectedIds = new Set();
  jfSelectedResultId = null;
}
// 24 hours — the default reuse window; not exposed as a UI setting yet.
const JF_REUSE_WINDOW_MS = 24 * 60 * 60 * 1000;
// Order-insensitive, case-insensitive, whitespace-trimmed, duplicate-free
// keyword-set normalization so two requests for the same keywords in a
// different order/casing/with a repeat are recognized as identical.
function jfNormalizeKeywordSet(keywords) {
  return [...new Set((keywords || []).map(k => (k || '').trim().toLowerCase()).filter(Boolean))].sort();
}
function jfKeywordSetsMatch(a, b) {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}
// Looks for the most recent history entry (jfHistory is already newest-first)
// whose normalized keyword set exactly matches, that still has stored
// results, and that was searched within the reuse window. Never a partial
// match, never a different keyword set, never an entry with no results.
function jfFindReusableHistoryEntry(requestedKeywords) {
  const target = jfNormalizeKeywordSet(requestedKeywords);
  if (!target.length) return null;
  const now = Date.now();
  for (const entry of jfHistory) {
    if (!Array.isArray(entry.keywords) || !Array.isArray(entry.results) || !entry.results.length) continue;
    if (!jfKeywordSetsMatch(jfNormalizeKeywordSet(entry.keywords), target)) continue;
    const age = now - new Date(entry.searchedAt).getTime();
    if (!(age >= 0 && age <= JF_REUSE_WINDOW_MS)) continue;
    return entry;
  }
  return null;
}
async function runJobFinderSearch() {
  if (!jfKeywords.length) { showToast('Add at least one keyword first'); return; }
  if (jfSearchStatus === 'searching') return; // one search in flight at a time — a stray extra click is a no-op

  // Reuse check happens BEFORE any network call — if a recent identical
  // search already has stored results, restore them via the existing
  // restore pipeline instead of hitting /api/job-finder/search (and
  // therefore Brave/Google) again.
  const reusable = jfFindReusableHistoryEntry(jfKeywords.map(k => k.keyword));
  if (reusable) {
    jfRestoreResultsFromHistoryEntry(reusable);
    showToast('Reused recent search — no new web search was made.');
    renderJobFinder();
    return;
  }

  jfSearchStatus = 'searching';
  jfSearchError = '';
  jfSearchWarning = '';
  renderJobFinder();
  try {
    // One request total: the server loops one Brave/Google call per keyword
    // and returns the combined, deduped set — the frontend never re-calls
    // per keyword itself.
    const res = await fetch('/api/job-finder/search', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keywords: jfKeywords.map(k => k.keyword), resultsPerKeyword: jfResultsPerKeyword }),
    });
    const data = await res.json();
    jfHasSearched = true;
    if (!res.ok) {
      jfSearchStatus = data.error === 'not_configured' ? 'not_configured' : 'error';
      jfSearchError = data.message || 'Search failed.';
      jfResults = [];
      jfPerKeywordErrors = {};
    } else {
      jfPerKeywordCounts = data.perKeywordCounts || {};
      jfPerKeywordErrors = data.perKeywordErrors || {};
      jfResults = (data.results || []).map(jfAnalyzeResult);
      jfSearchStatus = jfResults.length ? 'completed' : 'no_results';
      jfSearchWarning = jfBuildSearchWarning(jfPerKeywordErrors, data.uniqueResultCount, jfKeywords.length);
    }
  } catch (err) {
    jfSearchStatus = 'error';
    jfSearchError = 'Could not reach the server.';
    jfResults = [];
    jfPerKeywordErrors = {};
  }
  jfSelectedIds = new Set();
  await loadJobFinderHistory();
  renderJobFinder();
}
function jfFilteredResults() {
  const term = jfSearchTerm.trim().toLowerCase();
  return jfResults
    .filter(r => jfSourceFilter === 'all' || r.source === jfSourceFilter)
    .filter(r => jfKeywordFilter === 'all' || r.keyword === jfKeywordFilter || (r.matchedKeywords || []).includes(jfKeywordFilter))
    .filter(r => jfStatusFilter === 'all' || (jfStatusFilter === 'saved' ? r.alreadySaved : !r.alreadySaved))
    .filter(r => {
      if (jfMatchFilter === 'all') return true;
      if (r.matchScore === null || r.matchScore === undefined) return false;
      if (jfMatchFilter === '90') return r.matchScore >= 90;
      if (jfMatchFilter === '75') return r.matchScore >= 75 && r.matchScore < 90;
      if (jfMatchFilter === '60') return r.matchScore >= 60 && r.matchScore < 75;
      if (jfMatchFilter === 'below60') return r.matchScore < 60;
      return true;
    })
    .filter(r => !term || (r.title || '').toLowerCase().includes(term) || (r.company || '').toLowerCase().includes(term))
    .filter(r => jfEmploymentFilter === 'all' || (r.employmentType || 'Not specified') === jfEmploymentFilter)
    .filter(r => jfCompensationFilter === 'all' || (r.compensationType || 'Not specified') === jfCompensationFilter);
}
function jfKpis() {
  if (!jfHasSearched) return { found: '—', strong: '—', good: '—', saved: '—' };
  const found = jfResults.length;
  const strong = jfResults.filter(r => r.matchScore !== null && r.matchScore !== undefined && r.matchScore >= 90).length;
  const good = jfResults.filter(r => r.matchScore !== null && r.matchScore !== undefined && r.matchScore >= 75 && r.matchScore < 90).length;
  const saved = jfResults.filter(r => r.alreadySaved).length;
  return { found, strong, good, saved };
}
// Job Opportunities' own Employment Type dropdown predates Job Finder and
// uses Title-Case values (Full-Time, Part-Time, ...) with no room for
// "Project-based"/"Commission-based"/"Not specified" — this only renames the
// overlapping concepts so real data isn't needlessly collapsed to "Other";
// it never changes that existing enum or form.
function jfMapEmploymentTypeForJobOpportunities(type) {
  const map = { 'Full-time': 'Full-Time', 'Part-time': 'Part-Time', 'Contract': 'Contract', 'Freelance': 'Freelance', 'Temporary': 'Temporary' };
  return map[type] || 'Other';
}
async function saveJobFinderResult(result) {
  const payload = {
    title: result.title || '',
    company: result.company || '',
    source: JOB_SOURCES.includes(result.source) ? result.source : 'Other',
    sourceUrl: result.sourceUrl || '',
    salary: result.salary || '',
    location: result.location || '',
    employmentType: jfMapEmploymentTypeForJobOpportunities(result.employmentType),
    compensationType: result.compensationType || 'Not specified',
    compensationMin: result.compensationMin !== null && result.compensationMin !== undefined ? result.compensationMin : null,
    compensationMax: result.compensationMax !== null && result.compensationMax !== undefined ? result.compensationMax : null,
    compensationCurrency: result.compensationCurrency || null,
    description: result.snippet || '',
    skills: [], requirements: [],
    status: 'Saved',
    notes: (result.matchedKeywords && result.matchedKeywords.length) ? `Discovered via Job Finder — keyword${result.matchedKeywords.length === 1 ? '' : 's'}: ${result.matchedKeywords.join(', ')}` : 'Discovered via Job Finder',
  };
  // Returns true/false so callers (e.g. bulk save) can tell whether this
  // particular result actually saved — standalone callers (the row/detail
  // panel Save buttons) already ignore the return value, so their existing
  // behavior (toast + alreadySaved + re-render) is unchanged either way.
  try {
    const created = await createJob(payload);
    // The match was already computed from the same real title/snippet — persist
    // it immediately so the saved Job Opportunity doesn't show "Not analyzed"
    // for data Job Finder already established.
    if (result.matchStatus === 'Analyzed' || result.matchStatus === 'Not enough data') {
      await updateJob(created.id, {
        matchScore: result.matchScore, matchStatus: result.matchStatus, matchConfidence: result.matchConfidence,
        matchingSkills: result.matchingSkills, partialSkills: result.partialSkills, missingSkills: result.missingSkills,
        matchedRequirements: result.matchedRequirements, partialRequirements: result.partialRequirements, missingRequirements: result.missingRequirements,
        matchExplanation: result.matchExplanation, analyzedAt: result.analyzedAt, profileMatchSignature: result.profileMatchSignature,
      });
    }
    result.alreadySaved = true;
    showToast(`Saved "${result.title}" to Job Opportunities`);
    renderJobFinder();
    return true;
  } catch (err) {
    showToast(err.message || 'Could not save this job');
    return false;
  }
}
async function saveSelectedJobFinderResults() {
  const toSave = jfResults.filter(r => jfSelectedIds.has(r.id) && !r.alreadySaved);
  if (!toSave.length) { showToast('Nothing selected to save'); return; }
  const failedIds = new Set();
  let successCount = 0;
  for (const r of toSave) {
    const ok = await saveJobFinderResult(r);
    if (ok) successCount++;
    else failedIds.add(r.id);
  }
  // Only successful saves leave the selection — a failed save stays selected
  // so the user can retry it (e.g. via Save Selected again) without having
  // to re-pick it from the table.
  jfSelectedIds = failedIds;
  const failedCount = failedIds.size;
  if (failedCount === 0) {
    showToast(`Saved ${successCount} job${successCount === 1 ? '' : 's'}.`);
  } else if (successCount === 0) {
    showToast(`No jobs were saved. ${failedCount} failed and remain selected for retry.`);
  } else {
    showToast(`Saved ${successCount} job${successCount === 1 ? '' : 's'}. ${failedCount} failed and remain selected for retry.`);
  }
  renderJobFinder();
}

function renderJobFinder() {
  const el = $('#jobFinderContent');
  const kpis = jfKpis();
  const suggested = jfSuggestedKeywords();
  const filtered = jfFilteredResults();
  const keywordOptions = ['<option value="all">All Keywords</option>', ...jfKeywords.map(k => `<option value="${escapeHtml(k.keyword)}" ${jfKeywordFilter === k.keyword ? 'selected' : ''}>${escapeHtml(k.keyword)}</option>`)].join('');
  const matchOptions = [['all', 'Any Match'], ['90', '90–100%'], ['75', '75–89%'], ['60', '60–74%'], ['below60', 'Below 60%']]
    .map(([v, l]) => `<option value="${v}" ${jfMatchFilter === v ? 'selected' : ''}>${l}</option>`).join('');

  el.innerHTML = `
    <div class="task-action-bar" style="margin-bottom:12px;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:12.5px;font-weight:700;color:var(--text);">Job Finder</span>
        <span class="muted-sub" style="margin:0;">Discover jobs from OnlineJobs.ph, then save the ones worth tracking.</span>
      </div>
      <button class="btn btn-primary btn-sm" id="jfAddKeywordBtn">+ Add Keyword</button>
    </div>

    <div class="appt-kpi-row jh-kpi-row">
      <div class="appt-kpi"><div class="appt-kpi-label">Jobs Found</div><div class="appt-kpi-value">${kpis.found}</div><div class="appt-kpi-sub">&nbsp;</div></div>
      <div class="appt-kpi"><div class="appt-kpi-label">Strong Matches</div><div class="appt-kpi-value">${kpis.strong}</div><div class="appt-kpi-sub">90%+ match</div></div>
      <div class="appt-kpi"><div class="appt-kpi-label">Good Matches</div><div class="appt-kpi-value">${kpis.good}</div><div class="appt-kpi-sub">75–89% match</div></div>
      <div class="appt-kpi"><div class="appt-kpi-label">Already Saved</div><div class="appt-kpi-value">${kpis.saved}</div><div class="appt-kpi-sub">&nbsp;</div></div>
    </div>

    <div class="jp-section" style="margin-top:0;padding:14px 16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:12px;">
      <h3 style="margin:0 0 8px;">Search Keywords</h3>
      <div class="kai-suggestions" id="jfKeywordChips">
        ${jfKeywords.length ? jfKeywords.map(k => `<span class="kai-suggestion" style="cursor:default;display:inline-flex;align-items:center;gap:6px;">${escapeHtml(k.keyword)}<button class="jf-remove-keyword" data-id="${k.id}" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:13px;line-height:1;padding:0;">&times;</button></span>`).join('') : `<p class="muted-sub" style="margin:0;">No keywords added yet.</p>`}
      </div>
      ${suggested.length ? `
        <p class="muted-sub" style="margin:10px 0 6px;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;">Suggested from your Job Profile</p>
        <div class="kai-suggestions" id="jfSuggestedChips">
          ${suggested.map(s => `<button class="kai-suggestion jf-add-suggested" data-keyword="${escapeHtml(s)}">+ ${escapeHtml(s)}</button>`).join('')}
        </div>
      ` : ''}
    </div>

    <div class="jp-section" style="margin-top:0;padding:14px 16px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);margin-bottom:12px;">
      <h3 style="margin:0 0 10px;">Search Job Posts</h3>
      <div style="display:flex;align-items:flex-end;gap:12px;flex-wrap:wrap;">
        <label style="display:flex;flex-direction:column;gap:5px;font-size:11px;font-weight:700;color:var(--text-muted);">Search Source
          <select class="exec-range-select" id="jfSourceSelect" disabled><option>OnlineJobs.ph</option></select>
        </label>
        <label style="display:flex;flex-direction:column;gap:5px;font-size:11px;font-weight:700;color:var(--text-muted);">Results per keyword
          <input type="number" id="jfResultsPerKeywordInput" min="1" max="10" value="${jfResultsPerKeyword}" style="width:70px;" />
        </label>
        <button class="btn btn-primary" id="jfFindJobsBtn" ${jfSearchStatus === 'searching' ? 'disabled' : ''}>🔎 ${jfSearchStatus === 'searching' ? 'Searching...' : 'Find Jobs'}</button>
        <span class="muted-sub" style="margin:0 0 8px;">${jfKeywords.length} keyword${jfKeywords.length === 1 ? '' : 's'} × ${jfResultsPerKeyword} = up to ${jfKeywords.length * jfResultsPerKeyword} raw results, deduplicated.</span>
      </div>
      <p class="muted-sub" style="margin:8px 0 0;">Searches public job listings indexed by Google from OnlineJobs.ph. Up to 10 results will be collected for each selected keyword.</p>
      ${jfSearchStatusNoticeHtml()}
    </div>

    <div class="appt-main-grid" style="grid-template-columns:1fr 1fr;margin-bottom:12px;">
      <div class="panel" style="padding:14px 16px;">
        <h3 style="margin:0 0 6px;font-size:13.5px;">Results by Keyword</h3>
        ${Object.keys(jfPerKeywordCounts).length ? Object.entries(jfPerKeywordCounts).map(([k, c]) => jfPerKeywordErrors[k] ? `
          <div class="aging-row jh-tight" style="cursor:default;">
            <span class="aging-label">${escapeHtml(k)}</span>
            <span class="aging-count" style="color:var(--error);">Search failed</span>
          </div>
        ` : `
          <div class="aging-row jh-tight" style="cursor:default;">
            <span class="aging-label">${escapeHtml(k)}</span>
            <div class="aging-track"><div class="aging-fill" style="width:${c ? Math.max(6, Math.round((c / jfResultsPerKeyword) * 100)) : 0}%"></div></div>
            <span class="aging-count">${c}</span>
          </div>
        `).join('') : `<p class="muted-sub" style="margin:0;">No searches performed yet.</p>`}
      </div>
      <div class="panel" style="padding:14px 16px;">
        <h3 style="margin:0 0 6px;font-size:13.5px;">Recent Searches</h3>
        ${renderJfRecentSearchesHtml()}
      </div>
    </div>

    <div class="task-action-bar">
      <div class="search task-search"><svg viewBox="0 0 24 24"><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35"/></svg><input type="text" id="jfSearchInput" placeholder="Search discovered results..." value="${escapeHtml(jfSearchTerm)}" /></div>
      <select class="exec-range-select" id="jfKeywordSelect">${keywordOptions}</select>
      <select class="exec-range-select" id="jfMatchSelect">${matchOptions}</select>
      <select class="exec-range-select" id="jfEmploymentFilterSelect">
        <option value="all" ${jfEmploymentFilter === 'all' ? 'selected' : ''}>All Employment Types</option>
        ${EMPLOYMENT_TYPES.map(t => `<option value="${escapeHtml(t)}" ${jfEmploymentFilter === t ? 'selected' : ''}>${escapeHtml(t === 'Not specified' ? 'Other / Not specified' : t)}</option>`).join('')}
      </select>
      <select class="exec-range-select" id="jfCompensationFilterSelect">
        <option value="all" ${jfCompensationFilter === 'all' ? 'selected' : ''}>All Compensation</option>
        ${COMPENSATION_TYPES.map(t => `<option value="${escapeHtml(t)}" ${jfCompensationFilter === t ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('')}
      </select>
      <select class="exec-range-select" id="jfStatusSelect">
        <option value="all" ${jfStatusFilter === 'all' ? 'selected' : ''}>All</option>
        <option value="new" ${jfStatusFilter === 'new' ? 'selected' : ''}>New</option>
        <option value="saved" ${jfStatusFilter === 'saved' ? 'selected' : ''}>Already Saved</option>
      </select>
      ${jfSelectedIds.size ? `<button class="btn btn-primary btn-sm" id="jfSaveSelectedBtn">Save Selected (${jfSelectedIds.size})</button>` : ''}
    </div>

    <div class="appt-main-grid">
      <div class="appt-timeline-col">
        <div class="panel">
          <h3 style="margin:0 0 10px;font-size:14.5px;">Search Results (${filtered.length})</h3>
          <div class="table-wrap">
            <table class="contacts-table task-mgmt-table">
              <thead>
                <tr><th><input type="checkbox" id="jfSelectAllCheck" title="Select all"/></th><th>Job Title</th><th>Source</th><th>Keyword</th><th>Compensation</th><th>Match</th><th>Discovered</th><th>Status</th><th></th></tr>
              </thead>
              <tbody id="jfTableBody"></tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="appt-side-col" id="jfDetailPanel"></div>
    </div>
  `;
  initJobFinderInteractions();
  renderJfTableBody(filtered);
  renderJfDetailPanel();
}
function jfSearchStatusNoticeHtml() {
  if (jfSearchStatus === 'not_configured') {
    return `<p class="muted-sub" style="margin:10px 0 0;color:var(--warning);">Google search integration is not configured yet. Ask whoever manages this CRM's deployment to set GOOGLE_SEARCH_API_KEY and GOOGLE_SEARCH_CLIENT_ID.</p>`;
  }
  if (jfSearchStatus === 'error') {
    return `<p class="muted-sub" style="margin:10px 0 0;color:var(--error);">Search error: ${escapeHtml(jfSearchError || 'Something went wrong.')}</p>`;
  }
  if (jfSearchStatus === 'no_results') {
    return `<p class="muted-sub" style="margin:10px 0 0;">No results found for the selected keywords.</p>`;
  }
  // A partial failure can accompany an otherwise-successful ("completed") search,
  // so this is checked independently of the status branches above.
  if (jfSearchWarning) {
    return `<p class="muted-sub" style="margin:10px 0 0;color:var(--warning);">${escapeHtml(jfSearchWarning)}</p>`;
  }
  return '';
}
// A history entry is either one multi-keyword search session (keywords[],
// rawResultCount, uniqueResultCount, perKeywordErrors) or an older
// single-keyword entry (keyword, resultCount, error) recorded before this
// session format existed — both are rendered so past history isn't lost.
function renderJfRecentSearchesHtml() {
  if (!jfHistory.length) return `<p class="muted-sub" style="margin:0;">No searches performed yet.</p>`;
  return jfHistory.slice(0, 5).map(h => {
    const hasStoredResults = Array.isArray(h.results) && h.results.length > 0;
    const clickableAttrs = `class="appt-qi-row jf-recent-search-row" data-history-id="${escapeHtml(h.id)}" style="cursor:pointer;" title="${hasStoredResults ? 'Click to view these results again' : 'No stored results available for this older search'}"`;
    if (Array.isArray(h.keywords)) {
      const failedCount = Object.keys(h.perKeywordErrors || {}).length;
      const countText = failedCount
        ? `${h.uniqueResultCount} unique · ${failedCount} keyword${failedCount === 1 ? '' : 's'} failed`
        : `${h.uniqueResultCount} unique result${h.uniqueResultCount === 1 ? '' : 's'}`;
      return `
        <div ${clickableAttrs}>
          <span class="appt-qi-label">${escapeHtml(h.keywords.join(' + '))}</span>
          <span class="appt-qi-value">${fmtDateShort(h.searchedAt.slice(0, 10))} · ${countText}${hasStoredResults ? '' : ' <span class="muted-sub">(not available)</span>'}</span>
        </div>
      `;
    }
    return `
      <div ${clickableAttrs}>
        <span class="appt-qi-label">${escapeHtml(h.keyword)}</span>
        <span class="appt-qi-value">${fmtDateShort(h.searchedAt.slice(0, 10))} · ${h.error ? 'error' : `${h.resultCount} result${h.resultCount === 1 ? '' : 's'}`}${hasStoredResults ? '' : ' <span class="muted-sub">(not available)</span>'}</span>
      </div>
    `;
  }).join('');
}
function renderJfTableBody(filtered) {
  const body = $('#jfTableBody');
  if (!jfHasSearched) {
    body.innerHTML = `<tr><td colspan="9">${emptyStateHtml('No searches performed yet', 'Add keywords and click Find Jobs to discover job posts from OnlineJobs.ph.')}</td></tr>`;
    return;
  }
  if (!jfResults.length) {
    body.innerHTML = `<tr><td colspan="9">${emptyStateHtml('No jobs found yet', 'Try different keywords or check back later.')}</td></tr>`;
    return;
  }
  if (!filtered.length) {
    body.innerHTML = `<tr><td colspan="9">${emptyStateHtml('No results match these filters', 'Try adjusting search, keyword, match, or status.')}</td></tr>`;
    return;
  }
  body.innerHTML = filtered.map(r => `
    <tr class="${jfSelectedResultId === r.id ? 'row-selected' : ''}" data-id="${r.id}">
      <td><input type="checkbox" class="jf-row-check" data-id="${r.id}" ${jfSelectedIds.has(r.id) ? 'checked' : ''} onclick="event.stopPropagation()" ${r.alreadySaved ? 'disabled' : ''}/></td>
      <td><div class="task-title-cell">${escapeHtml(r.title || 'Not available')}</div></td>
      <td><span class="source-badge">${escapeHtml(r.source || 'Not available')}</span></td>
      <td>${escapeHtml(r.keyword || '')}${(r.matchedKeywords && r.matchedKeywords.length > 1) ? ` <span class="muted-sub" style="font-size:10.5px;" title="Matched keywords: ${escapeHtml(r.matchedKeywords.join(', '))}">+${r.matchedKeywords.length - 1}</span>` : ''}</td>
      <td>${formatCompensation(r) === 'Not specified' ? '<span class="kmo-dash">—</span>' : escapeHtml(formatCompensation(r))}</td>
      <td><span class="status-badge" style="background:${jobMatchColor(r.matchScore)}1a;color:${jobMatchColor(r.matchScore)}">${r.matchScore !== null && r.matchScore !== undefined ? r.matchScore + '% · ' + jobMatchLabel(r.matchScore) : (r.matchStatus === 'Not enough data' ? 'Not enough data' : 'Not analyzed')}</span></td>
      <td>${fmtDateShort((r.dateDiscovered || '').slice(0, 10))}</td>
      <td>${r.alreadySaved ? '<span class="status-badge" style="background:var(--success)1a;color:var(--success)">✓ Already Saved</span>' : '<span class="status-badge" style="background:var(--text-muted)1a;color:var(--text-muted)">New</span>'}</td>
      <td>${r.alreadySaved ? '' : `<button class="btn btn-ghost btn-sm jf-save-btn" data-id="${r.id}">Save</button>`}</td>
    </tr>
  `).join('');
  body.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('input,button')) return;
      jfSelectedResultId = row.dataset.id;
      body.querySelectorAll('tr.row-selected').forEach(r => r.classList.remove('row-selected'));
      row.classList.add('row-selected');
      renderJfDetailPanel();
    });
  });
  body.querySelectorAll('.jf-row-check').forEach(cb => cb.addEventListener('change', () => {
    if (cb.checked) jfSelectedIds.add(cb.dataset.id); else jfSelectedIds.delete(cb.dataset.id);
    renderJobFinder();
  }));
  body.querySelectorAll('.jf-save-btn').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const result = jfResults.find(r => r.id === btn.dataset.id);
    if (result) saveJobFinderResult(result);
  }));
}
function renderJfDetailPanel() {
  const container = $('#jfDetailPanel');
  const result = jfSelectedResultId ? jfResults.find(r => r.id === jfSelectedResultId) : null;
  if (!result) {
    container.innerHTML = `<div class="panel appt-quick-info"><h4>Selected Result</h4><p class="muted-sub" style="margin:0;">Select a search result from the table to view details.</p></div>`;
    return;
  }
  const gaps = [...(result.missingSkills || []), ...(result.missingRequirements || []).map(x => x.text || x)];
  const matchLine = result.matchScore !== null && result.matchScore !== undefined
    ? `${result.matchScore}% ${jobMatchLabel(result.matchScore)}`
    : (result.matchStatus === 'Not enough data' ? 'Not enough data' : 'Not analyzed');
  container.innerHTML = `
    <div class="panel appt-quick-info">
      <h4>${escapeHtml(result.title || 'Not available')}</h4>
      <p class="muted-sub" style="margin:0 0 10px;">${escapeHtml(result.company || 'Not available')}</p>
      <div class="jp-section" style="margin-top:0;">
        <h3>Job Overview</h3>
        <div class="appt-qi-row"><span class="appt-qi-label">Source</span><span class="appt-qi-value">${escapeHtml(result.source || 'Not available')}</span></div>
        <div class="appt-qi-row"><span class="appt-qi-label">Keyword</span><span class="appt-qi-value">${escapeHtml(result.keyword || 'Not available')}${(result.matchedKeywords && result.matchedKeywords.length > 1) ? ` <span class="muted-sub" style="font-size:10.5px;">(+${result.matchedKeywords.length - 1} more)</span>` : ''}</span></div>
        <div class="appt-qi-row"><span class="appt-qi-label">Employment Type</span><span class="appt-qi-value">${escapeHtml(result.employmentType || 'Not specified')}${jfConfidenceNoteHtml(result.employmentConfidence)}</span></div>
        <div class="appt-qi-row"><span class="appt-qi-label">Compensation</span><span class="appt-qi-value">${escapeHtml(formatCompensation(result))}${jfConfidenceNoteHtml(result.compensationConfidence)}</span></div>
        <div class="appt-qi-row"><span class="appt-qi-label">Location</span><span class="appt-qi-value">${result.location ? escapeHtml(result.location) : 'Not available'}</span></div>
      </div>
      <div class="jp-section">
        <h3>Search Snippet</h3>
        <p class="muted-sub" style="margin:0;">${result.snippet ? escapeHtml(cleanSnippetText(result.snippet)) : 'Not available'}</p>
      </div>
      <div class="jp-section">
        <h3>Match Analysis</h3>
        <div style="font-size:24px;font-weight:800;color:${jobMatchColor(result.matchScore)};line-height:1;">${matchLine}</div>
        ${result.matchConfidence ? `<div style="font-size:10.5px;color:var(--text-muted);margin:4px 0 8px;">Match confidence: ${escapeHtml(result.matchConfidence)}</div>` : ''}
        ${(result.matchingSkills && result.matchingSkills.length) ? `<p class="muted-sub" style="margin:6px 0 0;color:var(--text);">Strong: ${result.matchingSkills.map(escapeHtml).join(', ')}</p>` : ''}
        ${(result.partialSkills && result.partialSkills.length) ? `<p class="muted-sub" style="margin:4px 0 0;">Partial: ${result.partialSkills.map(escapeHtml).join(', ')}</p>` : ''}
        ${gaps.length ? `<p class="muted-sub" style="margin:4px 0 0;color:var(--warning);">Gaps: ${gaps.map(escapeHtml).join(', ')}</p>` : ''}
      </div>
      <div class="jp-section">
        <h3>Recommendation</h3>
        <p class="muted-sub" style="margin:0;">${result.matchScore !== null && result.matchScore !== undefined ? escapeHtml(recommendationFor(result.matchScore, gaps.length > 0)) : escapeHtml(result.matchExplanation || 'Limited job information was available from the search result.')}</p>
      </div>
      <div class="appt-qi-actions">
        ${result.sourceUrl ? `<a class="btn btn-ghost btn-sm" href="${escapeHtml(result.sourceUrl)}" target="_blank" rel="noopener">View Original Job</a>` : ''}
        ${result.alreadySaved ? `<span class="status-badge" style="background:var(--success)1a;color:var(--success)">✓ Already Saved</span>` : `<button class="btn btn-primary btn-sm" id="jfSaveDetailBtn">Save to Job Opportunities</button>`}
      </div>
    </div>
  `;
  if (!result.alreadySaved) $('#jfSaveDetailBtn')?.addEventListener('click', () => saveJobFinderResult(result));
}
function initJobFinderInteractions() {
  $('#jfAddKeywordBtn').addEventListener('click', () => {
    const keyword = prompt('Add a search keyword (e.g. "Appointment Setter"):');
    if (keyword && keyword.trim()) addJobFinderKeyword(keyword.trim()).catch(err => showToast(err.message));
  });
  $('#jobFinderContent').querySelectorAll('.jf-remove-keyword').forEach(btn => btn.addEventListener('click', () => removeJobFinderKeyword(btn.dataset.id)));
  $('#jobFinderContent').querySelectorAll('.jf-add-suggested').forEach(btn => btn.addEventListener('click', () => addJobFinderKeyword(btn.dataset.keyword).catch(err => showToast(err.message))));
  $('#jfResultsPerKeywordInput').addEventListener('change', (e) => {
    const n = Math.min(10, Math.max(1, Number(e.target.value) || 10));
    jfResultsPerKeyword = n;
    e.target.value = n;
  });
  $('#jfFindJobsBtn').addEventListener('click', runJobFinderSearch);
  $('#jobFinderContent').querySelectorAll('.jf-recent-search-row').forEach(row => row.addEventListener('click', () => {
    const entry = jfHistory.find(h => h.id === row.dataset.historyId);
    if (entry && Array.isArray(entry.results) && entry.results.length) {
      jfRestoreResultsFromHistoryEntry(entry);
      showToast('Restored previous search results.');
      renderJobFinder();
    } else {
      showToast('No stored results available for this older search.');
    }
  }));
  $('#jfSearchInput').addEventListener('input', (e) => { jfSearchTerm = e.target.value; renderJobFinder(); });
  $('#jfKeywordSelect').addEventListener('change', (e) => { jfKeywordFilter = e.target.value; renderJobFinder(); });
  $('#jfMatchSelect').addEventListener('change', (e) => { jfMatchFilter = e.target.value; renderJobFinder(); });
  $('#jfEmploymentFilterSelect').addEventListener('change', (e) => { jfEmploymentFilter = e.target.value; renderJobFinder(); });
  $('#jfCompensationFilterSelect').addEventListener('change', (e) => { jfCompensationFilter = e.target.value; renderJobFinder(); });
  $('#jfStatusSelect').addEventListener('change', (e) => { jfStatusFilter = e.target.value; renderJobFinder(); });
  const saveSelectedBtn = $('#jfSaveSelectedBtn');
  if (saveSelectedBtn) saveSelectedBtn.addEventListener('click', saveSelectedJobFinderResults);
  const selectAllCheck = $('#jfSelectAllCheck');
  if (selectAllCheck) {
    const selectable = jfFilteredResults().filter(r => !r.alreadySaved);
    selectAllCheck.checked = selectable.length > 0 && selectable.every(r => jfSelectedIds.has(r.id));
    selectAllCheck.addEventListener('change', (e) => {
      if (e.target.checked) selectable.forEach(r => jfSelectedIds.add(r.id));
      else selectable.forEach(r => jfSelectedIds.delete(r.id));
      renderJobFinder();
    });
  }
}

/* ================= Phase 2C — deterministic Job-to-CV matching.
   Uses calculateJobMatch() from job-match-engine.js (pure, DOM-free, no AI/
   external calls). This file only wires it to the CRM's real stored data,
   persists the result via the existing job PATCH route, and renders it. ================= */
function jobProfileUsableForMatching() {
  const p = jobProfile;
  return !!((p.services && p.services.length) || (p.skills && p.skills.length)
    || (p.tools && p.tools.length) || (p.crmCapabilities && p.crmCapabilities.length)
    || (p.workHistory && p.workHistory.length));
}
// Content-aware, not timestamp-based: compares the Job Profile content
// signature captured at analysis time (job.profileMatchSignature) against
// the CURRENT profile's signature (job-match-engine.js's
// profileMatchSignature — only the fields the matching engine actually
// reads). Re-saving the Job Profile with unchanged relevant content no
// longer flags every job stale, since the signature doesn't change. A job
// analyzed before this fix shipped has no stored signature yet — treated as
// "cannot determine staleness" (not stale) rather than fabricating one, so
// existing correct analyses keep displaying until the job is re-analyzed
// once under the new system.
function isJobMatchStale(job) {
  if (job.matchStatus !== 'Analyzed' || !job.profileMatchSignature) return false;
  return job.profileMatchSignature !== profileMatchSignature(jobProfile);
}
async function analyzeJob(job) {
  const result = calculateJobMatch(job, jobProfile);
  await updateJob(job.id, result);
  return result;
}
async function analyzeAllJobs() {
  if (!jobProfileUsableForMatching()) { showToast('Complete your Job Profile before analyzing matches'); return; }
  if (!jobs.length) { showToast('No job opportunities to analyze yet'); return; }
  for (const job of [...jobs]) {
    const result = calculateJobMatch(job, jobProfile);
    await updateJob(job.id, result);
  }
  showToast(`Analyzed ${jobs.length} job opportunit${jobs.length === 1 ? 'y' : 'ies'}`);
  renderJobHunt();
}

function jobMatchTabHtml(job) {
  if (!jobProfileUsableForMatching()) {
    return `
      <p class="muted-sub" style="margin:0 0 12px;">Complete your Job Profile to analyze matches.</p>
      <button class="btn btn-primary btn-sm" id="jhCompleteProfileBtn">Complete Profile</button>
    `;
  }
  const stale = isJobMatchStale(job);
  const analyzeLabel = job.matchStatus === 'Analyzed' ? 'Re-analyze' : 'Analyze Match';
  const headerRow = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <span style="font-size:11.5px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;">Match Score</span>
      <button class="btn btn-secondary btn-sm" id="jhAnalyzeBtn">${analyzeLabel}</button>
    </div>
  `;
  if (job.matchStatus !== 'Analyzed') {
    return headerRow + `<p class="muted-sub" style="margin:0;">Not analyzed yet.</p>`;
  }
  if (job.matchScore === null || job.matchScore === undefined) {
    return headerRow + `<p class="muted-sub" style="margin:0;">${escapeHtml(job.matchExplanation || 'Not enough data to calculate a reliable match.')}</p>`;
  }
  const staleNote = stale ? `<div class="status-badge" style="background:var(--warning)1a;color:var(--warning);margin-bottom:10px;">⚠ Profile updated — re-analysis recommended.</div>` : '';
  const missSkillChips = (job.missingSkills || []).map(s => `○ ${escapeHtml(s)}`).join('<br>');
  const missReqChips = (job.missingRequirements || []).map(r => `○ ${escapeHtml(r.text || r)}${r.note ? `<br><span class="muted-sub" style="padding-left:14px;">${escapeHtml(r.note)}</span>` : ''}`).join('<br>');
  const partialSkillChips = (job.partialSkills || []).map(s => `~ ${escapeHtml(s)}`).join('<br>');
  const partialReqChips = (job.partialRequirements || []).map(r => `~ ${escapeHtml(r.text || r)}${r.note ? `<br><span class="muted-sub" style="padding-left:14px;">${escapeHtml(r.note)}</span>` : ''}`).join('<br>');
  const matchChips = [...(job.matchingSkills || []).map(s => `✓ ${escapeHtml(s)}`), ...(job.matchedRequirements || []).map(r => `✓ ${escapeHtml(r)}`)].join('<br>');
  const hasGaps = (job.missingSkills || []).length > 0 || (job.missingRequirements || []).length > 0;
  const confidence = job.matchConfidence || 'Low';
  const confidenceColor = confidence === 'High' ? 'var(--success)' : confidence === 'Medium' ? 'var(--warning)' : 'var(--text-muted)';
  const limitedInfoNote = confidence === 'Low'
    ? `<p class="muted-sub" style="margin:2px 0 10px;font-size:10.5px;">Limited job information — match is based primarily on the job title and available profile data.</p>` : '';
  return `
    ${staleNote}
    ${headerRow}
    <div style="font-size:32px;font-weight:800;color:${jobMatchColor(job.matchScore)};line-height:1;">${job.matchScore}%</div>
    <div style="font-size:12px;font-weight:700;color:${jobMatchColor(job.matchScore)};margin-bottom:6px;">${jobMatchLabel(job.matchScore).toUpperCase()}</div>
    <div style="font-size:10.5px;color:var(--text-muted);margin-bottom:4px;">Match confidence: <span style="font-weight:700;color:${confidenceColor};">${confidence.toUpperCase()}</span></div>
    ${limitedInfoNote}

    <div class="jp-section" style="margin-top:12px;">
      <h3>Why You Match</h3>
      ${matchChips ? `<p class="muted-sub" style="margin:0;color:var(--text);line-height:1.8;">${matchChips}</p>` : `<p class="muted-sub" style="margin:0;">No direct matches found.</p>`}
    </div>
    <div class="jp-section">
      <h3>Partial Match</h3>
      ${(partialSkillChips || partialReqChips) ? `<p class="muted-sub" style="margin:0;line-height:1.8;">${[partialSkillChips, partialReqChips].filter(Boolean).join('<br>')}</p>` : `<p class="muted-sub" style="margin:0;">No partial matches.</p>`}
    </div>
    <div class="jp-section">
      <h3>Potential Gaps</h3>
      ${(missSkillChips || missReqChips) ? `<p class="muted-sub" style="margin:0;color:var(--warning);line-height:1.8;">${[missSkillChips, missReqChips].filter(Boolean).join('<br>')}</p>` : `<p class="muted-sub" style="margin:0;">No gaps found.</p>`}
    </div>
    <div class="jp-section">
      <h3>Experience Match</h3>
      <p class="muted-sub" style="margin:0;">${jobProfile.summary ? escapeHtml(jobProfile.summary) : 'Not provided'}</p>
    </div>
    <div class="jp-section">
      <h3>Recommendation</h3>
      <p class="muted-sub" style="margin:0;">${escapeHtml(recommendationFor(job.matchScore, hasGaps))}</p>
      <p class="muted-sub" style="margin:6px 0 0;font-size:10.5px;">${escapeHtml(job.matchExplanation || '')}</p>
    </div>
  `;
}
function wireJobMatchTabEvents(job) {
  const completeBtn = $('#jhCompleteProfileBtn');
  if (completeBtn) completeBtn.addEventListener('click', openJobProfileModal);
  const analyzeBtn = $('#jhAnalyzeBtn');
  if (analyzeBtn) analyzeBtn.addEventListener('click', async () => {
    analyzeBtn.disabled = true; analyzeBtn.textContent = 'Analyzing...';
    try { await analyzeJob(job); renderJobDetailPanel(); renderJobTableBody(jhSortedList().slice((jhPage - 1) * jhPageSize, jhPage * jhPageSize)); renderMatchDistribution(); showToast('Match analysis updated'); }
    catch (err) { showToast('Could not analyze this job — try again.'); analyzeBtn.disabled = false; analyzeBtn.textContent = job.matchStatus === 'Analyzed' ? 'Re-analyze' : 'Analyze Match'; }
  });
}

function genericDailyCountSeries(list, days, dateField) {
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    out.push(list.filter(x => (x[dateField] || '').slice(0, 10) === key).length);
  }
  return out;
}
// Returns how many days back from today the chart should span, based on
// actual calendar boundaries (not a fixed rolling window) — "This Month"
// must start on the 1st of the current month, not 30 days ago, etc.
function jhChartDays() {
  const today = new Date(todayStr() + 'T00:00:00');
  if (jhChartRange === 'week') {
    const day = today.getDay();
    const mondayOffset = day === 0 ? -6 : 1 - day;
    const monday = new Date(today); monday.setDate(today.getDate() + mondayOffset);
    return Math.round((today - monday) / DAY) + 1;
  }
  if (jhChartRange === 'month') {
    return today.getDate();
  }
  if (jhChartRange === '3months') {
    const start = new Date(today.getFullYear(), today.getMonth() - 2, 1);
    return Math.round((today - start) / DAY) + 1;
  }
  // All Time — span from the earliest real job record through today.
  if (!jobs.length) return 1;
  const earliest = jobs.reduce((min, j) => (j.dateAdded && j.dateAdded < min ? j.dateAdded : min), todayStr());
  const earliestDate = new Date(earliest + 'T00:00:00');
  const days = Math.max(1, Math.round((today - earliestDate) / DAY) + 1);
  return Math.min(365, Math.max(30, days));
}

function jhFilteredList() {
  const term = jhSearchTerm.trim().toLowerCase();
  return jobs
    .filter(j => jhSourceFilter === 'all' || j.source === jhSourceFilter)
    .filter(j => jhEmploymentFilter === 'all' || j.employmentType === jhEmploymentFilter)
    .filter(j => jhStatusFilter === 'all' || j.status === jhStatusFilter)
    .filter(j => jhFunnelFilter === null || j.status === jhFunnelFilter)
    .filter(j => {
      if (jhMatchFilter === 'all') return true;
      if (j.matchScore === null || j.matchScore === undefined) return false;
      if (jhMatchFilter === '90') return j.matchScore >= 90;
      if (jhMatchFilter === '75') return j.matchScore >= 75 && j.matchScore < 90;
      if (jhMatchFilter === '60') return j.matchScore >= 60 && j.matchScore < 75;
      if (jhMatchFilter === 'below60') return j.matchScore < 60;
      return true;
    })
    .filter(j => {
      if (!term) return true;
      return (j.title || '').toLowerCase().includes(term) || (j.company || '').toLowerCase().includes(term) || (j.location || '').toLowerCase().includes(term);
    });
}
function jhSortedList() {
  const list = [...jhFilteredList()];
  const { key, dir } = jhSort;
  list.sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === 'matchScore' || key === 'salaryMin') { av = av ?? -1; bv = bv ?? -1; }
    if (typeof av === 'string' && typeof bv === 'string') { const cmp = av.localeCompare(bv); return dir === 'asc' ? cmp : -cmp; }
    const cmp = (Number(av) || 0) - (Number(bv) || 0);
    return dir === 'asc' ? cmp : -cmp;
  });
  return list;
}

function renderJobHunt() {
  const el = $('#jobHuntContent');
  const totalJobs = jobs.length;
  const strongMatches = jobs.filter(j => j.matchScore !== null && j.matchScore !== undefined && j.matchScore >= 90).length;
  const readyToApply = jobs.filter(j => j.status === 'Ready to Apply').length;
  const applied = jobs.filter(j => ['Applied', 'Follow-Up', 'Interview', 'Hired'].includes(j.status)).length;
  const interviews = jobs.filter(j => ['Interview', 'Hired'].includes(j.status)).length;
  const hired = jobs.filter(j => j.status === 'Hired').length;
  const thisMonthCount = jobs.filter(j => (j.dateAdded || '').slice(0, 7) === todayStr().slice(0, 7)).length;

  const sourceOptions = ['<option value="all">All Sources</option>', ...JOB_SOURCES.map(s => `<option ${jhSourceFilter === s ? 'selected' : ''}>${s}</option>`)].join('');
  const employmentOptions = ['<option value="all">All Employment Types</option>', ...JOB_EMPLOYMENT_TYPES.map(s => `<option ${jhEmploymentFilter === s ? 'selected' : ''}>${s}</option>`)].join('');
  const matchOptions = [['all', 'Any Match'], ['90', '90–100%'], ['75', '75–89%'], ['60', '60–74%'], ['below60', 'Below 60%']]
    .map(([v, l]) => `<option value="${v}" ${jhMatchFilter === v ? 'selected' : ''}>${l}</option>`).join('');
  const statusOptions = ['<option value="all">All Statuses</option>', ...JOB_STATUSES.map(s => `<option ${jhStatusFilter === s ? 'selected' : ''}>${s}</option>`)].join('');

  const sorted = jhSortedList();
  const totalPages = Math.max(1, Math.ceil(sorted.length / jhPageSize));
  jhPage = Math.min(jhPage, totalPages);
  const pageItems = sorted.slice((jhPage - 1) * jhPageSize, jhPage * jhPageSize);

  const profilePct = jobProfileCompleteness();
  el.innerHTML = `
    <div class="task-action-bar" style="margin-bottom:12px;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span style="font-size:12.5px;font-weight:700;color:var(--text);">Job Profile</span>
        <span class="muted-sub" style="margin:0;">Profile completeness: ${profilePct}%</span>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <button class="btn btn-ghost btn-sm" id="jhAnalyzeAllBtn">Analyze All Matches</button>
        <button class="btn btn-secondary btn-sm" id="jhOpenProfileBtn">${profilePct > 0 ? 'View / Edit Profile' : 'Set Up Job Profile'}</button>
      </div>
    </div>
    <div class="appt-kpi-row jh-kpi-row">
      <div class="appt-kpi"><div class="appt-kpi-label">Jobs Found</div><div class="appt-kpi-value">${totalJobs}</div><div class="appt-kpi-sub">${thisMonthCount ? thisMonthCount + ' this month' : 'All time'}</div></div>
      <div class="appt-kpi"><div class="appt-kpi-label">Strong Matches</div><div class="appt-kpi-value">${strongMatches}</div><div class="appt-kpi-sub">90%+ match</div></div>
      <div class="appt-kpi"><div class="appt-kpi-label">Ready to Apply</div><div class="appt-kpi-value">${readyToApply}</div><div class="appt-kpi-sub">&nbsp;</div></div>
      <div class="appt-kpi"><div class="appt-kpi-label">Applied</div><div class="appt-kpi-value">${applied}</div><div class="appt-kpi-sub">&nbsp;</div></div>
      <div class="appt-kpi"><div class="appt-kpi-label">Interviews</div><div class="appt-kpi-value">${interviews}</div><div class="appt-kpi-sub">&nbsp;</div></div>
      <div class="appt-kpi"><div class="appt-kpi-label">Hired</div><div class="appt-kpi-value">${hired}</div><div class="appt-kpi-sub">&nbsp;</div></div>
    </div>
    <div class="panel" style="margin-bottom:12px;padding:14px 16px;">
      <div class="exec-block-header" style="margin-bottom:6px;">
        <h3 style="margin:0;font-size:13.5px;">Job Search Activity</h3>
        <div class="filter-chips" id="jhChartRangeToggle" style="margin-bottom:0;">
          ${[['week', 'This Week'], ['month', 'This Month'], ['3months', 'Last 3 Months'], ['all', 'All Time']].map(([v, l]) => `<button class="filter-chip ${jhChartRange === v ? 'active' : ''}" data-range="${v}">${l}</button>`).join('')}
        </div>
      </div>
      <div class="chart-legend" style="margin-bottom:2px;"><span class="chart-legend-item"><span class="dot" style="background:#6C5CE7"></span>Jobs Added</span><span class="chart-legend-item"><span class="dot" style="background:#2196F3"></span>Applications Sent</span></div>
      <div class="line-chart-wrap" id="jhActivityChart"></div>
    </div>
    <div class="appt-main-grid" style="grid-template-columns:1fr 1fr;margin-bottom:12px;align-items:stretch;">
      <div class="panel" style="padding:14px 16px;">
        <h3 style="margin:0 0 6px;font-size:13.5px;">Application Funnel</h3>
        <div id="jhFunnel" class="jh-tight"></div>
      </div>
      <div class="panel" style="padding:14px 16px;">
        <h3 style="margin:0 0 6px;font-size:13.5px;">Match Score Distribution</h3>
        <div id="jhMatchDist" class="jh-tight"></div>
      </div>
    </div>
    <div class="task-action-bar">
      <div class="search task-search"><svg viewBox="0 0 24 24"><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35"/></svg><input type="text" id="jhSearchInput" placeholder="Search jobs by title, company, skills, or paste a job URL..." value="${escapeHtml(jhSearchTerm)}" /></div>
      <select class="exec-range-select" id="jhSourceSelect">${sourceOptions}</select>
      <select class="exec-range-select" id="jhEmploymentSelect">${employmentOptions}</select>
      <select class="exec-range-select" id="jhMatchSelect">${matchOptions}</select>
      <select class="exec-range-select" id="jhStatusSelect">${statusOptions}</select>
    </div>
    <div class="appt-main-grid">
      <div class="appt-timeline-col">
        <div class="panel">
          <h3 style="margin:0 0 10px;font-size:14.5px;">Job Opportunities (${sorted.length})</h3>
          <div class="table-wrap">
            <table class="contacts-table task-mgmt-table">
              <thead>
                <tr>
                  <th></th>
                  <th class="sortable" data-sort-key="title">Job Title</th>
                  <th class="sortable" data-sort-key="company">Company</th>
                  <th>Source</th>
                  <th class="sortable" data-sort-key="salaryMin">Salary</th>
                  <th class="sortable" data-sort-key="matchScore">Match</th>
                  <th class="sortable" data-sort-key="status">Status</th>
                  <th class="sortable" data-sort-key="dateAdded">Date Added</th>
                  <th></th>
                </tr>
              </thead>
              <tbody id="jhTableBody"></tbody>
            </table>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 4px 0;font-size:11.5px;color:var(--text-muted);">
            <span>Showing ${sorted.length ? ((jhPage - 1) * jhPageSize + 1) : 0}–${Math.min(jhPage * jhPageSize, sorted.length)} of ${sorted.length}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <button class="appt-rail-nav" id="jhPagePrev" ${jhPage <= 1 ? 'disabled' : ''}>‹</button>
              <span>${jhPage} / ${totalPages}</span>
              <button class="appt-rail-nav" id="jhPageNext" ${jhPage >= totalPages ? 'disabled' : ''}>›</button>
              <select class="exec-range-select" id="jhPageSizeSelect">${[10, 25, 50].map(n => `<option value="${n}" ${jhPageSize === n ? 'selected' : ''}>${n}/page</option>`).join('')}</select>
            </div>
          </div>
        </div>
      </div>
      <div class="appt-side-col" id="jhDetailPanel"></div>
    </div>
  `;
  initJobHuntInteractions(el);
  renderJobActivityChart();
  renderApplicationFunnel();
  renderMatchDistribution();
  renderJobTableBody(pageItems);
  renderJobDetailPanel();
}
function renderJobActivityChart() {
  const container = $('#jhActivityChart');
  const days = jhChartDays();
  const jobsAdded = genericDailyCountSeries(jobs, days, 'dateAdded');
  const series = [{ label: 'Jobs Added', color: '#6C5CE7', values: jobsAdded }];
  if (jobs.some(j => j.applicationDate)) series.push({ label: 'Applications Sent', color: '#2196F3', values: genericDailyCountSeries(jobs, days, 'applicationDate') });
  if (!jobsAdded.some(v => v > 0) && series.length === 1) { container.innerHTML = emptyStateHtml('No job activity data yet.', 'Add a job to start tracking activity over time.', true); return; }
  renderMultiLineChart(container, series, days);
}
function renderApplicationFunnel() {
  const container = $('#jhFunnel');
  const stages = ['Saved', 'Reviewing', 'Ready to Apply', 'Applied', 'Follow-Up', 'Interview', 'Hired'];
  const counts = stages.map(s => jobs.filter(j => j.status === s).length);
  const max = Math.max(1, ...counts);
  container.innerHTML = stages.map((s, i) => `
    <div class="aging-row ${jhFunnelFilter === s ? 'dash-selected' : ''}" data-stage="${s}">
      <span class="aging-label">${s}</span>
      <div class="aging-track"><div class="aging-fill" style="width:${counts[i] ? Math.max(6, Math.round((counts[i] / max) * 100)) : 0}%"></div></div>
      <span class="aging-count">${counts[i]}</span>
    </div>
  `).join('');
  container.querySelectorAll('.aging-row').forEach(row => {
    row.addEventListener('click', () => {
      jhFunnelFilter = jhFunnelFilter === row.dataset.stage ? null : row.dataset.stage;
      jhPage = 1;
      renderJobHunt();
    });
  });
}
function renderMatchDistribution() {
  const container = $('#jhMatchDist');
  const analyzed = jobs.filter(j => j.matchScore !== null && j.matchScore !== undefined);
  const buckets = [
    { label: '90–100%', min: 90, max: 100, color: '#43D39E', key: '90' },
    { label: '75–89%', min: 75, max: 89, color: '#6C5CE7', key: '75' },
    { label: '60–74%', min: 60, max: 74, color: '#F4B942', key: '60' },
    { label: 'Below 60%', min: 0, max: 59, color: '#F05A72', key: 'below60' },
  ];
  const counts = buckets.map(b => analyzed.filter(j => j.matchScore >= b.min && j.matchScore <= b.max).length);
  const max = Math.max(1, ...counts);
  const rowsHtml = buckets.map((b, i) => `
    <div class="aging-row ${jhMatchFilter === b.key ? 'dash-selected' : ''}" data-key="${b.key}">
      <span class="aging-label">${b.label}</span>
      <div class="aging-track"><div class="aging-fill" style="width:${counts[i] ? Math.max(6, Math.round((counts[i] / max) * 100)) : 0}%;background:${b.color}"></div></div>
      <span class="aging-count">${counts[i]}</span>
      <span class="aging-pct">${analyzed.length ? Math.round((counts[i] / analyzed.length) * 100) : 0}%</span>
    </div>
  `).join('');
  container.innerHTML = analyzed.length
    ? rowsHtml
    : `${rowsHtml}<p class="muted-sub" style="margin:8px 0 0;">No match analysis available yet.</p>`;
  container.querySelectorAll('.aging-row').forEach(row => {
    row.addEventListener('click', () => {
      if (!analyzed.length) return;
      jhMatchFilter = jhMatchFilter === row.dataset.key ? 'all' : row.dataset.key;
      jhPage = 1;
      renderJobHunt();
    });
  });
}
function renderJobTableBody(pageItems) {
  const body = $('#jhTableBody');
  if (!jobs.length) {
    body.innerHTML = `<tr><td colspan="9">
      ${emptyStateHtml('No job opportunities yet.', 'Add a job opportunity to start comparing roles against your profile.')}
      <div style="display:flex;justify-content:center;margin-top:-8px;padding-bottom:10px;"><button class="btn btn-primary btn-sm" id="jhTableAddJobBtn">+ Add Job</button></div>
    </td></tr>`;
    $('#jhTableAddJobBtn').addEventListener('click', () => openJobModal(null));
    return;
  }
  if (!pageItems.length) { body.innerHTML = `<tr><td colspan="9">${emptyStateHtml('No jobs match these filters', 'Try adjusting search, source, employment type, match, or status.')}</td></tr>`; return; }
  body.innerHTML = pageItems.map(j => `
    <tr class="${jhSelectedId === j.id ? 'row-selected' : ''}" data-id="${j.id}">
      <td><input type="checkbox" class="jh-row-check" data-id="${j.id}" onclick="event.stopPropagation()" /></td>
      <td><div class="task-title-cell">${escapeHtml(j.title)}</div></td>
      <td>${escapeHtml(j.company)}</td>
      <td><span class="source-badge">${escapeHtml(j.source)}</span></td>
      <td>${jobSalaryDisplay(j) === 'Not provided' ? '<span class="kmo-dash">—</span>' : escapeHtml(jobSalaryDisplay(j))}</td>
      <td><span class="status-badge" style="background:${jobMatchColor(j.matchScore)}1a;color:${jobMatchColor(j.matchScore)}">${j.matchScore !== null && j.matchScore !== undefined ? j.matchScore + '% · ' + jobMatchLabel(j.matchScore) : (j.matchStatus === 'Not enough data' ? 'Not enough data' : 'Not analyzed')}</span>${isJobMatchStale(j) ? ' <span class="status-badge" style="background:var(--warning)1a;color:var(--warning);" title="Job Profile changed since this was analyzed">⚠ Stale</span>' : ''}</td>
      <td><span class="status-badge" style="background:${jobStatusColor(j.status)}1a;color:${jobStatusColor(j.status)}">${j.status}</span></td>
      <td>${fmtDateShort(j.dateAdded)}</td>
      <td><button class="btn btn-ghost btn-sm jh-delete" data-id="${j.id}">Delete</button></td>
    </tr>
  `).join('');
  body.querySelectorAll('tr[data-id]').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('input,button')) return;
      jhSelectedId = row.dataset.id;
      jhDetailTab = 'overview';
      body.querySelectorAll('tr.row-selected').forEach(r => r.classList.remove('row-selected'));
      row.classList.add('row-selected');
      renderJobDetailPanel();
      if (typeof kaiOnNavigate === 'function') kaiOnNavigate();
    });
  });
  body.querySelectorAll('.jh-delete').forEach(btn => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (confirm('Delete this job opportunity?')) deleteJob(btn.dataset.id);
  }));
}
function initJobHuntInteractions(el) {
  $('#jhOpenProfileBtn').addEventListener('click', openJobProfileModal);
  $('#jhAnalyzeAllBtn').addEventListener('click', async (e) => {
    e.target.disabled = true; const original = e.target.textContent; e.target.textContent = 'Analyzing...';
    try { await analyzeAllJobs(); } finally { e.target.disabled = false; e.target.textContent = original; }
  });
  $('#jhSearchInput').addEventListener('input', (e) => { jhSearchTerm = e.target.value; jhPage = 1; renderJobHunt(); });
  $('#jhSourceSelect').addEventListener('change', (e) => { jhSourceFilter = e.target.value; jhPage = 1; renderJobHunt(); });
  $('#jhEmploymentSelect').addEventListener('change', (e) => { jhEmploymentFilter = e.target.value; jhPage = 1; renderJobHunt(); });
  $('#jhMatchSelect').addEventListener('change', (e) => { jhMatchFilter = e.target.value; jhPage = 1; renderJobHunt(); });
  $('#jhStatusSelect').addEventListener('change', (e) => { jhStatusFilter = e.target.value; jhPage = 1; renderJobHunt(); });
  el.querySelectorAll('#jhChartRangeToggle .filter-chip').forEach(btn => {
    btn.addEventListener('click', () => { jhChartRange = btn.dataset.range; el.querySelectorAll('#jhChartRangeToggle .filter-chip').forEach(b => b.classList.toggle('active', b === btn)); renderJobActivityChart(); });
  });
  el.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sortKey;
      jhSort = { key, dir: jhSort.key === key && jhSort.dir === 'asc' ? 'desc' : 'asc' };
      renderJobHunt();
    });
  });
  const prevBtn = $('#jhPagePrev'), nextBtn = $('#jhPageNext'), sizeSelect = $('#jhPageSizeSelect');
  if (prevBtn) prevBtn.addEventListener('click', () => { jhPage = Math.max(1, jhPage - 1); renderJobHunt(); });
  if (nextBtn) nextBtn.addEventListener('click', () => { jhPage = jhPage + 1; renderJobHunt(); });
  if (sizeSelect) sizeSelect.addEventListener('change', (e) => { jhPageSize = Number(e.target.value); jhPage = 1; renderJobHunt(); });
}

function renderJobDetailPanel() {
  const container = $('#jhDetailPanel');
  const job = jhSelectedId ? jobs.find(j => j.id === jhSelectedId) : null;
  if (!job) {
    container.innerHTML = `<div class="panel appt-quick-info"><h4>Selected Job</h4><p class="muted-sub" style="margin:0;">Select a job from the table to view details.</p></div>`;
    return;
  }
  const tabs = ['overview', 'requirements', 'match', 'application', 'notes'];
  const tabLabels = { overview: 'Overview', requirements: 'Requirements', match: 'Match Analysis', application: 'Application', notes: 'Notes' };
  container.innerHTML = `
    <div class="panel appt-quick-info">
      <h4>${escapeHtml(job.title)}</h4>
      <p class="muted-sub" style="margin:0 0 10px;">${escapeHtml(job.company)}</p>
      <div class="appt-qi-row">
        <span class="appt-qi-label">Status</span>
        <select class="exec-range-select" id="jhStatusChange" style="font-size:11px;padding:5px 8px;">
          ${JOB_STATUSES.map(s => `<option ${job.status === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="filter-chips" style="margin:10px 0 4px;">
        ${tabs.map(t => `<button class="filter-chip ${jhDetailTab === t ? 'active' : ''}" data-tab="${t}">${tabLabels[t]}</button>`).join('')}
      </div>
      <div id="jhDetailTabBody"></div>
      <div class="appt-qi-actions">
        ${job.sourceUrl ? `<a class="btn btn-ghost btn-sm" href="${escapeHtml(job.sourceUrl)}" target="_blank" rel="noopener">View Original Job</a>` : ''}
        <button class="btn btn-secondary btn-sm" id="jhEditBtn">Edit</button>
        <button class="btn btn-primary btn-sm" id="jhPrepareBtn">Prepare Application</button>
      </div>
    </div>
  `;
  container.querySelectorAll('[data-tab]').forEach(btn => btn.addEventListener('click', () => { jhDetailTab = btn.dataset.tab; renderJobDetailPanel(); }));
  $('#jhStatusChange').addEventListener('change', (e) => updateJob(job.id, { status: e.target.value }).catch(err => showToast(err.message)));
  $('#jhEditBtn').addEventListener('click', () => openJobModal(job));
  $('#jhPrepareBtn').addEventListener('click', () => { jhDetailTab = 'application'; renderJobDetailPanel(); });
  renderJobDetailTabBody(job);
}
function jhAutoSaveField(id, field) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', () => updateJob(jhSelectedId, { [field]: el.value }).catch(err => showToast(err.message)));
}
function renderJobDetailTabBody(job) {
  const body = $('#jhDetailTabBody');
  if (jhDetailTab === 'overview') {
    body.innerHTML = `
      <div class="appt-qi-row"><span class="appt-qi-label">Source</span><span class="appt-qi-value">${escapeHtml(job.source)}</span></div>
      <div class="appt-qi-row"><span class="appt-qi-label">Employment Type</span><span class="appt-qi-value">${escapeHtml(job.employmentType)}</span></div>
      <div class="appt-qi-row"><span class="appt-qi-label">Location</span><span class="appt-qi-value">${job.location ? escapeHtml(job.location) : 'Not provided'}</span></div>
      <div class="appt-qi-row"><span class="appt-qi-label">Salary</span><span class="appt-qi-value">${jobSalaryDisplay(job)}</span></div>
      <div class="appt-qi-row"><span class="appt-qi-label">Posted Date</span><span class="appt-qi-value">${job.postedDate ? fmtDateShort(job.postedDate) : 'Not provided'}</span></div>
      <div class="appt-qi-row"><span class="appt-qi-label">Date Added</span><span class="appt-qi-value">${fmtDateShort(job.dateAdded)}</span></div>
      <div class="appt-qi-row" style="display:block;"><span class="appt-qi-label">Description</span><p class="muted-sub" style="margin:4px 0 0;white-space:pre-line;">${job.description ? escapeHtml(job.description) : 'Not provided'}</p></div>
      <div class="appt-qi-row" style="display:block;"><span class="appt-qi-label">Skills / Keywords</span><p class="muted-sub" style="margin:4px 0 0;">${job.skills && job.skills.length ? job.skills.map(escapeHtml).join(', ') : 'Not provided'}</p></div>
    `;
  } else if (jhDetailTab === 'requirements') {
    body.innerHTML = job.requirements && job.requirements.length
      ? `<ul style="margin:0;padding-left:18px;font-size:12px;color:var(--text);">${job.requirements.map(r => `<li style="margin-bottom:5px;">${escapeHtml(r)}</li>`).join('')}</ul>`
      : `<p class="muted-sub" style="margin:0;">Not provided</p>`;
  } else if (jhDetailTab === 'match') {
    body.innerHTML = jobMatchTabHtml(job);
    wireJobMatchTabEvents(job);
  } else if (jhDetailTab === 'application') {
    renderApplicationPrepTab(job);
  } else if (jhDetailTab === 'notes') {
    body.innerHTML = `<textarea id="jhNotesField" rows="6" placeholder="Add notes about this job..." style="width:100%;">${escapeHtml(job.notes || '')}</textarea>`;
    jhAutoSaveField('jhNotesField', 'notes');
  }
}

/* ================= Phase 2D — Application Preparation.
   Generation is deterministic templating (application-prep-engine.js) over
   the job's own stored fields + the real Job Profile + the already-computed
   Match Analysis. Nothing here calls an external AI/API, and nothing is
   auto-submitted — Save Draft/Mark Ready to Apply/View Original Job are the
   only actions, all explicit and user-triggered. ================= */
function questionCardHtml(q, idx) {
  return `
    <div class="appt-quick-info" style="margin-top:8px;" data-q-idx="${idx}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <span class="appt-qi-label">Question ${idx + 1}</span>
        <button class="btn btn-ghost btn-sm jh-q-delete" data-idx="${idx}">Delete</button>
      </div>
      <textarea class="jh-q-question" data-idx="${idx}" rows="2" placeholder="Paste the employer's question here..." style="width:100%;margin-bottom:6px;">${escapeHtml(q.question || '')}</textarea>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <span class="appt-qi-label">Answer</span>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-ghost btn-sm jh-q-draft" data-idx="${idx}">Draft Answer</button>
          <button class="btn btn-ghost btn-sm jh-copy-btn" data-target-idx="${idx}">Copy</button>
        </div>
      </div>
      <textarea class="jh-q-answer" data-idx="${idx}" rows="2" placeholder="Not answered yet" style="width:100%;">${escapeHtml(q.answer || '')}</textarea>
    </div>
  `;
}
function renderQuestionsListHtml() {
  if (!jhQuestionsDraft.length) return `<p class="muted-sub" style="margin:8px 0 0;">No application questions added yet.</p>`;
  return jhQuestionsDraft.map((q, i) => questionCardHtml(q, i)).join('');
}
function syncQuestionsDraftFromDom() {
  const body = $('#jhDetailTabBody');
  body.querySelectorAll('.jh-q-question').forEach(el => { const i = Number(el.dataset.idx); if (jhQuestionsDraft[i]) jhQuestionsDraft[i].question = el.value; });
  body.querySelectorAll('.jh-q-answer').forEach(el => { const i = Number(el.dataset.idx); if (jhQuestionsDraft[i]) jhQuestionsDraft[i].answer = el.value; });
}
function rerenderQuestionsList() {
  $('#jhQuestionsList').innerHTML = renderQuestionsListHtml();
  wireQuestionCardEvents();
}
function wireQuestionCardEvents() {
  const body = $('#jhDetailTabBody');
  body.querySelectorAll('.jh-q-question, .jh-q-answer').forEach(el => el.addEventListener('input', syncQuestionsDraftFromDom));
  body.querySelectorAll('.jh-q-delete').forEach(btn => btn.addEventListener('click', () => {
    syncQuestionsDraftFromDom();
    jhQuestionsDraft.splice(Number(btn.dataset.idx), 1);
    rerenderQuestionsList();
  }));
  body.querySelectorAll('.jh-q-draft').forEach(btn => btn.addEventListener('click', () => {
    const idx = Number(btn.dataset.idx);
    syncQuestionsDraftFromDom();
    const job = jobs.find(j => j.id === jhSelectedId);
    const answer = draftAnswerFor(jhQuestionsDraft[idx].question, job, jobProfile);
    jhQuestionsDraft[idx].answer = answer;
    rerenderQuestionsList();
  }));
  body.querySelectorAll('.jh-copy-btn[data-target-idx]').forEach(btn => btn.addEventListener('click', () => {
    syncQuestionsDraftFromDom();
    copyToClipboard(jhQuestionsDraft[Number(btn.dataset.targetIdx)].answer || '');
  }));
}
function copyToClipboard(text) {
  if (!text) { showToast('Nothing to copy'); return; }
  navigator.clipboard.writeText(text).then(() => showToast('Copied')).catch(() => showToast('Could not copy'));
}

function renderApplicationPrepTab(job) {
  const body = $('#jhDetailTabBody');
  if (!jhAppDraftBuffer || jhAppDraftBuffer.jobId !== job.id) {
    jhAppDraftBuffer = {
      jobId: job.id,
      introduction: job.introduction || '',
      applicationDraft: job.applicationDraft || '',
      whyGoodFit: job.whyGoodFit || '',
      notes: job.notes || '',
      questions: (job.applicationQuestions || []).map(q => ({ question: q.question || '', answer: q.answer || '' })),
    };
  }
  const draft = jhAppDraftBuffer;
  jhQuestionsDraft = draft.questions;

  const prepared = !!job.applicationPreparedAt;
  const matchLine = job.matchStatus === 'Analyzed' && job.matchScore !== null && job.matchScore !== undefined
    ? `${job.matchScore}% ${jobMatchLabel(job.matchScore)}`
    : (job.matchStatus === 'Not enough data' ? 'Not enough data' : 'Not analyzed');

  if (!prepared) {
    body.innerHTML = `
      <div class="jp-section" style="margin-top:0;">
        <h3 style="margin:0 0 4px;">${escapeHtml(job.title)}</h3>
        <p class="muted-sub" style="margin:0 0 6px;">${escapeHtml(job.company)}</p>
        <p style="margin:0 0 12px;font-weight:700;color:${jobMatchColor(job.matchScore)};">${escapeHtml(matchLine)}</p>
        <p class="muted-sub" style="margin:0 0 12px;">Application not prepared yet.</p>
        <button class="btn btn-primary btn-sm" id="jhGenerateBtn">Prepare Application</button>
      </div>
    `;
    $('#jhGenerateBtn').addEventListener('click', () => runApplicationGeneration(job, false));
    return;
  }

  const whyFitList = [...(job.matchingSkills || []), ...(job.matchedRequirements || [])];
  const limitedInfoNote = job.matchConfidence === 'Low'
    ? `<p class="muted-sub" style="margin:6px 0 0;font-size:10.5px;">Limited job information available. Review the original posting and personalize the application before submitting.</p>` : '';

  body.innerHTML = `
    <div class="jp-section" style="margin-top:0;">
      <h3 style="margin:0 0 4px;">${escapeHtml(job.title)}</h3>
      <p class="muted-sub" style="margin:0 0 4px;">${escapeHtml(job.company)}</p>
      <p style="margin:0;font-weight:700;color:${jobMatchColor(job.matchScore)};">${escapeHtml(matchLine)}</p>
      ${limitedInfoNote}
    </div>
    <div class="jp-section">
      <h3>Why You're a Fit</h3>
      ${whyFitList.length ? `<p class="muted-sub" style="margin:0;color:var(--text);line-height:1.8;">${whyFitList.map(s => `✓ ${escapeHtml(s)}`).join('<br>')}</p>` : `<p class="muted-sub" style="margin:0;">Not analyzed yet — run Match Analysis first.</p>`}
    </div>
    <div class="jp-section">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;">Introduction</h3>
        <button class="btn btn-ghost btn-sm jh-copy-btn" data-target="jhIntroField">Copy</button>
      </div>
      <textarea id="jhIntroField" rows="3" style="width:100%;margin-top:6px;">${escapeHtml(draft.introduction)}</textarea>
    </div>
    <div class="jp-section">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;">Application Message</h3>
        <button class="btn btn-ghost btn-sm jh-copy-btn" data-target="jhDraftField">Copy</button>
      </div>
      <textarea id="jhDraftField" rows="7" style="width:100%;margin-top:6px;">${escapeHtml(draft.applicationDraft)}</textarea>
    </div>
    <div class="jp-section">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;">Why I'm a Good Fit</h3>
        <button class="btn btn-ghost btn-sm jh-copy-btn" data-target="jhWhyFitField">Copy</button>
      </div>
      <textarea id="jhWhyFitField" rows="3" style="width:100%;margin-top:6px;">${escapeHtml(draft.whyGoodFit)}</textarea>
    </div>
    <div class="jp-section">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h3 style="margin:0;">Application Questions</h3>
        <button class="btn btn-ghost btn-sm" id="jhAddQuestionBtn">+ Add Question</button>
      </div>
      <div id="jhQuestionsList">${renderQuestionsListHtml()}</div>
    </div>
    <div class="jp-section">
      <h3>Application Notes</h3>
      <textarea id="jhAppNotesField" rows="3" placeholder="Recruiter name, follow-up date, interview notes..." style="width:100%;">${escapeHtml(draft.notes)}</textarea>
    </div>
    <div class="modal-actions" style="margin-top:4px;flex-wrap:wrap;">
      <span class="spacer"></span>
      <button class="btn btn-ghost btn-sm" id="jhRegenerateBtn">Regenerate</button>
      <button class="btn btn-secondary btn-sm" id="jhMarkReadyBtn">Mark Ready to Apply</button>
      <button class="btn btn-primary btn-sm" id="jhSaveDraftBtn">Save Draft</button>
    </div>
  `;
  wireApplicationPrepEvents(job);
  wireQuestionCardEvents();
}

function wireApplicationPrepEvents(job) {
  const fieldMap = { jhIntroField: 'introduction', jhDraftField: 'applicationDraft', jhWhyFitField: 'whyGoodFit', jhAppNotesField: 'notes' };
  Object.entries(fieldMap).forEach(([id, field]) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => { jhAppDraftBuffer[field] = el.value; });
  });
  $('#jhAddQuestionBtn').addEventListener('click', () => {
    syncQuestionsDraftFromDom();
    jhQuestionsDraft.push({ question: '', answer: '' });
    rerenderQuestionsList();
  });
  $('#jhRegenerateBtn').addEventListener('click', () => runApplicationGeneration(job, true));
  $('#jhMarkReadyBtn').addEventListener('click', () => {
    updateJob(job.id, { status: 'Ready to Apply' })
      .then(() => { showToast('Marked Ready to Apply'); renderJobDetailPanel(); renderJobTableBody(jhSortedList().slice((jhPage - 1) * jhPageSize, jhPage * jhPageSize)); renderApplicationFunnel(); })
      .catch(err => showToast(err.message));
  });
  $('#jhSaveDraftBtn').addEventListener('click', () => saveApplicationDraft(job));
  document.querySelectorAll('.jh-copy-btn[data-target]').forEach(btn => btn.addEventListener('click', () => {
    const el = document.getElementById(btn.dataset.target);
    copyToClipboard(el ? el.value : '');
  }));
}

async function saveApplicationDraft(job) {
  syncQuestionsDraftFromDom();
  const updates = {
    introduction: $('#jhIntroField').value,
    applicationDraft: $('#jhDraftField').value,
    whyGoodFit: $('#jhWhyFitField').value,
    notes: $('#jhAppNotesField').value,
    applicationQuestions: jhQuestionsDraft.filter(q => q.question.trim() || q.answer.trim()),
    applicationLastUpdatedAt: new Date().toISOString(),
  };
  try {
    await updateJob(job.id, updates);
    jhAppDraftBuffer = null;
    showToast('Draft saved');
  } catch (err) {
    showToast(err.message || 'Could not save draft');
  }
}

async function runApplicationGeneration(job, isRegenerate) {
  if (isRegenerate) {
    const current = jhAppDraftBuffer && jhAppDraftBuffer.jobId === job.id ? jhAppDraftBuffer : job;
    const hasContent = current.introduction || current.applicationDraft || current.whyGoodFit;
    if (hasContent && !confirm("Regenerating will replace your current Introduction, Application Message, and Why I'm a Good Fit. Your Application Questions and Notes will be kept. Continue?")) return;
  }
  let workingJob = job;
  if (job.matchStatus !== 'Analyzed') {
    const matchResult = calculateJobMatch(job, jobProfile);
    workingJob = { ...job, ...matchResult };
    try { await updateJob(job.id, matchResult); } catch (err) { showToast(err.message || 'Could not analyze this job'); return; }
  }
  const introduction = generateIntroduction(workingJob, jobProfile);
  const applicationDraft = generateApplicationMessage(workingJob, jobProfile);
  const whyGoodFit = generateWhyGoodFit(workingJob, jobProfile);
  const now = new Date().toISOString();
  try {
    await updateJob(job.id, {
      introduction, applicationDraft, whyGoodFit,
      applicationPreparedAt: workingJob.applicationPreparedAt || now,
      applicationLastUpdatedAt: now,
    });
    jhAppDraftBuffer = null;
    showToast(isRegenerate ? 'Application regenerated' : 'Application prepared');
    renderJobDetailPanel();
  } catch (err) {
    showToast(err.message || 'Could not prepare application');
  }
}

/* Job-scoped Kai answers — reuses the existing Kai panel/response rendering,
   computed from real job.skills vs jobProfile data. Never invents a skill or
   percentage that isn't actually present in stored data. */
function kaiAskAboutJob(job, question) {
  openKai();
  kaiAppendUserMsg(question);
  const overlap = jobSkillOverlap(job);
  let text;
  if (question === 'Why is this a good match?') {
    if (job.matchScore === null || job.matchScore === undefined) {
      text = `${job.title} at ${job.company} hasn't been analyzed for a match score yet.`;
    } else {
      text = `${job.title} at ${job.company} is a ${jobMatchLabel(job.matchScore)} (${job.matchScore}%).`;
    }
    if (overlap.matching.length) text += `\n\nSkills from this posting that match your Job Profile: ${overlap.matching.join(', ')}.`;
    else if (overlap.hasProfile && overlap.hasJobSkills) text += `\n\nNone of this job's listed skills currently match your Job Profile.`;
  } else if (question === 'What should I highlight?') {
    text = overlap.matching.length
      ? `Based on your Job Profile, highlight: ${overlap.matching.join(', ')}.`
      : (overlap.hasProfile ? `This job's listed skills don't overlap with your Job Profile yet — nothing specific to highlight from that comparison.` : `Add skills, tools, or services to your Job Profile so Kai can tell you what to highlight.`);
  } else if (question === 'Do I meet the requirements?') {
    if (!job.requirements || !job.requirements.length) {
      text = `No requirements were listed for ${job.title} at ${job.company}, so there's nothing to compare yet.`;
    } else if (!overlap.hasProfile) {
      text = `Add skills, tools, or services to your Job Profile so Kai can compare it against the ${job.requirements.length} requirement${job.requirements.length === 1 ? '' : 's'} listed for this job.`;
    } else {
      text = `This job lists ${job.requirements.length} requirement${job.requirements.length === 1 ? '' : 's'}:\n${job.requirements.map(r => `• ${r}`).join('\n')}\n\nKai can only compare listed skills/keywords against your profile, not free-text requirements — check the Match Analysis tab for the skill-level comparison.`;
    }
  } else if (question === 'What are the potential gaps?') {
    text = overlap.missing.length
      ? `Skills listed on this job that aren't in your Job Profile: ${overlap.missing.join(', ')}.`
      : (overlap.hasJobSkills ? `No gaps found — every skill listed on this job is already in your Job Profile.` : `This job has no listed skills/keywords yet, so Kai can't check for gaps.`);
  } else {
    text = "I don't have a specific answer for that yet.";
  }
  const thinking = kaiAppendThinking('Kai is checking your CRM...');
  setTimeout(() => {
    thinking.remove();
    kaiRenderResponse({ text });
  }, prefersReducedMotion() ? 0 : 450);
}

/* ---- Add/Edit Job modal ---- */
function openJobModal(job) {
  $('#jobModalTitle').textContent = job ? 'Edit Job Opportunity' : 'Add Job Opportunity';
  $('#fJobId').value = job ? job.id : '';
  $('#fJobTitle').value = job ? job.title : '';
  $('#fJobCompany').value = job ? job.company : '';
  $('#fJobLocation').value = job ? job.location : '';
  $('#fJobSource').value = job ? job.source : 'OnlineJobs.ph';
  $('#fJobSourceUrl').value = job ? job.sourceUrl : '';
  $('#fJobEmploymentType').value = job ? job.employmentType : 'Full-Time';
  $('#fJobSalary').value = job ? job.salary : '';
  $('#fJobSalaryMin').value = job && job.salaryMin !== null && job.salaryMin !== undefined ? job.salaryMin : '';
  $('#fJobSalaryMax').value = job && job.salaryMax !== null && job.salaryMax !== undefined ? job.salaryMax : '';
  $('#fJobSalaryType').value = job ? (job.salaryType || '') : '';
  $('#fJobPostedDate').value = job ? job.postedDate : '';
  $('#fJobStatus').value = job ? job.status : 'Saved';
  $('#fJobDescription').value = job ? job.description : '';
  $('#fJobRequirements').value = job && job.requirements ? job.requirements.join('\n') : '';
  $('#fJobSkills').value = job && job.skills ? job.skills.join(', ') : '';
  $('#fJobNotes').value = job ? (job.notes || '') : '';
  $('#jobModalOverlay').classList.remove('hidden');
  $('#fJobTitle').focus();
}
function closeJobModal() { $('#jobModalOverlay').classList.add('hidden'); }
function initJobForm() {
  $('#jobModalClose').addEventListener('click', closeJobModal);
  $('#jobModalCancel').addEventListener('click', closeJobModal);
  $('#jobModalOverlay').addEventListener('click', (e) => { if (e.target.id === 'jobModalOverlay') closeJobModal(); });
  $('#jobForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = $('#fJobId').value;
    const title = $('#fJobTitle').value.trim();
    const company = $('#fJobCompany').value.trim();
    const source = $('#fJobSource').value;
    const sourceUrl = $('#fJobSourceUrl').value.trim();
    const salaryMinRaw = $('#fJobSalaryMin').value.trim();
    const salaryMaxRaw = $('#fJobSalaryMax').value.trim();

    if (!title) { showToast('Job Title is required'); $('#fJobTitle').focus(); return; }
    if (!company) { showToast('Company is required'); $('#fJobCompany').focus(); return; }
    if (!source) { showToast('Source is required'); return; }
    if (sourceUrl) {
      try { new URL(sourceUrl); } catch { showToast('Source URL is not a valid URL'); $('#fJobSourceUrl').focus(); return; }
      if (!/^https?:\/\//i.test(sourceUrl)) { showToast('Source URL must start with http:// or https://'); $('#fJobSourceUrl').focus(); return; }
    }
    if (salaryMinRaw && isNaN(Number(salaryMinRaw))) { showToast('Salary Min must be a number'); $('#fJobSalaryMin').focus(); return; }
    if (salaryMaxRaw && isNaN(Number(salaryMaxRaw))) { showToast('Salary Max must be a number'); $('#fJobSalaryMax').focus(); return; }
    if (salaryMinRaw && salaryMaxRaw && Number(salaryMinRaw) > Number(salaryMaxRaw)) { showToast('Salary Min cannot be greater than Salary Max'); $('#fJobSalaryMin').focus(); return; }

    const payload = {
      title, company, source, sourceUrl,
      location: $('#fJobLocation').value.trim(),
      employmentType: $('#fJobEmploymentType').value,
      salary: $('#fJobSalary').value.trim(),
      salaryMin: salaryMinRaw === '' ? null : Number(salaryMinRaw),
      salaryMax: salaryMaxRaw === '' ? null : Number(salaryMaxRaw),
      salaryType: $('#fJobSalaryType').value,
      postedDate: $('#fJobPostedDate').value,
      status: $('#fJobStatus').value,
      description: $('#fJobDescription').value.trim(),
      requirements: $('#fJobRequirements').value.split('\n').map(s => s.trim()).filter(Boolean),
      skills: $('#fJobSkills').value.split(',').map(s => s.trim()).filter(Boolean),
      notes: $('#fJobNotes').value.trim(),
    };
    const onSuccess = (savedJob) => {
      jhSelectedId = savedJob.id;
      jhDetailTab = 'overview';
      closeJobModal();
      showToast(id ? 'Job opportunity updated' : 'Job opportunity added');
      render();
    };
    const onError = (err) => showToast(err.message || 'Could not save job');
    if (id) updateJob(id, payload).then(onSuccess).catch(onError);
    else createJob(payload).then(onSuccess).catch(onError);
  });
}

/* ================= BILLING ================= */
async function createInvoice(contactId, amount, dueDate) {
  const res = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contactId, amount, dueDate, issueDate: todayStr() }) });
  const created = await res.json();
  invoices.unshift(created);
  render();
}
async function updateInvoiceStatus(id, status) {
  const res = await fetch(`/api/invoices/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  const updated = await res.json();
  const idx = invoices.findIndex(i => i.id === id);
  if (idx !== -1) invoices[idx] = updated;
  render();
}
async function deleteInvoice(id) {
  await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
  invoices = invoices.filter(i => i.id !== id);
  render();
}
function renderBilling() {
  const outstanding = invoices.filter(i => invoiceEffectiveStatus(i) !== 'Paid').reduce((s, i) => s + Number(i.amount || 0), 0);
  const thisMonth = todayStr().slice(0, 7);
  const paidThisMonth = invoices.filter(i => i.status === 'Paid' && (i.createdAt || '').slice(0, 7) === thisMonth).reduce((s, i) => s + Number(i.amount || 0), 0);
  const overdue = invoices.filter(i => invoiceEffectiveStatus(i) === 'Overdue').reduce((s, i) => s + Number(i.amount || 0), 0);
  const upcoming = invoices.filter(i => invoiceEffectiveStatus(i) === 'Pending' && i.dueDate && daysUntil(i.dueDate) >= 0).reduce((s, i) => s + Number(i.amount || 0), 0);
  animateValue($('#billOutstanding'), outstanding, true);
  animateValue($('#billPaid'), paidThisMonth, true);
  animateValue($('#billOverdue'), overdue, true);
  animateValue($('#billUpcoming'), upcoming, true);

  const body = $('#invoicesTableBody');
  body.innerHTML = '';
  $('#invoicesEmpty').innerHTML = invoices.length ? '' : emptyStateHtml('No invoices have been created yet', 'Create your first invoice to start tracking billing.');
  [...invoices].sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || '')).forEach(inv => {
    const contact = contacts.find(c => c.id === inv.contactId);
    const status = invoiceEffectiveStatus(inv);
    const statusColor = { Draft: '#A8A6C2', Pending: '#F4B942', Paid: '#43D39E', Overdue: '#F05A72' }[status];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(contact ? contact.name : 'Unassigned')}</td>
      <td>${escapeHtml(inv.invoiceNumber)}</td>
      <td>${fmtMoney(inv.amount)}</td>
      <td>${fmtDateShort(inv.issueDate)}</td>
      <td>${fmtDateShort(inv.dueDate)}</td>
      <td><span class="status-badge" style="background:${statusColor}1a;color:${statusColor}"><span class="dot" style="background:${statusColor}"></span>${status}</span></td>
      <td></td>
    `;
    const actionsTd = tr.lastElementChild;
    if (status !== 'Paid') {
      const payBtn = document.createElement('button');
      payBtn.className = 'row-link'; payBtn.textContent = 'Mark Paid';
      payBtn.addEventListener('click', () => updateInvoiceStatus(inv.id, 'Paid'));
      actionsTd.appendChild(payBtn);
    }
    const delBtn = document.createElement('button');
    delBtn.className = 'row-link'; delBtn.style.color = 'var(--error)'; delBtn.style.marginLeft = '10px'; delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => deleteInvoice(inv.id));
    actionsTd.appendChild(delBtn);
    tr.addEventListener('click', (e) => {
      body.querySelectorAll('tr.row-selected').forEach(r => r.classList.remove('row-selected'));
      tr.classList.add('row-selected');
      if (contact && (e.target === tr || e.target.closest('td') === tr.firstElementChild)) openModal(contact);
    });
    body.appendChild(tr);
  });
}
function initBilling() {
  $('#createInvoiceBtn').addEventListener('click', () => quickCreateInvoiceFlow());
}

/* ================= DOCUMENTS ================= */
async function uploadDocument(file, name, contactId, type) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('name', name || file.name);
  formData.append('contactId', contactId || '');
  formData.append('type', type || 'Other');
  const res = await fetch('/api/documents', { method: 'POST', body: formData });
  const created = await res.json();
  documents.unshift(created);
  render();
}
async function deleteDocument(id) {
  await fetch(`/api/documents/${id}`, { method: 'DELETE' });
  documents = documents.filter(d => d.id !== id);
  render();
}
function renderDocuments() {
  const body = $('#documentsTableBody');
  body.innerHTML = '';
  $('#documentsEmpty').innerHTML = documents.length ? '' : emptyStateHtml('No documents', 'Client documents will appear here once uploaded.');
  [...documents].sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || '')).forEach(doc => {
    const contact = contacts.find(c => c.id === doc.contactId);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(doc.name)}</td>
      <td>${escapeHtml(contact ? contact.name : 'Unassigned')}</td>
      <td>${escapeHtml(doc.type)}</td>
      <td>${new Date(doc.uploadedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</td>
      <td></td>
    `;
    const actionsTd = tr.lastElementChild;
    const dl = document.createElement('a');
    dl.href = `/uploads/${doc.filename}`; dl.target = '_blank'; dl.className = 'row-link'; dl.textContent = 'Download';
    actionsTd.appendChild(dl);
    const delBtn = document.createElement('button');
    delBtn.className = 'row-link'; delBtn.style.color = 'var(--error)'; delBtn.style.marginLeft = '10px'; delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => deleteDocument(doc.id));
    actionsTd.appendChild(delBtn);
    tr.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      body.querySelectorAll('tr.row-selected').forEach(r => r.classList.remove('row-selected'));
      tr.classList.add('row-selected');
    });
    body.appendChild(tr);
  });
}
function initDocuments() {
  $('#uploadDocumentBtn').addEventListener('click', () => quickUploadDocumentFlow());
}

/* ================= PROJECTS ================= */
async function createProject(name, contactId, dueDate) {
  const res = await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, contactId, dueDate }) });
  const created = await res.json();
  projects.unshift(created);
  render();
}
async function updateProject(id, updates) {
  const res = await fetch(`/api/projects/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
  const updated = await res.json();
  const idx = projects.findIndex(p => p.id === id);
  if (idx !== -1) projects[idx] = updated;
  render();
}
function renderProjects() {
  const grid = $('#projectsGrid');
  if (!projects.length) { grid.innerHTML = emptyStateHtml('No client projects yet', 'Create your first project to connect tasks, billing, and documents for a client.'); return; }
  grid.innerHTML = projects.map(p => {
    const contact = contacts.find(c => c.id === p.contactId);
    const projectTasks = tasks.filter(t => t.projectId === p.id);
    const done = projectTasks.filter(t => t.status === 'done').length;
    const pct = projectTasks.length ? Math.round((done / projectTasks.length) * 100) : 0;
    return `
      <div class="project-card" data-id="${p.id}">
        <h4>${escapeHtml(p.name)}</h4>
        <div class="project-client">${escapeHtml(contact ? contact.name : 'No client linked')}</div>
        <div class="project-progress-track"><div class="project-progress-fill" style="width:${pct}%"></div></div>
        <div class="project-meta"><span>${done} / ${projectTasks.length} tasks</span><span class="status-badge" style="background:var(--lavender);color:var(--plum);">${p.status}</span></div>
        ${p.dueDate ? `<div class="project-meta" style="margin-top:6px;"><span>Due ${fmtDateShort(p.dueDate)}</span></div>` : ''}
      </div>
    `;
  }).join('');
  grid.querySelectorAll('.project-card').forEach(card => {
    card.addEventListener('click', () => {
      grid.querySelectorAll('.project-card.row-selected').forEach(c => c.classList.remove('row-selected'));
      card.classList.add('row-selected');
      const p = projects.find(x => x.id === card.dataset.id);
      const contact = contacts.find(c => c.id === p.contactId);
      if (contact) { openModal(contact); return; }
      const next = prompt('Update status (Planning, In Progress, On Hold, Completed, Cancelled):', p.status);
      if (next) updateProject(p.id, { status: next });
    });
  });
}
function initProjects() {
  $('#createProjectBtn').addEventListener('click', () => {
    const name = prompt('Project name:');
    if (!name) return;
    let contactId = '';
    if (contacts.length) {
      const names = contacts.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
      const pick = prompt(`Link to which client? Enter a number, or leave blank:\n${names}`);
      const idx = Number(pick) - 1;
      if (contacts[idx]) contactId = contacts[idx].id;
    }
    const dueDate = prompt('Due date (YYYY-MM-DD), optional:', '');
    createProject(name, contactId, dueDate);
  });
}

/* ================= ANALYTICS (Executive Minimal) ================= */
let anDateRangeDays = 30; // number of days, or 'year'
let anTrendDays = 30;
let anTab = 'overview';
let anCustomFrom = '', anCustomTo = '';

function anRangeBounds() {
  const now = new Date(); now.setHours(23, 59, 59, 999);
  let start;
  if (anDateRangeDays === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
  } else if (anDateRangeDays === 'custom' && anCustomFrom && anCustomTo) {
    return { start: new Date(anCustomFrom + 'T00:00:00'), end: new Date(anCustomTo + 'T23:59:59') };
  } else {
    start = new Date(now); start.setDate(start.getDate() - (Number(anDateRangeDays) - 1)); start.setHours(0, 0, 0, 0);
  }
  return { start, end: now };
}
function anRangeLengthMs(bounds) { return bounds.end.getTime() - bounds.start.getTime(); }
function inRange(dateStr, bounds) {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  return t >= bounds.start.getTime() && t <= bounds.end.getTime();
}
function anContactsInRange(bounds) { return contacts.filter(c => inRange(c.createdAt, bounds)); }
function anPrevBounds(bounds) {
  const len = anRangeLengthMs(bounds);
  return { start: new Date(bounds.start.getTime() - len), end: new Date(bounds.start.getTime() - 1) };
}

function pctChangeLabel(current, previous) {
  if (previous > 0) {
    const pct = Math.round(((current - previous) / previous) * 100);
    const arrow = pct >= 0 ? '↑' : '↓';
    return { text: `${arrow} ${Math.abs(pct)}% vs previous period`, positive: pct >= 0 };
  }
  if (current > 0) return { text: 'New this period', positive: true };
  return { text: 'No data yet', positive: null };
}

function renderAnalytics() {
  const bounds = anRangeBounds();
  const prevBounds = anPrevBounds(bounds);
  renderExecKpiRow(bounds, prevBounds);
  if (anTab === 'overview') renderOverviewTab(bounds);
  if (anTab === 'leads') renderLeadsTab(bounds);
  if (anTab === 'pipeline') renderPipelineTab();
  if (anTab === 'revenue') renderRevenueTab(bounds);
  if (anTab === 'activity') renderActivityTab(bounds);
}

/* ---- Executive summary KPIs ---- */
function renderExecKpiRow(bounds, prevBounds) {
  const leadsNow = anContactsInRange(bounds).length;
  const leadsPrev = anContactsInRange(prevBounds).length;

  const meetingsNow = anContactsInRange(bounds).filter(c => FUNNEL_ORDER.indexOf(c.stage) >= FUNNEL_ORDER.indexOf('held')).length;
  const meetingsPrev = anContactsInRange(prevBounds).filter(c => FUNNEL_ORDER.indexOf(c.stage) >= FUNNEL_ORDER.indexOf('held')).length;

  const convertedNow = contacts.filter(c => c.stage === 'client' && inRange(c.lastActivity, bounds)).length;
  const convertedPrev = contacts.filter(c => c.stage === 'client' && inRange(c.lastActivity, prevBounds)).length;

  const rateNow = leadsNow ? (convertedNow / leadsNow) * 100 : 0;
  const ratePrev = leadsPrev ? (convertedPrev / leadsPrev) * 100 : 0;

  const kpis = [
    { label: 'New Leads', value: leadsNow, delta: pctChangeLabel(leadsNow, leadsPrev), view: 'contacts' },
    { label: 'Meetings', value: meetingsNow, delta: pctChangeLabel(meetingsNow, meetingsPrev), view: 'appointments' },
    { label: 'Converted', value: convertedNow, delta: pctChangeLabel(convertedNow, convertedPrev), view: 'contacts' },
    { label: 'Conversion Rate', value: rateNow.toFixed(1) + '%', delta: ratePrev > 0 ? pctChangeLabel(rateNow, ratePrev) : { text: leadsNow ? 'No prior data' : 'No data yet', positive: null }, deltaIsPts: true, view: null },
  ];
  $('#anKpiRow').innerHTML = kpis.map(k => `
    <div class="exec-kpi ${k.view ? 'clickable' : ''}" data-view="${k.view || ''}">
      <div class="exec-kpi-label">${k.label.toUpperCase()}</div>
      <div class="exec-kpi-value">${k.value}</div>
      <div class="exec-kpi-delta ${k.delta.positive === false ? 'negative' : k.delta.positive === true ? 'positive' : 'neutral'}">${k.delta.text}</div>
    </div>
  `).join('');
  $('#anKpiRow').querySelectorAll('.exec-kpi.clickable').forEach(el => {
    el.addEventListener('click', () => { contactsFilter = null; goToView(el.dataset.view); });
  });
}

/* ---- Lead trend (line chart) ---- */
function renderLeadTrend(container, days) {
  const series = buildDailySeries(days, 'leads');
  renderLineChart(container, series, 'leads');
}
function initTrendRangeToggle() {
  document.querySelectorAll('#anTrendRangeToggle .an-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.days) === anTrendDays);
    btn.addEventListener('click', () => {
      anTrendDays = Number(btn.dataset.days);
      document.querySelectorAll('#anTrendRangeToggle .an-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderLeadTrend($('#anTrendChart'), anTrendDays);
    });
  });
}

/* ---- Pipeline conversion table ---- */
/* ---- Generic inline drill-down panel, reused by Pipeline Conversion, Lead Aging, Performance by Period ---- */
function anDrillPanel(container) {
  let panel = container.nextElementSibling;
  if (!panel || !panel.classList.contains('an-drill-panel')) {
    panel = document.createElement('div');
    panel.className = 'an-drill-panel hidden';
    container.insertAdjacentElement('afterend', panel);
  }
  return panel;
}
function anHideDrill(container) { anDrillPanel(container).classList.add('hidden'); }
function anShowDrill(container, title, contactsList, viewAllPredicate, viewAllLabel) {
  const panel = anDrillPanel(container);
  if (!contactsList.length) {
    panel.innerHTML = `
      <div class="an-drill-header"><h4>${escapeHtml(title)}</h4><button class="an-drill-close">&times;</button></div>
      <p class="muted-sub" style="margin:0;">No additional data available.</p>
    `;
  } else {
    const shown = contactsList.slice(0, 8);
    const extra = contactsList.length - shown.length;
    panel.innerHTML = `
      <div class="an-drill-header"><h4>${escapeHtml(title)} · ${contactsList.length} lead${contactsList.length === 1 ? '' : 's'}</h4><button class="an-drill-close">&times;</button></div>
      <table class="an-drill-table">
        <thead><tr><th>Lead</th><th>Stage</th><th style="text-align:right;">Value</th><th>Next Action</th></tr></thead>
        <tbody>
          ${shown.map(c => `
            <tr class="exec-clickable-row" data-id="${c.id}">
              <td>${escapeHtml(c.name)}</td>
              <td><span class="status-badge" style="background:${stageOf(c).color}1a;color:${stageOf(c).color}">${stageOf(c).label}</span></td>
              <td style="text-align:right;">${c.value ? fmtMoney(c.value) : '—'}</td>
              <td>${nextActionFor(c)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${extra > 0 ? `<div class="an-drill-more">+${extra} more — <a href="#" id="anDrillViewAll">View all in Contacts</a></div>` : ''}
    `;
    panel.querySelectorAll('.exec-clickable-row').forEach(row => {
      row.addEventListener('click', () => { const c = contacts.find(x => x.id === row.dataset.id); if (c) openModal(c); });
    });
    const viewAll = panel.querySelector('#anDrillViewAll');
    if (viewAll) viewAll.addEventListener('click', (e) => {
      e.preventDefault();
      contactsFilter = { label: viewAllLabel, predicate: viewAllPredicate };
      goToView('contacts');
    });
  }
  panel.classList.remove('hidden');
  panel.querySelector('.an-drill-close').addEventListener('click', () => panel.classList.add('hidden'));
}
function renderConversionTable(container) {
  const active = contacts.filter(c => c.stage !== 'lost');
  const counts = FUNNEL_ORDER.map((key, i) => active.filter(c => FUNNEL_ORDER.indexOf(c.stage) >= i).length);
  if (!contacts.length) { container.innerHTML = emptyStateHtml('Not enough data yet', 'Pipeline conversion will appear once you have leads.'); return; }
  const rows = FUNNEL_ORDER.map((key, i) => {
    const stage = STAGES.find(s => s.key === key);
    const count = counts[i];
    const fromPrev = i === 0 ? null : (counts[i - 1] > 0 ? Math.round((count / counts[i - 1]) * 100) : 0);
    return { stage, count, fromPrev };
  });
  const overall = counts[0] > 0 ? Math.round((counts[counts.length - 1] / counts[0]) * 100) : 0;
  container.innerHTML = `
    <table class="exec-table">
      <thead><tr><th>Stage</th><th style="text-align:right;">Leads</th><th style="text-align:right;">From Previous</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr class="exec-clickable-row ${anStageSelected === r.stage.key ? 'dash-selected' : ''}" data-stage="${r.stage.key}">
            <td><span class="dot" style="background:${r.stage.color}"></span>${r.stage.label}</td>
            <td style="text-align:right;font-weight:700;">${r.count}</td>
            <td style="text-align:right;">${r.fromPrev === null ? '—' : r.fromPrev + '%'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="exec-overall-conversion">Overall conversion: <strong>${overall}%</strong></div>
  `;
  container.querySelectorAll('.exec-clickable-row').forEach(row => {
    row.addEventListener('click', () => {
      const key = row.dataset.stage;
      const stage = STAGES.find(s => s.key === key);
      if (anStageSelected === key) {
        anStageSelected = null;
        row.classList.remove('dash-selected');
        anHideDrill(container);
        return;
      }
      anStageSelected = key;
      container.querySelectorAll('.exec-clickable-row').forEach(r => r.classList.remove('dash-selected'));
      row.classList.add('dash-selected');
      const cumPredicate = (c) => FUNNEL_ORDER.indexOf(c.stage) >= FUNNEL_ORDER.indexOf(key);
      anShowDrill(container, `${stage.label}+`, active.filter(cumPredicate), cumPredicate, `${stage.label}+`);
    });
  });
  if (anStageSelected && rows.some(r => r.stage.key === anStageSelected)) {
    const stage = STAGES.find(s => s.key === anStageSelected);
    const cumPredicate = (c) => FUNNEL_ORDER.indexOf(c.stage) >= FUNNEL_ORDER.indexOf(anStageSelected);
    anShowDrill(container, `${stage.label}+`, active.filter(cumPredicate), cumPredicate, `${stage.label}+`);
  }
}

/* ---- Pipeline value summary ---- */
function renderValueSummary(container) {
  const open = contacts.filter(isActive).reduce((s, c) => s + (Number(c.value) || 0), 0);
  const won = contacts.filter(c => c.stage === 'client').reduce((s, c) => s + (Number(c.value) || 0), 0);
  const dealCount = contacts.filter(c => Number(c.value) > 0).length;
  const avgDeal = dealCount ? (open + won) / dealCount : 0;
  container.innerHTML = `
    <div class="exec-value-hero">${fmtMoney(open)}<span class="exec-value-hero-sub">Open pipeline</span></div>
    <div class="exec-value-grid">
      <div><div class="oi-label">Won</div><div class="oi-value" style="color:var(--success);">${fmtMoney(won)}</div></div>
      <div><div class="oi-label">Open</div><div class="oi-value" style="color:var(--primary);">${fmtMoney(open)}</div></div>
      <div><div class="oi-label">Average Deal</div><div class="oi-value">${fmtMoney(avgDeal)}</div></div>
    </div>
  `;
}

/* ---- Lead aging ---- */
function renderAgingChart(container) {
  const active = contacts.filter(isActive);
  const buckets = [
    { label: '0–3 days', min: 0, max: 3, count: 0 },
    { label: '4–7 days', min: 4, max: 7, count: 0 },
    { label: '8–14 days', min: 8, max: 14, count: 0 },
    { label: '15–30 days', min: 15, max: 30, count: 0 },
    { label: '30+ days', min: 31, max: Infinity, count: 0, warn: true },
  ];
  active.forEach(c => {
    const days = Math.floor((Date.now() - new Date(c.lastActivity || c.createdAt).getTime()) / DAY);
    const bucket = buckets.find(b => days >= b.min && days <= b.max);
    if (bucket) bucket.count++;
  });
  if (!active.length) { container.innerHTML = emptyStateHtml('Not enough data yet', 'Lead aging will appear once you have active leads.'); return; }
  const max = Math.max(1, ...buckets.map(b => b.count));
  const bucketPredicate = (min, max) => (c) => {
    if (!isActive(c)) return false;
    const days = Math.floor((Date.now() - new Date(c.lastActivity || c.createdAt).getTime()) / DAY);
    return days >= min && days <= max;
  };
  container.innerHTML = buckets.map(b => `
    <div class="aging-row ${b.warn ? 'warn' : ''} ${anAgingSelected === b.label ? 'dash-selected' : ''}" data-min="${b.min}" data-max="${b.max === Infinity ? '' : b.max}" data-label="${escapeHtml(b.label)}">
      <span class="aging-label">${b.label}</span>
      <div class="aging-track"><div class="aging-fill" style="width:${Math.max(6, Math.round((b.count / max) * 100))}%"></div></div>
      <span class="aging-count">${b.count}</span>
    </div>
  `).join('');
  container.querySelectorAll('.aging-row').forEach(row => {
    row.addEventListener('click', () => {
      const min = Number(row.dataset.min), maxV = row.dataset.max ? Number(row.dataset.max) : Infinity;
      const label = row.dataset.label;
      if (anAgingSelected === label) {
        anAgingSelected = null;
        row.classList.remove('dash-selected');
        anHideDrill(container);
        return;
      }
      anAgingSelected = label;
      container.querySelectorAll('.aging-row').forEach(r => r.classList.remove('dash-selected'));
      row.classList.add('dash-selected');
      anShowDrill(container, label, active.filter(bucketPredicate(min, maxV)), bucketPredicate(min, maxV), label);
    });
  });
  const selectedBucket = buckets.find(b => b.label === anAgingSelected);
  if (selectedBucket) {
    anShowDrill(container, selectedBucket.label, active.filter(bucketPredicate(selectedBucket.min, selectedBucket.max)), bucketPredicate(selectedBucket.min, selectedBucket.max), selectedBucket.label);
  }
}

/* ---- Leads needing attention ---- */
function nextActionFor(c) {
  if (c.stage === 'new' || c.stage === 'confirmed') return 'Follow up';
  if (c.stage === 'held') return 'Send proposal';
  if (c.stage === 'proposal') return 'Follow up on proposal';
  return 'Check in';
}
function renderAttentionTable(container) {
  const active = contacts.filter(isActive);
  const withDays = active.map(c => ({ c, days: Math.floor((Date.now() - new Date(c.lastActivity || c.createdAt).getTime()) / DAY) }));
  const flagged = withDays.filter(x => x.days >= 2 || followupBucket(x.c) === 'overdue').sort((a, b) => b.days - a.days).slice(0, 10);
  if (!flagged.length) { container.innerHTML = emptyStateHtml("You're all caught up", 'No leads currently need attention.'); return; }
  container.innerHTML = `
    <table class="exec-table">
      <thead><tr><th>Lead</th><th>Current Stage</th><th style="text-align:right;">Days in Stage</th><th style="text-align:right;">Value</th><th>Next Action</th><th>Status</th></tr></thead>
      <tbody>
        ${flagged.map(({ c, days }) => {
          const stage = stageOf(c);
          const status = followupBucket(c) === 'overdue' ? 'Overdue' : 'Needs Attention';
          const statusColor = status === 'Overdue' ? 'var(--error)' : 'var(--warning)';
          return `
            <tr class="exec-clickable-row" data-id="${c.id}">
              <td><div class="name-cell"><div class="avatar">${initials(c.name)}</div>${escapeHtml(c.name)}</div></td>
              <td><span class="status-badge" style="background:${stage.color}1a;color:${stage.color}">${stage.label}</span></td>
              <td style="text-align:right;">${days} day${days === 1 ? '' : 's'}</td>
              <td style="text-align:right;">${c.value ? fmtMoney(c.value) : '—'}</td>
              <td>${nextActionFor(c)}</td>
              <td><span class="status-badge" style="background:${statusColor}1a;color:${statusColor}">${status}</span></td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
  container.querySelectorAll('.exec-clickable-row').forEach(row => {
    row.addEventListener('click', () => {
      container.querySelectorAll('.exec-clickable-row.row-selected').forEach(r => r.classList.remove('row-selected'));
      row.classList.add('row-selected');
      const c = contacts.find(x => x.id === row.dataset.id); if (c) openModal(c);
    });
  });
}

/* ---- Lead source performance ---- */
function renderSourceTable(container) {
  const withSource = contacts.filter(c => c.leadSource);
  if (!withSource.length) {
    container.innerHTML = `
      ${emptyStateHtml('No data yet', 'Add a Lead Source when creating or editing a contact, and this section will populate automatically.')}
      <button class="btn btn-secondary btn-sm" id="anAddSourceBtn" style="margin:0 auto;display:block;">Add lead source to a contact</button>
    `;
    const btn = $('#anAddSourceBtn');
    if (btn) btn.addEventListener('click', () => { if (contacts[0]) openModal(contacts[0]); });
    return;
  }
  const sources = {};
  withSource.forEach(c => {
    sources[c.leadSource] = sources[c.leadSource] || { leads: 0, meetings: 0, clients: 0, value: 0 };
    sources[c.leadSource].leads++;
    if (FUNNEL_ORDER.indexOf(c.stage) >= FUNNEL_ORDER.indexOf('held')) sources[c.leadSource].meetings++;
    if (c.stage === 'client') sources[c.leadSource].clients++;
    if (isActive(c)) sources[c.leadSource].value += Number(c.value) || 0;
  });
  container.innerHTML = `
    <table class="exec-table">
      <thead><tr><th>Source</th><th style="text-align:right;">Leads</th><th style="text-align:right;">Meetings</th><th style="text-align:right;">Clients</th><th style="text-align:right;">Conversion</th><th style="text-align:right;">Pipeline Value</th></tr></thead>
      <tbody>
        ${Object.entries(sources).sort((a, b) => b[1].leads - a[1].leads).map(([name, s]) => `
          <tr class="exec-clickable-row" data-source="${escapeHtml(name)}">
            <td>${escapeHtml(name)}</td>
            <td style="text-align:right;">${s.leads}</td>
            <td style="text-align:right;">${s.meetings}</td>
            <td style="text-align:right;">${s.clients}</td>
            <td style="text-align:right;">${s.leads ? Math.round((s.clients / s.leads) * 100) : 0}%</td>
            <td style="text-align:right;">${fmtMoney(s.value)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  container.querySelectorAll('.exec-clickable-row').forEach(row => {
    row.addEventListener('click', () => {
      container.querySelectorAll('.exec-clickable-row.row-selected').forEach(r => r.classList.remove('row-selected'));
      row.classList.add('row-selected');
      contactSourceFilter = row.dataset.source;
      const sel = $('#contactSourceFilter'); if (sel) sel.value = row.dataset.source;
      goToView('contacts');
    });
  });
}

/* ---- Performance by period (weekly) ---- */
const PERIOD_SORT_COLS = [
  { key: 'period', label: 'Period', numeric: false },
  { key: 'newLeads', label: 'New Leads', numeric: true },
  { key: 'meetings', label: 'Meetings', numeric: true },
  { key: 'proposals', label: 'Proposals', numeric: true },
  { key: 'clients', label: 'Clients', numeric: true },
  { key: 'valueAdded', label: 'Pipeline Added', numeric: true },
];
function renderPeriodTable(container, bounds) {
  const weeks = [];
  let cursor = new Date(bounds.start);
  while (cursor <= bounds.end) {
    const weekStart = new Date(cursor);
    const weekEnd = new Date(cursor); weekEnd.setDate(weekEnd.getDate() + 6); weekEnd.setHours(23, 59, 59, 999);
    weeks.push({ start: weekStart, end: weekEnd > bounds.end ? bounds.end : weekEnd });
    cursor.setDate(cursor.getDate() + 7);
  }
  if (!weeks.length || !contacts.length) { container.innerHTML = emptyStateHtml('Not enough data yet', 'Weekly performance will appear as bookings come in.'); return; }
  const rows = weeks.map((w, i) => {
    const wb = { start: w.start, end: w.end };
    const created = contacts.filter(c => inRange(c.createdAt, wb));
    const meetings = contacts.filter(c => inRange(c.lastActivity, wb) && FUNNEL_ORDER.indexOf(c.stage) >= FUNNEL_ORDER.indexOf('held'));
    const proposals = contacts.filter(c => c.stage === 'proposal' && inRange(c.lastActivity, wb));
    const clients = contacts.filter(c => c.stage === 'client' && inRange(c.lastActivity, wb));
    const valueAdded = created.reduce((s, c) => s + (Number(c.value) || 0), 0);
    return {
      id: i, start: w.start, end: w.end,
      period: `${w.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${w.end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`,
      newLeads: created.length, meetings: meetings.length, proposals: proposals.length, clients: clients.length, valueAdded,
      createdContacts: created,
    };
  });
  const sorted = [...rows].sort((a, b) => {
    const { key, dir } = anPeriodSort;
    const av = a[key], bv = b[key];
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
    return dir === 'asc' ? cmp : -cmp;
  });
  container.innerHTML = `
    <table class="exec-table">
      <thead><tr>
        ${PERIOD_SORT_COLS.map(col => `
          <th class="sortable ${anPeriodSort.key === col.key ? 'sort-active' : ''}" data-sort-key="${col.key}" ${col.numeric ? 'style="text-align:right;"' : ''}>
            ${col.label}<span class="sort-arrow">${anPeriodSort.key === col.key ? (anPeriodSort.dir === 'asc' ? '↑' : '↓') : '↕'}</span>
          </th>
        `).join('')}
      </tr></thead>
      <tbody>
        ${sorted.map(r => `
          <tr class="exec-clickable-row ${anPeriodSelected === r.id ? 'dash-selected' : ''}" data-id="${r.id}">
            <td>${r.period}</td>
            <td style="text-align:right;">${r.newLeads}</td>
            <td style="text-align:right;">${r.meetings}</td>
            <td style="text-align:right;">${r.proposals}</td>
            <td style="text-align:right;">${r.clients}</td>
            <td style="text-align:right;">${fmtMoney(r.valueAdded)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  container.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sortKey;
      anPeriodSort = { key, dir: anPeriodSort.key === key && anPeriodSort.dir === 'asc' ? 'desc' : 'asc' };
      renderPeriodTable(container, bounds);
    });
  });
  container.querySelectorAll('.exec-clickable-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = Number(row.dataset.id);
      const r = rows.find(x => x.id === id);
      if (anPeriodSelected === id) {
        anPeriodSelected = null;
        row.classList.remove('dash-selected');
        anHideDrill(container);
        return;
      }
      anPeriodSelected = id;
      container.querySelectorAll('.exec-clickable-row').forEach(x => x.classList.remove('dash-selected'));
      row.classList.add('dash-selected');
      anShowDrill(container, r.period, r.createdContacts, (c) => inRange(c.createdAt, { start: r.start, end: r.end }), r.period);
    });
  });
  const selectedRow = rows.find(r => r.id === anPeriodSelected);
  if (selectedRow) {
    anShowDrill(container, selectedRow.period, selectedRow.createdContacts, (c) => inRange(c.createdAt, { start: selectedRow.start, end: selectedRow.end }), selectedRow.period);
  }
}

/* ---- Activity (only real, tracked signals) ---- */
function renderActivitySummary(container, bounds) {
  const inR = anContactsInRange(bounds);
  const followUps = tasks.filter(t => inRange(t.createdAt, bounds)).length;
  const meetings = inR.filter(c => FUNNEL_ORDER.indexOf(c.stage) >= FUNNEL_ORDER.indexOf('held')).length;
  const proposals = inR.filter(c => FUNNEL_ORDER.indexOf(c.stage) >= FUNNEL_ORDER.indexOf('proposal')).length;
  const clients = inR.filter(c => c.stage === 'client').length;
  container.innerHTML = `
    <div class="exec-activity-grid">
      <div class="exec-activity-item"><div class="oi-label">Follow-Ups</div><div class="oi-value">${followUps}</div></div>
      <div class="exec-activity-item"><div class="oi-label">Meetings</div><div class="oi-value">${meetings}</div></div>
      <div class="exec-activity-item"><div class="oi-label">Proposals</div><div class="oi-value">${proposals}</div></div>
      <div class="exec-activity-item"><div class="oi-label">Clients</div><div class="oi-value">${clients}</div></div>
    </div>
    <p class="muted-sub" style="margin-top:14px;">Calls and emails aren't tracked in this CRM yet — connect a phone/email automation to start measuring them here.</p>
    ${meetings > 0 ? `<div class="exec-flow">${inR.length} leads → ${meetings} meetings → ${clients} clients</div>` : ''}
  `;
}

/* ---- Tab renderers ---- */
function renderOverviewTab(bounds) {
  renderLeadTrend($('#anTrendChart'), anTrendDays);
  renderConversionTable($('#anConversionTable'));
  renderAgingChart($('#anAgingChart'));
  renderValueSummary($('#anValueSummary'));
  renderAttentionTable($('#anAttentionTable'));
  renderPeriodTable($('#anPeriodTable'), bounds);
}
function renderLeadsTab(bounds) {
  renderLeadTrend($('#anLeadsTrendChart'), anTrendDays);
  renderAgingChart($('#anLeadsAgingChart'));
  renderSourceTable($('#anSourceTable'));
}
function renderPipelineTab() {
  renderConversionTable($('#anPipelineConversionTable2'));
  renderValueSummary($('#anPipelineValueSummary2'));
}
function renderRevenueTab() {
  const won = contacts.filter(c => c.stage === 'client').reduce((s, c) => s + (Number(c.value) || 0), 0);
  const open = contacts.filter(isActive).reduce((s, c) => s + (Number(c.value) || 0), 0);
  const dealCount = contacts.filter(c => Number(c.value) > 0).length;
  const avgDeal = dealCount ? (open + won) / dealCount : 0;
  const revenueSeries = buildDailySeries(anTrendDays, 'value');
  $('#anRevenueSummary').innerHTML = `
    <div class="exec-two-col">
      <div class="exec-block">
        <h3>Revenue Trend</h3>
        <p class="muted-sub">Cumulative pipeline value over time.</p>
        <div class="line-chart-wrap" id="anRevenueChart"></div>
      </div>
      <div class="exec-block">
        <h3>Summary</h3>
        <div class="exec-value-grid" style="margin-top:8px;">
          <div><div class="oi-label">Won Revenue</div><div class="oi-value" style="color:var(--success);">${fmtMoney(won)}</div></div>
          <div><div class="oi-label">Open Pipeline</div><div class="oi-value" style="color:var(--primary);">${fmtMoney(open)}</div></div>
          <div><div class="oi-label">Average Deal</div><div class="oi-value">${fmtMoney(avgDeal)}</div></div>
        </div>
      </div>
    </div>
  `;
  renderLineChart($('#anRevenueChart'), revenueSeries, 'value');
}
function renderActivityTab(bounds) {
  renderActivitySummary($('#anActivitySection'), bounds);
}

/* ---- Init: tabs, date range ---- */
function initAnalyticsControls() {
  $('#anTabs').querySelectorAll('.exec-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $('#anTabs').querySelectorAll('.exec-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      anTab = tab.dataset.tab;
      document.querySelectorAll('.an-tab-panel').forEach(p => p.classList.add('hidden'));
      const idMap = { overview: 'anPanelOverview', leads: 'anPanelLeads', pipeline: 'anPanelPipeline', revenue: 'anPanelRevenue', activity: 'anPanelActivity' };
      document.getElementById(idMap[anTab]).classList.remove('hidden');
      renderAnalytics();
    });
  });
  $('#anDateRange').addEventListener('change', (e) => {
    anDateRangeDays = e.target.value === 'custom' || e.target.value === 'year' ? e.target.value : Number(e.target.value);
    $('#anCustomRange').classList.toggle('hidden', e.target.value !== 'custom');
    if (e.target.value !== 'custom') renderAnalytics();
  });
  $('#anCustomApply').addEventListener('click', () => {
    anCustomFrom = $('#anCustomFrom').value; anCustomTo = $('#anCustomTo').value;
    if (anCustomFrom && anCustomTo) { anDateRangeDays = 'custom'; renderAnalytics(); }
  });
  initTrendRangeToggle();
}

/* ================= CONTACT CRUD ================= */
async function updateContact(id, updates) {
  const res = await fetch(`/api/contacts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates) });
  const updated = await res.json();
  const idx = contacts.findIndex(c => c.id === id);
  if (idx !== -1) contacts[idx] = updated;
  if ($('#modalOverlay') && !$('#modalOverlay').classList.contains('hidden') && $('#contactId').dataset.profileId === id) openModal(updated);
  render();
}
async function createContact(payload) {
  const res = await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const created = await res.json();
  contacts.unshift(created);
  render();
}
async function deleteContact(id) {
  await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
  contacts = contacts.filter(c => c.id !== id);
  render();
}

/* ================= CLIENT PROFILE (central hub) ================= */
const ACTIVITY_ICONS = { appointment: '📅', message: '💬', document: '📄', invoice: '💰', task: '✓', followup: '♡', note: '📝', pipeline: '🔄', lead: '✨' };
function buildClientActivity(c) {
  const events = [];
  events.push({ date: c.createdAt, icon: 'lead', text: 'Lead created' });
  if (c.bookingDate) events.push({ date: c.createdAt, icon: 'appointment', text: `Appointment booked for ${c.bookingDate}${c.bookingTime ? ' at ' + c.bookingTime : ''}` });
  if (c.lastActivity && c.lastActivity !== c.createdAt) events.push({ date: c.lastActivity, icon: 'pipeline', text: `Moved to "${stageOf(c).label}"` });
  if (c.notes) events.push({ date: c.lastActivity || c.createdAt, icon: 'note', text: c.notes });
  tasks.filter(t => t.contactId === c.id).forEach(t => {
    events.push({ date: t.createdAt, icon: 'task', text: `Task created: ${t.title}` });
    if (t.completedAt) events.push({ date: t.completedAt, icon: 'task', text: `Task completed: ${t.title}` });
  });
  invoices.filter(i => i.contactId === c.id).forEach(i => events.push({ date: i.createdAt, icon: 'invoice', text: `Invoice ${i.invoiceNumber} created (${fmtMoney(i.amount)})` }));
  documents.filter(d => d.contactId === c.id).forEach(d => events.push({ date: d.uploadedAt, icon: 'document', text: `${d.type} uploaded: ${d.name}` }));
  return events.filter(e => e.date).sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 12);
}

function renderClientProfile(c) {
  const view = $('#profileView');
  const stage = stageOf(c);
  const activity = buildClientActivity(c);
  const clientProjects = projects.filter(p => p.contactId === c.id);
  const clientInvoices = invoices.filter(i => i.contactId === c.id);
  const clientDocs = documents.filter(d => d.contactId === c.id);
  const outstanding = clientInvoices.filter(i => invoiceEffectiveStatus(i) !== 'Paid').reduce((s, i) => s + Number(i.amount || 0), 0);

  view.innerHTML = `
    <div class="profile-header">
      <div class="avatar lg">${initials(c.name)}</div>
      <div>
        <div class="profile-name">${escapeHtml(c.name)}</div>
        <div class="profile-sub">${escapeHtml(c.company || c.service || 'Contact')} · <span class="status-badge" style="background:${stage.color}1a;color:${stage.color}">${stage.label}</span>${c.leadSource ? ` · ${sourceBadgeHtml(c)}` : ''}</div>
      </div>
      <div class="profile-value">${c.value ? fmtMoney(c.value) : '—'}<div style="font-size:11px;color:var(--text-muted);font-weight:600;">Pipeline Value</div></div>
    </div>

    <div class="profile-quick-actions">
      ${c.phone ? `<a class="btn btn-secondary btn-sm" href="tel:${escapeHtml(c.phone)}">Call</a>` : ''}
      ${c.email ? `<a class="btn btn-secondary btn-sm" href="mailto:${escapeHtml(c.email)}">Email</a>` : ''}
      <button class="btn btn-secondary btn-sm" id="paSchedule">Schedule</button>
      <button class="btn btn-secondary btn-sm" id="paAddTask">Add Task</button>
      <button class="btn btn-secondary btn-sm" id="paAddNote">Add Note</button>
      <button class="btn btn-secondary btn-sm" id="paUploadDoc">Upload Document</button>
      <button class="btn btn-secondary btn-sm" id="paCreateInvoice">Create Invoice</button>
      <button class="btn btn-primary btn-sm profile-edit-btn" id="paEditDetails">Edit Details</button>
    </div>

    <div class="profile-section">
      <h3>Client Overview</h3>
      <div class="profile-overview-grid">
        <div class="profile-overview-item"><div class="oi-label">Status</div><div class="oi-value">${stage.label}</div></div>
        <div class="profile-overview-item"><div class="oi-label">Next Follow-Up</div><div class="oi-value">${c.nextFollowUp ? fmtDateShort(c.nextFollowUp) : '—'}</div></div>
        <div class="profile-overview-item"><div class="oi-label">Client Health</div><div class="oi-value">${healthBadgeHtml(c)}</div></div>
        <div class="profile-overview-item"><div class="oi-label">Billing Type</div><div class="oi-value">${c.billingType && c.billingType !== 'Not Set' ? escapeHtml(c.billingType) : '—'}</div></div>
        <div class="profile-overview-item"><div class="oi-label">Rate</div><div class="oi-value">${c.billingType === 'Hourly' && c.hourlyRate ? `$${Number(c.hourlyRate)}/hr` : '—'}</div></div>
        ${c.leadSource ? `<div class="profile-overview-item"><div class="oi-label">Opportunity / Job</div><div class="oi-value">${escapeHtml(c.opportunity || '—')}</div></div>
        <div class="profile-overview-item"><div class="oi-label">Source Status</div><div class="oi-value">${escapeHtml(c.sourceStatus || 'New')}</div></div>
        <div class="profile-overview-item"><div class="oi-label">Date Received</div><div class="oi-value">${c.dateReceived ? fmtDateShort(c.dateReceived) : '—'}</div></div>` : ''}
      </div>
      ${c.sourceUrl ? `<p class="profile-empty" style="margin-top:10px;"><a href="${escapeHtml(c.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(c.sourceUrl)}</a></p>` : ''}
    </div>

    <div class="profile-section">
      <h3>Activity</h3>
      <div class="timeline">
        ${activity.length ? activity.map(e => `
          <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div><div class="timeline-date">${new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div><div class="timeline-text">${ACTIVITY_ICONS[e.icon] || '•'} ${escapeHtml(e.text)}</div></div>
          </div>
        `).join('') : '<p class="profile-empty">No activity yet.</p>'}
      </div>
    </div>

    <div class="profile-section">
      <h3>Projects</h3>
      ${clientProjects.length ? clientProjects.map(p => {
        const pTasks = tasks.filter(t => t.projectId === p.id);
        const done = pTasks.filter(t => t.status === 'done').length;
        return `<div class="profile-list-row"><span class="plr-main">${escapeHtml(p.name)}</span><span class="plr-sub">${p.status} · ${done}/${pTasks.length} tasks</span></div>`;
      }).join('') : '<p class="profile-empty">No projects yet.</p>'}
    </div>

    <div class="profile-section">
      <h3>Billing</h3>
      ${clientInvoices.length ? `
        <div class="profile-list-row"><span class="plr-main">Outstanding</span><span class="plr-sub" style="font-weight:800;color:var(--primary);">${fmtMoney(outstanding)}</span></div>
        ${clientInvoices.map(i => `<div class="profile-list-row"><span class="plr-main">${escapeHtml(i.invoiceNumber)}</span><span class="plr-sub">${fmtMoney(i.amount)} · ${invoiceEffectiveStatus(i)}</span></div>`).join('')}
      ` : '<p class="profile-empty">No invoices yet.</p>'}
    </div>

    <div class="profile-section">
      <h3>Documents</h3>
      ${clientDocs.length ? clientDocs.map(d => `<div class="profile-list-row"><span class="plr-main">${escapeHtml(d.name)}</span><a class="plr-sub" href="/uploads/${d.filename}" target="_blank">${d.type} · Download</a></div>`).join('') : '<p class="profile-empty">Client documents will appear here.</p>'}
    </div>

    <div class="profile-section">
      <h3>Notes</h3>
      <p class="profile-empty" style="color:var(--text);">${c.notes ? escapeHtml(c.notes) : 'No notes yet.'}</p>
    </div>
  `;

  $('#paSchedule').addEventListener('click', () => {
    const date = prompt('Next follow-up date (YYYY-MM-DD):', c.nextFollowUp || todayStr());
    if (date) updateContact(c.id, { nextFollowUp: date }).then(() => showToast('Follow-up scheduled'));
  });
  $('#paAddTask').addEventListener('click', () => {
    const title = prompt('Task title:');
    if (!title) return;
    const due = prompt('Due date (YYYY-MM-DD), optional:', '');
    createTask(title, due, c.id, 'Medium').then(() => showToast('Task created'));
  });
  $('#paAddNote').addEventListener('click', () => {
    const note = prompt('Add a note:');
    if (!note) return;
    updateContact(c.id, { notes: c.notes ? `${c.notes}\n${note}` : note }).then(() => showToast('Note added'));
  });
  $('#paUploadDoc').addEventListener('click', () => quickUploadDocumentFlow(c.id));
  $('#paCreateInvoice').addEventListener('click', () => quickCreateInvoiceFlow(c.id));
  $('#paEditDetails').addEventListener('click', () => showEditForm(c));
}

/* ================= MODAL ================= */
function populateForm(contact) {
  $('#contactId').value = contact ? contact.id : '';
  $('#fName').value = contact ? contact.name : '';
  $('#fCompany').value = contact ? (contact.company || '') : '';
  $('#fLeadSource').value = contact ? (contact.leadSource || '') : '';
  $('#fSourceUrl').value = contact ? (contact.sourceUrl || '') : '';
  $('#fOpportunity').value = contact ? (contact.opportunity || '') : '';
  $('#fDateReceived').value = contact ? (contact.dateReceived || '') : '';
  $('#fSourceStatus').value = contact ? (contact.sourceStatus || 'New') : 'New';
  $('#fEmail').value = contact ? contact.email : '';
  $('#fPhone').value = contact ? contact.phone : '';
  $('#fService').value = contact ? (contact.service || '') : '';
  $('#fValue').value = contact ? contact.value : '';
  $('#fHourlyRate').value = contact && contact.hourlyRate != null ? contact.hourlyRate : '';
  $('#fBillingType').value = contact ? (contact.billingType || 'Not Set') : 'Not Set';
  $('#fDate').value = contact ? contact.bookingDate : '';
  $('#fTime').value = contact ? contact.bookingTime : '';
  $('#fNextFollowUp').value = contact ? (contact.nextFollowUp || '') : '';
  $('#fHealth').value = contact ? (contact.healthOverride || '') : '';
  $('#fLink').value = contact ? contact.meetingLink : '';
  $('#fNotes').value = contact ? contact.notes : '';
  $('#fStage').value = contact ? contact.stage : 'new';
  $('#deleteBtn').classList.toggle('hidden', !contact);
}
function showEditForm(contact) {
  $('#modalTitle').textContent = contact ? 'Edit Contact' : 'Add Contact';
  populateForm(contact);
  $('#profileView').classList.add('hidden');
  $('#contactForm').classList.remove('hidden');
}
function openModal(contact) {
  $('#contactId').dataset.profileId = contact ? contact.id : '';
  if (contact) {
    $('#modalTitle').textContent = 'Client Profile';
    $('#contactForm').classList.add('hidden');
    $('#profileView').classList.remove('hidden');
    renderClientProfile(contact);
  } else {
    showEditForm(null);
  }
  $('#modalOverlay').classList.remove('hidden');
}
function closeModal() { $('#modalOverlay').classList.add('hidden'); }
function initModal() {
  $('#addContactBtn').addEventListener('click', () => { if (currentView === 'jobhunt') openJobModal(null); else openModal(null); });
  $('#modalClose').addEventListener('click', closeModal);
  $('#cancelBtn').addEventListener('click', closeModal);
  $('#modalOverlay').addEventListener('click', (e) => { if (e.target === $('#modalOverlay')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); closeKai(); } });

  $('#contactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = $('#contactId').value;
    const payload = {
      name: $('#fName').value,
      company: $('#fCompany').value,
      leadSource: $('#fLeadSource').value,
      sourceUrl: $('#fSourceUrl').value,
      opportunity: $('#fOpportunity').value,
      dateReceived: $('#fDateReceived').value,
      sourceStatus: $('#fSourceStatus').value,
      email: $('#fEmail').value,
      phone: $('#fPhone').value,
      service: $('#fService').value,
      bookingDate: $('#fDate').value,
      bookingTime: $('#fTime').value,
      meetingLink: $('#fLink').value,
      value: $('#fValue').value,
      hourlyRate: $('#fHourlyRate').value,
      billingType: $('#fBillingType').value,
      notes: $('#fNotes').value,
      stage: $('#fStage').value,
      nextFollowUp: $('#fNextFollowUp').value,
      healthOverride: $('#fHealth').value,
    };
    if (id) { await updateContact(id, payload); showToast('Contact updated'); }
    else { await createContact(payload); showToast('Contact added'); }
    closeModal();
  });
  $('#deleteBtn').addEventListener('click', async () => {
    const id = $('#contactId').value;
    if (id) await deleteContact(id);
    closeModal();
  });
}

/* ================= NAVIGATION ================= */
const VIEW_META = {
  dashboard: ['Dashboard', "Here's what's happening with your pipeline today."],
  pipeline: ['Pipeline', 'Manage your leads and move opportunities forward.'],
  contacts: ['Contacts', 'Manage leads, clients and professional relationships.'],
  appointments: ['Appointments', 'Everything booked on your calendar.'],
  calendar: ['Calendar', 'Appointments, tasks, and invoice due dates at a glance.'],
  tasks: ['Tasks', 'Everything that needs doing, client work included.'],
  followups: ['Follow-Ups', 'Stay on top of every lead that needs a nudge.'],
  jobfinder: ['Job Finder', 'Find relevant job opportunities based on your profile and keywords.'],
  jobhunt: ['Job Opportunities', 'Find the right opportunities and prepare stronger applications.'],
  billing: ['Billing', 'Track invoices and outstanding balances.'],
  documents: ['Documents', 'Centralize client contracts, proposals, and files.'],
  projects: ['Projects', 'Lightweight project tracking, connected to your clients.'],
  automations: ['Automations', 'How bookings flow into this CRM.'],
  analytics: ['Analytics', 'Understand how your leads, pipeline, and client activity are performing.'],
  settings: ['API / Settings', 'Connect your booking automation to this CRM.'],
};
const VIEW_SECTION_IDS = {
  dashboard: 'dashboardView', pipeline: 'pipelineView', contacts: 'contactsView', appointments: 'appointmentsView', calendar: 'calendarView',
  tasks: 'tasksView', followups: 'followupsView', jobfinder: 'jobFinderView', jobhunt: 'jobHuntView', billing: 'billingView', documents: 'documentsView',
  projects: 'projectsView', automations: 'automationsView', analytics: 'analyticsView', settings: 'settingsView',
};

function goToView(view) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const meta = VIEW_META[view];
  $('#viewTitle').textContent = meta[0];
  $('#viewSubtitle').textContent = contactsFilter && view === 'contacts' ? `Filtered: ${contactsFilter.label}` : meta[1];
  const section = document.getElementById(VIEW_SECTION_IDS[view]);
  section.classList.remove('hidden');
  section.classList.remove('view-enter');
  void section.offsetWidth;
  section.classList.add('view-enter');
  closeSidebar();
  updateTopbarForView(view);
  render();
  if (typeof kaiOnNavigate === 'function') kaiOnNavigate();
}
function updateTopbarForView(view) {
  const search = $('#searchInput');
  const addBtn = $('#addContactBtn');
  if (view === 'jobhunt') {
    search.placeholder = 'Search jobs by title, company, skills, or paste a job URL...';
    search.setAttribute('aria-label', 'Search jobs');
    addBtn.textContent = '+ Add Job';
    addBtn.classList.remove('hidden');
  } else if (view === 'jobfinder') {
    search.placeholder = 'Search discovered job results...';
    search.setAttribute('aria-label', 'Search job finder results');
    addBtn.classList.add('hidden');
  } else {
    search.placeholder = 'Search contacts...';
    search.setAttribute('aria-label', 'Search contacts');
    addBtn.textContent = '+ Add Contact';
    addBtn.classList.remove('hidden');
  }
}
function initPipelineSourceFilter() {
  $('#pipelineSourceFilter').addEventListener('change', (e) => {
    pipelineSourceFilter = e.target.value;
    renderBoard();
  });
}
function initNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.view !== 'contacts') contactsFilter = null;
      goToView(btn.dataset.view);
    });
  });
}
function initSearch() {
  $('#searchInput').addEventListener('input', (e) => {
    if (currentView === 'jobhunt') { jhSearchTerm = e.target.value; jhPage = 1; render(); return; }
    if (currentView === 'jobfinder') { jfSearchTerm = e.target.value; render(); return; }
    searchTerm = e.target.value; render();
  });
}
function initWebhookUrl() {
  const url = `POST ${window.location.origin}/api/webhook/booking`;
  $('#webhookUrl').textContent = url;
  const w2 = $('#webhookUrl2'); if (w2) w2.textContent = url;
  const ls = $('#lastSynced'); if (ls) ls.textContent = new Date().toLocaleTimeString();
}
function initGreeting() {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  $('#greetingText').textContent = `Good ${part}, Karen 👋`;
}

/* ================= Mobile sidebar ================= */
function openSidebar() { $('#sidebar').classList.add('open'); $('#sidebarOverlay').classList.add('open'); }
function closeSidebar() { $('#sidebar').classList.remove('open'); $('#sidebarOverlay').classList.remove('open'); }
function initMobileNav() { $('#menuBtn').addEventListener('click', openSidebar); $('#sidebarOverlay').addEventListener('click', closeSidebar); }

/* ================= Kai — CRM Copilot ==================
   Real, deterministic answers computed from the in-memory CRM data
   (contacts/tasks/invoices/projects). No external AI call — every
   response is built from the same arrays the rest of the app renders
   from, so nothing here can be out of sync with or invent data. */
let kaiConversationStarted = false;
let kaiProcessing = false;
let kaiPendingBulk = null;
let kaiLastResultItems = null;
let kaiLastItemKind = null;
let kaiLastContactId = null;
let kaiLastJobId = null;

function openKai() {
  $('#kaiPanel').classList.remove('hidden');
  // Always refresh the context chip on open, even when resuming an existing
  // conversation — otherwise it can keep showing whatever page was active
  // when the chat started (e.g. "Dashboard" after navigating to Job Hunt).
  if (!kaiConversationStarted) kaiRenderWelcome();
  else kaiRenderContextChip();
  $('#kaiInput').focus();
}
function closeKai() { $('#kaiPanel').classList.add('hidden'); }
function toggleKai() { $('#kaiPanel').classList.contains('hidden') ? openKai() : closeKai(); }
function kaiNewChat() {
  kaiConversationStarted = false;
  kaiPendingBulk = null;
  kaiLastResultItems = null;
  kaiLastItemKind = null;
  kaiLastContactId = null;
  kaiLastJobId = null;
  kaiRenderWelcome();
}

/* ---- Page context: label, one real stat, contextual quick-action chips ---- */
function kaiPageContext() {
  const map = {
    dashboard: { label: 'Dashboard', stat: () => `${contacts.length} Lead${contacts.length === 1 ? '' : 's'}`,
      chips: [
        { icon: '⚡', label: 'Needs attention', handler: 'needsAttention' },
        { icon: '$', label: 'Pipeline value', handler: 'pipelineValue' },
        { icon: '↻', label: 'Who needs follow-up', handler: 'overdueFollowups' },
        { icon: '✓', label: 'What to prioritize', handler: 'prioritize' },
      ] },
    pipeline: { label: 'Pipeline', stat: () => `${contacts.filter(isActive).length} Opportunit${contacts.filter(isActive).length === 1 ? 'y' : 'ies'}`,
      chips: [
        { icon: '↻', label: 'Overdue leads', handler: 'overdueFollowups' },
        { icon: '⏱', label: 'Stuck leads', handler: 'stuckLeads' },
        { icon: '📊', label: 'Stage breakdown', handler: 'stageCounts' },
        { icon: '✚', label: 'Create overdue follow-ups', handler: 'bulkFollowups' },
      ] },
    contacts: { label: 'Contacts', stat: () => `${contacts.length} Contact${contacts.length === 1 ? '' : 's'}`,
      chips: [
        { icon: '🆕', label: 'Added recently', handler: 'recentContacts' },
        { icon: '📍', label: 'By lead source', handler: 'bySource' },
        { icon: '↻', label: 'Needs follow-up', handler: 'overdueFollowups' },
      ] },
    appointments: { label: 'Appointments', stat: () => `${contacts.filter(c => c.bookingDate && daysUntil(c.bookingDate) >= 0).length} Upcoming`,
      chips: [
        { icon: '◷', label: "Today's appointments", handler: 'todayAppointments' },
        { icon: '📅', label: 'Coming up this week', handler: 'weekAppointments' },
        { icon: '↻', label: 'Need follow-up', handler: 'overdueFollowups' },
      ] },
    calendar: { label: 'Calendar', stat: () => 'Today',
      chips: [
        { icon: '📅', label: "What's happening today", handler: 'todayEverything' },
        { icon: '↻', label: 'Overdue tasks', handler: 'overdueTasks' },
        { icon: '$', label: 'Invoices due', handler: 'overdueInvoices' },
      ] },
    tasks: { label: 'Tasks', stat: () => `${tasks.filter(t => t.status !== 'done').length} Open Task${tasks.filter(t => t.status !== 'done').length === 1 ? '' : 's'}`,
      chips: [
        { icon: '✓', label: 'What to work on first', handler: 'prioritize' },
        { icon: '⚠', label: 'Overdue', handler: 'overdueTasks' },
        { icon: '◷', label: 'Due today', handler: 'dueTodayTasks' },
        { icon: '🔴', label: 'High priority', handler: 'highPriorityTasks' },
      ] },
    followups: { label: 'Follow-Ups', stat: () => `${contacts.filter(isActive).length} Active Follow-Up${contacts.filter(isActive).length === 1 ? '' : 's'}`,
      chips: [
        { icon: '◷', label: 'Contact today', handler: 'dueTodayFollowups' },
        { icon: '⚠', label: 'Overdue', handler: 'overdueFollowups' },
        { icon: '💬', label: 'Waiting for reply', handler: 'waitingForReply' },
        { icon: '✚', label: 'Create overdue follow-ups', handler: 'bulkFollowups' },
      ] },
    billing: { label: 'Billing', stat: () => `${invoices.filter(i => invoiceEffectiveStatus(i) !== 'Paid').length} Outstanding Invoice${invoices.filter(i => invoiceEffectiveStatus(i) !== 'Paid').length === 1 ? '' : 's'}`,
      chips: [
        { icon: '⚠', label: 'Overdue invoices', handler: 'overdueInvoices' },
        { icon: '$', label: 'Outstanding', handler: 'outstandingInvoices' },
      ] },
    analytics: { label: 'Analytics', stat: () => 'Last 30 Days',
      chips: [
        { icon: '📊', label: 'Best lead source', handler: 'bestSource' },
        { icon: '📉', label: 'Where leads get stuck', handler: 'stuckLeads' },
        { icon: '%', label: 'Conversion rate', handler: 'conversionRate' },
        { icon: '📶', label: 'Stage breakdown', handler: 'stageCounts' },
      ] },
    jobhunt: { label: 'Job Opportunities', stat: () => kaiSelectedJobLabel() || `${jobs.length} Opportunit${jobs.length === 1 ? 'y' : 'ies'}`,
      chips: [
        { icon: '🎯', label: 'Strongest matches', handler: 'jobsStrongestMatch' },
        { icon: '📌', label: 'Prioritize', handler: 'jobsPrioritize' },
        { icon: '🧩', label: 'Skill gaps', handler: 'jobSkillGaps' },
        { icon: '⚡', label: 'Needs attention', handler: 'jobsNeedAttention' },
      ] },
    jobfinder: { label: 'Job Finder', stat: () => jfHasSearched ? `${jfResults.length} Result${jfResults.length === 1 ? '' : 's'}` : `${jfKeywords.length} Keyword${jfKeywords.length === 1 ? '' : 's'}`,
      chips: [
        { icon: '🎯', label: 'Strongest matches', handler: 'jfStrongestMatches' },
        { icon: '🆕', label: 'Not saved yet', handler: 'jfNotSaved' },
        { icon: '🔑', label: 'Best keyword', handler: 'jfBestKeyword' },
        { icon: '⭐', label: 'Review first', handler: 'jfReviewFirst' },
      ] },
  };
  return map[currentView] || {
    label: VIEW_META[currentView] ? VIEW_META[currentView][0] : 'this page', stat: null,
    chips: [{ icon: '⚡', label: 'Needs attention', handler: 'needsAttention' }],
  };
}

/* ---- Real-data query handlers. Each returns {text, items, itemKind, actions} ---- */
const KAI_HANDLERS = {
  needsAttention() {
    const overdueF = contacts.filter(c => followupBucket(c) === 'overdue');
    const highTasks = tasks.filter(t => t.status !== 'done' && t.priority === 'High' && taskBucket(t) !== 'upcoming');
    const todayAppts = contacts.filter(c => c.bookingDate === todayStr());
    const overdueInv = invoices.filter(i => invoiceEffectiveStatus(i) === 'Overdue');
    const lines = [];
    if (overdueF.length) lines.push(`🔴 ${overdueF.length} overdue follow-up${overdueF.length === 1 ? '' : 's'}`);
    if (highTasks.length) lines.push(`🟡 ${highTasks.length} high-priority task${highTasks.length === 1 ? '' : 's'}`);
    if (todayAppts.length) lines.push(`🟣 ${todayAppts.length} appointment${todayAppts.length === 1 ? '' : 's'} today`);
    if (overdueInv.length) lines.push(`🟠 ${overdueInv.length} overdue invoice${overdueInv.length === 1 ? '' : 's'}`);
    if (!lines.length) return { text: "You're all caught up — nothing needs attention right now." };
    return { text: `Today's Attention\n\n${lines.join('\n')}`, items: overdueF.slice(0, 3), itemKind: 'contact' };
  },
  pipelineValue() {
    const open = contacts.filter(isActive).reduce((s, c) => s + (Number(c.value) || 0), 0);
    const won = contacts.filter(c => c.stage === 'client').reduce((s, c) => s + (Number(c.value) || 0), 0);
    return { text: `Open pipeline: ${fmtMoney(open)}\nWon: ${fmtMoney(won)}`, actions: [{ label: 'Open Pipeline', nav: 'pipeline' }] };
  },
  overdueFollowups() {
    const list = contacts.filter(c => followupBucket(c) === 'overdue');
    if (!list.length) return { text: 'No overdue follow-ups. Nice work staying on top of things.' };
    return { text: `${list.length} overdue follow-up${list.length === 1 ? '' : 's'}`, items: list, itemKind: 'followup',
      actions: [{ label: 'View All', nav: 'followups' }, { label: `Create ${list.length} Follow-Ups`, bulk: 'followups' }] };
  },
  prioritize() {
    const overdueT = tasks.filter(t => taskBucket(t) === 'overdue');
    const highToday = tasks.filter(t => taskBucket(t) === 'today' && t.priority === 'High');
    const nextAppt = contacts.filter(c => c.bookingDate === todayStr() && daysUntil(c.bookingDate) >= 0)[0];
    const parts = [];
    if (overdueT.length) parts.push(`${overdueT.length} overdue task${overdueT.length === 1 ? '' : 's'}`);
    if (highToday.length) parts.push(`${highToday.length} high-priority task${highToday.length === 1 ? '' : 's'} due today`);
    if (nextAppt) parts.push('an appointment today');
    if (!parts.length) return { text: "Nothing urgent right now — you're clear." };
    return { text: `Based on your current data, focus on:\n${parts.map((p, i) => `${i + 1}. ${p}`).join('\n')}`,
      items: [...overdueT, ...highToday].slice(0, 5), itemKind: 'task', actions: [{ label: 'Open Tasks', nav: 'tasks' }] };
  },
  overdueTasks() {
    const list = tasks.filter(t => taskBucket(t) === 'overdue');
    if (!list.length) return { text: 'No overdue tasks.' };
    return { text: `${list.length} overdue task${list.length === 1 ? '' : 's'}`, items: list, itemKind: 'task', actions: [{ label: 'Open Tasks', nav: 'tasks' }] };
  },
  dueTodayTasks() {
    const list = tasks.filter(t => taskBucket(t) === 'today');
    if (!list.length) return { text: 'Nothing due today.' };
    return { text: `${list.length} task${list.length === 1 ? '' : 's'} due today`, items: list, itemKind: 'task', actions: [{ label: 'Open Tasks', nav: 'tasks' }] };
  },
  highPriorityTasks() {
    const list = tasks.filter(t => t.status !== 'done' && t.priority === 'High');
    if (!list.length) return { text: 'No open high-priority tasks.' };
    return { text: `${list.length} high-priority task${list.length === 1 ? '' : 's'}`, items: list, itemKind: 'task', actions: [{ label: 'Open Tasks', nav: 'tasks' }] };
  },
  allFollowups() {
    const list = contacts.filter(isActive);
    if (!list.length) return { text: 'No active follow-ups.' };
    const sorted = [...list].sort((a, b) => {
      const order = { overdue: 0, today: 1, upcoming: 2, completed: 3 };
      return order[followupBucket(a)] - order[followupBucket(b)];
    });
    return { text: `${list.length} contact${list.length === 1 ? '' : 's'} need follow-up`, items: sorted, itemKind: 'followup', actions: [{ label: 'Open Follow-Ups', nav: 'followups' }] };
  },
  dueTodayFollowups() {
    const list = contacts.filter(c => followupBucket(c) === 'today');
    if (!list.length) return { text: 'No follow-ups due today.' };
    return { text: `${list.length} follow-up${list.length === 1 ? '' : 's'} due today`, items: list, itemKind: 'followup' };
  },
  waitingForReply() {
    const list = contacts.filter(fuIsWaiting);
    if (!list.length) return { text: "No one's currently waiting for a reply." };
    return { text: `${list.length} contact${list.length === 1 ? '' : 's'} waiting for a reply`, items: list, itemKind: 'followup' };
  },
  todayAppointments() {
    const list = contacts.filter(c => c.bookingDate === todayStr());
    if (!list.length) return { text: 'No appointments today.' };
    return { text: `${list.length} appointment${list.length === 1 ? '' : 's'} today`, items: list, itemKind: 'appointment' };
  },
  weekAppointments() {
    const list = contacts.filter(c => c.bookingDate && daysUntil(c.bookingDate) >= 0 && daysUntil(c.bookingDate) <= 7)
      .sort((a, b) => a.bookingDate.localeCompare(b.bookingDate));
    if (!list.length) return { text: 'Nothing on the calendar in the next 7 days.' };
    return { text: `${list.length} appointment${list.length === 1 ? '' : 's'} in the next 7 days`, items: list, itemKind: 'appointment' };
  },
  todayEverything() {
    const appts = contacts.filter(c => c.bookingDate === todayStr());
    const dueTasks = tasks.filter(t => taskBucket(t) === 'today');
    const dueFu = contacts.filter(c => followupBucket(c) === 'today');
    const parts = [];
    if (appts.length) parts.push(`${appts.length} appointment${appts.length === 1 ? '' : 's'}`);
    if (dueTasks.length) parts.push(`${dueTasks.length} task${dueTasks.length === 1 ? '' : 's'}`);
    if (dueFu.length) parts.push(`${dueFu.length} follow-up${dueFu.length === 1 ? '' : 's'}`);
    if (!parts.length) return { text: 'Nothing scheduled for today.' };
    return { text: `Today: ${parts.join(', ')}.`, items: appts.slice(0, 5), itemKind: 'appointment' };
  },
  overdueInvoices() {
    const list = invoices.filter(i => invoiceEffectiveStatus(i) === 'Overdue');
    if (!list.length) return { text: 'No overdue invoices.' };
    return { text: `${list.length} overdue invoice${list.length === 1 ? '' : 's'}`, items: list, itemKind: 'invoice', actions: [{ label: 'Open Billing', nav: 'billing' }] };
  },
  outstandingInvoices() {
    const list = invoices.filter(i => invoiceEffectiveStatus(i) !== 'Paid');
    if (!list.length) return { text: 'No outstanding invoices — everything is paid.' };
    const total = list.reduce((s, i) => s + Number(i.amount || 0), 0);
    return { text: `${list.length} outstanding invoice${list.length === 1 ? '' : 's'} totaling ${fmtMoney(total)}`, items: list, itemKind: 'invoice', actions: [{ label: 'Open Billing', nav: 'billing' }] };
  },
  recentContacts() {
    const list = contacts.filter(isNewLead).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (!list.length) return { text: 'No contacts added in the last 3 days.' };
    return { text: `${list.length} contact${list.length === 1 ? '' : 's'} added recently`, items: list, itemKind: 'contact' };
  },
  bySource() {
    const withSource = contacts.filter(c => c.leadSource);
    if (!withSource.length) return { text: "No contacts have a lead source recorded yet." };
    const counts = {};
    withSource.forEach(c => { counts[c.leadSource] = (counts[c.leadSource] || 0) + 1; });
    const lines = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name}: ${n}`);
    return { text: `Contacts by lead source:\n${lines.join('\n')}`, actions: [{ label: 'Open Contacts', nav: 'contacts' }] };
  },
  stuckLeads() {
    const active = contacts.filter(isActive);
    const withDays = active.map(c => ({ c, days: Math.floor((Date.now() - new Date(c.lastActivity || c.createdAt).getTime()) / DAY) }));
    const flagged = withDays.filter(x => x.days >= 2).sort((a, b) => b.days - a.days).slice(0, 8);
    if (!flagged.length) return { text: "No leads have been sitting for long — pipeline is moving." };
    return { text: `${flagged.length} lead${flagged.length === 1 ? '' : 's'} that may need attention`, items: flagged.map(x => x.c), itemKind: 'contact', actions: [{ label: 'Open Analytics', nav: 'analytics' }] };
  },
  stageCounts() {
    const active = contacts.filter(c => c.stage !== 'lost');
    const lines = FUNNEL_ORDER.map((key, i) => {
      const stage = STAGES.find(s => s.key === key);
      const count = active.filter(c => FUNNEL_ORDER.indexOf(c.stage) >= i).length;
      return `${stage.label}: ${count}`;
    });
    return { text: `Pipeline by stage:\n${lines.join('\n')}`, actions: [{ label: 'Open Pipeline', nav: 'pipeline' }] };
  },
  bestSource() {
    const withSource = contacts.filter(c => c.leadSource);
    if (!withSource.length) return { text: "I don't have enough lead source data for that yet." };
    const counts = {};
    withSource.forEach(c => { counts[c.leadSource] = (counts[c.leadSource] || 0) + 1; });
    const [name, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return { text: `${name} currently has the most leads (${n}).`, actions: [{ label: `View ${name} Leads`, nav: 'contacts' }] };
  },
  conversionRate() {
    const active = contacts.filter(c => c.stage !== 'lost');
    if (!active.length) return { text: "I don't have enough CRM data for that yet." };
    const clients = active.filter(c => c.stage === 'client').length;
    const rate = Math.round((clients / active.length) * 100);
    return { text: `Your overall conversion rate is ${rate}% (${clients} of ${active.length} leads).`, actions: [{ label: 'Open Analytics', nav: 'analytics' }] };
  },
  explainConversion() {
    const active = contacts.filter(c => c.stage !== 'lost');
    if (!active.length) return { text: "I don't have enough CRM data for that yet." };
    const counts = FUNNEL_ORDER.map((key, i) => active.filter(c => FUNNEL_ORDER.indexOf(c.stage) >= i).length);
    const clients = counts[counts.length - 1];
    const rate = Math.round((clients / counts[0]) * 100);
    let worstDrop = { from: 0, pct: -1 };
    for (let i = 1; i < counts.length; i++) {
      if (counts[i - 1] === 0) continue;
      const dropPct = Math.round(((counts[i - 1] - counts[i]) / counts[i - 1]) * 100);
      if (dropPct > worstDrop.pct) worstDrop = { from: i - 1, pct: dropPct };
    }
    const stageLine = FUNNEL_ORDER.map((key, i) => `${STAGES.find(s => s.key === key).label}: ${counts[i]}`).join(', ');
    let text = `Your current conversion rate is ${rate}% (${clients} of ${counts[0]} leads). ${stageLine}.`;
    if (worstDrop.pct > 0) {
      const fromLabel = STAGES.find(s => s.key === FUNNEL_ORDER[worstDrop.from]).label;
      const toLabel = STAGES.find(s => s.key === FUNNEL_ORDER[worstDrop.from + 1]).label;
      text += ` The largest drop-off (${worstDrop.pct}%) happens between ${fromLabel} and ${toLabel}.`;
    }
    return { text, actions: [{ label: 'Open Analytics', nav: 'analytics' }] };
  },
  sourcePerformance() {
    const withSource = contacts.filter(c => c.leadSource);
    if (!withSource.length) return { text: "I don't have enough lead source data for that yet." };
    const bySrc = {};
    withSource.forEach(c => {
      bySrc[c.leadSource] = bySrc[c.leadSource] || { leads: 0, converted: 0 };
      bySrc[c.leadSource].leads++;
      if (c.stage === 'client') bySrc[c.leadSource].converted++;
    });
    const rows = Object.entries(bySrc).sort((a, b) => b[1].leads - a[1].leads);
    const lines = rows.map(([name, s]) => `${name}: ${s.leads} lead${s.leads === 1 ? '' : 's'}, ${s.converted} converted`);
    const hasConversions = rows.some(([, s]) => s.converted > 0);
    let text = `Lead Source Performance\n\n${lines.join('\n')}`;
    if (hasConversions) {
      const best = [...rows].sort((a, b) => b[1].converted - a[1].converted)[0];
      text += `\n\n${best[0]} has converted the most leads into clients.`;
    } else {
      text += `\n\nI don't have enough conversion data to determine which source performs best yet.`;
    }
    return { text, actions: [{ label: 'Open Contacts', nav: 'contacts' }] };
  },
  busiestDay() {
    const counts = {};
    contacts.filter(c => c.bookingDate).forEach(c => { counts[c.bookingDate] = (counts[c.bookingDate] || 0) + 1; });
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return { text: "I don't have enough appointment data to determine that yet." };
    const [date, n] = entries[0];
    return { text: `Your busiest day is ${fmtDateShort(date)} with ${n} appointment${n === 1 ? '' : 's'}.`, actions: [{ label: 'Open Calendar', nav: 'calendar' }] };
  },
  weekSummary() {
    const bounds = { start: (() => { const d = new Date(); d.setDate(d.getDate() - 6); d.setHours(0, 0, 0, 0); return d; })(), end: new Date() };
    const newLeads = contacts.filter(c => inRange(c.createdAt, bounds));
    const appts = contacts.filter(c => c.bookingDate && new Date(c.bookingDate).getTime() >= bounds.start.getTime() && new Date(c.bookingDate).getTime() <= bounds.end.getTime());
    const wonClients = contacts.filter(c => c.stage === 'client' && inRange(c.lastActivity, bounds));
    const parts = [];
    if (newLeads.length) parts.push(`${newLeads.length} new lead${newLeads.length === 1 ? '' : 's'}`);
    if (appts.length) parts.push(`${appts.length} appointment${appts.length === 1 ? '' : 's'}`);
    if (wonClients.length) parts.push(`${wonClients.length} new client${wonClients.length === 1 ? '' : 's'}`);
    if (!parts.length) return { text: 'Nothing notable happened in the last 7 days.' };
    return { text: `In the last 7 days: ${parts.join(', ')}.` };
  },
  comparePeriod() {
    const bounds = anRangeBounds();
    const prevBounds = anPrevBounds(bounds);
    const now = anContactsInRange(bounds).length;
    const prev = anContactsInRange(prevBounds).length;
    if (!prev && !now) return { text: "I don't have enough historical data to make that comparison yet." };
    const delta = pctChangeLabel(now, prev);
    return { text: `This period: ${now} new leads. Previous period: ${prev}. ${delta.text}.`, actions: [{ label: 'Open Analytics', nav: 'analytics' }] };
  },
  projectsOverdue() {
    const list = projects.filter(p => p.dueDate && daysUntil(p.dueDate) < 0 && p.status !== 'Completed' && p.status !== 'Cancelled');
    if (!list.length) return { text: 'No overdue projects.' };
    return { text: `${list.length} overdue project${list.length === 1 ? '' : 's'}`, items: list, itemKind: 'project', actions: [{ label: 'Open Projects', nav: 'projects' }] };
  },
  projectsActive() {
    const list = projects.filter(p => p.status === 'In Progress' || p.status === 'Planning');
    if (!list.length) return { text: 'No active projects right now.' };
    return { text: `${list.length} active project${list.length === 1 ? '' : 's'}`, items: list, itemKind: 'project', actions: [{ label: 'Open Projects', nav: 'projects' }] };
  },
  projectsDueWeek() {
    const list = projects.filter(p => p.dueDate && daysUntil(p.dueDate) >= 0 && daysUntil(p.dueDate) <= 7);
    if (!list.length) return { text: 'No project deadlines in the next 7 days.' };
    return { text: `${list.length} project${list.length === 1 ? '' : 's'} due in the next 7 days`, items: list, itemKind: 'project', actions: [{ label: 'Open Projects', nav: 'projects' }] };
  },
  billingWhoOwes() {
    const outstanding = invoices.filter(i => invoiceEffectiveStatus(i) !== 'Paid');
    if (!outstanding.length) return { text: 'No one currently owes you money — all invoices are paid.' };
    const byContact = {};
    outstanding.forEach(i => { byContact[i.contactId] = (byContact[i.contactId] || 0) + Number(i.amount || 0); });
    const total = outstanding.reduce((s, i) => s + Number(i.amount || 0), 0);
    const ranked = Object.entries(byContact).sort((a, b) => b[1] - a[1]);
    const [topId, topAmt] = ranked[0];
    const topContact = contacts.find(c => c.id === topId);
    let text = `${fmtMoney(total)} total outstanding across ${outstanding.length} invoice${outstanding.length === 1 ? '' : 's'}.`;
    if (topContact) text += ` ${topContact.name} owes the most (${fmtMoney(topAmt)}).`;
    return { text, items: outstanding, itemKind: 'invoice', actions: [{ label: 'Open Billing', nav: 'billing' }] };
  },
  totalLeads() {
    if (!contacts.length) return { text: "You don't have any leads in the CRM yet." };
    const active = contacts.filter(isActive).length;
    return { text: `You have ${contacts.length} lead${contacts.length === 1 ? '' : 's'} total (${active} active).`, actions: [{ label: 'Open Contacts', nav: 'contacts' }] };
  },
  documentsList() {
    if (!documents.length) return { text: 'No documents have been uploaded yet.' };
    return { text: `${documents.length} document${documents.length === 1 ? '' : 's'} on file`, items: documents, itemKind: 'document', actions: [{ label: 'Open Documents', nav: 'documents' }] };
  },
  jobStrongMatches() {
    if (!jobs.length) return { text: "You haven't added any job opportunities yet." };
    const strong = jobs.filter(j => j.matchScore !== null && j.matchScore !== undefined && j.matchScore >= 90);
    if (!strong.length) return { text: 'No strong matches (90%+) yet — either none have been analyzed, or none scored that high.', actions: [{ label: 'Open Job Hunt', nav: 'jobhunt' }] };
    return { text: `${strong.length} strong match${strong.length === 1 ? '' : 'es'}: ${strong.map(j => `${j.title} at ${j.company} (${j.matchScore}%)`).join(', ')}.`, actions: [{ label: 'Open Job Hunt', nav: 'jobhunt' }] };
  },
  jobReadyToApply() {
    if (!jobs.length) return { text: "You haven't added any job opportunities yet." };
    const ready = jobs.filter(j => j.status === 'Ready to Apply');
    if (!ready.length) return { text: 'Nothing is marked "Ready to Apply" right now.', actions: [{ label: 'Open Job Hunt', nav: 'jobhunt' }] };
    return { text: `${ready.length} job${ready.length === 1 ? '' : 's'} ready to apply: ${ready.map(j => `${j.title} at ${j.company}`).join(', ')}.`, actions: [{ label: 'Open Job Hunt', nav: 'jobhunt' }] };
  },
  jobApplied() {
    if (!jobs.length) return { text: "You haven't added any job opportunities yet." };
    const applied = jobs.filter(j => ['Applied', 'Follow-Up', 'Interview', 'Hired'].includes(j.status));
    if (!applied.length) return { text: "You haven't applied to any of your saved jobs yet.", actions: [{ label: 'Open Job Hunt', nav: 'jobhunt' }] };
    const interviews = jobs.filter(j => j.status === 'Interview').length;
    const hired = jobs.filter(j => j.status === 'Hired').length;
    let text = `${applied.length} application${applied.length === 1 ? '' : 's'} in progress.`;
    if (interviews) text += ` ${interviews} at interview stage.`;
    if (hired) text += ` ${hired} hired.`;
    return { text, actions: [{ label: 'Open Job Hunt', nav: 'jobhunt' }] };
  },
  jobTotalCount() {
    if (!jobs.length) return { text: "I don't have any Job Hunt opportunities yet.", actions: [{ label: 'Open Job Hunt', nav: 'jobhunt' }] };
    const analyzed = jobs.filter(j => j.matchStatus === 'Analyzed').length;
    return { text: `You have ${jobs.length} job opportunit${jobs.length === 1 ? 'y' : 'ies'} saved${analyzed ? `, ${analyzed} analyzed` : ' — none analyzed yet'}.`, actions: [{ label: 'Open Job Hunt', nav: 'jobhunt' }] };
  },
  jobsSavedList() {
    if (!jobs.length) return { text: "I don't have any Job Hunt opportunities yet." };
    const saved = jobs.filter(j => j.status === 'Saved');
    if (!saved.length) return { text: 'No jobs are currently in Saved status.' };
    return { text: `${saved.length} job${saved.length === 1 ? '' : 's'} still Saved:\n${saved.map(j => `• ${j.title} — ${j.company}`).join('\n')}`, actions: [{ label: 'Open Job Hunt', nav: 'jobhunt' }] };
  },
  jobsStrongestMatch() {
    if (!jobs.length) return { text: "I don't have any Job Hunt opportunities yet." };
    const analyzed = jobs.filter(j => j.matchScore !== null && j.matchScore !== undefined);
    if (!analyzed.length) return { text: "I have your saved jobs, but they haven't been analyzed yet." };
    const top = [...analyzed].sort((a, b) => b.matchScore - a.matchScore)[0];
    let text = `Your strongest current match is:\n\n${jobSummaryLine(top)}`;
    if (top.matchingSkills && top.matchingSkills.length) text += `\n\nWhy:\n${top.matchingSkills.map(s => `• ${s}`).join('\n')}`;
    text += `\n\nIt's currently ${top.status}${top.status === 'Ready to Apply' || top.status === 'Applied' ? '.' : ", and doesn't appear to be marked Ready to Apply yet."}`;
    return { text, jobId: top.id, actions: [{ label: 'Open Job Hunt', nav: 'jobhunt' }] };
  },
  jobSkillGaps() {
    if (!jobs.length) return { text: "I don't have any Job Hunt opportunities yet." };
    const analyzed = jobs.filter(j => j.matchStatus === 'Analyzed');
    if (!analyzed.length) return { text: "I have your saved jobs, but they haven't been analyzed yet." };
    const tally = {};
    analyzed.forEach(j => {
      (j.missingSkills || []).forEach(s => { tally[s] = (tally[s] || 0) + 1; });
      (j.missingRequirements || []).forEach(r => { const s = r.text || r; tally[s] = (tally[s] || 0) + 1; });
    });
    const entries = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return { text: 'No skill gaps found across your analyzed jobs.' };
    return { text: `Common skill gaps across your jobs:\n${entries.map(([s, c]) => `• ${s} (${c} job${c === 1 ? '' : 's'})`).join('\n')}` };
  },
  jobsNeedAttention() {
    if (!jobs.length) return { text: "I don't have any Job Hunt opportunities yet." };
    const stale = jobs.filter(j => isJobMatchStale(j));
    const unanalyzed = jobs.filter(j => j.matchStatus === 'Not analyzed');
    const strongNotPrepared = jobs.filter(j => j.matchScore !== null && j.matchScore !== undefined && j.matchScore >= 75 && !j.applicationPreparedAt && !['Applied', 'Rejected', 'Hired'].includes(j.status));
    const lines = [];
    if (strongNotPrepared.length) lines.push(`${strongNotPrepared.length} strong match${strongNotPrepared.length === 1 ? '' : 'es'} without a prepared application: ${strongNotPrepared.map(j => j.title).join(', ')}.`);
    if (stale.length) lines.push(`${stale.length} job${stale.length === 1 ? '' : 's'} need re-analysis since your Job Profile changed: ${stale.map(j => j.title).join(', ')}.`);
    if (unanalyzed.length) lines.push(`${unanalyzed.length} job${unanalyzed.length === 1 ? '' : 's'} haven't been analyzed yet: ${unanalyzed.map(j => j.title).join(', ')}.`);
    if (!lines.length) return { text: 'Nothing in Job Hunt needs attention right now.' };
    return { text: lines.join('\n'), actions: [{ label: 'Open Job Hunt', nav: 'jobhunt' }] };
  },
  jobsPrioritize() {
    if (!jobs.length) return { text: "I don't have any Job Hunt opportunities yet." };
    const openAnalyzed = jobs.filter(j => j.matchScore !== null && j.matchScore !== undefined && !['Applied', 'Rejected', 'Hired'].includes(j.status));
    if (!openAnalyzed.length) return { text: "I don't have enough analyzed, still-open jobs to recommend a priority yet." };
    const top = [...openAnalyzed].sort((a, b) => b.matchScore - a.matchScore)[0];
    let text = `${top.title} — ${top.company} is currently the highest-priority opportunity based on its ${top.matchScore}% match score and ${top.status} status.`;
    text += !top.applicationPreparedAt ? ' No application has been prepared yet.' : (top.status !== 'Ready to Apply' ? ' Its application has not yet been marked Ready to Apply.' : '');
    return { text, jobId: top.id, actions: [{ label: 'Open Job Hunt', nav: 'jobhunt' }] };
  },
  // ---- Job Finder (Phase 2F) — reads the current in-memory search results
  // only; never invents a search that hasn't actually been run. ----
  jfStrongestMatches() {
    if (!jfHasSearched) return { text: "I haven't run a Job Finder search yet — add keywords and click Find Jobs first." };
    const analyzed = jfResults.filter(r => r.matchScore !== null && r.matchScore !== undefined);
    if (!analyzed.length) return { text: 'No Job Finder results have a match score yet.' };
    const sorted = [...analyzed].sort((a, b) => b.matchScore - a.matchScore).slice(0, 5);
    return { text: `Strongest Job Finder matches:\n${sorted.map(r => `• ${r.title} — ${r.matchScore}% ${jobMatchLabel(r.matchScore)}`).join('\n')}` };
  },
  jfNotSaved() {
    if (!jfHasSearched) return { text: "I haven't run a Job Finder search yet — add keywords and click Find Jobs first." };
    const list = jfResults.filter(r => !r.alreadySaved);
    if (!list.length) return { text: 'Every discovered job has already been saved to Job Opportunities.' };
    return { text: `${list.length} job${list.length === 1 ? '' : 's'} not saved yet:\n${list.slice(0, 8).map(r => `• ${r.title}`).join('\n')}` };
  },
  jfBestKeyword() {
    const entries = Object.entries(jfPerKeywordCounts);
    if (!entries.length) return { text: "I haven't run a Job Finder search yet — add keywords and click Find Jobs first." };
    const [topKeyword, topCount] = [...entries].sort((a, b) => b[1] - a[1])[0];
    return { text: `"${topKeyword}" produced the most results: ${topCount}.` };
  },
  jfReviewFirst() {
    if (!jfHasSearched) return { text: "I haven't run a Job Finder search yet — add keywords and click Find Jobs first." };
    const notSaved = jfResults.filter(r => !r.alreadySaved && r.matchScore !== null && r.matchScore !== undefined);
    if (!notSaved.length) return { text: "Everything with a real match score has already been saved — nothing new to review." };
    const top = [...notSaved].sort((a, b) => b.matchScore - a.matchScore)[0];
    return { text: `Review this one first:\n\n${top.title}\n${top.matchScore}% ${jobMatchLabel(top.matchScore)}${top.matchConfidence ? ` (confidence: ${top.matchConfidence})` : ''}` };
  },
};

/* ---- Contact-scoped handlers (need a resolved contact) ---- */
const KAI_CONTACT_HANDLERS = {
  documentsForContact(c) {
    const list = documents.filter(d => d.contactId === c.id);
    if (!list.length) return { text: `I couldn't find any documents for ${c.name}.` };
    return { text: `${c.name} has ${list.length} document${list.length === 1 ? '' : 's'}. I can see ${list.length === 1 ? 'it' : 'them'}, but I can't read the contents yet.`, items: list, itemKind: 'document' };
  },
  tasksForContact(c) {
    const list = tasks.filter(t => t.contactId === c.id);
    if (!list.length) return { text: `No tasks are linked to ${c.name}.` };
    return { text: `${list.length} task${list.length === 1 ? '' : 's'} for ${c.name}`, items: list, itemKind: 'task' };
  },
  billingForContact(c) {
    const list = invoices.filter(i => i.contactId === c.id);
    if (!list.length) return { text: `No invoices on file for ${c.name}.` };
    const outstanding = list.filter(i => invoiceEffectiveStatus(i) !== 'Paid');
    const total = outstanding.reduce((s, i) => s + Number(i.amount || 0), 0);
    return { text: `${c.name}: ${outstanding.length ? fmtMoney(total) + ' outstanding' : 'no outstanding balance'} across ${list.length} invoice${list.length === 1 ? '' : 's'}.`, items: list, itemKind: 'invoice' };
  },
  appointmentsForContact(c) {
    if (!c.bookingDate) return { text: `No appointment on file for ${c.name}.` };
    const upcoming = daysUntil(c.bookingDate) >= 0;
    return { text: `${c.name}: ${upcoming ? 'upcoming' : 'past'} appointment on ${fmtDateShort(c.bookingDate)}${c.bookingTime ? ' at ' + c.bookingTime : ''}.`, items: [c], itemKind: 'appointment' };
  },
  projectsForContact(c) {
    const list = projects.filter(p => p.contactId === c.id);
    if (!list.length) return { text: `No projects are linked to ${c.name}.` };
    return { text: `${list.length} project${list.length === 1 ? '' : 's'} for ${c.name}`, items: list, itemKind: 'project' };
  },
  clientOverview(c) {
    const stage = stageOf(c);
    const lines = [`Pipeline: ${stage.label}${c.value ? ' · ' + fmtMoney(c.value) : ''}`];
    if (c.opportunity || c.service) lines.push(`Opportunity: ${c.opportunity || c.service}`);
    const fb = followupBucket(c);
    lines.push(`Follow-up: ${fb === 'overdue' ? 'Overdue' : fb === 'today' ? 'Due today' : c.nextFollowUp ? fmtDateShort(c.nextFollowUp) : 'None scheduled'}`);
    if (c.bookingDate) lines.push(`Appointment: ${fmtDateShort(c.bookingDate)}${daysUntil(c.bookingDate) < 0 ? ' (past)' : ''}`);
    const openTasks = tasks.filter(t => t.contactId === c.id && t.status !== 'done');
    if (openTasks.length) lines.push(`Tasks: ${openTasks.length} open`);
    const inv = invoices.filter(i => i.contactId === c.id);
    if (inv.length) {
      const outstanding = inv.filter(i => invoiceEffectiveStatus(i) !== 'Paid').reduce((s, i) => s + Number(i.amount || 0), 0);
      lines.push(`Billing: ${outstanding ? fmtMoney(outstanding) + ' outstanding' : 'No outstanding invoice'}`);
    }
    const docs = documents.filter(d => d.contactId === c.id);
    if (docs.length) lines.push(`Documents: ${docs.length} on file`);
    return { text: `${c.name}\n\n${lines.join('\n')}`, items: [c], itemKind: 'contact' };
  },
};

/* ---- Job-scoped Kai handlers (Phase 2E). Every value read here is a stored
   field already computed by job-match-engine.js / the Application Preparation
   flow — nothing is recalculated or invented for Kai's benefit. ---- */
const KAI_JOB_HANDLERS = {
  jobWhyMatch(job) {
    if (job.matchStatus !== 'Analyzed' || job.matchScore === null || job.matchScore === undefined) {
      return { text: job.matchStatus === 'Not enough data'
        ? `${job.title} at ${job.company} doesn't have enough job information to calculate a reliable match yet.`
        : `${job.title} at ${job.company} hasn't been analyzed yet — open Match Analysis and click Analyze Match first.`, jobId: job.id };
    }
    const lines = [jobSummaryLine(job)];
    if (job.matchConfidence) lines.push(`Match confidence: ${job.matchConfidence}`);
    if (job.matchingSkills && job.matchingSkills.length) lines.push(`\nWhy:\n${job.matchingSkills.map(s => `• ${s}`).join('\n')}`);
    if (job.partialSkills && job.partialSkills.length) lines.push(`\nRelated: ${job.partialSkills.join(', ')}`);
    const gaps = [...(job.missingSkills || []), ...(job.missingRequirements || []).map(r => r.text || r)];
    lines.push(gaps.length ? `\nGaps: ${gaps.join(', ')}` : '\nNo gaps identified.');
    if (jobProfile.summary) lines.push(`\nExperience: ${jobProfile.summary}`);
    const hasGaps = gaps.length > 0;
    lines.push(`\nRecommendation: ${recommendationFor(job.matchScore, hasGaps)}`);
    lines.push(`\nStatus: ${job.status}.`);
    return { text: lines.join('\n'), jobId: job.id };
  },
  jobGaps(job) {
    if (job.matchStatus !== 'Analyzed') return { text: `${job.title} at ${job.company} hasn't been analyzed yet.`, jobId: job.id };
    const gaps = [...(job.missingSkills || []), ...(job.missingRequirements || []).map(r => r.text || r)];
    return { text: gaps.length ? `Gaps for ${job.title} at ${job.company}: ${gaps.join(', ')}.` : `No gaps identified for ${job.title} at ${job.company} based on the available job information.`, jobId: job.id };
  },
  jobApplicationStatus(job) {
    if (!job.applicationPreparedAt) return { text: `No application draft has been prepared yet for ${job.title} at ${job.company}.`, jobId: job.id };
    const parts = [];
    if (job.introduction) parts.push('an introduction');
    if (job.applicationDraft) parts.push('an application message');
    if (job.whyGoodFit) parts.push("a \"why I'm a good fit\" section");
    let text = `Yes. ${parts.length ? parts.join(', ') + ' are saved' : 'A draft exists'} for ${job.title} at ${job.company}.`;
    const qCount = (job.applicationQuestions || []).length;
    if (qCount) text += ` ${qCount} application question${qCount === 1 ? '' : 's'} on file.`;
    text += ` Current status: ${job.status}.`;
    return { text, jobId: job.id };
  },
  jobRecommendation(job) {
    if (job.matchScore === null || job.matchScore === undefined) {
      return { text: `${job.title} at ${job.company} hasn't been analyzed yet, so I don't have a recommendation for it.`, jobId: job.id };
    }
    const hasGaps = (job.missingSkills || []).length > 0 || (job.missingRequirements || []).length > 0;
    let text = `${jobSummaryLine(job)}\n\n${recommendationFor(job.matchScore, hasGaps)}`;
    if (!job.applicationPreparedAt) text += '\n\nNo application has been prepared yet.';
    else if (!['Ready to Apply', 'Applied', 'Interview', 'Hired'].includes(job.status)) text += "\n\nAn application has been prepared, but it hasn't been marked Ready to Apply yet.";
    return { text, jobId: job.id };
  },
  jobOverview(job) {
    const lines = [jobSummaryLine(job), `Status: ${job.status}`, `Source: ${job.source}`, `Salary: ${jobSalaryDisplay(job)}`,
      `Application prepared: ${job.applicationPreparedAt ? 'Yes' : 'No'}`];
    if (isJobMatchStale(job)) lines.push('Note: your Job Profile has changed since this was analyzed — consider re-analyzing.');
    return { text: lines.join('\n'), jobId: job.id };
  },
};

/* ---- Entity resolution: which contact is "this client" referring to? ---- */
function kaiCurrentOpenContactId() {
  const overlay = document.getElementById('modalOverlay');
  if (overlay && !overlay.classList.contains('hidden')) {
    return document.getElementById('contactId')?.dataset.profileId || null;
  }
  return null;
}
function kaiContextContact(text) {
  const explicit = kaiResolveContactFromText(text, contacts);
  if (explicit) return explicit;
  if (kaiTextReferencesContact(text)) {
    const openId = kaiCurrentOpenContactId();
    if (openId) { const c = contacts.find(x => x.id === openId); if (c) return c; }
    if (kaiLastContactId) { const c = contacts.find(x => x.id === kaiLastContactId); if (c) return c; }
  }
  return null;
}

/* ---- Job Hunt intelligence (Phase 2E): resolves which saved job a question
   is about — an explicitly named one, or (while on Job Hunt with a job
   selected) the selected job, so the user never has to repeat its title. ---- */
function kaiContextJob(text) {
  const explicit = kaiResolveJobFromText(text, jobs);
  if (explicit) return explicit;
  if (currentView === 'jobhunt' && jhSelectedId) return jobs.find(j => j.id === jhSelectedId) || null;
  if (kaiLastJobId) return jobs.find(j => j.id === kaiLastJobId) || null;
  return null;
}
function kaiSelectedJobLabel() {
  if (currentView !== 'jobhunt' || !jhSelectedId) return null;
  const job = jobs.find(j => j.id === jhSelectedId);
  return job ? `${job.title} — ${job.company}` : null;
}
/* Read-only Job Hunt data-access helpers — thin wrappers over the same global
   state the Job Hunt UI already renders from. No second data store. */
function getJobOpportunities() { return jobs; }
function getSelectedJob() { return jhSelectedId ? jobs.find(j => j.id === jhSelectedId) || null : null; }
function getJobProfileData() { return jobProfile; }
function getJobMatchAnalysis(jobId) {
  const job = jobs.find(j => j.id === jobId);
  if (!job) return null;
  return {
    matchScore: job.matchScore, matchStatus: job.matchStatus, matchConfidence: job.matchConfidence,
    matchingSkills: job.matchingSkills, partialSkills: job.partialSkills, missingSkills: job.missingSkills,
    matchedRequirements: job.matchedRequirements, partialRequirements: job.partialRequirements, missingRequirements: job.missingRequirements,
    matchExplanation: job.matchExplanation, analyzedAt: job.analyzedAt,
  };
}
function getApplicationData(jobId) {
  const job = jobs.find(j => j.id === jobId);
  if (!job) return null;
  return {
    introduction: job.introduction, applicationDraft: job.applicationDraft, whyGoodFit: job.whyGoodFit,
    applicationQuestions: job.applicationQuestions, notes: job.notes,
    applicationPreparedAt: job.applicationPreparedAt, applicationLastUpdatedAt: job.applicationLastUpdatedAt, status: job.status,
  };
}
function getJobsByStatus(status) { return jobs.filter(j => j.status === status); }
function getJobsByMatchScore(minScore) { return jobs.filter(j => j.matchScore !== null && j.matchScore !== undefined && j.matchScore >= minScore); }
function getJobHuntSummary() {
  return {
    total: jobs.length,
    analyzed: jobs.filter(j => j.matchStatus === 'Analyzed').length,
    strongMatches: jobs.filter(j => j.matchScore !== null && j.matchScore >= 90).length,
    readyToApply: jobs.filter(j => j.status === 'Ready to Apply').length,
    applied: jobs.filter(j => j.status === 'Applied').length,
  };
}

/* Job Finder (Phase 2F) free-text routing — scoped strictly to when the user
   is actually on the Job Finder page, since its results are in-memory/
   per-session (unlike Job Opportunities' persistent data), so referencing
   them from another page wouldn't make sense. */
function kaiInterpretJobFinder(text) {
  if (currentView !== 'jobfinder') return null;
  const t = text.toLowerCase();
  const aboveMatch = t.match(/above\s*(\d{1,3})%?/);
  if (aboveMatch) {
    const min = Number(aboveMatch[1]);
    return { type: 'dynamic', run: () => {
      if (!jfHasSearched) return { text: "I haven't run a Job Finder search yet — add keywords and click Find Jobs first." };
      const list = jfResults.filter(r => r.matchScore !== null && r.matchScore !== undefined && r.matchScore >= min);
      if (!list.length) return { text: `I don't currently have any Job Finder results above ${min}%.` };
      return { text: `${list.length} result${list.length === 1 ? '' : 's'} above ${min}%:\n${list.map(r => `• ${r.title} — ${r.matchScore}%`).join('\n')}` };
    } };
  }
  const belowMatch = t.match(/below\s*(\d{1,3})%?/);
  if (belowMatch) {
    const max = Number(belowMatch[1]);
    return { type: 'dynamic', run: () => {
      if (!jfHasSearched) return { text: "I haven't run a Job Finder search yet — add keywords and click Find Jobs first." };
      const list = jfResults.filter(r => r.matchScore !== null && r.matchScore !== undefined && r.matchScore < max);
      if (!list.length) return { text: `I don't currently have any Job Finder results below ${max}%.` };
      return { text: `${list.length} result${list.length === 1 ? '' : 's'} below ${max}%:\n${list.map(r => `• ${r.title} — ${r.matchScore}%`).join('\n')}` };
    } };
  }
  if (/strongest match|best match/.test(t)) return { type: 'handler', handler: 'jfStrongestMatches' };
  if (/haven'?t.*saved|not saved|not.*save/.test(t)) return { type: 'handler', handler: 'jfNotSaved' };
  if (/keyword.*most|most.*keyword|which keyword/.test(t)) return { type: 'handler', handler: 'jfBestKeyword' };
  if (/review first|which job should i review|review next/.test(t)) return { type: 'handler', handler: 'jfReviewFirst' };
  return null;
}

/* Job-hunt-specific free-text routing. Runs before the generic kaiMatchFreeText
   rules because several job-hunt phrasings ("prioritize", "compare", "came
   from LinkedIn", "attention") would otherwise be caught by unrelated CRM
   rules (task prioritization, period comparison, lead source, general
   needs-attention). Returns null when the message isn't about Job Hunt at
   all, so normal routing continues untouched. */
function kaiInterpretJobHunt(text) {
  const t = text.toLowerCase();
  // Deliberately excludes "opportunity/opportunities" — Pipeline contacts
  // already use that word (c.opportunity) for a lead's deal, so treating it
  // as a Job Hunt signal would hijack unrelated Pipeline questions.
  // "match" is included because it's unique to Job Hunt in this CRM's
  // vocabulary (Pipeline has no matching concept) — safe, unlike "opportunity".
  const mentionsJobDomain = /\bjob(s)?\b|\bapplication(s)?\b|\bready to apply\b|\bmatch(es|ing)?\b/.test(t);
  const explicitJob = kaiResolveJobFromText(text, jobs);
  const onJobHuntView = currentView === 'jobhunt';
  const onJobHuntWithSelection = onJobHuntView && !!jhSelectedId;
  // Broad enough to catch conversational follow-ups ("why?", "what makes it
  // a good match?", "is my application ready?", "what should I change?"),
  // not just the first, fully-worded question in a thread.
  const jobScopedIntent = /(^why\??$|why (is|does|this|it)|what makes|good (fit|match)|strong match|missing skill|skill gap|meet the requirement|prepared|application (ready|exist|draft)|is my application|recommend|what should i (do|change)|prioritize this|next step|tell me about this|this job|that job|status of this)/.test(t);
  // A job is "in context" if it's explicitly named, the currently selected
  // job (while on Job Hunt), or the last job Kai itself talked about —
  // that memory is what lets "this job"/"why?" work across turns without
  // requiring the user to repeat the title or keep a row selected.
  const contextJob = explicitJob || (onJobHuntWithSelection ? jobs.find(j => j.id === jhSelectedId) : null) || (kaiLastJobId ? jobs.find(j => j.id === kaiLastJobId) : null);
  const contextScoped = !!contextJob && jobScopedIntent;
  // "What should I work on next?" / "which should I prioritize?" are generic
  // phrasings that also exist as a task-prioritization CRM rule — resolve
  // them to Job Hunt specifically only while the user is on that page.
  // Also honored when there's an active Job Hunt conversation thread (a job
  // is already "in context"), so a follow-up like this doesn't need the user
  // to still be on the Job Hunt page.
  const genericPrioritizeAsk = (onJobHuntView || !!kaiLastJobId) && /work on next|what should i work on|should i prioriti|which.*prioriti/.test(t);
  // Only engage Job Hunt intelligence when the message actually names a job,
  // uses real job-domain vocabulary, is a job-scoped question asked with a
  // job already in context, or is a generic prioritization ask made from the
  // Job Hunt page — never just because the user happens to be on that page
  // (that would hijack unrelated questions asked from there).
  if (!mentionsJobDomain && !explicitJob && !contextScoped && !genericPrioritizeAsk) return null;

  // ---- Write-intent requests: Kai is read-only for Phase 2E. Never act —
  // ask for confirmation instead, per spec section 16. ----
  const writeIntent = /\b(change|set|update|mark|move)\b/.test(t) && JOB_STATUSES.some(s => t.includes(s.toLowerCase()));
  if (writeIntent && contextJob) {
    const targetStatus = JOB_STATUSES.find(s => t.includes(s.toLowerCase())) || 'that status';
    return { type: 'dynamic', run: () => ({ text: `Would you like me to mark ${contextJob.title} — ${contextJob.company} as ${targetStatus}? I won't change it unless you confirm — for now, you can update the status directly from the Selected Job panel.` }) };
  }

  // ---- Job-scoped questions (a job explicitly named, currently selected, or
  // still "in context" from Kai's own last answer) ----
  if (explicitJob || contextScoped) {
    const job = contextJob;
    if (job) {
      if (/missing|\bgap/.test(t)) return { type: 'jobHandler', handler: 'jobGaps', job };
      if (/prepared|application (ready|exist|draft)|is my application/.test(t)) return { type: 'jobHandler', handler: 'jobApplicationStatus', job };
      if (/recommend|what should i (do|change)|next step/.test(t)) return { type: 'jobHandler', handler: 'jobRecommendation', job };
      if (/why|good (fit|match)|strong match|meet the requirement/.test(t)) return { type: 'jobHandler', handler: 'jobWhyMatch', job };
      return { type: 'jobHandler', handler: 'jobOverview', job };
    }
  }

  // ---- Cross-job / global Job Hunt questions ----
  // More specific "applied" phrasings are checked before the generic
  // "how many jobs" / bare "applied to" patterns so they aren't shadowed —
  // e.g. "jobs I haven't applied to yet" also contains "applied to".
  if (/haven'?t applied|not (yet )?applied|not.*applied to/.test(t)) {
    return { type: 'dynamic', run: () => {
      const list = jobs.filter(j => j.status !== 'Applied' && !['Interview', 'Hired'].includes(j.status));
      if (!list.length) return { text: "Every job you've saved is already marked Applied or further along." };
      return { text: `${list.length} job${list.length === 1 ? '' : 's'} not yet applied to:\n${list.map(j => `• ${j.title} — ${j.company} (${j.status})`).join('\n')}` };
    } };
  }
  if (/how many.*(appl(y|ied)|apply)/.test(t)) {
    return { type: 'dynamic', run: () => {
      const appliedOnly = jobs.filter(j => j.status === 'Applied');
      const further = jobs.filter(j => ['Interview', 'Hired'].includes(j.status));
      if (!appliedOnly.length && !further.length) return { text: 'No jobs are currently marked Applied.' };
      let text = `${appliedOnly.length} job${appliedOnly.length === 1 ? '' : 's'} marked Applied.`;
      if (further.length) text += ` ${further.length} further along (Interview/Hired).`;
      return { text };
    } };
  }
  if (/strong match.*(need|without).*application|strong.*not.*applied/.test(t)) {
    return { type: 'dynamic', run: () => {
      const list = jobs.filter(j => j.matchScore !== null && j.matchScore >= 75 && !j.applicationPreparedAt);
      if (!list.length) return { text: "I don't currently have any strong matches without a prepared application." };
      return { text: `Strong matches without a prepared application:\n${list.map(j => `• ${j.title} — ${j.company} (${j.matchScore}%)`).join('\n')}` };
    } };
  }
  // APPLICATIONS_NEEDED — every job's application-preparation state, checked
  // directly via applicationPreparedAt. Never inferred from status or match
  // analysis: a "Saved" job can already have an application prepared, and an
  // analyzed job can still have none.
  if (/(still )?need.*application|application.*(needed|missing)|which jobs.*need/.test(t)) {
    return { type: 'dynamic', run: () => {
      if (!jobs.length) return { text: "I don't have any Job Hunt opportunities yet." };
      const needPrep = jobs.filter(j => !j.applicationPreparedAt);
      const havePrep = jobs.filter(j => j.applicationPreparedAt);
      if (!needPrep.length) return { text: 'All saved jobs currently have application materials prepared.' };
      let text = `Jobs that still need an application:\n\n${needPrep.map(j => `• ${j.title} — ${j.company}`).join('\n')}`;
      if (havePrep.length) text += `\n\n${havePrep.map(j => `${j.title} — ${j.company}`).join(', ')} already ${havePrep.length === 1 ? 'has' : 'have'} application materials prepared.`;
      return { text };
    } };
  }
  if (/application.*prepared|prepared.*application/.test(t)) {
    return { type: 'dynamic', run: () => {
      const prepared = jobs.filter(j => j.applicationPreparedAt);
      if (!prepared.length) return { text: 'No applications have been prepared yet.' };
      return { text: `${prepared.length} job${prepared.length === 1 ? '' : 's'} with an application prepared:\n${prepared.map(j => `• ${j.title} — ${j.company}`).join('\n')}` };
    } };
  }
  if (/how many.*job/.test(t)) return { type: 'handler', handler: 'jobTotalCount' };
  if (/strongest match|matches.*best|best.*match/.test(t)) return { type: 'handler', handler: 'jobsStrongestMatch' };
  if (/\bsaved\b/.test(t) && /\bjob/.test(t)) return { type: 'handler', handler: 'jobsSavedList' };
  if (/ready to apply/.test(t)) return { type: 'handler', handler: 'jobReadyToApply' };
  if (/skill gap|common.*gap|gaps.*across/.test(t)) return { type: 'handler', handler: 'jobSkillGaps' };
  if (/prioriti|work on next|what should i work on/.test(t)) return { type: 'handler', handler: 'jobsPrioritize' };
  if (/need.*attention|attention/.test(t)) return { type: 'handler', handler: 'jobsNeedAttention' };
  if (/follow.?up/.test(t)) {
    return { type: 'dynamic', run: () => {
      const withFollowUp = jobs.filter(j => j.followUpDate);
      if (!withFollowUp.length) return { text: 'No jobs currently have a follow-up date set.' };
      return { text: `Jobs with a follow-up date:\n${withFollowUp.map(j => `• ${j.title} — ${j.company}: ${fmtDateShort(j.followUpDate)}`).join('\n')}` };
    } };
  }
  if (/compare.*(strongest|top|two)|compare my/.test(t)) {
    return { type: 'dynamic', run: () => {
      const analyzed = jobs.filter(j => j.matchScore !== null && j.matchScore !== undefined).sort((a, b) => b.matchScore - a.matchScore);
      if (analyzed.length < 2) return { text: "I need at least two analyzed jobs to compare — right now I only have " + analyzed.length + "." };
      const [a, b] = analyzed;
      return { text: `${jobSummaryLine(a)}\n\nvs.\n\n${jobSummaryLine(b)}\n\n${a.title} currently scores higher (${a.matchScore}% vs ${b.matchScore}%).`, jobId: a.id };
    } };
  }
  const aboveMatch = t.match(/above\s*(\d{1,3})%?/);
  if (aboveMatch) {
    const min = Number(aboveMatch[1]);
    return { type: 'dynamic', run: () => {
      const list = getJobsByMatchScore(min);
      if (!list.length) return { text: `I don't currently have any jobs above ${min}%.` };
      return { text: `${list.length} job${list.length === 1 ? '' : 's'} above ${min}%:\n${list.map(j => `• ${jobSummaryLine(j).replace('\n', ' — ')}`).join('\n')}` };
    } };
  }
  const belowMatch = t.match(/below\s*(\d{1,3})%?/);
  if (belowMatch) {
    const max = Number(belowMatch[1]);
    return { type: 'dynamic', run: () => {
      const list = jobs.filter(j => j.matchScore !== null && j.matchScore !== undefined && j.matchScore < max);
      if (!list.length) return { text: `I don't currently have any jobs below ${max}%.` };
      return { text: `${list.length} job${list.length === 1 ? '' : 's'} below ${max}%:\n${list.map(j => `• ${jobSummaryLine(j).replace('\n', ' — ')}`).join('\n')}` };
    } };
  }
  const sourceMatch = JOB_SOURCES.find(s => t.includes(s.toLowerCase()));
  if (sourceMatch && /from|source/.test(t)) {
    return { type: 'dynamic', run: () => {
      const list = jobs.filter(j => j.source === sourceMatch);
      if (!list.length) return { text: `No jobs are on file from ${sourceMatch}.` };
      return { text: `${list.length} job${list.length === 1 ? '' : 's'} from ${sourceMatch}:\n${list.map(j => `• ${j.title} — ${j.company}`).join('\n')}` };
    } };
  }
  if (/useful for appointment.?sett|skills.*appointment/.test(t)) {
    return { type: 'dynamic', run: () => {
      const hints = titleCapabilityHints('Appointment Setter');
      const pool = [...(jobProfile.services || []), ...(jobProfile.skills || []), ...(jobProfile.tools || []), ...(jobProfile.crmCapabilities || [])];
      const owned = hints.filter(h => classifyPhrase(h, pool) === 'match');
      if (!owned.length) return { text: "I don't see specific appointment-setting-related capabilities in your Job Profile yet." };
      return { text: `From your Job Profile, these are useful for appointment-setting roles:\n${owned.map(s => `• ${s}`).join('\n')}` };
    } };
  }
  if (/type of jobs?.*match|jobs?.*match.*profile best|best.*fit.*profile/.test(t)) {
    return { type: 'dynamic', run: () => {
      if (!jobProfile.services || !jobProfile.services.length) return { text: "I don't have that information in the CRM yet — add services to your Job Profile first." };
      return { text: `Based on your Job Profile, you're best positioned for roles involving: ${jobProfile.services.join(', ')}.` };
    } };
  }
  // Soft fallback: the message genuinely used job-domain vocabulary but
  // didn't match a specific pattern — give a general overview rather than
  // falling through to the CRM's generic "I couldn't find that" response.
  if (mentionsJobDomain) return { type: 'handler', handler: 'jobTotalCount' };
  return null;
}
function kaiRefinePrevious(t) {
  if (!kaiLastResultItems || !kaiLastResultItems.length) return null;
  let filtered = null, label = '';
  if (/haven'?t.*contact|not.*contact|no.*response|not responded/.test(t)) {
    if (kaiLastItemKind === 'contact' || kaiLastItemKind === 'followup') {
      filtered = kaiLastResultItems.filter(c => !c.lastContactedAt);
      label = "haven't been contacted";
    }
  } else if (/overdue/.test(t)) {
    filtered = kaiLastResultItems.filter(it => {
      if (kaiLastItemKind === 'task') return taskBucket(it) === 'overdue';
      if (kaiLastItemKind === 'invoice') return invoiceEffectiveStatus(it) === 'Overdue';
      if (kaiLastItemKind === 'project') return it.dueDate && daysUntil(it.dueDate) < 0;
      return followupBucket(it) === 'overdue';
    });
    label = 'overdue';
  }
  if (!filtered) return null;
  return { text: `${filtered.length} of those are ${label}.`, items: filtered, itemKind: kaiLastItemKind };
}

/* ---- Intent interpretation: routes free text to a handler, a contact-scoped handler,
   a refinement of the previous answer, or an honest clarification request. ---- */
function kaiInterpret(text) {
  const t = text.toLowerCase();
  if (/how much.*(owe|owed|owing)/.test(t) && !/invoice|pipeline/.test(t)) {
    return { type: 'clarify', question: 'Do you mean outstanding client invoices, or the value of open pipeline opportunities?',
      options: [{ label: 'Outstanding invoices', handler: 'outstandingInvoices' }, { label: 'Open pipeline value', handler: 'pipelineValue' }] };
  }
  if (kaiLastResultItems && /\b(which ones|those|these|them one)\b/.test(t)) {
    const refined = kaiRefinePrevious(t);
    if (refined) return { type: 'refine', result: refined };
  }
  const jobFinderInterp = kaiInterpretJobFinder(text);
  if (jobFinderInterp) return jobFinderInterp;
  const jobHuntInterp = kaiInterpretJobHunt(text);
  if (jobHuntInterp) return jobHuntInterp;
  const contact = kaiContextContact(text);
  if (contact) {
    if (/document|proposal|contract|file/.test(t)) return { type: 'contactHandler', handler: 'documentsForContact', contact };
    if (/\btask/.test(t)) return { type: 'contactHandler', handler: 'tasksForContact', contact };
    if (/invoice|billing|owe|paid/.test(t)) return { type: 'contactHandler', handler: 'billingForContact', contact };
    if (/appointment|meeting/.test(t)) return { type: 'contactHandler', handler: 'appointmentsForContact', contact };
    if (/project/.test(t)) return { type: 'contactHandler', handler: 'projectsForContact', contact };
    return { type: 'contactHandler', handler: 'clientOverview', contact };
  }
  const handler = kaiMatchFreeText(text);
  if (handler) return { type: 'handler', handler };
  return { type: 'none' };
}

/* kaiMatchFreeText, kaiTextReferencesContact, kaiResolveContactFromText now live in
   kai-engine.js (loaded before this file) so scripts/test-kai.js can exercise the
   same matching logic under plain Node without stubbing a browser. */

/* ---- Rendering ---- */
function kaiRenderWelcome() {
  kaiConversationStarted = false;
  const ctx = kaiPageContext();
  const body = $('#kaiBody');
  const greetingEl = $('#greetingText');
  const greeting = greetingEl ? greetingEl.textContent.replace(/\s*👋\s*$/, '') : 'Hello';
  const chipsHtml = ctx.chips.map(c => `<button class="kai-suggestion" data-handler="${c.handler}">${c.icon} ${escapeHtml(c.label)}</button>`).join('');
  body.innerHTML = `
    <div class="kai-welcome-title">${escapeHtml(greeting)}. 👋</div>
    <div class="kai-welcome-text">I can help you understand your CRM, find what needs attention, and take the next action.</div>
    <div class="kai-suggestions">${chipsHtml}</div>
  `;
  body.querySelectorAll('.kai-suggestion').forEach(btn => btn.addEventListener('click', () => kaiAsk(btn.textContent.trim(), btn.dataset.handler)));
  kaiRenderContextChip();
  kaiUpdateFabBadge();
}
function kaiRenderContextChip() {
  const ctx = kaiPageContext();
  const el = $('#kaiContextChip');
  const statText = ctx.stat ? ctx.stat() : '';
  el.innerHTML = `<span class="kcc-page">You're viewing ${escapeHtml(ctx.label)}</span>${statText ? `<span class="kcc-sep">·</span><span class="kcc-stat">${escapeHtml(statText)}</span>` : ''}`;
  el.classList.remove('hidden');
}
function kaiAppendUserMsg(text) {
  const body = $('#kaiBody');
  const el = document.createElement('div'); el.className = 'kai-msg user'; el.textContent = text;
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
}
function kaiAppendThinking(label) {
  const body = $('#kaiBody');
  const el = document.createElement('div'); el.className = 'kai-msg kai-thinking';
  el.innerHTML = `${escapeHtml(label || 'Kai is thinking')} <span class="kai-thinking-dots"><span></span><span></span><span></span></span>`;
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
  return el;
}
const KAI_CROSS_MODULE_HANDLERS = new Set(['needsAttention', 'clientOverview', 'todayEverything', 'sourcePerformance', 'weekSummary', 'comparePeriod', 'explainConversion']);
function kaiResultCardHtml(item, kind) {
  if (kind === 'contact' || kind === 'followup') {
    const c = item;
    const stage = stageOf(c);
    const overdue = followupBucket(c) === 'overdue';
    return `
      <div class="kai-result-card" data-id="${c.id}">
        <div class="avatar">${initials(c.name)}</div>
        <div class="kai-result-main">
          <div class="kai-result-name">${escapeHtml(c.name)}</div>
          <div class="kai-result-sub">${escapeHtml(c.company || c.opportunity || c.service || '')}</div>
          <div class="kai-result-meta">
            <span class="status-badge" style="background:${stage.color}1a;color:${stage.color}">${stage.label}</span>
            ${overdue ? `<span class="status-badge" style="background:var(--error)1a;color:var(--error)">Overdue</span>` : ''}
            ${c.value ? `<span class="kai-result-sub">${fmtMoney(c.value)}</span>` : ''}
          </div>
        </div>
        <div class="kai-result-actions">
          <button class="btn btn-ghost btn-sm kai-open-contact" data-id="${c.id}">Open</button>
          ${kind === 'followup' ? `<button class="btn btn-secondary btn-sm kai-followup-contact" data-id="${c.id}">Follow Up</button>` : ''}
        </div>
      </div>
    `;
  }
  if (kind === 'task') {
    const t = item;
    const overdue = taskBucket(t) === 'overdue';
    return `
      <div class="kai-result-card" data-id="${t.id}">
        <div class="kai-result-main">
          <div class="kai-result-name">${escapeHtml(t.title)}</div>
          <div class="kai-result-meta">
            <span class="task-priority ${t.priority}">${t.priority}</span>
            <span class="kai-result-sub">${overdue ? 'Overdue' : taskDueLabel(t)}</span>
          </div>
        </div>
        <div class="kai-result-actions"><button class="btn btn-ghost btn-sm kai-open-tasks">Open</button></div>
      </div>
    `;
  }
  if (kind === 'appointment') {
    const c = item;
    return `
      <div class="kai-result-card" data-id="${c.id}">
        <div class="avatar">${initials(c.name)}</div>
        <div class="kai-result-main">
          <div class="kai-result-name">${escapeHtml(c.name)}</div>
          <div class="kai-result-sub">${escapeHtml(c.bookingTime || '')} ${c.opportunity || c.service ? '· ' + escapeHtml(c.opportunity || c.service) : ''}</div>
        </div>
        <div class="kai-result-actions">
          <button class="btn btn-ghost btn-sm kai-open-contact" data-id="${c.id}">Open</button>
          ${c.meetingLink ? `<a class="btn btn-secondary btn-sm" href="${escapeHtml(c.meetingLink)}" target="_blank" rel="noopener">Join</a>` : ''}
        </div>
      </div>
    `;
  }
  if (kind === 'invoice') {
    const inv = item;
    const contact = contacts.find(c => c.id === inv.contactId);
    const status = invoiceEffectiveStatus(inv);
    return `
      <div class="kai-result-card">
        <div class="kai-result-main">
          <div class="kai-result-name">${escapeHtml(contact ? contact.name : 'Unassigned')}</div>
          <div class="kai-result-sub">${escapeHtml(inv.invoiceNumber)} · ${fmtMoney(inv.amount)} · ${status}</div>
        </div>
        <div class="kai-result-actions"><button class="btn btn-ghost btn-sm kai-open-billing">View</button></div>
      </div>
    `;
  }
  if (kind === 'document') {
    const d = item;
    const contact = contacts.find(c => c.id === d.contactId);
    return `
      <div class="kai-result-card">
        <div class="kai-result-main">
          <div class="kai-result-name">${escapeHtml(d.name)}</div>
          <div class="kai-result-sub">${escapeHtml(d.type)}${contact ? ' · ' + escapeHtml(contact.name) : ''} · ${new Date(d.uploadedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</div>
        </div>
        <div class="kai-result-actions"><a class="btn btn-ghost btn-sm" href="/uploads/${escapeHtml(d.filename)}" target="_blank" rel="noopener">Open</a></div>
      </div>
    `;
  }
  if (kind === 'project') {
    const p = item;
    const contact = contacts.find(c => c.id === p.contactId);
    const overdue = p.dueDate && daysUntil(p.dueDate) < 0;
    return `
      <div class="kai-result-card" data-id="${p.contactId || ''}">
        <div class="kai-result-main">
          <div class="kai-result-name">${escapeHtml(p.name)}</div>
          <div class="kai-result-sub">${contact ? escapeHtml(contact.name) + ' · ' : ''}${escapeHtml(p.status)}${p.dueDate ? ' · Due ' + fmtDateShort(p.dueDate) : ''}</div>
          ${overdue ? `<div class="kai-result-meta"><span class="status-badge" style="background:var(--error)1a;color:var(--error)">Overdue</span></div>` : ''}
        </div>
        <div class="kai-result-actions"><button class="btn btn-ghost btn-sm kai-open-project" data-id="${p.contactId || ''}">Open</button></div>
      </div>
    `;
  }
  return '';
}
function kaiWireResultCards(container) {
  container.querySelectorAll('.kai-open-contact').forEach(btn => btn.addEventListener('click', () => {
    const c = contacts.find(x => x.id === btn.dataset.id); if (c) openModal(c);
  }));
  container.querySelectorAll('.kai-followup-contact').forEach(btn => btn.addEventListener('click', () => {
    updateContact(btn.dataset.id, { nextFollowUp: '', lastContactedAt: todayStr() });
    btn.textContent = 'Followed up ✓'; btn.disabled = true;
  }));
  container.querySelectorAll('.kai-open-tasks').forEach(btn => btn.addEventListener('click', () => goToView('tasks')));
  container.querySelectorAll('.kai-open-billing').forEach(btn => btn.addEventListener('click', () => goToView('billing')));
  container.querySelectorAll('.kai-open-project').forEach(btn => btn.addEventListener('click', () => {
    const c = btn.dataset.id ? contacts.find(x => x.id === btn.dataset.id) : null;
    if (c) openModal(c); else goToView('projects');
  }));
}
function kaiRenderResponse(res) {
  const body = $('#kaiBody');
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-self:stretch;';
  const textEl = document.createElement('div');
  textEl.className = 'kai-msg responding';
  textEl.style.whiteSpace = 'pre-line';
  textEl.textContent = res.text;
  wrap.appendChild(textEl);
  if (res.items && res.items.length) {
    kaiLastResultItems = res.items;
    kaiLastItemKind = res.itemKind;
    if (res.itemKind === 'contact' && res.items.length === 1) kaiLastContactId = res.items[0].id;
  }
  // Job Hunt conversation memory: whichever job a response was actually about
  // becomes "this job"/"that job" for the next message, without needing a
  // rendered result card (Job Hunt has no kaiResultCardHtml kind of its own).
  if (res.jobId) kaiLastJobId = res.jobId;
  if (res.items && res.items.length) {
    const shown = res.items.slice(0, 5);
    const extra = res.items.length - shown.length;
    const block = document.createElement('div');
    block.className = 'kai-result-block';
    block.innerHTML = `<div class="kai-result-list">${shown.map(it => kaiResultCardHtml(it, res.itemKind)).join('')}</div>${extra > 0 ? `<div class="kai-result-more">+${extra} more</div>` : ''}`;
    wrap.appendChild(block);
    kaiWireResultCards(block);
  }
  if (res.actions && res.actions.length) {
    const row = document.createElement('div');
    row.className = 'kai-actions-row';
    res.actions.forEach(a => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary btn-sm';
      btn.textContent = a.label;
      btn.addEventListener('click', () => {
        if (a.nav) goToView(a.nav);
        if (a.bulk) kaiStartBulkPreview(a.bulk);
      });
      row.appendChild(btn);
    });
    wrap.appendChild(row);
  }
  body.appendChild(wrap);
  body.scrollTop = body.scrollHeight;
}
function kaiStartBulkPreview(kind) {
  if (kind !== 'followups') return;
  const list = contacts.filter(c => followupBucket(c) === 'overdue');
  if (!list.length) return;
  kaiPendingBulk = { kind, ids: list.map(c => c.id) };
  const body = $('#kaiBody');
  const block = document.createElement('div');
  block.className = 'kai-action-preview';
  block.innerHTML = `
    <div class="kai-action-preview-title">Action Preview · ${list.length} Follow-Up${list.length === 1 ? '' : 's'} to create</div>
    ${list.map(c => `<label class="kai-preview-item"><input type="checkbox" checked data-id="${c.id}"> ${escapeHtml(c.name)}${c.company ? ' · ' + escapeHtml(c.company) : ''}</label>`).join('')}
    <div class="kai-action-preview-actions">
      <button class="btn btn-ghost btn-sm" id="kaiBulkCancel">Cancel</button>
      <button class="btn btn-primary btn-sm" id="kaiBulkConfirm">Confirm</button>
    </div>
  `;
  body.appendChild(block);
  body.scrollTop = body.scrollHeight;
  block.querySelector('#kaiBulkCancel').addEventListener('click', () => {
    kaiPendingBulk = null;
    block.innerHTML = `<p class="muted-sub" style="margin:0;">Cancelled — no changes were made.</p>`;
  });
  block.querySelector('#kaiBulkConfirm').addEventListener('click', async () => {
    const checked = [...block.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.dataset.id);
    block.querySelector('#kaiBulkConfirm').disabled = true;
    block.querySelector('#kaiBulkConfirm').textContent = 'Creating…';
    for (const id of checked) { await updateContact(id, { nextFollowUp: todayStr() }); }
    kaiPendingBulk = null;
    block.innerHTML = `<p class="muted-sub" style="margin:0;">✓ Created ${checked.length} follow-up${checked.length === 1 ? '' : 's'}.</p>`;
    body.scrollTop = body.scrollHeight;
  });
}
function kaiRenderClarify(clarify) {
  const body = $('#kaiBody');
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px;align-self:stretch;';
  const textEl = document.createElement('div');
  textEl.className = 'kai-msg responding';
  textEl.textContent = clarify.question;
  wrap.appendChild(textEl);
  const row = document.createElement('div');
  row.className = 'kai-actions-row';
  clarify.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary btn-sm';
    btn.textContent = opt.label;
    btn.addEventListener('click', () => kaiAsk(opt.label, opt.handler));
    row.appendChild(btn);
  });
  wrap.appendChild(row);
  body.appendChild(wrap);
  body.scrollTop = body.scrollHeight;
}
function kaiAsk(displayText, handlerKey) {
  if (kaiProcessing) return;
  kaiConversationStarted = true;
  kaiAppendUserMsg(displayText);
  kaiProcessing = true;
  $('#kaiSend').disabled = true;
  const interp = handlerKey ? { type: 'handler', handler: handlerKey } : kaiInterpret(displayText);
  const crossModule = interp.type === 'contactHandler' || interp.type === 'jobHandler' || interp.type === 'dynamic' || (interp.handler && KAI_CROSS_MODULE_HANDLERS.has(interp.handler));
  const thinkingEl = kaiAppendThinking(crossModule ? 'Kai is checking your CRM...' : undefined);
  const delay = prefersReducedMotion() ? 0 : (crossModule ? 600 : 450);
  setTimeout(() => {
    thinkingEl.remove();
    if (interp.handler === 'bulkFollowups') {
      const list = contacts.filter(c => followupBucket(c) === 'overdue');
      const body = $('#kaiBody');
      const msg = document.createElement('div'); msg.className = 'kai-msg responding';
      msg.textContent = list.length ? `I found ${list.length} overdue lead${list.length === 1 ? '' : 's'}.` : 'No overdue leads right now.';
      body.appendChild(msg);
      if (list.length) kaiStartBulkPreview('followups');
    } else if (interp.type === 'clarify') {
      kaiRenderClarify(interp);
    } else if (interp.type === 'refine') {
      kaiRenderResponse(interp.result);
    } else if (interp.type === 'contactHandler' && KAI_CONTACT_HANDLERS[interp.handler]) {
      kaiRenderResponse(KAI_CONTACT_HANDLERS[interp.handler](interp.contact));
    } else if (interp.type === 'jobHandler' && KAI_JOB_HANDLERS[interp.handler]) {
      kaiRenderResponse(KAI_JOB_HANDLERS[interp.handler](interp.job));
    } else if (interp.type === 'dynamic' && typeof interp.run === 'function') {
      kaiRenderResponse(interp.run());
    } else if (interp.handler && KAI_HANDLERS[interp.handler]) {
      kaiRenderResponse(KAI_HANDLERS[interp.handler]());
    } else {
      kaiRenderResponse({ text: "I couldn't find that in your CRM. Try asking about a specific contact, follow-ups, tasks, appointments, invoices, projects, or pipeline stages." });
    }
    kaiProcessing = false;
    $('#kaiSend').disabled = false;
    $('#kaiBody').scrollTop = $('#kaiBody').scrollHeight;
  }, delay);
}
function kaiOnNavigate() {
  if (!$('#kaiPanel') || $('#kaiPanel').classList.contains('hidden')) { kaiUpdateFabBadge(); return; }
  if (!kaiConversationStarted) kaiRenderWelcome();
  else kaiRenderContextChip();
  kaiUpdateFabBadge();
}
function kaiUpdateFabBadge() {
  const badge = $('#kaiFabBadge');
  if (!badge) return;
  const overdueCount = contacts.filter(c => followupBucket(c) === 'overdue').length
    + tasks.filter(t => taskBucket(t) === 'overdue').length
    + invoices.filter(i => invoiceEffectiveStatus(i) === 'Overdue').length;
  const nextAppt = contacts.find(c => c.bookingDate === todayStr() && c.bookingTime);
  let minsUntil = null;
  if (nextAppt) { const m = parseApptMinutes(nextAppt.bookingTime); if (m !== null) { const now = new Date(); minsUntil = m - (now.getHours() * 60 + now.getMinutes()); } }
  if (minsUntil !== null && minsUntil >= 0 && minsUntil <= 60) {
    badge.textContent = `Next in ${minsUntil}m`; badge.classList.remove('hidden');
  } else if (overdueCount > 0) {
    badge.textContent = `${overdueCount} item${overdueCount === 1 ? '' : 's'}`; badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}
function initKai() {
  $('#kaiFab').addEventListener('click', toggleKai);
  $('#kaiCardOpen')?.addEventListener('click', openKai);
  $('#kaiClose').addEventListener('click', closeKai);
  $('#kaiNewChat').addEventListener('click', kaiNewChat);
  const input = $('#kaiInput');
  const send = () => {
    const text = input.value.trim();
    if (!text || kaiProcessing) return;
    kaiAsk(text, null);
    input.value = ''; input.style.height = 'auto';
  };
  $('#kaiSend').addEventListener('click', send);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    if (e.key === 'Escape') closeKai();
  });
  input.addEventListener('input', () => { input.style.height = 'auto'; input.style.height = Math.min(90, input.scrollHeight) + 'px'; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#kaiPanel').classList.contains('hidden')) closeKai(); });
  kaiRenderWelcome();
}
function initDashTrendToggle() {
  document.querySelectorAll('#dashTrendToggle .an-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.days) === dashTrendDays);
    btn.addEventListener('click', () => {
      dashTrendDays = Number(btn.dataset.days);
      document.querySelectorAll('#dashTrendToggle .an-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderDashboardLeadActivity(dashTrendDays);
    });
  });
}
function initDashboardKpiLinks() {
  document.querySelectorAll('.stat-card-link[data-view]').forEach(card => {
    card.addEventListener('click', () => { contactsFilter = null; goToView(card.dataset.view); });
  });
  $('#recentActivityViewAll').addEventListener('click', () => goToView('contacts'));
  $('#viewAnalyticsLink').addEventListener('click', (e) => { e.preventDefault(); goToView('analytics'); });
  $('#viewPipelineLink').addEventListener('click', (e) => { e.preventDefault(); goToView('pipeline'); });
  $('#upcomingApptsViewAll').addEventListener('click', () => goToView('appointments'));
}

initModal();
initNav();
initDashTrendToggle();
initTopSourcesRange();
initDashboardKpiLinks();
initSearch();
initWebhookUrl();
initGreeting();
initMobileNav();
initKai();
initContactFilters();
initPipelineSourceFilter();
initBilling();
initDocuments();
initProjects();
initQuickActionsBar();
initAnalyticsControls();
initFocusViewAll();
initJobForm();
initJobProfileModal();
initExperienceForm();
loadContacts();
loadTasks();
loadInvoices();
loadProjects();
loadDocuments();
loadJobs();
loadJobProfile();
loadJobFinderKeywords();
loadJobFinderHistory();
loadJobFinderStatus();
setInterval(() => { loadContacts(); loadTasks(); loadInvoices(); loadProjects(); loadDocuments(); loadJobs(); }, 15000);
