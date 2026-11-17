import { addDays, warsawDate, weekStart } from '@ogarniacz/shared';
import { expect, test } from '../src/fixtures';
import { shiftDays, weekLabel } from '../src/data/dates';
import { uniqueTitle } from '../src/data/titles';
import { CHILD, PROJECT_CHILDREN } from '../src/data/users';

// Konta e2e są wspólne dla wszystkich testów i projektów, więc sprawdzamy pozycje z własną nazwą, a nie sumy.

test('dziecko kończy zadanie z nagrodą i widzi ją w kieszonkowym, a rodzic u siebie', async ({ parent, child }) => {
  const title = uniqueTitle('Odkurzyć salon');
  await parent.open();
  await parent.board.open();
  const created = await parent.board.addTask({ title, assignee: CHILD, reward: 10 });
  await expect(created.reward(10)).toBeVisible();

  await child.open();
  await child.allowance.open();
  await expect(child.allowance.nextPayout).toContainText('Kieszonkowe');
  const waiting = child.allowance.openTasks.getByRole('listitem').filter({ hasText: title });
  await expect(waiting).toContainText('+10 zł');

  await child.board.open();
  const task = child.board.task(title);
  await task.start();
  await child.board.showStatus('in_progress');
  await task.finish();

  await child.allowance.open();
  const earned = child.allowance.earned.getByRole('listitem').filter({ hasText: title });
  await expect(earned).toContainText('+10 zł');
  await expect(waiting).toHaveCount(0);

  await parent.allowance.open();
  await expect(parent.allowance.childWeek(CHILD.name)).toContainText(title);
});

test('rodzic ustawia własną kwotę nagrody i potem ją zdejmuje', async ({ parent }) => {
  await parent.open();
  await parent.board.open();
  const task = await parent.board.addTask({ title: uniqueTitle('Umyć auto'), reward: 12 });
  await expect(task.reward(12)).toBeVisible();
  // Formularz wraca do „brak”, żeby następne zadanie nie dostało nagrody przez przypadek.
  await expect(parent.board.rewardOptions.getByRole('radio', { name: 'brak' })).toHaveAttribute('aria-checked', 'true');

  await task.edit();
  await task.root.getByRole('radio', { name: 'brak' }).click();
  await task.saveButton.click();
  await expect(task.reward(12)).toHaveCount(0);
});

test('dziecko nie ustawia nagrody i nie zmienia nazwy zadania z nagrodą', async ({ parent, child }) => {
  const title = uniqueTitle('Skosić trawnik');
  await parent.api.createTask({ title, assignee: CHILD, reward: 15 });

  await child.open();
  await child.board.open();
  await expect(child.board.rewardOptions).toHaveCount(0);

  const task = child.board.task(title);
  await expect(task.reward(15)).toBeVisible();
  await task.edit();
  await expect(task.titleInput).toHaveCount(0);
  await expect(task.root).toContainText('Nazwę zadania z nagrodą zmienia tylko rodzic.');
  await expect(task.root.getByRole('radiogroup', { name: 'Nagroda' })).toHaveCount(0);
  await expect(task.dueOnInput).toBeVisible();
});

test('rodzic otwiera stawki kieszonkowego, a dziecko nie ma do nich wejścia', async ({ parent, child }) => {
  await parent.open();
  await parent.allowance.open();
  await expect(parent.allowance.rates).toContainText(CHILD.name);

  await parent.allowance.changeRatesButton.click();
  await expect(parent.allowance.rateInput(CHILD.name)).toBeVisible();
  await expect(parent.allowance.ratesSheet).toContainText('Wypłata w każdy poniedziałek');
  await parent.allowance.ratesSheet.getByRole('button', { name: 'Anuluj' }).click();
  await expect(parent.allowance.ratesSheet).toBeHidden();

  await child.open();
  await child.allowance.open();
  await expect(child.allowance.changeRatesButton).toHaveCount(0);
});

test('rodzic oznacza wypłatę za zamknięty tydzień, cofa pomyłkę, a dziecko widzi ostatnią wypłatę', async ({ parent, projectChild }, testInfo) => {
  const kid = PROJECT_CHILDREN[testInfo.project.name]!;
  const kidId = await parent.api.userId(kid);

  // Zamknięty tydzień jest dopiero po poniedziałku, więc serwer dostaje zegar przesunięty o tydzień w przód.
  // Baza e2e nie jest czyszczona: gdy ten tydzień jest już wypłacony (ponowne uruchomienie), bierzemy kolejny.
  let later = new Date();
  let closedWeek = '';
  for (let weeks = 1; !closedWeek; weeks += 1) {
    if (weeks > 30) throw new Error('Brak niewypłaconego tygodnia w zasięgu testu');
    later = shiftDays(new Date(), 7 * weeks);
    await parent.setServerTime(later);
    const week = addDays(weekStart(warsawDate(later)), -7);
    const mine = (await parent.api.allowance()).children.find((child) => child.childId === kidId);
    if (mine?.closed.find((closed) => closed.weekStart === week)?.paidAt === null) closedWeek = week;
  }

  // Nagroda za zadanie skończone w tym tygodniu, tydzień przed „teraz” serwera.
  const title = uniqueTitle('Wynieść śmieci');
  const during = shiftDays(later, -7);
  await parent.setServerTime(during);
  await projectChild.setServerTime(during);
  const task = await parent.api.createTask({ title, assignee: kid, reward: 7 });
  await projectChild.api.updateTask(task.id, { status: 'done' });

  await parent.setServerTime(later);
  const due = (await parent.api.allowance()).children.find((child) => child.childId === kidId)?.closed.find((closed) => closed.weekStart === closedWeek);
  expect(due?.rewards.map((reward) => reward.title)).toContain(title);
  const total = `${due?.total} zł`;

  await parent.open();
  await parent.allowance.open();
  const week = weekLabel(closedWeek);
  await expect(parent.allowance.payoutRow(week, kid.name)).toContainText(total);
  await parent.allowance.markPaid(week, kid.name);
  await expect(parent.allowance.payoutRow(week, kid.name)).toHaveCount(0);
  await expect(parent.allowance.paidRow(week, kid.name)).toContainText(total);

  // Pomyłka: rodzic cofa wypłatę, tydzień wraca do „Czeka na wypłatę”, a potem oznacza go jeszcze raz.
  await parent.allowance.cancelPayout(week, kid.name);
  await expect(parent.allowance.paidRow(week, kid.name)).toHaveCount(0);
  await expect(parent.allowance.payoutRow(week, kid.name)).toContainText(total);
  await parent.allowance.markPaid(week, kid.name);
  await expect(parent.allowance.paidRow(week, kid.name)).toContainText(total);

  await projectChild.setServerTime(later);
  await projectChild.open();
  await projectChild.allowance.open();
  await expect(projectChild.allowance.lastPayout).toHaveText(`Ostatnia wypłata: ${total} za ${week}`);
});
