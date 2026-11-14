import { type Locator, type Page, expect } from '@playwright/test';
import { App } from './App';

/** Kreator pierwszego uruchomienia: zamiast logowania, gdy baza nie ma żadnego konta. */
export class SetupPage {
  readonly heading: Locator;
  readonly nameInput: Locator;
  readonly loginInput: Locator;
  readonly passwordInput: Locator;
  readonly repeatInput: Locator;
  readonly codeInput: Locator;
  readonly submitButton: Locator;
  readonly alert: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Pierwsze uruchomienie' });
    this.nameInput = page.getByLabel('Imię', { exact: true });
    this.loginInput = page.getByLabel('Login', { exact: true });
    this.passwordInput = page.getByLabel('Hasło', { exact: true });
    this.repeatInput = page.getByLabel('Powtórz hasło', { exact: true });
    this.codeInput = page.getByLabel('Kod pierwszego uruchomienia', { exact: true });
    this.submitButton = page.getByRole('button', { name: 'Załóż konto i wejdź' });
    this.alert = page.getByRole('alert');
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  async submit({ name, login, password, code }: { name: string; login: string; password: string; code: string }): Promise<void> {
    await this.nameInput.fill(name);
    await this.loginInput.fill(login);
    await this.passwordInput.fill(password);
    await this.repeatInput.fill(password);
    await this.codeInput.fill(code);
    await this.submitButton.click();
  }

  /** Zakłada pierwszego rodzica i czeka na zalogowaną osobę. */
  async createParent(input: { name: string; login: string; password: string; code: string }): Promise<App> {
    await this.submit(input);
    const app = new App(this.page);
    await expect(app.shell.signedInAs(input.name)).toBeVisible();
    return app;
  }
}
