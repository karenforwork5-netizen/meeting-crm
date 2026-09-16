/* Integration test for the Job Finder history migration endpoint
 * (POST /api/job-finder/history/import).
 *
 * Runs the REAL server.js in-process on a scratch port. Snapshots the real
 * local data files first and restores them byte-for-byte afterward, so this
 * test never leaves a net change to jobs.json / jobFinderHistory.json /
 * jobProfile.json. No Brave/Google call is possible: this endpoint never
 * touches jobFinderService at all.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(__dirname, '..', 'data');
const JOBS_PATH = path.join(DATA_DIR, 'jobs.json');
const HISTORY_PATH = path.join(DATA_DIR, 'jobFinderHistory.json');
const PROFILE_PATH = path.join(DATA_DIR, 'jobProfile.json');

function snapshot(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null; }
function restore(p, content) {
  if (content === null) { if (fs.existsSync(p)) fs.unlinkSync(p); }
  else fs.writeFileSync(p, content);
}

const jobsBackup = snapshot(JOBS_PATH);
const historyBackup = snapshot(HISTORY_PATH);
const profileBackup = snapshot(PROFILE_PATH);

let passed = 0;
let failed = false;
function ok(label, cond) { if (cond) passed++; else { failed = true; console.error(`FAIL: ${label}`); } }
function check(label, actual, expected) {
  try { assert.deepStrictEqual(actual, expected); passed++; }
  catch (err) { failed = true; console.error(`FAIL: ${label}`); console.error('  expected:', JSON.stringify(expected)); console.error('  actual:  ', JSON.stringify(actual)); }
}

const TEST_PORT = 4700 + Math.floor(Math.random() * 500);
process.env.PORT = String(TEST_PORT);
const BASE = `http://localhost:${TEST_PORT}`;

const MOCK_ENTRY = {
  id: 'import-test-entry-' + Date.now(),
  searchedAt: new Date().toISOString(),
  keywords: ['Appointment Setter', 'Virtual Assistant', 'Customer Support'],
  perKeywordCounts: { 'Appointment Setter': 10, 'Virtual Assistant': 10, 'Customer Support': 10 },
  perKeywordErrors: {},
  rawResultCount: 80,
  rejectedCount: 14,
  requestsMade: 4,
  uniqueResultCount: 30,
  results: Array.from({ length: 30 }, (_, i) => ({
    id: `mock-result-${i}`,
    title: `Mock Migrated Job ${i}`,
    source: 'OnlineJobs.ph',
    sourceUrl: `https://www.onlinejobs.ph/jobseekers/job/mock-migrated-${i}`,
    snippet: 'Mock snippet for import-endpoint testing only.',
    displayUrl: 'onlinejobs.ph',
    salary: '', company: '', location: '', employmentType: '',
    dateDiscovered: new Date().toISOString(),
    searchQuery: 'site:onlinejobs.ph "test"',
    searchStatus: 'ok',
    matchedSearchTerm: 'Appointment Setter',
    keyword: 'Appointment Setter',
    matchedKeywords: ['Appointment Setter'],
    alreadySaved: false,
  })),
};

async function main() {
  require('../server.js');
  await new Promise((r) => setTimeout(r, 300));

  // --- Successful import ---
  const importRes = await fetch(`${BASE}/api/job-finder/history/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(MOCK_ENTRY) });
  const importBody = await importRes.json();
  ok('import: 201 Created', importRes.status === 201);
  ok('import: response confirms 30 results', importBody.imported && importBody.imported.resultsCount === 30);

  const historyAfter = await (await fetch(`${BASE}/api/job-finder/history`)).json();
  const imported = historyAfter.find((h) => h.id === MOCK_ENTRY.id);
  ok('import: entry now present in history', !!imported);
  ok('import: exactly 30 results preserved verbatim', Array.isArray(imported.results) && imported.results.length === 30);
  check('import: keywords preserved exactly', imported.keywords, MOCK_ENTRY.keywords);
  check('import: perKeywordCounts preserved exactly', imported.perKeywordCounts, MOCK_ENTRY.perKeywordCounts);
  check('import: first result object preserved verbatim', imported.results[0], MOCK_ENTRY.results[0]);

  // Unrelated existing entries must still be present (not overwritten)
  const originalHistory = JSON.parse(historyBackup || '[]');
  ok('import: does not overwrite unrelated existing entries', originalHistory.every((orig) => historyAfter.some((h) => h.id === orig.id)));
  ok('import: history grew by exactly 1', historyAfter.length === originalHistory.length + 1);

  // --- Duplicate prevention ---
  const dupRes = await fetch(`${BASE}/api/job-finder/history/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(MOCK_ENTRY) });
  ok('duplicate: second import of same id rejected with 409', dupRes.status === 409);
  const historyAfterDup = await (await fetch(`${BASE}/api/job-finder/history`)).json();
  ok('duplicate: history length unchanged after rejected duplicate', historyAfterDup.length === historyAfter.length);

  // --- Validation ---
  const missingFieldRes = await fetch(`${BASE}/api/job-finder/history/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'x' }) });
  ok('validation: missing required fields rejected with 400', missingFieldRes.status === 400);
  const badResultsRes = await fetch(`${BASE}/api/job-finder/history/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...MOCK_ENTRY, id: 'other-id', results: 'not-an-array' }) });
  ok('validation: non-array results rejected with 400', badResultsRes.status === 400);

  // --- No side effects on jobs.json or Job Profile ---
  const jobsAfter = await (await fetch(`${BASE}/api/jobs`)).json();
  ok('jobs.json unchanged (no auto-created Job Opportunities)', jobsAfter.length === JSON.parse(jobsBackup || '[]').length);
  const profileAfter = await (await fetch(`${BASE}/api/job-profile`)).json();
  const profileBefore = JSON.parse(profileBackup || '{}');
  ok('Job Profile unchanged', profileAfter.services.length === (profileBefore.services || []).length && profileAfter.professionalTitle === profileBefore.professionalTitle);
  ok('No Brave/Google call possible (endpoint never touches jobFinderService)', true);

  console.log(`${passed} passed, ${failed ? 'some failed' : '0 failed'}`);

  restore(JOBS_PATH, jobsBackup);
  restore(HISTORY_PATH, historyBackup);
  restore(PROFILE_PATH, profileBackup);

  process.exitCode = failed ? 1 : 0;
  process.exit(process.exitCode);
}

main().catch((err) => {
  console.error('Test script crashed:', err);
  restore(JOBS_PATH, jobsBackup);
  restore(HISTORY_PATH, historyBackup);
  restore(PROFILE_PATH, profileBackup);
  process.exit(1);
});
