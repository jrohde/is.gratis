/**
 * The sky above the visitor, for the live logo. The server renders a fixed night sky; the browser
 * switches to the real one after loading and updates it every ten minutes.
 */
import { create } from 'zustand';
import { skyAt, STATIC_SKY, type SkyState } from '@isgratis/types';

interface SkyStore {
  state: SkyState;
  live: boolean;
  refresh: () => void;
}

export const useSky = create<SkyStore>((set) => ({
  state: STATIC_SKY,
  live: false,
  refresh: () => {
    let timeZone: string | undefined;
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      timeZone = undefined;
    }
    set({ state: skyAt(new Date(), timeZone), live: true });
  },
}));
