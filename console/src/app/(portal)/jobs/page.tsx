'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, label, salary, useResource, when } from '@/lib/api';
import { Badge, Empty, Header, Loading, Notice } from '@/lib/ui';

export default function JobsPage() {
  const { data, error, reload } = useResource<any[]>('/employer/jobs');
  const [actionError, setActionError] = useState<string | null>(null);
  const act = (path: string, method = 'POST') => { setActionError(null); api(path, method, method === 'POST' ? {} : undefined).then(reload, (e: Error) => setActionError(e.message)); };
  return (
    <>
      <Header title="Jobs"><Link className="btn primary" href="/jobs/new">Post a job</Link></Header>
      <Notice error={error ?? actionError} />
      <div className="card flush">
        {!data ? <Loading /> : data.length === 0 ? <Empty text="You have not posted any jobs yet." /> : (
          <table>
            <thead><tr><th>Job</th><th>Status</th><th>Salary</th><th>Views</th><th>Applicants</th><th>Closes</th><th /></tr></thead>
            <tbody>
              {data.map((j) => (
                <tr key={j.id}>
                  <td><Link className="link" href={`/jobs/${j.id}`}>{j.title}</Link><br /><span className="muted">{label(j.level)} · {label(j.workplace)} · {j.location}</span></td>
                  <td><Badge value={j.status} /></td><td>{salary(j.salaryMin, j.salaryMax, j.currency)}</td><td>{j.views}</td>
                  <td><Link className="link" href={`/jobs/${j.id}/applicants`}>{j.applicants}{j.newApplicants ? ` (${j.newApplicants} new)` : ''}</Link></td>
                  <td className="muted">{when(j.expiresAt)}</td>
                  <td className="num">
                    {(j.status === 'draft' || j.status === 'closed') && <button className="btn" onClick={() => act(`/employer/jobs/${j.id}/publish`)}>Publish</button>}{' '}
                    {j.status === 'published' && <button className="btn" onClick={() => act(`/employer/jobs/${j.id}/close`)}>Close</button>}{' '}
                    {j.status === 'draft' && <button className="btn danger" onClick={() => { if (confirm(`Delete the draft "${j.title}"?`)) act(`/employer/jobs/${j.id}`, 'DELETE'); }}>Delete</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
