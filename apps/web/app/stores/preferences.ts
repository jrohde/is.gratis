/**
 * Reader preferences kept in localStorage. Hydration is manual (see root.tsx) so the first
 * client render matches the server-rendered HTML.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Language, Region } from '@isgratis/types';

interface PreferencesState {
  region: Region | null;
  lang: Language | null;
  setRegion: (region: Region) => void;
  setLang: (lang: Language) => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      region: null,
      lang: null,
      setRegion: (region) => set({ region }),
      setLang: (lang) => set({ lang }),
    }),
    {
      name: 'isgratis-preferences',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
