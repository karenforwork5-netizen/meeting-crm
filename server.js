const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const jobFinderService = require('./jobFinderService');

// Minimal, dependency-free .env loader — keeps Google search credentials out
// of source control and out of any frontend code. Never overwrites a var
// already set in the real environment (e.g. by the OS or a process manager).
(function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (!match) return;
    const key = match[1];
    let value = match[2] || '';
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  });
})();

const app = express();
const PORT = process.env.PORT || 4000;
const DB_PATH = path.join(__dirname, 'data', 'contacts.json');
const TASKS_PATH = path.join(__dirname, 'data', 'tasks.json');
const INVOICES_PATH = path.join(__dirname, 'data', 'invoices.json');
const PROJECTS_PATH = path.join(__dirname, 'data', 'projects.json');
const DOCUMENTS_PATH = path.join(__dirname, 'data', 'documents.json');
const JOBS_PATH = path.join(__dirname, 'data', 'jobs.json');
const JOB_PROFILE_PATH = path.join(__dirname, 'data', 'jobProfile.json');
const JOB_FINDER_KEYWORDS_PATH = path.join(__dirname, 'data', 'jobFinderKeywords.json');
const JOB_FINDER_HISTORY_PATH = path.join(__dirname, 'data', 'jobFinderHistory.json');
const AUTOMATIONS_PATH = path.join(__dirname, 'data', 'automations.json');
const AUTOMATION_RUNS_PATH = path.join(__dirname, 'data', 'automationRuns.json');
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
const JOB_SOURCES = ['OnlineJobs.ph', 'LinkedIn', 'Indeed', 'Upwork', 'Referral', 'Website', 'Direct', 'Other'];
const JOB_EMPLOYMENT_TYPES = ['Full-Time', 'Part-Time', 'Contract', 'Freelance', 'Temporary', 'Other'];
const JOB_STATUSES = ['Saved', 'Reviewing', 'Ready to Apply', 'Applied', 'Follow-Up', 'Interview', 'Rejected', 'Hired'];
const CREATED_BY_VALUES = ['manual', 'api', 'import', 'integration', 'automation'];
const AUTOMATION_STATUSES = ['active', 'paused'];
const AUTOMATION_RUN_STATUSES = ['running', 'success', 'failed', 'skipped'];
// Automation types with real execution logic behind them. An automation
// record with any other/missing `type` can be saved (as a template/config)
// but will honestly fail — never silently no-op — if something ever tries
// to execute it.
const AUTOMATION_TYPES = ['new_lead_followup', 'appointment_reminder'];

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Fire-and-forget notification to the n8n "Appointment Reminder" workflow's
// webhook trigger. Never awaited by a contact route — a slow/offline/erroring
// n8n must never delay or fail a CRM contact save. The URL lives only in
// process.env (set via .env locally / Railway variables in production),
// never hardcoded and never logged.
async function postToN8nAppointmentWebhook(payload) {
  const url = process.env.N8N_APPOINTMENT_WEBHOOK_URL;
  if (!url) {
    console.warn('[n8n] N8N_APPOINTMENT_WEBHOOK_URL is not set — skipping appointment webhook.');
    return;
  }
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.warn('[n8n] Appointment webhook failed:', error.message);
  }
}

// A fresh/empty contacts store starts genuinely empty — no fabricated demo
// contacts are ever auto-inserted. The real CRM has never needed synthetic
// leads to function; an empty list is the honest starting state.
function ensureDb() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify([], null, 2));
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
const jobsStore = makeStore(JOBS_PATH);
const jobFinderKeywordsStore = makeStore(JOB_FINDER_KEYWORDS_PATH);
const jobFinderHistoryStore = makeStore(JOB_FINDER_HISTORY_PATH);
const automationsStore = makeStore(AUTOMATIONS_PATH);
const automationRunsStore = makeStore(AUTOMATION_RUNS_PATH);
// Job Finder history (including each entry's stored results) grows without
// bound otherwise. Capping at the store's own write path — rather than in
// each individual route — means every writer (the real search route, the
// one-time migration import route, anything added later) is capped the same
// way automatically, with no separate storage mechanism. Newest-first
// ordering is already how entries are inserted (unshift), so keeping the
// first N after any write keeps the newest N and drops the oldest.
const JOB_FINDER_HISTORY_MAX_ENTRIES = 20;
const _jobFinderHistoryWrite = jobFinderHistoryStore.write.bind(jobFinderHistoryStore);
jobFinderHistoryStore.write = (items) => _jobFinderHistoryWrite(items.slice(0, JOB_FINDER_HISTORY_MAX_ENTRIES));

// Job Profile / CV — a single record (not a list) used as the source of truth
// for future job-matching. No fake profile is ever seeded; every field starts
// empty until the user fills it in via Job Hunt settings.
const JOB_PROFILE_DEFAULTS = {
  fullName: '', professionalTitle: '', summary: '',
  services: [], skills: [], tools: [], crmCapabilities: [],
  workHistory: [], languages: [], education: [],
  preferredRoles: [], preferredEmploymentType: '', preferredSalary: '', workPreferences: '',
  portfolioUrl: '', cvReference: '',
};
function ensureJobProfile() {
  const dir = path.dirname(JOB_PROFILE_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(JOB_PROFILE_PATH)) {
    fs.writeFileSync(JOB_PROFILE_PATH, JSON.stringify({ ...JOB_PROFILE_DEFAULTS, updatedAt: new Date().toISOString() }, null, 2));
  }
}
// Merges in any fields added to the schema since a profile was first created,
// so an older jobProfile.json on disk still gets the new keys without losing data.
function readJobProfile() {
  ensureJobProfile();
  const raw = JSON.parse(fs.readFileSync(JOB_PROFILE_PATH, 'utf-8'));
  return { ...JOB_PROFILE_DEFAULTS, ...raw };
}
function writeJobProfile(profile) { fs.writeFileSync(JOB_PROFILE_PATH, JSON.stringify(profile, null, 2)); }

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
    // Distinct from `sourceType` (which describes how the LEAD was sourced,
    // e.g. LinkedIn/referral) — this records who/what created the CRM RECORD.
    // Existing records predate this field and are left as-is (no field at
    // all), never backfilled with a guessed value.
    createdBy: CREATED_BY_VALUES.includes(body.createdBy) ? body.createdBy : 'manual',
    createdAt: now,
    lastActivity: now
  };
  const contacts = readContacts();
  contacts.unshift(contact);
  writeContacts(contacts);
  if (contact.bookingDate || contact.bookingTime) {
    postToN8nAppointmentWebhook({ appointmentId: contact.id, contactId: contact.id, status: 'scheduled' }).catch(() => {});
  }
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
    createdBy: 'integration',
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
  if (updates.bookingDate !== undefined || updates.bookingTime !== undefined) {
    postToN8nAppointmentWebhook({ appointmentId: contacts[idx].id, contactId: contacts[idx].id, status: 'scheduled' }).catch(() => {});
  }
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

/* ---------------- Job Hunt — job opportunities (manual entry / paste-a-URL only;
   no scraping, no automated login, no browser automation of any job site) ---------------- */
// Phase 2C matching fields. Defaults are merged in lazily (on read) so jobs
// created before matching existed still get these fields without a rewrite.
const JOB_MATCH_DEFAULTS = {
  matchScore: null, matchConfidence: null,
  matchingSkills: [], partialSkills: [], missingSkills: [],
  matchedRequirements: [], partialRequirements: [], missingRequirements: [],
  matchExplanation: '', matchStatus: 'Not analyzed', analyzedAt: null,
  profileMatchSignature: null,
};
// Phase 2D application-preparation fields. applicationQuestions changed shape
// from a free-text string to a structured [{question, answer}] list — safe
// because every existing job had it empty; withJobMatchDefaults coerces any
// leftover non-array value defensively.
const JOB_APPLICATION_DEFAULTS = {
  whyGoodFit: '', applicationQuestions: [],
  applicationPreparedAt: null, applicationLastUpdatedAt: null,
};
function withJobMatchDefaults(job) {
  const merged = { ...JOB_MATCH_DEFAULTS, ...JOB_APPLICATION_DEFAULTS, ...job };
  if (!Array.isArray(merged.applicationQuestions)) merged.applicationQuestions = [];
  return merged;
}

app.get('/api/jobs', (req, res) => res.json(jobsStore.read().map(withJobMatchDefaults)));
app.post('/api/jobs', (req, res) => {
  const body = req.body || {};
  // Company is required by the Add Job form (HTML `required`), but not
  // enforced here — a Job Finder discovery result frequently has no
  // discoverable company name, and it must never be invented just to
  // satisfy this check. The UI already shows "Not provided" for an empty one.
  if (!body.title) return res.status(400).json({ error: 'title is required' });
  if (body.sourceUrl && !/^https?:\/\//i.test(body.sourceUrl)) return res.status(400).json({ error: 'sourceUrl must be a valid http(s) URL' });
  const now = new Date().toISOString();
  const job = {
    id: crypto.randomUUID(),
    title: body.title,
    company: body.company || '',
    source: JOB_SOURCES.includes(body.source) ? body.source : 'Other',
    sourceUrl: body.sourceUrl || '',
    salary: body.salary || '',
    salaryMin: body.salaryMin !== undefined && body.salaryMin !== '' ? Number(body.salaryMin) : null,
    salaryMax: body.salaryMax !== undefined && body.salaryMax !== '' ? Number(body.salaryMax) : null,
    salaryType: body.salaryType || '',
    employmentType: JOB_EMPLOYMENT_TYPES.includes(body.employmentType) ? body.employmentType : 'Other',
    // Additive fields from Job Finder's employment/compensation extraction
    // (Phase 2G) — never invented, so an absent value stays null/"Not specified"
    // rather than being coerced into an existing salary field's shape.
    compensationType: body.compensationType || 'Not specified',
    compensationMin: body.compensationMin !== undefined && body.compensationMin !== null && body.compensationMin !== '' ? Number(body.compensationMin) : null,
    compensationMax: body.compensationMax !== undefined && body.compensationMax !== null && body.compensationMax !== '' ? Number(body.compensationMax) : null,
    compensationCurrency: body.compensationCurrency || null,
    location: body.location || '',
    postedDate: body.postedDate || '',
    dateAdded: now.slice(0, 10),
    description: body.description || '',
    requirements: Array.isArray(body.requirements) ? body.requirements : [],
    skills: Array.isArray(body.skills) ? body.skills : [],
    status: JOB_STATUSES.includes(body.status) ? body.status : 'Saved',
    ...JOB_MATCH_DEFAULTS,
    ...JOB_APPLICATION_DEFAULTS,
    applicationDate: '',
    followUpDate: '',
    interviewDate: '',
    introduction: '',
    applicationDraft: '',
    notes: body.notes || '',
    createdAt: now,
    updatedAt: now,
  };
  const jobs = jobsStore.read();
  jobs.unshift(job);
  jobsStore.write(jobs);
  res.status(201).json(job);
});
app.patch('/api/jobs/:id', (req, res) => {
  const jobs = jobsStore.read();
  const idx = jobs.findIndex(j => j.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const updates = { ...req.body };
  if (updates.status && !JOB_STATUSES.includes(updates.status)) return res.status(400).json({ error: 'invalid status' });
  if (updates.sourceUrl && !/^https?:\/\//i.test(updates.sourceUrl)) return res.status(400).json({ error: 'sourceUrl must be a valid http(s) URL' });
  if (updates.matchScore !== undefined && updates.matchScore !== null) {
    const n = Number(updates.matchScore);
    if (Number.isNaN(n) || n < 0 || n > 100) return res.status(400).json({ error: 'matchScore must be between 0 and 100' });
    updates.matchScore = Math.round(n);
  }
  if (updates.applicationQuestions !== undefined) {
    if (!Array.isArray(updates.applicationQuestions)) return res.status(400).json({ error: 'applicationQuestions must be an array' });
    updates.applicationQuestions = updates.applicationQuestions.map(q => ({
      question: String((q && q.question) || ''),
      answer: String((q && q.answer) || ''),
    }));
  }
  if (updates.status === 'Applied' && jobs[idx].status !== 'Applied' && !updates.applicationDate && !jobs[idx].applicationDate) {
    updates.applicationDate = new Date().toISOString().slice(0, 10);
  }
  jobs[idx] = withJobMatchDefaults({ ...jobs[idx], ...updates, updatedAt: new Date().toISOString() });
  jobsStore.write(jobs);
  res.json(jobs[idx]);
});
app.delete('/api/jobs/:id', (req, res) => {
  const jobs = jobsStore.read();
  jobsStore.write(jobs.filter(j => j.id !== req.params.id));
  res.json({ ok: true });
});

app.get('/api/job-profile', (req, res) => res.json(readJobProfile()));
app.patch('/api/job-profile', (req, res) => {
  const profile = readJobProfile();
  const body = req.body || {};
  const stringFields = ['fullName', 'professionalTitle', 'summary', 'preferredEmploymentType', 'preferredSalary', 'workPreferences', 'portfolioUrl', 'cvReference'];
  const arrayFields = ['services', 'skills', 'tools', 'crmCapabilities', 'workHistory', 'languages', 'education', 'preferredRoles'];
  const updated = { ...profile };
  stringFields.forEach(f => { if (body[f] !== undefined) updated[f] = String(body[f]); });
  arrayFields.forEach(f => { if (Array.isArray(body[f])) updated[f] = body[f]; });
  updated.updatedAt = new Date().toISOString();
  writeJobProfile(updated);
  res.json(updated);
});

/* ---------------- Job Finder (Phase 2F) — discovery layer only.
   Uses Google's Custom Search JSON API, server-side, to run a site-restricted
   search of OnlineJobs.ph. No scraping, no login, no browser automation, and
   no API key ever reaches the frontend — the browser only ever calls these
   routes. Results are not persisted server-side (they're a live search
   response); only the user's chosen keywords and search history are saved. ---------------- */
function normalizeUrlForDedup(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    let host = u.hostname.toLowerCase().replace(/^www\./, '');
    let pathname = u.pathname.replace(/\/+$/, '');
    return `${host}${pathname}`.toLowerCase();
  } catch { return String(url).trim().toLowerCase(); }
}
function normalizeTitleForDedup(title, source) {
  return `${(title || '').trim().toLowerCase().replace(/\s+/g, ' ')}|${(source || '').trim().toLowerCase()}`;
}

app.get('/api/job-finder/keywords', (req, res) => res.json(jobFinderKeywordsStore.read()));
app.post('/api/job-finder/keywords', (req, res) => {
  const keyword = ((req.body || {}).keyword || '').trim();
  if (!keyword) return res.status(400).json({ error: 'keyword is required' });
  const list = jobFinderKeywordsStore.read();
  if (list.some(k => k.keyword.toLowerCase() === keyword.toLowerCase())) {
    return res.status(400).json({ error: 'That keyword has already been added.' });
  }
  const entry = { id: crypto.randomUUID(), keyword, createdAt: new Date().toISOString() };
  list.push(entry);
  jobFinderKeywordsStore.write(list);
  res.status(201).json(entry);
});
app.delete('/api/job-finder/keywords/:id', (req, res) => {
  const list = jobFinderKeywordsStore.read();
  jobFinderKeywordsStore.write(list.filter(k => k.id !== req.params.id));
  res.json({ ok: true });
});

app.get('/api/job-finder/history', (req, res) => res.json(jobFinderHistoryStore.read()));

// Narrow, one-purpose migration endpoint: imports a single pre-built Job
// Finder history entry (with its already-discovered `results`) into this
// environment's history store, exactly as-is. It never calls Brave/Google,
// never touches jobs.json or the Job Profile, and never re-runs matching —
// it only appends the given entry once, via the same jobFinderHistoryStore
// write mechanism the real search route already uses. Not a general-purpose
// import/data-management endpoint — it exists solely to move an existing,
// already-verified history entry (with its results) between environments
// without re-searching.
app.post('/api/job-finder/history/import', (req, res) => {
  const entry = req.body || {};
  const requiredFields = ['id', 'searchedAt', 'keywords', 'perKeywordCounts', 'rawResultCount', 'rejectedCount', 'requestsMade', 'uniqueResultCount', 'results'];
  const missing = requiredFields.filter((f) => entry[f] === undefined);
  if (missing.length) return res.status(400).json({ error: 'invalid_entry', message: `Missing required field(s): ${missing.join(', ')}` });
  if (!Array.isArray(entry.results)) return res.status(400).json({ error: 'invalid_entry', message: 'results must be an array' });
  if (!Array.isArray(entry.keywords)) return res.status(400).json({ error: 'invalid_entry', message: 'keywords must be an array' });

  const historyList = jobFinderHistoryStore.read();
  if (historyList.some((h) => h.id === entry.id)) {
    return res.status(409).json({ error: 'duplicate', message: `A history entry with id "${entry.id}" already exists — not imported again.` });
  }
  historyList.unshift(entry);
  jobFinderHistoryStore.write(historyList);
  res.status(201).json({ ok: true, imported: { id: entry.id, keywords: entry.keywords, uniqueResultCount: entry.uniqueResultCount, resultsCount: entry.results.length } });
});

app.get('/api/job-finder/status', (req, res) => res.json({ configured: jobFinderService.isConfigured() }));

app.post('/api/job-finder/search', async (req, res) => {
  const body = req.body || {};
  const keywords = Array.isArray(body.keywords) ? [...new Set(body.keywords.map(k => (k || '').trim()).filter(Boolean))] : [];
  // Never silently changes 10 to another number — only clamps a user-supplied
  // value down to Google's own 10-per-request ceiling, same as the UI's own limit.
  const resultsPerKeyword = Math.min(jobFinderService.MAX_RESULTS_PER_KEYWORD, Math.max(1, Number(body.resultsPerKeyword) || jobFinderService.MAX_RESULTS_PER_KEYWORD));
  if (!keywords.length) return res.status(400).json({ error: 'At least one keyword is required.' });
  if (!jobFinderService.isConfigured()) {
    return res.status(503).json({ error: 'not_configured', message: 'Search integration is not configured yet.' });
  }

  const perKeywordCounts = {};      // valid individual job postings per keyword
  const perKeywordErrors = {};
  const combined = [];
  let rawResultCount = 0;           // every raw item Brave/Google returned, including rejected category/search pages
  let rejectedCount = 0;            // OnlineJobs.ph pages that were NOT individual job posts
  let requestsMade = 0;             // actual outbound Brave/Google HTTP requests, including backfill pages
  try {
    // One search per keyword, run sequentially. A single keyword may issue
    // more than one outbound request only to backfill valid job postings
    // when some raw results were rejected as category/search pages
    // (jobFinderService caps this internally) — never unbounded, never a
    // retry of a failed request. A failed keyword records its error and
    // contributes zero results but never aborts the other keywords.
    for (const keyword of keywords) {
      let items = { results: [], rawResultCount: 0, rejectedCount: 0, requestsMade: 0 };
      try {
        items = await jobFinderService.searchJobsByKeyword(keyword, resultsPerKeyword);
      } catch (err) {
        perKeywordErrors[keyword] = err.message || 'Search failed for this keyword.';
      }
      perKeywordCounts[keyword] = items.results.length;
      rawResultCount += items.rawResultCount;
      rejectedCount += items.rejectedCount;
      requestsMade += items.requestsMade;
      items.results.forEach(item => combined.push({ ...item, keyword }));
    }

    // Deduplicate: normalized source URL first, normalized title+source as fallback.
    const seen = new Map();
    const deduped = [];
    combined.forEach(item => {
      const key = item.sourceUrl ? normalizeUrlForDedup(item.sourceUrl) : normalizeTitleForDedup(item.title, item.source);
      if (seen.has(key)) {
        const existing = seen.get(key);
        if (!existing.matchedKeywords.includes(item.keyword)) existing.matchedKeywords.push(item.keyword);
      } else {
        const entry = { id: crypto.randomUUID(), ...item, matchedKeywords: [item.keyword] };
        seen.set(key, entry);
        deduped.push(entry);
      }
    });

    // Mark results that already exist in Job Opportunities (by real sourceUrl match).
    const existingJobs = jobsStore.read();
    const existingUrls = new Set(existingJobs.map(j => normalizeUrlForDedup(j.sourceUrl)).filter(Boolean));
    deduped.forEach(item => { item.alreadySaved = item.sourceUrl ? existingUrls.has(normalizeUrlForDedup(item.sourceUrl)) : false; });

    // One history entry per search click, covering every keyword in it —
    // never one entry per keyword, so a 3-keyword search is one session record.
    // `results` persists the exact same raw discovery objects returned below
    // (title/source/sourceUrl/snippet/keyword/matchedKeywords/alreadySaved/etc.)
    // so a page reload — or picking an older entry — can restore what was
    // actually found without a new Brave/Google request. Match score,
    // employment type, and compensation are NOT stored here: those are
    // computed client-side from this same raw data (jfAnalyzeResult), so
    // restoring just re-runs that existing, unchanged pipeline.
    const historyList = jobFinderHistoryStore.read();
    historyList.unshift({
      id: crypto.randomUUID(),
      keywords,
      perKeywordCounts,
      perKeywordErrors,
      rawResultCount,
      rejectedCount,
      requestsMade,
      uniqueResultCount: deduped.length,
      searchedAt: new Date().toISOString(),
      results: deduped,
    });
    jobFinderHistoryStore.write(historyList);

    res.json({ results: deduped, perKeywordCounts, perKeywordErrors, rawResultCount, rejectedCount, requestsMade, uniqueResultCount: deduped.length });
  } catch (err) {
    res.status(502).json({ error: 'search_failed', message: err.message || 'Search request failed.' });
  }
});

/* ---------------- Automations (foundation + "New Lead Follow-Up") ----------------
 * CRM is the source of truth for automation definitions/state; execution is
 * triggered externally (by n8n or a manual test call) via POST
 * /api/automations/execute. No automation ever runs on a timer/poll inside
 * this process — there is no scheduler here, by design (see audit notes).
 *
 * Concurrency note: every handler below is fully synchronous (plain
 * fs.readFileSync/writeFileSync, no `await` in between a read and its
 * matching write). Node runs one request handler to completion before
 * starting the next, so a synchronous read-modify-write cannot be
 * interleaved by a second concurrent request — this is the same guarantee
 * every existing route in this file already relies on. That is sufficient
 * protection for this single-process JSON-file architecture without adding
 * file locks or a queue.
 */
app.get('/api/automations', (req, res) => res.json(automationsStore.read()));

app.post('/api/automations', (req, res) => {
  const body = req.body || {};
  if (!body.name) return res.status(400).json({ error: 'name is required' });
  if (body.type && !AUTOMATION_TYPES.includes(body.type)) {
    return res.status(400).json({ error: `type must be one of: ${AUTOMATION_TYPES.join(', ')}` });
  }
  const now = new Date().toISOString();
  const automation = {
    id: crypto.randomUUID(),
    name: body.name,
    description: body.description || '',
    trigger: body.trigger || '',
    condition: body.condition || '',
    action: body.action || '',
    type: body.type || '',
    // Saved automations start paused by default unless the caller explicitly
    // asks for 'active' — a new automation should never silently start
    // executing against real contacts the moment it's created.
    status: body.status === 'active' ? 'active' : 'paused',
    createTask: !!body.createTask,
    createdAt: now,
    updatedAt: now,
    lastRunAt: '',
    nextRunAt: '',
  };
  const automations = automationsStore.read();
  automations.unshift(automation);
  automationsStore.write(automations);
  res.status(201).json(automation);
});

app.patch('/api/automations/:id', (req, res) => {
  const automations = automationsStore.read();
  const idx = automations.findIndex(a => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const updates = { ...req.body };
  if (updates.status && !AUTOMATION_STATUSES.includes(updates.status)) {
    return res.status(400).json({ error: `status must be one of: ${AUTOMATION_STATUSES.join(', ')}` });
  }
  if (updates.type && !AUTOMATION_TYPES.includes(updates.type)) {
    return res.status(400).json({ error: `type must be one of: ${AUTOMATION_TYPES.join(', ')}` });
  }
  automations[idx] = { ...automations[idx], ...updates, updatedAt: new Date().toISOString() };
  automationsStore.write(automations);
  res.json(automations[idx]);
});

app.get('/api/automation-runs', (req, res) => {
  const runs = automationRunsStore.read();
  const { automationId } = req.query;
  res.json(automationId ? runs.filter(r => r.automationId === automationId) : runs);
});

// Dedicated execution/reporting endpoint for n8n. This is the ONLY way an
// external system can cause an automation-driven CRM mutation — it performs
// exactly one approved, hardcoded action per known automation `type`; it is
// not a generic write API.
app.post('/api/automations/execute', (req, res) => {
  const providedKey = req.get('X-Automation-Key');
  if (!process.env.AUTOMATION_API_KEY || providedKey !== process.env.AUTOMATION_API_KEY) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const body = req.body || {};
  const { automationId, contactId, triggerEventId } = body;
  if (!automationId || !triggerEventId) {
    return res.status(400).json({ error: 'automationId and triggerEventId are required' });
  }

  const automations = automationsStore.read();
  const automationIdx = automations.findIndex(a => a.id === automationId);
  if (automationIdx === -1) return res.status(404).json({ error: 'automation not found' });
  const automation = automations[automationIdx];

  const startedAt = new Date().toISOString();
  function recordRun(status, error, resultSummary) {
    const run = {
      id: crypto.randomUUID(), automationId, contactId: contactId || '', triggerEventId,
      startedAt, finishedAt: new Date().toISOString(), status, error: error || '', resultSummary: resultSummary || '',
    };
    const runs = automationRunsStore.read();
    runs.unshift(run);
    automationRunsStore.write(runs);
    return run;
  }

  // Idempotency: the same (automationId, contactId, triggerEventId) combo
  // must never execute twice, no matter how many times n8n retries/redelivers it.
  const existingRun = automationRunsStore.read().find(r =>
    r.automationId === automationId && r.contactId === (contactId || '') && r.triggerEventId === triggerEventId);
  if (existingRun) {
    return res.status(200).json({ status: 'skipped', reason: 'duplicate triggerEventId — already processed', run: existingRun });
  }

  if (automation.status !== 'active') {
    const run = recordRun('skipped', '', 'Automation is paused');
    return res.status(200).json({ status: 'skipped', reason: 'automation is paused', run });
  }

  if (automation.type === 'new_lead_followup') {
    if (!contactId) {
      const run = recordRun('failed', 'contactId is required for this automation type', '');
      return res.status(400).json({ status: 'failed', error: 'contactId is required for this automation type', run });
    }

    const contacts = readContacts();
    const contactIdx = contacts.findIndex(c => c.id === contactId);
    if (contactIdx === -1) {
      const run = recordRun('failed', 'contact not found', '');
      return res.status(404).json({ status: 'failed', error: 'contact not found', run });
    }
    const contact = contacts[contactIdx];

    // Eligibility — ONLY real, existing contact fields. No invented lead-scoring.
    const hasContactInfo = !!(contact.email || contact.phone);
    const isNewLead = contact.sourceStatus === 'New';
    if (!hasContactInfo || !isNewLead) {
      const run = recordRun('skipped', '', 'Contact is not eligible (requires an email or phone, and sourceStatus === "New")');
      return res.status(200).json({ status: 'skipped', reason: 'contact not eligible', run });
    }

    // Duplicate-follow-up protection: never overwrite an already-scheduled future follow-up.
    const today = new Date().toISOString().slice(0, 10);
    if (contact.nextFollowUp && contact.nextFollowUp >= today) {
      const run = recordRun('skipped', '', `Contact already has an upcoming follow-up on ${contact.nextFollowUp}`);
      return res.status(200).json({ status: 'skipped', reason: 'contact already has an upcoming follow-up', run });
    }

    const followUpDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    contacts[contactIdx] = { ...contact, nextFollowUp: followUpDate, lastActivity: new Date().toISOString() };
    writeContacts(contacts);

    let createdTask = null;
    if (automation.createTask) {
      const tasks = tasksStore.read();
      const alreadyOpen = tasks.some(t => t.contactId === contactId && t.automationId === automationId && t.status === 'open');
      if (!alreadyOpen) {
        createdTask = {
          id: crypto.randomUUID(), title: `Follow up with ${contact.name}`, contactId, projectId: '',
          dueDate: followUpDate, priority: 'Medium', status: 'open', createdAt: new Date().toISOString(), completedAt: '',
          automationId, createdBy: 'automation',
        };
        tasks.unshift(createdTask);
        tasksStore.write(tasks);
      }
    }

    automations[automationIdx] = { ...automation, lastRunAt: new Date().toISOString() };
    automationsStore.write(automations);

    const summary = [`Set nextFollowUp to ${followUpDate}`];
    if (automation.createTask) summary.push(createdTask ? 'created a follow-up task' : 'follow-up task already existed, skipped duplicate');
    const run = recordRun('success', '', summary.join('; '));

    return res.status(200).json({ status: 'success', run, contact: contacts[contactIdx], task: createdTask });
  }

  if (automation.type === 'appointment_reminder') {
    // Validation-only for now — no email/SMS/WhatsApp/etc is sent here. This
    // checks eligibility using ONLY real, existing Contact fields and hands
    // back the exact context (bookingDate/bookingTime/meetingLink) an n8n
    // notification step would need, without inventing any of them.
    if (!contactId) {
      const run = recordRun('failed', 'contactId is required for this automation type', '');
      return res.status(400).json({ status: 'failed', error: 'contactId is required for this automation type', run });
    }

    const contacts = readContacts();
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) {
      const run = recordRun('failed', 'contact not found', '');
      return res.status(404).json({ status: 'failed', error: 'contact not found', run });
    }

    // Same local-date convention already used above for New Lead Follow-Up's
    // `today` (ISO-string slice, not a rolling 24h window): tomorrow is
    // exactly "today + 1 calendar day", never "now + 24 hours".
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const isLost = contact.stage === 'lost';
    const isTomorrow = contact.bookingDate === tomorrow;

    if (!contact.bookingDate || isLost || !isTomorrow) {
      let reason;
      if (!contact.bookingDate) reason = 'Contact has no bookingDate';
      else if (isLost) reason = 'Contact stage is "lost"';
      else reason = `bookingDate (${contact.bookingDate}) is not tomorrow (${tomorrow})`;
      const run = recordRun('skipped', '', reason);
      return res.status(200).json({ status: 'skipped', reason: 'appointment not eligible', run });
    }

    // Preserve exactly what's stored — never invent a bookingTime or meetingLink.
    const context = {
      contactId: contact.id,
      name: contact.name,
      bookingDate: contact.bookingDate,
      bookingTime: contact.bookingTime || '',
      meetingLink: contact.meetingLink || '',
    };

    automations[automationIdx] = { ...automation, lastRunAt: new Date().toISOString() };
    automationsStore.write(automations);

    const run = recordRun('success', '', `Appointment reminder eligible for ${contact.name} on ${contact.bookingDate}${contact.bookingTime ? ' at ' + contact.bookingTime : ''}`);
    return res.status(200).json({ status: 'success', run, context });
  }

  const run = recordRun('failed', 'no execution handler for this automation type', '');
  return res.status(400).json({ status: 'failed', error: 'no execution handler for this automation type', run });
});

const server = app.listen(PORT, () => {
  console.log(`Meeting CRM running at http://localhost:${PORT}`);
});

// Railway (and most container platforms) send SIGTERM to ask the process to
// stop before replacing/removing the container during a deploy or restart.
// Without a handler, Node's default behavior is an abrupt kill, which npm's
// CLI wrapper then logs as "npm error signal SIGTERM" — indistinguishable
// in the logs from a real crash. Closing the server first lets any in-flight
// request finish before exiting cleanly with code 0.
function shutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);
  if (!server.listening) { process.exit(0); return; }
  server.close(() => process.exit(0));
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
