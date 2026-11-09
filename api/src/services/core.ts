import { db } from '../db';
import { matchScore, profileCompleteness, type MatchProfile, type MatchResult } from '../domain/match';
import { toFtsQuery } from '../domain/search';
import { newId, now } from '../lib/ids';

export interface JobRow {
  id: string; company_id: string; posted_by: string; title: string; category: string; type: string; level: string; workplace: string; location: string; salary_min: number | null; salary_max: number | null; currency: string;
  description: string; responsibilities: string; qualifications: string; benefits: string; status: string; views: number; published_at: string | null; expires_at: string | null; created_at: string; updated_at: string;
  company_name: string; company_verified: number; company_location: string | null;
}

export const JOB_SELECT = `SELECT j.*, c.name AS company_name, c.verified AS company_verified, c.location AS company_location FROM jobs j JOIN companies c ON c.id = j.company_id`;
export const LIVE = `j.status = 'published' AND j.expires_at > @now AND c.status = 'active'`;

export const CATEGORIES = ['Engineering', 'Design', 'Product', 'Marketing', 'Sales', 'Finance', 'Operations', 'Customer Support', 'Healthcare', 'Education'];

export const jobSkills = (id: string) => db.prepare('SELECT skill FROM job_skills WHERE job_id = ? ORDER BY skill').pluck().all(id) as string[];
export const getJob = (id: string) => db.prepare(`${JOB_SELECT} WHERE j.id = ?`).get(id) as JobRow | undefined;

export function notify(userId: string, kind: string, title: string, body: string, link?: string) {
  db.prepare('INSERT INTO notifications (id, user_id, kind, title, body, link, created_at) VALUES (?,?,?,?,?,?,?)').run(newId(), userId, kind, title, body, link ?? null, now());
}

export function reindexJob(id: string) {
  db.prepare('DELETE FROM jobs_fts WHERE job_id = ?').run(id);
  const j = getJob(id);
  if (j?.status === 'published') db.prepare('INSERT INTO jobs_fts (job_id, title, company, skills, location, body) VALUES (?,?,?,?,?,?)').run(j.id, j.title, j.company_name, jobSkills(id).join(' '), j.location, j.description);
}

export interface ProfileRow { user_id: string; headline: string | null; summary: string | null; location: string | null; phone: string | null; years_experience: number; desired_min_salary: number | null; remote_ok: number; open_to_work: number }

export const getProfile = (userId: string) => db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId) as ProfileRow;
export const profileSkills = (userId: string) => db.prepare('SELECT skill FROM profile_skills WHERE user_id = ? ORDER BY skill').pluck().all(userId) as string[];

export function matchProfile(userId: string): MatchProfile {
  const p = getProfile(userId);
  return { skills: profileSkills(userId), yearsExperience: p.years_experience, location: p.location, remoteOk: !!p.remote_ok, desiredMinSalary: p.desired_min_salary };
}

export function fullProfile(userId: string) {
  const p = getProfile(userId);
  const skills = profileSkills(userId);
  const experience = db.prepare('SELECT id, title, company, start_date AS startDate, end_date AS endDate, summary FROM experiences WHERE user_id = ? ORDER BY start_date DESC').all(userId);
  const education = db.prepare('SELECT id, school, degree, year FROM education WHERE user_id = ? ORDER BY year DESC').all(userId);
  return {
    headline: p.headline, summary: p.summary, location: p.location, phone: p.phone, yearsExperience: p.years_experience, desiredMinSalary: p.desired_min_salary, remoteOk: !!p.remote_ok, openToWork: !!p.open_to_work,
    skills, experience, education,
    completeness: profileCompleteness({ headline: p.headline, summary: p.summary, location: p.location, skills: skills.length, experience: experience.length, education: education.length }),
  };
}

export function presentJobCard(j: JobRow, extra: { saved?: boolean; match?: MatchResult | null; applied?: boolean } = {}) {
  return {
    id: j.id, title: j.title, category: j.category, type: j.type, level: j.level, workplace: j.workplace, location: j.location, salaryMin: j.salary_min, salaryMax: j.salary_max, currency: j.currency,
    company: { id: j.company_id, name: j.company_name, verified: !!j.company_verified }, skills: jobSkills(j.id), status: j.status, publishedAt: j.published_at, expiresAt: j.expires_at,
    saved: !!extra.saved, applied: !!extra.applied, match: extra.match?.score ?? null,
  };
}

export function presentJobDetail(j: JobRow, extra: { saved?: boolean; match?: MatchResult | null; applied?: boolean }) {
  return { ...presentJobCard(j, extra), description: j.description, responsibilities: JSON.parse(j.responsibilities) as string[], qualifications: JSON.parse(j.qualifications) as string[], benefits: JSON.parse(j.benefits) as string[], views: j.views, matchedSkills: extra.match?.matchedSkills ?? [], missingSkills: extra.match?.missingSkills ?? [] };
}

export interface SearchFilters { q?: string; category?: string; type?: string; level?: string; workplace?: string; location?: string; salaryMin?: number; postedDays?: number; companyId?: string; publishedAfter?: string }

/** Builds the WHERE clause for live jobs. Unsafe text never reaches the SQL string. */
export function searchClause(f: SearchFilters) {
  const where = [LIVE];
  const params: Record<string, unknown> = { now: now() };
  const fts = f.q ? toFtsQuery(f.q) : null;
  let from = `FROM jobs j JOIN companies c ON c.id = j.company_id`;
  if (f.q && !fts) where.push('0 = 1');
  if (fts) { from += ' JOIN jobs_fts ON jobs_fts.job_id = j.id'; where.push('jobs_fts MATCH @fts'); params.fts = fts; }
  for (const key of ['category', 'type', 'level', 'workplace'] as const) if (f[key]) { where.push(`j.${key} = @${key}`); params[key] = f[key]; }
  if (f.location) { where.push("j.location LIKE @location ESCAPE '\\'"); params.location = `%${f.location.replace(/[\\%_]/g, '\\$&')}%`; }
  if (f.salaryMin) { where.push('j.salary_max >= @salaryMin'); params.salaryMin = f.salaryMin; }
  if (f.postedDays) { where.push('j.published_at >= @postedAfter'); params.postedAfter = new Date(Date.now() - f.postedDays * 86_400_000).toISOString(); }
  if (f.companyId) { where.push('j.company_id = @companyId'); params.companyId = f.companyId; }
  if (f.publishedAfter) { where.push('j.published_at > @publishedAfter'); params.publishedAfter = f.publishedAfter; }
  return { from, clause: where.join(' AND '), params, hasFts: !!fts };
}

export const JOB_COLS = 'j.*, c.name AS company_name, c.verified AS company_verified, c.location AS company_location';

export { matchScore };
