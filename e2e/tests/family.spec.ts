import { expect, test } from '../src/fixtures';
import { PARENT } from '../src/data/users';
import { App } from '../src/pages/App';
import { InvitePage } from '../src/pages/InvitePage';

// Konta z zaproszeń mają login z tym początkiem. Baza e2e nie jest czyszczona, a limit to 10 aktywnych kont,
// więc test wyłącza na końcu swoje konto, a na początku także te, które zostały po przerwanych przebiegach.
const LOGIN_PREFIX = 'e2e-nowy-';

test('rodzic zaprasza dziecko, wystawia mu nowe hasło i wyłącza konto', async ({ parent, otherDevice }, testInfo) => {
  const suffix = Math.random().toString(36).slice(2, 8);
  const login = `${LOGIN_PREFIX}${testInfo.project.name}-${suffix}`;
  const name = `Gość ${suffix}`;
  const prefix = `${LOGIN_PREFIX}${testInfo.project.name}-`;
  await parent.api.disableAccounts(prefix, PARENT.password);

  try {
    await parent.open();
    const family = await parent.shell.openFamily();
    const link = await family.invite({ name, login, confirm: PARENT.password });
    await expect(family.qrCode).toBeVisible();
    expect(link).toMatch(/\/#zaproszenie=[A-Za-z0-9_-]{43}$/);
    await family.doneButton.click();
    await expect(family.pendingInvite(name)).toBeVisible();

    // Nowa osoba na swoim telefonie: powitanie, hasło, przypomnienie o instalacji i aplikacja.
    const invite = new InvitePage(otherDevice.page);
    await invite.open(link);
    await expect(invite.greeting(name)).toBeVisible();
    await expect(otherDevice.page).not.toHaveURL(/zaproszenie/);
    await invite.setPassword('testowe-haslo-20', 'testowe-haslo-21');
    await expect(invite.alert).toHaveText('Hasła się różnią');
    await invite.setPassword('testowe-haslo-20');
    await expect(invite.installHint).toBeVisible();
    await invite.goToAppButton.click();
    await expect(new App(otherDevice.page).shell.signedInAs(name)).toBeVisible();

    // Rodzic widzi nowe konto, a zaproszenie znika z oczekujących.
    await parent.page.reload();
    await parent.shell.openFamily();
    await expect(family.account(name)).toBeVisible();
    await expect(family.pendingInvite(name)).toBeHidden();

    // Nowe hasło z linku: osoba na telefonie wylogowuje się, ustawia hasło i jest zalogowana od nowa.
    const resetLink = await family.passwordResetLink(name, PARENT.password);
    await family.doneButton.click();
    await invite.open(resetLink);
    await invite.logOutAndAcceptButton.click();
    await expect(invite.greeting(name)).toBeVisible();
    await invite.acceptAs(name, 'testowe-haslo-22');

    // Wyłączenie konta wylogowuje dziecko.
    await family.accountAction(name, 'Wyłącz konto', PARENT.password);
    await expect(family.notice).toHaveText(`Wyłączono konto: ${name}. To konto jest wylogowane.`);
    await expect(family.account(name)).toContainText('Konto wyłączone');
    await otherDevice.goto();
    await expect(otherDevice.submitButton).toBeVisible();
    // Wyłączone konto nie zaloguje się poprawnym hasłem, a komunikat nie zdradza, że konto istnieje.
    await otherDevice.submit(login, 'testowe-haslo-22');
    await expect(otherDevice.error).toHaveText('Nieprawidłowy login lub hasło');

    await family.authLog.click();
    await expect(family.authLogEntries.filter({ hasText: `Nowe konto · ${name}` })).toHaveCount(1);
  } finally {
    await parent.api.disableAccounts(prefix, PARENT.password);
  }
});

test('nieważne zaproszenie pokazuje komunikat i prowadzi do logowania', async ({ otherDevice }) => {
  const invite = new InvitePage(otherDevice.page);
  await invite.open('/#zaproszenie=to-nie-jest-zaproszenie');

  await expect(invite.alert).toHaveText('To zaproszenie jest nieważne. Poproś rodzica o nowe');
  await otherDevice.page.getByRole('button', { name: 'Przejdź do logowania' }).click();
  await expect(otherDevice.submitButton).toBeVisible();
});

test('dziecko nie widzi sekcji „Rodzina”', async ({ child }) => {
  await child.open();
  const settings = await child.shell.openSettings();

  await expect(settings.menuItem('Wygląd i kolor')).toBeVisible();
  await expect(settings.menuItem('Rodzina')).toHaveCount(0);
});
