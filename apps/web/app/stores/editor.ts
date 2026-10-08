/** Form state of the page editor. */
import { create } from 'zustand';
import type { PageContent, Region, RegionBlock, Source, Verdict } from '@isgratis/types';

type TextField = 'summary' | 'whenFree' | 'whenNotFree';

interface EditorState {
  title: string;
  content: PageContent;
  editSummary: string;
  dirty: boolean;
  reset: (title: string, content: PageContent) => void;
  setTitle: (title: string) => void;
  setVerdict: (verdict: Verdict) => void;
  setText: (field: TextField, value: string) => void;
  setEditSummary: (value: string) => void;
  addRegion: (region: Region) => void;
  updateRegion: (index: number, patch: Partial<RegionBlock>) => void;
  removeRegion: (index: number) => void;
  addSource: () => void;
  updateSource: (index: number, patch: Partial<Source>) => void;
  removeSource: (index: number) => void;
}

export const emptyContent = (): PageContent => ({
  verdict: 'depends',
  summary: '',
  whenFree: '',
  whenNotFree: '',
  regions: [],
  sources: [],
});

export const useEditor = create<EditorState>((set) => {
  const patchContent = (fn: (content: PageContent) => PageContent) =>
    set((state) => ({ content: fn(state.content), dirty: true }));
  return {
    title: '',
    content: emptyContent(),
    editSummary: '',
    dirty: false,
    reset: (title, content) => set({ title, content: structuredClone(content), editSummary: '', dirty: false }),
    setTitle: (title) => set({ title, dirty: true }),
    setVerdict: (verdict) => patchContent((c) => ({ ...c, verdict })),
    setText: (field, value) => patchContent((c) => ({ ...c, [field]: value })),
    setEditSummary: (editSummary) => set({ editSummary }),
    addRegion: (region) =>
      patchContent((c) => ({ ...c, regions: [...c.regions, { region, verdict: c.verdict, text: '' }] })),
    updateRegion: (index, patch) =>
      patchContent((c) => ({ ...c, regions: c.regions.map((r, i) => (i === index ? { ...r, ...patch } : r)) })),
    removeRegion: (index) => patchContent((c) => ({ ...c, regions: c.regions.filter((_, i) => i !== index) })),
    addSource: () => patchContent((c) => ({ ...c, sources: [...c.sources, { title: '', url: 'https://' }] })),
    updateSource: (index, patch) =>
      patchContent((c) => ({ ...c, sources: c.sources.map((s, i) => (i === index ? { ...s, ...patch } : s)) })),
    removeSource: (index) => patchContent((c) => ({ ...c, sources: c.sources.filter((_, i) => i !== index) })),
  };
});
