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
