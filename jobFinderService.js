/* Job Finder — server-side search integrations (Google, Brave).
 *
 * This module is the ONLY place that talks to these search APIs. It never
 * runs in the browser, so no API key/search-engine ID ever leaves the
 * server. It performs a site-restricted search (site:onlinejobs.ph "<keyword>")
 * using real, documented search APIs — no invented endpoint or schema, no
 * scraping, no browser automation, no login.
 *
 * Every returned field is either present in the provider's response or left
 * empty/"" — nothing here fabricates a salary, company, or location.
 */
const https = require('https');

const SEARCH_HOST = 'www.googleapis.com';
const SEARCH_PATH = '/customsearch/v1';
const BRAVE_HOST = 'api.search.brave.com';
const BRAVE_PATH = '/res/v1/web/search';
const MAX_RESULTS_PER_KEYWORD = 10; // Google's own per-request maximum ("num"); also the cap we apply to Brave

function isGoogleConfigured() {
  return !!(process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CLIENT_ID);
}

function isBraveConfigured() {
  return !!process.env.BRAVE_SEARCH_API_KEY;
}

function isConfigured() {
  return isBraveConfigured() || isGoogleConfigured();
}

function httpsGetJson(hostname, pathWithQuery, extraHeaders, providerLabel) {
  return new Promise((resolve, reject) => {
    const req = https.get({ hostname, path: pathWithQuery, headers: { Accept: 'application/json', ...extraHeaders } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(data); } catch (e) { return reject(new Error(`Invalid response from ${providerLabel} Search API.`)); }
        if (res.statusCode >= 400) {
          const msg = (parsed.error && (parsed.error.message || parsed.error.detail)) || parsed.message || `${providerLabel} Search API returned status ${res.statusCode}.`;
          return reject(new Error(msg));
        }
        resolve(parsed);
      });
    });
    req.on('error', (err) => reject(new Error(err.message || `${providerLabel} Search API request failed.`)));
    req.setTimeout(10000, () => req.destroy(new Error(`${providerLabel} Search API request timed out.`)));
  });
}

function isOnlineJobsUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    return host === 'onlinejobs.ph' || host.endsWith('.onlinejobs.ph');
  } catch { return false; }
}

// OnlineJobs.ph's actual individual job-post URLs all live at
// /jobseekers/job/<id-or-slug> (observed directly in real search results:
// e.g. /jobseekers/job/1622897, /jobseekers/job/Appointment-Setter-...-1621957).
// Everything else on the domain — /jobseekers/search/c/<category>,
// /jobseekers/jobsearch (the search-results page itself), /hire/<category>
// (employer-facing category pages), profile pages, etc. — is a directory or
// search page, not a job opportunity, and must never be treated as one. This
// is a structural path check against the real, observed URL shape — never a
// guess based on title or snippet content.
function isIndividualJobPostingUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    return /^\/jobseekers\/job\/[^\/?#]+\/?$/i.test(pathname);
  } catch { return false; }
}
function isValidJobResultUrl(url) {
  return !!url && isOnlineJobsUrl(url) && isIndividualJobPostingUrl(url);
}

// Google's generic web search doesn't reliably return structured job fields —
// this only surfaces a value when the page actually exposed it via metatags
// in Google's own index (pagemap). It is never guessed or synthesized.
function extractMeta(item, keys) {
  const tags = item.pagemap && Array.isArray(item.pagemap.metatags) && item.pagemap.metatags[0];
  if (!tags) return '';
  for (const k of keys) { if (tags[k]) return String(tags[k]); }
  return '';
}

async function searchJobsByKeywordGoogle(keyword, maxResults) {
  const trimmedKeyword = (keyword || '').trim();
  if (!trimmedKeyword) throw new Error('A keyword is required.');
  const num = Math.min(MAX_RESULTS_PER_KEYWORD, Math.max(1, Number(maxResults) || MAX_RESULTS_PER_KEYWORD));
  const searchQuery = `site:onlinejobs.ph "${trimmedKeyword}"`;
  const params = new URLSearchParams({
    key: process.env.GOOGLE_SEARCH_API_KEY,
    cx: process.env.GOOGLE_SEARCH_CLIENT_ID,
    num: String(num),
    q: searchQuery,
  });
  const data = await httpsGetJson(SEARCH_HOST, `${SEARCH_PATH}?${params.toString()}`, {}, 'Google');
  const items = Array.isArray(data.items) ? data.items : [];
  const now = new Date().toISOString();
  const rejectedCount = items.filter((it) => it.link && isOnlineJobsUrl(it.link) && !isIndividualJobPostingUrl(it.link)).length;
  const results = items
    .filter((it) => isValidJobResultUrl(it.link))
    .slice(0, num)
    .map((it) => ({
      title: it.title || 'Not available',
      source: 'OnlineJobs.ph',
      sourceUrl: it.link,
      snippet: it.snippet || '',
      displayUrl: it.displayLink || '',
      salary: extractMeta(it, ['salary']) || '',
      company: extractMeta(it, ['company', 'og:site_name']) || '',
      location: extractMeta(it, ['location']) || '',
      employmentType: '',
      dateDiscovered: now,
      searchQuery,
      searchStatus: 'ok',
    }));
  return { results, rawResultCount: items.length, rejectedCount, requestsMade: 1 };
}

const BRAVE_INITIAL_COUNT = 20; // request a bigger first page so 10 valid postings usually fit in ONE request
const BRAVE_MAX_REQUESTS = 2;   // 1 initial + at most 1 backfill request, per keyword — never more, never blind

// Brave Web Search API (https://api.search.brave.com/res/v1/web/search).
// Brave's generic web results don't include structured job metadata, so
// salary/company/location are left empty unless a future need justifies
// parsing them from the snippet — never guessed.
//
// Some raw results are OnlineJobs.ph category/search pages, not individual
// job posts (isIndividualJobPostingUrl rejects those). Requesting 20 results
// up front — rather than exactly the 10 we want — means a handful of
// rejected category pages usually still leaves 10+ valid postings in that
// SAME request, so no second request is needed at all. A backfill request
// (Brave's own `offset` param, real and documented) is only issued if the
// first page still comes up short after filtering + dedup, and even then at
// most once — this never blindly fires a second/third request per keyword,
// and never fabricates a replacement for a rejected result.
async function searchJobsByKeywordBrave(keyword, maxResults) {
  const trimmedKeyword = (keyword || '').trim();
  if (!trimmedKeyword) throw new Error('A keyword is required.');
  const num = Math.min(MAX_RESULTS_PER_KEYWORD, Math.max(1, Number(maxResults) || MAX_RESULTS_PER_KEYWORD));
  const searchQuery = `site:onlinejobs.ph "${trimmedKeyword}"`;
  const now = new Date().toISOString();

  const results = [];
  const seenUrls = new Set(); // de-dupes within this keyword's own pages before the 10-slot cap is applied
  let rawResultCount = 0;
  let rejectedCount = 0;
  let requestsMade = 0;
  let offset = 0;

  while (results.length < num && requestsMade < BRAVE_MAX_REQUESTS) {
    const params = new URLSearchParams({ q: searchQuery, count: String(BRAVE_INITIAL_COUNT), offset: String(offset) });
    const data = await httpsGetJson(
      BRAVE_HOST,
      `${BRAVE_PATH}?${params.toString()}`,
      { 'X-Subscription-Token': process.env.BRAVE_SEARCH_API_KEY },
      'Brave'
    );
    requestsMade++;
    const items = (data.web && Array.isArray(data.web.results)) ? data.web.results : [];
    rawResultCount += items.length;
    if (!items.length) break; // Brave has nothing further to offer for this keyword

    for (const it of items) {
      if (results.length >= num) break; // step 9 — stop as soon as we have enough, don't keep scanning
      if (!isValidJobResultUrl(it.url)) {
        if (it.url && isOnlineJobsUrl(it.url)) rejectedCount++; // an OnlineJobs.ph page, just not a job post
        continue;
      }
      if (seenUrls.has(it.url)) continue; // exact duplicate within this keyword's own results
      seenUrls.add(it.url);
      results.push({
        title: it.title || 'Not available',
        source: 'OnlineJobs.ph',
        sourceUrl: it.url,
        snippet: it.description || '',
        displayUrl: (it.meta_url && it.meta_url.hostname) || '',
        salary: '',
        company: '',
        location: '',
        employmentType: '',
        dateDiscovered: now,
        searchQuery,
        searchStatus: 'ok',
      });
    }

    if (items.length < BRAVE_INITIAL_COUNT) break; // short page — Brave has no further results available
    offset++;
  }

  return { results: results.slice(0, num), rawResultCount, rejectedCount, requestsMade };
}

// Phase 2I — search variation groups for the 12 approved primary keywords.
// A group's own primary keyword is always variations[0], so a primary
// keyword's search behaves EXACTLY as before whenever its first variation
// alone already reaches the target count — variations are only an
// additional discovery aid for the (real, already-observed) case where a
// keyword's phrasing under-returns valid postings. A keyword not in this
// map (e.g. a custom one the user typed) has no group and searches exactly
// as it always has.
const KEYWORD_GROUPS = {
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

function normalizeUrlForGroupDedup(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const pathname = u.pathname.replace(/\/+$/, '');
    return `${host}${pathname}`.toLowerCase();
  } catch { return String(url).trim().toLowerCase(); }
}

/* Searches OnlineJobs.ph for a primary keyword, trying its known search
 * variations (in order) ONLY as far as needed to reach `maxResults` valid,
 * deduplicated postings — stops immediately once enough are collected, so a
 * keyword whose first variation already succeeds never triggers a second
 * search. Each variation's own query still goes through the existing,
 * unchanged 20-result-initial + bounded-backfill logic. A result keeps the
 * PRIMARY keyword as `keyword` (what the user searched) and records which
 * exact phrasing found it in `matchedSearchTerm` (internal — not required
 * reading for the main table). */
async function searchWithVariations(primaryKeyword, maxResults, searchFn) {
  const num = Math.min(MAX_RESULTS_PER_KEYWORD, Math.max(1, Number(maxResults) || MAX_RESULTS_PER_KEYWORD));
  const variations = KEYWORD_GROUPS[primaryKeyword] || [primaryKeyword];

  const results = [];
  const seenUrls = new Set();
  let rawResultCount = 0;
  let rejectedCount = 0;
  let requestsMade = 0;
  const variationsUsed = [];

  for (const variation of variations) {
    if (results.length >= num) break; // already have enough — do not search remaining variations
    const remaining = num - results.length;
    const page = await searchFn(variation, remaining);
    variationsUsed.push(variation);
    requestsMade += page.requestsMade;
    rawResultCount += page.rawResultCount;
    rejectedCount += page.rejectedCount;
    for (const item of page.results) {
      if (results.length >= num) break;
      const key = normalizeUrlForGroupDedup(item.sourceUrl);
      if (seenUrls.has(key)) continue; // same job already found under an earlier variation
      seenUrls.add(key);
      results.push({ ...item, matchedSearchTerm: variation });
    }
  }

  return { results: results.slice(0, num), rawResultCount, rejectedCount, requestsMade, variationsUsed };
}

/* Searches OnlineJobs.ph for a single keyword (expanding to its search-
 * variation group when one exists). Returns { results, rawResultCount,
 * rejectedCount, requestsMade, variationsUsed } — up to maxResults (capped
 * at 10) real, individual job postings, never padded with invented data.
 * Prefers Brave when configured (the active provider), falls back to
 * Google, and throws NOT_CONFIGURED if neither is set up, so callers can
 * distinguish "not configured" from "zero results". */
async function searchJobsByKeyword(keyword, maxResults) {
  if (isBraveConfigured()) return searchWithVariations(keyword, maxResults, searchJobsByKeywordBrave);
  if (isGoogleConfigured()) return searchWithVariations(keyword, maxResults, searchJobsByKeywordGoogle);
  const err = new Error('Search integration is not configured yet.');
  err.code = 'NOT_CONFIGURED';
  throw err;
}

module.exports = {
  isConfigured,
  isGoogleConfigured,
  isBraveConfigured,
  searchJobsByKeyword,
  searchJobsByKeywordGoogle,
  searchJobsByKeywordBrave,
  searchWithVariations,
  KEYWORD_GROUPS,
  isOnlineJobsUrl,
  isIndividualJobPostingUrl,
  isValidJobResultUrl,
  MAX_RESULTS_PER_KEYWORD,
};
