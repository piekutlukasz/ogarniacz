import { type Page, expect } from '@playwright/test';
import { AppShell } from '../components/AppShell';
import { AllowancePage } from './AllowancePage';
import { ArchivePage } from './ArchivePage';
import { BoardPage } from './BoardPage';
import { RecurrencesPage } from './RecurrencesPage';
import { ShoppingPage } from './ShoppingPage';
import { TodayPage } from './TodayPage';

/** Zalogowana aplikacja: wspólna rama i wszystkie ekrany na jednej karcie przeglądarki. */
export class App {
  readonly shell: AppShell;
  readonly today: TodayPage;
  readonly board: BoardPage;
  readonly recurrences: RecurrencesPage;
  readonly shopping: ShoppingPage;
  readonly archive: ArchivePage;
  readonly allowance: AllowancePage;

  constructor(readonly page: Page) {
    this.shell = new AppShell(page);
    this.today = new TodayPage(page);
    this.board = new BoardPage(page);
    this.recurrences = new RecurrencesPage(page);
    this.shopping = new ShoppingPage(page);
    this.archive = new ArchivePage(page);
    this.allowance = new AllowancePage(page);
  }

  /** Otwiera aplikację tak jak kliknięcie powiadomienia: adres z parametrem `ekran`. */
  async openFromNotification(screen: string): Promise<void> {
    await this.page.goto(`/?ekran=${screen}`);
    await expect(this.shell.navigation).toBeVisible();
  }

  /** Otwiera aplikację na ekranie startowym („Dziś”). */
  async open(): Promise<void> {
    await this.page.goto('/');
    await expect(this.shell.navigation).toBeVisible();
  }
}
