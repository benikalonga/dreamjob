import { Router } from 'express';
import { z } from 'zod';
import { db, tx } from '../db';
import { canWithdraw, isFinal, type Stage } from '../domain/pipeline';
import { optionalUser, requireRole, requireUser } from '../lib/auth';
import { ApiError, conflict, h, invalid, notFound, parse } from '../lib/http';
import { newId, now } from '../lib/ids';
import { CATEGORIES, fullProfile, getJob, JOB_COLS, JOB_SELECT, LIVE, matchProfile, matchScore, notify, presentJobCard, presentJobDetail, searchClause, jobSkills, type JobRow, type SearchFilters } from '../services/core';

export const candidateRouter = Router();

const filters = z.object({
  q: z.string().trim().max(100).optional(), category: z.string().max(40).optional(), type: z.enum(['full_time', 'part_time', 'contract', 'internship']).optional(), level: z.enum(['entry', 'mid', 'senior', 'lead']).optional(),
  workplace: z.enum(['onsite', 'hybrid', 'remote']).optional(), location: z.string().trim().max(60).optional(), salaryMin: z.coerce.number().int().min(0).optional(), postedDays: z.coerce.number().int().min(1).max(90).optional(), companyId: z.string().max(40).optional(),
});

function viewerContext(userId: string | undefined, role: string | undefined) {
  if (!userId || role !== 'candidate') return null;
  return {
    profile: matchProfile(userId),
    saved: new Set(db.prepare('SELECT job_id FROM saved_jobs WHERE user_id = ?').pluck().all(userId) as string[]),
    applied: new Set(db.prepare('SELECT job_id FROM applications WHERE candidate_id = ?').pluck().all(userId) as string[]),
  };
}
type Ctx = ReturnType<typeof viewerContext>;

function decorate(j: JobRow, ctx: Ctx) {
  if (!ctx) return {};
  return { saved: ctx.saved.has(j.id), applied: ctx.applied.has(j.id), match: matchScore(ctx.profile, { skills: jobSkills(j.id), level: j.level, workplace: j.workplace, location: j.location, salaryMax: j.salary_max }) };
}

candidateRouter.get('/meta', h(() => ({
  categories: CATEGORIES, types: ['full_time', 'part_time', 'contract', 'internship'], levels: ['entry', 'mid', 'senior', 'lead'], workplaces: ['onsite', 'hybrid', 'remote'],
  stats: {
    jobs: db.prepare(`SELECT COUNT(*) FROM jobs j JOIN companies c ON c.id = j.company_id WHERE ${LIVE}`).pluck().get({ now: now() }),
    companies: db.prepare("SELECT COUNT(*) FROM companies WHERE status = 'active'").pluck().get(),
  },
})));

candidateRouter.get('/jobs', optionalUser, h((req) => {
  const q = parse(filters.extend({ sort: z.enum(['relevance', 'newest', 'salary', 'match']).default('newest'), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(50).default(20) }), req.query);
  const { from, clause, params, hasFts } = searchClause(q);
  const total = db.prepare(`SELECT COUNT(*) ${from} WHERE ${clause}`).pluck().get(params) as number;
  const ctx = viewerContext(req.viewer?.id, req.viewer?.role);
  const offset = (q.page - 1) * q.limit;
  let rows: JobRow[];
  if (q.sort === 'match' && ctx) {
    const pool = db.prepare(`SELECT ${JOB_COLS} ${from} WHERE ${clause} ORDER BY j.published_at DESC LIMIT 500`).all(params) as JobRow[];
    rows = pool.map((j) => ({ j, score: decorate(j, ctx).match!.score })).sort((a, b) => b.score - a.score).slice(offset, offset + q.limit).map((x) => x.j);
  } else {
    const order = q.sort === 'salary' ? 'j.salary_max IS NULL, j.salary_max DESC' : q.sort === 'relevance' && hasFts ? 'bm25(jobs_fts, 0, 10, 5, 8, 2, 1)' : 'j.published_at DESC';
    rows = db.prepare(`SELECT ${JOB_COLS} ${from} WHERE ${clause} ORDER BY ${order}, j.id LIMIT @limit OFFSET @offset`).all({ ...params, limit: q.limit, offset }) as JobRow[];
  }
  return { items: rows.map((j) => presentJobCard(j, decorate(j, ctx))), total, page: q.page, hasMore: q.page * q.limit < total };
}));

candidateRouter.get('/jobs/:id', optionalUser, h((req) => {
  const j = getJob(req.params.id);
  const owner = j && req.viewer?.company_id === j.company_id;
  if (!j || (j.status !== 'published' && j.status !== 'closed' && !owner)) throw notFound('Job');
  if (j.status === 'published' && !owner) db.prepare('UPDATE jobs SET views = views + 1 WHERE id = ?').run(j.id);
  const ctx = viewerContext(req.viewer?.id, req.viewer?.role);
  const similar = db.prepare(`${JOB_SELECT} WHERE ${LIVE} AND j.category = @category AND j.id <> @id ORDER BY j.published_at DESC LIMIT 5`).all({ now: now(), category: j.category, id: j.id }) as JobRow[];
  const company = db.prepare('SELECT id, name, industry, size, website, location, about, verified FROM companies WHERE id = ?').get(j.company_id) as { verified: number };
  return { ...presentJobDetail(j, decorate(j, ctx)), companyInfo: { ...company, verified: !!company.verified }, similar: similar.map((s) => presentJobCard(s, decorate(s, ctx))) };
}));

candidateRouter.get('/companies', h((req) => {
  const q = parse(z.object({ q: z.string().trim().max(60).optional() }), req.query);
  const like = q.q ? `%${q.q.replace(/[\\%_]/g, '\\$&')}%` : '%';
  return (db.prepare(`SELECT c.id, c.name, c.industry, c.location, c.verified, (SELECT COUNT(*) FROM jobs j WHERE j.company_id = c.id AND j.status = 'published' AND j.expires_at > @now) AS openJobs
    FROM companies c WHERE c.status = 'active' AND c.name LIKE @like ESCAPE '\\' ORDER BY openJobs DESC, c.name LIMIT 50`).all({ now: now(), like }) as { verified: number }[]).map((c) => ({ ...c, verified: !!c.verified }));
}));

candidateRouter.get('/companies/:id', optionalUser, h((req) => {
  const c = db.prepare("SELECT id, name, industry, size, website, location, about, verified FROM companies WHERE id = ? AND status = 'active'").get(req.params.id) as { id: string; verified: number } | undefined;
  if (!c) throw notFound('Company');
  const ctx = viewerContext(req.viewer?.id, req.viewer?.role);
  const jobs = db.prepare(`${JOB_SELECT} WHERE ${LIVE} AND j.company_id = @id ORDER BY j.published_at DESC`).all({ now: now(), id: c.id }) as JobRow[];
  const following = req.viewer ? !!db.prepare('SELECT 1 FROM follows WHERE user_id = ? AND company_id = ?').get(req.viewer.id, c.id) : false;
  return { ...c, verified: !!c.verified, following, followers: db.prepare('SELECT COUNT(*) FROM follows WHERE company_id = ?').pluck().get(c.id), jobs: jobs.map((j) => presentJobCard(j, decorate(j, ctx))) };
}));

candidateRouter.get('/insights/salaries', h((req) => {
  const q = parse(z.object({ category: z.string().max(40).optional() }), req.query);
  const rows = db.prepare(`SELECT j.category, j.level, COUNT(*) AS jobs, ROUND(AVG((j.salary_min + j.salary_max) / 2)) AS average, MIN(j.salary_min) AS low, MAX(j.salary_max) AS high
    FROM jobs j JOIN companies c ON c.id = j.company_id WHERE ${LIVE} AND j.salary_min IS NOT NULL AND j.salary_max IS NOT NULL AND j.currency = 'USD' AND (@category IS NULL OR j.category = @category) GROUP BY j.category, j.level ORDER BY j.category, average`).all({ now: now(), category: q.category ?? null });
  return rows;
}));

// --- Everything below needs a signed-in user ---
const candidateOnly = [requireUser, requireRole('candidate')];

candidateRouter.post('/companies/:id/follow', ...candidateOnly, h((req) => {
  if (!db.prepare("SELECT 1 FROM companies WHERE id = ? AND status = 'active'").get(req.params.id)) throw notFound('Company');
  db.prepare('INSERT OR IGNORE INTO follows (user_id, company_id) VALUES (?,?)').run(req.user.id, req.params.id);
  return { following: true };
}));
candidateRouter.delete('/companies/:id/follow', ...candidateOnly, h((req) => {
  db.prepare('DELETE FROM follows WHERE user_id = ? AND company_id = ?').run(req.user.id, req.params.id);
  return { following: false };
}));

candidateRouter.post('/jobs/:id/save', ...candidateOnly, h((req) => {
  if (!getJob(req.params.id)) throw notFound('Job');
  db.prepare('INSERT OR IGNORE INTO saved_jobs (user_id, job_id, created_at) VALUES (?,?,?)').run(req.user.id, req.params.id, now());
  return { saved: true };
}));
candidateRouter.delete('/jobs/:id/save', ...candidateOnly, h((req) => {
  db.prepare('DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?').run(req.user.id, req.params.id);
  return { saved: false };
}));
candidateRouter.get('/saved-jobs', ...candidateOnly, h((req) => {
  const ctx = viewerContext(req.user.id, 'candidate');
  const rows = db.prepare(`${JOB_SELECT} JOIN saved_jobs s ON s.job_id = j.id WHERE s.user_id = ? AND j.status <> 'removed' ORDER BY s.created_at DESC`).all(req.user.id) as JobRow[];
  return rows.map((j) => presentJobCard(j, decorate(j, ctx)));
}));

candidateRouter.post('/jobs/:id/report', requireUser, h((req, res) => {
  const body = parse(z.object({ reason: z.enum(['scam', 'misleading', 'offensive', 'other']), details: z.string().trim().max(500).optional() }), req.body);
  if (!getJob(req.params.id)) throw notFound('Job');
  if (db.prepare('SELECT 1 FROM job_reports WHERE job_id = ? AND reporter_id = ?').get(req.params.id, req.user.id)) throw conflict('You already reported this job', 'ALREADY_REPORTED');
  db.prepare('INSERT INTO job_reports (id, job_id, reporter_id, reason, details, created_at) VALUES (?,?,?,?,?,?)').run(newId(), req.params.id, req.user.id, body.reason, body.details ?? null, now());
  res.status(201);
  return { ok: true };
}));

// --- Applying ---
candidateRouter.post('/jobs/:id/apply', ...candidateOnly, h((req, res) => {
  const body = parse(z.object({ coverNote: z.string().trim().max(2000).optional() }), req.body);
  const app = tx(() => {
    const j = getJob(req.params.id);
    if (!j) throw notFound('Job');
    if (j.status !== 'published' || !j.expires_at || j.expires_at <= now()) throw conflict('This job is no longer accepting applications', 'JOB_CLOSED');
    if (db.prepare('SELECT 1 FROM applications WHERE job_id = ? AND candidate_id = ?').get(j.id, req.user.id)) throw conflict('You have already applied to this job', 'ALREADY_APPLIED');
    const profile = fullProfile(req.user.id);
    if (!profile.headline || profile.skills.length === 0) throw invalid('Add a headline and at least one skill to your profile before applying', 'PROFILE_INCOMPLETE');
    const match = matchScore(matchProfile(req.user.id), { skills: jobSkills(j.id), level: j.level, workplace: j.workplace, location: j.location, salaryMax: j.salary_max });
    const id = newId();
    const snapshot = JSON.stringify({ name: req.user.name, email: req.user.email, ...profile, completeness: undefined });
    db.prepare("INSERT INTO applications (id, job_id, candidate_id, status, cover_note, snapshot, match_score, applied_at, updated_at) VALUES (?,?,?,'applied',?,?,?,?,?)").run(id, j.id, req.user.id, body.coverNote ?? null, snapshot, match.score, now(), now());
    db.prepare("INSERT INTO application_events (application_id, status, created_at) VALUES (?, 'applied', ?)").run(id, now());
    notify(j.posted_by, 'new_applicant', 'New applicant', `${req.user.name} applied for ${j.title}.`, `/applications/${id}`);
    return { id, status: 'applied', matchScore: match.score };
  });
  res.status(201);
  return app;
}));

interface AppRow { id: string; job_id: string; candidate_id: string; status: Stage; cover_note: string | null; snapshot: string; match_score: number; applied_at: string; updated_at: string }

function ownApplication(id: string, userId: string) {
  const a = db.prepare('SELECT * FROM applications WHERE id = ? AND candidate_id = ?').get(id, userId) as AppRow | undefined;
  if (!a) throw notFound('Application');
  return a;
}

const interviewsFor = (id: string) => db.prepare('SELECT id, scheduled_at AS scheduledAt, duration_minutes AS durationMinutes, mode, details, status FROM interviews WHERE application_id = ? ORDER BY scheduled_at').all(id);
export const messagesFor = (id: string) => db.prepare('SELECT m.id, m.sender_id AS senderId, u.name AS senderName, m.body, m.read_at AS readAt, m.created_at AS createdAt FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.application_id = ? ORDER BY m.created_at, m.rowid').all(id);

candidateRouter.get('/applications', ...candidateOnly, h((req) => {
  const rows = db.prepare('SELECT * FROM applications WHERE candidate_id = ? ORDER BY updated_at DESC').all(req.user.id) as AppRow[];
  return rows.map((a) => {
    const j = getJob(a.job_id)!;
    const unread = db.prepare('SELECT COUNT(*) FROM messages WHERE application_id = ? AND sender_id <> ? AND read_at IS NULL').pluck().get(a.id, req.user.id);
    return { id: a.id, status: a.status, appliedAt: a.applied_at, updatedAt: a.updated_at, matchScore: a.match_score, unread, job: { id: j.id, title: j.title, company: j.company_name, location: j.location } };
  });
}));

candidateRouter.get('/applications/:id', ...candidateOnly, h((req) => {
  const a = ownApplication(req.params.id, req.user.id);
  const j = getJob(a.job_id)!;
  db.prepare('UPDATE messages SET read_at = ? WHERE application_id = ? AND sender_id <> ? AND read_at IS NULL').run(now(), a.id, req.user.id);
  return {
    id: a.id, status: a.status, coverNote: a.cover_note, appliedAt: a.applied_at, matchScore: a.match_score, job: { id: j.id, title: j.title, company: j.company_name, location: j.location },
    timeline: db.prepare('SELECT status, note, created_at AS createdAt FROM application_events WHERE application_id = ? ORDER BY id').all(a.id), interviews: interviewsFor(a.id), messages: messagesFor(a.id), canWithdraw: canWithdraw(a.status),
    canMessage: !isFinal(a.status) && !!db.prepare('SELECT 1 FROM messages WHERE application_id = ? AND sender_id <> ?').get(a.id, req.user.id),
  };
}));

candidateRouter.post('/applications/:id/withdraw', ...candidateOnly, h((req) => tx(() => {
  const a = ownApplication(req.params.id, req.user.id);
  if (!canWithdraw(a.status)) throw conflict('This application can no longer be withdrawn');
  db.prepare("UPDATE applications SET status = 'withdrawn', updated_at = ? WHERE id = ?").run(now(), a.id);
  db.prepare("INSERT INTO application_events (application_id, status, created_at) VALUES (?, 'withdrawn', ?)").run(a.id, now());
  db.prepare("UPDATE interviews SET status = 'cancelled' WHERE application_id = ? AND status IN ('proposed','accepted')").run(a.id);
  const j = getJob(a.job_id)!;
  notify(j.posted_by, 'withdrawn', 'Application withdrawn', `${req.user.name} withdrew from ${j.title}.`, `/applications/${a.id}`);
  return { status: 'withdrawn' };
})));

candidateRouter.post('/applications/:id/messages', ...candidateOnly, h((req, res) => {
  const body = parse(z.object({ body: z.string().trim().min(1).max(2000) }), req.body);
  return tx(() => {
    const a = ownApplication(req.params.id, req.user.id);
    if (isFinal(a.status)) throw conflict('This conversation has closed');
    if (!db.prepare('SELECT 1 FROM messages WHERE application_id = ? AND sender_id <> ?').get(a.id, req.user.id)) throw new ApiError(403, 'EMPLOYER_FIRST', 'The employer needs to start this conversation');
    db.prepare('INSERT INTO messages (id, application_id, sender_id, body, created_at) VALUES (?,?,?,?,?)').run(newId(), a.id, req.user.id, body.body, now());
    const j = getJob(a.job_id)!;
    notify(j.posted_by, 'message', `Message from ${req.user.name}`, body.body.slice(0, 100), `/applications/${a.id}`);
    res.status(201);
    return messagesFor(a.id);
  });
}));

candidateRouter.post('/applications/:id/interviews/:interviewId', ...candidateOnly, h((req) => {
  const body = parse(z.object({ response: z.enum(['accepted', 'declined']) }), req.body);
  return tx(() => {
    const a = ownApplication(req.params.id, req.user.id);
    const iv = db.prepare('SELECT * FROM interviews WHERE id = ? AND application_id = ?').get(req.params.interviewId, a.id) as { status: string } | undefined;
    if (!iv) throw notFound('Interview');
    if (iv.status !== 'proposed') throw conflict('This invitation was already answered');
    db.prepare('UPDATE interviews SET status = ? WHERE id = ?').run(body.response, req.params.interviewId);
    const j = getJob(a.job_id)!;
    notify(j.posted_by, 'interview', `Interview ${body.response}`, `${req.user.name} ${body.response} the interview for ${j.title}.`, `/applications/${a.id}`);
    return interviewsFor(a.id);
  });
}));

// --- Saved searches and notifications ---
candidateRouter.get('/saved-searches', ...candidateOnly, h((req) => (db.prepare('SELECT id, name, filters, alert FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id) as { filters: string; alert: number }[]).map((s) => ({ ...s, filters: JSON.parse(s.filters) as SearchFilters, alert: !!s.alert }))));

candidateRouter.post('/saved-searches', ...candidateOnly, h((req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(1).max(60), filters, alert: z.boolean().default(true) }), req.body);
  if ((db.prepare('SELECT COUNT(*) FROM saved_searches WHERE user_id = ?').pluck().get(req.user.id) as number) >= 20) throw invalid('You can keep up to 20 saved searches');
  const id = newId();
  db.prepare('INSERT INTO saved_searches (id, user_id, name, filters, alert, last_checked_at, created_at) VALUES (?,?,?,?,?,?,?)').run(id, req.user.id, body.name, JSON.stringify(body.filters), Number(body.alert), now(), now());
  res.status(201);
  return { id, ...body };
}));
candidateRouter.patch('/saved-searches/:id', ...candidateOnly, h((req) => {
  const body = parse(z.object({ alert: z.boolean() }), req.body);
  if (!db.prepare('UPDATE saved_searches SET alert = ? WHERE id = ? AND user_id = ?').run(Number(body.alert), req.params.id, req.user.id).changes) throw notFound('Saved search');
  return { alert: body.alert };
}));
candidateRouter.delete('/saved-searches/:id', ...candidateOnly, h((req) => {
  if (!db.prepare('DELETE FROM saved_searches WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id).changes) throw notFound('Saved search');
  return { ok: true };
}));

candidateRouter.get('/notifications', requireUser, h((req) => ({
  items: db.prepare('SELECT id, kind, title, body, link, read_at AS readAt, created_at AS createdAt FROM notifications WHERE user_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 100').all(req.user.id),
  unread: db.prepare('SELECT COUNT(*) FROM notifications WHERE user_id = ? AND read_at IS NULL').pluck().get(req.user.id),
})));
candidateRouter.post('/notifications/read', requireUser, h((req) => {
  db.prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(now(), req.user.id);
  return { ok: true };
}));
