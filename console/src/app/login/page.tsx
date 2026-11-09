'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { api, setToken } from '@/lib/api';
import { Notice } from '@/lib/ui';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ email: '', password: '', name: '', companyName: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ token: string; user: { role: string } }>(mode === 'login' ? '/auth/login' : '/auth/register', 'POST', mode === 'login' ? { email: form.email, password: form.password, device: 'Web portal' } : { ...form, role: 'employer', device: 'Web portal' });
      if (r.user.role === 'candidate') {
        setError('This portal is for employers. Candidates use the DreamJob mobile app.');
        setBusy(false);
        return;
      }
      setToken(r.token);
      router.replace(r.user.role === 'admin' ? '/admin' : '/');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <main className="login">
      <form className="card" onSubmit={submit}>
        <div><h1>DreamJob for Employers</h1><p className="muted">{mode === 'login' ? 'Sign in to manage your hiring.' : 'Create a company account.'}</p></div>
        <Notice error={error} />
        {mode === 'register' && <>
          <label>Your name<input required minLength={2} value={form.name} onChange={set('name')} /></label>
          <label>Company name<input required minLength={2} value={form.companyName} onChange={set('companyName')} /></label>
        </>}
        <label>Work email<input type="email" required autoComplete="username" value={form.email} onChange={set('email')} /></label>
        <label>Password<input type="password" required minLength={mode === 'register' ? 10 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={form.password} onChange={set('password')} /></label>
        <button className="btn primary" style={{ justifyContent: 'center' }} disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="btn" style={{ justifyContent: 'center' }} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>{mode === 'login' ? 'New here? Create a company account' : 'Already have an account? Sign in'}</button>
      </form>
    </main>
  );
}
