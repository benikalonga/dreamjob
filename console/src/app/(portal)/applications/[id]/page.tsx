'use client';
import { use, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { api, label, useResource, when } from '@/lib/api';
import { Badge, Header, Loading, Notice } from '@/lib/ui';

export default function ApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: a, error, reload } = useResource(`/employer/applications/${id}`);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [iv, setIv] = useState({ when: '', mode: 'video', details: '' });
  if (!a) return <><Notice error={error} />{!error && <Loading />}</>;
  const run = (p: Promise<unknown>) => { setActionError(null); return p.then(reload, (e: Error) => setActionError(e.message)); };
  const move = (status: string) => { if (status !== 'rejected' || confirm('Reject this candidate? They will be told.')) void run(api(`/employer/applications/${id}/status`, 'POST', { status })); };
  const send = (e: FormEvent) => { e.preventDefault(); void run(api(`/employer/applications/${id}/messages`, 'POST', { body: message }).then(() => setMessage(''))); };
  const addNote = (e: FormEvent) => { e.preventDefault(); void run(api(`/employer/applications/${id}/notes`, 'POST', { body: note }).then(() => setNote(''))); };
  const invite = (e: FormEvent) => { e.preventDefault(); void run(api(`/employer/applications/${id}/interviews`, 'POST', { scheduledAt: new Date(iv.when).toISOString(), mode: iv.mode, details: iv.details || undefined }).then(() => setIv({ when: '', mode: 'video', details: '' }))); };
  const p = a.profile;
  const closed = a.nextStages.length === 0;
  return (
    <>
      <Header title={p.name} sub={`${p.headline ?? ''} · applied to ${a.job.title}`}>
        <Badge value={a.status} />
        {a.nextStages.map((s: string) => <button key={s} className={`btn ${s === 'rejected' ? 'danger' : 'primary'}`} onClick={() => move(s)}>{s === 'rejected' ? 'Reject' : `Move to ${s}`}</button>)}
      </Header>
      <Notice error={actionError} />
      <section className="grid g2">
        <div className="stack" style={{ alignContent: 'start' }}>
          <div className="card">
            <h2>Candidate</h2>
            <dl className="kv">
              <dt>Match</dt><dd><b>{a.matchScore}%</b></dd><dt>Email</dt><dd><a className="link" href={`mailto:${p.email}`}>{p.email}</a></dd>{p.phone && <><dt>Phone</dt><dd>{p.phone}</dd></>}
              <dt>Location</dt><dd>{p.location ?? '—'}</dd><dt>Experience</dt><dd>{p.yearsExperience} years</dd>
            </dl>
            <div className="chips">{p.skills.map((s: string) => <span key={s} className="chip" style={a.job.skills.some((x: string) => x.toLowerCase() === s.toLowerCase()) ? { outline: '1px solid var(--brand)' } : undefined}>{s}</span>)}</div>
            {p.summary && <p className="mt">{p.summary}</p>}
          </div>
          {a.coverNote && <div className="card"><h2>Cover note</h2><p style={{ whiteSpace: 'pre-wrap' }}>{a.coverNote}</p></div>}
          <div className="card">
            <h2>Experience</h2>
            {p.experience.length === 0 && <p className="muted">None listed.</p>}
            {p.experience.map((e: any, i: number) => <p key={i} style={{ marginBottom: 8 }}><b>{e.title}</b>, {e.company}<br /><span className="muted">{e.startDate} to {e.endDate ?? 'now'}</span></p>)}
            <h2 className="mt">Education</h2>
            {p.education.length === 0 && <p className="muted">None listed.</p>}
            {p.education.map((e: any, i: number) => <p key={i}>{e.degree}, {e.school}{e.year ? ` (${e.year})` : ''}</p>)}
          </div>
          <div className="card"><h2>Timeline</h2>{a.timeline.map((t: any, i: number) => <div key={i} className="row between"><span>{label(t.status)}</span><span className="muted">{when(t.createdAt)}</span></div>)}</div>
        </div>
        <div className="stack" style={{ alignContent: 'start' }}>
          <div className="card">
            <h2>Messages</h2>
            {a.messages.length === 0 && <p className="muted">No messages yet. Candidates can reply once you write first.</p>}
            {a.messages.map((m: any) => <div key={m.id} className="bubble"><small>{m.senderName} · {when(m.createdAt)}</small>{m.body}</div>)}
            {!closed && <form className="row" onSubmit={send}><input aria-label="Message" style={{ flex: 1, width: 'auto' }} required value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Write to the candidate" /><button className="btn primary">Send</button></form>}
          </div>
          <div className="card">
            <h2>Interviews</h2>
            {a.interviews.map((v: any) => <div key={v.id} className="row between" style={{ marginBottom: 6 }}><span>{when(v.scheduledAt)} · {label(v.mode)}</span><Badge value={v.status} /></div>)}
            {['shortlisted', 'interview'].includes(a.status) ? (
              <form className="stack mt" onSubmit={invite}>
                <div className="grid g2"><label>Date and time<input type="datetime-local" required value={iv.when} onChange={(e) => setIv({ ...iv, when: e.target.value })} /></label><label>Type<select value={iv.mode} onChange={(e) => setIv({ ...iv, mode: e.target.value })}><option value="video">Video</option><option value="phone">Phone</option><option value="onsite">On site</option></select></label></div>
                <label>Details<input value={iv.details} onChange={(e) => setIv({ ...iv, details: e.target.value })} placeholder="Link or address" /></label>
                <div className="row end"><button className="btn primary">Send invitation</button></div>
              </form>
            ) : <p className="muted">Shortlist this candidate to invite them.</p>}
          </div>
          <div className="card">
            <h2>Private notes</h2>
            <p className="muted" style={{ marginBottom: 8 }}>Only your team can see these.</p>
            {a.notes.map((n: any) => <div key={n.id} className="bubble"><small>{n.author} · {when(n.createdAt)}</small>{n.body}</div>)}
            <form className="row" onSubmit={addNote}><input aria-label="Note" style={{ flex: 1, width: 'auto' }} required value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note" /><button className="btn">Add</button></form>
          </div>
          <Link className="link" href={`/jobs/${a.job.id}/applicants`}>Back to all applicants</Link>
        </div>
      </section>
    </>
  );
}
