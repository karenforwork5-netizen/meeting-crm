# Job Finder bulk-save selection behavior — manual/browser test record

This behavior lives entirely in `public/app.js` (browser-only globals, not a
CommonJS module), so it's verified via the Claude Browser tool against the
running local dev server with `window.fetch` mocked — never a real
`/api/jobs` write, never Brave/Google. Recorded here for repeatability.

Functions under test: `saveJobFinderResult(result)`, `saveSelectedJobFinderResults()`.

## Test 1 — All succeed
3 selected results, all POST /api/jobs mocked to succeed (201).
- Expect: `jfSelectedIds` empty afterward.
- Expect: all 3 results have `alreadySaved === true`.
- Expect: toast === `"Saved 3 jobs."`
**Result: PASS** (2026-09-18)

## Test 2 — Mixed success/failure
3 selected (`b1`, `b2`, `b3`); `b2`'s POST mocked to fail (500), others succeed.
- Expect: `jfSelectedIds` === `{'b2'}` only.
- Expect: `b1.alreadySaved === true`, `b2.alreadySaved === false`, `b3.alreadySaved === true`.
- Expect: toast === `"Saved 2 jobs. 1 failed and remain selected for retry."`
**Result: PASS** (2026-09-18)

## Test 3 — All fail
2 selected (`e1`, `e2`); POST /api/jobs mocked to fail (500) for both.
- Expect: `jfSelectedIds` unchanged, still `{'e1','e2'}`.
- Expect: neither marked `alreadySaved`.
- Expect: toast === `"No jobs were saved. 2 failed and remain selected for retry."`
**Result: PASS** (2026-09-18)

## Test 4 — Individual Save (row/detail-panel) still works — success case
Calling `saveJobFinderResult(result)` directly (not via bulk), POST succeeds.
- Expect: returns `true`.
- Expect: `result.alreadySaved === true`.
- Expect: toast === `Saved "Test Job d1" to Job Opportunities` (unchanged wording).
**Result: PASS** (2026-09-18)

## Test 5 — Individual Save still works — failure case
Same as Test 4, POST mocked to fail (400, `title is required`).
- Expect: returns `false`.
- Expect: `result.alreadySaved` stays `false`.
- Expect: toast === the server's own error message (unchanged behavior).
**Result: PASS** (2026-09-18)

## Regression suites also re-run after this change
- `scripts/test-kai.js` — 82/82 passed
- `scripts/test-employment-compensation.js` — 39/39 passed
- `scripts/test-keyword-groups.js` — 31/31 passed
