# DreamJob

**A job marketplace that connects people with work they love, and gives employers a simple way to hire.**

Candidates browse jobs, see how well they match each one, apply in the app and follow every step of the process.
Employers post jobs and move applicants through a hiring pipeline from a web portal. Administrators verify companies
and handle reports of bad listings.

| Folder | What it is | Built with |
|---|---|---|
| [`api/`](api) | REST API, search, matching and background jobs | Node.js 22, Express, TypeScript, SQLite with full-text search, Zod |
| [`mobile/`](mobile) | Candidate app for iOS and Android | Expo SDK 58, React Native, Zustand, React Navigation |
| [`console/`](console) | Employer and admin portal | Next.js 15, React 19 |

---

## Features

### For candidates (mobile app)

- **Browse without an account:** search and read every open job before signing up.
- **Full-text search:** across titles, companies, skills and locations, with instant results as you type.
- **Filters and sorting:** category, workplace, job type, level, location, minimum salary and date posted. Sort by newest, relevance, salary or best match.
- **Match score:** a 0 to 100 score for each job, with the skills you have and the ones to build.
- **One-tap applications:** your profile goes with an optional cover note.
- **Application tracker:** a status and timeline for each application, and you can withdraw at any stage.
- **Interviews and messages:** accept or decline invitations, and reply to employers.
- **Saved jobs and job alerts:** keep jobs for later, and turn any search into an alert.
- **Company pages:** read about employers and follow them to hear about new jobs.
- **Salary insights:** what roles pay, by category and level.
- **Profile builder:** skills, experience, education and a completeness guide.
- **Report a job:** flag scams and misleading listings.
- **Works on poor connections:** the last results stay on screen when you are offline.

### For employers (web portal)

- **Job posting:** drafts, publishing, editing, closing and automatic expiry after 45 days.
- **Hiring pipeline:** applied, reviewing, shortlisted, interview, offer, hired, with every applicant ranked by match score.
- **Candidate view:** full profile, cover note, skills compared with the job, and a timeline.
- **Messages, interview invitations and private team notes.**
- **Overview:** views, applicants, a 30-day chart and the hiring funnel.
- **Company profile:** shown on every listing. Light and dark themes.

### For administrators (web portal)

- **Company verification:** unverified companies can have 3 open jobs.
- **Reports queue:** dismiss a report or remove the job.
- **Suspensions:** suspending a company hides its jobs at once, and suspending a user ends their sessions.
- **Audit log:** every moderation action is recorded.

---

## How it works

### The hiring pipeline

```
applied ──► reviewing ──► shortlisted ──► interview ──► offer ──► hired
   └───────────┴──────────────┴──────────────┴───────────┴──► rejected

A candidate can withdraw at any point before a final stage.
```

Every change goes through one state machine ([`pipeline.ts`](api/src/domain/pipeline.ts)), so stages cannot be skipped
and a final decision cannot be reopened.

### Match score

| Part | Points | How it is scored |
|---|---|---|
| Skills | 60 | Share of the job's skills on the candidate's profile |
| Experience | 15 | Years of experience compared with the job's level |
| Location | 15 | Remote preference, or the same city |
| Salary | 10 | Whether the job can reach the candidate's minimum |

### Privacy and safety

| Risk | Protection |
|---|---|
| Harvesting candidate data | Employers only see a candidate's details after that person applies to their job. |
| Crossing company lines | Every employer route checks that the job or application belongs to their company. |
| Private notes leaking | Team notes are never included in anything a candidate can read. |
| Inbox spam | Candidates can only reply after the employer writes first. |
| Applying twice | A database constraint blocks duplicates, even at the same moment. |
| Changed profiles | Employers see the profile as it was when the candidate applied. |
| Fake employers | New companies are capped until verified, and listings can be reported. |
| Password guessing | Lockout, rate limiting, and identical errors for known and unknown emails. |
| Malicious search text | Search input is reduced to plain words before it reaches the search engine. |

---

## Getting started

You need Node.js 22 or newer.

### 1. API

```bash
cd api
cp .env.example .env
npm install
npm run db:seed
npm run dev
```

The API runs at `http://localhost:4200`. The seed creates fictional companies and jobs, and these local-only logins:

| Who | Email | Password |
|---|---|---|
| Candidate (mobile app) | `YOUR_CANDIDATE_EMAIL@fakeemail.com` | `YOUR_CANDIDATE_PASSWORD` |
| Employer (portal) | `YOUR_EMPLOYER_EMAIL@fakeemail.com` | `YOUR_EMPLOYER_PASSWORD` |
| Admin (portal) | `YOUR_ADMIN_EMAIL@fakeemail.com` | `YOUR_ADMIN_PASSWORD` |

The seed refuses to run in production.

### 2. Portal

```bash
cd console
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3200`.

### 3. Mobile app

```bash
cd mobile
npm install
npx expo run:ios
```

Use `npx expo run:android` for Android. The app finds the API on your development machine automatically. To point it
somewhere else, set `EXPO_PUBLIC_API_URL`.

### Tests

```bash
cd api
npm test
```

The 53 tests include simultaneous applications, access between companies, hostile search text and the full pipeline.

---

## Configuration (API)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `4200` | HTTP port |
| `DATABASE_PATH` | `./data/dreamjob.db` | SQLite file location |
| `JWT_SECRET` | none | Signing key. Required in production, 32+ characters. |
| `CORS_ORIGINS` | `http://localhost:3200` | Browser origins allowed to call the API |

## Deploying

```bash
cp .env.example .env
docker compose up -d --build
docker compose exec api node dist/scripts/createAdmin.js YOUR_EMAIL@fakeemail.com 'YOUR_PASSWORD' "YOUR_NAME"
```

Put the API and portal behind HTTPS, and back up the `api-data` volume.

SQLite suits a single API instance. To run several, move to a server database and its own full-text search.

## Roadmap

- CV file uploads
- Push notifications and email delivery
- Several recruiters per company
- Paid featured listings
- Sign in with Google and Apple

See [docs/API.md](docs/API.md) for the API reference.

## License

MIT. See [LICENSE](LICENSE).
