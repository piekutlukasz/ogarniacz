import { expect, test } from '../src/fixtures';

test('kliknięcie powiadomienia otwiera ekran z adresu i sprząta adres', async ({ parent }) => {
  await parent.openFromNotification('shopping');
  await expect(parent.shopping.navButton).toHaveAttribute('aria-current', 'page');
  await expect(parent.page).toHaveURL(/\/$/);

  await parent.openFromNotification('board');
  await expect(parent.board.navButton).toHaveAttribute('aria-current', 'page');
});

test('nieznany albo niedostępny ekran z adresu kończy na „Dziś”', async ({ parent, child }) => {
  await parent.openFromNotification('nie-ma-takiego');
  await expect(parent.today.navButton).toHaveAttribute('aria-current', 'page');

  // Cykliczne to ekran tylko dla rodzica.
  await child.openFromNotification('recurring');
  await expect(child.today.navButton).toHaveAttribute('aria-current', 'page');
});

test('ustawienia mają podstronę powiadomień: zgoda po kliknięciu albo instrukcja, gdy telefon nie obsługuje push', async ({ parent }) => {
  await parent.open();
  const settings = await parent.shell.openSettings();
  await settings.openPage('Powiadomienia');

  // Przeglądarka z push oferuje przycisk zgody (w testach Chromium ma zgodę zablokowaną), a bez push, np. iPhone poza ekranem głównym, tłumaczy, co zrobić.
  const instruction = settings.notifications.getByText(/ekranu głównego|nie obsługuje powiadomień|zablokowane/);
  await expect(settings.enableNotificationsButton.or(instruction)).toBeVisible();
});

test('ustawienia powiadomień są osobne dla każdej osoby i zapisują się na serwerze', async ({ parent, colorChild: child }) => {
  // Zmieniamy konto dziecka przypisanego do projektu, bo konto rodzica jest wspólne dla projektów biegnących naraz.
  const prefs = (actor: typeof parent) => actor.page.request.get('/api/push/prefs').then((response) => response.json());
  await parent.open();
  await child.open();

  const parentBefore = await prefs(parent);
  const changed = await child.page.request.patch('/api/push/prefs', { data: { due: false, morningHour: 9 } });
  expect(changed.ok()).toBe(true);
  expect(await prefs(child)).toMatchObject({ due: false, morningHour: 9 });
  expect(await prefs(parent)).toEqual(parentBefore);

  await child.page.request.patch('/api/push/prefs', { data: { due: true, morningHour: 7 } });
});
