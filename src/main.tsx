import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import App from './App';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';

async function bootstrap() {
  // MSW 仅在开启 Mock 时启动
  if (import.meta.env.DEV && USE_MOCK) {
    const { worker } = await import('./mocks/browser');
    await worker.start({
      onUnhandledRequest: 'bypass',
      serviceWorker: { url: '/mockServiceWorker.js' },
    });
    console.info('[Inspire] 🎭 MSW enabled — using mock data');
  } else if (import.meta.env.DEV) {
    console.info(
      `[Inspire] 🌐 Live backend mode — ${import.meta.env.VITE_API_BASE_URL || '/api'}`
    );
  }

  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
          <Toaster position="top-right" richColors closeButton />
        </BrowserRouter>
      </QueryClientProvider>
    </React.StrictMode>
  );
}

bootstrap();
