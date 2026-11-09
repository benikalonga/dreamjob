'use client';
import Link from 'next/link';
import { label, useResource } from '@/lib/api';
import { Header, Loading, Notice } from '@/lib/ui';

export default function OverviewPage() {
  const { data, error } = useResource('/employer/overview', 30_000);
  const { data: me } = useResource('/me');
  if (!data) return <><Header title="Overview" /><Notice error={error} />{!error && <Loading />}</>;
  const max = Math.max(1, ...data.series.map((d: any) => d.count));
  const funnelMax = Math.max(1, ...data.funnel.map((f: any) => f.count));
  return (
    <>
      <Header title={me?.company?.name ?? 'Overview'} sub={me?.company && !me.company.verified ? 'Your company is not verified yet, so you can keep up to 3 jobs open.' : undefined}>
        <Link className="btn primary" href="/jobs/new">Post a job</Link>
      </Header>
      <section className="grid g4">
        <div className="card stat"><small>Open jobs</small><b>{data.openJobs}</b><br /><span>{data.drafts} drafts</span></div>
        <div className="card stat"><small>Job views</small><b>{data.views.toLocaleString()}</b></div>
        <div className="card stat"><small>Applicants</small><b>{data.applicants}</b><br /><span>{data.toReview} to review</span></div>
        <div className="card stat"><small>Upcoming interviews</small><b>{data.upcomingInterviews}</b></div>
      </section>
      <section className="grid g21 mt">
        <div className="card">
          <h2>Applications, last 30 days</h2>
          <div className="chart" role="img" aria-label="Daily applications over the last 30 days">{data.series.map((d: any) => <div key={d.day} style={{ height: `${(d.count / max) * 100}%` }} title={`${d.day}: ${d.count}`} />)}</div>
        </div>
        <div className="card">
          <h2>Hiring funnel</h2>
          {data.funnel.filter((f: any) => f.status !== 'withdrawn').map((f: any) => (
            <div key={f.status} style={{ marginBottom: 8 }}>
              <div className="row between"><span>{label(f.status)}</span><span className="num">{f.count}</span></div>
              <div style={{ height: 6, background: 'var(--soft)', borderRadius: 3 }}><div style={{ height: 6, borderRadius: 3, background: 'var(--brand)', width: `${(f.count / funnelMax) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
