import { type Page, expect, test } from '@playwright/test';
import { SMOKE_USER } from '../src/data/users';
import { LoginPage } from '../src/pages/LoginPage';

// Test dymny zbudowanej aplikacji. Zwykłe `test` z Playwright zamiast fixture'ów z src/fixtures: ten serwer
// ma własną jednorazową bazę z jednym kontem, bez aktorów i bez sesji zapisanych przez projekt `setup`.

/** Zbiera naruszenia CSP z konsoli, żeby test złapał zablokowany skrypt, styl albo czcionkę. */
function collectCspViolations(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) violations.push(message.text());
  });
  return violations;
}

/** Czeka, aż service worker aplikacji przejmie stronę; zwraca adres jego skryptu. */
async function waitForServiceWorker(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    }
    return registration.active?.scriptURL ?? '';
  });
}

test('zbudowana aplikacja loguje i pokazuje „Dziś” bez naruszeń CSP', async ({ page }) => {
  const violations = collectCspViolations(page);
  const login = new LoginPage(page);

  const demoInfo = page.waitForResponse((answer) => new URL(answer.url()).pathname === '/api/demo');
  const response = await page.goto('/');
  expect(response?.headers()['content-security-policy']).toContain("default-src 'self'");
  // Wejście bez hasła istnieje tylko w trybie demo (smoke/demo.spec.ts). Poza nim `/api/demo` nie odpowiada
  // listą kont, a ekran logowania, gdy już wie, że to nie demo, nie pokazuje wyboru kont.
  expect((await demoInfo).ok()).toBe(false);
  await expect(login.submitButton).toBeVisible();
  await expect(login.demoChooser).toHaveCount(0);

  const app = await login.logInAs(SMOKE_USER);
  await expect(app.today.navButton).toHaveAttribute('aria-current', 'page');
  await app.shopping.open();
  await app.today.open();

  expect(violations).toEqual([]);
});

test('service worker przejmuje aplikację, a ta otwiera się bez sieci z zapamiętaną osobą', async ({ page, context }) => {
  const login = new LoginPage(page);
  await login.goto();
  const app = await login.logInAs(SMOKE_USER);

  expect(await waitForServiceWorker(page)).toMatch(/\/app-sw\.js$/);

  await context.setOffline(true);
  await page.reload();
  await expect(app.shell.signedInAs(SMOKE_USER.name)).toBeVisible();
  await app.shopping.open();
  await expect(app.shopping.syncNote).toContainText('Brak internetu');
  await context.setOffline(false);
});

test('pliki z hashem są niezmienne, a service worker i strona zawsze świeże', async ({ request }) => {
  const index = await request.get('/');
  expect(index.headers()['cache-control']).toBe('no-cache');
  const script = /src="(\/assets\/[^"]+\.js)"/.exec(await index.text())?.[1];
  expect(script).toBeDefined();

  expect((await request.get(script ?? '')).headers()['cache-control']).toContain('immutable');
  expect((await request.get('/app-sw.js')).headers()['cache-control']).toBe('no-cache');
  expect((await request.get('/theme.js')).headers()['cache-control']).toBe('no-cache');
  // Nieznana ścieżka frontu dostaje aplikację, a nieznana ścieżka API zwykły błąd JSON.
  expect((await request.get('/jakis-ekran')).headers()['content-type']).toContain('text/html');
  expect((await request.get('/api/nie-ma-takiej')).status()).toBe(401);
});
