import { expect, test } from '../src/fixtures';
import { uniqueTitle } from '../src/data/titles';
import { ACCOUNT_USERS } from '../src/data/users';
import { resetUser } from '../src/setup/seedUsers';

// Każdy test ma własne konto w każdym projekcie, bo zmiana hasła i „Wyloguj inne urządzenia” kończą sesje konta.

test('zmiana hasła zostawia to urządzenie zalogowane, a drugie wylogowuje', async ({ loginPage, page, otherDevice }, testInfo) => {
  const user = ACCOUNT_USERS[testInfo.project.name]!.password;
  const newPassword = `${user.password}-nowe`;
  resetUser(user);

  await loginPage.goto();
  const app = await loginPage.logInAs(user);
  await otherDevice.goto();
  await otherDevice.logInAs(user);

  const settings = await app.shell.openSettings();
  await settings.openPage('Hasło i urządzenia');
  await settings.changePassword('to-nie-jest-haslo', newPassword);
  await expect(settings.passwordError).toHaveText('Obecne hasło jest nieprawidłowe');

  await settings.changePassword(user.password, newPassword, `${newPassword}x`);
  await expect(settings.passwordError).toHaveText('Nowe hasła się różnią');

  await settings.changePassword(user.password, newPassword);
  await expect(settings.passwordStatus).toHaveText('Hasło zmienione. Pozostałe urządzenia zostały wylogowane.');

  await page.reload();
  await expect(app.shell.signedInAs(user.name)).toBeVisible();

  await otherDevice.goto();
  await expect(otherDevice.submitButton).toBeVisible();
  await otherDevice.submit(user.login, user.password);
  await expect(otherDevice.error).toHaveText('Nieprawidłowy login lub hasło');
  await otherDevice.logInAs({ ...user, password: newPassword });
});

test('„Wyloguj inne urządzenia” wylogowuje drugi telefon w trakcie pracy, a jego zakupy bez sieci nie przepadają', async ({ loginPage, page, otherDevice }, testInfo) => {
  const user = ACCOUNT_USERS[testInfo.project.name]!.devices;
  const bread = uniqueTitle('Chleb');
  resetUser(user);

  // Drugi telefon w sklepie bez zasięgu: zmiana czeka w kolejce na telefonie.
  await otherDevice.goto();
  const phone = await otherDevice.logInAs(user);
  await phone.shopping.open();
  await otherDevice.page.context().setOffline(true);
  await phone.shopping.add(bread);
  await expect(phone.shopping.syncNote).toContainText('Niewysłane zmiany: 1');

  await loginPage.goto();
  const app = await loginPage.logInAs(user);

  const settings = await app.shell.openSettings();
  await settings.openPage('Hasło i urządzenia');
  await settings.logoutOthersButton.click();
  await expect(settings.passwordStatus).toHaveText('Wylogowano: 1 urządzenie.');

  await page.reload();
  await expect(app.shell.signedInAs(user.name)).toBeVisible();

  // Drugi telefon odzyskuje zasięg: wysyłka dostaje 401, a aplikacja pokazuje logowanie zamiast błędu.
  await otherDevice.page.context().setOffline(false);
  await expect(otherDevice.submitButton).toBeVisible();
  await expect(phone.shell.navigation).toBeHidden();

  // Ta sama osoba loguje się ponownie, a zmiana z kolejki trafia na serwer i na pierwszy telefon.
  await otherDevice.logInAs(user);
  await phone.shopping.open();
  await expect(phone.shopping.toBuy(bread).root).toBeVisible();
  await expect(phone.shopping.syncNote).toHaveCount(0);
  await app.shopping.open();
  await expect(app.shopping.toBuy(bread).root).toBeVisible();
});
