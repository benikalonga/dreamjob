'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, label } from '@/lib/api';
import { Notice } from '@/lib/ui';

const BLANK = { title: '', category: 'Engineering', type: 'full_time', level: 'mid', workplace: 'remote', location: '', salaryMin: '', salaryMax: '', currency: 'USD', description: '', responsibilities: '', qualifications: '', benefits: '', skills: '' };
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

export function JobForm({ job, categories }: { job?: any; categories: string[] }) {
  const router = useRouter();
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (job) setForm({ title: job.title, category: job.category, type: job.type, level: job.level, workplace: job.workplace, location: job.location, salaryMin: job.salaryMin?.toString() ?? '', salaryMax: job.salaryMax?.toString() ?? '', currency: job.currency, description: job.description, responsibilities: job.responsibilities.join('\n'), qualifications: job.qualifications.join('\n'), benefits: job.benefits.join('\n'), skills: job.skills.join(', ') });
  }, [job]);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const select = (k: keyof typeof form, text: string, options: string[]) => <label>{text}<select value={form[k]} onChange={set(k)}>{options.map((o) => <option key={o} value={o}>{label(o)}</option>)}</select></label>;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = { ...form, salaryMin: form.salaryMin ? Number(form.salaryMin) : null, salaryMax: form.salaryMax ? Number(form.salaryMax) : null, responsibilities: lines(form.responsibilities), qualifications: lines(form.qualifications), benefits: lines(form.benefits), skills: form.skills.split(',').map((s) => s.trim()).filter(Boolean) };
      if (job) await api(`/employer/jobs/${job.id}`, 'PUT', body);
      else await api('/employer/jobs', 'POST', body);
      router.push('/jobs');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <form className="card stack" onSubmit={submit}>
      <Notice error={error} />
      <label>Job title<input required minLength={3} value={form.title} onChange={set('title')} /></label>
      <div className="grid g4">{select('category', 'Category', categories)}{select('type', 'Type', ['full_time', 'part_time', 'contract', 'internship'])}{select('level', 'Level', ['entry', 'mid', 'senior', 'lead'])}{select('workplace', 'Workplace', ['onsite', 'hybrid', 'remote'])}</div>
      <div className="grid g4">
        <label>Location<input required value={form.location} onChange={set('location')} placeholder="YOUR_LOCATION" /></label>
        <label>Salary from (per year)<input type="number" min="0" value={form.salaryMin} onChange={set('salaryMin')} /></label>
        <label>Salary to (per year)<input type="number" min="0" value={form.salaryMax} onChange={set('salaryMax')} /></label>
        <label>Currency<input maxLength={3} value={form.currency} onChange={set('currency')} /></label>
      </div>
      <label>Description<textarea required minLength={30} rows={6} value={form.description} onChange={set('description')} /></label>
      <label>Skills, separated by commas<input required value={form.skills} onChange={set('skills')} placeholder="React, TypeScript" /></label>
      <div className="grid g2">
        <label>Responsibilities, one per line<textarea rows={4} value={form.responsibilities} onChange={set('responsibilities')} /></label>
        <label>Qualifications, one per line<textarea rows={4} value={form.qualifications} onChange={set('qualifications')} /></label>
      </div>
      <label>Benefits, one per line<textarea rows={3} value={form.benefits} onChange={set('benefits')} /></label>
      <div className="row end"><button className="btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
    </form>
  );
}
