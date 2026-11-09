import { randomUUID } from 'node:crypto';
import { config } from './config';
import { db } from './db';
import { hashPassword } from './lib/auth';
import { now } from './lib/ids';
import { reindexJob } from './services/core';

/** Demo data for local development. Everyone and everything here is fictional. */
const CANDIDATE_PASSWORD = 'YOUR_CANDIDATE_PASSWORD';
const EMPLOYER_PASSWORD = 'YOUR_EMPLOYER_PASSWORD';
const ADMIN_PASSWORD = 'YOUR_ADMIN_PASSWORD';

const COMPANIES = [
  { name: 'YOUR_COMPANY_NAME', industry: 'Fintech', size: '201-500', location: 'YOUR_LOCATION', about: 'Payments infrastructure for growing businesses across the continent.' },
  { name: 'YOUR_COMPANY_NAME_2', industry: 'Healthcare', size: '51-200', location: 'YOUR_LOCATION_2', about: 'Connecting rural clinics to specialists through simple digital tools.' },
  { name: 'YOUR_COMPANY_NAME_3', industry: 'Education', size: '11-50', location: 'YOUR_LOCATION_3', about: 'Affordable, mobile-first courses for working adults.' },
  { name: 'YOUR_COMPANY_NAME_4', industry: 'Logistics', size: '501-1000', location: 'YOUR_LOCATION_4', about: 'Moving goods reliably across West Africa.' },
];

const ROLES: [string, string, string, string, string[], number, number][] = [
  ['Mobile Developer', 'Engineering', 'mid', 'hybrid', ['React Native', 'TypeScript', 'REST APIs'], 45000, 75000],
  ['Senior Backend Engineer', 'Engineering', 'senior', 'remote', ['Node.js', 'TypeScript', 'PostgreSQL', 'AWS'], 70000, 110000],
  ['Frontend Engineer', 'Engineering', 'mid', 'remote', ['React', 'TypeScript', 'CSS'], 45000, 80000],
  ['Junior QA Analyst', 'Engineering', 'entry', 'onsite', ['Testing', 'SQL'], 18000, 30000],
  ['Product Designer', 'Design', 'mid', 'remote', ['Figma', 'User Research', 'Prototyping'], 40000, 70000],
  ['Product Manager', 'Product', 'senior', 'hybrid', ['Roadmapping', 'Analytics', 'Communication'], 65000, 100000],
  ['Growth Marketer', 'Marketing', 'mid', 'remote', ['SEO', 'Analytics', 'Copywriting'], 30000, 55000],
  ['Account Executive', 'Sales', 'mid', 'onsite', ['Negotiation', 'CRM', 'Communication'], 28000, 60000],
  ['Financial Analyst', 'Finance', 'mid', 'hybrid', ['Excel', 'Financial Modeling', 'SQL'], 35000, 60000],
  ['Operations Lead', 'Operations', 'lead', 'onsite', ['Leadership', 'Process Design', 'Excel'], 50000, 85000],
  ['Customer Support Specialist', 'Customer Support', 'entry', 'remote', ['Communication', 'Zendesk'], 15000, 26000],
  ['Clinical Program Coordinator', 'Healthcare', 'mid', 'onsite', ['Program Management', 'Communication'], 25000, 42000],
];

async function main() {
  if (config.isProduction) throw new Error('The demo seed cannot run in production');
  if (db.prepare('SELECT 1 FROM users LIMIT 1').get()) {
    console.log('The database already has data. Delete it to reseed.');
    return;
  }
  const stamp = now();
  const addUser = async (email: string, password: string, name: string, role: string, companyId: string | null) => {
    const id = randomUUID();
    db.prepare('INSERT INTO users (id, email, password_hash, name, role, company_id, created_at) VALUES (?,?,?,?,?,?,?)').run(id, email.toLowerCase(), await hashPassword(password), name, role, companyId, stamp);
    db.prepare('INSERT INTO profiles (user_id, updated_at) VALUES (?,?)').run(id, stamp);
    return id;
  };
  await addUser('YOUR_ADMIN_EMAIL@fakeemail.com', ADMIN_PASSWORD, 'YOUR_ADMIN_NAME', 'admin', null);
  const companies: (typeof COMPANIES[number] & { id: string; owner: string })[] = [];
  for (const [i, c] of COMPANIES.entries()) {
    const id = randomUUID();
    db.prepare('INSERT INTO companies (id, name, industry, size, website, location, about, verified, created_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id, c.name, c.industry, c.size, `https://example.com/${i}`, c.location, c.about, i < 3 ? 1 : 0, stamp);
    companies.push({ id, ...c, owner: await addUser(i === 0 ? 'YOUR_EMPLOYER_EMAIL@fakeemail.com' : `YOUR_EMPLOYER_EMAIL_${i}@fakeemail.com`, EMPLOYER_PASSWORD, i === 0 ? 'YOUR_EMPLOYER_NAME' : `YOUR_EMPLOYER_NAME_${i}`, 'employer', id) });
  }
  const jobIds: string[] = [];
  ROLES.forEach(([title, category, level, workplace, skills, min, max], i) => {
    const c = companies[i % companies.length];
    const id = randomUUID();
    const published = new Date(Date.now() - i * 2 * 86_400_000).toISOString();
    const expires = new Date(Date.now() + 40 * 86_400_000).toISOString();
    db.prepare(`INSERT INTO jobs (id, company_id, posted_by, title, category, type, level, workplace, location, salary_min, salary_max, currency, description, responsibilities, qualifications, benefits, status, views, published_at, expires_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'USD',?,?,?,?,'published',?,?,?,?,?)`)
      .run(id, c.id, c.owner, title, category, i === 10 ? 'part_time' : 'full_time', level, workplace, workplace === 'remote' ? 'Remote' : c.location, min, max,
        `${c.name} is looking for a ${title} to join a small, ambitious team. You will work closely with colleagues across the business and own meaningful outcomes from your first month.`,
        JSON.stringify(['Plan and deliver work with your team', 'Measure the results and keep improving', 'Share what you learn with others']), JSON.stringify([`Experience with ${skills[0]}`, 'Clear written communication', 'Comfort working independently']),
        JSON.stringify(['Flexible hours', 'Learning budget', 'Health cover']), 20 + i * 7, published, expires, published, published);
    skills.forEach((s) => db.prepare('INSERT INTO job_skills (job_id, skill) VALUES (?,?)').run(id, s));
    reindexJob(id);
    jobIds.push(id);
  });
  const cand = await addUser('YOUR_CANDIDATE_EMAIL@fakeemail.com', CANDIDATE_PASSWORD, 'YOUR_NAME', 'candidate', null);
  db.prepare('UPDATE profiles SET headline = ?, summary = ?, location = ?, phone = ?, years_experience = 4, desired_min_salary = 45000, updated_at = ? WHERE user_id = ?')
    .run('Frontend developer who cares about the details', 'YOUR_SUMMARY', 'YOUR_LOCATION', 'YOUR_PHONE_NUMBER', stamp, cand);
  ['React', 'TypeScript', 'React Native', 'CSS', 'REST APIs'].forEach((s) => db.prepare('INSERT INTO profile_skills (user_id, skill) VALUES (?,?)').run(cand, s));
  db.prepare('INSERT INTO experiences (id, user_id, title, company, start_date, end_date, summary) VALUES (?,?,?,?,?,?,?)').run(randomUUID(), cand, 'Frontend Developer', 'YOUR_EMPLOYER', '2022-03', null, 'YOUR_JOB_SUMMARY');
  db.prepare('INSERT INTO education (id, user_id, school, degree, year) VALUES (?,?,?,?,?)').run(randomUUID(), cand, 'YOUR_SCHOOL', 'YOUR_DEGREE', 2020);
  const snapshot = JSON.stringify({ name: 'YOUR_NAME', email: 'your_candidate_email@fakeemail.com', phone: 'YOUR_PHONE_NUMBER', summary: 'YOUR_SUMMARY', headline: 'Frontend developer who cares about the details', location: 'YOUR_LOCATION', yearsExperience: 4, skills: ['React', 'TypeScript', 'React Native', 'CSS', 'REST APIs'], experience: [{ title: 'Frontend Developer', company: 'YOUR_EMPLOYER', startDate: '2022-03', endDate: null }], education: [{ school: 'YOUR_SCHOOL', degree: 'YOUR_DEGREE', year: 2020 }] });
  const app = randomUUID();
  db.prepare("INSERT INTO applications (id, job_id, candidate_id, status, cover_note, snapshot, match_score, applied_at, updated_at) VALUES (?,?,?,'reviewing',?,?,?,?,?)").run(app, jobIds[0], cand, 'I would love to help build your mobile product.', snapshot, 82, stamp, stamp);
  db.prepare("INSERT INTO application_events (application_id, status, created_at) VALUES (?, 'applied', ?), (?, 'reviewing', ?)").run(app, stamp, app, stamp);
  console.log('Seeded demo data. Candidate: YOUR_CANDIDATE_EMAIL@fakeemail.com / ' + CANDIDATE_PASSWORD);
  console.log('Employer: YOUR_EMPLOYER_EMAIL@fakeemail.com / ' + EMPLOYER_PASSWORD + '   Admin: YOUR_ADMIN_EMAIL@fakeemail.com / ' + ADMIN_PASSWORD);
}
void main();
