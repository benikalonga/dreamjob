import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from './config';

if (config.dbPath !== ':memory:') fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new Database(config.dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, industry TEXT, size TEXT, website TEXT, location TEXT, about TEXT,
  verified INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('candidate','employer','admin')), company_id TEXT REFERENCES companies(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')), failed_logins INTEGER NOT NULL DEFAULT 0, locked_until TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), device TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id), headline TEXT, summary TEXT, location TEXT, phone TEXT, years_experience INTEGER NOT NULL DEFAULT 0,
  desired_min_salary INTEGER, remote_ok INTEGER NOT NULL DEFAULT 1, open_to_work INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profile_skills (user_id TEXT NOT NULL REFERENCES users(id), skill TEXT NOT NULL, PRIMARY KEY (user_id, skill));
CREATE TABLE IF NOT EXISTS experiences (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, company TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT, summary TEXT);
CREATE TABLE IF NOT EXISTS education (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), school TEXT NOT NULL, degree TEXT NOT NULL, year INTEGER);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(id), posted_by TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL, category TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('full_time','part_time','contract','internship')), level TEXT NOT NULL CHECK (level IN ('entry','mid','senior','lead')),
  workplace TEXT NOT NULL CHECK (workplace IN ('onsite','hybrid','remote')), location TEXT NOT NULL, salary_min INTEGER, salary_max INTEGER, currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT NOT NULL, responsibilities TEXT NOT NULL DEFAULT '[]', qualifications TEXT NOT NULL DEFAULT '[]', benefits TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('draft','published','closed','removed')), views INTEGER NOT NULL DEFAULT 0, published_at TEXT, expires_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  CHECK (salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max)
);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, published_at);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company_id);
CREATE TABLE IF NOT EXISTS job_skills (job_id TEXT NOT NULL REFERENCES jobs(id), skill TEXT NOT NULL, PRIMARY KEY (job_id, skill));
CREATE VIRTUAL TABLE IF NOT EXISTS jobs_fts USING fts5(job_id UNINDEXED, title, company, skills, location, body, tokenize = 'unicode61');
CREATE TABLE IF NOT EXISTS saved_jobs (user_id TEXT NOT NULL REFERENCES users(id), job_id TEXT NOT NULL REFERENCES jobs(id), created_at TEXT NOT NULL, PRIMARY KEY (user_id, job_id));
CREATE TABLE IF NOT EXISTS follows (user_id TEXT NOT NULL REFERENCES users(id), company_id TEXT NOT NULL REFERENCES companies(id), PRIMARY KEY (user_id, company_id));
CREATE TABLE IF NOT EXISTS job_reports (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), reporter_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, details TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','dismissed','actioned')), created_at TEXT NOT NULL, UNIQUE (job_id, reporter_id)
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), candidate_id TEXT NOT NULL REFERENCES users(id), status TEXT NOT NULL, cover_note TEXT,
  snapshot TEXT NOT NULL, match_score INTEGER NOT NULL, applied_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (job_id, candidate_id)
);
CREATE INDEX IF NOT EXISTS idx_apps_candidate ON applications(candidate_id, updated_at);
CREATE TABLE IF NOT EXISTS application_events (id INTEGER PRIMARY KEY AUTOINCREMENT, application_id TEXT NOT NULL REFERENCES applications(id), status TEXT NOT NULL, note TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS application_notes (id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id), author_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS interviews (
  id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id), scheduled_at TEXT NOT NULL, duration_minutes INTEGER NOT NULL, mode TEXT NOT NULL CHECK (mode IN ('video','phone','onsite')),
  details TEXT, status TEXT NOT NULL CHECK (status IN ('proposed','accepted','declined','cancelled')), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, application_id TEXT NOT NULL REFERENCES applications(id), sender_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_messages_app ON messages(application_id, created_at);

CREATE TABLE IF NOT EXISTS saved_searches (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), name TEXT NOT NULL, filters TEXT NOT NULL, alert INTEGER NOT NULL DEFAULT 1, last_checked_at TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), kind TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, link TEXT, read_at TEXT, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, admin_id TEXT NOT NULL, admin_name TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL);
`);

export const tx = <T>(fn: () => T): T => db.transaction(fn).immediate();
