'use client';
import { use } from 'react';
import Link from 'next/link';
import { useResource } from '@/lib/api';
import { Badge, Header, Loading, Notice } from '@/lib/ui';
import { JobForm } from '../../JobForm';

export default function EditJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: job, error } = useResource(`/employer/jobs/${id}`);
  const { data: meta } = useResource('/meta');
  if (!job || !meta) return <><Notice error={error} />{!error && <Loading />}</>;
  return <><Header title={job.title}><Badge value={job.status} /><Link className="btn" href={`/jobs/${id}/applicants`}>View applicants</Link></Header><JobForm job={job} categories={meta.categories} /></>;
}
