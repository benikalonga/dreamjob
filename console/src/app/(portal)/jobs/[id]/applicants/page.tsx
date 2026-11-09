'use client';
import { use } from 'react';
import Link from 'next/link';
import { useResource } from '@/lib/api';
import { Empty, Header, Loading, Notice } from '@/lib/ui';

const COLUMNS = ['applied', 'reviewing', 'shortlisted', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'];

export default function ApplicantsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error } = useResource(`/employer/jobs/${id}/applicants`, 30_000);
  if (!data) return <><Notice error={error} />{!error && <Loading />}</>;
  return (
    <>
      <Header title={data.job.title} sub="Applicants are sorted by match score within each stage." />
      {data.items.length === 0 ? <div className="card"><Empty text="No applicants yet." /></div> : (
        <div className="pipe">
          {COLUMNS.map((stage) => {
            const items = data.items.filter((a: any) => a.status === stage);
            return (
              <section key={stage} aria-label={stage}>
                <h2>{stage}<span className="muted">{items.length}</span></h2>
                {items.map((a: any) => (
                  <Link key={a.id} href={`/applications/${a.id}`} className="ticket">
                    <div className="row between"><b>{a.name}</b><span className="link">{a.matchScore}%</span></div>
                    <span className="muted">{a.headline}</span>
                  </Link>
                ))}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
