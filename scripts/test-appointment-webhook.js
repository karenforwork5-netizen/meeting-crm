/* Integration test for the CRM -> n8n "Appointment Reminder" webhook
 * notification fired from POST /api/contacts and PATCH /api/contacts/:id.
 * Runs the REAL server.js in-process on a random port, with global.fetch
 * monkey-patched to a mock BEFORE requiring server.js so no real network
 * call is ever made. Snapshots contacts.json first and restores it
 * byte-for-byte afterward, so this test never leaves a net change to local
 * data.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(__dirname, '..', 'data');
const CONTACTS_PATH = path.join(DATA_DIR, 'contacts.json');

function snapshot(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null; }
function restore(p, content) {
  if (content === null) { if (fs.existsSync(p)) fs.unlinkSync(p); }
  else fs.writeFileSync(p, content);
}

const contactsBackup = snapshot(CONTACTS_PATH);

let passed = 0;
let failed = false;
function ok(label, cond) {
  if (cond) { passed++; }
  else { failed = true; console.error(`FAIL: ${label}`); }
}

const TEST_PORT = 4321 + Math.floor(Math.random() * 500);
process.env.PORT = String(TEST_PORT);
process.env.N8N_APPOINTMENT_WEBHOOK_URL = 'http://mock-n8n.invalid/webhook/crm-appointment';
const BASE = `http://localhost:${TEST_PORT}`;

// --- Mock global.fetch BEFORE requiring server.js, so server.js's own
// outbound `fetch(N8N_APPOINTMENT_WEBHOOK_URL, ...)` call (used only by
// postToN8nAppointmentWebhook) hits this mock instead of the real network.
// Any call targeting our OWN test server (BASE) is passed straight through
// to the real fetch, since that's this script's own HTTP client traffic,
// not the webhook under test. ---
const realFetch = global.fetch;
let webhookCalls = [];
let webhookMode = 'success'; // 'success' | 'fail' | 'slow'
global.fetch = async (url, opts) => {
  if (typeof url === 'string' && url.startsWith(BASE)) {
    return realFetch(url, opts);
  }
  webhookCalls.push({ url, body: opts && opts.body ? JSON.parse(opts.body) : null });
  if (webhookMode === 'fail') throw new Error('mock network failure');
  if (webhookMode === 'slow') await new Promise(r => setTimeout(r, 2000));
  return { ok: true, status: 200 };
};

const createdContactIds = [];

async function postContact(body) {
  const res = await fetch(`${BASE}/api/contacts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const contact = await res.json();
  if (contact.id) createdContactIds.push(contact.id);
  return { status: res.status, contact };
}
async function patchContact(id, updates) {
  const res = await fetch(`${BASE}/api/contacts/${id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
  });
  return { status: res.status, contact: await res.json() };
}

async function main() {
  require('../server.js'); // starts listening on TEST_PORT, using our mocked fetch
  await new Promise(r => setTimeout(r, 300)); // let the server bind

  // --- A. POST /api/contacts WITH bookingDate -> saves + webhook fires ---
  webhookCalls = [];
  const { status: sA, contact: cA } = await postContact({ name: '__test_appt_a__', bookingDate: '2026-12-01' });
  ok('A. contact saves (201)', sA === 201);
  await new Promise(r => setTimeout(r, 50)); // let the fire-and-forget call land
  ok('A. webhook fired exactly once', webhookCalls.length === 1);
  ok('A. webhook payload matches required shape', webhookCalls[0] && webhookCalls[0].body.appointmentId === cA.id && webhookCalls[0].body.contactId === cA.id && webhookCalls[0].body.status === 'scheduled');
  ok('A. webhook called the configured URL', webhookCalls[0] && webhookCalls[0].url === process.env.N8N_APPOINTMENT_WEBHOOK_URL);

  // --- B. POST /api/contacts WITHOUT bookingDate/bookingTime -> saves, no webhook ---
  webhookCalls = [];
  const { status: sB } = await postContact({ name: '__test_appt_b__' });
  ok('B. contact saves (201)', sB === 201);
  await new Promise(r => setTimeout(r, 50));
  ok('B. no webhook fired', webhookCalls.length === 0);

  // --- C. PATCH contact with bookingDate -> saves + webhook fires ---
  const { contact: baseC } = await postContact({ name: '__test_appt_c__' });
  webhookCalls = [];
  const { status: sC } = await patchContact(baseC.id, { bookingDate: '2026-12-05' });
  ok('C. patch saves (200)', sC === 200);
  await new Promise(r => setTimeout(r, 50));
  ok('C. webhook fired exactly once', webhookCalls.length === 1);
  ok('C. webhook payload uses the patched contact id', webhookCalls[0] && webhookCalls[0].body.contactId === baseC.id);

  // --- D. PATCH contact with bookingTime -> saves + webhook fires ---
  const { contact: baseD } = await postContact({ name: '__test_appt_d__' });
  webhookCalls = [];
  const { status: sD } = await patchContact(baseD.id, { bookingTime: '3:00 PM' });
  ok('D. patch saves (200)', sD === 200);
  await new Promise(r => setTimeout(r, 50));
  ok('D. webhook fired exactly once', webhookCalls.length === 1);

  // --- E. PATCH changing only name -> saves, NO webhook ---
  const { contact: baseE } = await postContact({ name: '__test_appt_e__' });
  webhookCalls = [];
  const { status: sE } = await patchContact(baseE.id, { name: '__test_appt_e_renamed__' });
  ok('E. patch saves (200)', sE === 200);
  await new Promise(r => setTimeout(r, 50));
  ok('E. no webhook fired for a name-only edit', webhookCalls.length === 0);

  // --- F. PATCH changing only notes -> saves, NO webhook ---
  const { contact: baseF } = await postContact({ name: '__test_appt_f__' });
  webhookCalls = [];
  const { status: sF } = await patchContact(baseF.id, { notes: 'some note' });
  ok('F. patch saves (200)', sF === 200);
  await new Promise(r => setTimeout(r, 50));
  ok('F. no webhook fired for a notes-only edit', webhookCalls.length === 0);

  // --- G. n8n webhook failure -> contact save still succeeds ---
  webhookMode = 'fail';
  webhookCalls = [];
  const { status: sG } = await postContact({ name: '__test_appt_g__', bookingDate: '2026-12-10' });
  ok('G. contact save still succeeds even when the webhook throws', sG === 201);
  await new Promise(r => setTimeout(r, 50));
  ok('G. webhook was attempted despite failing', webhookCalls.length === 1);
  webhookMode = 'success';

  // --- Non-blocking check: with a deliberately slow (2s) mock, the HTTP
  // response must return almost immediately, not wait for the webhook. ---
  webhookMode = 'slow';
  webhookCalls = [];
  const startedAt = Date.now();
  const { status: sSlow } = await postContact({ name: '__test_appt_slow__', bookingDate: '2026-12-11' });
  const elapsedMs = Date.now() - startedAt;
  ok('Non-blocking: contact save succeeds', sSlow === 201);
  ok(`Non-blocking: response returned quickly (${elapsedMs}ms) despite a 2000ms-slow webhook mock`, elapsedMs < 500);
  webhookMode = 'success';

  // --- H. missing N8N_APPOINTMENT_WEBHOOK_URL -> save still succeeds, no crash ---
  const savedUrl = process.env.N8N_APPOINTMENT_WEBHOOK_URL;
  delete process.env.N8N_APPOINTMENT_WEBHOOK_URL;
  webhookCalls = [];
  const { status: sH } = await postContact({ name: '__test_appt_h__', bookingDate: '2026-12-12' });
  ok('H. contact save still succeeds with no webhook URL configured', sH === 201);
  await new Promise(r => setTimeout(r, 50));
  ok('H. fetch was never called when the URL is unset', webhookCalls.length === 0);
  process.env.N8N_APPOINTMENT_WEBHOOK_URL = savedUrl;

  console.log(`${passed} passed, ${failed ? 'some failed' : '0 failed'}`);

  // --- Cleanup: remove every contact this script created ---
  for (const id of createdContactIds) await fetch(`${BASE}/api/contacts/${id}`, { method: 'DELETE' });
  restore(CONTACTS_PATH, contactsBackup);
  global.fetch = realFetch;

  process.exitCode = failed ? 1 : 0;
  process.exit(process.exitCode);
}

main().catch(err => {
  console.error('Test script crashed:', err);
  restore(CONTACTS_PATH, contactsBackup);
  global.fetch = realFetch;
  process.exit(1);
});
