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
  /** Mark claims without a source, like Wikipedia's "citation needed". On by default. */
  highlightUnsourced: boolean;
  setRegion: (region: Region) => void;
  setLang: (lang: Language) => void;
  setHighlightUnsourced: (value: boolean) => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      region: null,
      lang: null,
      highlightUnsourced: true,
      setRegion: (region) => set({ region }),
      setLang: (lang) => set({ lang }),
      setHighlightUnsourced: (highlightUnsourced) => set({ highlightUnsourced }),
    }),
    {
      name: 'isgratis-preferences',
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    },
  ),
);
