/** Scores how well a candidate fits a job, from 0 to 100. */
export interface MatchProfile {
  skills: string[];
  yearsExperience: number;
  location: string | null;
  remoteOk: boolean;
  desiredMinSalary: number | null;
}

export interface MatchJob {
  skills: string[];
  level: string;
  workplace: string;
  location: string;
  salaryMax: number | null;
}

export interface MatchResult {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
}

const LEVEL_YEARS: Record<string, [number, number]> = { entry: [0, 2], mid: [2, 5], senior: [5, 10], lead: [8, 40] };

export const normalizeSkill = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

function experiencePoints(years: number, level: string) {
  const [low, high] = LEVEL_YEARS[level] ?? [0, 40];
  if (years >= low && years <= high) return 15;
  const gap = years < low ? low - years : years - high;
  return Math.max(0, 15 - gap * 5);
}

function locationPoints(profile: MatchProfile, job: MatchJob) {
  if (job.workplace === 'remote') return profile.remoteOk ? 15 : 8;
  if (!profile.location) return 5;
  const city = (s: string) => s.split(',')[0].trim().toLowerCase();
  return city(profile.location) === city(job.location) ? 15 : 0;
}

function salaryPoints(profile: MatchProfile, job: MatchJob) {
  if (!profile.desiredMinSalary || !job.salaryMax) return 5;
  return job.salaryMax >= profile.desiredMinSalary ? 10 : 0;
}

export function matchScore(profile: MatchProfile, job: MatchJob): MatchResult {
  const have = new Set(profile.skills.map(normalizeSkill));
  const matchedSkills = job.skills.filter((s) => have.has(normalizeSkill(s)));
  const missingSkills = job.skills.filter((s) => !have.has(normalizeSkill(s)));
  const skillPoints = job.skills.length ? (matchedSkills.length / job.skills.length) * 60 : 30;
  const score = Math.round(skillPoints + experiencePoints(profile.yearsExperience, job.level) + locationPoints(profile, job) + salaryPoints(profile, job));
  return { score: Math.min(100, score), matchedSkills, missingSkills };
}

export interface CompletenessInput { headline: string | null; summary: string | null; location: string | null; skills: number; experience: number; education: number }

export function profileCompleteness(p: CompletenessInput) {
  const items: [string, boolean, number][] = [
    ['Add a headline', !!p.headline, 20], ['Write a summary', !!p.summary, 15], ['Add your location', !!p.location, 10],
    ['Add at least 3 skills', p.skills >= 3, 25], ['Add your experience', p.experience > 0, 20], ['Add your education', p.education > 0, 10],
  ];
  return { percent: items.reduce((sum, [, done, weight]) => sum + (done ? weight : 0), 0), missing: items.filter(([, done]) => !done).map(([label]) => label) };
}
