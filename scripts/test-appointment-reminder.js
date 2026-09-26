/* Integration test for the "Appointment Reminder" automation type
 * (appointment_reminder) added alongside the existing "New Lead Follow-Up"
 * (new_lead_followup). Runs the REAL server.js in-process on a random port.
 * Snapshots contacts.json, tasks.json, automations.json, and
 * automationRuns.json first and restores them byte-for-byte afterward, so
 * this test never leaves a net change to local data.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONTACTS_PATH = path.join(DATA_DIR, 'contacts.json');
const TASKS_PATH = path.join(DATA_DIR, 'tasks.json');
const AUTOMATIONS_PATH = path.join(DATA_DIR, 'automations.json');
const AUTOMATION_RUNS_PATH = path.join(DATA_DIR, 'automationRuns.json');

function snapshot(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null; }
function restore(p, content) {
  if (content === null) { if (fs.existsSync(p)) fs.unlinkSync(p); }
  else fs.writeFileSync(p, content);
}

const contactsBackup = snapshot(CONTACTS_PATH);
const tasksBackup = snapshot(TASKS_PATH);
const automationsBackup = snapshot(AUTOMATIONS_PATH);
const runsBackup = snapshot(AUTOMATION_RUNS_PATH);

let passed = 0;
let failed = false;
function ok(label, cond) {
  if (cond) { passed++; }
  else { failed = true; console.error(`FAIL: ${label}`); }
}

const TEST_PORT = 4321 + Math.floor(Math.random() * 500);
const TEST_AUTOMATION_KEY = 'test-only-key-' + Math.random().toString(36).slice(2);
process.env.PORT = String(TEST_PORT);
process.env.AUTOMATION_API_KEY = TEST_AUTOMATION_KEY;
const BASE = `http://localhost:${TEST_PORT}`;

function isoDaysFromNow(days) { return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); }

const createdContactIds = [];
const createdAutomationIds = [];

async function exec(body) {
  const res = await fetch(`${BASE}/api/automations/execute`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Automation-Key': TEST_AUTOMATION_KEY },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function makeContact(overrides) {
  const res = await fetch(`${BASE}/api/contacts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '__test_appt_contact__', sourceStatus: 'New', ...overrides }),
  });
  const contact = await res.json();
  createdContactIds.push(contact.id);
  return contact;
}

async function main() {
  require('../server.js'); // starts listening on TEST_PORT
  await new Promise(r => setTimeout(r, 300)); // let the server bind

  // --- A. appointment_reminder is accepted as a valid automation type ---
  const createRes = await fetch(`${BASE}/api/automations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '__test_appointment_reminder__', type: 'appointment_reminder',
      trigger: 'Appointment reminder event', condition: 'Contact has a bookingDate for tomorrow and stage is not "lost"',
      action: 'Validate appointment and prepare reminder context for n8n', status: 'active',
    }),
  });
  const automation = await createRes.json();
  ok('A. POST /api/automations accepts type=appointment_reminder (201)', createRes.status === 201);
  ok('A. created record has type=appointment_reminder', automation.type === 'appointment_reminder');
  createdAutomationIds.push(automation.id);

  // --- B. valid appointment for tomorrow -> eligible ---
  const tomorrow = isoDaysFromNow(1);
  const contactTomorrow = await makeContact({ bookingDate: tomorrow, bookingTime: '2:00 PM', meetingLink: 'https://meet.example.com/abc', stage: 'confirmed' });
  const r1 = await exec({ automationId: automation.id, contactId: contactTomorrow.id, triggerEventId: 'evt-tomorrow-1' });
  ok('B. appointment tomorrow -> success (200)', r1.status === 200 && r1.body.status === 'success');
  ok('B. context.bookingDate matches tomorrow', r1.body.context && r1.body.context.bookingDate === tomorrow);
  ok('B. no contact mutation occurred (contact still has same bookingDate)', (await (await fetch(`${BASE}/api/contacts`)).json()).find(c => c.id === contactTomorrow.id).bookingDate === tomorrow);
  ok('B. no task was created', (await (await fetch(`${BASE}/api/tasks`)).json()).filter(t => t.contactId === contactTomorrow.id).length === 0);

  // --- C. appointment today -> not eligible ---
  const today = isoDaysFromNow(0);
  const contactToday = await makeContact({ bookingDate: today, stage: 'confirmed' });
  const r2 = await exec({ automationId: automation.id, contactId: contactToday.id, triggerEventId: 'evt-today-1' });
  ok('C. appointment today -> skipped', r2.status === 200 && r2.body.status === 'skipped');

  // --- D. appointment yesterday -> not eligible ---
  const yesterday = isoDaysFromNow(-1);
  const contactYesterday = await makeContact({ bookingDate: yesterday, stage: 'confirmed' });
  const r3 = await exec({ automationId: automation.id, contactId: contactYesterday.id, triggerEventId: 'evt-yesterday-1' });
  ok('D. appointment yesterday -> skipped', r3.status === 200 && r3.body.status === 'skipped');

  // --- E. bookingDate missing -> not eligible ---
  const contactNoDate = await makeContact({ stage: 'confirmed' });
  const r4 = await exec({ automationId: automation.id, contactId: contactNoDate.id, triggerEventId: 'evt-nodate-1' });
  ok('E. missing bookingDate -> skipped', r4.status === 200 && r4.body.status === 'skipped');

  // --- F. stage = "lost" -> not eligible, even with tomorrow's bookingDate ---
  const contactLost = await makeContact({ bookingDate: tomorrow, stage: 'lost' });
  const r5 = await exec({ automationId: automation.id, contactId: contactLost.id, triggerEventId: 'evt-lost-1' });
  ok('F. stage=lost -> skipped', r5.status === 200 && r5.body.status === 'skipped');

  // --- G. bookingTime empty -> still valid, with no invented time ---
  const contactNoTime = await makeContact({ bookingDate: tomorrow, stage: 'confirmed' });
  const r6 = await exec({ automationId: automation.id, contactId: contactNoTime.id, triggerEventId: 'evt-notime-1' });
  ok('G. empty bookingTime -> still success', r6.status === 200 && r6.body.status === 'success');
  ok('G. context.bookingTime is empty string, not invented', r6.body.context && r6.body.context.bookingTime === '');

  // --- H. meetingLink empty -> still valid, with no invented link ---
  ok('H. context.meetingLink is empty string, not invented (same contact as G)', r6.body.context && r6.body.context.meetingLink === '');

  // --- I. existing new_lead_followup behavior remains unchanged ---
  const nlfRes = await fetch(`${BASE}/api/automations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '__test_new_lead_followup__', type: 'new_lead_followup', status: 'active', createTask: true }),
  });
  const nlfAutomation = await nlfRes.json();
  createdAutomationIds.push(nlfAutomation.id);
  const eligibleLead = await makeContact({ name: '__test_nlf_lead__', email: 'test@example.com', sourceStatus: 'New' });
  const r7 = await exec({ automationId: nlfAutomation.id, contactId: eligibleLead.id, triggerEventId: 'evt-nlf-1' });
  ok('I. new_lead_followup still succeeds', r7.status === 200 && r7.body.status === 'success');
  ok('I. new_lead_followup still sets nextFollowUp (unaffected by appointment_reminder addition)', /^\d{4}-\d{2}-\d{2}$/.test(r7.body.contact.nextFollowUp));
  ok('I. new_lead_followup still creates a task when createTask=true', !!r7.body.task && r7.body.task.createdBy === 'automation');
  const cleanupTaskId = r7.body.task ? r7.body.task.id : null;

  // --- J. an automation's ID never changes across a PATCH (structural regression check) ---
  const beforeId = automation.id;
  const patchRes = await fetch(`${BASE}/api/automations/${automation.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'paused' }),
  });
  const patched = await patchRes.json();
  ok('J. PATCH never changes the automation id', patched.id === beforeId);

  console.log(`${passed} passed, ${failed ? 'some failed' : '0 failed'}`);

  // --- Cleanup: remove every piece of test data this script created ---
  if (cleanupTaskId) await fetch(`${BASE}/api/tasks/${cleanupTaskId}`, { method: 'DELETE' });
  for (const contactId of createdContactIds) await fetch(`${BASE}/api/contacts/${contactId}`, { method: 'DELETE' });
  // No DELETE route exists for automations/automation-runs — restore the
  // underlying files byte-for-byte instead, same pattern as
  // scripts/test-automation-engine.js.
  restore(CONTACTS_PATH, contactsBackup);
  restore(TASKS_PATH, tasksBackup);
  restore(AUTOMATIONS_PATH, automationsBackup);
  restore(AUTOMATION_RUNS_PATH, runsBackup);

  process.exitCode = failed ? 1 : 0;
  process.exit(process.exitCode);
}

main().catch(err => {
  console.error('Test script crashed:', err);
  restore(CONTACTS_PATH, contactsBackup);
  restore(TASKS_PATH, tasksBackup);
  restore(AUTOMATIONS_PATH, automationsBackup);
  restore(AUTOMATION_RUNS_PATH, runsBackup);
  process.exit(1);
});
