import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { TopNav } from '@/components/layout/TopNav';
import { FeedPage } from '@/pages/FeedPage';
import { ReaderPage } from '@/pages/ReaderPage';
import { InspirePage } from '@/pages/InspirePage';
import { LoginPage } from '@/pages/LoginPage';
import { GlobalModals } from '@/components/modals/GlobalModals';
import { useMe, USE_MOCK } from '@/hooks/useAuth';

export default function App() {
  const location = useLocation();
  const { data, isLoading, isError } = useMe();

  // Mock 模式下不需要登录；真实后端模式下未登录跳登录页
  const authed = USE_MOCK || (!!data && !isError);

  if (!USE_MOCK && isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-text-tertiary">
        Loading...
      </div>
    );
  }

  if (!authed && location.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }

  if (authed && location.pathname === '/login') {
    return <Navigate to="/feed" replace />;
  }

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden">
      {location.pathname !== '/login' && <TopNav />}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Navigate to="/feed" replace />} />
          <Route path="/feed" element={<FeedPage />} />
          <Route path="/reader/:paperId" element={<ReaderPage />} />
          <Route path="/inspire" element={<InspirePage />} />
          <Route path="*" element={<Navigate to="/feed" replace />} />
        </Routes>
      </main>
      {location.pathname !== '/login' && <GlobalModals />}
    </div>
  );
}
