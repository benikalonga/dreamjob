import './testEnv';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, test } from 'node:test';
import { createApp } from './app';
import { db } from './db';
import { hashPassword } from './lib/auth';
import { expireJobs, runJobAlerts } from './services/jobs';

let server: Server;
let base = '';
let admin = '';
type Res = { status: number; body: any };
async function call(method: string, path: string, body?: unknown, token?: string): Promise<Res> {
  const res = await fetch(`${base}/v1${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body: parsed };
}
const PW = 'YOUR_PASSWORD';
const mail = () => `${randomUUID()}@fakeemail.com`;

async function candidate(skills = ['React', 'TypeScript'], name = 'YOUR_NAME') {
  const email = mail();
  const r = await call('POST', '/auth/register', { email, password: PW, name });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const profile = await call('PUT', '/profile', { headline: 'Developer', summary: null, location: 'YOUR_CITY, YOUR_COUNTRY', phone: 'YOUR_PHONE_NUMBER', yearsExperience: 3, desiredMinSalary: null, remoteOk: true, openToWork: true, skills, experience: [], education: [] }, r.body.token);
  assert.equal(profile.status, 200, JSON.stringify(profile.body));
  return { token: r.body.token as string, id: r.body.user.id as string, email };
}
async function employer(company = 'Acme Works', verified = true) {
  const email = mail();
  const r = await call('POST', '/auth/register', { email, password: PW, name: 'YOUR_EMPLOYER_NAME', role: 'employer', companyName: company });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  if (verified) db.prepare('UPDATE companies SET verified = 1 WHERE id = ?').run(r.body.user.company.id);
  return { token: r.body.token as string, id: r.body.user.id as string, companyId: r.body.user.company.id as string };
}
const jobInput = (over: object = {}) => ({ title: 'Frontend Developer', category: 'Engineering', type: 'full_time', level: 'mid', workplace: 'remote', location: 'Anywhere', salaryMin: 40000, salaryMax: 70000, currency: 'USD', description: 'Build delightful interfaces for customers around the world.', responsibilities: ['Ship features'], qualifications: ['3 years'], benefits: ['Leave'], skills: ['React', 'TypeScript'], ...over });
async function liveJob(e: { token: string }, over: object = {}) {
  const c = await call('POST', '/employer/jobs', jobInput(over), e.token);
  assert.equal(c.status, 201, JSON.stringify(c.body));
  const p = await call('POST', `/employer/jobs/${c.body.id}/publish`, {}, e.token);
  assert.equal(p.status, 200, JSON.stringify(p.body));
  return c.body.id as string;
}
async function applied() {
  const e = await employer();
  const c = await candidate();
  const jobId = await liveJob(e);
  const a = await call('POST', `/jobs/${jobId}/apply`, { coverNote: 'Hello' }, c.token);
  assert.equal(a.status, 201, JSON.stringify(a.body));
  return { e, c, jobId, appId: a.body.id as string };
}
const advance = async (e: { token: string }, appId: string, ...stages: string[]) => { for (const status of stages) assert.equal((await call('POST', `/employer/applications/${appId}/status`, { status }, e.token)).status, 200, status); };

before(async () => {
  server = createApp().listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const email = mail();
  const id = randomUUID();
  db.prepare("INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?,?,?,?,'admin',?)").run(id, email, await hashPassword(PW), 'YOUR_ADMIN_NAME', new Date().toISOString());
  db.prepare('INSERT INTO profiles (user_id, updated_at) VALUES (?,?)').run(id, new Date().toISOString());
  admin = (await call('POST', '/auth/login', { email, password: PW })).body.token;
});
after(() => server.close());

describe('accounts', () => {
  test('register, sign in and read your account, with no secrets returned', async () => {
    const email = mail();
    const r = await call('POST', '/auth/register', { email: email.toUpperCase(), password: PW, name: 'YOUR_NAME' });
    assert.equal(r.status, 201);
    assert.equal(JSON.stringify(r.body).includes('password'), false);
    assert.equal((await call('POST', '/auth/login', { email, password: PW })).status, 200);
    assert.equal((await call('GET', '/me', undefined, r.body.token)).body.email, email);
  });
  test('rejects duplicates, short passwords and employers with no company', async () => {
    const email = mail();
    await call('POST', '/auth/register', { email, password: PW, name: 'YOUR_NAME' });
    assert.equal((await call('POST', '/auth/register', { email, password: PW, name: 'YOUR_NAME' })).status, 409);
    assert.equal((await call('POST', '/auth/register', { email: mail(), password: 'short', name: 'YOUR_NAME' })).status, 422);
    assert.equal((await call('POST', '/auth/register', { email: mail(), password: PW, name: 'YOUR_NAME', role: 'employer' })).status, 422);
  });
  test('nobody can register as an admin', async () => assert.equal((await call('POST', '/auth/register', { email: mail(), password: PW, name: 'X', role: 'admin' })).status, 422));
  test('wrong logins look identical, and five lock the account', async () => {
    const c = await candidate();
    const known = await call('POST', '/auth/login', { email: c.email, password: 'YOUR_WRONG_PASSWORD' });
    const unknown = await call('POST', '/auth/login', { email: mail(), password: 'YOUR_WRONG_PASSWORD' });
    assert.deepEqual(known.body, unknown.body);
    for (let i = 0; i < 3; i++) await call('POST', '/auth/login', { email: c.email, password: 'YOUR_WRONG_PASSWORD' });
    assert.equal((await call('POST', '/auth/login', { email: c.email, password: 'YOUR_WRONG_PASSWORD' })).status, 423);
    assert.equal((await call('POST', '/auth/login', { email: c.email, password: PW })).status, 423);
  });
  test('logout and a password change end sessions', async () => {
    const c = await candidate();
    const other = (await call('POST', '/auth/login', { email: c.email, password: PW })).body.token;
    await call('POST', '/auth/password', { currentPassword: PW, newPassword: 'YOUR_NEW_PASSWORD' }, c.token);
    assert.equal((await call('GET', '/me', undefined, other)).status, 401);
    await call('POST', '/auth/logout', {}, c.token);
    assert.equal((await call('GET', '/me', undefined, c.token)).status, 401);
  });
  test('profile completeness reflects what was saved, and skills are de-duplicated', async () => {
    const c = await candidate(['React', 'react ', 'Go']);
    const p = await call('GET', '/profile', undefined, c.token);
    assert.deepEqual(p.body.skills, ['Go', 'React']);
    assert.ok(p.body.completeness.percent > 0);
  });
});

describe('finding jobs', () => {
  test('drafts are hidden and published jobs are searchable', async () => {
    const e = await employer('Zebra Labs');
    const draft = await call('POST', '/employer/jobs', jobInput({ title: 'Quokka Wrangler' }), e.token);
    assert.equal((await call('GET', '/jobs?q=quokka')).body.total, 0);
    assert.equal((await call('GET', `/jobs/${draft.body.id}`)).status, 404);
    await call('POST', `/employer/jobs/${draft.body.id}/publish`, {}, e.token);
    assert.equal((await call('GET', '/jobs?q=quok')).body.total, 1);
    assert.equal((await call('GET', '/jobs?q=zebra quokka')).body.total, 1);
  });
  test('search survives hostile text', async () => {
    for (const q of ['"', 'AND OR NOT', "'; DROP TABLE jobs; --", 'a*b(', '***']) assert.equal((await call('GET', `/jobs?q=${encodeURIComponent(q)}`)).status, 200, q);
  });
  test('filters narrow results', async () => {
    const e = await employer();
    await liveJob(e, { title: 'Wombat Analyst', workplace: 'onsite', location: 'YOUR_OTHER_CITY, YOUR_COUNTRY', level: 'senior', category: 'Finance', salaryMax: 150000 });
    assert.equal((await call('GET', '/jobs?q=wombat&workplace=onsite&level=senior&category=Finance')).body.total, 1);
    assert.equal((await call('GET', '/jobs?q=wombat&workplace=remote')).body.total, 0);
    assert.equal((await call('GET', '/jobs?q=wombat&location=YOUR_OTHER_CITY')).body.total, 1);
    assert.equal((await call('GET', '/jobs?q=wombat&salaryMin=200000')).body.total, 0);
    assert.equal((await call('GET', '/jobs?type=bad')).status, 422);
  });
  test('location search treats wildcards as text', async () => assert.equal((await call('GET', '/jobs?location=%25%25%25')).body.total, 0));
  test('sorting by salary and match', async () => {
    const e = await employer();
    await liveJob(e, { title: 'Numbat Low', salaryMax: 50000, skills: ['Excel'] });
    await liveJob(e, { title: 'Numbat High', salaryMax: 90000, skills: ['React', 'TypeScript'] });
    assert.equal((await call('GET', '/jobs?q=numbat&sort=salary')).body.items[0].title, 'Numbat High');
    const c = await candidate();
    const r = await call('GET', '/jobs?q=numbat&sort=match', undefined, c.token);
    assert.equal(r.body.items[0].title, 'Numbat High');
    assert.ok(r.body.items[0].match > r.body.items[1].match);
  });
  test('anonymous visitors get no match or saved data', async () => {
    const e = await employer();
    const id = await liveJob(e);
    const r = await call('GET', `/jobs/${id}`);
    assert.equal(r.body.match, null);
    assert.equal(r.body.saved, false);
  });
  test('views count, but not for the employer', async () => {
    const e = await employer();
    const id = await liveJob(e);
    await call('GET', `/jobs/${id}`);
    await call('GET', `/jobs/${id}`, undefined, e.token);
    assert.equal((await call('GET', `/employer/jobs/${id}`, undefined, e.token)).body.views, 1);
  });
  test('saving jobs and following companies', async () => {
    const e = await employer();
    const id = await liveJob(e);
    const c = await candidate();
    await call('POST', `/jobs/${id}/save`, {}, c.token);
    await call('POST', `/jobs/${id}/save`, {}, c.token);
    assert.equal((await call('GET', '/saved-jobs', undefined, c.token)).body.length, 1);
    await call('DELETE', `/jobs/${id}/save`, undefined, c.token);
    assert.equal((await call('GET', '/saved-jobs', undefined, c.token)).body.length, 0);
    await call('POST', `/companies/${e.companyId}/follow`, {}, c.token);
    assert.equal((await call('GET', `/companies/${e.companyId}`, undefined, c.token)).body.following, true);
    await liveJob(e, { title: 'Follower Test' });
    assert.ok((await call('GET', '/notifications', undefined, c.token)).body.items.some((n: any) => n.kind === 'company_job'));
  });
  test('salary insights average by level', async () => {
    const e = await employer();
    await liveJob(e, { category: 'Healthcare', level: 'lead', salaryMin: 100000, salaryMax: 200000 });
    const row = (await call('GET', '/insights/salaries?category=Healthcare')).body.find((r: any) => r.level === 'lead');
    assert.equal(row.average, 150000);
  });
});

describe('job posting', () => {
  test('validates salary order, length and skills', async () => {
    const e = await employer();
    assert.equal((await call('POST', '/employer/jobs', jobInput({ salaryMin: 90000, salaryMax: 10 }), e.token)).status, 422);
    assert.equal((await call('POST', '/employer/jobs', jobInput({ description: 'short' }), e.token)).status, 422);
    assert.equal((await call('POST', '/employer/jobs', jobInput({ skills: [] }), e.token)).status, 422);
  });
  test('candidates cannot post, and employers cannot touch another company', async () => {
    const c = await candidate();
    const a = await employer();
    const b = await employer();
    assert.equal((await call('POST', '/employer/jobs', jobInput(), c.token)).status, 403);
    const id = await liveJob(a);
    for (const [method, path, body] of [['GET', `/employer/jobs/${id}`], ['PUT', `/employer/jobs/${id}`, jobInput()], ['POST', `/employer/jobs/${id}/close`, {}], ['GET', `/employer/jobs/${id}/applicants`]] as const) assert.equal((await call(method, path, body, b.token)).status, 404, path);
  });
  test('editing updates the search index', async () => {
    const e = await employer();
    const id = await liveJob(e, { title: 'Pangolin Keeper' });
    await call('PUT', `/employer/jobs/${id}`, jobInput({ title: 'Axolotl Keeper' }), e.token);
    assert.equal((await call('GET', '/jobs?q=pangolin')).body.total, 0);
    assert.equal((await call('GET', '/jobs?q=axolotl')).body.total, 1);
  });
  test('closing hides a job and stops applications', async () => {
    const e = await employer();
    const id = await liveJob(e, { title: 'Tapir Trainer' });
    const c = await candidate();
    await call('POST', `/employer/jobs/${id}/close`, {}, e.token);
    assert.equal((await call('GET', '/jobs?q=tapir')).body.total, 0);
    assert.equal((await call('POST', `/jobs/${id}/apply`, {}, c.token)).body.error.code, 'JOB_CLOSED');
  });
  test('only drafts can be deleted', async () => {
    const e = await employer();
    const d = await call('POST', '/employer/jobs', jobInput(), e.token);
    assert.equal((await call('DELETE', `/employer/jobs/${d.body.id}`, undefined, e.token)).status, 200);
    const live = await liveJob(e);
    assert.equal((await call('DELETE', `/employer/jobs/${live}`, undefined, e.token)).status, 409);
  });
  test('unverified companies are capped until verified', async () => {
    const e = await employer('Newcomer', false);
    for (let i = 0; i < 3; i++) await liveJob(e);
    const d = await call('POST', '/employer/jobs', jobInput(), e.token);
    assert.equal((await call('POST', `/employer/jobs/${d.body.id}/publish`, {}, e.token)).body.error.code, 'VERIFY_TO_PUBLISH_MORE');
    await call('PATCH', `/admin/companies/${e.companyId}`, { verified: true, reason: 'Checked registration' }, admin);
    assert.equal((await call('POST', `/employer/jobs/${d.body.id}/publish`, {}, e.token)).status, 200);
  });
  test('expired jobs close themselves and tell the employer', async () => {
    const e = await employer();
    const id = await liveJob(e, { title: 'Ocelot Officer' });
    db.prepare("UPDATE jobs SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(id);
    assert.equal((await call('GET', '/jobs?q=ocelot')).body.total, 0);
    expireJobs();
    assert.equal((await call('GET', `/employer/jobs/${id}`, undefined, e.token)).body.status, 'closed');
    assert.ok((await call('GET', '/notifications', undefined, e.token)).body.items.some((n: any) => n.kind === 'job_expired'));
  });
});

describe('applying', () => {
  test('applying records a match score and notifies the employer', async () => {
    const { e, c, jobId } = await applied();
    assert.equal((await call('GET', `/jobs/${jobId}`, undefined, c.token)).body.applied, true);
    assert.ok((await call('GET', '/notifications', undefined, e.token)).body.items.some((n: any) => n.kind === 'new_applicant'));
  });
  test('cannot apply twice, even at the same moment', async () => {
    const e = await employer();
    const c = await candidate();
    const id = await liveJob(e);
    const all = await Promise.all(Array.from({ length: 8 }, () => call('POST', `/jobs/${id}/apply`, {}, c.token)));
    assert.equal(all.filter((r) => r.status === 201).length, 1);
    assert.equal(all.filter((r) => r.body.error?.code === 'ALREADY_APPLIED').length, 7);
  });
  test('an empty profile cannot apply', async () => {
    const e = await employer();
    const id = await liveJob(e);
    const r = await call('POST', '/auth/register', { email: mail(), password: PW, name: 'Empty' });
    assert.equal((await call('POST', `/jobs/${id}/apply`, {}, r.body.token)).body.error.code, 'PROFILE_INCOMPLETE');
  });
  test('employers cannot apply, and sign-in is required', async () => {
    const e = await employer();
    const id = await liveJob(e);
    assert.equal((await call('POST', `/jobs/${id}/apply`, {}, e.token)).status, 403);
    assert.equal((await call('POST', `/jobs/${id}/apply`, {})).status, 401);
  });
  test('employers see the profile as it was when the candidate applied', async () => {
    const { e, c, appId } = await applied();
    await call('PUT', '/profile', { headline: 'Changed', summary: null, location: null, phone: null, yearsExperience: 1, desiredMinSalary: null, remoteOk: true, openToWork: true, skills: ['X'], experience: [], education: [] }, c.token);
    assert.equal((await call('GET', `/employer/applications/${appId}`, undefined, e.token)).body.profile.headline, 'Developer');
  });
  test('applications are private to the candidate and the hiring company', async () => {
    const { appId } = await applied();
    const other = await candidate();
    const otherCo = await employer();
    assert.equal((await call('GET', `/applications/${appId}`, undefined, other.token)).status, 404);
    assert.equal((await call('GET', `/employer/applications/${appId}`, undefined, otherCo.token)).status, 404);
    assert.equal((await call('POST', `/employer/applications/${appId}/status`, { status: 'reviewing' }, otherCo.token)).status, 404);
  });
  test('private notes never reach the candidate', async () => {
    const { e, c, appId } = await applied();
    await call('POST', `/employer/applications/${appId}/notes`, { body: 'SECRET-NOTE' }, e.token);
    assert.equal(JSON.stringify((await call('GET', `/applications/${appId}`, undefined, c.token)).body).includes('SECRET-NOTE'), false);
    assert.equal((await call('GET', `/employer/applications/${appId}`, undefined, e.token)).body.notes[0].body, 'SECRET-NOTE');
  });
});

describe('hiring pipeline', () => {
  test('moves step by step to hired, with a timeline and notifications', async () => {
    const { e, c, appId } = await applied();
    await advance(e, appId, 'reviewing', 'shortlisted', 'interview', 'offer', 'hired');
    const a = await call('GET', `/applications/${appId}`, undefined, c.token);
    assert.equal(a.body.status, 'hired');
    assert.equal(a.body.timeline.length, 6);
    assert.ok((await call('GET', '/notifications', undefined, c.token)).body.items.some((n: any) => n.title.includes('Frontend')));
  });
  test('cannot skip stages or leave a final stage', async () => {
    const { e, appId } = await applied();
    assert.equal((await call('POST', `/employer/applications/${appId}/status`, { status: 'offer' }, e.token)).body.error.code, 'BAD_TRANSITION');
    await advance(e, appId, 'rejected');
    assert.equal((await call('POST', `/employer/applications/${appId}/status`, { status: 'reviewing' }, e.token)).status, 409);
  });
  test('employers cannot mark a candidate as withdrawn', async () => {
    const { e, appId } = await applied();
    assert.equal((await call('POST', `/employer/applications/${appId}/status`, { status: 'withdrawn' }, e.token)).status, 409);
  });
  test('withdrawing ends it and cancels interviews', async () => {
    const { e, c, appId } = await applied();
    await advance(e, appId, 'reviewing', 'shortlisted');
    await call('POST', `/employer/applications/${appId}/interviews`, { scheduledAt: new Date(Date.now() + 86400000).toISOString(), mode: 'video' }, e.token);
    assert.equal((await call('POST', `/applications/${appId}/withdraw`, {}, c.token)).body.status, 'withdrawn');
    assert.equal((await call('GET', `/applications/${appId}`, undefined, c.token)).body.interviews[0].status, 'cancelled');
    assert.equal((await call('POST', `/applications/${appId}/withdraw`, {}, c.token)).status, 409);
  });
  test('interviews need a shortlist and a future date, and move the stage', async () => {
    const { e, c, appId } = await applied();
    const when = new Date(Date.now() + 86400000).toISOString();
    assert.equal((await call('POST', `/employer/applications/${appId}/interviews`, { scheduledAt: when, mode: 'video' }, e.token)).status, 409);
    await advance(e, appId, 'reviewing', 'shortlisted');
    assert.equal((await call('POST', `/employer/applications/${appId}/interviews`, { scheduledAt: '2000-01-01T00:00:00.000Z', mode: 'video' }, e.token)).status, 422);
    const iv = await call('POST', `/employer/applications/${appId}/interviews`, { scheduledAt: when, mode: 'video' }, e.token);
    assert.equal(iv.status, 201);
    assert.equal((await call('GET', `/applications/${appId}`, undefined, c.token)).body.status, 'interview');
    assert.equal((await call('POST', `/applications/${appId}/interviews/${iv.body.id}`, { response: 'accepted' }, c.token)).body[0].status, 'accepted');
    assert.equal((await call('POST', `/applications/${appId}/interviews/${iv.body.id}`, { response: 'declined' }, c.token)).status, 409);
  });
  test('employers start conversations, and they close with the application', async () => {
    const { e, c, appId } = await applied();
    assert.equal((await call('POST', `/applications/${appId}/messages`, { body: 'Hi' }, c.token)).body.error.code, 'EMPLOYER_FIRST');
    await call('POST', `/employer/applications/${appId}/messages`, { body: 'Thanks for applying' }, e.token);
    assert.equal((await call('POST', `/applications/${appId}/messages`, { body: 'Thank you' }, c.token)).body.length, 2);
    await advance(e, appId, 'rejected');
    assert.equal((await call('POST', `/applications/${appId}/messages`, { body: 'Why?' }, c.token)).status, 409);
  });
  test('the employer overview counts the funnel', async () => {
    const { e, appId } = await applied();
    await advance(e, appId, 'reviewing');
    const o = await call('GET', '/employer/overview', undefined, e.token);
    assert.equal(o.body.applicants, 1);
    assert.equal(o.body.funnel.find((f: any) => f.status === 'reviewing').count, 1);
    assert.equal(o.body.series.length, 30);
  });
});

describe('job alerts', () => {
  test('a saved search alerts once for a new matching job', async () => {
    const c = await candidate();
    assert.equal((await call('POST', '/saved-searches', { name: 'Lemurs', filters: { q: 'lemur' } }, c.token)).status, 201);
    runJobAlerts();
    const e = await employer();
    await new Promise((r) => setTimeout(r, 5));
    await liveJob(e, { title: 'Lemur Liaison' });
    runJobAlerts();
    runJobAlerts();
    const alerts = (await call('GET', '/notifications', undefined, c.token)).body.items.filter((n: any) => n.kind === 'job_alert');
    assert.equal(alerts.length, 1);
    assert.ok(alerts[0].body.includes('Lemur Liaison'));
  });
  test('alerts can be turned off and searches are private', async () => {
    const c = await candidate();
    const other = await candidate();
    const s = await call('POST', '/saved-searches', { name: 'Off', filters: { q: 'jackal' } }, c.token);
    assert.equal((await call('DELETE', `/saved-searches/${s.body.id}`, undefined, other.token)).status, 404);
    await call('PATCH', `/saved-searches/${s.body.id}`, { alert: false }, c.token);
    const e = await employer();
    await new Promise((r) => setTimeout(r, 5));
    await liveJob(e, { title: 'Jackal Judge' });
    runJobAlerts();
    assert.equal((await call('GET', '/notifications', undefined, c.token)).body.items.filter((n: any) => n.kind === 'job_alert').length, 0);
  });
});

describe('moderation', () => {
  test('only admins reach the admin area', async () => {
    const c = await candidate();
    const e = await employer();
    assert.equal((await call('GET', '/admin/overview', undefined, c.token)).status, 403);
    assert.equal((await call('GET', '/admin/overview', undefined, e.token)).status, 403);
    assert.equal((await call('GET', '/admin/overview')).status, 401);
    assert.equal((await call('GET', '/admin/overview', undefined, admin)).status, 200);
  });
  test('a report can remove a job, once, and is audited', async () => {
    const e = await employer();
    const id = await liveJob(e, { title: 'Scammy Offer' });
    const c = await candidate();
    assert.equal((await call('POST', `/jobs/${id}/report`, { reason: 'scam' }, c.token)).status, 201);
    assert.equal((await call('POST', `/jobs/${id}/report`, { reason: 'scam' }, c.token)).status, 409);
    const report = (await call('GET', '/admin/reports', undefined, admin)).body.find((r: any) => r.jobId === id);
    assert.equal((await call('POST', `/admin/reports/${report.id}`, { decision: 'remove_job', note: 'Fraudulent listing' }, admin)).status, 200);
    assert.equal((await call('GET', '/jobs?q=scammy')).body.total, 0);
    assert.equal((await call('GET', `/jobs/${id}`)).status, 404);
    assert.equal((await call('POST', `/admin/reports/${report.id}`, { decision: 'dismiss', note: 'Again' }, admin)).status, 409);
    assert.equal((await call('POST', `/employer/jobs/${id}/publish`, {}, e.token)).status, 409);
    assert.equal((await call('GET', '/admin/audit', undefined, admin)).body[0].action, 'report.remove_job');
  });
  test('suspending a company hides its jobs at once', async () => {
    const e = await employer();
    await liveJob(e, { title: 'Hidden Heron' });
    await call('PATCH', `/admin/companies/${e.companyId}`, { status: 'suspended', reason: 'Investigation' }, admin);
    assert.equal((await call('GET', '/jobs?q=heron')).body.total, 0);
  });
  test('suspending a user ends their access', async () => {
    const c = await candidate();
    await call('PATCH', `/admin/users/${c.id}`, { status: 'suspended', reason: 'Spam accounts' }, admin);
    assert.equal((await call('GET', '/me', undefined, c.token)).status, 401);
    assert.equal((await call('POST', '/auth/login', { email: c.email, password: PW })).status, 401);
  });
});

test('health check and unknown routes', async () => {
  assert.equal((await fetch(`${base}/health`)).status, 200);
  assert.equal((await call('GET', '/nope')).status, 404);
});
