/* Integration test for Job Finder result persistence (Phase 2J).
 *
 * Runs the REAL server.js in-process with jobFinderService.searchJobsByKeyword
 * monkey-patched to a mock (no Brave/Google network calls, no API credits
 * consumed). Snapshots the real local data files first and restores them
 * byte-for-byte afterward, so this test never leaves a net change to
 * jobs.json / jobFinderHistory.json / jobFinderKeywords.json.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const DATA_DIR = path.join(__dirname, '..', 'data');
const JOBS_PATH = path.join(DATA_DIR, 'jobs.json');
const HISTORY_PATH = path.join(DATA_DIR, 'jobFinderHistory.json');
const KEYWORDS_PATH = path.join(DATA_DIR, 'jobFinderKeywords.json');

function snapshot(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null; }
function restore(p, content) {
  if (content === null) { if (fs.existsSync(p)) fs.unlinkSync(p); }
  else fs.writeFileSync(p, content);
}

const jobsBackup = snapshot(JOBS_PATH);
const historyBackup = snapshot(HISTORY_PATH);
const keywordsBackup = snapshot(KEYWORDS_PATH);

let passed = 0;
let failed = false;
function check(label, actual, expected) {
  try { assert.deepStrictEqual(actual, expected); passed++; }
  catch (err) {
    failed = true;
    console.error(`FAIL: ${label}`);
    console.error('  expected:', JSON.stringify(expected));
    console.error('  actual:  ', JSON.stringify(actual));
  }
}
function ok(label, cond) {
  if (cond) { passed++; }
  else { failed = true; console.error(`FAIL: ${label}`); }
}

const MOCK_KEYWORD = '__test_persistence_keyword__';
const MOCK_RESULTS = [
  { title: 'Mock Appointment Setter Job 1', source: 'OnlineJobs.ph', sourceUrl: 'https://www.onlinejobs.ph/jobseekers/job/mock-1', snippet: 'Full-time, $5/hr, mock listing for testing only.', displayUrl: 'onlinejobs.ph', salary: '', company: '', location: '', employmentType: '', dateDiscovered: new Date().toISOString(), searchQuery: `site:onlinejobs.ph "${MOCK_KEYWORD}"`, searchStatus: 'ok' },
  { title: 'Mock Appointment Setter Job 2', source: 'OnlineJobs.ph', sourceUrl: 'https://www.onlinejobs.ph/jobseekers/job/mock-2', snippet: 'Part-time, $800/month, mock listing for testing only.', displayUrl: 'onlinejobs.ph', salary: '', company: '', location: '', employmentType: '', dateDiscovered: new Date().toISOString(), searchQuery: `site:onlinejobs.ph "${MOCK_KEYWORD}"`, searchStatus: 'ok' },
];

// Monkey-patch BEFORE requiring server.js — server.js requires the same
// cached module object, so its route handler calls this mock, never the
// real Brave/Google HTTPS logic.
const jobFinderService = require('../jobFinderService.js');
let realSearchCallCount = 0;
jobFinderService.searchJobsByKeyword = async (keyword, maxResults) => {
  realSearchCallCount++;
  return { results: MOCK_RESULTS.slice(0, maxResults), rawResultCount: MOCK_RESULTS.length, rejectedCount: 0, requestsMade: 1 };
};
jobFinderService.isConfigured = () => true;
jobFinderService.isBraveConfigured = () => true;

const TEST_PORT = 4321 + Math.floor(Math.random() * 500);
process.env.PORT = String(TEST_PORT);
const BASE = `http://localhost:${TEST_PORT}`;

async function main() {
  require('../server.js'); // starts listening on TEST_PORT
  await new Promise(r => setTimeout(r, 300)); // let the server bind

  // --- A. Successful search persists result objects ---
  const addKwRes = await fetch(`${BASE}/api/job-finder/keywords`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keyword: MOCK_KEYWORD }) });
  ok('A. keyword added', addKwRes.status === 201 || addKwRes.status === 200);

  const searchRes = await fetch(`${BASE}/api/job-finder/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keywords: [MOCK_KEYWORD], resultsPerKeyword: 10 }) });
  const searchBody = await searchRes.json();
  ok('A. search succeeded', searchRes.status === 200);
  ok('A. search returned 2 results', searchBody.results.length === 2);
  check('H. 10-per-keyword cap unchanged (mock returns fewer, cap logic untouched)', jobFinderService.MAX_RESULTS_PER_KEYWORD, 10);

  // --- B. GET history returns persisted results ---
  const historyRes = await fetch(`${BASE}/api/job-finder/history`);
  const historyBody = await historyRes.json();
  const latestEntry = historyBody[0];
  ok('B. latest history entry has a results array', Array.isArray(latestEntry.results));
  ok('B. latest history entry results length matches search', latestEntry.results.length === 2);
  check('K. existing history metadata intact', {
    keywords: latestEntry.keywords, rawResultCount: latestEntry.rawResultCount,
    uniqueResultCount: latestEntry.uniqueResultCount, perKeywordCounts: latestEntry.perKeywordCounts,
  }, {
    keywords: [MOCK_KEYWORD], rawResultCount: 2, uniqueResultCount: 2, perKeywordCounts: { [MOCK_KEYWORD]: 2 },
  });
  // Persisted result objects preserve their real fields (title/source/sourceUrl/snippet/etc.)
  check('B. persisted result fields match what was returned', latestEntry.results.map(r => r.sourceUrl).sort(), MOCK_RESULTS.map(r => r.sourceUrl).sort());

  // --- I & J: employment/compensation extraction and CV matching are UNCHANGED
  // by this feature — they are computed client-side (app.js) from the exact
  // same raw fields (title/snippet) this test confirms are persisted intact.
  // Verified here structurally: the persisted objects still carry the raw
  // `title`/`snippet` text the extraction/matching engines depend on, with
  // no employmentType/matchScore baked in server-side (i.e. this feature did
  // not move that logic or duplicate it here).
  ok('I/J. persisted objects carry raw title/snippet (extraction runs client-side, unchanged)', latestEntry.results.every(r => typeof r.title === 'string' && typeof r.snippet === 'string'));
  ok('I/J. persisted objects do NOT carry server-computed matchScore/employmentType (confirms no duplication of client logic)', latestEntry.results.every(r => r.matchScore === undefined && r.employmentType === ''));

  // --- E. Old history entries without a results array remain compatible ---
  const legacyEntry = { id: 'legacy-test-entry', keyword: 'Legacy Keyword', resultCount: 3, searchedAt: new Date().toISOString(), error: null };
  const currentHistory = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf-8'));
  fs.writeFileSync(HISTORY_PATH, JSON.stringify([legacyEntry, ...currentHistory], null, 2));
  const historyRes2 = await fetch(`${BASE}/api/job-finder/history`);
  const historyBody2 = await historyRes2.json();
  ok('E. legacy entry (no results field) still returned by GET history', historyBody2.some(h => h.id === 'legacy-test-entry' && h.results === undefined));

  // --- F & G: Save still requires an explicit action; restoring/searching never auto-creates a Job Opportunity ---
  const jobsAfterSearch = await (await fetch(`${BASE}/api/jobs`)).json();
  const jobsBeforeCount = JSON.parse(jobsBackup || '[]').length;
  ok('G. no Job Opportunity was auto-created merely by searching/persisting results', jobsAfterSearch.length === jobsBeforeCount);
  const saveRes = await fetch(`${BASE}/api/jobs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: MOCK_RESULTS[0].title, sourceUrl: MOCK_RESULTS[0].sourceUrl, source: 'OnlineJobs.ph', status: 'Saved' }) });
  const savedJob = await saveRes.json();
  ok('F. explicit Save creates exactly one Job Opportunity', saveRes.status === 201);
  const jobsAfterSave = await (await fetch(`${BASE}/api/jobs`)).json();
  ok('F. job count increased by exactly 1 after explicit save', jobsAfterSave.length === jobsBeforeCount + 1);
  // cleanup the test-created job immediately
  await fetch(`${BASE}/api/jobs/${savedJob.id}`, { method: 'DELETE' });
  const jobsAfterCleanup = await (await fetch(`${BASE}/api/jobs`)).json();
  ok('cleanup: test job removed, count back to original', jobsAfterCleanup.length === jobsBeforeCount);

  // cleanup the test keyword
  const keywordsNow = await (await fetch(`${BASE}/api/job-finder/keywords`)).json();
  const testKw = keywordsNow.find(k => k.keyword === MOCK_KEYWORD);
  if (testKw) await fetch(`${BASE}/api/job-finder/keywords/${testKw.id}`, { method: 'DELETE' });

  console.log(`${passed} passed, ${failed ? 'some failed' : '0 failed'}`);
  console.log(`Real search function calls made (should be small, mocked, never touched Brave): ${realSearchCallCount}`);

  // Restore original data files byte-for-byte — net-zero effect on local data.
  restore(JOBS_PATH, jobsBackup);
  restore(HISTORY_PATH, historyBackup);
  restore(KEYWORDS_PATH, keywordsBackup);

  process.exitCode = failed ? 1 : 0;
  process.exit(process.exitCode);
}

main().catch(err => {
  console.error('Test script crashed:', err);
  restore(JOBS_PATH, jobsBackup);
  restore(HISTORY_PATH, historyBackup);
  restore(KEYWORDS_PATH, keywordsBackup);
  process.exit(1);
});
