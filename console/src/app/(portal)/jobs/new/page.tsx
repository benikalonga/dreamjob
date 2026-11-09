'use client';
import { useResource } from '@/lib/api';
import { Header, Loading } from '@/lib/ui';
import { JobForm } from '../../JobForm';

export default function NewJobPage() {
  const { data: meta } = useResource('/meta');
  return <><Header title="Post a job" sub="Jobs start as drafts. Publish from the Jobs page when you are ready." />{meta ? <JobForm categories={meta.categories} /> : <Loading />}</>;
}
