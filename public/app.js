const STAGES = [
  { key: 'new', label: 'New Lead', color: '#6C5CE7' },
  { key: 'confirmed', label: 'Contacted', color: '#8C7FEA' },
  { key: 'held', label: 'Meeting Held', color: '#40356B' },
  { key: 'proposal', label: 'Proposal Sent', color: '#F4B942' },
  { key: 'client', label: 'Client', color: '#43B883' },
  { key: 'lost', label: 'Lost', color: '#E05A6D' },
];
const DAY = 24 * 60 * 60 * 1000;
const OVERDUE_DAYS = 3;

let contacts = [];
let searchTerm = '';
let currentView = 'dashboard';
let contactsFilter = null; // { label, predicate } set when jumping in from Dashboard
let dashboardMetric = 'leads'; // 'leads' | 'value'

const $ = (sel) => document.querySelector(sel);
const todayStr = () => new Date().toISOString().slice(0, 10);

async function loadContacts() {
  const res = await fetch('/api/contacts');
  contacts = await res.json();
  render();
}

function baseFiltered() {
  if (!searchTerm) return contacts;
  const t = searchTerm.toLowerCase();
  return contacts.filter(c =>
    (c.name || '').toLowerCase().includes(t) ||
    (c.email || '').toLowerCase().includes(t) ||
    (c.service || '').toLowerCase().includes(t)
  );
}

function filteredContacts() {
  const base = baseFiltered();
  return contactsFilter ? base.filter(contactsFilter.predicate) : base;
}

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('');
}

function fmtMoney(n) {
  return '$' + (Number(n) || 0).toLocaleString();
}

function fmtRelative(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return Math.round((d.getTime() - new Date(todayStr() + 'T00:00:00').getTime()) / DAY);
}

// Derived data helpers — everything below reads only real fields already on each contact
function isActive(c) { return !['client', 'lost'].includes(c.stage); }
function isOverdue(c) { return isActive(c) && (Date.now() - new Date(c.lastActivity || c.createdAt).getTime()) > OVERDUE_DAYS * DAY; }
function isTodayAppointment(c) { return c.bookingDate === todayStr(); }
function isNewLead(c) { return (Date.now() - new Date(c.createdAt).getTime()) <= 3 * DAY; }
function isReactivation(c) { return c.stage === 'lost'; }

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

function stageOf(c) { return STAGES.find(s => s.key === c.stage) || STAGES[0]; }

function render() {
  if (currentView === 'dashboard') renderDashboard();
  if (currentView === 'pipeline') renderBoard();
  if (currentView === 'contacts') renderTable();
  if (currentView === 'appointments') renderAppointments();
  if (currentView === 'followups') renderFollowups();
  if (currentView === 'analytics') renderAnalytics();
}

/* ---------------- Dashboard ---------------- */
function renderDashboard() {
  const weekAgo = Date.now() - 7 * DAY;
  const appts = contacts.filter(c => c.bookingDate);
  const apptsThisWeek = appts.filter(c => new Date(c.createdAt).getTime() >= weekAgo).length;
  const leadsThisWeek = contacts.filter(c => new Date(c.createdAt).getTime() >= weekAgo).length;
  const followups = contacts.filter(isActive);
  const overdue = followups.filter(isOverdue);
  const pipelineValue = contacts.filter(isActive).reduce((s, c) => s + (Number(c.value) || 0), 0);
  const wonValue = contacts.filter(c => c.stage === 'client').reduce((s, c) => s + (Number(c.value) || 0), 0);

  $('#kpiAppointments').textContent = appts.length;
  $('#kpiAppointmentsDelta').textContent = apptsThisWeek ? `+${apptsThisWeek} this week` : 'No new bookings this week';
  $('#kpiLeads').textContent = contacts.length;
  $('#kpiLeadsDelta').textContent = leadsThisWeek ? `+${leadsThisWeek} this week` : 'No new leads this week';
  $('#kpiFollowups').textContent = followups.length;
  $('#kpiFollowupsDelta').textContent = overdue.length ? `${overdue.length} overdue` : 'All caught up';
  $('#kpiValue').textContent = fmtMoney(pipelineValue);
  $('#kpiValueDelta').textContent = wonValue ? `${fmtMoney(wonValue)} won` : 'No won deals yet';

  const focusItems = [
    { key: 'overdue', title: '🔴 Overdue Follow-Ups', list: contacts.filter(isOverdue), sub: 'need attention', view: 'followups' },
    { key: 'today', title: '🟡 Today\'s Appointments', list: contacts.filter(isTodayAppointment), sub: 'scheduled today', view: 'appointments' },
    { key: 'newLeads', title: '🟢 New Leads', list: contacts.filter(isNewLead), sub: 'last 3 days', view: 'contacts' },
    { key: 'reactivation', title: '✨ Ready for Reactivation', list: contacts.filter(isReactivation), sub: 'gone quiet', view: 'contacts' },
  ];
  const grid = $('#focusGrid');
  grid.innerHTML = focusItems.map(f => `
    <button class="focus-card" data-focus="${f.key}">
      <div class="focus-title">${f.title}</div>
      <div class="focus-count">${f.list.length}</div>
      <div class="focus-sub">${f.sub}</div>
    </button>
  `).join('');
  grid.querySelectorAll('.focus-card').forEach((btn, i) => {
    btn.addEventListener('click', () => {
      const f = focusItems[i];
      contactsFilter = { label: f.title.replace(/^[^\s]+\s/, ''), predicate: (c) => f.list.includes(c) };
      goToView(f.view);
    });
  });

  const series = buildDailySeries(14, dashboardMetric);
  renderLineChart($('#lineChartWrap'), series, dashboardMetric);
  $('#chartSubtitle').textContent = dashboardMetric === 'value'
    ? 'Cumulative pipeline value, last 14 days.'
    : 'New leads per day, last 14 days.';
  renderFunnel($('#funnelWrap'));

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
        <div class="mini-right">
          <span class="status-badge" style="background:${stageOf(c).color}1a;color:${stageOf(c).color}">${escapeHtml(stageOf(c).label)}</span>
        </div>
      </div>
    `).join('');
    recentList.querySelectorAll('.mini-row').forEach(row => {
      row.addEventListener('click', () => {
        const c = contacts.find(x => x.id === row.dataset.id);
        if (c) openModal(c);
      });
    });
  }
}

function emptyStateHtml(title, text, icon) {
  return `
    <div class="empty-state">
      <div class="empty-icon">${icon || '<svg viewBox="0 0 24 24"><path d="M9 11l3 3 8-8"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>'}</div>
      <h4>${escapeHtml(title)}</h4>
      <p>${escapeHtml(text)}</p>
    </div>
  `;
}

/* ---------------- Line chart (built from real createdAt/value data) ---------------- */
function buildDailySeries(days, mode) {
  const points = [];
  const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const createdThatDay = contacts.filter(c => (c.createdAt || '').slice(0, 10) === key);
    let value;
    if (mode === 'value') {
      const createdUpTo = contacts.filter(c => (c.createdAt || '').slice(0, 10) <= key);
      value = createdUpTo.reduce((s, c) => s + (Number(c.value) || 0), 0);
    } else {
      value = createdThatDay.length;
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
      <defs>
        <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#6C5CE7" stop-opacity="0.18"/>
          <stop offset="100%" stop-color="#6C5CE7" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="${areaD}" fill="url(#lineFill)" stroke="none"></path>
      <path d="${pathD}" fill="none" stroke="#6C5CE7" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"></path>
      ${coords.map((c, i) => `
        <circle class="line-chart-point" cx="${c.x.toFixed(1)}" cy="${c.y.toFixed(1)}" r="3.5"><title>${escapeHtml(c.label)}: ${mode === 'value' ? fmtMoney(c.value) : c.value}</title></circle>
        ${i % showEvery === 0 ? `<text class="line-chart-label" x="${c.x.toFixed(1)}" y="${h - 8}" text-anchor="middle">${escapeHtml(c.label)}</text>` : ''}
      `).join('')}
    </svg>
  `;
}

/* ---------------- Funnel (cumulative reach through the pipeline, real stage data) ---------------- */
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
            <div class="funnel-bar-track">
              <div class="funnel-bar-fill" style="width:${Math.max(pct, count ? 10 : 0)}%;background:${stage.color}">
                <span>${count}</span>
              </div>
            </div>
          </div>
        `;
      }).join('')}
      ${lost.length ? `<div class="funnel-lost-note">● ${lost.length} lead${lost.length === 1 ? '' : 's'} marked Lost along the way (excluded above)</div>` : ''}
    </div>
  `;
}

/* ---------------- Pipeline (Kanban) ---------------- */
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
      e.preventDefault();
      cardsEl.classList.remove('drag-over');
      const id = e.dataTransfer.getData('text/plain');
      await updateContact(id, { stage: stage.key });
    });

    board.appendChild(col);
  });
}

function nextActionText(c) {
  if (isOverdue(c)) return 'Follow-up overdue';
  if (isTodayAppointment(c)) return 'Appointment today';
  return null;
}

function renderCard(c) {
  const card = document.createElement('div');
  card.className = 'card';
  card.draggable = true;
  card.dataset.id = c.id;
  const na = nextActionText(c);
  card.innerHTML = `
    <div class="card-top">
      <div class="avatar">${initials(c.name)}</div>
      <div>
        <div class="card-name">${escapeHtml(c.name)}</div>
        <div class="card-service">${escapeHtml(c.service || 'General inquiry')}</div>
      </div>
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
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', c.id);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('click', () => openModal(c));
  return card;
}

/* ---------------- Contacts table ---------------- */
function renderTable() {
  const body = $('#contactsTableBody');
  const list = filteredContacts();
  body.innerHTML = '';
  $('#contactsEmpty').innerHTML = list.length ? '' : emptyStateHtml('No contacts found', 'Try clearing your search or filters.');
  list.forEach(c => {
    const stage = stageOf(c);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><div class="name-cell"><div class="avatar">${initials(c.name)}</div>${escapeHtml(c.name)}</div></td>
      <td>${escapeHtml(c.email || '—')}</td>
      <td>${escapeHtml(c.phone || '—')}</td>
      <td>${escapeHtml(c.service || '—')}</td>
      <td>${escapeHtml(c.bookingDate || '—')} ${escapeHtml(c.bookingTime || '')}</td>
      <td><span class="status-badge" style="background:${stage.color}1a;color:${stage.color}"><span class="dot" style="background:${stage.color}"></span>${stage.label}</span></td>
      <td>${c.value ? fmtMoney(c.value) : '—'}</td>
      <td><button class="row-link">Edit</button></td>
    `;
    tr.addEventListener('click', () => openModal(c));
    body.appendChild(tr);
  });
}

/* ---------------- Appointments ---------------- */
function renderAppointments() {
  const list = baseFiltered().filter(c => c.bookingDate);
  const today = list.filter(c => c.bookingDate === todayStr());
  const upcoming = list.filter(c => daysUntil(c.bookingDate) > 0).sort((a, b) => a.bookingDate.localeCompare(b.bookingDate));
  const completed = list.filter(c => daysUntil(c.bookingDate) < 0 || c.stage === 'client');

  const groups = [
    ['Today', today], ['Upcoming', upcoming], ['Completed', completed],
  ];
  const el = $('#appointmentsContent');
  if (!list.length) {
    el.innerHTML = emptyStateHtml('No appointments yet', 'Booked meetings from your automation will appear here.');
    return;
  }
  el.innerHTML = groups.map(([label, items]) => {
    if (!items.length) return '';
    return `<div class="group-heading">${label} <span style="opacity:.6">(${items.length})</span></div>
      <div class="action-list">${items.map(c => appointmentRow(c)).join('')}</div>`;
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
      <div class="action-main" style="flex:0 0 auto;text-align:right;">
        <div class="card-value">${c.value ? fmtMoney(c.value) : ''}</div>
      </div>
    </div>
  `;
}

/* ---------------- Follow-ups ---------------- */
function renderFollowups() {
  const list = baseFiltered();
  const overdue = list.filter(isOverdue);
  const today = list.filter(c => isActive(c) && isTodayAppointment(c) && !isOverdue(c));
  const upcoming = list.filter(c => isActive(c) && !isOverdue(c) && !isTodayAppointment(c));
  const completed = list.filter(c => !isActive(c));

  const el = $('#followupsContent');
  if (!list.length) {
    el.innerHTML = emptyStateHtml('No follow-ups yet', "You're all caught up. New follow-up tasks will appear here.");
    return;
  }
  const groups = [
    ['Overdue', overdue, true], ['Today', today, false], ['Upcoming', upcoming, false], ['Completed', completed, false],
  ];
  el.innerHTML = groups.map(([label, items, urgent]) => {
    if (!items.length) return '';
    return `<div class="group-heading">${urgent ? '🔴 ' : ''}${label} <span style="opacity:.6">(${items.length})</span></div>
      <div class="action-list">${items.map(c => followupRow(c, urgent)).join('')}</div>`;
  }).join('');
  bindActionRows(el);
}

function followupRow(c, urgent) {
  const overdueDays = Math.floor((Date.now() - new Date(c.lastActivity || c.createdAt).getTime()) / DAY);
  return `
    <div class="action-item" data-id="${c.id}">
      <div class="avatar">${initials(c.name)}</div>
      <div class="action-main">
        <div class="action-title">${escapeHtml(c.name)}</div>
        <div class="action-sub">${urgent ? `${overdueDays} days since last activity` : escapeHtml(c.notes ? c.notes.slice(0, 60) : 'No notes yet')}</div>
      </div>
      <div class="action-buttons">
        ${c.phone ? `<a class="btn btn-secondary btn-sm" href="tel:${escapeHtml(c.phone)}" onclick="event.stopPropagation()">Call</a>` : ''}
        ${c.email ? `<a class="btn btn-secondary btn-sm" href="mailto:${escapeHtml(c.email)}" onclick="event.stopPropagation()">Email</a>` : ''}
      </div>
    </div>
  `;
}

function bindActionRows(container) {
  container.querySelectorAll('.action-item').forEach(row => {
    row.addEventListener('click', () => {
      const c = contacts.find(x => x.id === row.dataset.id);
      if (c) openModal(c);
    });
  });
}

/* ---------------- Analytics ---------------- */
function renderAnalytics() {
  const total = contacts.length;
  const won = contacts.filter(c => c.stage === 'client').length;
  $('#anTotal').textContent = total;
  $('#anWon').textContent = won;
  $('#anRate').textContent = total ? Math.round((won / total) * 100) + '%' : '0%';

  const stageChart = $('#stageChart');
  const maxStage = Math.max(1, ...STAGES.map(s => contacts.filter(c => c.stage === s.key).length));
  stageChart.innerHTML = STAGES.map(s => {
    const count = contacts.filter(c => c.stage === s.key).length;
    const pct = Math.round((count / maxStage) * 100);
    return `<div class="bar-row"><span class="bar-label">${s.label}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${s.color}"></div></div><span class="bar-value">${count}</span></div>`;
  }).join('');

  const services = {};
  contacts.forEach(c => { const s = c.service || 'Unspecified'; services[s] = (services[s] || 0) + 1; });
  const serviceEntries = Object.entries(services).sort((a, b) => b[1] - a[1]);
  const maxService = Math.max(1, ...serviceEntries.map(e => e[1]));
  const serviceChart = $('#serviceChart');
  serviceChart.innerHTML = serviceEntries.length ? serviceEntries.map(([label, count]) => {
    const pct = Math.round((count / maxService) * 100);
    return `<div class="bar-row"><span class="bar-label">${escapeHtml(label)}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><span class="bar-value">${count}</span></div>`;
  }).join('') : emptyStateHtml('No data yet', 'Analytics will populate as contacts come in.');
}

/* ---------------- CRUD ---------------- */
async function updateContact(id, updates) {
  const res = await fetch(`/api/contacts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  });
  const updated = await res.json();
  const idx = contacts.findIndex(c => c.id === id);
  if (idx !== -1) contacts[idx] = updated;
  render();
}

async function createContact(payload) {
  const res = await fetch('/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const created = await res.json();
  contacts.unshift(created);
  render();
}

async function deleteContact(id) {
  await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
  contacts = contacts.filter(c => c.id !== id);
  render();
}

/* ---------------- Modal ---------------- */
function buildTimeline(c) {
  const events = [];
  events.push({ date: c.createdAt, text: 'Lead created' });
  if (c.bookingDate) events.push({ date: c.createdAt, text: `Appointment booked for ${c.bookingDate}${c.bookingTime ? ' at ' + c.bookingTime : ''}` });
  if (c.lastActivity && c.lastActivity !== c.createdAt) events.push({ date: c.lastActivity, text: `Moved to "${stageOf(c).label}"` });
  if (c.notes) events.push({ date: c.lastActivity || c.createdAt, text: `Note: ${c.notes}` });
  return events
    .filter(e => e.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(e => `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div>
          <div class="timeline-date">${new Date(e.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
          <div class="timeline-text">${escapeHtml(e.text)}</div>
        </div>
      </div>
    `).join('');
}

function openModal(contact) {
  $('#modalTitle').textContent = contact ? 'Edit Contact' : 'Add Contact';
  $('#contactId').value = contact ? contact.id : '';
  $('#fName').value = contact ? contact.name : '';
  $('#fEmail').value = contact ? contact.email : '';
  $('#fPhone').value = contact ? contact.phone : '';
  $('#fService').value = contact ? (contact.service || '') : '';
  $('#fDate').value = contact ? contact.bookingDate : '';
  $('#fTime').value = contact ? contact.bookingTime : '';
  $('#fLink').value = contact ? contact.meetingLink : '';
  $('#fValue').value = contact ? contact.value : '';
  $('#fNotes').value = contact ? contact.notes : '';
  $('#fStage').value = contact ? contact.stage : 'new';
  $('#deleteBtn').classList.toggle('hidden', !contact);

  const sidePanel = $('#contactSidePanel');
  const modalBody = $('#modalBody');
  if (contact) {
    modalBody.classList.remove('no-timeline');
    sidePanel.classList.remove('hidden');
    $('#quickActions').innerHTML = `
      ${contact.phone ? `<a class="btn btn-secondary btn-sm" href="tel:${escapeHtml(contact.phone)}">Call</a>` : ''}
      ${contact.phone ? `<a class="btn btn-secondary btn-sm" href="sms:${escapeHtml(contact.phone)}">SMS</a>` : ''}
      ${contact.email ? `<a class="btn btn-secondary btn-sm" href="mailto:${escapeHtml(contact.email)}">Email</a>` : ''}
    `;
    $('#contactTimeline').innerHTML = buildTimeline(contact);
  } else {
    modalBody.classList.add('no-timeline');
    sidePanel.classList.add('hidden');
  }

  $('#modalOverlay').classList.remove('hidden');
}

function closeModal() {
  $('#modalOverlay').classList.add('hidden');
}

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
      email: $('#fEmail').value,
      phone: $('#fPhone').value,
      service: $('#fService').value,
      bookingDate: $('#fDate').value,
      bookingTime: $('#fTime').value,
      meetingLink: $('#fLink').value,
      value: $('#fValue').value,
      notes: $('#fNotes').value,
      stage: $('#fStage').value,
    };
    if (id) await updateContact(id, payload);
    else await createContact(payload);
    closeModal();
  });

  $('#deleteBtn').addEventListener('click', async () => {
    const id = $('#contactId').value;
    if (id) await deleteContact(id);
    closeModal();
  });
}

/* ---------------- Navigation ---------------- */
const VIEW_META = {
  dashboard: ['Dashboard', "Here's what's happening with your pipeline today."],
  pipeline: ['Pipeline', 'Manage your leads and move opportunities forward.'],
  contacts: ['Contacts', 'Every booking, in one searchable list.'],
  appointments: ['Appointments', 'Everything booked on your calendar.'],
  followups: ['Follow-Ups', 'Stay on top of every lead that needs a nudge.'],
  automations: ['Automations', 'How bookings flow into this CRM.'],
  analytics: ['Analytics', 'How your pipeline is performing.'],
  settings: ['API / Settings', 'Connect your booking automation to this CRM.'],
};

function goToView(view) {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  currentView = view;
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  const meta = VIEW_META[view];
  $('#viewTitle').textContent = meta[0];
  $('#viewSubtitle').textContent = contactsFilter && view === 'contacts' ? `Filtered: ${contactsFilter.label}` : meta[1];
  const idMap = { dashboard: 'dashboardView', pipeline: 'pipelineView', contacts: 'contactsView', appointments: 'appointmentsView', followups: 'followupsView', automations: 'automationsView', analytics: 'analyticsView', settings: 'settingsView' };
  document.getElementById(idMap[view]).classList.remove('hidden');
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

function initSearch() {
  $('#searchInput').addEventListener('input', (e) => {
    searchTerm = e.target.value;
    render();
  });
}

function initWebhookUrl() {
  const url = `POST ${window.location.origin}/api/webhook/booking`;
  $('#webhookUrl').textContent = url;
  const w2 = $('#webhookUrl2');
  if (w2) w2.textContent = url;
  const ls = $('#lastSynced');
  if (ls) ls.textContent = new Date().toLocaleTimeString();
}

function initGreeting() {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  $('#greetingText').textContent = `Good ${part}, Karen 👋`;
}

/* ---------------- Mobile sidebar ---------------- */
function openSidebar() {
  $('#sidebar').classList.add('open');
  $('#sidebarOverlay').classList.add('open');
}
function closeSidebar() {
  $('#sidebar').classList.remove('open');
  $('#sidebarOverlay').classList.remove('open');
}
function initMobileNav() {
  $('#menuBtn').addEventListener('click', openSidebar);
  $('#sidebarOverlay').addEventListener('click', closeSidebar);
}

/* ---------------- Kai assistant (UI only — no AI backend wired up) ---------------- */
function openKai() { $('#kaiPanel').classList.remove('hidden'); }
function closeKai() { $('#kaiPanel').classList.add('hidden'); }
function toggleKai() { $('#kaiPanel').classList.toggle('hidden'); }

function kaiRespond(question) {
  const body = $('#kaiBody');
  const userMsg = document.createElement('div');
  userMsg.className = 'kai-msg user';
  userMsg.textContent = question;
  body.appendChild(userMsg);

  const reply = document.createElement('div');
  reply.className = 'kai-msg';
  reply.textContent = "Kai isn't connected to live data yet — this is a preview of the assistant experience. Once wired up, I'll answer this from your real pipeline.";
  body.appendChild(reply);
  body.scrollTop = body.scrollHeight;
}

function initKai() {
  $('#kaiFab').addEventListener('click', toggleKai);
  $('#kaiCardOpen').addEventListener('click', openKai);
  $('#kaiClose').addEventListener('click', closeKai);
  document.querySelectorAll('.kai-suggestion').forEach(btn => {
    btn.addEventListener('click', () => kaiRespond(btn.textContent));
  });
  $('#kaiSend').addEventListener('click', () => {
    const input = $('#kaiInput');
    if (!input.value.trim()) return;
    kaiRespond(input.value.trim());
    input.value = '';
  });
  $('#kaiInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#kaiSend').click();
  });
}

function initChartToggle() {
  document.querySelectorAll('.chart-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.chart-toggle-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      dashboardMetric = btn.dataset.metric;
      renderDashboard();
    });
  });
}

initModal();
initNav();
initChartToggle();
initSearch();
initWebhookUrl();
initGreeting();
initMobileNav();
initKai();
loadContacts();
setInterval(loadContacts, 15000);
