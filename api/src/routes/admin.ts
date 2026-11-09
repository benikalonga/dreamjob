import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { db, tx } from '../db';
import { requireRole, requireUser } from '../lib/auth';
import { conflict, h, invalid, notFound, parse } from '../lib/http';
import { now } from '../lib/ids';
import { getJob, notify, reindexJob } from '../services/core';

export const adminRouter = Router();
adminRouter.use('/admin', requireUser, requireRole('admin'));

function audit(req: Request, action: string, target: string, detail?: string) {
  db.prepare('INSERT INTO audit_log (admin_id, admin_name, action, target, detail, created_at) VALUES (?,?,?,?,?,?)').run(req.user.id, req.user.name, action, target, detail ?? null, now());
}

const reason = z.object({ reason: z.string().trim().min(3).max(200) });

adminRouter.get('/admin/overview', h(() => {
  const n = (sql: string) => db.prepare(sql).pluck().get() as number;
  return {
    candidates: n("SELECT COUNT(*) FROM users WHERE role = 'candidate'"), employers: n("SELECT COUNT(*) FROM users WHERE role = 'employer'"), companies: n('SELECT COUNT(*) FROM companies'),
    unverified: n('SELECT COUNT(*) FROM companies WHERE verified = 0'), liveJobs: n("SELECT COUNT(*) FROM jobs WHERE status = 'published'"), applications: n('SELECT COUNT(*) FROM applications'), hires: n("SELECT COUNT(*) FROM applications WHERE status = 'hired'"), openReports: n("SELECT COUNT(*) FROM job_reports WHERE status = 'open'"),
  };
}));

adminRouter.get('/admin/companies', h((req) => {
  const q = parse(z.object({ verified: z.enum(['true', 'false']).optional() }), req.query);
  const where = q.verified ? `WHERE c.verified = ${q.verified === 'true' ? 1 : 0}` : '';
  return (db.prepare(`SELECT c.id, c.name, c.industry, c.website, c.location, c.verified, c.status, c.created_at AS createdAt, (SELECT COUNT(*) FROM jobs j WHERE j.company_id = c.id) AS jobs FROM companies c ${where} ORDER BY c.verified, c.created_at DESC LIMIT 200`).all() as { verified: number }[]).map((c) => ({ ...c, verified: !!c.verified }));
}));

adminRouter.patch('/admin/companies/:id', h((req) => {
  const body = parse(z.object({ verified: z.boolean().optional(), status: z.enum(['active', 'suspended']).optional(), reason: z.string().trim().min(3).max(200) }), req.body);
  return tx(() => {
    const c = db.prepare('SELECT id, name FROM companies WHERE id = ?').get(req.params.id) as { id: string; name: string } | undefined;
    if (!c) throw notFound('Company');
    db.prepare('UPDATE companies SET verified = COALESCE(?, verified), status = COALESCE(?, status) WHERE id = ?').run(body.verified === undefined ? null : Number(body.verified), body.status ?? null, c.id);
    if (body.status) for (const id of db.prepare("SELECT id FROM jobs WHERE company_id = ? AND status = 'published'").pluck().all(c.id) as string[]) reindexJob(id);
    audit(req, 'company.update', c.name, `${JSON.stringify({ verified: body.verified, status: body.status })}: ${body.reason}`);
    return { ok: true };
  });
}));

adminRouter.get('/admin/reports', h((req) => {
  const q = parse(z.object({ status: z.enum(['open', 'dismissed', 'actioned']).default('open') }), req.query);
  return db.prepare(`SELECT r.id, r.reason, r.details, r.status, r.created_at AS createdAt, j.id AS jobId, j.title AS jobTitle, j.status AS jobStatus, c.name AS company, u.name AS reporter
    FROM job_reports r JOIN jobs j ON j.id = r.job_id JOIN companies c ON c.id = j.company_id JOIN users u ON u.id = r.reporter_id WHERE r.status = ? ORDER BY r.created_at DESC`).all(q.status);
}));

adminRouter.post('/admin/reports/:id', h((req) => {
  const body = parse(z.object({ decision: z.enum(['dismiss', 'remove_job']), note: z.string().trim().min(3).max(200) }), req.body);
  return tx(() => {
    const r = db.prepare('SELECT * FROM job_reports WHERE id = ?').get(req.params.id) as { id: string; job_id: string; status: string } | undefined;
    if (!r) throw notFound('Report');
    if (r.status !== 'open') throw conflict('This report was already handled');
    if (body.decision === 'dismiss') {
      db.prepare("UPDATE job_reports SET status = 'dismissed' WHERE id = ?").run(r.id);
    } else {
      db.prepare("UPDATE job_reports SET status = 'actioned' WHERE job_id = ? AND status = 'open'").run(r.job_id);
      db.prepare("UPDATE jobs SET status = 'removed', updated_at = ? WHERE id = ?").run(now(), r.job_id);
      reindexJob(r.job_id);
      const j = getJob(r.job_id)!;
      notify(j.posted_by, 'job_removed', 'Job listing removed', `"${j.title}" was removed: ${body.note}`);
    }
    audit(req, `report.${body.decision}`, r.job_id, body.note);
    return { ok: true };
  });
}));

adminRouter.get('/admin/users', h((req) => {
  const q = parse(z.object({ q: z.string().trim().max(60).optional() }), req.query);
  const like = q.q ? `%${q.q.replace(/[\\%_]/g, '\\$&')}%` : '%';
  return db.prepare("SELECT id, name, email, role, status, created_at AS createdAt FROM users WHERE name LIKE @like ESCAPE '\\' OR email LIKE @like ESCAPE '\\' ORDER BY created_at DESC LIMIT 100").all({ like });
}));

adminRouter.patch('/admin/users/:id', h((req) => {
  const body = parse(z.object({ status: z.enum(['active', 'suspended']) }).extend(reason.shape), req.body);
  if (req.params.id === req.user.id) throw invalid('You cannot change your own account');
  return tx(() => {
    const u = db.prepare('SELECT email FROM users WHERE id = ?').get(req.params.id) as { email: string } | undefined;
    if (!u) throw notFound('User');
    db.prepare('UPDATE users SET status = ? WHERE id = ?').run(body.status, req.params.id);
    if (body.status === 'suspended') db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').run(now(), req.params.id);
    audit(req, 'user.update', u.email, `${body.status}: ${body.reason}`);
    return { ok: true };
  });
}));

adminRouter.get('/admin/audit', h(() => db.prepare('SELECT id, admin_name AS adminName, action, target, detail, created_at AS createdAt FROM audit_log ORDER BY id DESC LIMIT 200').all()));
