import { serveStatic } from '@hono/node-server/serve-static';
import { type Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { HTTPException } from 'hono/http-exception';
import { secureHeaders } from 'hono/secure-headers';
import { type AppEnv, requireSession, sameOriginOnly } from './auth/middleware';
import { type AttemptLimiter, type LoginLimiter, createAttemptLimiter, createLoginLimiter } from './auth/rateLimit';
import type { SetupGate } from './auth/setup';
import type { Db } from './db/client';
import type { CalendarSettings } from './calendars/sync';
import type { PushSettings } from './push/sender';
import { allowanceRoutes } from './routes/allowance';
import { authRoutes } from './routes/auth';
import { calendarRoutes, eventRoutes } from './routes/calendars';
import { demoLimits, demoRoutes } from './routes/demo';
import { inviteRoutes, publicInviteRoutes } from './routes/invites';
import { pushRoutes } from './routes/push';
import { recurrenceRoutes } from './routes/recurrences';
import { setupRoutes } from './routes/setup';
import { shoppingRoutes } from './routes/shopping';
import { taskRoutes } from './routes/tasks';
import { userRoutes } from './routes/users';
import { createTestClock } from './testClock';

type AppOptions = {
  db: Db;
  /** Katalog ze zbudowanym frontem. Bez niego API nie serwuje plików. */
  publicDir?: string;
  /** Cookie tylko przez HTTPS. Wyłączone lokalnie, bo serwer deweloperski działa po http. */
  cookieSecure?: boolean;
  limiter?: LoginLimiter;
  /** Limit złych tokenów na publicznych trasach zaproszeń, na adres klienta. */
  publicLimiter?: AttemptLimiter;
  /** Kod kreatora pierwszego uruchomienia; podaje go `index.ts` tylko przy starcie z pustą bazą. */
  setup?: SetupGate;
  /** Limit złych kodów kreatora na adres klienta. */
  setupLimiter?: AttemptLimiter;
  /** Nagłówek z adresem klienta dla limitu prób logowania. */
  clientIpHeader?: string;
  /** Tryb demo: wejście jednym przyciskiem, limity wierszy, zakaz indeksowania. */
  demo?: boolean;
  /** Kalendarze ICS. Bez ustawień (brak klucza szyfrującego) zapis kalendarzy odpowiada 503. */
  calendars?: CalendarSettings;
  /** Powiadomienia push. Bez ustawień (brak kluczy VAPID, demo) zapis subskrypcji odpowiada 503. */
  push?: PushSettings;
  now?: () => Date;
  /** Tylko do testów e2e: nagłówek `X-Test-Now` ustawia „teraz” dla jednego żądania (`testClock.ts`). */
  testClock?: boolean;
};

/** Największe prawdziwe żądanie to czyszczenie koszyka z 500 identyfikatorami, około 20 kB. */
export const MAX_REQUEST_BYTES = 100 * 1024;

/**
 * Nagłówki bezpieczeństwa dla API i frontu. Wszystko, łącznie z krojami pisma i skryptem motywu, pochodzi z tej
 * samej domeny, więc CSP nie potrzebuje żadnych zewnętrznych źródeł ani skryptów wpisanych w stronę.
 * HSTS należy do tego, kto kończy TLS: na produkcji dodaje go proxy hostingu (docs/archiwum/UTWARDZENIE-PRZEGLAD.md, rozdział 8).
 */
const securityHeaders = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:', 'blob:'],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    workerSrc: ["'self'"],
    manifestSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  },
  xFrameOptions: 'DENY',
  strictTransportSecurity: false,
  permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [] },
});

/** Błędy zgłoszone przez Hono (np. niepoprawny JSON) w postaci kontraktu `{ error }`. */
const HTTP_ERROR_MESSAGES: Partial<Record<number, string>> = {
  400: 'Niepoprawne dane żądania',
  413: 'Za duże żądanie',
};

export function createApp({
  db,
  publicDir,
  cookieSecure = false,
  limiter = createLoginLimiter(),
  publicLimiter = createAttemptLimiter(),
  setup,
  setupLimiter = createAttemptLimiter({ limit: 5 }),
  clientIpHeader = 'X-Real-IP',
  demo = false,
  calendars,
  push,
  now: realNow = () => new Date(),
  testClock = false,
}: AppOptions) {
  const clock = testClock ? createTestClock(realNow) : undefined;
  const now = clock?.now ?? realNow;
  const cookie = { secure: cookieSecure };
  // Jeden limit prób dla logowania i każdego potwierdzenia hasłem: pomyłki w obu miejscach liczą się razem.
  const accounts = { db, limiter, now, push, clientIpHeader, demo, cookie };
  const api = new Hono<AppEnv>();

  if (clock) api.use('*', clock.middleware);
  // Limit przed czymkolwiek innym: dotyczy także tras publicznych, w tym logowania.
  api.use('*', bodyLimit({ maxSize: MAX_REQUEST_BYTES, onError: (c) => c.json({ error: HTTP_ERROR_MESSAGES[413] }, 413) }));
  // Kolejność ma znaczenie: trasy dodane przed requireSession są publiczne.
  api.get('/health', (c) => c.json({ status: 'ok' }));
  api.use('*', sameOriginOnly);
  api.route('/auth', authRoutes(accounts));
  api.route('/invites', publicInviteRoutes({ ...accounts, publicLimiter }));
  // Front pyta o tryb demo i o kreator przed zalogowaniem. Trasa, której nie ma, musi dać zwykłe 404, nie 401, bo 401 wylogowuje.
  const notFound = (c: Context) => c.json({ error: 'Nie znaleziono' }, 404);
  if (demo) {
    api.route('/demo', demoRoutes({ db, cookie, now }));
    // Demo wgrywa dane przy starcie, więc kreatora pierwszego uruchomienia nie ma.
    api.all('/setup', notFound);
  } else {
    api.all('/demo', notFound);
    api.all('/demo/*', notFound);
    api.route('/setup', setupRoutes({ db, now, cookie, clientIpHeader, gate: setup, limiter: setupLimiter }));
  }

  api.use('*', requireSession(db, cookie, now));
  if (demo) api.use('*', demoLimits(db));
  api.route('/tasks', taskRoutes(db, now, push));
  api.route('/users', userRoutes(accounts));
  api.route('/invites', inviteRoutes(accounts));
  api.route('/recurrences', recurrenceRoutes(db, now));
  api.route('/shopping', shoppingRoutes(db, now));
  api.route('/allowance', allowanceRoutes(db, now));
  api.route('/calendars', calendarRoutes({ db, now, settings: calendars, demo }));
  api.route('/push', pushRoutes({ db, now, push }));
  api.route('/events', eventRoutes({ db, now }));
  api.all('*', (c) => c.json({ error: 'Nie znaleziono' }, 404));

  const app = new Hono();
  app.use('*', securityHeaders);
  app.onError((error, c) => {
    if (error instanceof HTTPException) {
      return c.json({ error: HTTP_ERROR_MESSAGES[error.status] ?? 'Coś poszło nie tak' }, error.status);
    }
    // Szczegóły tylko w logu; użytkownik dostaje ogólny komunikat.
    console.error(`[api] nieoczekiwany błąd: ${c.req.method} ${c.req.path}`, error);
    return c.json({ error: 'Coś poszło nie tak' }, 500);
  });
  if (demo) {
    // Demo nie ma trafiać do wyszukiwarek.
    app.use('*', async (c, next) => {
      await next();
      c.header('X-Robots-Tag', 'noindex, nofollow');
    });
    app.get('/robots.txt', (c) => c.text('User-agent: *\nDisallow: /\n'));
  }
  app.route('/api', api);

  if (publicDir) {
    const onFound = (path: string, c: Context) => {
      // Pliki z hashem w nazwie są niezmienne, reszta musi się odświeżać, zwłaszcza sw.js.
      const isHashedAsset = path.replaceAll('\\', '/').includes('/assets/');
      c.header('Cache-Control', isHashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache');
    };

    app.use('*', serveStatic({ root: publicDir, onFound }));
    // Każda inna ścieżka trafia do aplikacji React.
    app.get('*', serveStatic({ root: publicDir, onFound, rewriteRequestPath: () => '/index.html' }));
  }

  return app;
}
