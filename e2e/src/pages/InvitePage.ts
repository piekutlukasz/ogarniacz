import { type Locator, type Page, expect } from '@playwright/test';
import { App } from './App';

/** Ekran otwierany linkiem `/#zaproszenie=…`: pytanie o wylogowanie, ustawienie hasła i powitanie po przyjęciu. */
export class InvitePage {
  readonly passwordInput: Locator;
  readonly repeatInput: Locator;
  readonly submitButton: Locator;
  readonly alert: Locator;
  /** Pytanie, gdy na telefonie jest zalogowana inna osoba. */
  readonly logOutAndAcceptButton: Locator;
  readonly notNowButton: Locator;
  readonly goToAppButton: Locator;
  /** Przypomnienie o dodaniu aplikacji do ekranu początkowego (poza zainstalowaną aplikacją). */
  readonly installHint: Locator;

  constructor(private readonly page: Page) {
    this.passwordInput = page.getByLabel(/^(Nowe hasło|Hasło)$/);
    this.repeatInput = page.getByLabel('Powtórz hasło');
    this.submitButton = page.getByRole('button', { name: 'Ustaw hasło i wejdź' });
    this.alert = page.getByRole('alert');
    this.logOutAndAcceptButton = page.getByRole('button', { name: 'Wyloguj i przyjmij zaproszenie' });
    this.notNowButton = page.getByRole('button', { name: 'Nie teraz' });
    this.goToAppButton = page.getByRole('button', { name: 'Przejdź do aplikacji' });
    this.installHint = page.getByText('Dodaj Ogarniacza do ekranu początkowego');
  }

  /** Powitanie z imieniem z zaproszenia. */
  greeting(name: string): Locator {
    return this.page.getByText(`Cześć, ${name}!`, { exact: true });
  }

  /** Otwiera link z zaproszenia. Pełne przeładowanie, tak jak otwarcie linku z wiadomości. */
  async open(link: string): Promise<void> {
    await this.page.goto('about:blank');
    await this.page.goto(link);
  }

  async setPassword(password: string, repeat = password): Promise<void> {
    await this.passwordInput.fill(password);
    await this.repeatInput.fill(repeat);
    await this.submitButton.click();
  }

  /** Ustawia hasło, przechodzi przez powitanie i czeka na zalogowaną osobę. */
  async acceptAs(name: string, password: string): Promise<App> {
    await this.setPassword(password);
    await this.goToAppButton.click();
    const app = new App(this.page);
    await expect(app.shell.signedInAs(name)).toBeVisible();
    return app;
  }
}
