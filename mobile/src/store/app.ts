import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { api, setAuthToken, setReachabilityHandler, setUnauthorizedHandler } from '../lib/api';
import type { JobCard, Meta, Profile, User } from '../lib/types';

const TOKEN_KEY = 'dreamjob.token';

interface AppState {
  ready: boolean; signedIn: boolean; online: boolean; user: User | null; profile: Profile | null; meta: Meta | null; feed: JobCard[]; unread: number; toast: { text: string; tone: 'ok' | 'bad' } | null;
  boot: () => Promise<void>; signIn: (token: string, user: User) => Promise<void>; signOut: (callServer?: boolean) => Promise<void>; refresh: () => Promise<void>; setProfile: (p: Profile) => void; showToast: (text: string, tone?: 'ok' | 'bad') => void;
}

export const useApp = create<AppState>()(persist((set, get) => ({
  ready: false, signedIn: false, online: true, user: null, profile: null, meta: null, feed: [], unread: 0, toast: null,

  boot: async () => {
    setUnauthorizedHandler(() => void get().signOut(false));
    setReachabilityHandler((online) => {
      if (online === get().online) return;
      set({ online });
      if (online) void get().refresh().catch(() => {});
    });
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    if (token) { setAuthToken(token); set({ signedIn: true }); }
    set({ ready: true });
    void get().refresh().catch(() => {});
  },

  signIn: async (token, user) => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    setAuthToken(token);
    set({ signedIn: true, user });
    await get().refresh().catch(() => {});
  },

  signOut: async (callServer = true) => {
    if (callServer) await api('/auth/logout', 'POST', {}).catch(() => {});
    setAuthToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    set({ signedIn: false, user: null, profile: null, unread: 0 });
    void get().refresh().catch(() => {});
  },

  refresh: async () => {
    const signedIn = get().signedIn;
    const [meta, feed] = await Promise.all([api<Meta>('/meta'), api<{ items: JobCard[] }>(`/jobs?limit=20&sort=${signedIn ? 'match' : 'newest'}`)]);
    set({ meta, feed: feed.items });
    if (signedIn) {
      const [user, profile, notes] = await Promise.all([api<User>('/me'), api<Profile>('/profile'), api<{ unread: number }>('/notifications')]);
      if (get().signedIn) set({ user, profile, unread: notes.unread });
    }
  },

  setProfile: (profile) => set({ profile }),
  showToast: (text, tone = 'ok') => {
    set({ toast: { text, tone } });
    setTimeout(() => set({ toast: null }), 3000);
  },
}), {
  name: 'dreamjob.cache',
  storage: createJSONStorage(() => AsyncStorage),
  partialize: (s) => ({ user: s.user, profile: s.profile, meta: s.meta, feed: s.feed }),
}));
