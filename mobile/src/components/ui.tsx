import { useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ago, label as pretty, salaryText } from '../lib/format';
import type { JobCard as Job } from '../lib/types';
import { useApp } from '../store/app';
import { colors, radius, space } from '../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function TopBar({ title, right }: { title: string; right?: ReactNode }) {
  const nav = useNavigation<any>();
  return (
    <View style={s.topBar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={() => nav.goBack()}><Ionicons name="chevron-back" size={26} color={colors.ink} /></Pressable>
      <Text style={s.topTitle} numberOfLines={1}>{title}</Text>
      <View style={{ minWidth: 26, alignItems: 'flex-end' }}>{right}</View>
    </View>
  );
}

export function Screen({ title, children, onRefresh, right, footer }: { title?: string; children: ReactNode; onRefresh?: () => Promise<unknown>; right?: ReactNode; footer?: ReactNode }) {
  const [refreshing, setRefreshing] = useState(false);
  const pull = onRefresh ? async () => { setRefreshing(true); await onRefresh().catch(() => {}); setRefreshing(false); } : undefined;
  return (
    <SafeAreaView style={s.screen} edges={title ? ['top', 'bottom'] : ['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {title ? <TopBar title={title} right={right} /> : null}
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" refreshControl={pull ? <RefreshControl refreshing={refreshing} onRefresh={pull} /> : undefined}>{children}</ScrollView>
        {footer ? <View style={s.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export const Card = ({ children, style }: { children: ReactNode; style?: object }) => <View style={[s.card, style]}>{children}</View>;
export const SectionTitle = ({ children }: { children: ReactNode }) => <Text style={s.section}>{children}</Text>;
export const Muted = ({ children, style }: { children: ReactNode; style?: object }) => <Text style={[{ color: colors.muted, fontSize: 13 }, style]}>{children}</Text>;
export const ErrorText = ({ text }: { text?: string | null }) => (text ? <View style={s.errorBox} accessibilityRole="alert"><Text style={{ color: colors.bad }}>{text}</Text></View> : null);
export const Spinner = () => <View style={{ padding: 32 }}><ActivityIndicator color={colors.brand} /></View>;
export const Empty = ({ icon, text }: { icon: IconName; text: string }) => <View style={{ alignItems: 'center', padding: 32, gap: 8 }}><Ionicons name={icon} size={36} color={colors.faint} /><Muted style={{ textAlign: 'center' }}>{text}</Muted></View>;

export function Button({ title, onPress, kind = 'primary', busy, disabled, icon }: { title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger'; busy?: boolean; disabled?: boolean; icon?: IconName }) {
  const off = disabled || busy;
  const fg = kind === 'primary' ? colors.white : kind === 'danger' ? colors.bad : colors.ink;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!off }} disabled={off} onPress={onPress} style={({ pressed }) => [s.btn, kind === 'primary' ? { backgroundColor: colors.brand } : s.btnOutline, kind === 'danger' && { borderColor: colors.bad }, off && { opacity: 0.5 }, pressed && { opacity: 0.8 }]}>
      {busy ? <ActivityIndicator color={fg} /> : <>{icon ? <Ionicons name={icon} size={18} color={fg} /> : null}<Text style={{ color: fg, fontWeight: '700', fontSize: 15 }}>{title}</Text></>}
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string | null }) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput accessibilityLabel={label} placeholderTextColor={colors.faint} style={[s.input, props.multiline && { height: 110, paddingTop: 12, textAlignVertical: 'top' }, !!error && { borderColor: colors.bad }]} {...props} />
      {error ? <Text style={{ color: colors.bad, fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}

export function Chips<T extends string>({ options, value, onChange, label }: { options: readonly T[]; value: T | null; onChange: (v: T) => void; label?: (v: T) => string }) {
  const first = useRef(value).current;
  const ordered = useMemo(() => (first !== null && options.includes(first) ? [first, ...options.filter((o) => o !== first)] : [...options]), [options.join('|'), first]);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
      {ordered.map((o) => (
        <Pressable key={o} accessibilityRole="button" accessibilityState={{ selected: o === value }} onPress={() => onChange(o)} style={[s.chip, o === value && s.chipOn]}>
          <Text style={{ color: o === value ? colors.white : colors.ink, fontWeight: '600', fontSize: 13 }}>{label ? label(o) : o}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export const Tag = ({ text, tone }: { text: string; tone?: 'brand' | 'ok' | 'warn' }) => {
  const [bg, fg] = tone === 'ok' ? [colors.okSoft, colors.ok] : tone === 'warn' ? [colors.warnSoft, colors.warn] : tone === 'brand' ? [colors.brandSoft, colors.brand] : [colors.paper, colors.muted];
  return <View style={{ backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99 }}><Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{text}</Text></View>;
};

const STATUS_TONE: Record<string, 'brand' | 'ok' | 'warn' | undefined> = { applied: 'brand', reviewing: 'brand', shortlisted: 'brand', interview: 'warn', offer: 'ok', hired: 'ok', accepted: 'ok', proposed: 'warn' };
export const StatusTag = ({ status }: { status: string }) => <Tag text={pretty(status)} tone={STATUS_TONE[status]} />;

export const Avatar = ({ name, size = 44 }: { name: string; size?: number }) => <View style={{ width: size, height: size, borderRadius: size / 3.5, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.brand, fontWeight: '800', fontSize: size * 0.42 }}>{name[0]?.toUpperCase()}</Text></View>;

export function JobRow({ job, onPress, onToggleSave }: { job: Job; onPress: () => void; onToggleSave?: () => void }) {
  const pay = salaryText(job.salaryMin, job.salaryMax, job.currency);
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>
      <Card>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <Avatar name={job.company.name} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontWeight: '700', fontSize: 16, color: colors.ink }} numberOfLines={2}>{job.title}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Muted>{job.company.name}</Muted>
              {job.company.verified ? <Ionicons name="checkmark-circle" size={14} color={colors.brand} accessibilityLabel="Verified company" /> : null}
            </View>
          </View>
          {onToggleSave ? <Pressable accessibilityRole="button" accessibilityLabel={job.saved ? 'Remove from saved jobs' : 'Save job'} hitSlop={10} onPress={onToggleSave}><Ionicons name={job.saved ? 'bookmark' : 'bookmark-outline'} size={22} color={job.saved ? colors.brand : colors.faint} /></Pressable> : null}
        </View>
        <Muted>{job.location} · {pretty(job.workplace)}{pay ? ` · ${pay}` : ''}</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {job.match !== null ? <Tag text={`${job.match}% match`} tone={job.match >= 70 ? 'ok' : 'brand'} /> : null}
          {job.applied ? <Tag text="Applied" tone="ok" /> : null}
          <Tag text={pretty(job.type)} />
          <Tag text={pretty(job.level)} />
          <Muted style={{ marginLeft: 'auto' }}>{ago(job.publishedAt)}</Muted>
        </View>
      </Card>
    </Pressable>
  );
}

export function Row({ icon, title, sub, right, onPress }: { icon?: IconName; title: string; sub?: string | null; right?: ReactNode; onPress?: () => void }) {
  const body = (
    <View style={s.row}>
      {icon ? <View style={s.iconWrap}><Ionicons name={icon} size={19} color={colors.brand} /></View> : null}
      <View style={{ flex: 1, minWidth: 0 }}><Text style={{ fontWeight: '600', color: colors.ink, fontSize: 15 }} numberOfLines={1}>{title}</Text>{sub ? <Muted>{sub}</Muted> : null}</View>
      {right ? <View>{right}</View> : null}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>{body}</Pressable> : body;
}

export function Toast() {
  const toast = useApp((a) => a.toast);
  if (!toast) return null;
  return <SafeAreaView edges={['bottom']} pointerEvents="none" style={s.toastWrap}><View style={[s.toast, toast.tone === 'bad' && { backgroundColor: colors.bad }]} accessibilityLiveRegion="polite"><Text style={{ color: colors.white, fontWeight: '600' }}>{toast.text}</Text></View></SafeAreaView>;
}

export function OfflineBar() {
  const online = useApp((a) => a.online);
  if (online) return null;
  return <SafeAreaView edges={['top']} style={{ backgroundColor: colors.warnSoft }}><Text style={{ textAlign: 'center', color: colors.warn, fontWeight: '600', paddingVertical: 5, fontSize: 13 }}>Offline. Showing saved results.</Text></SafeAreaView>;
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  scroll: { padding: space.lg, gap: space.md, paddingBottom: 32 },
  footer: { padding: space.lg, paddingTop: space.sm, gap: space.sm },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.md, paddingVertical: 8 },
  topTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: space.lg, gap: space.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line },
  section: { fontWeight: '700', fontSize: 16, color: colors.ink, marginTop: 6 },
  btn: { minHeight: 50, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
  btnOutline: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  label: { fontWeight: '600', color: colors.ink, fontSize: 13 },
  input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, paddingHorizontal: 14, height: 48, color: colors.ink, fontSize: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  iconWrap: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  errorBox: { backgroundColor: colors.badSoft, padding: 12, borderRadius: radius.sm },
  toastWrap: { position: 'absolute', left: 0, right: 0, bottom: 90, alignItems: 'center' },
  toast: { backgroundColor: colors.ink, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 99, maxWidth: '90%' },
});
