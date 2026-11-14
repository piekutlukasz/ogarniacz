import { type Locator, expect } from '@playwright/test';
import { RecurrenceCard } from '../components/RecurrenceCard';
import type { TestUser } from '../data/users';
import { Screen } from './Screen';

export type WeeklyRuleForm = {
  title: string;
  assignee?: TestUser;
  /** Pełne nazwy dni, jak w przyciskach formularza: „poniedziałek”… */
  weekdays: string[];
};

/** „Cykliczne”: reguły powtarzanych zadań. Tylko dla rodzica. */
export class RecurrencesPage extends Screen {
  protected readonly navLabel = 'Cykliczne';
  readonly newRuleButton: Locator = this.main.getByRole('button', { name: 'Nowe zadanie cykliczne' });
  readonly titleInput: Locator = this.main.getByLabel('Nazwa zadania cyklicznego');
  readonly ruleForm: Locator = this.main.locator('form').filter({ has: this.page.getByLabel('Nazwa zadania cyklicznego') });
  readonly assigneeSelect: Locator = this.ruleForm.getByLabel('Osoba');
  readonly addButton: Locator = this.ruleForm.getByRole('button', { name: 'Dodaj' });

  weekdayButton(name: string): Locator {
    return this.ruleForm.getByRole('button', { name, exact: true });
  }

  rule(title: string): RecurrenceCard {
    return new RecurrenceCard(this.main, title);
  }

  async addWeeklyRule({ title, assignee, weekdays }: WeeklyRuleForm): Promise<RecurrenceCard> {
    await this.newRuleButton.click();
    await this.titleInput.fill(title);
    if (assignee) await this.assigneeSelect.selectOption({ label: assignee.name });
    for (const day of weekdays) await this.weekdayButton(day).click();
    await this.addButton.click();
    const card = this.rule(title);
    await expect(card.root).toBeVisible();
    return card;
  }
}
