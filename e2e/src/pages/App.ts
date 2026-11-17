import { type Page, expect } from '@playwright/test';
import { AppShell } from '../components/AppShell';
import { AllowancePage } from './AllowancePage';
import { ArchivePage } from './ArchivePage';
import { BoardPage } from './BoardPage';
import { RecurrencesPage } from './RecurrencesPage';
import { ShoppingPage } from './ShoppingPage';
import { TodayPage } from './TodayPage';

/** Tryb wymuszony w ustawieniach. */
export type Theme = 'light' | 'dark';
/** Wygląd z ustawień: „Lodówka”, „Wieczorny las”, „Naklejki”. */
export type Look = 'fridge' | 'forest' | 'stickers';

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

  /**
   * Ustawia tryb i wygląd tak, jak zapisują je ustawienia (`localStorage`, klucze z apps/web/src/lib/theme.ts),
   * i otwiera aplikację od nowa. Dotyczy tylko tego kontekstu przeglądarki, więc nie przeszkadza innym testom.
   */
  async openWithAppearance(theme: Theme, look: Look): Promise<void> {
    await this.page.goto('/');
    await this.page.evaluate(
      ([themeValue, lookValue]) => {
        localStorage.setItem('ogarniacz.theme', themeValue);
        if (lookValue === 'fridge') localStorage.removeItem('ogarniacz.look');
        else localStorage.setItem('ogarniacz.look', lookValue);
      },
      [theme, look] as const,
    );
    await this.open();
    await expect(this.page.locator('html')).toHaveAttribute('data-theme', theme);
  }

  /** Otwiera aplikację na ekranie startowym („Dziś”). */
  async open(): Promise<void> {
    await this.page.goto('/');
    await expect(this.shell.navigation).toBeVisible();
  }
}
