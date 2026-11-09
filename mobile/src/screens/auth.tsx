import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { Button, ErrorText, Field, Muted, Screen } from '../components/ui';
import { api } from '../lib/api';
import { useApp } from '../store/app';
import { colors } from '../theme';

export function LoginScreen({ navigation }: any) {
  const signIn = useApp((a) => a.signIn);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api('/auth/login', 'POST', { email, password, device: 'Mobile app' });
      if (r.user.role !== 'candidate') {
        setError('This app is for job seekers. Employers use the DreamJob web portal.');
        setBusy(false);
        return;
      }
      await signIn(r.token, r.user);
      navigation.goBack();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Screen title="Sign in" footer={<Button title="Sign in" busy={busy} disabled={!email || !password} onPress={submit} />}>
      <ErrorText text={error} />
      <Field label="Email" keyboardType="email-address" autoCapitalize="none" autoComplete="email" value={email} onChangeText={setEmail} />
      <Field label="Password" secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} />
      <Pressable accessibilityRole="button" onPress={() => navigation.replace('Register')} style={{ alignItems: 'center', padding: 10 }}><Text style={{ color: colors.brand, fontWeight: '700' }}>New here? Create an account</Text></Pressable>
    </Screen>
  );
}

export function RegisterScreen({ navigation }: any) {
  const signIn = useApp((a) => a.signIn);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api('/auth/register', 'POST', { ...form, role: 'candidate', device: 'Mobile app' });
      await signIn(r.token, r.user);
      navigation.replace('EditProfile');
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <Screen title="Create your account" footer={<Button title="Create account" busy={busy} disabled={!form.name || !form.email || form.password.length < 10} onPress={submit} />}>
      <ErrorText text={error} />
      <Field label="Full name" autoCapitalize="words" value={form.name} onChangeText={set('name')} />
      <Field label="Email" keyboardType="email-address" autoCapitalize="none" autoComplete="email" value={form.email} onChangeText={set('email')} />
      <Field label="Password (at least 10 characters)" secureTextEntry autoComplete="new-password" value={form.password} onChangeText={set('password')} />
      <Muted>Hiring? Create an employer account on the DreamJob web portal.</Muted>
    </Screen>
  );
}
