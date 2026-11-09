import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config';
import { db, tx } from '../db';
import { normalizeSkill } from '../domain/match';
import { canMove, isFinal, nextStages, STAGE_MESSAGES, STAGES, type Stage } from '../domain/pipeline';
import { requireRole, requireUser } from '../lib/auth';
import { ApiError, conflict, h, invalid, notFound, parse } from '../lib/http';
import { newId, now } from '../lib/ids';
import { CATEGORIES, getJob, JOB_SELECT, jobSkills, notify, presentJobDetail, reindexJob, type JobRow } from '../services/core';
import { notifyFollowers } from '../services/jobs';
import { messagesFor } from './candidate';

export const employerRouter = Router();
employerRouter.use('/employer', requireUser, requireRole('employer'));

function ownJob(req: Request, id: string) {
  const j = getJob(id);
  if (!j || j.company_id !== req.user.company_id) throw notFound('Job');
  return j;
}

interface AppRow { id: string; job_id: string; candidate_id: string; status: Stage; cover_note: string | null; snapshot: string; match_score: number; applied_at: string; updated_at: string }

function ownApplication(req: Request, id: string) {
  const a = db.prepare('SELECT a.* FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = ? AND j.company_id = ?').get(id, req.user.company_id) as AppRow | undefined;
  if (!a) throw notFound('Application');
  return a;
}

const list = z.array(z.string().trim().min(1).max(300)).max(20).default([]);
const jobBody = z.object({
  title: z.string().trim().min(3).max(100), category: z.enum(CATEGORIES as [string, ...string[]]), type: z.enum(['full_time', 'part_time', 'contract', 'internship']), level: z.enum(['entry', 'mid', 'senior', 'lead']), workplace: z.enum(['onsite', 'hybrid', 'remote']),
  location: z.string().trim().min(2).max(100), salaryMin: z.number().int().min(0).nullable().default(null), salaryMax: z.number().int().min(0).nullable().default(null), currency: z.string().length(3).toUpperCase().default('USD'),
  description: z.string().trim().min(30).max(8000), responsibilities: list, qualifications: list, benefits: list, skills: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
}).refine((b) => b.salaryMin === null || b.salaryMax === null || b.salaryMin <= b.salaryMax, { message: 'The minimum salary cannot be above the maximum', path: ['salaryMin'] });

function saveSkills(jobId: string, skills: string[]) {
  db.prepare('DELETE FROM job_skills WHERE job_id = ?').run(jobId);
  const seen = new Set<string>();
  for (const s of skills) {
    const key = normalizeSkill(s);
    if (seen.has(key)) continue;
    seen.add(key);
    db.prepare('INSERT INTO job_skills (job_id, skill) VALUES (?,?)').run(jobId, s);
  }
}

const presentEmployerJob = (j: JobRow) => ({
  ...presentJobDetail(j, {}),
  applicants: db.prepare('SELECT COUNT(*) FROM applications WHERE job_id = ?').pluck().get(j.id),
  newApplicants: db.prepare("SELECT COUNT(*) FROM applications WHERE job_id = ? AND status = 'applied'").pluck().get(j.id),
});

employerRouter.get('/employer/overview', h((req) => {
  const cid = req.user.company_id;
  const count = (sql: string) => db.prepare(sql).pluck().get(cid) as number;
  const funnel = db.prepare('SELECT a.status, COUNT(*) AS count FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.company_id = ? GROUP BY a.status').all(cid) as { status: string; count: number }[];
  const since = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const daily = new Map((db.prepare('SELECT substr(a.applied_at,1,10) AS day, COUNT(*) AS count FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.company_id = ? AND a.applied_at >= ? GROUP BY day').all(cid, since) as { day: string; count: number }[]).map((d) => [d.day, d.count]));
  return {
    openJobs: count("SELECT COUNT(*) FROM jobs WHERE company_id = ? AND status = 'published'"),
    drafts: count("SELECT COUNT(*) FROM jobs WHERE company_id = ? AND status = 'draft'"),
    views: count('SELECT COALESCE(SUM(views),0) FROM jobs WHERE company_id = ?'),
    applicants: count('SELECT COUNT(*) FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.company_id = ?'),
    toReview: count("SELECT COUNT(*) FROM applications a JOIN jobs j ON j.id = a.job_id WHERE j.company_id = ? AND a.status = 'applied'"),
    upcomingInterviews: db.prepare("SELECT COUNT(*) FROM interviews i JOIN applications a ON a.id = i.application_id JOIN jobs j ON j.id = a.job_id WHERE j.company_id = ? AND i.status IN ('proposed','accepted') AND i.scheduled_at > ?").pluck().get(cid, now()),
    funnel: STAGES.map((s) => ({ status: s, count: funnel.find((f) => f.status === s)?.count ?? 0 })),
    series: Array.from({ length: 30 }, (_, i) => { const day = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10); return { day, count: daily.get(day) ?? 0 }; }),
  };
}));

employerRouter.get('/employer/company', h((req) => db.prepare('SELECT id, name, industry, size, website, location, about, verified FROM companies WHERE id = ?').get(req.user.company_id)));
employerRouter.put('/employer/company', h((req) => {
  const body = parse(z.object({ name: z.string().trim().min(2).max(100), industry: z.string().trim().max(60).nullable(), size: z.string().trim().max(30).nullable(), website: z.url({ protocol: /^https?$/ }).max(200).nullable(), location: z.string().trim().max(100).nullable(), about: z.string().trim().max(3000).nullable() }), req.body);
  return tx(() => {
    db.prepare('UPDATE companies SET name = ?, industry = ?, size = ?, website = ?, location = ?, about = ? WHERE id = ?').run(body.name, body.industry, body.size, body.website, body.location, body.about, req.user.company_id);
    for (const id of db.prepare("SELECT id FROM jobs WHERE company_id = ? AND status = 'published'").pluck().all(req.user.company_id) as string[]) reindexJob(id);
    return db.prepare('SELECT id, name, industry, size, website, location, about, verified FROM companies WHERE id = ?').get(req.user.company_id);
  });
}));

employerRouter.get('/employer/jobs', h((req) => (db.prepare(`${JOB_SELECT} WHERE j.company_id = ? AND j.status <> 'removed' ORDER BY j.updated_at DESC`).all(req.user.company_id) as JobRow[]).map(presentEmployerJob)));
employerRouter.get('/employer/jobs/:id', h((req) => presentEmployerJob(ownJob(req, req.params.id))));

employerRouter.post('/employer/jobs', h((req, res) => {
  const body = parse(jobBody, req.body);
  const id = newId();
  tx(() => {
    db.prepare(`INSERT INTO jobs (id, company_id, posted_by, title, category, type, level, workplace, location, salary_min, salary_max, currency, description, responsibilities, qualifications, benefits, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?)`)
      .run(id, req.user.company_id, req.user.id, body.title, body.category, body.type, body.level, body.workplace, body.location, body.salaryMin, body.salaryMax, body.currency, body.description, JSON.stringify(body.responsibilities), JSON.stringify(body.qualifications), JSON.stringify(body.benefits), now(), now());
    saveSkills(id, body.skills);
  });
  res.status(201);
  return presentEmployerJob(getJob(id)!);
}));

employerRouter.put('/employer/jobs/:id', h((req) => {
  const body = parse(jobBody, req.body);
  return tx(() => {
    const j = ownJob(req, req.params.id);
    if (j.status === 'removed') throw conflict('This job was removed by moderation');
    db.prepare('UPDATE jobs SET title=?, category=?, type=?, level=?, workplace=?, location=?, salary_min=?, salary_max=?, currency=?, description=?, responsibilities=?, qualifications=?, benefits=?, updated_at=? WHERE id=?')
      .run(body.title, body.category, body.type, body.level, body.workplace, body.location, body.salaryMin, body.salaryMax, body.currency, body.description, JSON.stringify(body.responsibilities), JSON.stringify(body.qualifications), JSON.stringify(body.benefits), now(), j.id);
    saveSkills(j.id, body.skills);
    reindexJob(j.id);
    return presentEmployerJob(getJob(j.id)!);
  });
}));

employerRouter.post('/employer/jobs/:id/publish', h((req) => tx(() => {
  const j = ownJob(req, req.params.id);
  if (j.status !== 'draft' && j.status !== 'closed') throw conflict('Only drafts and closed jobs can be published');
  const company = db.prepare('SELECT verified, status FROM companies WHERE id = ?').get(req.user.company_id) as { verified: number; status: string };
  if (company.status !== 'active') throw new ApiError(403, 'COMPANY_SUSPENDED', 'Your company is suspended');
  if (!company.verified && (db.prepare("SELECT COUNT(*) FROM jobs WHERE company_id = ? AND status = 'published'").pluck().get(req.user.company_id) as number) >= config.unverifiedJobLimit) {
    throw new ApiError(403, 'VERIFY_TO_PUBLISH_MORE', `Unverified companies can have ${config.unverifiedJobLimit} open jobs. Ask for verification to post more.`);
  }
  const first = !j.published_at;
  db.prepare("UPDATE jobs SET status = 'published', published_at = ?, expires_at = ?, updated_at = ? WHERE id = ?").run(now(), new Date(Date.now() + config.jobLifetimeDays * 86_400_000).toISOString(), now(), j.id);
  reindexJob(j.id);
  if (first) notifyFollowers(j.id);
  return presentEmployerJob(getJob(j.id)!);
})));

employerRouter.post('/employer/jobs/:id/close', h((req) => tx(() => {
  const j = ownJob(req, req.params.id);
  if (j.status !== 'published') throw conflict('Only open jobs can be closed');
  db.prepare("UPDATE jobs SET status = 'closed', updated_at = ? WHERE id = ?").run(now(), j.id);
  reindexJob(j.id);
  return presentEmployerJob(getJob(j.id)!);
})));

employerRouter.delete('/employer/jobs/:id', h((req) => tx(() => {
  const j = ownJob(req, req.params.id);
  if (j.status !== 'draft') throw conflict('Only drafts can be deleted. Close the job instead.');
  db.prepare('DELETE FROM job_skills WHERE job_id = ?').run(j.id);
  db.prepare('DELETE FROM saved_jobs WHERE job_id = ?').run(j.id);
  db.prepare('DELETE FROM job_reports WHERE job_id = ?').run(j.id);
  db.prepare('DELETE FROM jobs WHERE id = ?').run(j.id);
  return { ok: true };
})));

function presentApplicant(a: AppRow) {
  const s = JSON.parse(a.snapshot) as { name: string; headline: string | null; location: string | null; yearsExperience: number; skills: string[] };
  return { id: a.id, status: a.status, matchScore: a.match_score, appliedAt: a.applied_at, updatedAt: a.updated_at, name: s.name, headline: s.headline, location: s.location, yearsExperience: s.yearsExperience, skills: s.skills };
}

employerRouter.get('/employer/jobs/:id/applicants', h((req) => {
  const j = ownJob(req, req.params.id);
  const rows = db.prepare('SELECT * FROM applications WHERE job_id = ? ORDER BY match_score DESC, applied_at').all(j.id) as AppRow[];
  return { job: { id: j.id, title: j.title }, items: rows.map(presentApplicant) };
}));

employerRouter.get('/employer/applications/:id', h((req) => {
  const a = ownApplication(req, req.params.id);
  const j = getJob(a.job_id)!;
  db.prepare('UPDATE messages SET read_at = ? WHERE application_id = ? AND sender_id = ? AND read_at IS NULL').run(now(), a.id, a.candidate_id);
  return {
    id: a.id, status: a.status, matchScore: a.match_score, coverNote: a.cover_note, appliedAt: a.applied_at, candidateId: a.candidate_id, profile: JSON.parse(a.snapshot), job: { id: j.id, title: j.title, skills: jobSkills(j.id) }, nextStages: nextStages(a.status),
    timeline: db.prepare('SELECT status, note, created_at AS createdAt FROM application_events WHERE application_id = ? ORDER BY id').all(a.id),
    notes: db.prepare('SELECT n.id, n.body, n.created_at AS createdAt, u.name AS author FROM application_notes n JOIN users u ON u.id = n.author_id WHERE n.application_id = ? ORDER BY n.created_at DESC, n.rowid DESC').all(a.id),
    interviews: db.prepare('SELECT id, scheduled_at AS scheduledAt, duration_minutes AS durationMinutes, mode, details, status FROM interviews WHERE application_id = ? ORDER BY scheduled_at').all(a.id),
    messages: messagesFor(a.id),
  };
}));

employerRouter.post('/employer/applications/:id/status', h((req) => {
  const body = parse(z.object({ status: z.enum(STAGES), note: z.string().trim().max(500).optional() }), req.body);
  return tx(() => {
    const a = ownApplication(req, req.params.id);
    if (body.status === 'withdrawn' || !canMove(a.status, body.status)) throw conflict(`An application cannot move from ${a.status} to ${body.status}`, 'BAD_TRANSITION');
    db.prepare('UPDATE applications SET status = ?, updated_at = ? WHERE id = ?').run(body.status, now(), a.id);
    db.prepare('INSERT INTO application_events (application_id, status, note, created_at) VALUES (?,?,?,?)').run(a.id, body.status, body.note ?? null, now());
    if (isFinal(body.status)) db.prepare("UPDATE interviews SET status = 'cancelled' WHERE application_id = ? AND status = 'proposed'").run(a.id);
    const j = getJob(a.job_id)!;
    notify(a.candidate_id, 'application', `${j.title} at ${j.company_name}`, STAGE_MESSAGES[body.status] ?? 'Your application was updated.', `/applications/${a.id}`);
    return { status: body.status };
  });
}));

employerRouter.post('/employer/applications/:id/notes', h((req, res) => {
  const body = parse(z.object({ body: z.string().trim().min(1).max(2000) }), req.body);
  const a = ownApplication(req, req.params.id);
  db.prepare('INSERT INTO application_notes (id, application_id, author_id, body, created_at) VALUES (?,?,?,?,?)').run(newId(), a.id, req.user.id, body.body, now());
  res.status(201);
  return { ok: true };
}));

employerRouter.post('/employer/applications/:id/messages', h((req, res) => {
  const body = parse(z.object({ body: z.string().trim().min(1).max(2000) }), req.body);
  return tx(() => {
    const a = ownApplication(req, req.params.id);
    if (isFinal(a.status)) throw conflict('This conversation has closed');
    db.prepare('INSERT INTO messages (id, application_id, sender_id, body, created_at) VALUES (?,?,?,?,?)').run(newId(), a.id, req.user.id, body.body, now());
    const j = getJob(a.job_id)!;
    notify(a.candidate_id, 'message', `Message from ${j.company_name}`, body.body.slice(0, 100), `/applications/${a.id}`);
    res.status(201);
    return messagesFor(a.id);
  });
}));

employerRouter.post('/employer/applications/:id/interviews', h((req, res) => {
  const body = parse(z.object({ scheduledAt: z.iso.datetime(), durationMinutes: z.number().int().min(15).max(480).default(45), mode: z.enum(['video', 'phone', 'onsite']), details: z.string().trim().max(500).optional() }), req.body);
  if (Date.parse(body.scheduledAt) <= Date.now()) throw invalid('The interview must be in the future');
  return tx(() => {
    const a = ownApplication(req, req.params.id);
    if (!['shortlisted', 'interview'].includes(a.status)) throw conflict('Shortlist this candidate before inviting them to an interview');
    if (a.status === 'shortlisted') {
      db.prepare("UPDATE applications SET status = 'interview', updated_at = ? WHERE id = ?").run(now(), a.id);
      db.prepare("INSERT INTO application_events (application_id, status, created_at) VALUES (?, 'interview', ?)").run(a.id, now());
    }
    const id = newId();
    db.prepare("INSERT INTO interviews (id, application_id, scheduled_at, duration_minutes, mode, details, status, created_at) VALUES (?,?,?,?,?,?,'proposed',?)").run(id, a.id, body.scheduledAt, body.durationMinutes, body.mode, body.details ?? null, now());
    const j = getJob(a.job_id)!;
    notify(a.candidate_id, 'interview', 'Interview invitation', `${j.company_name} invited you to interview for ${j.title}.`, `/applications/${a.id}`);
    res.status(201);
    return { id, status: 'proposed' };
  });
}));
