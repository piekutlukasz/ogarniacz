import type { Locator, Page } from '@playwright/test';
import { CalendarsPage } from './CalendarsPage';
import { FamilyPage } from './FamilyPage';
import { SettingsSheet } from './SettingsSheet';

/** Nagłówek z zalogowaną osobą, ustawienia i nawigacja między ekranami: wspólne dla całej aplikacji. */
export class AppShell {
  readonly header: Locator;
  readonly navigation: Locator;
  /** Imię w nagłówku, które otwiera ustawienia. */
  readonly settingsButton: Locator;
  readonly settings: SettingsSheet;
  readonly calendars: CalendarsPage;
  readonly family: FamilyPage;
  /** Baner „Wersja demonstracyjna”, widoczny tylko w trybie demo. */
  readonly demoBanner: Locator;

  constructor(page: Page) {
    this.header = page.getByRole('banner');
    this.navigation = page.getByRole('navigation', { name: 'Ekrany' });
    this.settingsButton = this.header.getByRole('button', { name: /^Ustawienia/ });
    this.settings = new SettingsSheet(page);
    this.calendars = new CalendarsPage(page);
    this.family = new FamilyPage(page);
    this.demoBanner = page.getByRole('note').filter({ hasText: 'Wersja demonstracyjna' });
  }

  /** Imię zalogowanej osoby w nagłówku. */
  signedInAs(name: string): Locator {
    return this.header.getByText(name, { exact: true });
  }

  navButton(label: string): Locator {
    return this.navigation.getByRole('button', { name: label, exact: true });
  }

  async openSettings(): Promise<SettingsSheet> {
    await this.settingsButton.click();
    await this.settings.root.waitFor();
    return this.settings;
  }

  /** Ustawienia, a w nich podstrona „Kalendarze” (tylko rodzic). */
  async openCalendars(): Promise<CalendarsPage> {
    await (await this.openSettings()).openPage('Kalendarze');
    return this.calendars;
  }

  /** Ustawienia, a w nich podstrona „Rodzina” (tylko rodzic). */
  async openFamily(): Promise<FamilyPage> {
    await (await this.openSettings()).openPage('Rodzina');
    return this.family;
  }

  /** Wylogowanie jest w ustawieniach. */
  async logOut(): Promise<void> {
    await (await this.openSettings()).logoutButton.click();
  }
}
