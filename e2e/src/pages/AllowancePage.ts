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

  /** Karta dziecka w trwającym tygodniu, razem z listą jego nagród. */
  childWeek(name: string): Locator {
    return this.thisWeek.getByRole('listitem').filter({ hasText: name }).first();
  }

  /** Pole kwoty dziecka w arkuszu stawek. */
  rateInput(name: string): Locator {
    return this.ratesSheet.getByLabel(`Kieszonkowe w złotych: ${name}`);
  }
}
