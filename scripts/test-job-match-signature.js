const assert = require('assert');
const engine = require('../public/job-match-engine.js');

let passed = 0;
function check(label, actual, expected) {
  try { assert.deepStrictEqual(actual, expected); passed++; }
  catch (err) {
    console.error(`FAIL: ${label}`);
    console.error('  expected:', JSON.stringify(expected));
    console.error('  actual:  ', JSON.stringify(actual));
    process.exitCode = 1;
  }
}
function ok(label, cond) {
  if (cond) passed++;
  else { console.error(`FAIL: ${label}`); process.exitCode = 1; }
}

const baseProfile = {
  fullName: 'Karen Gregorio',
  professionalTitle: 'Virtual Assistant',
  summary: 'Experienced VA.',
  services: ['Customer Support', 'Appointment Setting'],
  skills: ['Cold Calling'],
  tools: ['Zoho'],
  crmCapabilities: ['CRM Management'],
  workHistory: [{ company: 'Acme', role: 'VA', type: 'Remote', location: '', dates: '2024', responsibilities: ['Called leads.'] }],
  languages: [{ language: 'English', level: 'Fluent' }],
  education: [{ school: 'HS', credential: 'Grad' }],
  preferredRoles: [], preferredEmploymentType: '', preferredSalary: '', workPreferences: '', portfolioUrl: '', cvReference: '',
  updatedAt: '2026-09-13T19:04:44.935Z',
};

// A. Same content re-saved (e.g. identical object rewritten with different
// key order and a bumped updatedAt, exactly what the Railway migration did)
{
  const resaved = {
    updatedAt: '2026-09-18T00:00:00.000Z', // different timestamp
    cvReference: '', portfolioUrl: '', workPreferences: '', preferredSalary: '', preferredEmploymentType: '', preferredRoles: [], // reordered
    education: [{ credential: 'Grad', school: 'HS' }], // reordered keys within object
    languages: [{ level: 'Fluent', language: 'English' }], // reordered keys within object
    workHistory: [{ responsibilities: ['Called leads.'], dates: '2024', location: '', type: 'Remote', role: 'VA', company: 'Acme' }], // reordered keys
    crmCapabilities: ['CRM Management'],
    tools: ['Zoho'],
    skills: ['Cold Calling'],
    services: ['Customer Support', 'Appointment Setting'],
    summary: 'Experienced VA.',
    professionalTitle: 'Virtual Assistant',
    fullName: 'Karen Gregorio',
  };
  check('A. identical relevant content (different key order, different updatedAt) -> same signature',
    engine.profileMatchSignature(resaved), engine.profileMatchSignature(baseProfile));
}

// B. One relevant field changes (added a skill)
{
  const changed = { ...baseProfile, skills: ['Cold Calling', 'Data Entry'] };
  ok('B. changed relevant field (skills) -> different signature',
    engine.profileMatchSignature(changed) !== engine.profileMatchSignature(baseProfile));
}
// B2. workHistory responsibilities change (nested, relevant)
{
  const changed = { ...baseProfile, workHistory: [{ ...baseProfile.workHistory[0], responsibilities: ['Called leads.', 'Closed deals.'] }] };
  ok('B2. changed nested relevant field (workHistory responsibilities) -> different signature',
    engine.profileMatchSignature(changed) !== engine.profileMatchSignature(baseProfile));
}

// C. Irrelevant metadata/timestamp-only changes
{
  const changed = { ...baseProfile, updatedAt: '2099-01-01T00:00:00.000Z', fullName: 'Someone Else', languages: [], education: [], preferredSalary: '$999', portfolioUrl: 'https://x.com' };
  check('C. only irrelevant fields changed -> same signature',
    engine.profileMatchSignature(changed), engine.profileMatchSignature(baseProfile));
}

// Array order IS preserved (a genuinely reordered list of services counts as different content)
{
  const reordered = { ...baseProfile, services: ['Appointment Setting', 'Customer Support'] };
  ok('Array order within a relevant field is preserved (reordering services changes signature)',
    engine.profileMatchSignature(reordered) !== engine.profileMatchSignature(baseProfile));
}

// calculateJobMatch attaches the signature on every branch
{
  const job = { title: 'Appointment Setter', skills: ['Cold Calling'], requirements: [], description: '' };
  const result = engine.calculateJobMatch(job, baseProfile);
  ok('calculateJobMatch (Analyzed branch) includes profileMatchSignature', typeof result.profileMatchSignature === 'string' && result.profileMatchSignature.length > 0);
  check('calculateJobMatch signature matches direct profileMatchSignature() call', result.profileMatchSignature, engine.profileMatchSignature(baseProfile));

  const emptyProfileResult = engine.calculateJobMatch(job, {});
  ok('calculateJobMatch ("Not enough data" — empty profile) still includes a signature', typeof emptyProfileResult.profileMatchSignature === 'string');
  check('E. "Not enough data" (empty profile) status preserved', emptyProfileResult.matchStatus, 'Not enough data');

  const emptyJobResult = engine.calculateJobMatch({ title: '' }, baseProfile);
  check('E. "Not enough data" (no usable job data) status preserved', emptyJobResult.matchStatus, 'Not enough data');
}

console.log(`${passed} passed, ${process.exitCode ? 'some failed' : '0 failed'}`);
