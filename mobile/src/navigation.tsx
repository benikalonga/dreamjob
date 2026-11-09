import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ApplicationScreen, ApplicationsScreen, SavedScreen } from './screens/applications';
import { LoginScreen, RegisterScreen } from './screens/auth';
import { DiscoverScreen, SearchScreen } from './screens/discover';
import { ApplyScreen, CompanyScreen, JobScreen } from './screens/job';
import { AlertsScreen, ChangePasswordScreen, EditProfileScreen, NotificationsScreen, ProfileScreen, SalariesScreen } from './screens/profile';
import type { IconName } from './components/ui';
import { colors } from './theme';

const Stack = createNativeStackNavigator<any>();
const Tabs = createBottomTabNavigator<any>();
const ICONS: Record<string, IconName> = { Discover: 'compass', Search: 'search', Applications: 'paper-plane', Saved: 'bookmark', Profile: 'person' };

function MainTabs() {
  return (
    <Tabs.Navigator screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: colors.brand, tabBarInactiveTintColor: colors.faint, tabBarIcon: ({ color, size }) => <Ionicons name={ICONS[route.name]} size={size} color={color} /> })}>
      <Tabs.Screen name="Discover" component={DiscoverScreen} />
      <Tabs.Screen name="Search" component={SearchScreen} />
      <Tabs.Screen name="Applications" component={ApplicationsScreen} />
      <Tabs.Screen name="Saved" component={SavedScreen} />
      <Tabs.Screen name="Profile" component={ProfileScreen} />
    </Tabs.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false, statusBarStyle: 'dark' }}>
      <Stack.Screen name="Tabs" component={MainTabs} />
      <Stack.Screen name="Job" component={JobScreen} />
      <Stack.Screen name="Apply" component={ApplyScreen} />
      <Stack.Screen name="Company" component={CompanyScreen} />
      <Stack.Screen name="Application" component={ApplicationScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="Alerts" component={AlertsScreen} />
      <Stack.Screen name="Salaries" component={SalariesScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
      <Stack.Screen name="Login" component={LoginScreen} options={{ presentation: 'modal' }} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ presentation: 'modal' }} />
    </Stack.Navigator>
  );
}
