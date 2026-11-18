import { defineConfig } from 'vitest/config';

// Osobna konfiguracja, żeby testy nie ładowały wtyczek z vite.config.ts (PWA, Tailwind).
// Testy jednostkowe frontu biegną w Node; IndexedDB daje im `fake-indexeddb`.
// Pokrycie: tylko logika bez widoku (komponenty sprawdza e2e). `packages/shared` liczy raport API,
// bo dwa osobne wyniki tego samego pliku tylko by się myliły. Opis: docs/plany/TESTY.md.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // Pliki `api.ts` i `hooks.ts` to cienkie opakowania TanStack Query, które przechodzi e2e.
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/features/*/api.ts', 'src/features/*/hooks.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      // Podłoga tuż pod bieżącym stanem i wyższa dla kolejki zakupów (docs/plany/TESTY.md).
      thresholds: {
        lines: 74,
        statements: 72,
        branches: 72,
        functions: 73,
        'src/features/shopping/sync.ts': { lines: 86, branches: 77 },
      },
    },
  },
});
