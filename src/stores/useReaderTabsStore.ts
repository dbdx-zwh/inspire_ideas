/**
 * 阅读器多 tab 管理
 * ----------------------------------------
 * - 顶部导航动态显示已打开的论文 tab
 * - 最多同时保留 5 个（LRU 策略）
 * - sessionStorage 持久化，刷新页面 tab 保留
 * - 每个 tab 记录滚动位置以便切换恢复
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ReaderTab {
  paperId: string;
  title: string;
  openedAt: number;
  scrollTop?: number;
}

const MAX_TABS = 5;

interface ReaderTabsState {
  tabs: ReaderTab[];
  openTab: (tab: Omit<ReaderTab, 'openedAt'>) => { evictedTitle?: string };
  closeTab: (paperId: string) => void;
  updateScroll: (paperId: string, scrollTop: number) => void;
  reorderToFront: (paperId: string) => void;
  clear: () => void;
}

export const useReaderTabsStore = create<ReaderTabsState>()(
  persist(
    (set, get) => ({
      tabs: [],

      openTab: (tab) => {
        const existing = get().tabs.find((t) => t.paperId === tab.paperId);
        if (existing) {
          // 已存在，更新 openedAt 保持"最近使用"
          set((state) => ({
            tabs: state.tabs.map((t) =>
              t.paperId === tab.paperId ? { ...t, openedAt: Date.now() } : t
            ),
          }));
          return {};
        }
        // 新增，若超过上限则 LRU 淘汰最早的
        const next = [...get().tabs];
        let evictedTitle: string | undefined;
        if (next.length >= MAX_TABS) {
          next.sort((a, b) => a.openedAt - b.openedAt);
          const evicted = next.shift();
          if (evicted) evictedTitle = evicted.title;
        }
        next.push({ ...tab, openedAt: Date.now() });
        set({ tabs: next });
        return { evictedTitle };
      },

      closeTab: (paperId) => {
        set((state) => ({
          tabs: state.tabs.filter((t) => t.paperId !== paperId),
        }));
      },

      updateScroll: (paperId, scrollTop) => {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.paperId === paperId ? { ...t, scrollTop } : t
          ),
        }));
      },

      reorderToFront: (paperId) => {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.paperId === paperId ? { ...t, openedAt: Date.now() } : t
          ),
        }));
      },

      clear: () => set({ tabs: [] }),
    }),
    {
      name: 'reader-tabs',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);
