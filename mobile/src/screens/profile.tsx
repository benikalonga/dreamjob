import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button, Card, Chips, Empty, ErrorText, Field, Muted, Row, Screen, SectionTitle, Spinner, Tag } from '../components/ui';
import { api } from '../lib/api';
import { ago, label } from '../lib/format';
import type { Education, Experience, Profile } from '../lib/types';
import { useApp } from '../store/app';
import { colors } from '../theme';

const chevron = <Ionicons name="chevron-forward" size={18} color={colors.faint} />;

export function ProfileScreen({ navigation }: any) {
  const { signedIn, user, profile, signOut, refresh } = useApp();
  const go = (s: string) => () => navigation.navigate(s);
  if (!signedIn) return <Screen><Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink }}>Your career, in one place</Text><Muted>Create a profile to apply in one tap and see how well you match each job.</Muted><Button title="Create an account" onPress={go('Register')} /><Button title="Sign in" kind="secondary" onPress={go('Login')} /><Row icon="cash-outline" title="Salary insights" onPress={go('Salaries')} right={chevron} /></Screen>;
  return (
    <Screen onRefresh={refresh}>
      <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink }}>{user?.name}</Text>
      {profile?.headline ? <Muted style={{ fontSize: 15 }}>{profile.headline}</Muted> : null}
      <Card>
        <Text style={{ fontWeight: '700', color: colors.ink }}>Profile {profile?.completeness.percent ?? 0}% complete</Text>
        <View style={{ height: 8, backgroundColor: colors.brandSoft, borderRadius: 4, overflow: 'hidden' }}><View style={{ height: 8, width: `${profile?.completeness.percent ?? 0}%`, backgroundColor: colors.brand }} /></View>
        {profile?.completeness.missing.slice(0, 2).map((m) => <Muted key={m}>{m}</Muted>)}
        <Button title="Edit profile" kind="secondary" onPress={go('EditProfile')} />
      </Card>
      {profile?.skills.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{profile.skills.map((s) => <Tag key={s} text={s} tone="brand" />)}</View> : null}
      <Card style={{ gap: 0 }}>
        <Row icon="notifications-outline" title="Job alerts" sub="Your saved searches" onPress={go('Alerts')} right={chevron} />
        <Row icon="cash-outline" title="Salary insights" sub="What roles pay" onPress={go('Salaries')} right={chevron} />
        <Row icon="key-outline" title="Change password" onPress={go('ChangePassword')} right={chevron} />
      </Card>
      <Button title="Sign out" kind="danger" onPress={() => Alert.alert('Sign out?', undefined, [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => void signOut() }])} />
    </Screen>
  );
}

const yearMonth = /^\d{4}-\d{2}$/;

export function EditProfileScreen({ navigation }: any) {
  const { profile, user, setProfile, showToast, refresh } = useApp();
  const [f, setF] = useState({ name: user?.name ?? '', headline: profile?.headline ?? '', summary: profile?.summary ?? '', location: profile?.location ?? '', phone: profile?.phone ?? '', years: String(profile?.yearsExperience ?? 0), salary: profile?.desiredMinSalary ? String(profile.desiredMinSalary) : '', skills: profile?.skills.join(', ') ?? '' });
  const [remoteOk, setRemoteOk] = useState(profile?.remoteOk ?? true);
  const [openToWork, setOpenToWork] = useState(profile?.openToWork ?? true);
  const [experience, setExperience] = useState<Experience[]>(profile?.experience ?? []);
  const [education, setEducation] = useState<Education[]>(profile?.education ?? []);
  const [newExp, setNewExp] = useState({ title: '', company: '', startDate: '', endDate: '' });
  const [newEdu, setNewEdu] = useState({ school: '', degree: '', year: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF({ ...f, [k]: v });
  const expOk = newExp.title && newExp.company && yearMonth.test(newExp.startDate) && (!newExp.endDate || yearMonth.test(newExp.endDate));
  const addExp = () => { setExperience([{ title: newExp.title, company: newExp.company, startDate: newExp.startDate, endDate: newExp.endDate || null }, ...experience]); setNewExp({ title: '', company: '', startDate: '', endDate: '' }); };
  const addEdu = () => { setEducation([{ school: newEdu.school, degree: newEdu.degree, year: Number(newEdu.year) || null }, ...education]); setNewEdu({ school: '', degree: '', year: '' }); };
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const saved = await api<Profile>('/profile', 'PUT', {
        name: f.name, headline: f.headline || null, summary: f.summary || null, location: f.location || null, phone: f.phone || null, yearsExperience: Number(f.years) || 0, desiredMinSalary: Number(f.salary) || null, remoteOk, openToWork,
        skills: f.skills.split(',').map((s) => s.trim()).filter(Boolean), experience: experience.map(({ title, company, startDate, endDate, summary }) => ({ title, company, startDate, endDate, summary: summary ?? null })), education: education.map(({ school, degree, year }) => ({ school, degree, year })),
      });
      setProfile(saved);
      void refresh().catch(() => {});
      showToast('Profile saved');
      navigation.goBack();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  const toggle = (text: string, value: boolean, onChange: (v: boolean) => void) => <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ color: colors.ink, fontWeight: '600' }}>{text}</Text><Switch accessibilityLabel={text} value={value} onValueChange={onChange} trackColor={{ true: colors.brand }} /></View>;
  const removeBtn = (name: string, onPress: () => void) => <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${name}`} hitSlop={8} onPress={onPress}><Ionicons name="close" size={20} color={colors.faint} /></Pressable>;
  return (
    <Screen title="Edit profile" footer={<Button title="Save profile" busy={busy} disabled={!f.name} onPress={save} />}>
      <ErrorText text={error} />
      <Field label="Full name" value={f.name} onChangeText={set('name')} />
      <Field label="Headline" placeholder="Frontend developer with 4 years of experience" maxLength={120} value={f.headline} onChangeText={set('headline')} />
      <Field label="Summary" multiline maxLength={2000} value={f.summary} onChangeText={set('summary')} />
      <Field label="Skills, separated by commas" autoCapitalize="words" value={f.skills} onChangeText={set('skills')} />
      <Field label="Location" placeholder="YOUR_LOCATION" value={f.location} onChangeText={set('location')} />
      <Field label="Phone" keyboardType="phone-pad" value={f.phone} onChangeText={set('phone')} />
      <Field label="Years of experience" keyboardType="number-pad" value={f.years} onChangeText={(v) => set('years')(v.replace(/\D/g, ''))} />
      <Field label="Minimum salary you want, per year" keyboardType="number-pad" value={f.salary} onChangeText={(v) => set('salary')(v.replace(/\D/g, ''))} />
      {toggle('Open to remote work', remoteOk, setRemoteOk)}
      {toggle('Open to work', openToWork, setOpenToWork)}
      <SectionTitle>Experience</SectionTitle>
      {experience.map((e, i) => <Row key={`${e.title}${i}`} title={e.title} sub={`${e.company} · ${e.startDate} to ${e.endDate ?? 'now'}`} right={removeBtn(e.title, () => setExperience(experience.filter((_, x) => x !== i)))} />)}
      <Field label="Job title" value={newExp.title} onChangeText={(v) => setNewExp({ ...newExp, title: v })} />
      <Field label="Company" value={newExp.company} onChangeText={(v) => setNewExp({ ...newExp, company: v })} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Field label="Start (YYYY-MM)" keyboardType="numbers-and-punctuation" value={newExp.startDate} onChangeText={(v) => setNewExp({ ...newExp, startDate: v })} /></View>
        <View style={{ flex: 1 }}><Field label="End (blank if current)" keyboardType="numbers-and-punctuation" value={newExp.endDate} onChangeText={(v) => setNewExp({ ...newExp, endDate: v })} /></View>
      </View>
      <Button title="Add experience" kind="secondary" disabled={!expOk} onPress={addExp} />
      <SectionTitle>Education</SectionTitle>
      {education.map((e, i) => <Row key={`${e.school}${i}`} title={e.degree} sub={`${e.school}${e.year ? ` · ${e.year}` : ''}`} right={removeBtn(e.degree, () => setEducation(education.filter((_, x) => x !== i)))} />)}
      <Field label="School" value={newEdu.school} onChangeText={(v) => setNewEdu({ ...newEdu, school: v })} />
      <Field label="Degree" value={newEdu.degree} onChangeText={(v) => setNewEdu({ ...newEdu, degree: v })} />
      <Field label="Year" keyboardType="number-pad" maxLength={4} value={newEdu.year} onChangeText={(v) => setNewEdu({ ...newEdu, year: v.replace(/\D/g, '') })} />
      <Button title="Add education" kind="secondary" disabled={!newEdu.school || !newEdu.degree} onPress={addEdu} />
    </Screen>
  );
}

export function AlertsScreen({ navigation }: any) {
  const showToast = useApp((a) => a.showToast);
  const [items, setItems] = useState<any[] | null>(null);
  const load = useCallback(() => api<any[]>('/saved-searches').then(setItems, (e: Error) => { setItems([]); showToast(e.message, 'bad'); }), [showToast]);
  useEffect(() => { void load(); }, [load]);
  const change = (p: Promise<unknown>) => p.then(load, (e: Error) => showToast(e.message, 'bad'));
  return (
    <Screen title="Job alerts" onRefresh={load}>
      {!items ? <Spinner /> : items.length === 0 ? <Empty icon="notifications-outline" text="Search for jobs, then tap Create alert to hear about new ones." /> : items.map((s) => (
        <Card key={s.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <Pressable accessibilityRole="button" style={{ flex: 1 }} onPress={() => navigation.navigate('Tabs', { screen: 'Search', params: { ...s.filters, nonce: Date.now() } })}><Text style={{ fontWeight: '700', color: colors.ink }}>{s.name}</Text><Muted>{Object.entries(s.filters).map(([, v]) => label(String(v))).join(' · ')}</Muted></Pressable>
            <Switch accessibilityLabel={`Alerts for ${s.name}`} value={s.alert} onValueChange={(alert) => void change(api(`/saved-searches/${s.id}`, 'PATCH', { alert }))} trackColor={{ true: colors.brand }} />
            <Pressable accessibilityRole="button" accessibilityLabel={`Delete ${s.name}`} hitSlop={8} onPress={() => void change(api(`/saved-searches/${s.id}`, 'DELETE'))}><Ionicons name="trash-outline" size={20} color={colors.faint} /></Pressable>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

export function SalariesScreen() {
  const meta = useApp((a) => a.meta);
  const [category, setCategory] = useState<string | null>(null);
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { setRows(null); api<any[]>(`/insights/salaries${category ? `?category=${encodeURIComponent(category)}` : ''}`).then(setRows, () => setRows([])); }, [category]);
  return (
    <Screen title="Salary insights">
      <Muted>Based on open jobs listed in US dollars, per year.</Muted>
      <Chips options={meta?.categories ?? []} value={category} onChange={(c) => setCategory(c === category ? null : c)} />
      {!rows ? <Spinner /> : rows.length === 0 ? <Empty icon="cash-outline" text="No salary data here yet." /> : <Card style={{ gap: 0 }}>{rows.map((r, i) => <Row key={i} title={`${r.category} · ${label(r.level)}`} sub={`${r.jobs} job${r.jobs === 1 ? '' : 's'} · ${r.low.toLocaleString('en-US')} to ${r.high.toLocaleString('en-US')}`} right={<Text style={{ fontWeight: '800', color: colors.ink }}>${Math.round(r.average / 1000)}k</Text>} />)}</Card>}
    </Screen>
  );
}

export function NotificationsScreen({ navigation }: any) {
  const refresh = useApp((a) => a.refresh);
  const [items, setItems] = useState<any[] | null>(null);
  const load = useCallback(async () => {
    const r = await api('/notifications');
    setItems(r.items);
    await api('/notifications/read', 'POST', {});
    void refresh().catch(() => {});
  }, [refresh]);
  useEffect(() => { load().catch(() => setItems([])); }, [load]);
  const open = (link: string | null) => {
    const [, kind, id] = (link ?? '').split('/');
    if (kind === 'jobs') navigation.navigate('Job', { id });
    if (kind === 'applications') navigation.navigate('Application', { id });
  };
  return (
    <Screen title="Notifications" onRefresh={load}>
      {!items ? <Spinner /> : items.length === 0 ? <Empty icon="notifications-off-outline" text="Nothing yet." /> : items.map((n) => (
        <Pressable key={n.id} accessibilityRole="button" disabled={!n.link} onPress={() => open(n.link)}>
          <Card style={!n.readAt ? { borderColor: colors.brand, borderWidth: 1 } : undefined}><Text style={{ fontWeight: '700', color: colors.ink }}>{n.title}</Text><Text style={{ color: colors.ink }}>{n.body}</Text><Muted>{ago(n.createdAt)}</Muted></Card>
        </Pressable>
      ))}
    </Screen>
  );
}

export function ChangePasswordScreen({ navigation }: any) {
  const showToast = useApp((a) => a.showToast);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/auth/password', 'POST', { currentPassword: current, newPassword: next });
      showToast('Password changed. Other devices were signed out.');
      navigation.goBack();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Screen title="Change password" footer={<Button title="Change password" busy={busy} disabled={!current || next.length < 10} onPress={submit} />}>
      <ErrorText text={error} />
      <Field label="Current password" secureTextEntry value={current} onChangeText={setCurrent} />
      <Field label="New password (at least 10 characters)" secureTextEntry value={next} onChangeText={setNext} />
    </Screen>
  );
}
