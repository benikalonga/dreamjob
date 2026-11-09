import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config } from '../config';
import { db, tx } from '../db';
import { burnCompare, checkPassword, getUser, hashPassword, requireRole, requireUser, startSession, type UserRow } from '../lib/auth';
import { ApiError, h, parse } from '../lib/http';
import { newId, now } from '../lib/ids';
import { normalizeSkill } from '../domain/match';
import { fullProfile } from '../services/core';

export const authRouter = Router();

const limiter = rateLimit({ windowMs: 60_000, max: config.isTest ? 100_000 : 20, standardHeaders: true, legacyHeaders: false, message: { error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a minute.' } } });
const email = z.string().trim().toLowerCase().pipe(z.email());
const password = z.string().min(10, 'Use at least 10 characters').max(200);
const device = z.string().trim().max(80).optional();

export function presentUser(u: UserRow) {
  const company = u.company_id ? db.prepare('SELECT id, name, verified FROM companies WHERE id = ?').get(u.company_id) as { id: string; name: string; verified: number } : null;
  return { id: u.id, email: u.email, name: u.name, role: u.role, company: company ? { ...company, verified: !!company.verified } : null };
}

authRouter.post('/auth/register', limiter, h(async (req, res) => {
  const body = parse(z.object({ email, password, name: z.string().trim().min(2).max(80), role: z.enum(['candidate', 'employer']).default('candidate'), companyName: z.string().trim().min(2).max(100).optional(), device }), req.body);
  if (body.role === 'employer' && !body.companyName) throw new ApiError(422, 'INVALID_REQUEST', 'companyName: Required for employer accounts');
  const hash = await hashPassword(body.password);
  const user = tx(() => {
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(body.email)) throw new ApiError(409, 'EMAIL_TAKEN', 'This email already has an account');
    const id = newId();
    let companyId: string | null = null;
    if (body.role === 'employer') {
      companyId = newId();
      db.prepare('INSERT INTO companies (id, name, created_at) VALUES (?,?,?)').run(companyId, body.companyName, now());
    }
    db.prepare('INSERT INTO users (id, email, password_hash, name, role, company_id, created_at) VALUES (?,?,?,?,?,?,?)').run(id, body.email, hash, body.name, body.role, companyId, now());
    db.prepare('INSERT INTO profiles (user_id, updated_at) VALUES (?,?)').run(id, now());
    return getUser(id)!;
  });
  res.status(201);
  return { token: startSession(user.id, body.device || 'Unknown device'), user: presentUser(user) };
}));

authRouter.post('/auth/login', limiter, h(async (req) => {
  const body = parse(z.object({ email, password: z.string().min(1).max(200), device }), req.body);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(body.email) as UserRow | undefined;
  if (!user || user.status !== 'active') {
    await burnCompare(body.password);
    throw new ApiError(401, 'BAD_CREDENTIALS', 'Wrong email or password');
  }
  await checkPassword(user, body.password);
  return { token: startSession(user.id, body.device || 'Unknown device'), user: presentUser(user) };
}));

authRouter.use(['/auth/logout', '/auth/password', '/me', '/profile'], requireUser);

authRouter.post('/auth/logout', h((req) => {
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE id = ?').run(now(), req.sessionId);
  return { ok: true };
}));

authRouter.post('/auth/password', limiter, h(async (req) => {
  const body = parse(z.object({ currentPassword: z.string().max(200), newPassword: password }), req.body);
  await checkPassword(req.user, body.currentPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(body.newPassword), req.user.id);
  db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND id <> ? AND revoked_at IS NULL').run(now(), req.user.id, req.sessionId);
  return { ok: true };
}));

authRouter.get('/me', h((req) => presentUser(req.user)));

authRouter.get('/profile', requireRole('candidate'), h((req) => fullProfile(req.user.id)));

const yearMonth = z.string().regex(/^\d{4}-\d{2}$/, 'Use the format YYYY-MM');

authRouter.put('/profile', requireRole('candidate'), h((req) => {
  const body = parse(z.object({
    name: z.string().trim().min(2).max(80).optional(),
    headline: z.string().trim().max(120).nullable(), summary: z.string().trim().max(2000).nullable(), location: z.string().trim().max(100).nullable(), phone: z.string().trim().max(30).nullable(),
    yearsExperience: z.number().int().min(0).max(60), desiredMinSalary: z.number().int().min(0).max(100_000_000).nullable(), remoteOk: z.boolean(), openToWork: z.boolean(),
    skills: z.array(z.string().trim().min(1).max(40)).max(30),
    experience: z.array(z.object({ title: z.string().trim().min(1).max(100), company: z.string().trim().min(1).max(100), startDate: yearMonth, endDate: yearMonth.nullable(), summary: z.string().trim().max(1000).nullable().optional() })).max(20),
    education: z.array(z.object({ school: z.string().trim().min(1).max(120), degree: z.string().trim().min(1).max(120), year: z.number().int().min(1950).max(2100).nullable() })).max(10),
  }), req.body);
  return tx(() => {
    const id = req.user.id;
    if (body.name) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(body.name, id);
    db.prepare('UPDATE profiles SET headline = ?, summary = ?, location = ?, phone = ?, years_experience = ?, desired_min_salary = ?, remote_ok = ?, open_to_work = ?, updated_at = ? WHERE user_id = ?')
      .run(body.headline || null, body.summary || null, body.location || null, body.phone || null, body.yearsExperience, body.desiredMinSalary, Number(body.remoteOk), Number(body.openToWork), now(), id);
    db.prepare('DELETE FROM profile_skills WHERE user_id = ?').run(id);
    const seen = new Set<string>();
    for (const s of body.skills) {
      const key = normalizeSkill(s);
      if (seen.has(key)) continue;
      seen.add(key);
      db.prepare('INSERT INTO profile_skills (user_id, skill) VALUES (?,?)').run(id, s);
    }
    db.prepare('DELETE FROM experiences WHERE user_id = ?').run(id);
    for (const e of body.experience) db.prepare('INSERT INTO experiences (id, user_id, title, company, start_date, end_date, summary) VALUES (?,?,?,?,?,?,?)').run(newId(), id, e.title, e.company, e.startDate, e.endDate, e.summary ?? null);
    db.prepare('DELETE FROM education WHERE user_id = ?').run(id);
    for (const e of body.education) db.prepare('INSERT INTO education (id, user_id, school, degree, year) VALUES (?,?,?,?,?)').run(newId(), id, e.school, e.degree, e.year);
    return fullProfile(id);
  });
}));
