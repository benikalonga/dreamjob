# DreamJob API reference

Base path: `/v1`. Bodies are JSON. Authenticated routes need `Authorization: Bearer <token>`. Errors look like:

```json
{ "error": { "code": "ALREADY_APPLIED", "message": "You have already applied to this job" } }
```

## Accounts

| Method | Path | Body or notes |
|---|---|---|
| POST | `/auth/register` | `email, password, name, role?, companyName?, device?`. `role` is `candidate` or `employer`. |
| POST | `/auth/login` | `email, password, device?` |
| POST | `/auth/logout` | Ends this session |
| POST | `/auth/password` | `currentPassword, newPassword`. Signs out other devices. |
| GET | `/me` | Current account |
| GET, PUT | `/profile` | Candidate profile, with skills, experience, education and completeness |

## Finding jobs (public)

Signed-in candidates also get `match`, `saved` and `applied` on each job.

| Method | Path | Notes |
|---|---|---|
| GET | `/meta` | Categories, types, levels and totals |
| GET | `/jobs` | `q, category, type, level, workplace, location, salaryMin, postedDays, companyId, sort, page, limit`. `sort` is `newest`, `relevance`, `salary` or `match`. |
| GET | `/jobs/:id` | Details, company and similar jobs |
| GET | `/companies`, `/companies/:id` | Search companies, or one company with its open jobs |
| GET | `/insights/salaries?category=` | Salary ranges by category and level |

## Candidates

| Method | Path | Body or notes |
|---|---|---|
| POST, DELETE | `/jobs/:id/save` | Save or unsave |
| GET | `/saved-jobs` | Saved jobs |
| POST | `/jobs/:id/apply` | `coverNote?` |
| POST | `/jobs/:id/report` | `reason, details?` |
| GET | `/applications`, `/applications/:id` | Tracker, or one application with timeline, interviews and messages |
| POST | `/applications/:id/withdraw` | |
| POST | `/applications/:id/messages` | `body`. Only after the employer has written. |
| POST | `/applications/:id/interviews/:interviewId` | `response: accepted or declined` |
| POST, DELETE | `/companies/:id/follow` | Follow or unfollow |
| GET, POST | `/saved-searches` | `name, filters, alert?` |
| PATCH, DELETE | `/saved-searches/:id` | `alert` |
| GET | `/notifications` | Latest 100 and the unread count |
| POST | `/notifications/read` | Marks all as read |

## Employers

| Method | Path | Body or notes |
|---|---|---|
| GET | `/employer/overview` | Totals, funnel and a 30-day series |
| GET, PUT | `/employer/company` | Company profile |
| GET, POST | `/employer/jobs` | `title, category, type, level, workplace, location, salaryMin, salaryMax, currency, description, responsibilities, qualifications, benefits, skills` |
| GET, PUT, DELETE | `/employer/jobs/:id` | Only drafts can be deleted |
| POST | `/employer/jobs/:id/publish`, `/close` | |
| GET | `/employer/jobs/:id/applicants` | Ranked by match |
| GET | `/employer/applications/:id` | Full candidate view |
| POST | `/employer/applications/:id/status` | `status, note?` |
| POST | `/employer/applications/:id/notes` | `body`. Private to the company. |
| POST | `/employer/applications/:id/messages` | `body` |
| POST | `/employer/applications/:id/interviews` | `scheduledAt, durationMinutes?, mode, details?` |

## Admin

| Method | Path | Body or notes |
|---|---|---|
| GET | `/admin/overview` | Platform totals |
| GET | `/admin/companies?verified=` | |
| PATCH | `/admin/companies/:id` | `verified?, status?, reason` |
| GET | `/admin/reports?status=` | |
| POST | `/admin/reports/:id` | `decision: dismiss or remove_job, note` |
| GET | `/admin/users?q=` | |
| PATCH | `/admin/users/:id` | `status, reason` |
| GET | `/admin/audit` | Moderation history |
