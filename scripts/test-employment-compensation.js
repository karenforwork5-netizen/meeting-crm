const assert = require('assert');
const e = require('../public/employment-compensation-engine.js');

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

// 1. Full-time + hourly
{
  const r = e.extractEmploymentAndCompensation('Full-time Appointment Setter, $5/hr, US hours');
  check('1. Full-time + hourly: employmentType', r.employmentType, 'Full-time');
  check('1. Full-time + hourly: employmentConfidence', r.employmentConfidence, 'High');
  check('1. Full-time + hourly: compensationType', r.compensationType, 'Hourly');
  check('1. Full-time + hourly: amount', [r.compensationMin, r.compensationMax], [5, 5]);
  check('1. Full-time + hourly: compensationConfidence', r.compensationConfidence, 'High');
  check('1. Full-time + hourly: no Part-time/Project-based inferred from "US hours"', /US hours/.test(r.employmentSourceText || ''), false);
}

// 2. Part-time + hourly
{
  const r = e.extractEmploymentAndCompensation('Part-time appointment setter needed, $8/hour');
  check('2. Part-time + hourly: employmentType', r.employmentType, 'Part-time');
  check('2. Part-time + hourly: compensationType', r.compensationType, 'Hourly');
  check('2. Part-time + hourly: amount', [r.compensationMin, r.compensationMax], [8, 8]);
}

// 3. Commission-based
{
  const r = e.extractEmploymentAndCompensation('Commission-based appointment setter position, commission only');
  check('3. Commission-based: employmentType', r.employmentType, 'Commission-based');
  check('3. Commission-based: compensationType', r.compensationType, 'Commission');
  check('3. Commission-based: no fabricated amount', [r.compensationMin, r.compensationMax], [null, null]);
}

// 4. Monthly compensation
{
  const r = e.extractEmploymentAndCompensation('Virtual Assistant, $800/month, remote');
  check('4. Monthly: compensationType', r.compensationType, 'Monthly');
  check('4. Monthly: amount', [r.compensationMin, r.compensationMax], [800, 800]);
  check('4. Monthly: employmentType not guessed from "remote"', r.employmentType, 'Not specified');
}

// 5. Compensation range
{
  const r = e.extractEmploymentAndCompensation('Customer Support, $500-$800/month');
  check('5. Range (Monthly): compensationType', r.compensationType, 'Monthly');
  check('5. Range (Monthly): amount', [r.compensationMin, r.compensationMax], [500, 800]);
  const r2 = e.extractEmploymentAndCompensation('$10-$15/hour appointment setter');
  check('5b. Range (Hourly): compensationType', r2.compensationType, 'Hourly');
  check('5b. Range (Hourly): amount', [r2.compensationMin, r2.compensationMax], [10, 15]);
}

// 6. Project-based
{
  const r = e.extractEmploymentAndCompensation('Project-based VA, $300 per project');
  check('6. Project-based: employmentType', r.employmentType, 'Project-based');
  check('6. Project-based: compensationType', r.compensationType, 'Per project');
  check('6. Project-based: amount', [r.compensationMin, r.compensationMax], [300, 300]);
}

// 7. No employment type
{
  const r = e.extractEmploymentAndCompensation('Appointment Setter — Remote — US hours');
  check('7. No employment type: employmentType stays Not specified', r.employmentType, 'Not specified');
  check('7. No employment type: employmentConfidence', r.employmentConfidence, 'Not specified');
  check('7. No employment type: no compensation fabricated', r.compensationType, 'Not specified');
}

// 8. No compensation
{
  const r = e.extractEmploymentAndCompensation('Full-time Customer Support Representative needed ASAP');
  check('8. No compensation: employmentType still detected', r.employmentType, 'Full-time');
  check('8. No compensation: compensationType', r.compensationType, 'Not specified');
  check('8. No compensation: no amount fabricated', [r.compensationMin, r.compensationMax], [null, null]);
}

// Additional coverage: normalization, Fixed, Daily, Salary, Range (no unit), Salary+Commission, Internship
{
  const r = e.extractEmploymentAndCompensation('FULL TIME position');
  check('Normalization: "FULL TIME" -> Full-time', r.employmentType, 'Full-time');
  const r2 = e.extractEmploymentAndCompensation('Part Time role');
  check('Normalization: "Part Time" -> Part-time', r2.employmentType, 'Part-time');
  const r3 = e.extractEmploymentAndCompensation('$300 fixed rate for this task');
  check('Fixed (no "project" word): compensationType', r3.compensationType, 'Fixed');
  const r4 = e.extractEmploymentAndCompensation('$50/day for onsite work');
  check('Daily: compensationType', r4.compensationType, 'Daily');
  check('Daily: amount', [r4.compensationMin, r4.compensationMax], [50, 50]);
  const r5 = e.extractEmploymentAndCompensation('$3000 salary, negotiable');
  check('Salary (unit-less amount + word "salary"): compensationType', r5.compensationType, 'Salary');
  const r6 = e.extractEmploymentAndCompensation('Pay: $500-$700, details on call');
  check('Range (no unit at all): compensationType', r6.compensationType, 'Range');
  check('Range (no unit at all): amount', [r6.compensationMin, r6.compensationMax], [500, 700]);
  const r7 = e.extractEmploymentAndCompensation('$6/hr + commission');
  check('Salary + Commission: compensationType', r7.compensationType, 'Salary + Commission');
  const r8 = e.extractEmploymentAndCompensation('Internship opportunity for students');
  check('Internship: employmentType', r8.employmentType, 'Internship');
  // Never invent Full-time from "US hours" alone, Part-time from low salary alone, Project-based from "remote" alone
  const r9 = e.extractEmploymentAndCompensation('Appointment Setter, US hours, $3/hr, fully remote');
  check('No employment type guessed from US hours + low pay + remote', r9.employmentType, 'Not specified');
}

console.log(`${passed} passed, ${process.exitCode ? 'some failed' : '0 failed'}`);
