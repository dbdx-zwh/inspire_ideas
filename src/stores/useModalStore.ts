/**
 * 全局弹窗状态
 * ----------------------------------------
 * 用 store 而非 URL query 管理弹窗开关，简单直接；
 * 弹窗打开时挂载遮罩，不影响下方页面的滚动位置。
 */

import { create } from 'zustand';

export type ModalName = 'bloggers' | 'archive' | 'settings' | null;

interface ModalState {
  active: ModalName;
  /** archive 弹窗需要携带待归档论文 id */
  archivePaperId: string | null;
  open: (name: Exclude<ModalName, null>, payload?: { paperId?: string }) => void;
  close: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  active: null,
  archivePaperId: null,
  open: (name, payload) =>
    set({
      active: name,
      archivePaperId: payload?.paperId ?? null,
    }),
  close: () =>
    set({
      active: null,
      archivePaperId: null,
    }),
}));
