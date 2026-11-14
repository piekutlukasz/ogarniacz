import type { Locator, Page } from '@playwright/test';
import { Component } from './Component';

/** Pozycje menu ustawień. „Rodzina” i „Kalendarze” są tylko dla rodzica. */
export type SettingsPage = 'Wygląd i kolor' | 'Powiadomienia' | 'Hasło i urządzenia' | 'Rodzina' | 'Kalendarze';

/**
 * Arkusz ustawień otwierany imieniem w nagłówku: menu z pozycjami i wylogowaniem, a pod pozycjami podstrony
 * w tym samym arkuszu. Lokatory podstron działają dopiero po wejściu na nie (`openPage`).
 */
export class SettingsSheet extends Component {
  readonly closeButton = this.button('Zamknij ustawienia');
  readonly logoutButton = this.button('Wyloguj');
  /** Powrót z podstrony do menu albo do podstrony wyżej. */
  readonly backButton: Locator = this.root.getByRole('button', { name: /^Wróć:/ });

  readonly themeOptions: Locator = this.root.getByRole('radiogroup', { name: 'Tryb' });
  readonly lookOptions: Locator = this.root.getByRole('radiogroup', { name: 'Wygląd' });
  readonly colorOptions: Locator = this.root.getByRole('radiogroup', { name: 'Mój kolor' });

  /** Podstrona „Powiadomienia”: pozycja jest w menu tylko, gdy serwer ma klucze VAPID. */
  readonly notifications: Locator = this.subPage('Powiadomienia');
  /** Przycisk zgody (przeglądarka z obsługą push) albo instrukcja (iPhone poza ekranem głównym). */
  readonly enableNotificationsButton: Locator = this.notifications.getByRole('button', { name: 'Włącz powiadomienia na tym telefonie' });

  /** Podstrona „Hasło i urządzenia”; w trybie demo nie ma jej w menu. */
  readonly passwordSection: Locator = this.subPage('Hasło i urządzenia');
  readonly changePasswordButton: Locator = this.passwordSection.getByRole('button', { name: 'Zmień hasło', exact: true });
  readonly logoutOthersButton: Locator = this.passwordSection.getByRole('button', { name: 'Wyloguj inne urządzenia', exact: true });
  /** Potwierdzenie po zmianie hasła albo wylogowaniu innych urządzeń. */
  readonly passwordStatus: Locator = this.passwordSection.getByRole('status');
  /** Błąd formularza zmiany hasła, np. złe obecne hasło. */
  readonly passwordError: Locator = this.passwordSection.getByRole('alert');

  constructor(page: Page) {
    super(page.getByRole('dialog', { name: 'Ustawienia' }));
  }

  /** Pozycja menu. Jej nazwa zaczyna się od tytułu, a dalej jest stan, np. „Kalendarze Problem: 1”. */
  menuItem(title: SettingsPage): Locator {
    return this.root.getByRole('button', { name: new RegExp(`^${title}`) });
  }

  /** Podstrona arkusza po tytule. */
  subPage(title: string): Locator {
    return this.root.getByRole('region', { name: title, exact: true });
  }

  /** Wchodzi z menu na podstronę i czeka na nią. */
  async openPage(title: SettingsPage): Promise<Locator> {
    await this.menuItem(title).click();
    const subPage = this.subPage(title);
    await subPage.waitFor();
    return subPage;
  }

  /** Otwiera formularz zmiany hasła, wypełnia go i zapisuje. Wynik sprawdza test (`passwordStatus`, `passwordError`). */
  async changePassword(current: string, next: string, repeat = next): Promise<void> {
    if (await this.changePasswordButton.isVisible()) await this.changePasswordButton.click();
    await this.passwordSection.getByLabel('Obecne hasło').fill(current);
    await this.passwordSection.getByLabel('Nowe hasło', { exact: true }).fill(next);
    await this.passwordSection.getByLabel('Powtórz nowe hasło').fill(repeat);
    await this.passwordSection.getByRole('button', { name: 'Zapisz hasło' }).click();
  }

  /** „Jak w telefonie”, „Jasny” albo „Ciemny”; na podstronie „Wygląd i kolor”. */
  theme(label: string): Locator {
    return this.themeOptions.getByRole('radio', { name: label, exact: true });
  }

  /** „Lodówka”, „Wieczorny las” albo „Naklejki”; na podstronie „Wygląd i kolor”. */
  look(label: string): Locator {
    return this.lookOptions.getByRole('radio', { name: label, exact: true });
  }

  /** Kolor po polskiej nazwie, np. „Liliowy”; na podstronie „Wygląd i kolor”. */
  color(name: string): Locator {
    return this.colorOptions.getByRole('radio', { name, exact: true });
  }
}
