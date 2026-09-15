/* Kai's text-understanding engine — pure functions, no DOM/fetch access.
 * Loaded as a plain <script> in the browser (attaches to window) and
 * required directly by scripts/test-kai.js under plain Node.
 * Keeping this logic here (instead of inline in app.js) is what lets
 * scripts/test-kai.js exercise it without stubbing a browser. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis, function () {

  /* Keyword rules: every key in a rule must appear in the question for that
     rule to be eligible; the eligible rule with the most matched keys wins.
     Keep more specific (multi-keyword) rules ahead of broad single-keyword
     catch-alls so a new broad rule can't silently swallow a specific one. */
  const KAI_RULES = [
    // Follow-ups
    { keys: ['overdue', 'follow'], handler: 'overdueFollowups' },
    { keys: ['overdue', 'lead'], handler: 'overdueFollowups' },
    { keys: ['waiting', 'reply'], handler: 'waitingForReply' },
    { keys: ['follow', 'today'], handler: 'dueTodayFollowups' },
    { keys: ['contact', 'today'], handler: 'dueTodayFollowups' },
    { keys: ['call', 'today'], handler: 'dueTodayFollowups' },
    { keys: ['haven', 'responded'], handler: 'waitingForReply' },
    { keys: ['hasn', 'replied'], handler: 'waitingForReply' },
    { keys: ['waiting', 'response'], handler: 'waitingForReply' },
    { keys: ['not', 'responded'], handler: 'waitingForReply' },
    { keys: ['reactivation'], handler: 'overdueFollowups' },
    { keys: ['who', 'follow'], handler: 'allFollowups' },
    { keys: ['need', 'follow'], handler: 'allFollowups' },
    { keys: ['should i', 'follow'], handler: 'allFollowups' },
    // Tasks
    { keys: ['overdue', 'task'], handler: 'overdueTasks' },
    { keys: ['task', 'today'], handler: 'dueTodayTasks' },
    { keys: ['high', 'priority'], handler: 'highPriorityTasks' },
    { keys: ['prioriti'], handler: 'prioritize' },
    { keys: ['work on', 'first'], handler: 'prioritize' },
    { keys: ['should i do'], handler: 'prioritize' },
    // Appointments / Calendar
    { keys: ['appointment', 'today'], handler: 'todayAppointments' },
    { keys: ['appointment', 'tomorrow'], handler: 'weekAppointments' },
    { keys: ['appointment', 'week'], handler: 'weekAppointments' },
    { keys: ['upcoming', 'appointment'], handler: 'weekAppointments' },
    { keys: ['happening', 'today'], handler: 'todayEverything' },
    { keys: ['busiest', 'day'], handler: 'busiestDay' },
    { keys: ['happened', 'week'], handler: 'weekSummary' },
    { keys: ['this week'], handler: 'weekSummary' },
    // Billing
    { keys: ['overdue', 'invoice'], handler: 'overdueInvoices' },
    { keys: ['who', 'owe'], handler: 'billingWhoOwes' },
    { keys: ['hasn', 'paid'], handler: 'billingWhoOwes' },
    { keys: ['owes', 'most'], handler: 'billingWhoOwes' },
    { keys: ['collected'], handler: 'outstandingInvoices' },
    { keys: ['invoice'], handler: 'outstandingInvoices' },
    { keys: ['payment', 'due'], handler: 'outstandingInvoices' },
    { keys: ['unpaid'], handler: 'outstandingInvoices' },
    { keys: ['outstanding'], handler: 'outstandingInvoices' },
    // Contacts
    { keys: ['newest', 'contact'], handler: 'recentContacts' },
    { keys: ['recent'], handler: 'recentContacts' },
    { keys: ['how many', 'contact'], handler: 'totalLeads' },
    { keys: ['how many', 'lead'], handler: 'totalLeads' },
    { keys: ['how many leads'], handler: 'totalLeads' },
    { keys: ['came from'], handler: 'bySource' },
    { keys: ['source'], handler: 'bySource' },
    // Analytics / Pipeline
    { keys: ['why', 'conversion'], handler: 'explainConversion' },
    { keys: ['why', 'low'], handler: 'explainConversion' },
    { keys: ['conversion'], handler: 'conversionRate' },
    { keys: ['best', 'source'], handler: 'sourcePerformance' },
    { keys: ['performs', 'best'], handler: 'sourcePerformance' },
    { keys: ['source', 'performance'], handler: 'sourcePerformance' },
    { keys: ['best', 'leads'], handler: 'sourcePerformance' },
    { keys: ['compare'], handler: 'comparePeriod' },
    { keys: ['last period'], handler: 'comparePeriod' },
    { keys: ['stuck'], handler: 'stuckLeads' },
    { keys: ['sitting', 'long'], handler: 'stuckLeads' },
    { keys: ['stage'], handler: 'stageCounts' },
    { keys: ['pipeline', 'value'], handler: 'pipelineValue' },
    { keys: ['pipeline', 'performing'], handler: 'pipelineValue' },
    { keys: ['generated', 'leads'], handler: 'sourcePerformance' },
    { keys: ['worth', 'most'], handler: 'stageCounts' },
    // Projects
    { keys: ['project', 'overdue'], handler: 'projectsOverdue' },
    { keys: ['project', 'active'], handler: 'projectsActive' },
    { keys: ['project', 'week'], handler: 'projectsDueWeek' },
    { keys: ['project'], handler: 'projectsActive' },
    // Documents
    { keys: ['document'], handler: 'documentsList' },
    // Cross-module
    { keys: ['needs', 'attention'], handler: 'needsAttention' },
    { keys: ['attention'], handler: 'needsAttention' },
  ];

  function kaiMatchFreeText(text) {
    const t = text.toLowerCase();
    let best = null, bestScore = 0;
    KAI_RULES.forEach(r => {
      const score = r.keys.filter(k => t.includes(k)).length;
      if (score === r.keys.length && score > bestScore) { best = r.handler; bestScore = score; }
    });
    return best;
  }

  /* True only when "this/that/these/those" is next to a noun that plausibly means
     a CRM record — either "this <noun>" or "<noun> is this/that" — so temporal
     phrases like "this week"/"this month" don't get mistaken for a reference to
     the last-discussed contact. Nouns accept a trailing 's' so plurals ("these
     clients") count too. A bare pronoun (he/she/they/...) always counts. */
  function kaiTextReferencesContact(text) {
    const t = text.toLowerCase();
    const noun = '(client|lead|contact|person|deal|opportunity|compan(?:y|ies)|project|invoice|appointment|document)s?';
    return new RegExp(`\\b(this|that|these|those)\\s+${noun}\\b`).test(t)
      || new RegExp(`\\b${noun}\\s+(is|was)\\s+(this|that)\\b`).test(t)
      || /\b(he|she|they|them|his|her|their)\b/.test(t);
  }

  /* Finds the contact a free-text question explicitly names, by full name,
     unique first name, or company substring match. contactsList is passed in
     rather than read from a module-level global so this stays framework/DOM-free. */
  function kaiResolveContactFromText(text, contactsList) {
    const t = text.toLowerCase();
    const list = contactsList || [];
    const byName = list.filter(c => c.name && t.includes(c.name.toLowerCase()));
    if (byName.length) return byName.sort((a, b) => b.name.length - a.name.length)[0];
    // Fall back to a first-name-only mention, but only when it's unambiguous —
    // two "Johns" in the CRM should not silently pick one.
    const firstNameCounts = {};
    list.forEach(c => { if (c.name) { const first = c.name.split(' ')[0].toLowerCase(); firstNameCounts[first] = (firstNameCounts[first] || 0) + 1; } });
    const byFirstName = list.filter(c => c.name && firstNameCounts[c.name.split(' ')[0].toLowerCase()] === 1
      && new RegExp(`\\b${c.name.split(' ')[0].toLowerCase()}\\b`).test(t));
    if (byFirstName.length === 1) return byFirstName[0];
    const byCompany = list.filter(c => c.company && c.company.length > 2 && t.includes(c.company.toLowerCase()));
    if (byCompany.length) return byCompany[0];
    return null;
  }

  /* Finds the Job Hunt opportunity a free-text question explicitly names, by
     job title or company substring match. jobsList is passed in rather than
     read from a module-level global so this stays framework/DOM-free. Prefers
     the longest/most specific title match to avoid a short generic title
     accidentally matching multiple saved jobs. */
  function kaiResolveJobFromText(text, jobsList) {
    const t = text.toLowerCase();
    const list = jobsList || [];
    const byTitle = list.filter(j => j.title && t.includes(j.title.toLowerCase()));
    if (byTitle.length) return byTitle.sort((a, b) => b.title.length - a.title.length)[0];
    const byCompany = list.filter(j => j.company && j.company.length > 2 && t.includes(j.company.toLowerCase()));
    if (byCompany.length === 1) return byCompany[0];
    return null;
  }

  return { KAI_RULES, kaiMatchFreeText, kaiTextReferencesContact, kaiResolveContactFromText, kaiResolveJobFromText };
});
