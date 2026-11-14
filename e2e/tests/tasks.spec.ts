import { expect, test } from '../src/fixtures';
import { warsawToday } from '../src/data/dates';
import { uniqueTitle } from '../src/data/titles';
import { CHILD } from '../src/data/users';

test.describe('rodzic', () => {
  test.beforeEach(async ({ parent }) => {
    await parent.open();
    await parent.board.open();
  });

  test('przeprowadza zadanie przez całą tablicę i przywraca je z archiwum', async ({ parent }) => {
    const { board, archive } = parent;
    const task = await board.addTask({ title: uniqueTitle('Wynieść śmieci') });

    await task.start();
    await board.showStatus('in_progress');
    await expect(task.root).toBeVisible();

    await task.finish();
    await board.showStatus('done');
    await expect(task.root).toBeVisible();

    await task.archive();
    await expect(task.root).toBeHidden();

    // Archiwum nie ma zakładki w nawigacji: wchodzi się do niego z tablicy.
    await expect(parent.shell.navButton('Archiwum')).toHaveCount(0);
    await archive.open();
    const archived = archive.task(task.title);
    await archived.restore();
    await expect(archived.root).toBeHidden();

    await archive.back();
    await board.showStatus('done');
    await expect(task.root).toBeVisible();
  });

  test('nie dodaje zadania z za krótką nazwą i mówi dlaczego', async ({ parent }) => {
    const { board } = parent;

    await board.addButton.click();
    await expect(board.titleProblem).toHaveText('Podaj nazwę zadania');

    await board.titleInput.fill('ab');
    await expect(board.titleProblem).toBeHidden();
    await board.addButton.click();
    await expect(board.titleProblem).toHaveText('Nazwa zadania musi mieć co najmniej 3 znaki');
    // Baza e2e zbiera zadania z innych uruchomień, a „ab” bywa fragmentem cudzej nazwy, więc szukamy dokładnej.
    await expect(board.exactTitle('ab')).toHaveCount(0);
  });

  test('usuwa termin z zadania', async ({ parent }) => {
    const { board } = parent;
    const task = await board.addTask({ title: uniqueTitle('Oddać książki'), dueOn: warsawToday() });
    await expect(task.root).toContainText('Termin: dziś');

    await task.clearDue();
    await expect(task.root).not.toContainText('Termin');
  });

  test('karta przeciągnięta na zakładkę zmienia status', async ({ parent }) => {
    const { board } = parent;
    const task = await board.addTask({ title: uniqueTitle('Złożyć pranie') });

    await board.dragToStatus(task, 'done');
    await expect(task.root).toBeHidden();

    await board.showStatus('done');
    await expect(task.root).toBeVisible();
  });
});

test.describe('dziecko', () => {
  test('kończy swoje zadanie, ale go nie archiwizuje', async ({ child }) => {
    const { board } = child;
    await child.open();
    await board.open();
    const task = await board.addTask({ title: uniqueTitle('Posprzątać pokój') });

    await task.start();
    await board.showStatus('in_progress');
    await task.finish();
    await board.showStatus('done');

    await expect(task.root).toBeVisible();
    await expect(task.archiveButton).toHaveCount(0);
  });

  test('bierze zadanie dla chętnych, a potem je cofa i oddaje', async ({ parent, child }) => {
    const title = uniqueTitle('Rozpakować zakupy');
    await parent.api.createTask({ title });
    const { board } = child;
    const task = board.task(title);

    await child.open();
    await board.open();
    await expect(task.root).toContainText('Dla chętnych');

    await task.start();
    await board.showStatus('in_progress');
    await expect(task.root).toContainText(CHILD.name);
    await expect(task.finishButton).toBeVisible();

    // Rozmyśliło się: cofa zadanie do „Do zrobienia” i oddaje je innym.
    await task.revert();
    await board.showStatus('todo');
    await task.release();
    await expect(task.root).toContainText('Dla chętnych');
    await expect(task.releaseButton).toHaveCount(0);
    await expect(task.startButton).toBeVisible();
  });
});

test('kolor karteczki widzi cała rodzina, a dziecko zmienia go przy swoim zadaniu', async ({ parent, child }) => {
  await parent.open();
  await parent.board.open();
  const plain = await parent.board.plainBackground();
  const task = await parent.board.addTask({ title: uniqueTitle('Podlać kwiaty'), assignee: CHILD, color: 'Miętowy' });
  const colored = await task.background();
  expect(colored).not.toBe(plain);
  // Po dodaniu wybór wraca do zwykłej karteczki.
  await expect(parent.board.colorOptions.getByRole('radio', { name: 'Bez koloru' })).toHaveAttribute('aria-checked', 'true');

  await child.open();
  await child.board.open();
  const childTask = child.board.task(task.title);
  await expect.poll(() => childTask.background()).toBe(colored);

  await childTask.edit();
  await expect(childTask.colorOption('Miętowy')).toHaveAttribute('aria-checked', 'true');
  await childTask.colorOption('Bez koloru').click();
  await childTask.saveButton.click();
  await expect.poll(() => childTask.background()).toBe(plain);
});

test('rodzic przydziela dziecku zadanie na dziś, a dziecko widzi je w „Dziś”', async ({ parent, child }) => {
  await parent.open();
  await parent.board.open();
  const created = await parent.board.addTask({ title: uniqueTitle('Podlać kwiaty'), assignee: CHILD, dueOn: warsawToday() });
  await expect(created.root).toContainText(CHILD.name);
  await expect(created.root).toContainText('Termin: dziś');

  await child.open();
  const task = child.today.dueTodayTask(created.title);
  await expect(task.root).toBeVisible();
  // Zadanie od rodzica zostaje przy dziecku: nie da się go oddać.
  await expect(task.releaseButton).toHaveCount(0);
  await task.start();
  await expect(task.finishButton).toBeVisible();
});
