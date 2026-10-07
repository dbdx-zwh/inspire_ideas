/**
 * Inspire 页跨目录累积勾选状态
 * ----------------------------------------
 * 切换目录浏览不清空、切换视图不清空、页面卸载才清空。
 */

import { create } from 'zustand';

export interface SelectedPaperRef {
  id: string;
  title: string;
}

interface SelectionState {
  /** paperId -> 最小论文快照；Idea 生成只需要 id，Chip 只需要 title。 */
  selected: Map<string, SelectedPaperRef>;
  add: (paper: SelectedPaperRef) => void;
  remove: (paperId: string) => void;
  toggle: (paper: SelectedPaperRef) => void;
  clear: () => void;
  isSelected: (paperId: string) => boolean;
  count: () => number;
  list: () => SelectedPaperRef[];
}

export const useSelectionStore = create<SelectionState>((set, get) => ({
  selected: new Map(),
  add: (paper) => {
    set((state) => {
      const next = new Map(state.selected);
      next.set(paper.id, paper);
      return { selected: next };
    });
  },
  remove: (paperId) => {
    set((state) => {
      const next = new Map(state.selected);
      next.delete(paperId);
      return { selected: next };
    });
  },
  toggle: (paper) => {
    set((state) => {
      const next = new Map(state.selected);
      if (next.has(paper.id)) next.delete(paper.id);
      else next.set(paper.id, paper);
      return { selected: next };
    });
  },
  clear: () => set({ selected: new Map() }),
  isSelected: (paperId) => get().selected.has(paperId),
  count: () => get().selected.size,
  list: () => Array.from(get().selected.values()),
}));
