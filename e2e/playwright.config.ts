import { defineConfig, devices } from '@playwright/test';

// Własne porty, inne niż w `npm run dev`: testy zawsze startują swój serwer z bazą e2e
// i nie trafiają w serwer deweloperski, który akurat działa, także z innego worktree.
const WEB_PORT = 5180;
const API_PORT = 3080;
const BASE_URL = `http://localhost:${WEB_PORT}`;
// Serwer z plikami ICS dla testów kalendarzy, patrz src/setup/icsServer.mjs.
const ICS_PORT = 5199;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // W CI dodatkowo adnotacje w PR (także testy zaliczone dopiero za drugim razem) i raport HTML do archiwum po błędzie.
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Zakłada konta testowe i zapisuje ich sesje, z których korzystają fixture'y `parent` i `child`.
    { name: 'setup', testMatch: /.*\.setup\.ts/ },
    { name: 'iphone', use: { ...devices['iPhone 15'] }, dependencies: ['setup'] },
    { name: 'android', use: { ...devices['Pixel 7'] }, dependencies: ['setup'] },
  ],
  webServer: [
    {
      command: 'node e2e/src/setup/icsServer.mjs',
      cwd: '..',
      url: `http://127.0.0.1:${ICS_PORT}/health`,
      reuseExistingServer: false,
      env: { ICS_PORT: String(ICS_PORT) },
    },
    {
      command: 'npm run dev',
      cwd: '..',
      url: BASE_URL,
      // Serwer na tym porcie mógłby mieć inny kod albo inną bazę, więc zajęty port kończy testy błędem.
      reuseExistingServer: false,
      env: {
        // Ta sama baza co w src/setup/seedUsers.ts.
        DATABASE_PATH: './data/e2e.db',
        PORT: String(API_PORT),
        WEB_PORT: String(WEB_PORT),
        // Kalendarze: klucz tylko do testów, lokalny serwer ICS jako jedyny dozwolony host (poza Google i iCloud),
        // a http wolno wyłącznie tutaj. Na produkcji konfiguracja odmawia startu z CALENDAR_ALLOW_HTTP.
        CALENDAR_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
        CALENDAR_ALLOWED_HOSTS: `127.0.0.1:${ICS_PORT}`,
        CALENDAR_ALLOW_HTTP: 'true',
        // Zegar sterowany nagłówkiem X-Test-Now, osobno w każdym żądaniu (Actor.setServerTime). Na produkcji zabroniony.
        TEST_CLOCK: 'true',
        // Powiadomienia: klucze tylko do pokazania sekcji w ustawieniach. Nic nie jest wysyłane, bo testy nie dają zgody.
        VAPID_PUBLIC_KEY: 'B'.repeat(87),
        VAPID_PRIVATE_KEY: 'k'.repeat(43),
        VAPID_SUBJECT: 'mailto:e2e@example.com',
      },
    },
  ],
});
