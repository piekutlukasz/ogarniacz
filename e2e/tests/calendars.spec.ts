import { FOREIGN_URL, MISSING_CALENDAR_URL, NOT_A_CALENDAR_URL, feedUrl } from '../src/data/calendars';
import { uniqueTitle } from '../src/data/titles';
import { expect, test } from '../src/fixtures';

test('rodzic dodaje kalendarz, a wydarzenia na dziś widzi cała rodzina', async ({ parent, child }) => {
  const name = uniqueTitle('Rodzina');
  const title = uniqueTitle('Basen');
  try {
    await parent.open();
    const sheet = await parent.shell.openCalendars();
    await sheet.add({ name, url: feedUrl(title) });
    await expect(sheet.addedNote).toContainText('Znaleziono: 2 wydarzenia');
    await expect(sheet.item(name)).toContainText('127.0.0.1');
    // Adres z linku nie wraca na ekran, tylko serwis.
    await expect(sheet.root).not.toContainText('/feed/');
    await parent.shell.settings.closeButton.click();
    await expect(parent.shell.settings.root).toBeHidden();

    await expect(parent.today.event(title)).toContainText('18:00–19:00');
    await expect(parent.today.event(title)).toContainText('Pływalnia');
    await expect(parent.today.event(title)).toContainText(name);
    await expect(parent.today.event(`${title} (cały dzień)`)).toContainText('Cały dzień');

    await child.open();
    await expect(child.today.event(title)).toBeVisible();
    await expect(child.today.eventsSection).toContainText('Zsynchronizowano');
    await expect(child.today.staleWarning).toBeHidden();
  } finally {
    await parent.api.detachCalendar(name);
  }
});

test('kalendarz z widocznością „Tylko ja” nie pokazuje wydarzeń dziecku', async ({ parent, child }) => {
  const privateName = uniqueTitle('Praca');
  const familyName = uniqueTitle('Dom');
  const privateTitle = uniqueTitle('Spotkanie');
  const familyTitle = uniqueTitle('Obiad');
  try {
    await parent.api.addCalendar({ name: privateName, url: feedUrl(privateTitle), scope: 'private' });
    await parent.api.addCalendar({ name: familyName, url: feedUrl(familyTitle) });

    await parent.open();
    await expect(parent.today.event(privateTitle)).toBeVisible();

    await child.open();
    await expect(child.today.event(familyTitle)).toBeVisible();
    await expect(child.today.event(privateTitle)).toHaveCount(0);
  } finally {
    await parent.api.detachCalendar(privateName);
    await parent.api.detachCalendar(familyName);
  }
});

test('zły link nie jest zapisywany, a komunikat mówi, co poprawić', async ({ parent }) => {
  const name = uniqueTitle('Zły');
  await parent.open();
  const sheet = await parent.shell.openCalendars();

  await sheet.add({ name, url: FOREIGN_URL });
  await expect(sheet.alert).toContainText('Ten adres nie jest dozwolony');
  await sheet.urlField.fill(NOT_A_CALENDAR_URL);
  await sheet.saveButton.click();
  await expect(sheet.alert).toContainText('nie ma kalendarza');
  await sheet.urlField.fill(MISSING_CALENDAR_URL);
  await sheet.saveButton.click();
  await expect(sheet.alert).toContainText('nie ma już kalendarza');

  await sheet.root.getByRole('button', { name: 'Anuluj' }).click();
  await expect(sheet.item(name)).toHaveCount(0);
});

test('rodzic wymienia link, odświeża kalendarz i go odpina', async ({ parent }) => {
  const name = uniqueTitle('Szkoła');
  const first = uniqueTitle('Lekcja');
  const second = uniqueTitle('Wycieczka');
  try {
    await parent.api.addCalendar({ name, url: feedUrl(first) });
    await parent.open();
    await expect(parent.today.event(first)).toBeVisible();

    const sheet = await parent.shell.openCalendars();
    // Odświeżenie tuż po dodaniu jest za wcześnie i mówi to wprost.
    await sheet.refresh(name).click();
    await expect(sheet.alert).toContainText('przed chwilą');

    // Zły nowy link niczego nie psuje.
    await sheet.replaceLink(name).click();
    await sheet.root.getByLabel('Nowy link do kalendarza').fill(MISSING_CALENDAR_URL);
    await sheet.root.getByRole('button', { name: 'Zapisz link' }).click();
    await expect(sheet.item(name).getByRole('alert')).toContainText('nie ma już kalendarza');

    await sheet.root.getByLabel('Nowy link do kalendarza').fill(feedUrl(second));
    await sheet.root.getByRole('button', { name: 'Zapisz link' }).click();
    await expect(sheet.item(name)).toBeVisible();

    await parent.shell.settings.closeButton.click();
    await expect(parent.today.event(second)).toBeVisible();
    await expect(parent.today.event(first)).toHaveCount(0);

    await parent.shell.openCalendars();
    await sheet.detach(name);
    await expect(sheet.item(name)).toHaveCount(0);
    await parent.shell.settings.closeButton.click();
    await expect(parent.today.event(second)).toHaveCount(0);
  } finally {
    await parent.api.detachCalendar(name);
  }
});

test('dziecko nie ma w ustawieniach zarządzania kalendarzami i nie dodaje ich przez API', async ({ child }) => {
  await child.open();
  const settings = await child.shell.openSettings();
  await expect(settings.logoutButton).toBeVisible();
  await expect(settings.menuItem('Kalendarze')).toHaveCount(0);

  const response = await child.page.request.post('/api/calendars', { data: { name: 'x', url: feedUrl('x'), scope: 'family' } });
  expect(response.status()).toBe(403);
});
