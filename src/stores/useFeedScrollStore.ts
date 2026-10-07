/**
 * Feed 滚动位置持久化
 * ----------------------------------------
 * 从 Feed 跳阅读器再回来时保持原滚动位置；
 * 打开弹窗（用 Modal Portal 挂 body 之外）不会影响主页面滚动，所以
 * 这里只处理路由跳转的场景。
 */

import { create } from 'zustand';

interface FeedScrollState {
  scrollTop: number;
  cursor: string | null;
  set: (patch: Partial<{ scrollTop: number; cursor: string | null }>) => void;
}

export const useFeedScrollStore = create<FeedScrollState>((set) => ({
  scrollTop: 0,
  cursor: null,
  set: (patch) => set(patch),
}));
