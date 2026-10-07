import { NavLink, useLocation, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, ChevronDown, LogOut, Settings, Sparkles, X, LayoutGrid } from 'lucide-react';
import { toast } from 'sonner';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useReaderTabsStore, type ReaderTab } from '@/stores/useReaderTabsStore';
import { useModalStore } from '@/stores/useModalStore';
import { SimpleTooltip } from '@/components/ui/Tooltip';
import { cn } from '@/lib/cn';
import { truncate } from '@/lib/format';
import { useLogout, useMe, USE_MOCK } from '@/hooks/useAuth';

const MAX_VISIBLE_TABS = 3; // 超出后收到"更多"下拉菜单

export function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const params = useParams();
  const currentPaperId = params.paperId as string | undefined;

  const tabs = useReaderTabsStore((s) => s.tabs);
  const closeTab = useReaderTabsStore((s) => s.closeTab);

  // 按最近打开时间排序
  const sortedTabs = [...tabs].sort((a, b) => b.openedAt - a.openedAt);
  const visibleTabs = sortedTabs.slice(0, MAX_VISIBLE_TABS);
  const overflowTabs = sortedTabs.slice(MAX_VISIBLE_TABS);

  const handleCloseTab = (paperId: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    closeTab(paperId);
    // 如果当前在这个 tab 上，切到其他 tab 或 Feed
    if (currentPaperId === paperId) {
      const remaining = tabs.filter((t) => t.paperId !== paperId);
      if (remaining.length > 0) {
        const next = [...remaining].sort((a, b) => b.openedAt - a.openedAt)[0];
        navigate(`/reader/${next.paperId}`);
      } else {
        navigate('/feed');
      }
    }
  };

  return (
    <header className="sticky top-0 z-30 h-14 flex-shrink-0 bg-white/95 backdrop-blur-sm border-b border-border">
      <div className="h-full flex items-center gap-1 px-4">
        {/* Logo */}
        <NavLink
          to="/feed"
          className="flex items-center gap-2 pr-4 mr-2 border-r border-border h-8"
        >
          <div className="flex items-center justify-center h-7 w-7 rounded bg-gradient-to-br from-primary to-ai-purple text-white">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="text-[15px] font-semibold text-text-primary">
            Inspire Ideas
          </span>
        </NavLink>

        {/* 固定入口 */}
        <NavTab to="/feed" icon={<LayoutGrid className="h-4 w-4" />} label="发现" />
        <NavTab
          to="/inspire"
          icon={<BookOpen className="h-4 w-4" />}
          label="归档 · Inspire"
        />

        {/* 分隔线 */}
        {visibleTabs.length > 0 && (
          <div className="mx-2 h-6 w-px bg-border" aria-hidden />
        )}

        {/* 动态阅读器 tab */}
        {visibleTabs.map((tab) => (
          <ReaderTabItem
            key={tab.paperId}
            tab={tab}
            active={currentPaperId === tab.paperId}
            onClose={handleCloseTab}
          />
        ))}

        {/* 溢出 tab 下拉 */}
        {overflowTabs.length > 0 && (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button className="inline-flex items-center gap-1 h-8 px-3 rounded-md text-sm text-text-secondary hover:bg-gray-100 transition-colors">
                更多 <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                className="z-50 min-w-[240px] rounded-md border border-border bg-white shadow-md p-1 animate-fade-in"
                sideOffset={4}
                align="end"
              >
                {overflowTabs.map((tab) => (
                  <DropdownMenu.Item
                    key={tab.paperId}
                    onSelect={() => navigate(`/reader/${tab.paperId}`)}
                    className="flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer hover:bg-gray-100 outline-none data-[highlighted]:bg-gray-100"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-text-tertiary flex-shrink-0" />
                    <span className="flex-1 truncate">{tab.title}</span>
                    <button
                      onClick={(e) => handleCloseTab(tab.paperId, e)}
                      className="text-text-tertiary hover:text-text-primary p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        )}

        {/* 右侧 · 设置 + 用户菜单 */}
        <div className="ml-auto flex items-center gap-2">
          <SimpleTooltip content="设置（大模型配置）">
            <button
              onClick={() => useModalStore.getState().open('settings')}
              className="h-8 w-8 rounded-md flex items-center justify-center text-text-secondary hover:bg-gray-100 hover:text-text-primary transition-colors"
              aria-label="设置"
            >
              <Settings className="h-4 w-4" />
            </button>
          </SimpleTooltip>
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

function NavTab({
  to,
  icon,
  label,
}: {
  to: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium transition-colors',
          isActive
            ? 'bg-primary-light text-primary'
            : 'text-text-secondary hover:bg-gray-100'
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  );
}

function UserMenu() {
  const { data } = useMe();
  const logoutMut = useLogout();
  const navigate = useNavigate();
  const name = USE_MOCK ? 'Demo' : data?.user.name || '?';
  const initial = name.charAt(0).toUpperCase();

  const handleLogout = async () => {
    if (USE_MOCK) {
      toast.info('Mock 模式下无登录状态');
      return;
    }
    await logoutMut.mutateAsync();
    navigate('/login');
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className="h-8 w-8 rounded-full bg-gradient-to-br from-primary/20 to-ai-purple/20 flex items-center justify-center text-primary text-xs font-semibold hover:ring-2 hover:ring-primary/30 transition"
          aria-label="用户菜单"
        >
          {initial}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="z-50 min-w-[160px] rounded-md border border-border bg-white shadow-md p-1 animate-fade-in"
          sideOffset={4}
          align="end"
        >
          <div className="px-2 py-1.5 text-xs text-text-tertiary border-b border-border">
            {USE_MOCK ? 'Mock 模式' : data?.user.email}
          </div>
          {!USE_MOCK && (
            <DropdownMenu.Item
              onSelect={handleLogout}
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm cursor-pointer outline-none data-[highlighted]:bg-gray-100 text-danger"
            >
              <LogOut className="h-3.5 w-3.5" />
              退出登录
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function ReaderTabItem({
  tab,
  active,
  onClose,
}: {
  tab: ReaderTab;
  active: boolean;
  onClose: (paperId: string, e?: React.MouseEvent) => void;
}) {
  const navigate = useNavigate();
  const displayTitle = truncate(tab.title, 22);
  return (
    <SimpleTooltip content={tab.title} delayDuration={500}>
      <div
        role="button"
        onClick={() => navigate(`/reader/${tab.paperId}`)}
        className={cn(
          'group inline-flex items-center gap-1.5 h-8 pl-2.5 pr-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer max-w-[200px]',
          active
            ? 'bg-primary-light text-primary'
            : 'text-text-secondary hover:bg-gray-100'
        )}
      >
        <BookOpen className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="truncate flex-1">{displayTitle}</span>
        <button
          onClick={(e) => onClose(tab.paperId, e)}
          className="flex-shrink-0 h-4 w-4 rounded-sm flex items-center justify-center opacity-60 hover:opacity-100 hover:bg-black/10"
          aria-label="关闭"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </SimpleTooltip>
  );
}
