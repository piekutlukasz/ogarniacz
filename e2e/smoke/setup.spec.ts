import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { SETUP_PARENT } from '../src/data/users';
import { App } from '../src/pages/App';
import { LoginPage } from '../src/pages/LoginPage';
import { SetupPage } from '../src/pages/SetupPage';
import { setupCodeFile } from '../src/setup/setupCode.mjs';

// Kreator pierwszego uruchomienia (docs/plany/KONTA.md, krok 3) na zbudowanej aplikacji z pustą bazą. Każdy projekt
// (`setup-iphone`, `setup-android`) ma własny serwer, bo kod działa raz na start serwera, a po założeniu konta kreator znika.
// Z tego samego powodu bez ponownej próby: druga trafiłaby na bazę z kontem.
test.describe.configure({ retries: 0 });

/** Kod z logu serwera; smokeServer.mjs zapisuje go do pliku zaraz po starcie. */
async function setupCode(baseURL: string | undefined): Promise<string> {
  const file = setupCodeFile(new URL(baseURL ?? '').port);
  let code = '';
  await expect
    .poll(() => {
      try {
        code = readFileSync(file, 'utf8').trim();
      } catch {
        code = '';
      }
      return code;
    }, { message: `kod pierwszego uruchomienia w ${file}` })
    .not.toBe('');
  return code;
}

test('pierwszy rodzic zakłada konto kreatorem, a potem kreator znika', async ({ page, request, baseURL }) => {
  const code = await setupCode(baseURL);
  const setup = new SetupPage(page);
  await setup.goto();
  await expect(setup.heading).toBeVisible();
  await expect(new LoginPage(page).submitButton).toHaveCount(0);

  await setup.submit({ ...SETUP_PARENT, code: 'AAAA-2222' });
  await expect(setup.alert).toContainText('Nieprawidłowy kod pierwszego uruchomienia');

  // Kod przepisany z logu małymi literami też przechodzi.
  await setup.codeInput.fill(code.toLowerCase());
  await setup.submitButton.click();

  // Po założeniu konta ustawienia otwierają się od razu na „Rodzinie”, żeby zaprosić pozostałych.
  const app = new App(page);
  await expect(app.shell.signedInAs(SETUP_PARENT.name)).toBeVisible();
  await expect(app.shell.family.root).toBeVisible();
  await expect(app.shell.family.account(SETUP_PARENT.name)).toBeVisible();
  await expect(app.shell.family.inviteButton).toBeVisible();

  expect((await request.get('/api/setup')).status()).toBe(404);
  expect((await request.post('/api/setup', { data: { ...SETUP_PARENT, code } })).status()).toBe(404);

  await app.shell.settings.closeButton.click();
  await app.shell.logOut();
  const login = new LoginPage(page);
  await expect(login.submitButton).toBeVisible();
  await expect(setup.heading).toHaveCount(0);
  await login.logInAs(SETUP_PARENT);
});
