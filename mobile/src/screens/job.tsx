import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Pressable, Share, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Avatar, Button, Card, Chips, ErrorText, Field, JobRow, Muted, Screen, SectionTitle, Spinner, Tag } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { ago, label, salaryText } from '../lib/format';
import type { JobCard, JobDetail } from '../lib/types';
import { useApp } from '../store/app';
import { colors } from '../theme';

const TABS = ['About', 'Requirements', 'Company'] as const;

function Bullets({ items }: { items: string[] }) {
  return <>{items.map((t, i) => <View key={i} style={{ flexDirection: 'row', gap: 8 }}><Text style={{ color: colors.brand }}>•</Text><Text style={{ flex: 1, color: colors.ink, lineHeight: 21 }}>{t}</Text></View>)}</>;
}

export function JobScreen({ route, navigation }: any) {
  const id = route.params.id as string;
  const { signedIn, showToast } = useApp();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>('About');
  const load = useCallback(() => api<JobDetail>(`/jobs/${id}`).then(setJob, (e: Error) => setError(e.message)), [id]);
  useEffect(() => navigation.addListener('focus', () => void load()), [navigation, load]);
  useEffect(() => { void load(); }, [load]);
  if (!job) return <Screen title="Job">{error ? <ErrorText text={error} /> : <Spinner />}</Screen>;

  const pay = salaryText(job.salaryMin, job.salaryMax, job.currency);
  const toggleSave = async () => {
    if (!signedIn) return navigation.navigate('Login');
    const saved = !job.saved;
    setJob({ ...job, saved });
    await api(`/jobs/${id}/save`, saved ? 'POST' : 'DELETE', saved ? {} : undefined).catch((e: Error) => { setJob({ ...job, saved: !saved }); showToast(e.message, 'bad'); });
  };
  const report = () => {
    if (!signedIn) return navigation.navigate('Login');
    const send = (reason: string) => api(`/jobs/${id}/report`, 'POST', { reason }).then(() => showToast('Thanks. We will take a look.'), (e: Error) => showToast(e.message, 'bad'));
    Alert.alert('Report this job', 'What is wrong with it?', [{ text: 'Looks like a scam', onPress: () => void send('scam') }, { text: 'Misleading', onPress: () => void send('misleading') }, { text: 'Offensive', onPress: () => void send('offensive') }, { text: 'Cancel', style: 'cancel' }]);
  };
  const right = <View style={{ flexDirection: 'row', gap: 16 }}>
    <Pressable accessibilityRole="button" accessibilityLabel="Share job" hitSlop={8} onPress={() => void Share.share({ message: `${job.title} at ${job.company.name}, on DreamJob` })}><Ionicons name="share-outline" size={23} color={colors.ink} /></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={job.saved ? 'Remove from saved jobs' : 'Save job'} hitSlop={8} onPress={() => void toggleSave()}><Ionicons name={job.saved ? 'bookmark' : 'bookmark-outline'} size={23} color={job.saved ? colors.brand : colors.ink} /></Pressable>
  </View>;
  const closed = job.status !== 'published';
  const footer = closed ? <Button title="No longer accepting applications" disabled onPress={() => {}} />
    : job.applied ? <Button title="View my applications" kind="secondary" onPress={() => navigation.navigate('Tabs', { screen: 'Applications' })} />
    : <Button title="Apply now" onPress={() => navigation.navigate(signedIn ? 'Apply' : 'Login', { job })} />;

  return (
    <Screen title="Job" right={right} footer={footer}>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Avatar name={job.company.name} size={64} />
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink, textAlign: 'center' }}>{job.title}</Text>
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate('Company', { id: job.company.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text style={{ color: colors.brand, fontWeight: '700' }}>{job.company.name}</Text>
          {job.company.verified ? <Ionicons name="checkmark-circle" size={15} color={colors.brand} accessibilityLabel="Verified company" /> : null}
        </Pressable>
        <Muted>{job.location} · Posted {ago(job.publishedAt).toLowerCase()}</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
          <Tag text={label(job.type)} /><Tag text={label(job.level)} /><Tag text={label(job.workplace)} />{pay ? <Tag text={pay} tone="brand" /> : null}
        </View>
      </View>
      {job.match !== null ? (
        <Card style={{ backgroundColor: colors.brandSoft }}>
          <Text style={{ fontWeight: '800', fontSize: 16, color: colors.brand }}>{job.match}% match</Text>
          {job.matchedSkills.length ? <Muted>You have: {job.matchedSkills.join(', ')}</Muted> : null}
          {job.missingSkills.length ? <Muted>To build: {job.missingSkills.join(', ')}</Muted> : null}
        </Card>
      ) : null}
      <Chips options={TABS} value={tab} onChange={setTab} />
      {tab === 'About' ? <Card>
        <Text style={{ color: colors.ink, lineHeight: 22 }}>{job.description}</Text>
        {job.responsibilities.length ? <><SectionTitle>What you will do</SectionTitle><Bullets items={job.responsibilities} /></> : null}
        {job.benefits.length ? <><SectionTitle>Benefits</SectionTitle><Bullets items={job.benefits} /></> : null}
      </Card> : null}
      {tab === 'Requirements' ? <Card>
        <SectionTitle>Skills</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{job.skills.map((x) => <Tag key={x} text={x} tone={job.matchedSkills.includes(x) ? 'ok' : undefined} />)}</View>
        {job.qualifications.length ? <><SectionTitle>Qualifications</SectionTitle><Bullets items={job.qualifications} /></> : null}
      </Card> : null}
      {tab === 'Company' ? <Card>
        {job.companyInfo.about ? <Text style={{ color: colors.ink, lineHeight: 22 }}>{job.companyInfo.about}</Text> : null}
        {[job.companyInfo.industry, job.companyInfo.size && `${job.companyInfo.size} people`, job.companyInfo.location].filter(Boolean).map((x) => <Muted key={x as string}>{x}</Muted>)}
        <Button title="See company page" kind="secondary" onPress={() => navigation.navigate('Company', { id: job.company.id })} />
      </Card> : null}
      {job.similar.length ? <SectionTitle>Similar jobs</SectionTitle> : null}
      {job.similar.map((j: JobCard) => <JobRow key={j.id} job={j} onPress={() => navigation.push('Job', { id: j.id })} />)}
      <Pressable accessibilityRole="button" onPress={report} style={{ alignItems: 'center', padding: 8 }}><Muted>Report this job</Muted></Pressable>
    </Screen>
  );
}

export function ApplyScreen({ route, navigation }: any) {
  const job = route.params.job as JobDetail;
  const { profile, showToast, refresh, user } = useApp();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const a = await api(`/jobs/${job.id}/apply`, 'POST', { coverNote: note.trim() || undefined });
      showToast('Application sent');
      void refresh().catch(() => {});
      navigation.replace('Application', { id: a.id });
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.code === 'ALREADY_APPLIED') navigation.goBack();
      setBusy(false);
    }
  };
  return (
    <Screen title="Apply" footer={<Button title="Send application" busy={busy} onPress={submit} />}>
      <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink }}>{job.title}</Text>
      <Muted>{job.company.name}</Muted>
      <ErrorText text={error} />
      <Card>
        <Text style={{ fontWeight: '700', color: colors.ink }}>{user?.name}</Text>
        <Muted>{profile?.headline ?? 'No headline yet'}</Muted>
        <Muted>Skills: {profile?.skills.join(', ') || 'none yet'}</Muted>
        <Button title="Edit profile" kind="secondary" onPress={() => navigation.navigate('EditProfile')} />
      </Card>
      <Muted>The employer sees your profile as it is now, including your email and phone number.</Muted>
      <Field label="Cover note (optional)" multiline maxLength={2000} value={note} onChangeText={setNote} placeholder="Why are you a good fit?" />
    </Screen>
  );
}

export function CompanyScreen({ route, navigation }: any) {
  const { signedIn, showToast } = useApp();
  const [c, setC] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api(`/companies/${route.params.id}`).then(setC, (e: Error) => setError(e.message)), [route.params.id]);
  useEffect(() => { void load(); }, [load]);
  if (!c) return <Screen title="Company">{error ? <ErrorText text={error} /> : <Spinner />}</Screen>;
  const follow = async () => {
    if (!signedIn) return navigation.navigate('Login');
    await api(`/companies/${c.id}/follow`, c.following ? 'DELETE' : 'POST', c.following ? undefined : {}).catch((e: Error) => showToast(e.message, 'bad'));
    await load();
  };
  return (
    <Screen title="Company" onRefresh={load}>
      <View style={{ alignItems: 'center', gap: 6 }}>
        <Avatar name={c.name} size={64} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Text style={{ fontSize: 22, fontWeight: '800', color: colors.ink }}>{c.name}</Text>{c.verified ? <Ionicons name="checkmark-circle" size={18} color={colors.brand} accessibilityLabel="Verified company" /> : null}</View>
        <Muted>{[c.industry, c.size && `${c.size} people`, c.location].filter(Boolean).join(' · ')}</Muted>
        <Muted>{c.followers} follower{c.followers === 1 ? '' : 's'}</Muted>
      </View>
      <Button title={c.following ? 'Following' : 'Follow for new jobs'} kind={c.following ? 'secondary' : 'primary'} icon={c.following ? 'checkmark' : 'add'} onPress={() => void follow()} />
      {c.about ? <Card><Text style={{ color: colors.ink, lineHeight: 22 }}>{c.about}</Text>{c.website ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(c.website)}><Text style={{ color: colors.brand, fontWeight: '600' }}>Visit website</Text></Pressable> : null}</Card> : null}
      <SectionTitle>Open jobs ({c.jobs.length})</SectionTitle>
      {c.jobs.map((j: JobCard) => <JobRow key={j.id} job={j} onPress={() => navigation.push('Job', { id: j.id })} />)}
    </Screen>
  );
}
