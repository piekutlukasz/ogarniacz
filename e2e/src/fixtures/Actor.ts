import { type Page, expect } from '@playwright/test';
import type { ApiClient } from '../api/ApiClient';
import type { TestUser } from '../data/users';
import { App } from '../pages/App';

/**
 * Osoba z rodziny w osobnym kontekście przeglądarki, zalogowana zapisaną sesją z projektu `setup`.
 * Kilku aktorów w jednym teście działa naraz, każdy na swoim ekranie, bez przelogowywania.
 *
 * Nie wylogowuj aktora: wylogowanie usuwa sesję na serwerze, a dzielą ją wszystkie testy.
 * Wylogowanie sprawdzaj na świeżym logowaniu przez `LoginPage`.
 */
export class Actor extends App {
  constructor(
    page: Page,
    readonly user: TestUser,
    /** Przygotowanie danych jako ta osoba. */
    readonly api: ApiClient,
  ) {
    super(page);
  }

  override async open(): Promise<void> {
    await super.open();
    await expect(this.shell.signedInAs(this.user.name)).toBeVisible();
  }
}
