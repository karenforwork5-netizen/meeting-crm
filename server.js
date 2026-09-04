const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 4000;
const DB_PATH = path.join(__dirname, 'data', 'contacts.json');
const STAGES = ['new', 'confirmed', 'held', 'proposal', 'client', 'lost'];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify(seedData(), null, 2));
}

function seedData() {
  const now = new Date().toISOString();
  return [
    {
      id: crypto.randomUUID(), name: 'Jordan Reyes', email: 'jordan.reyes@example.com', phone: '+1 415 555 0143',
      service: 'Appointment Setting', bookingDate: '2026-09-05', bookingTime: '10:00 AM', meetingLink: 'https://meet.google.com/abc-defg-hij',
      notes: 'Wants a walkthrough of the booking-to-CRM flow.', value: 400, stage: 'new', createdAt: now, lastActivity: now
    },
    {
      id: crypto.randomUUID(), name: 'Priya Nair', email: 'priya.nair@example.com', phone: '+1 212 555 0192',
      service: 'CRM Management', bookingDate: '2026-09-03', bookingTime: '2:30 PM', meetingLink: 'https://meet.google.com/klm-nopq-rst',
      notes: 'Second call scheduled after a good first chat.', value: 900, stage: 'confirmed', createdAt: now, lastActivity: now
    },
    {
      id: crypto.randomUUID(), name: 'Marcus Chen', email: 'marcus.chen@example.com', phone: '+1 646 555 0110',
      service: 'Lead Follow-Up', bookingDate: '2026-08-29', bookingTime: '9:00 AM', meetingLink: 'https://meet.google.com/uvw-xyza-bcd',
      notes: 'Held the intro call, sending a recap.', value: 650, stage: 'held', createdAt: now, lastActivity: now
    },
    {
      id: crypto.randomUUID(), name: 'Ava Thompson', email: 'ava.thompson@example.com', phone: '+1 305 555 0177',
      service: 'Customer Support', bookingDate: '2026-08-27', bookingTime: '4:00 PM', meetingLink: 'https://meet.google.com/efg-hijk-lmn',
      notes: 'Proposal sent, awaiting sign-off.', value: 1200, stage: 'proposal', createdAt: now, lastActivity: now
    },
    {
      id: crypto.randomUUID(), name: 'Liam O’Connor', email: 'liam.oconnor@example.com', phone: '+1 617 555 0166',
      service: 'CRM Management', bookingDate: '2026-08-20', bookingTime: '11:30 AM', meetingLink: 'https://meet.google.com/opq-rstu-vwx',
      notes: 'Signed on as a retainer client.', value: 1500, stage: 'client', createdAt: now, lastActivity: now
    }
  ];
}

function readContacts() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeContacts(contacts) {
  fs.writeFileSync(DB_PATH, JSON.stringify(contacts, null, 2));
}

app.get('/api/contacts', (req, res) => {
  res.json(readContacts());
});

app.post('/api/contacts', (req, res) => {
  const body = req.body || {};
  if (!body.name) return res.status(400).json({ error: 'name is required' });
  const now = new Date().toISOString();
  const contact = {
    id: crypto.randomUUID(),
    name: body.name,
    email: body.email || '',
    phone: body.phone || '',
    service: body.service || '',
    bookingDate: body.bookingDate || body.date || '',
    bookingTime: body.bookingTime || body.time || '',
    meetingLink: body.meetingLink || '',
    notes: body.notes || '',
    value: Number(body.value) || 0,
    stage: STAGES.includes(body.stage) ? body.stage : 'new',
    createdAt: now,
    lastActivity: now
  };
  const contacts = readContacts();
  contacts.unshift(contact);
  writeContacts(contacts);
  res.status(201).json(contact);
});

// Ingest endpoint for n8n / Zapier / Make booking automations
app.post('/api/webhook/booking', (req, res) => {
  const body = req.body || {};
  const now = new Date().toISOString();
  const contact = {
    id: crypto.randomUUID(),
    name: body.name || body.Name || 'Unknown',
    email: body.email || body.Email || '',
    phone: body.phone || body.Phone || '',
    service: body.service || body.Service || '',
    bookingDate: body.bookingDate || body.date || body.Date || '',
    bookingTime: body.bookingTime || body.time || body.Time || '',
    meetingLink: body.meetingLink || body.MeetingLink || '',
    notes: body.notes || body.Notes || '',
    value: Number(body.value) || 0,
    stage: 'new',
    createdAt: now,
    lastActivity: now
  };
  const contacts = readContacts();
  contacts.unshift(contact);
  writeContacts(contacts);
  res.status(201).json(contact);
});

app.patch('/api/contacts/:id', (req, res) => {
  const contacts = readContacts();
  const idx = contacts.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const updates = req.body || {};
  if (updates.stage && !STAGES.includes(updates.stage)) {
    return res.status(400).json({ error: 'invalid stage' });
  }
  contacts[idx] = { ...contacts[idx], ...updates, lastActivity: new Date().toISOString() };
  writeContacts(contacts);
  res.json(contacts[idx]);
});

app.delete('/api/contacts/:id', (req, res) => {
  const contacts = readContacts();
  const next = contacts.filter(c => c.id !== req.params.id);
  writeContacts(next);
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Meeting CRM running at http://localhost:${PORT}`);
});
