'use client';
import { api, useResource, when } from '@/lib/api';
import { Badge, Header, Loading, Notice, ReasonAction } from '@/lib/ui';

export default function CompaniesPage() {
  const { data, error, reload } = useResource<any[]>('/admin/companies');
  const update = (id: string, body: object) => api(`/admin/companies/${id}`, 'PATCH', body).then(reload);
  return (
    <>
      <Header title="Companies" sub="Unverified companies are limited to 3 open jobs." />
      <Notice error={error} />
      <div className="card flush">
        {!data ? <Loading /> : (
          <table>
            <thead><tr><th>Company</th><th>Website</th><th>Jobs</th><th>Verification</th><th>Status</th><th>Joined</th><th /></tr></thead>
            <tbody>
              {data.map((c) => (
                <tr key={c.id}>
                  <td><b>{c.name}</b><br /><span className="muted">{c.industry ?? '—'}{c.location ? ` · ${c.location}` : ''}</span></td>
                  <td>{c.website ? <a className="link" href={c.website} target="_blank" rel="noreferrer noopener">Open</a> : '—'}</td><td>{c.jobs}</td>
                  <td><Badge value={c.verified ? 'verified' : 'unverified'} /></td><td><Badge value={c.status} /></td><td className="muted">{when(c.createdAt)}</td>
                  <td className="num">
                    <ReasonAction label={c.verified ? 'Remove verification' : 'Verify'} prompt="What did you check?" onConfirm={(reason) => update(c.id, { verified: !c.verified, reason })} />{' '}
                    <ReasonAction danger={c.status === 'active'} label={c.status === 'active' ? 'Suspend' : 'Restore'} prompt="Why?" onConfirm={(reason) => update(c.id, { status: c.status === 'active' ? 'suspended' : 'active', reason })} />
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
