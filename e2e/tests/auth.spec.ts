import { expect, test } from '../src/fixtures';
import { ApiClient } from '../src/api/ApiClient';
import { CHILD, PARENT } from '../src/data/users';
import { uniqueTitle } from '../src/data/titles';

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

test('wygaśnięcie sesji w trakcie pracy pokazuje logowanie, a dodany zakup czeka na ponowne zalogowanie', async ({
  loginPage,
  page,
  parent,
}) => {
  // Znacznik w nazwie produktu: lista jest wspólna, patrz `ShoppingPage.showOnly`.
  const marker = uniqueTitle('').trim();
  const tea = `Herbata ${marker}`;
  const app = await loginPage.logInAs(CHILD);
  await app.shopping.showOnly(marker);
  await app.shopping.open();

  // Sesja z tego logowania kończy się na serwerze, a telefon jeszcze o tym nie wie.
  // Zapisana sesja aktora `child` zostaje, bo to osobne logowanie.
  await new ApiClient(page.context().request).logOut();
  await app.shopping.submit(tea, '2');
  await expect(loginPage.submitButton).toBeVisible();
  await expect(app.shell.navigation).toBeHidden();

  // Ta sama osoba loguje się ponownie: zakup z kolejki na telefonie idzie na serwer.
  await loginPage.logInAs(CHILD);
  await app.shopping.open();
  await expect(app.shopping.toBuy(tea).root).toContainText('2');
  await expect(app.shopping.syncNote).toHaveCount(0);

  await parent.shopping.showOnly(marker);
  await parent.open();
  await parent.shopping.open();
  await expect(parent.shopping.toBuy(tea).root).toHaveCount(1);
});

test('po pięciu złych hasłach logowanie jest zablokowane z podanym czasem', async ({ loginPage }, testInfo) => {
  // Login spoza bazy, bo blokada trwa kwadrans i nie może trafić w konta innych testów. Limit liczy się
  // tak samo dla istniejącego konta, a serwer e2e nie dostaje adresu klienta, więc nie ma blokady na adres.
  const login = `e2e-blokada-${testInfo.project.name}-${Math.random().toString(36).slice(2, 8)}`;

  for (let attempt = 1; attempt <= 5; attempt += 1) {
    await loginPage.submit(login, `zle-haslo-${attempt}`);
    await expect(loginPage.error).toHaveText('Nieprawidłowy login lub hasło');
  }

  await loginPage.submit(login, 'zle-haslo-6');
  await expect(loginPage.error).toHaveText('Za dużo prób. Spróbuj ponownie za 15 min.');
});
