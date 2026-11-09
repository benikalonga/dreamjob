'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { api, useResource } from '@/lib/api';
import { Badge, Header, Loading, Notice } from '@/lib/ui';

export default function CompanyPage() {
  const { data, error, reload } = useResource('/employer/company');
  const [form, setForm] = useState<any>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => { if (data) setForm({ name: data.name, industry: data.industry ?? '', size: data.size ?? '', website: data.website ?? '', location: data.location ?? '', about: data.about ?? '' }); }, [data]);
  if (!form) return <><Header title="Company" /><Notice error={error} />{!error && <Loading />}</>;
  const set = (k: string) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const save = (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaveError(null);
    const blankToNull = (s: string) => s.trim() || null;
    api('/employer/company', 'PUT', { name: form.name, industry: blankToNull(form.industry), size: blankToNull(form.size), website: blankToNull(form.website), location: blankToNull(form.location), about: blankToNull(form.about) }).then(() => { setMessage('Saved.'); return reload(); }, (err: Error) => setSaveError(err.message));
  };
  return (
    <>
      <Header title="Company profile" sub="Candidates see this on your job listings."><Badge value={data.verified ? 'verified' : 'unverified'} /></Header>
      <form className="card stack" onSubmit={save}>
        <Notice error={saveError} />
        {message && <p className="success">{message}</p>}
        <label>Name<input required value={form.name} onChange={set('name')} /></label>
        <div className="grid g4">
          <label>Industry<input value={form.industry} onChange={set('industry')} /></label><label>Size<input value={form.size} onChange={set('size')} placeholder="11-50" /></label>
          <label>Website<input type="url" value={form.website} onChange={set('website')} placeholder="https://" /></label><label>Location<input value={form.location} onChange={set('location')} /></label>
        </div>
        <label>About<textarea rows={6} value={form.about} onChange={set('about')} /></label>
        <div className="row end"><button className="btn primary">Save</button></div>
      </form>
    </>
  );
}
