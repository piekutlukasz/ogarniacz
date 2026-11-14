import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { type Db, openDatabase } from './db/client';

/**
 * Test przekrojowy: każda trasa API poza jawnie publicznymi odpowiada bez sesji `401`.
 * Trasy zbieramy z samej aplikacji, więc nowa trasa dodana przez pomyłkę przed `requireSession`
 * w `app.ts` nie przejdzie niezauważona. Nowa trasa publiczna wymaga świadomego wpisu na listę poniżej.
 */
const PUBLIC_ROUTES = [
  'GET /api/health',
  'POST /api/auth/login',
  'POST /api/auth/logout',
  // Zaproszenia: token w treści żądania, limit złych tokenów na adres (docs/plany/KONTA.md).
  'POST /api/invites/preview',
  'POST /api/invites/accept',
];
/** Kreator pierwszego uruchomienia: tylko poza demo, a i tak 404, gdy baza ma konta albo brak kodu (docs/plany/KONTA.md). */
const PUBLIC_SETUP_ROUTES = ['GET /api/setup', 'POST /api/setup'];
/** W trybie demo dochodzi wejście jednym przyciskiem; poza demo te ścieżki dają 404. */
const PUBLIC_DEMO_ROUTES = ['GET /api/demo', 'POST /api/demo/login'];

let db: Db;
let close: () => void;

beforeEach(() => {
  ({ db, close } = openDatabase(':memory:', './drizzle'));
});

afterEach(() => close());

/** Trasy z obsługą (bez middleware na `*`), z parametrami zamienionymi na przykładowe wartości. */
function apiRoutes(app: ReturnType<typeof createApp>) {
  const routes = new Set<string>();
  for (const { method, path } of app.routes) {
    if (!path.startsWith('/api/') || path.includes('*') || method === 'ALL') continue;
    routes.add(`${method} ${path}`);
  }
  return [...routes];
}

function request(app: ReturnType<typeof createApp>, route: string) {
  const [method = 'GET', path = ''] = route.split(' ');
  const url = path.replace(/:[^/]+/g, '00000000-0000-4000-8000-000000000000');
  const hasBody = !['GET', 'HEAD'].includes(method);
  return app.request(url, {
    method,
    ...(hasBody ? { headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}),
  });
}

describe.each([
  { name: 'zwykły serwer', demo: false, publicRoutes: [...PUBLIC_ROUTES, ...PUBLIC_SETUP_ROUTES] },
  { name: 'tryb demo', demo: true, publicRoutes: [...PUBLIC_ROUTES, ...PUBLIC_DEMO_ROUTES] },
])('trasy bez sesji: $name', ({ demo, publicRoutes }) => {
  it('lista tras jest pełna: zawiera wszystkie trasy publiczne i dziesiątki chronionych', () => {
    const routes = apiRoutes(createApp({ db, demo }));

    expect(routes).toEqual(expect.arrayContaining(publicRoutes));
    expect(routes.length).toBeGreaterThan(25);
  });

  it('każda trasa poza publicznymi odpowiada 401', async () => {
    const app = createApp({ db, demo });
    const unprotected: string[] = [];

    for (const route of apiRoutes(app)) {
      if (publicRoutes.includes(route)) continue;
      const response = await request(app, route);
      if (response.status !== 401) unprotected.push(`${route} → ${response.status}`);
    }

    expect(unprotected).toEqual([]);
  });
});

it('w trybie demo kreatora pierwszego uruchomienia nie ma na liście tras', () => {
  const routes = apiRoutes(createApp({ db, demo: true }));
  expect(routes.filter((route) => route.includes('/api/setup'))).toEqual([]);
});
