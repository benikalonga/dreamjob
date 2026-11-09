import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchScore, profileCompleteness } from './match';
import { canMove, canWithdraw, isFinal, nextStages } from './pipeline';
import { toFtsQuery } from './search';

const profile = { skills: ['React', 'TypeScript', 'Node.js'], yearsExperience: 3, location: 'YOUR_CITY, YOUR_COUNTRY', remoteOk: true, desiredMinSalary: 50_000 };
const job = { skills: ['react', 'typescript'], level: 'mid', workplace: 'remote', location: 'Anywhere', salaryMax: 80_000 };

test('a full match scores 100, ignoring skill case', () => {
  const r = matchScore(profile, job);
  assert.equal(r.score, 100);
  assert.deepEqual(r.missingSkills, []);
});
test('missing skills lower the score and are listed', () => {
  const r = matchScore(profile, { ...job, skills: ['react', 'go', 'rust', 'sql'] });
  assert.equal(r.score, 55);
  assert.deepEqual(r.missingSkills, ['go', 'rust', 'sql']);
});
test('an onsite job in another city loses the location points', () => {
  assert.equal(matchScore(profile, { ...job, workplace: 'onsite', location: 'YOUR_OTHER_CITY, YOUR_COUNTRY' }).score, 85);
  assert.equal(matchScore(profile, { ...job, workplace: 'onsite', location: 'YOUR_CITY' }).score, 100);
});
test('a salary below the minimum loses the salary points', () => assert.equal(matchScore(profile, { ...job, salaryMax: 40_000 }).score, 90));
test('being far from the level loses experience points', () => assert.equal(matchScore(profile, { ...job, level: 'lead' }).score, 85));
test('scores never exceed 100 or fall below 0', () => {
  const r = matchScore({ skills: [], yearsExperience: 0, location: null, remoteOk: false, desiredMinSalary: 9e9 }, { ...job, level: 'lead' });
  assert.ok(r.score >= 0 && r.score <= 100);
});
test('profile completeness adds up and names what is missing', () => {
  assert.equal(profileCompleteness({ headline: 'x', summary: 'x', location: 'x', skills: 3, experience: 1, education: 1 }).percent, 100);
  const partial = profileCompleteness({ headline: 'x', summary: null, location: null, skills: 1, experience: 0, education: 0 });
  assert.equal(partial.percent, 20);
  assert.ok(partial.missing.includes('Add at least 3 skills'));
});
test('the pipeline only moves forward one step', () => {
  assert.ok(canMove('applied', 'reviewing'));
  assert.equal(canMove('applied', 'offer'), false);
  assert.equal(canMove('reviewing', 'applied'), false);
  assert.ok(canMove('offer', 'rejected'));
});
test('final stages have nowhere to go and cannot be withdrawn', () => {
  for (const s of ['hired', 'rejected', 'withdrawn'] as const) {
    assert.ok(isFinal(s));
    assert.deepEqual(nextStages(s), []);
    assert.equal(canWithdraw(s), false);
  }
  assert.ok(canWithdraw('offer'));
});
test('search text cannot inject full-text operators', () => {
  assert.equal(toFtsQuery('react NEAR(dev) OR "x'), '"react"* "near"* "dev"* "or"* "x"*');
  assert.equal(toFtsQuery('***'), null);
  assert.equal(toFtsQuery('C++ développeur'), '"c"* "développeur"*');
});
