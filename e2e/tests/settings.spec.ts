import { expect, test } from '../src/fixtures';
import { uniqueTitle } from '../src/data/titles';
import { PROJECT_CHILDREN } from '../src/data/users';

test('motyw wybrany w ustawieniach zostaje po odświeżeniu, a „Jak w telefonie” go zdejmuje', async ({ parent }) => {
  await parent.open();
  const html = parent.page.locator('html');

  const settings = await parent.shell.openSettings();
  await settings.openPage('Wygląd i kolor');
  await expect(settings.theme('Jak w telefonie')).toBeChecked();
  await settings.theme('Ciemny').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await parent.page.reload();
  await expect(html).toHaveAttribute('data-theme', 'dark');

  await parent.shell.openSettings();
  await settings.openPage('Wygląd i kolor');
  await expect(settings.theme('Ciemny')).toBeChecked();
  await settings.theme('Jak w telefonie').click();
  await expect(html).not.toHaveAttribute('data-theme');
});

test('wygląd wybrany w ustawieniach zostaje po odświeżeniu, a „Lodówka” go zdejmuje', async ({ parent }) => {
  await parent.open();
  const html = parent.page.locator('html');

  const settings = await parent.shell.openSettings();
  await settings.openPage('Wygląd i kolor');
  await expect(settings.look('Lodówka')).toBeChecked();
  await settings.look('Wieczorny las').click();
  await expect(html).toHaveAttribute('data-look', 'forest');
  await settings.look('Naklejki').click();
  await expect(html).toHaveAttribute('data-look', 'stickers');

  await parent.page.reload();
  await expect(html).toHaveAttribute('data-look', 'stickers');

  await parent.shell.openSettings();
  await expect(settings.menuItem('Wygląd i kolor')).toContainText('Naklejki');
  await settings.openPage('Wygląd i kolor');
  await expect(settings.look('Naklejki')).toBeChecked();
  await settings.look('Lodówka').click();
  await expect(html).not.toHaveAttribute('data-look');
});

test('menu ustawień prowadzi na podstronę i z powrotem, a zamknięcie wraca do menu', async ({ parent }) => {
  await parent.open();
  const settings = await parent.shell.openSettings();
  await expect(settings.menuItem('Rodzina')).toBeVisible();
  await expect(settings.menuItem('Kalendarze')).toBeVisible();

  const look = await settings.openPage('Wygląd i kolor');
  await expect(settings.menuItem('Rodzina')).toBeHidden();
  await settings.backButton.click();
  await expect(look).toBeHidden();
  await expect(settings.menuItem('Wygląd i kolor')).toBeFocused();

  // Escape na podstronie cofa do menu, a w menu zamyka arkusz.
  await settings.openPage('Wygląd i kolor');
  await parent.page.keyboard.press('Escape');
  await expect(settings.menuItem('Wygląd i kolor')).toBeVisible();
  await parent.page.keyboard.press('Escape');
  await expect(settings.root).toBeHidden();

  // Zamknięty arkusz otwiera się od menu, nawet gdy zamknięto go z podstrony.
  await parent.shell.openSettings();
  await settings.openPage('Wygląd i kolor');
  await settings.closeButton.click();
  await parent.shell.openSettings();
  await expect(settings.menuItem('Wygląd i kolor')).toBeVisible();
});

test('otwarte ustawienia blokują przewijanie ekranu pod spodem, a zamknięte je oddają', async ({ parent }) => {
  await parent.open();
  const html = parent.page.locator('html');
  await expect(html).toHaveCSS('overflow', 'visible');

  const settings = await parent.shell.openSettings();
  await expect(html).toHaveCSS('overflow', 'hidden');
  await settings.openPage('Rodzina');
  await expect(html).toHaveCSS('overflow', 'hidden');

  await settings.closeButton.click();
  await expect(html).toHaveCSS('overflow', 'visible');
});

test('dziecko wybiera swój kolor, a rodzic widzi go na tablicy', async ({ parent, projectChild: child }, testInfo) => {
  // Każdy projekt ma własne dziecko, bo kolor należy do konta i dwa telefony naraz nadpisywałyby go sobie.
  const task = await parent.api.createTask({ title: uniqueTitle('Nakarmić rybki'), assignee: PROJECT_CHILDREN[testInfo.project.name] });

  await child.open();
  const settings = await child.shell.openSettings();
  await settings.openPage('Wygląd i kolor');
  await settings.color('Błękitny').click();
  await settings.color('Liliowy').click();
  await expect(settings.color('Liliowy')).toBeChecked();
  await expect(settings.color('Błękitny')).not.toBeChecked();
  await settings.closeButton.click();
  await expect(settings.root).toBeHidden();

  await parent.open();
  await parent.board.open();
  await expect(parent.board.task(task.title).avatar).toHaveCSS('background-color', 'rgb(199, 162, 255)');
});
