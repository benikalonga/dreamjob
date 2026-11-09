'use client';
import { useState } from 'react';
import { api, useResource, when } from '@/lib/api';
import { Badge, Header, Loading, Notice, ReasonAction } from '@/lib/ui';

export default function UsersPage() {
  const [q, setQ] = useState('');
  const { data, error, reload } = useResource<any[]>(`/admin/users?${new URLSearchParams(q ? { q } : {})}`);
  const { data: me } = useResource('/me');
  const update = (id: string, status: string, reason: string) => api(`/admin/users/${id}`, 'PATCH', { status, reason }).then(reload);
  return (
    <>
      <Header title="Users" />
      <Notice error={error} />
      <div className="filters"><input aria-label="Search users" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="card flush">
        {!data ? <Loading /> : (
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th /></tr></thead>
            <tbody>{data.map((u) => <tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td style={{ textTransform: 'capitalize' }}>{u.role}</td><td><Badge value={u.status} /></td><td className="muted">{when(u.createdAt)}</td><td className="num">{u.id !== me?.id && <ReasonAction danger={u.status === 'active'} label={u.status === 'active' ? 'Suspend' : 'Restore'} prompt="Why?" onConfirm={(r) => update(u.id, u.status === 'active' ? 'suspended' : 'active', r)} />}</td></tr>)}</tbody>
          </table>
        )}
      </div>
    </>
  );
}
