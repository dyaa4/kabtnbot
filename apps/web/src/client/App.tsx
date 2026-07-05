import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { I18nProvider } from './i18n.js';
import { Landing } from './pages/Landing.js';
import { GuildList } from './pages/GuildList.js';
import { GuildView } from './pages/GuildView.js';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } });

export function App() {
  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/app" element={<GuildList />} />
            <Route path="/app/:guildId/*" element={<GuildView />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </I18nProvider>
  );
}
