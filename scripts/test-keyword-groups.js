const assert = require('assert');
const svc = require('../jobFinderService.js');

let passed = 0;
function check(label, actual, expected) {
  try {
    assert.deepStrictEqual(actual, expected);
    passed++;
  } catch (err) {
    console.error(`FAIL: ${label}`);
    console.error('  expected:', JSON.stringify(expected));
    console.error('  actual:  ', JSON.stringify(actual));
    process.exitCode = 1;
  }
}

// A fake provider search function — NEVER touches https/Brave. Each call is
// scripted to return a fixed page of results for a given search term, so
// these tests exercise real orchestration logic (searchWithVariations)
// against entirely mocked data.
function makeMockSearchFn(pagesByTerm) {
  const calls = [];
  const fn = async (term, remaining) => {
    calls.push(term);
    const page = pagesByTerm[term] || { results: [], rawResultCount: 0, rejectedCount: 0, requestsMade: 1 };
    return { ...page, results: page.results.slice(0, remaining) };
  };
  fn.calls = calls;
  return fn;
}
function mockResult(id) {
  return { title: `Job ${id}`, source: 'OnlineJobs.ph', sourceUrl: `https://www.onlinejobs.ph/jobseekers/job/${id}`, snippet: '', displayUrl: '', salary: '', company: '', location: '', employmentType: '', dateDiscovered: '2026-01-01T00:00:00.000Z', searchQuery: '', searchStatus: 'ok' };
}

(async () => {
  // 1 & 4. One primary keyword, first variation short, second variation used to fill the rest.
  {
    const fn = makeMockSearchFn({
      'Appointment Setter': { results: [mockResult(1), mockResult(2), mockResult(3)], rawResultCount: 5, rejectedCount: 2, requestsMade: 1 },
      'Appointment Setting': { results: [mockResult(4), mockResult(5), mockResult(6), mockResult(7), mockResult(8), mockResult(9), mockResult(10)], rawResultCount: 20, rejectedCount: 0, requestsMade: 1 },
    });
    const r = await svc.searchWithVariations('Appointment Setter', 10, fn);
    check('1&4. first variation short -> second variation used', fn.calls, ['Appointment Setter', 'Appointment Setting']);
    check('1&4. combined result count reaches 10', r.results.length, 10);
    check('1&4. rawResultCount summed across variations', r.rawResultCount, 25);
    check('1&4. rejectedCount summed across variations', r.rejectedCount, 2);
    check('1&4. requestsMade summed across variations', r.requestsMade, 2);
    check('1&4. variationsUsed recorded both', r.variationsUsed, ['Appointment Setter', 'Appointment Setting']);
  }

  // 2. Same URL returned by two variations -> one final result (deduplicated).
  {
    const fn = makeMockSearchFn({
      'Appointment Setter': { results: [mockResult(1), mockResult(2)], rawResultCount: 2, rejectedCount: 0, requestsMade: 1 },
      'Appointment Setting': { results: [mockResult(2), mockResult(3)], rawResultCount: 2, rejectedCount: 0, requestsMade: 1 }, // job 2 duplicated
      'Lead Setter': { results: [mockResult(4)], rawResultCount: 1, rejectedCount: 0, requestsMade: 1 },
      'Appointment Setter Cold Caller': { results: [], rawResultCount: 0, rejectedCount: 0, requestsMade: 1 },
      'Appointment Setter Lead Setter': { results: [], rawResultCount: 0, rejectedCount: 0, requestsMade: 1 },
    });
    const r = await svc.searchWithVariations('Appointment Setter', 10, fn);
    const urls = r.results.map(x => x.sourceUrl);
    check('2. no duplicate URL in final results', new Set(urls).size, urls.length);
    check('2. job 2 appears exactly once', urls.filter(u => u.endsWith('/2')).length, 1);
    check('2. total unique results (1,2,3,4)', r.results.length, 4);
  }

  // 3. Ten valid jobs found on first variation -> later variations NOT searched.
  {
    const tenResults = Array.from({ length: 10 }, (_, i) => mockResult(100 + i));
    const fn = makeMockSearchFn({
      'Appointment Setter': { results: tenResults, rawResultCount: 20, rejectedCount: 0, requestsMade: 1 },
      'Appointment Setting': { results: [mockResult(999)], rawResultCount: 1, rejectedCount: 0, requestsMade: 1 }, // must never be called
    });
    const r = await svc.searchWithVariations('Appointment Setter', 10, fn);
    check('3. only first variation called', fn.calls, ['Appointment Setter']);
    check('3. exactly 10 results returned', r.results.length, 10);
    check('3. requestsMade reflects only 1 variation search', r.requestsMade, 1);
  }

  // 5. Final result count never exceeds 10, even if variations together would produce more.
  {
    const fn = makeMockSearchFn({
      'Virtual Assistant': { results: Array.from({ length: 8 }, (_, i) => mockResult(200 + i)), rawResultCount: 20, rejectedCount: 0, requestsMade: 1 },
      'Virtual Assistant Remote': { results: Array.from({ length: 8 }, (_, i) => mockResult(300 + i)), rawResultCount: 20, rejectedCount: 0, requestsMade: 1 },
    });
    const r = await svc.searchWithVariations('Virtual Assistant', 10, fn);
    check('5. capped at 10 despite 16 available across variations', r.results.length, 10);
  }

  // 6. matchedSearchTerm is accurate per result.
  {
    const fn = makeMockSearchFn({
      'Customer Support': { results: [mockResult(400)], rawResultCount: 1, rejectedCount: 0, requestsMade: 1 },
      'Customer Service': { results: [mockResult(401)], rawResultCount: 1, rejectedCount: 0, requestsMade: 1 },
    });
    const r = await svc.searchWithVariations('Customer Support', 10, fn);
    const byId = Object.fromEntries(r.results.map(x => [x.sourceUrl, x.matchedSearchTerm]));
    check('6. matchedSearchTerm for job 400', byId['https://www.onlinejobs.ph/jobseekers/job/400'], 'Customer Support');
    check('6. matchedSearchTerm for job 401', byId['https://www.onlinejobs.ph/jobseekers/job/401'], 'Customer Service');
  }

  // 7. Existing primary keyword behavior unchanged for a keyword with no group (custom user keyword).
  {
    const fn = makeMockSearchFn({
      'Bookkeeping': { results: [mockResult(500)], rawResultCount: 1, rejectedCount: 0, requestsMade: 1 },
    });
    const r = await svc.searchWithVariations('Bookkeeping', 10, fn);
    check('7. ungrouped keyword only searches itself', fn.calls, ['Bookkeeping']);
    check('7. ungrouped keyword result intact', r.results.length, 1);
  }
  // 7b. A grouped keyword whose first variation alone already reaches the target behaves identically to before (single call).
  {
    const tenResults = Array.from({ length: 10 }, (_, i) => mockResult(600 + i));
    const fn = makeMockSearchFn({ 'Data Entry': { results: tenResults, rawResultCount: 20, rejectedCount: 0, requestsMade: 1 } });
    const r = await svc.searchWithVariations('Data Entry', 10, fn);
    check('7b. primary-keyword-only path when first variation suffices', fn.calls, ['Data Entry']);
  }

  // All 12 groups exist and exactly match the approved variation lists (verbatim, in order).
  {
    const EXPECTED_GROUPS = {
      'Appointment Setter': ['Appointment Setter', 'Appointment Setting', 'Lead Setter', 'Appointment Setter Cold Caller', 'Appointment Setter Lead Setter'],
      'Virtual Assistant': ['Virtual Assistant', 'Virtual Assistant Remote', 'General Virtual Assistant', 'Administrative Virtual Assistant', 'Virtual Assistant Customer Support'],
      'Customer Support': ['Customer Support', 'Customer Service', 'Customer Service Representative', 'Customer Support Representative', 'Customer Care'],
      'CRM Management': ['CRM Management', 'CRM Specialist', 'CRM Manager', 'CRM Administrator', 'CRM Management Specialist'],
      'CRM Setup & Automation': ['CRM Setup', 'CRM Automation', 'CRM Setup Specialist', 'CRM Automation Specialist', 'CRM Implementation'],
      'Lead Follow-Up': ['Lead Follow-Up', 'Lead Follow Up', 'Lead Nurturing', 'Lead Reactivation', 'Lead Follow-Up Specialist'],
      'AI & Automation': ['AI Automation', 'AI & Automation', 'AI Automation Specialist', 'AI Workflow Automation', 'AI Operations'],
      'Workflow Automation': ['Workflow Automation', 'Workflow Automation Specialist', 'Business Process Automation', 'Automation Specialist', 'Workflow Specialist'],
      'Process Optimization': ['Process Optimization', 'Process Improvement', 'Business Process Improvement', 'Operations Optimization', 'Process Improvement Specialist'],
      'Lead Generation': ['Lead Generation', 'Lead Generation Specialist', 'Lead Gen', 'Lead Generation VA', 'Lead Generation Specialist Remote'],
      'Data Entry': ['Data Entry', 'Data Entry Specialist', 'Data Entry VA', 'Administrative Data Entry', 'Data Entry Clerk'],
      'Sales Support': ['Sales Support', 'Sales Assistant', 'Sales Coordinator', 'Sales Support Specialist', 'Sales Operations Assistant'],
    };
    check('All 12 groups defined', Object.keys(svc.KEYWORD_GROUPS).sort(), Object.keys(EXPECTED_GROUPS).sort());
    for (const primary of Object.keys(EXPECTED_GROUPS)) {
      check(`Group "${primary}" matches approved variations exactly`, svc.KEYWORD_GROUPS[primary], EXPECTED_GROUPS[primary]);
    }
  }

  console.log(`${passed} passed, ${process.exitCode ? 'some failed' : '0 failed'}`);
})();
