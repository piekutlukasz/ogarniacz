import { expect, test } from '@playwright/test';
import { DEMO_CHILD, DEMO_PARENT, DEMO_SECOND_PARENT } from '../src/data/users';
import { LoginPage } from '../src/pages/LoginPage';

// Tryb demo (T7 w docs/archiwum/UTWARDZENIE-PRZEGLAD.md) na zbudowanej aplikacji: serwer z DEMO_MODE=true na porcie 3091
// sam wgrywa dane przykładowe. Projekty `demo-iphone` i `demo-android` biegną naraz na tej samej bazie,
// więc scenariusze niczego nie zmieniają, tylko się logują i oglądają.
// Reset o pełnej godzinie wylogowuje wszystkich: test, który na niego trafi, w CI przejdzie przy ponownej próbie.

test('rodzic wchodzi jednym przyciskiem i widzi baner oraz dane przykładowe', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();
  await expect(login.demoChooser).toBeVisible();
  for (const user of [DEMO_PARENT, DEMO_SECOND_PARENT, DEMO_CHILD]) {
    await expect(login.demoAccount(user)).toBeVisible();
  }

  const app = await login.enterDemoAs(DEMO_PARENT);
  await expect(app.shell.demoBanner).toBeVisible();
  await expect(app.recurrences.navButton).toBeVisible();
  await app.shopping.open();
  await expect(app.shopping.toBuy('Mleko').root).toBeVisible();
});

test('dziecko wchodzi jednym przyciskiem i nie widzi ekranów rodzica', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();

  const app = await login.enterDemoAs(DEMO_CHILD);
  await expect(app.shell.demoBanner).toBeVisible();
  await expect(app.recurrences.navButton).toHaveCount(0);
});

test('hasło demo działa także w zwykłym formularzu', async ({ page }) => {
  const login = new LoginPage(page);
  await login.goto();

  const app = await login.logInAs(DEMO_SECOND_PARENT);
  await expect(app.shell.demoBanner).toBeVisible();

  // Konta demo są wspólne dla gości, więc zmiany hasła i wylogowania innych urządzeń nie ma (API odpowiada 403).
  const settings = await app.shell.openSettings();
  await expect(settings.logoutButton).toBeVisible();
  await expect(settings.passwordSection).toHaveCount(0);
});

test('bez hasła wpuszcza tylko na konta przykładowe, a demo nie trafia do wyszukiwarek', async ({ request }) => {
  const stranger = await request.post('/api/demo/login', { data: { login: 'admin' } });
  expect(stranger.status()).toBe(404);

  expect((await request.get('/')).headers()['x-robots-tag']).toBe('noindex, nofollow');
  expect(await (await request.get('/robots.txt')).text()).toContain('Disallow: /');
});
