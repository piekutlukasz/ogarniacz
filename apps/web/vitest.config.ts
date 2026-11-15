import { defineConfig } from 'vitest/config';

// Osobna konfiguracja, żeby testy nie ładowały wtyczek z vite.config.ts (PWA, Tailwind).
// Testy jednostkowe frontu biegną w Node; IndexedDB daje im `fake-indexeddb`.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
