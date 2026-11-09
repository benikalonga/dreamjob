'use client';
import { useResource, when } from '@/lib/api';
import { Empty, Header, Loading, Notice } from '@/lib/ui';

export default function AuditPage() {
  const { data, error } = useResource<any[]>('/admin/audit');
  return (
    <>
      <Header title="Audit log" sub="Every moderation action, newest first." />
      <Notice error={error} />
      <div className="card flush">{!data ? <Loading /> : data.length === 0 ? <Empty text="No actions yet." /> : <table><thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead><tbody>{data.map((a) => <tr key={a.id}><td className="muted">{when(a.createdAt)}</td><td>{a.adminName}</td><td className="mono">{a.action}</td><td>{a.target}</td><td>{a.detail ?? '—'}</td></tr>)}</tbody></table>}</div>
    </>
  );
}
