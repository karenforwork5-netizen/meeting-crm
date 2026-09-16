/* One-time migration script — sends the latest local Job Finder history
 * entry (with its already-discovered `results`) to a target server's
 * POST /api/job-finder/history/import endpoint.
 *
 * Never calls Brave/Google, never re-runs a search, never modifies the
 * local history file (read-only). Intended for a single, deliberate run
 * against a specific target URL, passed explicitly — never guesses or
 * defaults to production.
 *
 * Usage:
 *   node scripts/migrate-jobfinder-history.js <target-base-url>
 *   node scripts/migrate-jobfinder-history.js http://localhost:4000
 *   node scripts/migrate-jobfinder-history.js https://karen-crm-production.up.railway.app
 */
const fs = require('fs');
const path = require('path');

const HISTORY_PATH = path.join(__dirname, '..', 'data', 'jobFinderHistory.json');
const EXPECTED_RESULT_COUNT = 30;

async function main() {
  const targetBaseUrl = process.argv[2];
  if (!targetBaseUrl) {
    console.error('Usage: node scripts/migrate-jobfinder-history.js <target-base-url>');
    console.error('Example: node scripts/migrate-jobfinder-history.js http://localhost:4000');
    process.exit(1);
  }

  const raw = fs.readFileSync(HISTORY_PATH, 'utf-8'); // read-only — never rewritten
  const history = JSON.parse(raw);
  if (!history.length) {
    console.error('No local Job Finder history entries found. Nothing to migrate.');
    process.exit(1);
  }

  // Select the latest entry by searchedAt (not just history[0]) — defensive
  // against any future case where insertion order and recency could diverge.
  const latest = history.reduce((a, b) => (new Date(b.searchedAt) > new Date(a.searchedAt) ? b : a));

  console.log('Selected local history entry:');
  console.log('  id:', latest.id);
  console.log('  searchedAt:', latest.searchedAt);
  console.log('  keywords:', (latest.keywords || []).join(', '));
  console.log('  perKeywordCounts:', JSON.stringify(latest.perKeywordCounts));
  console.log('  rawResultCount:', latest.rawResultCount, '| rejectedCount:', latest.rejectedCount, '| requestsMade:', latest.requestsMade);
  console.log('  uniqueResultCount (recorded):', latest.uniqueResultCount);
  console.log('  actual results array length:', Array.isArray(latest.results) ? latest.results.length : '(missing)');

  if (!Array.isArray(latest.results) || latest.results.length !== EXPECTED_RESULT_COUNT) {
    console.error(`Aborting — expected exactly ${EXPECTED_RESULT_COUNT} results in the latest entry, found ${Array.isArray(latest.results) ? latest.results.length : 'no results array'}.`);
    process.exit(1);
  }

  console.log(`\nSending this exact entry (unmodified) to ${targetBaseUrl}/api/job-finder/history/import ...`);
  const res = await fetch(`${targetBaseUrl}/api/job-finder/history/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(latest),
  });
  const body = await res.json().catch(() => ({}));
  console.log('Response status:', res.status);
  console.log('Response body:', JSON.stringify(body, null, 2));

  if (res.status === 409) {
    console.log('\nThis entry was already imported previously (duplicate id) — no change made.');
    process.exit(0);
  }
  if (!res.ok) {
    console.error('\nMigration failed — target did not accept the entry.');
    process.exit(1);
  }
  console.log('\nMigration succeeded.');
}

main().catch((err) => {
  console.error('Migration script crashed:', err.message);
  process.exit(1);
});
