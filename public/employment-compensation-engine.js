/* Employment type & compensation extraction — pure functions, no DOM/fetch access.
 * Loaded as a plain <script> in the browser (attaches to window), same pattern
 * as job-match-engine.js and kai-engine.js.
 *
 * Deterministic only: every value is extracted from explicit wording in the
 * job's own title/snippet. Nothing here infers a value from a job title, a
 * service category, or a match score — if the source text doesn't say it,
 * the result is "Not specified" with no confidence claimed.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis, function () {

  const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Project-based', 'Contract', 'Freelance', 'Commission-based', 'Temporary', 'Internship', 'Not specified'];
  const COMPENSATION_TYPES = ['Hourly', 'Monthly', 'Weekly', 'Daily', 'Per project', 'Fixed', 'Commission', 'Salary', 'Range', 'Salary + Commission', 'Not specified'];

  // Each rule fires only on an explicit phrase — never on a job title alone,
  // never on a service category, never on "US hours" (schedule/timezone is
  // not an employment type), never on a low salary (never implies Part-time),
  // never on "remote" (never implies Project-based). Order matters: more
  // specific phrases (e.g. "commission-based position") are checked before
  // generic ones.
  const EMPLOYMENT_RULES = [
    { type: 'Commission-based', confidence: 'High', pattern: /\bcommission[\s-]?based\b/i },
    { type: 'Full-time', confidence: 'High', pattern: /\bfull[\s-]?time\b/i },
    { type: 'Part-time', confidence: 'High', pattern: /\bpart[\s-]?time\b/i },
    { type: 'Internship', confidence: 'High', pattern: /\binternship\b/i },
    { type: 'Internship', confidence: 'Medium', pattern: /\bintern\b/i },
    { type: 'Freelance', confidence: 'High', pattern: /\bfreelance(r)?\b/i },
    { type: 'Project-based', confidence: 'High', pattern: /\bproject[\s-]?based\b/i },
    { type: 'Contract', confidence: 'High', pattern: /\bcontract(ual)?\b/i },
    { type: 'Contract', confidence: 'Medium', pattern: /\bcontractor\b/i },
    { type: 'Temporary', confidence: 'High', pattern: /\btemporary\b/i },
    { type: 'Temporary', confidence: 'Medium', pattern: /\btemp\b/i },
  ];

  function extractEmploymentType(text) {
    const source = String(text || '');
    for (const rule of EMPLOYMENT_RULES) {
      const match = source.match(rule.pattern);
      if (match) {
        return { employmentType: rule.type, employmentConfidence: rule.confidence, employmentSourceText: match[0] };
      }
    }
    return { employmentType: 'Not specified', employmentConfidence: 'Not specified', employmentSourceText: '' };
  }

  // Matches an amount or amount range with an optional currency symbol/code:
  // "$5", "$5-$8", "$5–8", "₱500", "PHP 500-800". Captures currency + both bounds.
  const AMOUNT_RANGE = /(\$|USD|₱|PHP)\s*([\d,]+(?:\.\d+)?)\s*(?:[-–—to]+\s*(?:\$|USD|₱|PHP)?\s*([\d,]+(?:\.\d+)?))?/i;

  function parseAmount(str) { return str ? parseFloat(str.replace(/,/g, '')) : null; }
  function currencyFromSymbol(sym) {
    if (!sym) return null;
    const s = sym.toUpperCase();
    if (s === '$' || s === 'USD') return 'USD';
    if (s === '₱' || s === 'PHP') return 'PHP';
    return null;
  }

  // Unit phrases that pin down compensationType, checked near the amount so
  // "$5/hr" and "hourly rate of $5" both resolve the same way. Order matters:
  // "per project" is checked before the bare "fixed" rule so "$300 fixed
  // project" resolves to Per project, not Fixed.
  const UNIT_RULES = [
    { type: 'Hourly', pattern: /\/\s*hr\b|\/\s*hour\b|per\s*hour|hourly/i },
    { type: 'Weekly', pattern: /\/\s*week\b|per\s*week|weekly/i },
    { type: 'Monthly', pattern: /\/\s*month\b|per\s*month|monthly/i },
    { type: 'Daily', pattern: /\/\s*day\b|per\s*day|daily/i },
    { type: 'Per project', pattern: /per\s*project|project[\s-]?rate|project[\s-]?based\s*(pay|rate|price)?|\/\s*project\b|fixed[\s-]?project/i },
    { type: 'Fixed', pattern: /\bfixed[\s-]?(price|pay|rate|amount|fee)\b|\bfixed\b/i },
  ];
  const SALARY_WORD_PATTERN = /\bsalary\b/i;
  const COMMISSION_ONLY_PATTERN = /commission[\s-]?only|100%\s*commission/i;
  const COMMISSION_MENTION_PATTERN = /\bcommission\b/i;
  const COMMISSION_COMBINED_PATTERN = /(\+|plus|and)\s*commission|commission\s*(\+|plus|and)/i;

  function extractCompensation(text) {
    const source = String(text || '');
    const amountMatch = source.match(AMOUNT_RANGE);
    let unit = null;
    let windowText = '';
    if (amountMatch) {
      // Look at a small window around the amount so the unit belongs to it.
      const windowStart = Math.max(0, amountMatch.index - 5);
      const windowEnd = Math.min(source.length, amountMatch.index + amountMatch[0].length + 20);
      windowText = source.slice(windowStart, windowEnd);
      unit = UNIT_RULES.find(r => r.pattern.test(windowText)) || null;
    }
    const commissionOnly = COMMISSION_ONLY_PATTERN.test(source);
    const commissionCombined = COMMISSION_COMBINED_PATTERN.test(source) || (COMMISSION_MENTION_PATTERN.test(source) && !!unit);

    if (amountMatch && unit) {
      const min = parseAmount(amountMatch[2]);
      const max = amountMatch[3] ? parseAmount(amountMatch[3]) : min;
      const currency = currencyFromSymbol(amountMatch[1]);
      const isCombined = commissionCombined && COMMISSION_MENTION_PATTERN.test(source);
      return {
        compensationType: isCombined ? 'Salary + Commission' : unit.type,
        compensationMin: min,
        compensationMax: max,
        compensationCurrency: currency,
        compensationConfidence: isCombined ? 'Medium' : 'High',
        compensationSourceText: amountMatch[0] + (isCombined ? ' + commission' : ''),
      };
    }
    if (amountMatch && SALARY_WORD_PATTERN.test(windowText)) {
      // The word "salary" appears right next to a real amount, but no
      // per-hour/month/week/day/project unit was stated — a genuine but
      // unit-less salary figure, not a guess.
      const min = parseAmount(amountMatch[2]);
      const max = amountMatch[3] ? parseAmount(amountMatch[3]) : min;
      return {
        compensationType: 'Salary', compensationMin: min, compensationMax: max,
        compensationCurrency: currencyFromSymbol(amountMatch[1]), compensationConfidence: 'Medium',
        compensationSourceText: amountMatch[0],
      };
    }
    if (commissionOnly) {
      return { compensationType: 'Commission', compensationMin: null, compensationMax: null, compensationCurrency: null, compensationConfidence: 'High', compensationSourceText: source.match(COMMISSION_ONLY_PATTERN)[0] };
    }
    if (amountMatch && amountMatch[3] && parseAmount(amountMatch[2]) !== parseAmount(amountMatch[3])) {
      // Two distinct real numbers connected by a dash is a genuine range —
      // just one with no stated unit. Surfaced honestly as "Range" rather
      // than discarded or force-fit into a guessed unit.
      return {
        compensationType: 'Range', compensationMin: parseAmount(amountMatch[2]), compensationMax: parseAmount(amountMatch[3]),
        compensationCurrency: currencyFromSymbol(amountMatch[1]), compensationConfidence: 'Low',
        compensationSourceText: amountMatch[0],
      };
    }
    if (amountMatch) {
      // A single bare number was found but no unit could be pinned down — do
      // not guess Hourly vs Monthly vs Fixed from one ambiguous figure.
      return { compensationType: 'Not specified', compensationMin: null, compensationMax: null, compensationCurrency: null, compensationConfidence: 'Not specified', compensationSourceText: amountMatch[0] };
    }
    if (COMMISSION_MENTION_PATTERN.test(source)) {
      return { compensationType: 'Commission', compensationMin: null, compensationMax: null, compensationCurrency: null, compensationConfidence: 'Medium', compensationSourceText: source.match(COMMISSION_MENTION_PATTERN)[0] };
    }
    return { compensationType: 'Not specified', compensationMin: null, compensationMax: null, compensationCurrency: null, compensationConfidence: 'Not specified', compensationSourceText: '' };
  }

  // Runs both extractions against the same combined source text (title +
  // cleaned snippet) so the two never disagree about what text was used.
  function extractEmploymentAndCompensation(text) {
    return { ...extractEmploymentType(text), ...extractCompensation(text) };
  }

  // Never converts between units (an hourly rate is never turned into a
  // monthly-equivalent figure) — each type keeps its own original unit.
  function formatCompensation(result) {
    if (!result || result.compensationType === 'Not specified' || (result.compensationMin === null && result.compensationType !== 'Commission')) {
      return 'Not specified';
    }
    if (result.compensationType === 'Commission') return 'Commission';
    const symbol = result.compensationCurrency === 'PHP' ? '₱' : (result.compensationCurrency === 'USD' ? '$' : '');
    const amount = result.compensationMin === result.compensationMax
      ? `${symbol}${result.compensationMin}`
      : `${symbol}${result.compensationMin}–${symbol}${result.compensationMax}`;
    const unitSuffix = { Hourly: '/hr', Weekly: '/week', Monthly: '/month', Daily: '/day', 'Per project': '/project' }[result.compensationType] || '';
    const parenSuffix = { Fixed: ' (fixed)', Salary: ' (salary)' }[result.compensationType] || '';
    const combinedSuffix = result.compensationType === 'Salary + Commission' ? ' + commission' : '';
    return `${amount}${unitSuffix}${parenSuffix}${combinedSuffix}`;
  }

  return { EMPLOYMENT_TYPES, COMPENSATION_TYPES, extractEmploymentType, extractCompensation, extractEmploymentAndCompensation, formatCompensation };
});
