/* Integration test for the Job Finder history cap (JOB_FINDER_HISTORY_MAX_ENTRIES).
 *
 * Runs the REAL server.js in-process. Snapshots the real local
 * jobFinderHistory.json first and restores it byte-for-byte afterward.
 * Uses the existing POST /api/job-finder/history/import endpoint to add
 * entries (no Brave/Google call is possible through it).
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(__dirname, '..', 'data');
const HISTORY_PATH = path.join(DATA_DIR, 'jobFinderHistory.json');

function snapshot(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null; }
function restore(p, content) {
  if (content === null) { if (fs.existsSync(p)) fs.unlinkSync(p); }
  else fs.writeFileSync(p, content);
}

const historyBackup = snapshot(HISTORY_PATH);

let passed = 0;
let failed = false;
function ok(label, cond) { if (cond) passed++; else { failed = true; console.error(`FAIL: ${label}`); } }
function check(label, actual, expected) {
  try { assert.deepStrictEqual(actual, expected); passed++; }
  catch (err) { failed = true; console.error(`FAIL: ${label}`); console.error('  expected:', JSON.stringify(expected)); console.error('  actual:  ', JSON.stringify(actual)); }
}

const TEST_PORT = 4900 + Math.floor(Math.random() * 500);
process.env.PORT = String(TEST_PORT);
const BASE = `http://localhost:${TEST_PORT}`;

function mockEntry(n, hoursAgo) {
  return {
    id: `cap-test-${n}`,
    searchedAt: new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString(),
    keywords: [`Keyword ${n}`],
    perKeywordCounts: { [`Keyword ${n}`]: 1 },
    perKeywordErrors: {},
    rawResultCount: 1, rejectedCount: 0, requestsMade: 1, uniqueResultCount: 1,
    results: [{ id: `r-${n}`, title: `Job ${n}`, source: 'OnlineJobs.ph', sourceUrl: `https://www.onlinejobs.ph/jobseekers/job/cap-${n}`, snippet: '', displayUrl: '', salary: '', company: '', location: '', employmentType: '', dateDiscovered: new Date().toISOString(), searchQuery: '', searchStatus: 'ok', keyword: `Keyword ${n}`, matchedKeywords: [`Keyword ${n}`], alreadySaved: false }],
  };
}

async function main() {
  require('../server.js');
  await new Promise((r) => setTimeout(r, 300));

  // Seed exactly 25 entries directly into the file (oldest last, newest
  // first — same convention the real write path uses), bypassing the API
  // so this test controls the exact starting state.
  const seeded = Array.from({ length: 25 }, (_, i) => mockEntry(i, i)); // entry 0 = "now", entry 24 = 24h old
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(seeded, null, 2));

  // Add ONE more entry via the existing import endpoint (real write path).
  const newEntry = mockEntry('NEW', -1); // "in the future" relative to the others, i.e. newest
  const importRes = await fetch(`${BASE}/api/job-finder/history/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newEntry) });
  ok('A. import of the 26th entry succeeds', importRes.status === 201);

  const historyAfter = await (await fetch(`${BASE}/api/job-finder/history`)).json();
  ok('A. exactly 20 entries remain after the cap', historyAfter.length === 20);
  ok('A. newest entry (just added) is first', historyAfter[0].id === 'cap-test-NEW');
  // The newest 20 of [NEW, 0, 1, ..., 24] by insertion order are NEW + 0..18 (19 old + the new one = 20 total)
  const expectedIds = ['cap-test-NEW', ...Array.from({ length: 19 }, (_, i) => `cap-test-${i}`)];
  check('A. exactly the newest 20 ids remain, oldest removed', historyAfter.map((h) => h.id), expectedIds);
  ok('A. oldest entries (19-24) were removed', !historyAfter.some((h) => ['cap-test-19', 'cap-test-20', 'cap-test-21', 'cap-test-22', 'cap-test-23', 'cap-test-24'].includes(h.id)));
  ok('A. kept entries still have their results array intact (not stripped for UI purposes)', historyAfter.every((h) => Array.isArray(h.results) && h.results.length === 1));

  console.log(`${passed} passed, ${failed ? 'some failed' : '0 failed'}`);

  restore(HISTORY_PATH, historyBackup);
  process.exitCode = failed ? 1 : 0;
  // A short settle delay before exit avoids a known Node-on-Windows libuv
  // assertion crash when forcing exit while fetch's keep-alive handles are
  // still winding down — cosmetic only, the restore above already ran.
  await new Promise((r) => setTimeout(r, 200));
  process.exit(process.exitCode);
}

main().catch((err) => {
  console.error('Test script crashed:', err);
  restore(HISTORY_PATH, historyBackup);
  process.exit(1);
});
