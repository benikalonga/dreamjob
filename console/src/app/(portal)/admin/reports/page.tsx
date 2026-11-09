'use client';
import { useState } from 'react';
import { api, label, useResource, when } from '@/lib/api';
import { Badge, Empty, Header, Loading, Notice, ReasonAction } from '@/lib/ui';

export default function ReportsPage() {
  const [status, setStatus] = useState('open');
  const { data, error, reload } = useResource<any[]>(`/admin/reports?status=${status}`);
  const decide = (id: string, decision: string, note: string) => api(`/admin/reports/${id}`, 'POST', { decision, note }).then(reload);
  return (
    <>
      <Header title="Job reports"><select aria-label="Status" style={{ width: 140 }} value={status} onChange={(e) => setStatus(e.target.value)}><option>open</option><option>dismissed</option><option>actioned</option></select></Header>
      <Notice error={error} />
      {!data ? <Loading /> : data.length === 0 ? <div className="card"><Empty text={`No ${status} reports.`} /></div> : (
        <div className="grid g2">
          {data.map((r) => (
            <article key={r.id} className="card">
              <div className="row between"><h2 style={{ margin: 0 }}>{r.jobTitle}</h2><Badge value={r.jobStatus} /></div>
              <dl className="kv mt"><dt>Company</dt><dd>{r.company}</dd><dt>Reason</dt><dd>{label(r.reason)}</dd>{r.details && <><dt>Details</dt><dd>{r.details}</dd></>}<dt>Reported by</dt><dd>{r.reporter}</dd><dt>When</dt><dd>{when(r.createdAt)}</dd></dl>
              {r.status === 'open' && <div className="row end mt"><ReasonAction label="Dismiss" prompt="Why is this report being dismissed?" onConfirm={(n) => decide(r.id, 'dismiss', n)} /><ReasonAction danger label="Remove job" prompt="Why is this job being removed? The employer will see this." onConfirm={(n) => decide(r.id, 'remove_job', n)} /></div>}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
