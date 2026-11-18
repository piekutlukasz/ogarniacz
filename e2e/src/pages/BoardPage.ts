import { type Locator, expect } from '@playwright/test';
import type { TaskStatus } from '@ogarniacz/shared';
import type { TaskCard } from '../components/TaskCard';
import type { TestUser } from '../data/users';
import { TaskListScreen } from './Screen';

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'Do zrobienia',
  in_progress: 'W trakcie',
  done: 'Gotowe',
};

export type TaskForm = {
  title: string;
  /** Tylko rodzic wybiera osobę. */
  assignee?: TestUser;
  /** RRRR-MM-DD */
  dueOn?: string;
  /** Tylko rodzic. Kwota spoza gotowych przycisków trafia do pola „inna”. */
  reward?: number;
  /** Nazwa koloru karteczki, np. „Miętowy”. */
  color?: string;
};

const REWARD_PRESETS = [5, 10, 15];

/** „Tablica”: formularz nowego zadania, zakładki statusów i lista kart. */
export class BoardPage extends TaskListScreen {
  protected readonly navLabel = 'Tablica';
  readonly titleInput: Locator = this.main.getByLabel('Nowe zadanie');
  readonly newTaskForm: Locator = this.main.locator('form').filter({ has: this.page.getByLabel('Nowe zadanie') });
  readonly assigneeSelect: Locator = this.newTaskForm.getByLabel('Osoba');
  readonly dueOnInput: Locator = this.newTaskForm.getByLabel('Termin');
  /** Wybór nagrody. Nie ma go dziecko ani rodzic w rodzinie bez dziecka. */
  readonly rewardOptions: Locator = this.newTaskForm.getByRole('radiogroup', { name: 'Nagroda' });
  /** Wybór koloru karteczki: „Bez koloru” i kolory po nazwie. */
  readonly colorOptions: Locator = this.newTaskForm.getByRole('radiogroup', { name: 'Kolor' });
  readonly customRewardInput: Locator = this.newTaskForm.getByLabel('Własna kwota nagrody w złotych');
  readonly addButton: Locator = this.newTaskForm.getByRole('button', { name: 'Dodaj' });
  /** Komunikat walidacji nazwy pod polem nowego zadania. */
  readonly titleProblem: Locator = this.newTaskForm.getByRole('alert');
  readonly statusTabs: Locator = this.main.getByRole('tablist', { name: 'Status zadań' });
  readonly dropHint: Locator = this.main.getByText('Upuść na zakładce');

  statusTab(status: TaskStatus): Locator {
    return this.statusTabs.getByRole('tab', { name: new RegExp(`^${STATUS_LABELS[status]}`) });
  }

  /** Dodaje zadanie. Po dodaniu tablica wraca na „Do zrobienia”, gdzie widać nową kartę. */
  async addTask({ title, assignee, dueOn, reward, color }: TaskForm): Promise<TaskCard> {
    await this.titleInput.fill(title);
    if (assignee) await this.assigneeSelect.selectOption({ label: assignee.name });
    if (dueOn) await this.dueOnInput.fill(dueOn);
    if (reward !== undefined) await this.chooseReward(reward);
    if (color) await this.colorOptions.getByRole('radio', { name: color, exact: true }).click();
    await this.addButton.click();
    const card = this.task(title);
    await expect(card.root).toBeVisible();
    return card;
  }

  /** Nazwa zadania dokładnie taka jak podana, w przeciwieństwie do `task`, który szuka też fragmentu cudzej nazwy. */
  exactTitle(title: string): Locator {
    return this.main.getByText(title, { exact: true });
  }

  /** Tło zwykłej karteczki bez koloru, takie samo jak formularza nowego zadania. */
  async plainBackground(): Promise<string> {
    return this.newTaskForm.evaluate((element) => getComputedStyle(element).backgroundColor);
  }

  async chooseReward(reward: number): Promise<void> {
    if (REWARD_PRESETS.includes(reward)) {
      await this.rewardOptions.getByRole('radio', { name: `${reward} zł`, exact: true }).click();
    } else {
      await this.rewardOptions.getByRole('radio', { name: 'inna' }).click();
      await this.customRewardInput.fill(String(reward));
    }
  }

  async showStatus(status: TaskStatus): Promise<void> {
    const tab = this.statusTab(status);
    // dnd-kit po przeciągnięciu myszą pochłania jedno kliknięcie, więc klikamy do skutku.
    await expect(async () => {
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 500 });
    }).toPass();
  }

  /** Przeciąga kartę myszą na zakładkę statusu. */
  async dragToStatus(card: TaskCard, status: TaskStatus): Promise<void> {
    const mouse = this.page.mouse;
    // Baza e2e zbiera zadania z poprzednich uruchomień, więc karta może być niżej, poza ekranem.
    // Przewijamy ją na środek: przy samej krawędzi chowa się pod przypiętymi zakładkami albo dolnym paskiem
    // i chwyt trafia w nie zamiast w kartę.
    await card.root.evaluate((element) => element.scrollIntoView({ block: 'center' }));
    const from = await boxOf(card.label);
    await mouse.move(from.x + 5, from.y + from.height / 2);
    await mouse.down();
    await mouse.move(from.x + 5, from.y - 20, { steps: 5 });
    await expect(this.dropHint).toBeVisible();
    // Zakładkę mierzymy dopiero w trakcie przeciągania, bo strona może się wtedy przewinąć.
    const to = await boxOf(this.statusTab(status));
    await mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
    // dnd-kit ustala cel upuszczenia z opóźnieniem. Puszczone za wcześnie myszą trafiłoby w poprzedni cel,
    // więc czekamy, aż zakładka się podświetli (to jedyny widoczny znak, że jest celem).
    await expect(this.statusTab(status)).toHaveClass(/ring-brand/);
    await mouse.up();
    await expect(this.dropHint).toBeHidden();
  }
}

async function boxOf(locator: Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Element poza ekranem: ${locator}`);
  return box;
}
