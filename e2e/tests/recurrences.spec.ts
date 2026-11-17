import { expect, test } from '../src/fixtures';
import { warsawWeekday } from '../src/data/dates';
import { uniqueTitle } from '../src/data/titles';
import { CHILD } from '../src/data/users';

test('rodzic wstrzymuje i wznawia regułę cykliczną', async ({ parent }) => {
  await parent.open();
  await parent.recurrences.open();
  const rule = await parent.recurrences.addWeeklyRule({
    title: uniqueTitle('Odkurzyć co tydzień'),
    weekdays: [warsawWeekday()],
  });
  await expect(rule.root).toContainText('Następne:');

  await rule.pause();
  await expect(rule.root).toContainText('Wstrzymane');

  await rule.resume();
  await expect(rule.root).toContainText('Następne:');
});

test('reguła na dziś z nagrodą od razu daje dziecku zadanie w „Dziś”', async ({ parent, child }) => {
  await parent.open();
  await parent.recurrences.open();
  const rule = await parent.recurrences.addWeeklyRule({
    title: uniqueTitle('Wynieść śmieci co tydzień'),
    assignee: CHILD,
    weekdays: [warsawWeekday()],
    reward: 5,
  });
  await expect(rule.root).toContainText('+5 zł');

  await child.open();
  await expect(child.recurrences.navButton).toHaveCount(0);
  const task = child.today.dueTodayTask(rule.title);
  await expect(task.root).toContainText('cykliczne');
  await expect(task.reward(5)).toBeVisible();
});
