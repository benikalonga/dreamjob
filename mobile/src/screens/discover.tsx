import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Chips, Empty, ErrorText, Field, JobRow, Muted, Screen, SectionTitle } from '../components/ui';
import { api } from '../lib/api';
import { label } from '../lib/format';
import type { JobCard, Meta } from '../lib/types';
import { useApp } from '../store/app';
import { colors } from '../theme';

/** Saves or unsaves a job, or asks a guest to sign in first. */
export function useToggleSave(onChange: (id: string, saved: boolean) => void) {
  const { signedIn, showToast } = useApp();
  return (navigation: any, job: JobCard) => {
    if (!signedIn) return navigation.navigate('Login');
    onChange(job.id, !job.saved);
    api(`/jobs/${job.id}/save`, job.saved ? 'DELETE' : 'POST', job.saved ? undefined : {}).catch((e: Error) => { onChange(job.id, job.saved); showToast(e.message, 'bad'); });
  };
}

export function DiscoverScreen({ navigation }: any) {
  const { user, profile, feed, meta, unread, signedIn, refresh } = useApp();
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState('');
  const toggle = useToggleSave((id, saved) => setOverrides((o) => ({ ...o, [id]: saved })));
  useFocusEffect(useCallback(() => { void refresh().catch(() => {}); }, [refresh]));
  useEffect(() => setOverrides({}), [feed]);
  const jobs = feed.map((j) => (j.id in overrides ? { ...j, saved: overrides[j.id] } : j));
  const search = (params: object) => navigation.navigate('Search', params);
  return (
    <Screen onRefresh={refresh}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <Muted style={{ fontSize: 15 }}>{user ? `Hello, ${user.name.split(' ')[0]}` : 'Welcome to DreamJob'}</Muted>
          <Text style={{ fontSize: 28, fontWeight: '800', color: colors.ink, letterSpacing: -0.5 }}>Find work you love</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${unread} unread`} hitSlop={10} onPress={() => navigation.navigate(signedIn ? 'Notifications' : 'Login')}>
          <Ionicons name="notifications-outline" size={25} color={colors.ink} />
          {unread > 0 ? <View style={{ position: 'absolute', top: -5, right: -6, backgroundColor: colors.sun, borderRadius: 9, minWidth: 18, alignItems: 'center', paddingHorizontal: 4 }}><Text style={{ fontSize: 11, fontWeight: '800', color: colors.ink }}>{unread > 99 ? '99+' : unread}</Text></View> : null}
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12, height: 50, borderWidth: 1, borderColor: colors.line }}>
        <Ionicons name="search" size={18} color={colors.faint} />
        <TextInput accessibilityLabel="Search jobs" style={{ flex: 1, color: colors.ink, fontSize: 16 }} placeholder="Job title, skill or company" placeholderTextColor={colors.faint} value={q} onChangeText={setQ} returnKeyType="search" onSubmitEditing={() => search({ q, nonce: Date.now() })} autoCorrect={false} />
      </View>
      {meta ? <Chips options={meta.categories} value={null} onChange={(category) => search({ category, nonce: Date.now() })} /> : null}
      {signedIn && profile && profile.completeness.percent < 100 ? (
        <Pressable accessibilityRole="button" onPress={() => navigation.navigate('EditProfile')} style={{ backgroundColor: colors.sunSoft, borderRadius: 14, padding: 14, gap: 6 }}>
          <Text style={{ fontWeight: '700', color: colors.ink }}>Your profile is {profile.completeness.percent}% complete</Text>
          <Muted>{profile.completeness.missing[0]} to get better matches.</Muted>
        </Pressable>
      ) : null}
      {!signedIn ? <Button title="Sign in to see your best matches" kind="secondary" icon="sparkles-outline" onPress={() => navigation.navigate('Login')} /> : null}
      <SectionTitle>{signedIn ? 'Best matches for you' : 'Latest jobs'}</SectionTitle>
      {jobs.length === 0 ? <Empty icon="briefcase-outline" text="No jobs to show yet." /> : jobs.map((j) => <JobRow key={j.id} job={j} onPress={() => navigation.navigate('Job', { id: j.id })} onToggleSave={() => toggle(navigation, j)} />)}
      {meta ? <Muted style={{ textAlign: 'center' }}>{meta.stats.jobs} open jobs at {meta.stats.companies} companies</Muted> : null}
    </Screen>
  );
}

type Filter = { category: string | null; type: string | null; level: string | null; workplace: string | null; location: string; salaryMin: string; postedDays: string | null };
const NO_FILTERS: Filter = { category: null, type: null, level: null, workplace: null, location: '', salaryMin: '', postedDays: null };
const SORTS = ['newest', 'relevance', 'salary', 'match'] as const;
const POSTED = ['1', '7', '30'] as const;

export function SearchScreen({ navigation, route }: any) {
  const { meta, signedIn, showToast } = useApp();
  const [q, setQ] = useState<string>(route.params?.q ?? '');
  const [filters, setFilters] = useState<Filter>({ ...NO_FILTERS, category: route.params?.category ?? null });
  const [sort, setSort] = useState<(typeof SORTS)[number]>('newest');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<JobCard[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);
  const toggle = useToggleSave((id, saved) => setItems((list) => list.map((j) => (j.id === id ? { ...j, saved } : j))));

  useEffect(() => {
    if (route.params?.nonce) { setQ(route.params.q ?? ''); setFilters({ ...NO_FILTERS, category: route.params.category ?? null }); }
  }, [route.params?.nonce]);

  const query = useCallback(() => {
    const p = new URLSearchParams({ sort });
    if (q.trim()) p.set('q', q.trim());
    for (const key of ['category', 'type', 'level', 'workplace', 'postedDays'] as const) if (filters[key]) p.set(key, filters[key]!);
    if (filters.location.trim()) p.set('location', filters.location.trim());
    if (Number(filters.salaryMin) > 0) p.set('salaryMin', String(Math.floor(Number(filters.salaryMin))));
    return p;
  }, [q, filters, sort]);

  const load = useCallback(async (next: number) => {
    const ticket = ++latest.current;
    const p = query();
    p.set('page', String(next));
    try {
      const r = await api<{ items: JobCard[]; total: number; hasMore: boolean }>(`/jobs?${p}`);
      if (ticket !== latest.current) return;
      setItems((old) => (next === 1 ? r.items : [...old, ...r.items]));
      setTotal(r.total);
      setHasMore(r.hasMore);
      setPage(next);
      setError(null);
    } catch (e) {
      if (ticket === latest.current) setError((e as Error).message);
    }
    if (ticket === latest.current) setLoading(false);
  }, [query]);

  useEffect(() => {
    const timer = setTimeout(() => void load(1), 300);
    return () => clearTimeout(timer);
  }, [load]);
  useEffect(() => navigation.addListener('focus', () => void load(1)), [navigation, load]);

  const set = (key: 'category' | 'type' | 'level' | 'workplace' | 'postedDays', value: string) => setFilters((f) => ({ ...f, [key]: f[key] === value ? null : value }));
  const active = Object.entries(filters).filter(([, v]) => v).length;
  const saveSearch = async () => {
    if (!signedIn) return navigation.navigate('Login');
    const f = Object.fromEntries(query().entries());
    delete (f as Record<string, string>).sort;
    try {
      await api('/saved-searches', 'POST', { name: q.trim() || filters.category || 'My search', filters: f });
      showToast('Alert created');
    } catch (e) { showToast((e as Error).message, 'bad'); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.paper }} edges={['top']}>
      <FlatList
        data={items} keyExtractor={(j) => j.id} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 24 }} keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12, height: 46, borderWidth: 1, borderColor: colors.line }}>
                <Ionicons name="search" size={18} color={colors.faint} />
                <TextInput accessibilityLabel="Search jobs" style={{ flex: 1, color: colors.ink, fontSize: 15 }} placeholder="Job title, skill or company" placeholderTextColor={colors.faint} value={q} onChangeText={setQ} autoCorrect={false} />
                {q ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => setQ('')}><Ionicons name="close-circle" size={18} color={colors.faint} /></Pressable> : null}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={`Filters, ${active} active`} onPress={() => setOpen(!open)} style={{ width: 46, height: 46, borderRadius: 12, backgroundColor: active ? colors.brand : colors.card, borderWidth: 1, borderColor: active ? colors.brand : colors.line, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="options-outline" size={20} color={active ? colors.white : colors.ink} /></Pressable>
            </View>
            {open && meta ? (
              <View style={{ gap: 10 }}>
                <Chips options={meta.categories} value={filters.category} onChange={(v) => set('category', v)} />
                <Chips options={meta.workplaces} value={filters.workplace} onChange={(v) => set('workplace', v)} label={label} />
                <Chips options={meta.types} value={filters.type} onChange={(v) => set('type', v)} label={label} />
                <Chips options={meta.levels} value={filters.level} onChange={(v) => set('level', v)} label={label} />
                <Chips options={POSTED} value={filters.postedDays as (typeof POSTED)[number] | null} onChange={(v) => set('postedDays', v)} label={(d) => (d === '1' ? 'Last 24 hours' : `Last ${d} days`)} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}><Field label="Location" value={filters.location} onChangeText={(v) => setFilters((f) => ({ ...f, location: v }))} /></View>
                  <View style={{ flex: 1 }}><Field label="Minimum salary" keyboardType="number-pad" value={filters.salaryMin} onChangeText={(v) => setFilters((f) => ({ ...f, salaryMin: v.replace(/\D/g, '') }))} /></View>
                </View>
                {active ? <Button title="Clear filters" kind="secondary" onPress={() => setFilters(NO_FILTERS)} /> : null}
              </View>
            ) : null}
            <Chips options={signedIn ? SORTS : SORTS.filter((x) => x !== 'match')} value={sort} onChange={setSort} label={(x) => (x === 'match' ? 'Best match' : label(x))} />
            <ErrorText text={error} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Muted>{loading ? 'Searching…' : `${total.toLocaleString()} job${total === 1 ? '' : 's'}`}</Muted>
              <Pressable accessibilityRole="button" onPress={() => void saveSearch()} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><Ionicons name="notifications-outline" size={16} color={colors.brand} /><Text style={{ color: colors.brand, fontWeight: '700' }}>Create alert</Text></Pressable>
            </View>
          </View>
        }
        renderItem={({ item }) => <JobRow job={item} onPress={() => navigation.navigate('Job', { id: item.id })} onToggleSave={() => toggle(navigation, item)} />}
        ListEmptyComponent={loading ? undefined : <Empty icon="search-outline" text="No jobs match. Try fewer filters." />}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load(1)} />}
        onEndReachedThreshold={0.4} onEndReached={() => { if (hasMore && !loading) void load(page + 1); }}
        ListFooterComponent={hasMore ? <ActivityIndicator color={colors.brand} style={{ padding: 16 }} /> : undefined}
      />
    </SafeAreaView>
  );
}

export type { Meta };
