'use client';
import { useCallback, useEffect, useState } from 'react';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4200/v1';
const KEY = 'dreamjob.portal.token';

export const getToken = () => (typeof window === 'undefined' ? null : sessionStorage.getItem(KEY));
export const setToken = (token: string | null) => { if (token) sessionStorage.setItem(KEY, token); else sessionStorage.removeItem(KEY); };

export class ApiFailure extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = any>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiFailure(0, 'Cannot reach the API');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.includes('/auth/')) {
      setToken(null);
      window.location.href = '/login';
    }
    throw new ApiFailure(res.status, data?.error?.message ?? 'Request failed');
  }
  return data as T;
}

export function useResource<T = any>(path: string, intervalMs?: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => api<T>(path).then((d) => { setData(d); setError(null); }, (e: Error) => setError(e.message)), [path]);
  useEffect(() => {
    void reload();
    if (!intervalMs) return;
    const timer = setInterval(() => void reload(), intervalMs);
    return () => clearInterval(timer);
  }, [reload, intervalMs]);
  return { data, error, reload };
}

export const salary = (min: number | null, max: number | null, currency: string) => (min === null && max === null ? 'Not listed' : `${currency} ${(min ?? max)!.toLocaleString('en-US')}${max !== null && min !== null ? ` – ${max.toLocaleString('en-US')}` : ''}`);
export const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
export const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
