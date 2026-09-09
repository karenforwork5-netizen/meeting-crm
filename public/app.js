const STAGES = [
  { key: 'new', label: 'New Lead', color: '#6C5CE7' },
  { key: 'confirmed', label: 'Contacted', color: '#8C7FEA' },
  { key: 'held', label: 'Meeting Held', color: '#40356B' },
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
let searchTerm = '';
let currentView = 'dashboard';
let contactsFilter = null; // extra predicate set when jumping in from Dashboard focus cards
let contactChip = 'all';
let taskChip = 'all';
let dashTrendDays = 30;
let calendarMonth = (() => { const d = new Date(); d.setDate(1); return d; })();
let pendingUploadContactId = '';

const $ = (sel) => document.querySelector(sel);
const todayStr = () => new Date().toISOString().slice(0, 10);

async function loadContacts() { contacts = await (await fetch('/api/contacts')).json(); render(); }
async function loadTasks() { tasks = await (await fetch('/api/tasks')).json(); if (['tasks', 'dashboard', 'calendar'].includes(currentView)) render(); }
async function loadInvoices() { invoices = await (await fetch('/api/invoices')).json(); if (['billing', 'dashboard', 'calendar'].includes(currentView)) render(); }
async function loadProjects() { projects = await (await fetch('/api/projects')).json(); if (currentView === 'projects') render(); }
async function loadDocuments() { documents = await (await fetch('/api/documents')).json(); if (currentView === 'documents') render(); }

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

function emptyStateHtml(title, text) {
  return `
    <div class="empty-state">
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
  if (currentView === 'billing') renderBilling();
  if (currentView === 'documents') renderDocuments();
  if (currentView === 'projects') renderProjects();
  if (currentView === 'analytics') renderAnalytics();
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

  const tasksToday = tasks.filter(t => t.status === 'open' && t.dueDate === todayStr());
  const billingDue = invoices.filter(i => invoiceEffectiveStatus(i) !== 'Paid' && i.dueDate && daysUntil(i.dueDate) <= 3 && daysUntil(i.dueDate) >= 0);
  const overdueContacts = contacts.filter(c => followupBucket(c) === 'overdue');
  const todayAppts = contacts.filter(isTodayAppointment);

  renderStatusLine(overdueContacts.length + todayAppts.length + tasksToday.length + billingDue.length, overdueContacts.length);
  renderFocusFeed({ overdueContacts, todayAppts, tasksToday, billingDue, newLeads: contacts.filter(isNewLead), reactivation: contacts.filter(isReactivation) });
  renderClientHealthWidget();
  renderPerfSnapshotRow();
  renderLeadTrend($('#lineChartWrap'), dashTrendDays);
  renderPipelineSnapshot();

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
    el.innerHTML = `<span class="status-dot"></span> Your schedule is clear today.`;
  } else {
    el.classList.add(urgentCount > 0 ? 'attention' : '');
    el.innerHTML = `<span class="status-dot"></span> You have ${attentionCount} item${attentionCount === 1 ? '' : 's'} that need${attentionCount === 1 ? 's' : ''} your attention today.`;
  }
}

function animateValue(el, target, isMoney) {
  const prev = Number(el.dataset.raw || 0);
  el.dataset.raw = target;
  if (prev === target) { el.textContent = isMoney ? fmtMoney(target) : target; return; }
  const duration = 400, start = performance_now(), from = prev;
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

function showToast(message) {
  const stack = $('#toastStack');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="toast-dot"></span>${escapeHtml(message)}`;
  stack.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 200); }, 2600);
}

/* ================= Today's Focus (actionable feed) ================= */
function renderFocusFeed({ overdueContacts, todayAppts, tasksToday, billingDue, newLeads, reactivation }) {
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
  newLeads.forEach(c => items.push({ priority: 'info', icon: '🟢', name: c.name, context: 'New lead', meta: 'last 3 days', action: 'View', onClick: () => openModal(c) }));
  reactivation.forEach(c => items.push({ priority: 'info', icon: '✨', name: c.name, context: 'Ready for reactivation', meta: 'gone quiet', action: 'View', onClick: () => openModal(c) }));

  const order = { urgent: 0, attention: 1, info: 2 };
  items.sort((a, b) => order[a.priority] - order[b.priority]);
  const shown = items.slice(0, 8);

  const feed = $('#focusGrid');
  if (!shown.length) {
    feed.innerHTML = `<div class="focus-empty"><div class="fe-icon">✨</div><div class="fe-title">You're all caught up.</div><p style="margin:0;font-size:12px;">Nothing needs your attention right now.</p></div>`;
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
  `).join('');
  feed.querySelectorAll('.focus-row').forEach((row, i) => {
    row.addEventListener('click', () => shown[i].onClick());
  });
}
function initFocusViewAll() {
  $('#focusViewAll').addEventListener('click', () => goToView('followups'));
}

/* ================= Client Health widget ================= */
function renderClientHealthWidget() {
  const counts = { healthy: 0, attention: 0, risk: 0 };
  contacts.forEach(c => counts[computeHealth(c)]++);
  const el = $('#clientHealthWidget');
  el.innerHTML = Object.keys(HEALTH_META).map(key => `
    <div class="health-row" data-key="${key}">
      <span>${HEALTH_META[key].icon} ${HEALTH_META[key].label}</span>
      <span class="hr-count">${counts[key]}</span>
    </div>
  `).join('');
  el.querySelectorAll('.health-row').forEach(row => {
    row.addEventListener('click', () => {
      const key = row.dataset.key;
      contactsFilter = { label: HEALTH_META[key].label, predicate: (c) => computeHealth(c) === key };
      goToView('contacts');
    });
  });
  const insight = $('#clientHealthInsight');
  if (insight) {
    const needsAttention = counts.attention + counts.risk;
    insight.textContent = contacts.length === 0 ? '' : needsAttention > 0 ? `${needsAttention} contact${needsAttention === 1 ? '' : 's'} may need attention.` : 'All contacts are healthy.';
  }
}

/* ---- Performance Snapshot (dashboard summary, fixed 30-day window) ---- */
function renderPerfSnapshotRow() {
  const now = new Date(); now.setHours(23, 59, 59, 999);
  const start = new Date(now); start.setDate(start.getDate() - 29); start.setHours(0, 0, 0, 0);
  const bounds = { start, end: now };
  const prevBounds = { start: new Date(start.getTime() - 30 * DAY), end: new Date(start.getTime() - 1) };

  const leadsNow = contacts.filter(c => inRange(c.createdAt, bounds)).length;
  const leadsPrev = contacts.filter(c => inRange(c.createdAt, prevBounds)).length;
  const meetingsNow = contacts.filter(c => inRange(c.createdAt, bounds) && FUNNEL_ORDER.indexOf(c.stage) >= FUNNEL_ORDER.indexOf('held')).length;
  const meetingsPrev = contacts.filter(c => inRange(c.createdAt, prevBounds) && FUNNEL_ORDER.indexOf(c.stage) >= FUNNEL_ORDER.indexOf('held')).length;
  const clientsNow = contacts.filter(c => c.stage === 'client' && inRange(c.lastActivity, bounds)).length;
  const clientsPrev = contacts.filter(c => c.stage === 'client' && inRange(c.lastActivity, prevBounds)).length;
  const rateNow = leadsNow ? (clientsNow / leadsNow) * 100 : 0;
  const ratePrev = leadsPrev ? (clientsPrev / leadsPrev) * 100 : 0;

  const items = [
    { label: 'New Leads', value: leadsNow, delta: pctChangeLabel(leadsNow, leadsPrev) },
    { label: 'Meetings', value: meetingsNow, delta: pctChangeLabel(meetingsNow, meetingsPrev) },
    { label: 'Clients', value: clientsNow, delta: pctChangeLabel(clientsNow, clientsPrev) },
    { label: 'Conversion Rate', value: rateNow.toFixed(1) + '%', delta: ratePrev > 0 ? pctChangeLabel(rateNow, ratePrev) : { text: 'This period', positive: null } },
  ];
  $('#perfSnapshotRow').innerHTML = items.map(it => `
    <div class="perf-snapshot-item">
      <div class="perf-snapshot-label">${it.label}</div>
      <div class="perf-snapshot-value">${it.value}</div>
      <div class="perf-snapshot-delta ${it.delta.positive === false ? 'negative' : it.delta.positive === true ? 'positive' : 'neutral'}">${it.delta.text}</div>
    </div>
  `).join('');
}

/* ---- Pipeline Snapshot (dashboard summary, lighter than the Analytics funnel) ---- */
function renderPipelineSnapshot() {
  const el = $('#pipelineSnapshot');
  if (!contacts.length) { el.innerHTML = emptyStateHtml('No pipeline data yet', 'Your pipeline will appear here as leads progress.'); return; }
  const counts = STAGES.filter(s => s.key !== 'lost').map(s => ({ stage: s, count: contacts.filter(c => c.stage === s.key).length }));
  const max = Math.max(1, ...counts.map(c => c.count));
  el.innerHTML = counts.map(({ stage, count }) => `
    <div class="pipeline-snap-row" data-stage="${stage.key}">
      <span class="pipeline-snap-label"><span class="dot" style="background:${stage.color}"></span>${stage.label}</span>
      <div class="pipeline-snap-track"><div class="pipeline-snap-fill" style="width:${Math.max(count ? 8 : 0, Math.round((count / max) * 100))}%;background:${stage.color}"></div></div>
      <span class="pipeline-snap-count">${count}</span>
    </div>
  `).join('');
  el.querySelectorAll('.pipeline-snap-row').forEach(row => {
    row.addEventListener('click', () => {
      contactsFilter = { label: STAGES.find(s => s.key === row.dataset.stage).label, predicate: (c) => c.stage === row.dataset.stage };
      goToView('contacts');
    });
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
  container.innerHTML = `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMinYMid meet">
      <defs><linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6C5CE7" stop-opacity="0.18"/><stop offset="100%" stop-color="#6C5CE7" stop-opacity="0"/>
      </linearGradient></defs>
      <path d="${areaD}" fill="url(#lineFill)" stroke="none"></path>
      <path d="${pathD}" fill="none" stroke="#6C5CE7" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>
      ${coords.map((c, i) => `
        <circle class="line-chart-point" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5"><title>${escapeHtml(c.label)}: ${mode === 'value' ? fmtMoney(c.value) : c.value}</title></circle>
        ${i % showEvery === 0 ? `<text class="line-chart-label" x="${c.x.toFixed(1)}" y="${h - 8}" text-anchor="middle">${escapeHtml(c.label)}</text>` : ''}
      `).join('')}
    </svg>
  `;
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
function renderBoard() {
  const board = $('#board');
  board.innerHTML = '';
  const list = filteredContacts();
  STAGES.forEach(stage => {
    const items = list.filter(c => c.stage === stage.key);
    const total = items.reduce((s, c) => s + (Number(c.value) || 0), 0);
    const col = document.createElement('div');
    col.className = 'column';
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
      <div><div class="card-name">${escapeHtml(c.name)}</div><div class="card-service">${escapeHtml(c.service || 'General inquiry')}</div></div>
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
  card.addEventListener('click', () => openModal(c));
  return card;
}

/* ================= CONTACTS ================= */
function contactChipPredicate(c) {
  if (contactChip === 'leads') return isActive(c);
  if (contactChip === 'clients') return c.stage === 'client';
  if (contactChip === 'active') return c.stage !== 'lost';
  if (contactChip === 'inactive') return c.stage === 'lost';
  return true;
}
function renderTable() {
  const body = $('#contactsTableBody');
  const list = filteredContacts().filter(contactChipPredicate);
  body.innerHTML = '';
  $('#contactsEmpty').innerHTML = list.length ? '' : emptyStateHtml('No contacts found', 'Try clearing your search or filters.');
  list.forEach(c => {
    const stage = stageOf(c);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div class="name-cell"><div class="avatar">${initials(c.name)}</div>${escapeHtml(c.name)}</div></td>
      <td>${escapeHtml(c.company || '—')}</td>
      <td>${escapeHtml(c.email || '—')}</td>
      <td>${escapeHtml(c.phone || '—')}</td>
      <td><span class="status-badge" style="background:${stage.color}1a;color:${stage.color}"><span class="dot" style="background:${stage.color}"></span>${stage.label}</span></td>
      <td>${healthBadgeHtml(c)}</td>
      <td>${c.value ? fmtMoney(c.value) : '—'}</td>
      <td><button class="row-link">View</button></td>
    `;
    tr.addEventListener('click', () => openModal(c));
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
}

/* ================= APPOINTMENTS ================= */
function renderAppointments() {
  const list = baseFiltered().filter(c => c.bookingDate);
  const today = list.filter(c => c.bookingDate === todayStr());
  const upcoming = list.filter(c => daysUntil(c.bookingDate) > 0).sort((a, b) => a.bookingDate.localeCompare(b.bookingDate));
  const completed = list.filter(c => daysUntil(c.bookingDate) < 0 || c.stage === 'client');
  const groups = [['Today', today], ['Upcoming', upcoming], ['Completed', completed]];
  const el = $('#appointmentsContent');
  if (!list.length) { el.innerHTML = emptyStateHtml('No appointments yet', 'Booked meetings from your automation will appear here.'); return; }
  el.innerHTML = groups.map(([label, items]) => {
    if (!items.length) return '';
    return `<div class="group-heading">${label} <span style="opacity:.6">(${items.length})</span></div><div class="action-list">${items.map(appointmentRow).join('')}</div>`;
  }).join('');
  bindActionRows(el);
}
function appointmentRow(c) {
  const stage = stageOf(c);
  return `
    <div class="action-item" data-id="${c.id}">
      <div class="avatar">${initials(c.name)}</div>
      <div class="action-main">
        <div class="action-title">${escapeHtml(c.name)}</div>
        <div class="action-sub">${escapeHtml(c.service || 'General inquiry')} · ${escapeHtml(c.bookingDate || '')} ${escapeHtml(c.bookingTime || '')}</div>
      </div>
      <span class="status-badge" style="background:${stage.color}1a;color:${stage.color}">${stage.label}</span>
      <div class="action-main" style="flex:0 0 auto;text-align:right;"><div class="card-value">${c.value ? fmtMoney(c.value) : ''}</div></div>
    </div>
  `;
}

/* ================= CALENDAR ================= */
function calendarEventsForDay(dateStr) {
  const events = [];
  contacts.filter(c => c.bookingDate === dateStr).forEach(c => events.push({ type: 'appointment', label: `${c.name} · ${c.bookingTime || 'Appointment'}`, color: '#6C5CE7', contact: c }));
  tasks.filter(t => t.dueDate === dateStr && t.status !== 'done').forEach(t => events.push({ type: 'task', label: `Task: ${t.title}`, color: '#43B883', task: t }));
  invoices.filter(i => i.dueDate === dateStr && invoiceEffectiveStatus(i) !== 'Paid').forEach(i => events.push({ type: 'invoice', label: `Invoice ${i.invoiceNumber} due`, color: '#F4B942', invoice: i }));
  return events;
}
function allUpcomingEvents() {
  const out = [];
  contacts.filter(c => c.bookingDate && daysUntil(c.bookingDate) >= 0).forEach(c => out.push({ date: c.bookingDate, time: c.bookingTime, label: c.name, sub: 'Appointment', contact: c }));
  tasks.filter(t => t.status !== 'done' && t.dueDate && daysUntil(t.dueDate) >= 0).forEach(t => out.push({ date: t.dueDate, time: '', label: t.title, sub: 'Task due', task: t }));
  invoices.filter(i => invoiceEffectiveStatus(i) !== 'Paid' && i.dueDate && daysUntil(i.dueDate) >= 0).forEach(i => out.push({ date: i.dueDate, time: '', label: `Invoice ${i.invoiceNumber}`, sub: 'Payment due', invoice: i }));
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
}
function renderCalendar() {
  const year = calendarMonth.getFullYear(), month = calendarMonth.getMonth();
  $('#calMonthLabel').textContent = calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dows = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let html = dows.map(d => `<div class="calendar-dow">${d}</div>`).join('');
  for (let i = 0; i < startOffset; i++) html += `<div class="calendar-day empty"></div>`;
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const events = calendarEventsForDay(dateStr);
    const isToday = dateStr === todayStr();
    html += `
      <div class="calendar-day ${isToday ? 'today' : ''}" data-date="${dateStr}" title="${events.map(e => e.label).join(', ')}">
        <span>${day}</span>
        ${events.length ? `<div class="cal-dots">${events.slice(0, 3).map(e => `<span class="cal-dot" style="background:${e.color}"></span>`).join('')}</div>` : ''}
      </div>
    `;
  }
  $('#calendarGrid').innerHTML = html;
  $('#calendarGrid').querySelectorAll('.calendar-day[data-date]').forEach(el => {
    el.addEventListener('click', () => {
      const c = contacts.find(x => x.bookingDate === el.dataset.date);
      if (c) openModal(c);
    });
  });

  const upcoming = allUpcomingEvents();
  const upcomingList = $('#upcomingList');
  if (!upcoming.length) { upcomingList.innerHTML = emptyStateHtml('Nothing on the calendar', 'Appointments, task due dates, and invoice due dates will show up here.'); return; }
  upcomingList.innerHTML = upcoming.map(e => {
    const dayLabel = e.date === todayStr() ? 'Today' : daysUntil(e.date) === 1 ? 'Tomorrow' : fmtDateShort(e.date);
    return `
      <div class="mini-row" ${e.contact ? `data-id="${e.contact.id}"` : ''}>
        <div class="avatar">${e.contact ? initials(e.contact.name) : (e.sub === 'Task due' ? '✓' : '💰')}</div>
        <div><div class="mini-name">${escapeHtml(e.label)}</div><div class="mini-meta">${dayLabel}${e.time ? ' · ' + escapeHtml(e.time) : ''} · ${e.sub}</div></div>
      </div>
    `;
  }).join('');
  upcomingList.querySelectorAll('.mini-row[data-id]').forEach(row => {
    row.addEventListener('click', () => { const c = contacts.find(x => x.id === row.dataset.id); if (c) openModal(c); });
  });
}
function initCalendarNav() {
  $('#calPrev').addEventListener('click', () => { calendarMonth.setMonth(calendarMonth.getMonth() - 1); renderCalendar(); });
  $('#calNext').addEventListener('click', () => { calendarMonth.setMonth(calendarMonth.getMonth() + 1); renderCalendar(); });
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
function renderTasksPage() {
  populateTaskContactSelect();
  const list = taskChip === 'all' ? tasks : tasks.filter(t => taskBucket(t) === taskChip);
  const el = $('#tasksContent');
  if (!list.length) { el.innerHTML = emptyStateHtml('No tasks yet', 'Add a task above to keep track of client work.'); return; }
  const sorted = [...list].sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  el.innerHTML = sorted.map(taskRow).join('');
  el.querySelectorAll('.task-check').forEach(box => box.addEventListener('click', () => toggleTask(box.dataset.id, box.dataset.done === 'true' ? 'open' : 'done')));
  el.querySelectorAll('.task-delete').forEach(btn => btn.addEventListener('click', () => deleteTask(btn.dataset.id)));
  el.querySelectorAll('.task-client-link').forEach(link => link.addEventListener('click', (e) => { e.stopPropagation(); const c = contacts.find(x => x.id === link.dataset.id); if (c) openModal(c); }));
}
function taskRow(t) {
  const done = t.status === 'done';
  const contact = contacts.find(c => c.id === t.contactId);
  const overdue = !done && t.dueDate && daysUntil(t.dueDate) < 0;
  return `
    <div class="task-row ${done ? 'done' : ''}">
      <button class="task-check ${done ? 'checked' : ''}" data-id="${t.id}" data-done="${done}">${done ? '✓' : ''}</button>
      <div style="flex:1;min-width:0;">
        <div class="task-title">${escapeHtml(t.title)}</div>
        <div class="task-meta">${contact ? `<a href="#" class="task-client-link" data-id="${contact.id}">${escapeHtml(contact.name)}</a> · ` : ''}${t.dueDate ? (overdue ? `<span style="color:var(--error);font-weight:700;">${fmtDateShort(t.dueDate)} (overdue)</span>` : fmtDateShort(t.dueDate)) : 'No due date'}</div>
      </div>
      <span class="task-priority ${t.priority}">${t.priority}</span>
      <button class="btn btn-ghost btn-sm task-delete" data-id="${t.id}">Delete</button>
    </div>
  `;
}
function initTaskForm() {
  $('#taskForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const title = $('#taskTitle').value.trim();
    if (!title) return;
    createTask(title, $('#taskDue').value, $('#taskContact').value, $('#taskPriority').value);
    $('#taskTitle').value = ''; $('#taskDue').value = ''; $('#taskContact').value = '';
  });
  document.querySelectorAll('#taskFilters .filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#taskFilters .filter-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      taskChip = chip.dataset.filter;
      renderTasksPage();
    });
  });
}

/* ================= FOLLOW-UPS ================= */
function renderFollowups() {
  const list = baseFiltered();
  const overdue = list.filter(c => followupBucket(c) === 'overdue');
  const today = list.filter(c => followupBucket(c) === 'today');
  const upcoming = list.filter(c => followupBucket(c) === 'upcoming');
  const completed = list.filter(c => followupBucket(c) === 'completed');
  const el = $('#followupsContent');
  if (!list.length) { el.innerHTML = emptyStateHtml('No follow-ups yet', "You're all caught up. New follow-up tasks will appear here."); return; }
  const groups = [['Overdue', overdue, true], ['Today', today, false], ['Upcoming', upcoming, false], ['Completed', completed, false]];
  el.innerHTML = groups.map(([label, items, urgent]) => {
    if (!items.length) return '';
    return `<div class="group-heading">${urgent ? '🔴 ' : ''}${label} <span style="opacity:.6">(${items.length})</span></div><div class="action-list">${items.map(c => followupRow(c, urgent)).join('')}</div>`;
  }).join('');
  bindActionRows(el);
}
function followupRow(c, urgent) {
  const overdueDays = Math.floor((Date.now() - new Date(c.lastActivity || c.createdAt).getTime()) / DAY);
  const sub = c.nextFollowUp
    ? (daysUntil(c.nextFollowUp) < 0 ? `${Math.abs(daysUntil(c.nextFollowUp))} days overdue` : daysUntil(c.nextFollowUp) === 0 ? 'Today' : `in ${daysUntil(c.nextFollowUp)} days`)
    : (urgent ? `${overdueDays} days since last activity` : escapeHtml(c.notes ? c.notes.slice(0, 60) : 'No notes yet'));
  return `
    <div class="action-item" data-id="${c.id}">
      <div class="avatar">${initials(c.name)}</div>
      <div class="action-main"><div class="action-title">${escapeHtml(c.name)}</div><div class="action-sub">Follow up about ${escapeHtml(c.service || 'their inquiry')} · ${sub}</div></div>
      <div class="action-buttons">
        ${c.phone ? `<a class="btn btn-secondary btn-sm" href="tel:${escapeHtml(c.phone)}" onclick="event.stopPropagation()">Call</a>` : ''}
        ${c.email ? `<a class="btn btn-secondary btn-sm" href="mailto:${escapeHtml(c.email)}" onclick="event.stopPropagation()">Message</a>` : ''}
        <button class="btn btn-secondary btn-sm complete-followup" data-id="${c.id}" onclick="event.stopPropagation()">Complete</button>
      </div>
    </div>
  `;
}
function bindActionRows(container) {
  container.querySelectorAll('.action-item').forEach(row => {
    row.addEventListener('click', () => { const c = contacts.find(x => x.id === row.dataset.id); if (c) openModal(c); });
  });
  container.querySelectorAll('.complete-followup').forEach(btn => {
    btn.addEventListener('click', () => updateContact(btn.dataset.id, { nextFollowUp: '', lastContactedAt: todayStr() }));
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
  $('#billOutstanding').textContent = fmtMoney(outstanding);
  $('#billPaid').textContent = fmtMoney(paidThisMonth);
  $('#billOverdue').textContent = fmtMoney(overdue);
  $('#billUpcoming').textContent = fmtMoney(upcoming);

  const body = $('#invoicesTableBody');
  body.innerHTML = '';
  $('#invoicesEmpty').innerHTML = invoices.length ? '' : emptyStateHtml('No invoices have been created yet', 'Create your first invoice to start tracking billing.');
  [...invoices].sort((a, b) => (b.issueDate || '').localeCompare(a.issueDate || '')).forEach(inv => {
    const contact = contacts.find(c => c.id === inv.contactId);
    const status = invoiceEffectiveStatus(inv);
    const statusColor = { Draft: '#858197', Pending: '#F4B942', Paid: '#43B883', Overdue: '#E05A6D' }[status];
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
    if (contact) tr.addEventListener('click', (e) => { if (e.target === tr || e.target.closest('td') === tr.firstElementChild) openModal(contact); });
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
          <tr class="exec-clickable-row" data-stage="${r.stage.key}">
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
      contactsFilter = { label: STAGES.find(s => s.key === row.dataset.stage).label, predicate: (c) => c.stage === row.dataset.stage };
      goToView('contacts');
    });
  });
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
  container.innerHTML = buckets.map(b => `
    <div class="aging-row ${b.warn ? 'warn' : ''}" data-min="${b.min}" data-max="${b.max === Infinity ? '' : b.max}">
      <span class="aging-label">${b.label}</span>
      <div class="aging-track"><div class="aging-fill" style="width:${Math.max(6, Math.round((b.count / max) * 100))}%"></div></div>
      <span class="aging-count">${b.count}</span>
    </div>
  `).join('');
  container.querySelectorAll('.aging-row').forEach(row => {
    row.addEventListener('click', () => {
      const min = Number(row.dataset.min), max = row.dataset.max ? Number(row.dataset.max) : Infinity;
      contactsFilter = {
        label: row.querySelector('.aging-label').textContent,
        predicate: (c) => {
          if (!isActive(c)) return false;
          const days = Math.floor((Date.now() - new Date(c.lastActivity || c.createdAt).getTime()) / DAY);
          return days >= min && days <= max;
        }
      };
      goToView('contacts');
    });
  });
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
    row.addEventListener('click', () => { const c = contacts.find(x => x.id === row.dataset.id); if (c) openModal(c); });
  });
}

/* ---- Lead source performance ---- */
function renderSourceTable(container) {
  const withSource = contacts.filter(c => c.source);
  if (!withSource.length) {
    container.innerHTML = `
      ${emptyStateHtml('Lead source tracking isn\'t available yet', 'Add a Lead Source when creating or editing a contact, and this section will populate automatically.')}
      <button class="btn btn-secondary btn-sm" id="anAddSourceBtn" style="margin:0 auto;display:block;">Add lead source to a contact</button>
    `;
    const btn = $('#anAddSourceBtn');
    if (btn) btn.addEventListener('click', () => { if (contacts[0]) openModal(contacts[0]); });
    return;
  }
  const sources = {};
  withSource.forEach(c => {
    sources[c.source] = sources[c.source] || { leads: 0, meetings: 0, clients: 0, value: 0 };
    sources[c.source].leads++;
    if (FUNNEL_ORDER.indexOf(c.stage) >= FUNNEL_ORDER.indexOf('held')) sources[c.source].meetings++;
    if (c.stage === 'client') sources[c.source].clients++;
    if (isActive(c)) sources[c.source].value += Number(c.value) || 0;
  });
  container.innerHTML = `
    <table class="exec-table">
      <thead><tr><th>Source</th><th style="text-align:right;">Leads</th><th style="text-align:right;">Meetings</th><th style="text-align:right;">Clients</th><th style="text-align:right;">Conversion</th><th style="text-align:right;">Pipeline Value</th></tr></thead>
      <tbody>
        ${Object.entries(sources).sort((a, b) => b[1].leads - a[1].leads).map(([name, s]) => `
          <tr>
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
}

/* ---- Performance by period (weekly) ---- */
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
  container.innerHTML = `
    <table class="exec-table">
      <thead><tr><th>Period</th><th style="text-align:right;">New Leads</th><th style="text-align:right;">Meetings</th><th style="text-align:right;">Proposals</th><th style="text-align:right;">Clients</th><th style="text-align:right;">Pipeline Added</th></tr></thead>
      <tbody>
        ${weeks.map((w, i) => {
          const wb = { start: w.start, end: w.end };
          const created = contacts.filter(c => inRange(c.createdAt, wb));
          const meetings = contacts.filter(c => inRange(c.lastActivity, wb) && FUNNEL_ORDER.indexOf(c.stage) >= FUNNEL_ORDER.indexOf('held'));
          const proposals = contacts.filter(c => c.stage === 'proposal' && inRange(c.lastActivity, wb));
          const clients = contacts.filter(c => c.stage === 'client' && inRange(c.lastActivity, wb));
          const valueAdded = created.reduce((s, c) => s + (Number(c.value) || 0), 0);
          return `
            <tr>
              <td>${w.start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${w.end.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</td>
              <td style="text-align:right;">${created.length}</td>
              <td style="text-align:right;">${meetings.length}</td>
              <td style="text-align:right;">${proposals.length}</td>
              <td style="text-align:right;">${clients.length}</td>
              <td style="text-align:right;">${fmtMoney(valueAdded)}</td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
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
        <div class="profile-sub">${escapeHtml(c.company || c.service || 'Contact')} · <span class="status-badge" style="background:${stage.color}1a;color:${stage.color}">${stage.label}</span></div>
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
      </div>
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
  $('#fSource').value = contact ? (contact.source || '') : '';
  $('#fEmail').value = contact ? contact.email : '';
  $('#fPhone').value = contact ? contact.phone : '';
  $('#fService').value = contact ? (contact.service || '') : '';
  $('#fValue').value = contact ? contact.value : '';
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
  $('#addContactBtn').addEventListener('click', () => openModal(null));
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
      source: $('#fSource').value,
      email: $('#fEmail').value,
      phone: $('#fPhone').value,
      service: $('#fService').value,
      bookingDate: $('#fDate').value,
      bookingTime: $('#fTime').value,
      meetingLink: $('#fLink').value,
      value: $('#fValue').value,
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
  billing: ['Billing', 'Track invoices and outstanding balances.'],
  documents: ['Documents', 'Centralize client contracts, proposals, and files.'],
  projects: ['Projects', 'Lightweight project tracking, connected to your clients.'],
  automations: ['Automations', 'How bookings flow into this CRM.'],
  analytics: ['Analytics', 'Understand how your leads, pipeline, and client activity are performing.'],
  settings: ['API / Settings', 'Connect your booking automation to this CRM.'],
};
const VIEW_SECTION_IDS = {
  dashboard: 'dashboardView', pipeline: 'pipelineView', contacts: 'contactsView', appointments: 'appointmentsView', calendar: 'calendarView',
  tasks: 'tasksView', followups: 'followupsView', billing: 'billingView', documents: 'documentsView',
  projects: 'projectsView', automations: 'automationsView', analytics: 'analyticsView', settings: 'settingsView',
};

function goToView(view) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const meta = VIEW_META[view];
  $('#viewTitle').textContent = meta[0];
  $('#viewSubtitle').textContent = contactsFilter && view === 'contacts' ? `Filtered: ${contactsFilter.label}` : meta[1];
  document.getElementById(VIEW_SECTION_IDS[view]).classList.remove('hidden');
  closeSidebar();
  render();
}
function initNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.view !== 'contacts') contactsFilter = null;
      goToView(btn.dataset.view);
    });
  });
}
function initSearch() { $('#searchInput').addEventListener('input', (e) => { searchTerm = e.target.value; render(); }); }
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

/* ================= Kai assistant (UI only — no AI backend wired up) ================= */
function openKai() { $('#kaiPanel').classList.remove('hidden'); }
function closeKai() { $('#kaiPanel').classList.add('hidden'); }
function toggleKai() { $('#kaiPanel').classList.toggle('hidden'); }
function kaiRespond(question) {
  const body = $('#kaiBody');
  const userMsg = document.createElement('div'); userMsg.className = 'kai-msg user'; userMsg.textContent = question;
  body.appendChild(userMsg);
  const reply = document.createElement('div'); reply.className = 'kai-msg';
  reply.textContent = "Kai isn't connected to live data yet — this is a preview of the assistant experience. Once wired up, I'll answer this from your real pipeline, tasks, and billing.";
  body.appendChild(reply);
  body.scrollTop = body.scrollHeight;
}
function initKai() {
  $('#kaiFab').addEventListener('click', toggleKai);
  $('#kaiCardOpen').addEventListener('click', openKai);
  $('#kaiClose').addEventListener('click', closeKai);
  document.querySelectorAll('.kai-suggestion').forEach(btn => btn.addEventListener('click', () => kaiRespond(btn.textContent)));
  $('#kaiSend').addEventListener('click', () => {
    const input = $('#kaiInput');
    if (!input.value.trim()) return;
    kaiRespond(input.value.trim());
    input.value = '';
  });
  $('#kaiInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#kaiSend').click(); });
}
function initDashTrendToggle() {
  document.querySelectorAll('#dashTrendToggle .an-toggle-btn').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.days) === dashTrendDays);
    btn.addEventListener('click', () => {
      dashTrendDays = Number(btn.dataset.days);
      document.querySelectorAll('#dashTrendToggle .an-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderLeadTrend($('#lineChartWrap'), dashTrendDays);
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
}

initModal();
initNav();
initDashTrendToggle();
initDashboardKpiLinks();
initSearch();
initWebhookUrl();
initGreeting();
initMobileNav();
initKai();
initContactFilters();
initCalendarNav();
initTaskForm();
initBilling();
initDocuments();
initProjects();
initQuickActionsBar();
initAnalyticsControls();
initFocusViewAll();
loadContacts();
loadTasks();
loadInvoices();
loadProjects();
loadDocuments();
setInterval(() => { loadContacts(); loadTasks(); loadInvoices(); loadProjects(); loadDocuments(); }, 15000);
