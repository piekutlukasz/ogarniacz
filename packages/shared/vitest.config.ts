import { defineConfig } from 'vitest/config';

// Własne testy reguł wspólnych dla telefonu i serwera, w tym testy właściwości (fast-check).
// Raport pokrycia API też liczy te pliki; ten mówi, co sprawdzają testy samego `shared`. Opis: docs/plany/TESTY.md.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // `index.ts` to same ponowne eksporty.
      exclude: ['src/**/*.test.ts', 'src/index.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      // Podłoga tuż pod stanem z 18 listopada 2026; pliki z samymi schematami Zod sprawdzają testy API.
      thresholds: { lines: 90, statements: 90, branches: 98, functions: 84 },
    },
  },
});
