/**
 * The logged in user. Loaded in the browser from /api/auth/me, so server-rendered HTML is the
 * same for everyone and can be cached by Varnish.
 */
import { create } from 'zustand';
import type { User } from '@isgratis/types';
import { api } from '~/lib/api.client';

interface SessionState {
  user: User | null;
  loaded: boolean;
  load: () => Promise<void>;
  login: (email: string, password: string) => Promise<User>;
  register: (email: string, password: string, displayName: string) => Promise<User>;
  logout: () => Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  loaded: false,
  load: async () => {
    if (get().loaded) return;
    try {
      const { user } = await api<{ user: User | null }>('GET', '/auth/me');
      set({ user, loaded: true });
    } catch {
      set({ user: null, loaded: true });
    }
  },
  login: async (email, password) => {
    const { user } = await api<{ user: User }>('POST', '/auth/login', { email, password });
    set({ user, loaded: true });
    return user;
  },
  register: async (email, password, displayName) => {
    const { user } = await api<{ user: User }>('POST', '/auth/register', { email, password, displayName });
    set({ user, loaded: true });
    return user;
  },
  logout: async () => {
    await api('POST', '/auth/logout');
    set({ user: null });
  },
}));
