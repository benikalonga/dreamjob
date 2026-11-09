import { db } from '../db';
import { now } from '../lib/ids';
import { getJob, JOB_COLS, notify, reindexJob, searchClause, type JobRow, type SearchFilters } from './core';

export function expireJobs() {
  const due = db.prepare("SELECT id, posted_by, title FROM jobs WHERE status = 'published' AND expires_at <= ?").all(now()) as { id: string; posted_by: string; title: string }[];
  for (const j of due) {
    db.prepare("UPDATE jobs SET status = 'closed', updated_at = ? WHERE id = ?").run(now(), j.id);
    reindexJob(j.id);
    notify(j.posted_by, 'job_expired', 'Job listing expired', `"${j.title}" has closed. Republish it if you are still hiring.`, `/jobs/${j.id}`);
  }
}

export function runJobAlerts() {
  const searches = db.prepare('SELECT * FROM saved_searches WHERE alert = 1').all() as { id: string; user_id: string; name: string; filters: string; last_checked_at: string }[];
  for (const s of searches) {
    const stamp = now();
    const { from, clause, params } = searchClause({ ...(JSON.parse(s.filters) as SearchFilters), publishedAfter: s.last_checked_at });
    const rows = db.prepare(`SELECT ${JOB_COLS} ${from} WHERE ${clause} ORDER BY j.published_at DESC LIMIT 3`).all(params) as JobRow[];
    db.prepare('UPDATE saved_searches SET last_checked_at = ? WHERE id = ?').run(stamp, s.id);
    if (rows.length) notify(s.user_id, 'job_alert', `New jobs for "${s.name}"`, rows.length === 1 ? `${rows[0].title} at ${rows[0].company_name}` : `${rows[0].title} at ${rows[0].company_name} and more`, `/jobs/${rows[0].id}`);
  }
}

export function notifyFollowers(jobId: string) {
  const j = getJob(jobId)!;
  const followers = db.prepare('SELECT user_id FROM follows WHERE company_id = ?').pluck().all(j.company_id) as string[];
  for (const id of followers) notify(id, 'company_job', `${j.company_name} is hiring`, j.title, `/jobs/${j.id}`);
}

export function tick() {
  for (const job of [expireJobs, runJobAlerts]) {
    try { job(); } catch (err) { console.error(`Job ${job.name} failed`, err); }
  }
}
