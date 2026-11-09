import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, Card, Empty, ErrorText, Field, JobRow, Muted, Row, Screen, SectionTitle, Spinner, StatusTag } from '../components/ui';
import { api } from '../lib/api';
import { ago, dateTime, label } from '../lib/format';
import type { ApplicationCard, JobCard } from '../lib/types';
import { useApp } from '../store/app';
import { colors } from '../theme';

const SignInPrompt = ({ navigation, text }: { navigation: any; text: string }) => <Screen><Empty icon="person-circle-outline" text={text} /><Button title="Sign in" onPress={() => navigation.navigate('Login')} /></Screen>;

export function ApplicationsScreen({ navigation }: any) {
  const signedIn = useApp((a) => a.signedIn);
  const [items, setItems] = useState<ApplicationCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => api<ApplicationCard[]>('/applications').then((r) => { setItems(r); setError(null); }, (e: Error) => setError(e.message)), []);
  useEffect(() => navigation.addListener('focus', () => { if (signedIn) void load(); }), [navigation, load, signedIn]);
  useEffect(() => { if (signedIn) void load(); else setItems(null); }, [signedIn, load]);
  if (!signedIn) return <SignInPrompt navigation={navigation} text="Sign in to track your applications." />;
  return (
    <Screen onRefresh={load}>
      <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink }}>Applications</Text>
      <ErrorText text={error} />
      {!items ? (!error && <Spinner />) : items.length === 0 ? <Empty icon="paper-plane-outline" text="Jobs you apply to will appear here." /> : items.map((a) => (
        <Card key={a.id}>
          <Row title={a.job.title} sub={`${a.job.company} · Updated ${ago(a.updatedAt).toLowerCase()}`} onPress={() => navigation.navigate('Application', { id: a.id })} right={<View style={{ alignItems: 'flex-end', gap: 4 }}><StatusTag status={a.status} />{a.unread ? <Text style={{ color: colors.brand, fontWeight: '700', fontSize: 12 }}>{a.unread} new message{a.unread === 1 ? '' : 's'}</Text> : null}</View>} />
        </Card>
      ))}
    </Screen>
  );
}

export function SavedScreen({ navigation }: any) {
  const { signedIn, showToast } = useApp();
  const [items, setItems] = useState<JobCard[] | null>(null);
  const load = useCallback(() => api<JobCard[]>('/saved-jobs').then(setItems, (e: Error) => { setItems([]); showToast(e.message, 'bad'); }), [showToast]);
  useEffect(() => navigation.addListener('focus', () => { if (signedIn) void load(); }), [navigation, load, signedIn]);
  useEffect(() => { if (signedIn) void load(); else setItems(null); }, [signedIn, load]);
  if (!signedIn) return <SignInPrompt navigation={navigation} text="Sign in to save jobs for later." />;
  const remove = async (id: string) => { setItems((l) => l?.filter((j) => j.id !== id) ?? null); await api(`/jobs/${id}/save`, 'DELETE').catch(() => load()); };
  return (
    <Screen onRefresh={load}>
      <Text style={{ fontSize: 26, fontWeight: '800', color: colors.ink }}>Saved jobs</Text>
      {!items ? <Spinner /> : items.length === 0 ? <Empty icon="bookmark-outline" text="Tap the bookmark on a job to keep it here." /> : items.map((j) => <JobRow key={j.id} job={j} onPress={() => navigation.navigate('Job', { id: j.id })} onToggleSave={() => void remove(j.id)} />)}
    </Screen>
  );
}

export function ApplicationScreen({ route, navigation }: any) {
  const id = route.params.id as string;
  const { user, showToast, refresh } = useApp();
  const [a, setA] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const load = useCallback(() => api(`/applications/${id}`).then(setA, (e: Error) => setError(e.message)), [id]);
  useEffect(() => { void load(); const t = setInterval(() => void load(), 15_000); return () => clearInterval(t); }, [load]);
  if (!a) return <Screen title="Application">{error ? <ErrorText text={error} /> : <Spinner />}</Screen>;
  const act = (p: Promise<unknown>) => p.then(load, (e: Error) => showToast(e.message, 'bad'));
  const withdraw = () => Alert.alert('Withdraw this application?', 'You cannot apply to this job again.', [{ text: 'Keep it', style: 'cancel' }, { text: 'Withdraw', style: 'destructive', onPress: () => { void act(api(`/applications/${id}/withdraw`, 'POST', {})); void refresh().catch(() => {}); } }]);
  const send = () => { const body = draft.trim(); setDraft(''); void act(api(`/applications/${id}/messages`, 'POST', { body })); };
  return (
    <Screen title="Application" onRefresh={load}>
      <Row title={a.job.title} sub={a.job.company} onPress={() => navigation.navigate('Job', { id: a.job.id })} right={<StatusTag status={a.status} />} />
      {a.interviews.length ? <SectionTitle>Interviews</SectionTitle> : null}
      {a.interviews.map((v: any) => (
        <Card key={v.id}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text style={{ fontWeight: '700', color: colors.ink, flex: 1 }}>{dateTime(v.scheduledAt)}</Text><StatusTag status={v.status} /></View>
          <Muted>{label(v.mode)} · {v.durationMinutes} minutes</Muted>
          {v.details ? <Text style={{ color: colors.ink }}>{v.details}</Text> : null}
          {v.status === 'proposed' ? <View style={{ flexDirection: 'row', gap: 8 }}><View style={{ flex: 1 }}><Button title="Decline" kind="secondary" onPress={() => void act(api(`/applications/${id}/interviews/${v.id}`, 'POST', { response: 'declined' }))} /></View><View style={{ flex: 1 }}><Button title="Accept" onPress={() => void act(api(`/applications/${id}/interviews/${v.id}`, 'POST', { response: 'accepted' }))} /></View></View> : null}
        </Card>
      ))}
      <SectionTitle>Progress</SectionTitle>
      <Card>
        {a.timeline.map((t: any, i: number) => <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}><Text style={{ color: colors.ink, fontWeight: i === a.timeline.length - 1 ? '700' : '400' }}>{label(t.status)}</Text><Muted>{ago(t.createdAt)}</Muted></View>)}
      </Card>
      {a.coverNote ? <><SectionTitle>Your cover note</SectionTitle><Card><Text style={{ color: colors.ink }}>{a.coverNote}</Text></Card></> : null}
      <SectionTitle>Messages</SectionTitle>
      {a.messages.length === 0 ? <Muted>The employer will write here if they want to talk.</Muted> : a.messages.map((m: any) => {
        const mine = m.senderId === user?.id;
        return <View key={m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', backgroundColor: mine ? colors.brand : colors.card, borderRadius: 14, padding: 11, borderWidth: mine ? 0 : 1, borderColor: colors.line }}><Text style={{ color: mine ? colors.white : colors.ink }}>{m.body}</Text></View>;
      })}
      {a.canMessage ? <><Field label="Reply" multiline value={draft} onChangeText={setDraft} /><Button title="Send" disabled={!draft.trim()} onPress={send} /></> : null}
      {a.canWithdraw ? <Button title="Withdraw application" kind="danger" onPress={withdraw} /> : null}
    </Screen>
  );
}
