const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 4000;
const DB_PATH = path.join(__dirname, 'data', 'contacts.json');
const TASKS_PATH = path.join(__dirname, 'data', 'tasks.json');
const INVOICES_PATH = path.join(__dirname, 'data', 'invoices.json');
const PROJECTS_PATH = path.join(__dirname, 'data', 'projects.json');
const DOCUMENTS_PATH = path.join(__dirname, 'data', 'documents.json');
const UPLOADS_DIR = path.join(__dirname, 'data', 'uploads');
const STAGES = ['new', 'confirmed', 'held', 'proposal', 'client', 'lost'];
const TASK_PRIORITIES = ['High', 'Medium', 'Low'];
const INVOICE_STATUSES = ['Draft', 'Pending', 'Paid', 'Overdue'];
const PROJECT_STATUSES = ['Planning', 'In Progress', 'On Hold', 'Completed', 'Cancelled'];
const DOCUMENT_TYPES = ['Contract', 'Proposal', 'Invoice', 'Estimate', 'Agreement', 'Attachment', 'Other'];
const LEAD_SOURCES = ['LinkedIn', 'OnlineJobs.ph', 'Upwork', 'Referral', 'Website', 'Facebook', 'Direct', 'Other'];
const SOURCE_STATUSES = ['New', 'Contacted', 'Responded', 'Qualified', 'Meeting Scheduled', 'Won', 'Lost'];
const SOURCE_TYPES = ['manual', 'api', 'import', 'integration'];
const BILLING_TYPES = ['Not Set', 'Hourly', 'Fixed Project', 'Retainer', 'Commission'];

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

// Generic JSON-file store helpers, used for the new Client Operations resources
function makeStore(filePath) {
  function ensure() {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify([], null, 2));
  }
  return {
    read: () => { ensure(); return JSON.parse(fs.readFileSync(filePath, 'utf-8')); },
    write: (items) => fs.writeFileSync(filePath, JSON.stringify(items, null, 2)),
  };
}
const tasksStore = makeStore(TASKS_PATH);
const invoicesStore = makeStore(INVOICES_PATH);
const projectsStore = makeStore(PROJECTS_PATH);
const documentsStore = makeStore(DOCUMENTS_PATH);

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}-${file.originalname}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});
app.use('/uploads', express.static(UPLOADS_DIR));

/* ---------------- Contacts (existing routes, unchanged behavior) ---------------- */
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
    hourlyRate: body.hourlyRate !== undefined && body.hourlyRate !== '' ? Number(body.hourlyRate) : null,
    billingType: BILLING_TYPES.includes(body.billingType) ? body.billingType : 'Not Set',
    stage: STAGES.includes(body.stage) ? body.stage : 'new',
    company: body.company || '',
    leadSource: LEAD_SOURCES.includes(body.leadSource) ? body.leadSource : '',
    sourceUrl: body.sourceUrl || '',
    opportunity: body.opportunity || '',
    dateReceived: body.dateReceived || '',
    sourceStatus: SOURCE_STATUSES.includes(body.sourceStatus) ? body.sourceStatus : 'New',
    sourceType: SOURCE_TYPES.includes(body.sourceType) ? body.sourceType : 'manual',
    tags: Array.isArray(body.tags) ? body.tags : [],
    nextFollowUp: body.nextFollowUp || '',
    lastContactedAt: body.lastContactedAt || '',
    healthOverride: body.healthOverride || '',
    createdAt: now,
    lastActivity: now
  };
  const contacts = readContacts();
  contacts.unshift(contact);
  writeContacts(contacts);
  res.status(201).json(contact);
});

// Ingest endpoint for n8n / Zapier / Make booking automations (unchanged)
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

/* ---------------- Tasks ---------------- */
app.get('/api/tasks', (req, res) => res.json(tasksStore.read()));
app.post('/api/tasks', (req, res) => {
  const body = req.body || {};
  if (!body.title) return res.status(400).json({ error: 'title is required' });
  const now = new Date().toISOString();
  const task = {
    id: crypto.randomUUID(),
    title: body.title,
    contactId: body.contactId || '',
    projectId: body.projectId || '',
    dueDate: body.dueDate || '',
    priority: TASK_PRIORITIES.includes(body.priority) ? body.priority : 'Medium',
    status: 'open',
    createdAt: now,
    completedAt: '',
  };
  const tasks = tasksStore.read();
  tasks.unshift(task);
  tasksStore.write(tasks);
  res.status(201).json(task);
});
app.patch('/api/tasks/:id', (req, res) => {
  const tasks = tasksStore.read();
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const updates = { ...req.body };
  if (updates.status === 'done' && tasks[idx].status !== 'done') updates.completedAt = new Date().toISOString();
  if (updates.status === 'open') updates.completedAt = '';
  tasks[idx] = { ...tasks[idx], ...updates };
  tasksStore.write(tasks);
  res.json(tasks[idx]);
});
app.delete('/api/tasks/:id', (req, res) => {
  const tasks = tasksStore.read();
  tasksStore.write(tasks.filter(t => t.id !== req.params.id));
  res.json({ ok: true });
});

/* ---------------- Invoices (billing tracker — not a payment processor) ---------------- */
app.get('/api/invoices', (req, res) => res.json(invoicesStore.read()));
app.post('/api/invoices', (req, res) => {
  const body = req.body || {};
  if (!body.contactId || !body.amount) return res.status(400).json({ error: 'contactId and amount are required' });
  const now = new Date().toISOString();
  const invoices = invoicesStore.read();
  const invoice = {
    id: crypto.randomUUID(),
    contactId: body.contactId,
    invoiceNumber: body.invoiceNumber || `INV-${String(invoices.length + 1).padStart(3, '0')}`,
    amount: Number(body.amount) || 0,
    issueDate: body.issueDate || now.slice(0, 10),
    dueDate: body.dueDate || '',
    status: INVOICE_STATUSES.includes(body.status) ? body.status : 'Pending',
    createdAt: now,
  };
  invoices.unshift(invoice);
  invoicesStore.write(invoices);
  res.status(201).json(invoice);
});
app.patch('/api/invoices/:id', (req, res) => {
  const invoices = invoicesStore.read();
  const idx = invoices.findIndex(i => i.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const updates = req.body || {};
  if (updates.status && !INVOICE_STATUSES.includes(updates.status)) return res.status(400).json({ error: 'invalid status' });
  invoices[idx] = { ...invoices[idx], ...updates };
  invoicesStore.write(invoices);
  res.json(invoices[idx]);
});
app.delete('/api/invoices/:id', (req, res) => {
  const invoices = invoicesStore.read();
  invoicesStore.write(invoices.filter(i => i.id !== req.params.id));
  res.json({ ok: true });
});

/* ---------------- Projects ---------------- */
app.get('/api/projects', (req, res) => res.json(projectsStore.read()));
app.post('/api/projects', (req, res) => {
  const body = req.body || {};
  if (!body.name) return res.status(400).json({ error: 'name is required' });
  const now = new Date().toISOString();
  const project = {
    id: crypto.randomUUID(),
    name: body.name,
    contactId: body.contactId || '',
    status: PROJECT_STATUSES.includes(body.status) ? body.status : 'Planning',
    dueDate: body.dueDate || '',
    notes: body.notes || '',
    createdAt: now,
  };
  const projects = projectsStore.read();
  projects.unshift(project);
  projectsStore.write(projects);
  res.status(201).json(project);
});
app.patch('/api/projects/:id', (req, res) => {
  const projects = projectsStore.read();
  const idx = projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const updates = req.body || {};
  if (updates.status && !PROJECT_STATUSES.includes(updates.status)) return res.status(400).json({ error: 'invalid status' });
  projects[idx] = { ...projects[idx], ...updates };
  projectsStore.write(projects);
  res.json(projects[idx]);
});
app.delete('/api/projects/:id', (req, res) => {
  const projects = projectsStore.read();
  projectsStore.write(projects.filter(p => p.id !== req.params.id));
  res.json({ ok: true });
});

/* ---------------- Documents (real file upload via multer, no fake storage) ---------------- */
app.get('/api/documents', (req, res) => res.json(documentsStore.read()));
app.post('/api/documents', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file is required' });
  const body = req.body || {};
  const now = new Date().toISOString();
  const doc = {
    id: crypto.randomUUID(),
    name: body.name || req.file.originalname,
    contactId: body.contactId || '',
    type: DOCUMENT_TYPES.includes(body.type) ? body.type : 'Other',
    filename: req.file.filename,
    size: req.file.size,
    uploadedAt: now,
  };
  const docs = documentsStore.read();
  docs.unshift(doc);
  documentsStore.write(docs);
  res.status(201).json(doc);
});
app.delete('/api/documents/:id', (req, res) => {
  const docs = documentsStore.read();
  const doc = docs.find(d => d.id === req.params.id);
  if (doc) {
    const filePath = path.join(UPLOADS_DIR, doc.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  documentsStore.write(docs.filter(d => d.id !== req.params.id));
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Meeting CRM running at http://localhost:${PORT}`);
});
