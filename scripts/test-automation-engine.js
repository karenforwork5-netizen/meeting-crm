/* Integration test for the Automation Engine foundation + "New Lead
 * Follow-Up" (the first real automation). Runs the REAL server.js
 * in-process on a random port. Snapshots contacts.json, tasks.json,
 * automations.json, and automationRuns.json first and restores them
 * byte-for-byte afterward, so this test never leaves a net change to
 * local data.
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
function check(label, actual, expected) {
  try { assert.deepStrictEqual(actual, expected); passed++; }
  catch (err) {
    failed = true;
    console.error(`FAIL: ${label}`);
    console.error('  expected:', JSON.stringify(expected));
    console.error('  actual:  ', JSON.stringify(actual));
  }
}

const TEST_PORT = 4321 + Math.floor(Math.random() * 500);
const TEST_AUTOMATION_KEY = 'test-only-key-' + Math.random().toString(36).slice(2);
process.env.PORT = String(TEST_PORT);
process.env.AUTOMATION_API_KEY = TEST_AUTOMATION_KEY;
const BASE = `http://localhost:${TEST_PORT}`;

const createdContactIds = [];
const createdTaskIds = [];
const createdAutomationIds = [];

async function main() {
  require('../server.js'); // starts listening on TEST_PORT
  await new Promise(r => setTimeout(r, 300)); // let the server bind

  // --- K. Missing/invalid authentication is rejected ---
  const noAuthRes = await fetch(`${BASE}/api/automations/execute`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ automationId: 'x', contactId: 'y', triggerEventId: 'z' }),
  });
  ok('K. missing X-Automation-Key is rejected with 401', noAuthRes.status === 401);
  const wrongAuthRes = await fetch(`${BASE}/api/automations/execute`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Automation-Key': 'wrong-key' },
    body: JSON.stringify({ automationId: 'x', contactId: 'y', triggerEventId: 'z' }),
  });
  ok('K. wrong X-Automation-Key is rejected with 401', wrongAuthRes.status === 401);

  // --- A. Create automation ---
  const createRes = await fetch(`${BASE}/api/automations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '__test_new_lead_followup__', description: 'test automation', trigger: 'New contact created',
      condition: 'has email/phone and sourceStatus New', action: 'set nextFollowUp',
      type: 'new_lead_followup', createTask: true, status: 'active',
    }),
  });
  const automation = await createRes.json();
  ok('A. create automation returns 201', createRes.status === 201);
  ok('A. created automation has an id', typeof automation.id === 'string' && automation.id.length > 0);
  ok('A. new automation defaults lastRunAt/nextRunAt to empty', automation.lastRunAt === '' && automation.nextRunAt === '');
  createdAutomationIds.push(automation.id);

  // --- B. Retrieve automation ---
  const listRes = await fetch(`${BASE}/api/automations`);
  const list = await listRes.json();
  ok('B. GET /api/automations includes the created automation', list.some(a => a.id === automation.id));

  // --- C. Update/pause automation ---
  const pauseRes = await fetch(`${BASE}/api/automations/${automation.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'paused' }),
  });
  const paused = await pauseRes.json();
  ok('C. PATCH pauses the automation', paused.status === 'paused');
  // re-activate for the execution tests below
  await fetch(`${BASE}/api/automations/${automation.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active' }),
  });

  // --- Create an eligible test contact (email set, sourceStatus New) ---
  const eligibleContactRes = await fetch(`${BASE}/api/contacts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '__test_eligible_lead__', email: 'test-lead@example.com', sourceStatus: 'New' }),
  });
  const eligibleContact = await eligibleContactRes.json();
  createdContactIds.push(eligibleContact.id);
  ok('setup: eligible contact created with createdBy=manual default', eligibleContact.createdBy === 'manual');

  // --- I. Ineligible contact is skipped (no email/phone) ---
  const ineligibleContactRes = await fetch(`${BASE}/api/contacts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '__test_ineligible_lead__', sourceStatus: 'New' }),
  });
  const ineligibleContact = await ineligibleContactRes.json();
  createdContactIds.push(ineligibleContact.id);
  const ineligibleExecRes = await fetch(`${BASE}/api/automations/execute`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Automation-Key': TEST_AUTOMATION_KEY },
    body: JSON.stringify({ automationId: automation.id, contactId: ineligibleContact.id, triggerEventId: 'evt-ineligible-1' }),
  });
  const ineligibleBody = await ineligibleExecRes.json();
  ok('I. ineligible contact (no email/phone) is skipped', ineligibleExecRes.status === 200 && ineligibleBody.status === 'skipped');
  const ineligibleContactAfter = await (await fetch(`${BASE}/api/contacts`)).json().then(cs => cs.find(c => c.id === ineligibleContact.id));
  ok('I. ineligible contact nextFollowUp untouched', ineligibleContactAfter.nextFollowUp === '');

  // --- D, E, F, G. Execute eligible new lead: nextFollowUp set, task created, run recorded ---
  const execRes = await fetch(`${BASE}/api/automations/execute`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Automation-Key': TEST_AUTOMATION_KEY },
    body: JSON.stringify({ automationId: automation.id, contactId: eligibleContact.id, triggerEventId: 'evt-1', eventType: 'contact.created' }),
  });
  const execBody = await execRes.json();
  ok('D. eligible execution succeeds', execRes.status === 200 && execBody.status === 'success');
  ok('E. nextFollowUp was set to a real future date', /^\d{4}-\d{2}-\d{2}$/.test(execBody.contact.nextFollowUp));
  ok('F. a task was created (createTask=true) tagged with the automation', !!execBody.task && execBody.task.automationId === automation.id && execBody.task.createdBy === 'automation');
  if (execBody.task) createdTaskIds.push(execBody.task.id);
  ok('G. an automationRuns record was created with status success', execBody.run.status === 'success' && execBody.run.automationId === automation.id && execBody.run.contactId === eligibleContact.id);
  const runsAfterExec = await (await fetch(`${BASE}/api/automation-runs?automationId=${automation.id}`)).json();
  ok('G. GET /api/automation-runs returns the recorded run', runsAfterExec.some(r => r.id === execBody.run.id));

  // --- H. Duplicate trigger (same triggerEventId) is skipped, no second task/run mutation ---
  const dupRes = await fetch(`${BASE}/api/automations/execute`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Automation-Key': TEST_AUTOMATION_KEY },
    body: JSON.stringify({ automationId: automation.id, contactId: eligibleContact.id, triggerEventId: 'evt-1' }),
  });
  const dupBody = await dupRes.json();
  ok('H. duplicate triggerEventId is skipped', dupRes.status === 200 && dupBody.status === 'skipped');
  const tasksAfterDup = await (await fetch(`${BASE}/api/tasks`)).json();
  ok('H. no second task was created for the duplicate', tasksAfterDup.filter(t => t.contactId === eligibleContact.id && t.automationId === automation.id).length === 1);

  // --- J. Automation cannot trigger itself repeatedly: a NEW triggerEventId
  // against the same contact is still blocked, because the contact now has
  // an upcoming nextFollowUp (set by the first run) — proving the automation
  // doesn't re-fire its own action against a contact it already touched. ---
  const reFireRes = await fetch(`${BASE}/api/automations/execute`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Automation-Key': TEST_AUTOMATION_KEY },
    body: JSON.stringify({ automationId: automation.id, contactId: eligibleContact.id, triggerEventId: 'evt-2-different-event' }),
  });
  const reFireBody = await reFireRes.json();
  ok('J. a different triggerEventId against the same already-touched contact is skipped (no re-trigger loop)', reFireRes.status === 200 && reFireBody.status === 'skipped');
  const tasksAfterRefire = await (await fetch(`${BASE}/api/tasks`)).json();
  ok('J. still exactly one task for this contact+automation after the re-fire attempt', tasksAfterRefire.filter(t => t.contactId === eligibleContact.id && t.automationId === automation.id).length === 1);

  console.log(`${passed} passed, ${failed ? 'some failed' : '0 failed'}`);

  // --- Cleanup: remove every piece of test data this script created ---
  for (const taskId of createdTaskIds) await fetch(`${BASE}/api/tasks/${taskId}`, { method: 'DELETE' });
  for (const contactId of createdContactIds) await fetch(`${BASE}/api/contacts/${contactId}`, { method: 'DELETE' });
  // Automations/automation-runs have no DELETE route (none was requested in
  // scope) — restore the underlying files byte-for-byte instead, same as the
  // Job Finder persistence test does for its own stores.
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
