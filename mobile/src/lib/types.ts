export interface User { id: string; email: string; name: string; role: string }
export interface JobCard {
  id: string; title: string; category: string; type: string; level: string; workplace: string; location: string; salaryMin: number | null; salaryMax: number | null; currency: string;
  company: { id: string; name: string; verified: boolean }; skills: string[]; status: string; publishedAt: string | null; saved: boolean; applied: boolean; match: number | null;
}
export interface JobDetail extends JobCard {
  description: string; responsibilities: string[]; qualifications: string[]; benefits: string[]; matchedSkills: string[]; missingSkills: string[];
  companyInfo: { id: string; name: string; industry: string | null; size: string | null; website: string | null; location: string | null; about: string | null; verified: boolean }; similar: JobCard[];
}
export interface Experience { title: string; company: string; startDate: string; endDate: string | null; summary?: string | null }
export interface Education { school: string; degree: string; year: number | null }
export interface Profile {
  headline: string | null; summary: string | null; location: string | null; phone: string | null; yearsExperience: number; desiredMinSalary: number | null; remoteOk: boolean; openToWork: boolean;
  skills: string[]; experience: Experience[]; education: Education[]; completeness: { percent: number; missing: string[] };
}
export interface ApplicationCard { id: string; status: string; appliedAt: string; updatedAt: string; matchScore: number; unread: number; job: { id: string; title: string; company: string; location: string } }
export interface Meta { categories: string[]; types: string[]; levels: string[]; workplaces: string[]; stats: { jobs: number; companies: number } }
