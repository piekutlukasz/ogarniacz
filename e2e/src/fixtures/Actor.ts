import { type Page, expect } from '@playwright/test';
import { TEST_NOW_HEADER } from '../data/dates';
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

  /**
   * Chwila, którą serwer uzna za „teraz” we wszystkich żądaniach tej osoby, z przeglądarki i z `api`
   * (nagłówek `X-Test-Now`, serwer e2e ma `TEST_CLOCK=true`). `undefined` wraca do prawdziwego zegara.
   * Działa tylko w tym kontekście przeglądarki, więc nie przeszkadza innym testom.
   */
  async setServerTime(at: Date | undefined): Promise<void> {
    await this.page.context().setExtraHTTPHeaders(at ? { [TEST_NOW_HEADER]: at.toISOString() } : {});
  }

  override async open(): Promise<void> {
    await super.open();
    await expect(this.shell.signedInAs(this.user.name)).toBeVisible();
  }
}
