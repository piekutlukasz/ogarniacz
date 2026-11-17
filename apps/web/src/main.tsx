import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ME_KEY, cacheMe } from './features/auth/api';
import { UnauthorizedError } from './lib/http';
import { applyThemePreference, readThemePreference } from './lib/theme';
import './index.css';

// Gdy sesja wygaśnie w trakcie używania, każde żądanie dostaje 401. Wtedy pokazujemy ekran logowania.
function handleError(error: Error) {
  if (error instanceof UnauthorizedError) {
    // Żądania, które były już w drodze, też dostają 401. Ekran logowania jest już wtedy pokazany, a ponowne
    // czyszczenie usunęłoby trwające sprawdzenie kreatora i aplikacja zostałaby na „Wczytuję…”.
    if (queryClient.getQueryData(ME_KEY) === null) return;
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== ME_KEY[0] });
    queryClient.setQueryData(ME_KEY, null);
    // Kolejka zakupów zostaje: po ponownym zalogowaniu tej samej osoby zmiany pójdą na serwer.
    cacheMe(null);
  }
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: handleError }),
  mutationCache: new MutationCache({ onError: handleError }),
  defaultOptions: {
    queries: { retry: (count, error) => !(error instanceof UnauthorizedError) && count < 2 },
  },
});

// Motyw na <html> ustawia już public/theme.js. Tu dochodzi kolor paska stanu.
applyThemePreference(readThemePreference());

const root = document.getElementById('root');
if (!root) {
  throw new Error('Brak elementu #root');
}

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
