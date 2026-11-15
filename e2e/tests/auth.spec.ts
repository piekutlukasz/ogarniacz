import { expect, test } from '../src/fixtures';
import { PARENT } from '../src/data/users';

// Logowanie przez formularz na świeżej karcie, bez zapisanych sesji aktorów.
test.beforeEach(async ({ loginPage }) => {
  await loginPage.goto();
});

test('bez logowania widać tylko ekran logowania', async ({ loginPage, app }) => {
  await expect(loginPage.submitButton).toBeVisible();
  await expect(app.shell.navigation).toBeHidden();
  await expect(app.board.titleInput).toBeHidden();
});

test('złe hasło pokazuje komunikat', async ({ loginPage }) => {
  await loginPage.submit(PARENT.login, 'to-nie-jest-haslo');

  await expect(loginPage.error).toHaveText('Nieprawidłowy login lub hasło');
});

test('sesja przetrwa odświeżenie, a wylogowanie ją kończy', async ({ loginPage, page }) => {
  const app = await loginPage.logInAs(PARENT);

  await page.reload();
  await expect(app.shell.navigation).toBeVisible();

  await app.shell.logOut();
  await expect(loginPage.submitButton).toBeVisible();

  await page.reload();
  await expect(loginPage.submitButton).toBeVisible();
});

test('po kilku złych hasłach logowanie jest zablokowane z komunikatem', async ({ loginPage }, testInfo) => {
  // Blokada dotyczy loginu, więc test używa własnego, nieistniejącego loginu i nie blokuje kont innych testów.
  const login = `e2e-blokada-${testInfo.project.name}-${Math.random().toString(36).slice(2, 8)}`;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await loginPage.submit(login, `zle-haslo-${attempt}`);
    await expect(loginPage.error).toHaveText('Nieprawidłowy login lub hasło');
  }

  await loginPage.submit(login, 'zle-haslo-6');
  await expect(loginPage.error).toHaveText(/^Za dużo prób\. Spróbuj ponownie za 1[45] min\.$/);
});
