import { defineConfig } from 'vitest/config';

// Pokrycie liczy także `packages/shared`: API importuje jego źródła TypeScript, więc testy API
// pokazują, których reguł wspólnych żaden test nie dotyka. Opis i progi: docs/plany/TESTY.md.
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      allowExternal: true,
      include: ['src/**/*.ts', '../../packages/shared/src/**/*.ts'],
      // `index.ts` w shared to same ponowne eksporty.
      exclude: ['src/**/*.test.ts', '../../packages/shared/src/index.ts'],
      reporter: ['text-summary', 'html', 'json-summary'],
      // Progi to podłoga tuż pod bieżącym stanem (18 listopada 2026): pokrycie może rosnąć, spadek kończy CI błędem.
      // Wyższe progi mają uprawnienia i trasy, bo to w nich błąd wpuszcza obcą osobę albo psuje dane.
      thresholds: {
        lines: 83,
        statements: 82,
        branches: 77,
        functions: 81,
        'src/auth/**': { lines: 95, branches: 88 },
        'src/routes/**': { lines: 97, branches: 89 },
      },
    },
  },
});
