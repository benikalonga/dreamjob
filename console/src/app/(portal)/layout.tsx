'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Briefcase, Building2, Flag, LayoutDashboard, LogOut, Moon, ScrollText, Users } from 'lucide-react';
import { api, getToken, setToken, useResource } from '@/lib/api';

export default function PortalLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!getToken()) router.replace('/login');
    else setReady(true);
  }, [router]);
  if (!ready) return null;
  return <Shell>{children}</Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const path = usePathname();
  const { data: me } = useResource('/me');
  const isAdmin = me?.role === 'admin';
  useEffect(() => {
    if (!me) return;
    if (isAdmin && !path.startsWith('/admin')) router.replace('/admin');
    if (!isAdmin && path.startsWith('/admin')) router.replace('/');
  }, [me, isAdmin, path, router]);
  const nav = isAdmin
    ? [{ href: '/admin', label: 'Overview', Icon: LayoutDashboard }, { href: '/admin/companies', label: 'Companies', Icon: Building2 }, { href: '/admin/reports', label: 'Reports', Icon: Flag }, { href: '/admin/users', label: 'Users', Icon: Users }, { href: '/admin/audit', label: 'Audit log', Icon: ScrollText }]
    : [{ href: '/', label: 'Overview', Icon: LayoutDashboard }, { href: '/jobs', label: 'Jobs', Icon: Briefcase }, { href: '/company', label: 'Company', Icon: Building2 }];
  const toggleTheme = () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('dreamjob.theme', root.dataset.theme); } catch { /* the theme just will not be remembered */ }
  };
  const signOut = async () => {
    await api('/auth/logout', 'POST', {}).catch(() => {});
    setToken(null);
    router.replace('/login');
  };
  const active = (href: string) => (href === '/' || href === '/admin' ? path === href : path.startsWith(href));
  return (
    <div className="shell">
      <aside className="side">
        <div className="logo"><i>D</i> DreamJob</div>
        {me && nav.map(({ href, label, Icon }) => <Link key={href} href={href} className={`nav ${active(href) ? 'on' : ''}`}><Icon size={17} /> {label}</Link>)}
        <div className="side-foot">
          {me && <div style={{ padding: '4px 10px 8px' }}>{me.name}<br /><span style={{ opacity: .65 }}>{me.company?.name ?? 'Administrator'}</span></div>}
          <button onClick={toggleTheme}><Moon size={16} /> Switch theme</button>
          <button onClick={() => void signOut()}><LogOut size={16} /> Sign out</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
