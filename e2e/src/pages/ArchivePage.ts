import { type Locator, expect } from '@playwright/test';
import { TaskListScreen } from './Screen';

/** Archiwum nie ma przycisku w nawigacji: wchodzi się do niego z „Tablicy” i tam się wraca. */
export class ArchivePage extends TaskListScreen {
  protected readonly navLabel = 'Tablica';
  readonly heading: Locator = this.main.getByRole('heading', { name: 'Archiwum' });
  readonly openButton: Locator = this.main.getByRole('button', { name: 'Archiwum', exact: true });
  readonly backButton: Locator = this.main.getByRole('button', { name: 'Wróć na tablicę' });

  override async open(): Promise<void> {
    await super.open();
    await this.openButton.click();
    await expect(this.heading).toBeVisible();
  }

  async back(): Promise<void> {
    await this.backButton.click();
    await expect(this.heading).toBeHidden();
  }
}
