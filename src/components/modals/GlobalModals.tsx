/**
 * 全局弹窗容器
 * ----------------------------------------
 * 所有跨页可能弹起的 Modal 挂载于此，通过 useModalStore 控制显隐。
 */

import { BloggerModal } from './BloggerModal';
import { ArchiveModal } from './ArchiveModal';
import { SettingsModal } from './SettingsModal';

export function GlobalModals() {
  return (
    <>
      <BloggerModal />
      <ArchiveModal />
      <SettingsModal />
    </>
  );
}
