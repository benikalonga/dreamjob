'use client';
import { useResource } from '@/lib/api';
import { Header, Loading, Notice } from '@/lib/ui';

const STATS: [string, string][] = [['candidates', 'Candidates'], ['employers', 'Employers'], ['companies', 'Companies'], ['unverified', 'Awaiting verification'], ['liveJobs', 'Live jobs'], ['applications', 'Applications'], ['hires', 'Hires'], ['openReports', 'Open reports']];

export default function AdminOverview() {
  const { data, error } = useResource('/admin/overview', 30_000);
  return <><Header title="Platform overview" /><Notice error={error} />{!data ? !error && <Loading /> : <section className="grid g4">{STATS.map(([k, t]) => <div key={k} className="card stat"><small>{t}</small><b>{data[k].toLocaleString()}</b></div>)}</section>}</>;
}
