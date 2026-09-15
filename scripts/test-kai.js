/* Regression test for Kai's text-understanding engine (public/kai-engine.js).
 *
 * Run after ANY change to kai-engine.js (the keyword rule table, the
 * pronoun-reference regex, or contact-resolution logic):
 *
 *   node scripts/test-kai.js
 *
 * This does NOT need a browser or the running server — kai-engine.js has
 * no DOM/fetch dependency, so it's required directly under plain Node.
 * Exits non-zero if anything fails, so it can also be wired into a
 * pre-commit hook or CI step later if this project ever wants one.
 */
const assert = require('assert');
const { kaiMatchFreeText, kaiTextReferencesContact, kaiResolveContactFromText } = require('../public/kai-engine.js');

let passed = 0;
let failed = 0;

function check(description, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
  } else {
    failed++;
    console.log(`FAIL  ${description}`);
    console.log(`      expected: ${JSON.stringify(expected)}`);
    console.log(`      actual:   ${JSON.stringify(actual)}`);
  }
}

/* ---- kaiMatchFreeText: question -> expected handler key (or null) ----
   Pulled from the CRM-wide copilot spec's own test-case list, plus every
   question that was found broken during manual testing (see comments). */
const MATCH_CASES = [
  // Spec's final test cases
  ['How many leads do I have?', 'totalLeads'],
  ['Which lead source is performing best?', 'sourcePerformance'],
  ['Who needs follow-up today?', 'dueTodayFollowups'],
  ['What tasks are overdue?', 'overdueTasks'],
  ['What appointments do I have tomorrow?', 'weekAppointments'],
  ['How much money is outstanding?', 'outstandingInvoices'],
  ['Which documents do I have?', 'documentsList'],
  ['Which projects are overdue?', 'projectsOverdue'],
  ["What's my pipeline value?", 'pipelineValue'],
  ['Which leads haven\'t been contacted?', null], // handled as a conversational refinement, not a standalone handler
  ['Why is my conversion rate low?', 'explainConversion'],
  ["Who hasn't replied?", 'waitingForReply'],
  ['What should I prioritize today?', 'prioritize'],
  ['What happened this week?', 'weekSummary'],
  ['Compare my current pipeline with the previous period.', 'comparePeriod'],

  // Extra coverage from the original page-context suggestion chips
  ['What needs my attention today?', 'needsAttention'],
  ["Which leads are overdue?", 'overdueFollowups'],
  ["Which opportunities are worth the most?", 'stageCounts'],
  ['Which contacts came from LinkedIn?', 'bySource'],
  ['Show contacts needing follow-up.', 'allFollowups'],
  ["What's coming up this week?", 'weekSummary'],
  ['Show me high-priority tasks.', 'highPriorityTasks'],
  ['Which follow-ups are overdue?', 'overdueFollowups'],
  ['Which tasks should I prioritize?', 'prioritize'],
  ['Which invoices are overdue?', 'overdueInvoices'],
  ['What payments are due?', 'outstandingInvoices'],
  ["What's my busiest day?", 'busiestDay'],
  ['Which pipeline stage has the most leads?', 'stageCounts'],

  // Regressions caught during manual testing — keep these pinned so a future
  // rule-table change can't silently reintroduce them.
  ['Who needs follow-up?', 'allFollowups'],       // bare "follow-up", no "today"/"overdue" qualifier
  ['Who owes me money?', 'billingWhoOwes'],
  ["Who hasn't paid?", 'billingWhoOwes'],

  // Billing
  ['Do I have any overdue invoices?', 'overdueInvoices'],
  ['Show me unpaid invoices.', 'outstandingInvoices'],
  ['How much have I collected?', 'outstandingInvoices'],
  ['Which client owes the most?', 'billingWhoOwes'],

  // Pipeline / Analytics
  ['Where are my leads getting stuck?', 'stuckLeads'],
  ['Which leads are stuck?', 'stuckLeads'],
  ['How is my pipeline performing?', 'pipelineValue'],
  ['What is my current pipeline value?', 'pipelineValue'],
  ['Which source generated the most leads?', 'sourcePerformance'],
  ["What's my conversion rate?", 'conversionRate'],

  // Follow-ups / Tasks phrasing variety
  ['Who should I contact today?', 'dueTodayFollowups'],
  ['Which leads need reactivation?', 'overdueFollowups'],
  ['Show me my upcoming follow-ups.', null], // "upcoming" isn't paired with "follow" in the rule table yet — documents current gap
  ['What should I work on first?', 'prioritize'],

  // Projects
  ['Which projects are active?', 'projectsActive'],
  ['What projects are due this week?', 'projectsDueWeek'],
  ['Show me project deadlines.', 'projectsActive'], // no dedicated "deadlines" rule — falls back to the generic project handler

  // Known, honest gaps — the spec names these, but nothing in KAI_HANDLERS
  // answers them today. Pinned as null so this stays an accurate map of
  // real capability instead of silently drifting once someone adds a
  // same-ish-sounding rule that doesn't actually have a handler behind it.
  // Answers with the all-time total, not scoped to "this month" specifically —
  // an accepted imprecision, not a routing failure (routes to a real handler,
  // it just doesn't filter by month yet).
  ['How many leads did I get this month?', 'totalLeads'],
  ["What's my average deal value?", null],          // no average-deal-value handler
  ['Who has been in Contacted the longest?', null], // no stage-duration-ranking handler
  ['Show me all Proposal Sent leads.', null],        // no per-stage-name lookup
  ['Show me contacts for appointment setting.', null], // no service-based contact filter
  ["Which contacts don't have a follow-up?", null],
  ['Which appointments are completed?', null],
  ['How many tasks are completed?', null],
];

MATCH_CASES.forEach(([question, expected]) => {
  check(`kaiMatchFreeText(${JSON.stringify(question)})`, kaiMatchFreeText(question), expected);
});

/* ---- kaiTextReferencesContact: does the text plausibly mean "the contact
   we were just discussing"? Must say yes for real pronoun references, and
   MUST say no for temporal phrases like "this week" — that exact confusion
   was a real bug (fixed by requiring "this/that" to be followed by a
   CRM-record noun rather than matching bare "this"). ---- */
const PRONOUN_CASES = [
  ['What invoices does this client have?', true],
  ['Tell me about this lead.', true],
  ['Show me everything related to this contact.', true],
  ["What's the status of this project?", true],
  ['Do they have any open tasks?', true],
  ['What happened this week?', false],
  ['This week has been busy.', false],
  ['What happened last month?', false],
  ["What's my pipeline value?", false],
  ['Compare this month to last month.', false],
  ['What invoices does this invoice relate to?', true],
  ['Do I have a proposal for this document?', true],
  ['What appointment is this?', true],
  ['These clients need attention.', true],
  ['These weeks have been slow.', false],   // "these" + "weeks", not a CRM-record noun
  ['That deal looks promising.', true],
  ['That period was strong.', false],       // "that" + "period", not in the recognized noun list
  ['His last name is Smith.', true],        // bare pronoun "his" — intentionally broad; a real limitation, not a bug
];

PRONOUN_CASES.forEach(([text, expected]) => {
  check(`kaiTextReferencesContact(${JSON.stringify(text)})`, kaiTextReferencesContact(text), expected);
});

/* ---- kaiResolveContactFromText: name/company substring resolution ---- */
const FIXTURE_CONTACTS = [
  { id: 'c1', name: 'Jordan Reyes', company: '' },
  { id: 'c2', name: 'Judge Wayne C.', company: 'Horizon One' },
  { id: 'c3', name: 'Nicolas Simoes', company: 'Shine Cleaning' },
];

check(
  'kaiResolveContactFromText by name',
  kaiResolveContactFromText('Tell me everything about Jordan Reyes', FIXTURE_CONTACTS)?.id,
  'c1'
);
check(
  'kaiResolveContactFromText by company',
  kaiResolveContactFromText('Find the proposal for Horizon One', FIXTURE_CONTACTS)?.id,
  'c2'
);
check(
  'kaiResolveContactFromText — no match returns null',
  kaiResolveContactFromText('Find the proposal for ABC Company', FIXTURE_CONTACTS),
  null
);
check(
  'kaiResolveContactFromText is case-insensitive',
  kaiResolveContactFromText('what does JORDAN REYES need?', FIXTURE_CONTACTS)?.id,
  'c1'
);
check(
  'kaiResolveContactFromText prefers the longer/more specific name match',
  kaiResolveContactFromText('is Judge Wayne C. still active?', FIXTURE_CONTACTS)?.id,
  'c2'
);
check(
  'kaiResolveContactFromText ignores an empty contact list',
  kaiResolveContactFromText('Tell me about Jordan Reyes', []),
  null
);
check(
  'kaiResolveContactFromText matches a unique first name',
  kaiResolveContactFromText('what does Jordan need?', FIXTURE_CONTACTS)?.id,
  'c1'
);
check(
  'kaiResolveContactFromText refuses an ambiguous first name shared by two contacts',
  kaiResolveContactFromText('what does Jordan need?', [...FIXTURE_CONTACTS, { id: 'c4', name: 'Jordan Ellis', company: '' }]),
  null
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
