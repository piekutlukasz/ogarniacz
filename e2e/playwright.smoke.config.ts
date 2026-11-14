import { defineConfig, devices } from '@playwright/test';

// Test dymny (T1 w docs/plany/UTWARDZENIE.md): zbudowana aplikacja zamiast serwera Vite, więc sprawdza to,
// czego zwykłe e2e nie widzą: service worker, start bez sieci, front serwowany przez API i nagłówki.
// Drugi serwer to ta sama aplikacja w trybie demo (T7), z własnymi projektami i scenariuszami w smoke/demo.spec.ts.
// Dwa kolejne serwery startują z pustą bazą (kreator pierwszego uruchomienia, docs/plany/KONTA.md): kod działa raz
// na start serwera, więc każdy telefon ma swój. Scenariusze w smoke/setup.spec.ts, projekty `setup-iphone` i `setup-android`.
// Wymaga `npm run build`. Własne porty i jednorazowe bazy, więc biegnie obok `npm run dev` i zwykłych e2e.
const PORT = 3090;
const DEMO_PORT = 3091;
const SETUP_IPHONE_PORT = 3092;
const SETUP_ANDROID_PORT = 3093;
// Adres IPv4 wprost: API nasłuchuje tylko na 127.0.0.1, a `localhost` bywa rozwiązywany na ::1.
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DEMO_URL = `http://127.0.0.1:${DEMO_PORT}`;
const DEMO_SPEC = 'demo.spec.ts';
const SETUP_SPEC = 'setup.spec.ts';
const url = (port: number) => `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './smoke',
  outputDir: './test-results/smoke',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never', outputFolder: './playwright-report/smoke' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'iphone', testIgnore: [DEMO_SPEC, SETUP_SPEC], use: { ...devices['iPhone 15'] } },
    { name: 'android', testIgnore: [DEMO_SPEC, SETUP_SPEC], use: { ...devices['Pixel 7'] } },
    { name: 'demo-iphone', testMatch: DEMO_SPEC, use: { ...devices['iPhone 15'], baseURL: DEMO_URL } },
    { name: 'demo-android', testMatch: DEMO_SPEC, use: { ...devices['Pixel 7'], baseURL: DEMO_URL } },
    { name: 'setup-iphone', testMatch: SETUP_SPEC, use: { ...devices['iPhone 15'], baseURL: url(SETUP_IPHONE_PORT) } },
    { name: 'setup-android', testMatch: SETUP_SPEC, use: { ...devices['Pixel 7'], baseURL: url(SETUP_ANDROID_PORT) } },
  ],
  webServer: [
    {
      command: 'node e2e/src/setup/smokeServer.mjs',
      cwd: '..',
      url: `${BASE_URL}/api/health`,
      reuseExistingServer: false,
      env: { SMOKE_PORT: String(PORT) },
    },
    {
      command: 'node e2e/src/setup/smokeServer.mjs',
      cwd: '..',
      url: `${DEMO_URL}/api/health`,
      reuseExistingServer: false,
      env: { SMOKE_PORT: String(DEMO_PORT), SMOKE_DEMO: 'true' },
    },
    ...[SETUP_IPHONE_PORT, SETUP_ANDROID_PORT].map((port) => ({
      command: 'node e2e/src/setup/smokeServer.mjs',
      cwd: '..',
      url: `${url(port)}/api/health`,
      reuseExistingServer: false,
      env: { SMOKE_PORT: String(port), SMOKE_EMPTY: 'true' },
    })),
  ],
});
