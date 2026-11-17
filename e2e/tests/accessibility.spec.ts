import { accessibilityProblems } from '../src/a11y/axe';
import { CHILD } from '../src/data/users';
import { shiftDays, warsawToday } from '../src/data/dates';
import { uniqueTitle } from '../src/data/titles';
import { expect, test } from '../src/fixtures';
import type { Look, Theme } from '../src/pages/App';

// Automatyczne sprawdzenie dostępności (axe, WCAG 2.2 A i AA): kontrast, nazwy przycisków i pól, role.
// Jeden scenariusz przechodzi każdy ekran rodzica i podstrony ustawień w każdym wyglądzie i obu trybach,
// bo kolory zależą od obu. Dane na ekranach pochodzą z innych testów (baza e2e nie jest czyszczona),
// a dodatkowo scenariusz zakłada własne: zaległe, z kolorem, w trakcie i gotowe, żeby każdy stan karteczki był na pewno.

const THEMES: Theme[] = ['light', 'dark'];
const LOOKS: Look[] = ['fridge', 'forest', 'stickers'];

test('ekrany i ustawienia nie mają problemów z dostępnością w żadnym wyglądzie i trybie', async ({ parent }) => {
  test.setTimeout(120_000);
  const problems: string[] = [];
  const today = warsawToday();
  const yesterday = warsawToday(shiftDays(new Date(), -1));
  await parent.api.createTask({ title: uniqueTitle('Zaległe'), assignee: CHILD, dueOn: yesterday, reward: 5 });
  const colored = await parent.api.createTask({ title: uniqueTitle('Kolorowe'), assignee: CHILD, dueOn: today });
  await parent.api.updateTask(colored.id, { color: 'mint' });
  const started = await parent.api.createTask({ title: uniqueTitle('W trakcie'), assignee: CHILD, dueOn: today });
  await parent.api.updateTask(started.id, { status: 'in_progress' });
  const finished = await parent.api.createTask({ title: uniqueTitle('Gotowe'), assignee: CHILD, dueOn: today });
  await parent.api.updateTask(finished.id, { status: 'done' });

  for (const look of LOOKS) {
    for (const theme of THEMES) {
      const check = async (where: string) => problems.push(...(await accessibilityProblems(parent.page, `${look}/${theme}/${where}`)));
      await parent.openWithAppearance(theme, look);

      await check('Dziś');
      await parent.board.open();
      for (const status of ['todo', 'in_progress', 'done'] as const) {
        await parent.board.statusTab(status).click();
        await check(`Tablica/${status}`);
      }
      for (const [where, screen] of [
        ['Archiwum', parent.archive],
        ['Cykliczne', parent.recurrences],
        ['Zakupy', parent.shopping],
        ['Kieszonkowe', parent.allowance],
      ] as const) {
        await screen.open();
        await check(where);
      }

      const settings = await parent.shell.openSettings();
      await check('Ustawienia');
      for (const page of ['Wygląd i kolor', 'Powiadomienia', 'Hasło i urządzenia', 'Rodzina', 'Kalendarze'] as const) {
        await settings.openPage(page);
        await check(`Ustawienia/${page}`);
        await settings.backButton.click();
      }
      await settings.closeButton.click();
    }
  }

  expect(problems).toEqual([]);
});

test('ekran logowania nie ma problemów z dostępnością w obu trybach', async ({ loginPage }) => {
  const problems: string[] = [];
  for (const colorScheme of ['light', 'dark'] as const) {
    await loginPage.page.emulateMedia({ colorScheme });
    await loginPage.goto();
    await expect(loginPage.submitButton).toBeVisible();
    problems.push(...(await accessibilityProblems(loginPage.page, `logowanie/${colorScheme}`)));
  }
  expect(problems).toEqual([]);
});
