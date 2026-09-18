# Job Finder search-reuse behavior — browser test record

`jfFindReusableHistoryEntry` / the reuse check in `runJobFinderSearch()` live
in `public/app.js` (browser-only, not a CommonJS module), so verified via
the Claude Browser tool against the running local dev server with
`window.fetch` mocked — zero real network calls, zero Brave/Google requests.

## Test B — Exact keyword-set reuse (different order)
History has one entry for `Appointment Setter + Virtual Assistant + Customer Support`
(1 hour old, with stored results). Request: `Customer Support + Appointment
Setter + Virtual Assistant` (same 3, different order).
- Expect: results restored from history (not fetched).
- Expect: 0 calls to `/api/job-finder/search`.
- Expect: toast === `"Reused recent search — no new web search was made."`
- Expect: `jfHistory` length unchanged (no duplicate entry created).
**Result: PASS** (2026-09-18)

## Test C — Case/whitespace normalization
History: `"Appointment Setter"`. Requested: `" appointment setter "`.
- Expect: reused, 0 network calls.
**Result: PASS**

## Test D — Duplicate keyword normalization
History: `Appointment Setter + Virtual Assistant`. Requested: `Appointment
Setter + Virtual Assistant + Appointment Setter` (repeat).
- Expect: normalized sets match, reused, 0 network calls.
**Result: PASS**

## Test E — Different keyword set (no reuse)
History: `Appointment Setter + Virtual Assistant`. Requested: `Appointment
Setter + Customer Support`.
- Expect: NOT reused — normal search path taken (1 mocked call to
  `/api/job-finder/search`), no history-derived results returned.
**Result: PASS**

## Test F — Expired history (>24h)
History entry matches exactly but is 25 hours old.
- Expect: NOT reused — normal search path taken (1 mocked call).
**Result: PASS**

## Test G — Legacy history entry (no `results` array)
Legacy-shape entry (`keyword` singular, `resultCount`, no `results`/`keywords`
array) matching the requested keyword.
- Expect: NOT reused — normal search path taken (1 mocked call).
**Result: PASS**

## Test H — Existing restore-after-refresh behavior unaffected
Simulated the one-time page-load restore path (same guard as
`loadJobFinderHistory`) with a fresh history entry and a `jobs` array
containing a matching `sourceUrl`.
- Expect: `jfHasSearched` becomes `true`, results populated from history.
- Expect: `alreadySaved` recalculated fresh against current `jobs` (came
  back `true` for the job that matches).
**Result: PASS**

## Data integrity
`data/jobs.json` (5), `data/jobFinderHistory.json` (17), `data/jobProfile.json`
(11 services) all confirmed byte-identical in count before and after this
entire test session — every `fetch` in these tests was mocked, so the real
server/local files were never touched.

## Regression suites re-run after both changes (Change 1 + Change 2)
- `scripts/test-kai.js` — 82/82
- `scripts/test-employment-compensation.js` — 39/39
- `scripts/test-keyword-groups.js` — 31/31
- `scripts/test-jobfinder-persistence.js` — 15/15 (1 mocked search call, never touched Brave)
- `scripts/test-jobfinder-history-import.js` — 16/16
- `scripts/test-jobfinder-history-cap.js` (new, Change 1) — 6/6
