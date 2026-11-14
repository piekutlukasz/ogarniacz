import { type Locator, type Page, expect } from '@playwright/test';
import type { TestUser } from '../data/users';
import { App } from './App';

export class LoginPage {
  readonly loginInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly error: Locator;
  /** Wybór konta przykładowego nad formularzem; jest tylko na serwerze w trybie demo. */
  readonly demoChooser: Locator;

  constructor(readonly page: Page) {
    this.loginInput = page.getByLabel('Login');
    this.passwordInput = page.getByLabel('Hasło');
    this.submitButton = page.getByRole('button', { name: 'Zaloguj' });
    this.error = page.getByRole('alert');
    this.demoChooser = page.getByText('Wejdź jako:', { exact: true });
  }

  /** Przycisk „Wejdź jako…” konta przykładowego; nazwa przycisku to imię i rola. */
  demoAccount(user: TestUser): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^${user.name}\\b`) });
  }

  async goto(): Promise<void> {
    await this.page.goto('/');
  }

  async submit(login: string, password: string): Promise<void> {
    await this.loginInput.fill(login);
    await this.passwordInput.fill(password);
    await this.submitButton.click();
  }

  /** Wchodzi na konto przykładowe jednym przyciskiem, bez hasła, i czeka na zalogowaną osobę. */
  async enterDemoAs(user: TestUser): Promise<App> {
    await this.demoAccount(user).click();
    const app = new App(this.page);
    await expect(app.shell.signedInAs(user.name)).toBeVisible();
    return app;
  }

  /** Loguje przez formularz i czeka, aż aplikacja pokaże zalogowaną osobę. */
  async logInAs(user: TestUser): Promise<App> {
    await this.submit(user.login, user.password);
    const app = new App(this.page);
    await expect(app.shell.signedInAs(user.name)).toBeVisible();
    return app;
  }
}
