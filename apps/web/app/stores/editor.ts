/** Form state of the page editor. */
import { create } from 'zustand';
import type {
  Fact,
  FreeScale,
  PageContent,
  PageImage,
  Region,
  RegionBlock,
  Source,
  TimePrice,
  Verdict,
} from '@isgratis/types';

type TextField = 'summary' | 'whenFree' | 'whenNotFree' | 'background';

interface EditorState {
  title: string;
  content: PageContent;
  editSummary: string;
  dirty: boolean;
  reset: (title: string, content: PageContent) => void;
  /** Replaces everything at once, e.g. after editing the Markdown source. */
  replace: (title: string, content: PageContent) => void;
  setTitle: (title: string) => void;
  setVerdict: (verdict: Verdict) => void;
  setEmoji: (emoji: string) => void;
  setText: (field: TextField, value: string) => void;
  setScale: (scale: FreeScale | undefined) => void;
  setTimePrice: (timePrice: TimePrice | undefined) => void;
  setImage: (image: PageImage | undefined) => void;
  setEditSummary: (value: string) => void;
  addRegion: (region: Region) => void;
  updateRegion: (index: number, patch: Partial<RegionBlock>) => void;
  removeRegion: (index: number) => void;
  addSource: () => void;
  updateSource: (index: number, patch: Partial<Source>) => void;
  removeSource: (index: number) => void;
  addFact: () => void;
  updateFact: (index: number, patch: Partial<Fact>) => void;
  removeFact: (index: number) => void;
  addTrivia: () => void;
  updateTrivia: (index: number, value: string) => void;
  removeTrivia: (index: number) => void;
}

export const emptyContent = (): PageContent => ({
  verdict: 'depends',
  summary: '',
  whenFree: '',
  whenNotFree: '',
  background: '',
  facts: [],
  trivia: [],
  regions: [],
  sources: [],
});

const without = <T extends object, K extends keyof T>(object: T, key: K): Omit<T, K> => {
  const { [key]: _removed, ...rest } = object;
  return rest;
};

export const useEditor = create<EditorState>((set) => {
  const patchContent = (fn: (content: PageContent) => PageContent) =>
    set((state) => ({ content: fn(state.content), dirty: true }));
  return {
    title: '',
    content: emptyContent(),
    editSummary: '',
    dirty: false,
    reset: (title, content) => set({ title, content: structuredClone(content), editSummary: '', dirty: false }),
    replace: (title, content) => set({ title, content, dirty: true }),
    setTitle: (title) => set({ title, dirty: true }),
    setVerdict: (verdict) => patchContent((c) => ({ ...c, verdict })),
    setEmoji: (emoji) => patchContent((c) => (emoji ? { ...c, emoji } : (without(c, 'emoji') as PageContent))),
    setText: (field, value) => patchContent((c) => ({ ...c, [field]: value })),
    setScale: (scale) => patchContent((c) => (scale ? { ...c, scale } : (without(c, 'scale') as PageContent))),
    setTimePrice: (timePrice) =>
      patchContent((c) => (timePrice ? { ...c, timePrice } : (without(c, 'timePrice') as PageContent))),
    setImage: (image) => patchContent((c) => (image ? { ...c, image } : (without(c, 'image') as PageContent))),
    setEditSummary: (editSummary) => set({ editSummary }),
    addRegion: (region) =>
      patchContent((c) => ({ ...c, regions: [...c.regions, { region, verdict: c.verdict, text: '' }] })),
    updateRegion: (index, patch) =>
      patchContent((c) => ({ ...c, regions: c.regions.map((r, i) => (i === index ? { ...r, ...patch } : r)) })),
    removeRegion: (index) => patchContent((c) => ({ ...c, regions: c.regions.filter((_, i) => i !== index) })),
    addSource: () =>
      patchContent((c) => {
        const taken = new Set(c.sources.map((source) => source.id));
        let n = c.sources.length + 1;
        while (taken.has(`bron-${n}`)) n++;
        return { ...c, sources: [...c.sources, { id: `bron-${n}`, title: '', url: 'https://' }] };
      }),
    updateSource: (index, patch) =>
      patchContent((c) => ({ ...c, sources: c.sources.map((s, i) => (i === index ? { ...s, ...patch } : s)) })),
    removeSource: (index) => patchContent((c) => ({ ...c, sources: c.sources.filter((_, i) => i !== index) })),
    addFact: () => patchContent((c) => ({ ...c, facts: [...c.facts, { label: '', value: '' }] })),
    updateFact: (index, patch) =>
      patchContent((c) => ({
        ...c,
        facts: c.facts.map((fact, i) => {
          if (i !== index) return fact;
          const next = { ...fact, ...patch };
          return next.sourceUrl ? next : without(next, 'sourceUrl');
        }),
      })),
    removeFact: (index) => patchContent((c) => ({ ...c, facts: c.facts.filter((_, i) => i !== index) })),
    addTrivia: () => patchContent((c) => ({ ...c, trivia: [...c.trivia, ''] })),
    updateTrivia: (index, value) =>
      patchContent((c) => ({ ...c, trivia: c.trivia.map((item, i) => (i === index ? value : item)) })),
    removeTrivia: (index) => patchContent((c) => ({ ...c, trivia: c.trivia.filter((_, i) => i !== index) })),
  };
});
