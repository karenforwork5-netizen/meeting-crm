const STAGES = [
  { key: 'new', label: 'New Booking', color: '#6366f1' },
  { key: 'confirmed', label: 'Confirmed', color: '#0ea5e9' },
  { key: 'held', label: 'Meeting Held', color: '#8b5cf6' },
  { key: 'proposal', label: 'Proposal Sent', color: '#f59e0b' },
  { key: 'client', label: 'Client', color: '#10b981' },
  { key: 'lost', label: 'Lost', color: '#9ca3af' },
];

let contacts = [];
let searchTerm = '';
let currentView = 'pipeline';

const $ = (sel) => document.querySelector(sel);

async function loadContacts() {
  const res = await fetch('/api/contacts');
  contacts = await res.json();
  render();
}

function filteredContacts() {
  if (!searchTerm) return contacts;
  const t = searchTerm.toLowerCase();
  return contacts.filter(c =>
    (c.name || '').toLowerCase().includes(t) ||
    (c.email || '').toLowerCase().includes(t) ||
    (c.service || '').toLowerCase().includes(t)
  );
}

function initials(name) {
  return (name || '?').split(' ').filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('');
}

function fmtMoney(n) {
  return '$' + (Number(n) || 0).toLocaleString();
}

function render() {
  renderStats();
  if (currentView === 'pipeline') renderBoard();
  if (currentView === 'contacts') renderTable();
}

function renderStats() {
  const total = contacts.length;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const newThisWeek = contacts.filter(c => new Date(c.createdAt).getTime() >= weekAgo).length;
  const clients = contacts.filter(c => c.stage === 'client').length;
  const pipelineValue = contacts.filter(c => !['client', 'lost'].includes(c.stage)).reduce((s, c) => s + (Number(c.value) || 0), 0);
  $('#statTotal').textContent = total;
  $('#statNew').textContent = newThisWeek;
  $('#statClients').textContent = clients;
  $('#statValue').textContent = fmtMoney(pipelineValue);
}

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

function renderCard(c) {
  const card = document.createElement('div');
  card.className = 'card';
  card.draggable = true;
  card.dataset.id = c.id;
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
  `;
  card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', c.id);
    card.classList.add('dragging');
  });
  card.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('click', () => openModal(c));
  return card;
}

function renderTable() {
  const body = $('#contactsTableBody');
  body.innerHTML = '';
  filteredContacts().forEach(c => {
    const stage = STAGES.find(s => s.key === c.stage) || STAGES[0];
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.email || '—')}</td>
      <td>${escapeHtml(c.phone || '—')}</td>
      <td>${escapeHtml(c.service || '—')}</td>
      <td>${escapeHtml(c.bookingDate || '—')} ${escapeHtml(c.bookingTime || '')}</td>
      <td><span class="badge" style="background:${stage.color}22;color:${stage.color}">${stage.label}</span></td>
      <td>${c.value ? fmtMoney(c.value) : '—'}</td>
      <td><button class="row-link">Edit</button></td>
    `;
    tr.addEventListener('click', () => openModal(c));
    body.appendChild(tr);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

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

// Modal
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

function initNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
      const titles = {
        pipeline: ['Pipeline', "Everyone who's booked a meeting with you, staged by where they are."],
        contacts: ['Contacts', 'Every booking, in one searchable list.'],
        settings: ['API / Settings', 'Connect your booking automation to this CRM.'],
      };
      $('#viewTitle').textContent = titles[currentView][0];
      $('#viewSubtitle').textContent = titles[currentView][1];
      if (currentView === 'pipeline') $('#pipelineView').classList.remove('hidden');
      if (currentView === 'contacts') $('#contactsView').classList.remove('hidden');
      if (currentView === 'settings') $('#settingsView').classList.remove('hidden');
      render();
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
  $('#webhookUrl').textContent = `POST ${window.location.origin}/api/webhook/booking`;
}

initModal();
initNav();
initSearch();
initWebhookUrl();
loadContacts();
setInterval(loadContacts, 15000);
