import type { Locator } from '@playwright/test';
import { Screen } from './Screen';

/** „Kieszonkowe”: dziecko widzi swoją najbliższą wypłatę, rodzic kwoty wszystkich dzieci i stawki. */
export class AllowancePage extends Screen {
  protected readonly navLabel = 'Kieszonkowe';
  /** Dziecko: kwota na najbliższy poniedziałek z rozbiciem. */
  readonly nextPayout: Locator = this.main.getByRole('region', { name: /dostaniesz/ });
  /** Dziecko: nagrody za zadania ukończone w tym tygodniu. */
  readonly earned: Locator = this.main.getByRole('region', { name: 'Zarobione w tym tygodniu' });
  /** Dziecko: otwarte zadania z nagrodą. */
  readonly openTasks: Locator = this.main.getByRole('region', { name: 'Możesz jeszcze zarobić' });
  /** Rodzic: trwający tydzień z kartą każdego dziecka. */
  readonly thisWeek: Locator = this.main.getByRole('region', { name: /^Ten tydzień/ });
  /** Rodzic: obecne stawki z przyciskiem „Zmień”. */
  readonly rates: Locator = this.main.getByRole('region', { name: 'Kieszonkowe na tydzień' });
  readonly changeRatesButton: Locator = this.rates.getByRole('button', { name: 'Zmień' });
  readonly ratesSheet: Locator = this.page.getByRole('dialog', { name: 'Kieszonkowe' });

  /** Rodzic: historia „Ostatnie wypłaty”. */
  readonly paidHistory: Locator = this.main.getByRole('region', { name: 'Ostatnie wypłaty' });
  /** Dziecko: podpis „Ostatnia wypłata: … za …” pod kieszonkowym. */
  readonly lastPayout: Locator = this.main.getByText(/^Ostatnia wypłata:/);

  /** Rodzic: wiersz dziecka do wypłaty za zamknięty tydzień (`weekLabel` z `data/dates`), z przyciskiem „Wypłacone”. */
  payoutRow(week: string, name: string): Locator {
    return this.main.getByRole('region', { name: `Do wypłaty za ${week}` }).getByRole('listitem').filter({ hasText: name });
  }

  /** Rodzic: wiersz „Ostatnich wypłat”, z przyciskiem „Cofnij”. */
  paidRow(week: string, name: string): Locator {
    return this.paidHistory.getByRole('listitem').filter({ hasText: `${name} · za ${week}` });
  }

  /** Rodzic: cofa pomyłkowo oznaczoną wypłatę; przycisk też prosi o drugie stuknięcie. */
  async cancelPayout(week: string, name: string): Promise<void> {
    const row = this.paidRow(week, name);
    await row.getByRole('button', { name: `Cofnij wypłatę: ${name} za ${week}` }).click();
    await row.getByRole('button', { name: `Potwierdź cofnięcie wypłaty: ${name} za ${week}` }).click();
  }

  /** Rodzic: oznacza wypłatę; przycisk prosi o drugie stuknięcie („Potwierdź”), żeby nie oznaczyć jej przypadkiem. */
  async markPaid(week: string, name: string): Promise<void> {
    const row = this.payoutRow(week, name);
    await row.getByRole('button', { name: 'Wypłacone' }).click();
    await row.getByRole('button', { name: 'Potwierdź' }).click();
  }

  /** Karta dziecka w trwającym tygodniu, razem z listą jego nagród. */
  childWeek(name: string): Locator {
    return this.thisWeek.getByRole('listitem').filter({ hasText: name }).first();
  }

  /** Pole kwoty dziecka w arkuszu stawek. */
  rateInput(name: string): Locator {
    return this.ratesSheet.getByLabel(`Kieszonkowe w złotych: ${name}`);
  }
}
