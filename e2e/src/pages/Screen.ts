import { type Locator, type Page, expect } from '@playwright/test';
import { AppShell } from '../components/AppShell';
import { TaskCard } from '../components/TaskCard';

/** Ekran aplikacji, na który przechodzi się przyciskiem w nawigacji. */
export abstract class Screen {
  protected abstract readonly navLabel: string;
  protected readonly main: Locator;
  private readonly shell: AppShell;

  constructor(protected readonly page: Page) {
    this.main = page.getByRole('main');
    this.shell = new AppShell(page);
  }

  /** Przycisk ekranu w nawigacji. Ekranów niedostępnych dla danej roli w niej nie ma. */
  get navButton(): Locator {
    return this.shell.navButton(this.navLabel);
  }

  async open(): Promise<void> {
    await this.navButton.click();
    await expect(this.navButton).toHaveAttribute('aria-current', 'page');
  }
}

/** Ekran z listą kart zadań. */
export abstract class TaskListScreen extends Screen {
  task(title: string): TaskCard {
    return new TaskCard(this.main, title);
  }
}
