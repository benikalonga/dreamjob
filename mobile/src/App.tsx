import { useEffect } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { OfflineBar, Toast } from './components/ui';
import { RootNavigator } from './navigation';
import { useApp } from './store/app';
import { colors } from './theme';

export default function App() {
  const { ready, boot, refresh } = useApp();
  useEffect(() => { void boot(); }, [boot]);
  useEffect(() => {
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh().catch(() => {}); }, 60_000);
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') void refresh().catch(() => {}); });
    return () => { clearInterval(timer); sub.remove(); };
  }, [refresh]);
  if (!ready) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand }}><ActivityIndicator color={colors.white} /></View>;
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <OfflineBar />
      <NavigationContainer><RootNavigator /></NavigationContainer>
      <Toast />
    </SafeAreaProvider>
  );
}
