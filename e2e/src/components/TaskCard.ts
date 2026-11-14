import type { Locator } from '@playwright/test';
import { Component } from './Component';

/** Karta zadania na liście: na tablicy, w „Dziś” albo w archiwum. */
export class TaskCard extends Component {
  readonly startButton = this.button('Zacznij');
  readonly finishButton = this.button('Zakończ');
  readonly archiveButton = this.button('Archiwizuj');
  readonly restoreButton = this.button('Przywróć');
  readonly revertButton = this.button('Cofnij');
  readonly releaseButton = this.button('Oddaj');
  /** Pola edytora, który otwiera kliknięcie w nazwę. */
  readonly dueOnInput = this.root.getByLabel('Termin');
  readonly clearDueButton = this.button('Usuń termin');
  readonly saveButton = this.button('Zapisz');
  readonly titleInput = this.root.getByLabel('Nazwa zadania');
  /** Wybór koloru karteczki w edytorze: „Bez koloru” i kolory po nazwie. */
  readonly colorOptions = this.root.getByRole('radiogroup', { name: 'Kolor' });
  /** Kółko z inicjałem osoby w jej kolorze. Ozdobne, więc bez roli: pierwsze na karcie. */
  readonly avatar = this.root.locator('span[aria-hidden="true"]').first();
  /** Nazwa zadania, za którą kartę się chwyta przy przeciąganiu. */
  readonly label: Locator;

  constructor(
    scope: Locator,
    readonly title: string,
  ) {
    super(scope.getByRole('listitem').filter({ hasText: title }));
    this.label = this.root.getByText(title, { exact: true });
  }

  /** Żółta plakietka z nagrodą, np. „+10 zł”. */
  reward(amount: number): Locator {
    return this.root.getByText(`+${amount} zł`);
  }

  /** Tło karteczki. Kolor jest ozdobą bez roli i etykiety, więc sprawdzamy go stylem. */
  async background(): Promise<string> {
    return this.root.evaluate((element) => getComputedStyle(element).backgroundColor);
  }

  colorOption(name: string): Locator {
    return this.colorOptions.getByRole('radio', { name, exact: true });
  }

  /** Zmienia kolor karteczki w edytorze i zapisuje. */
  async setColor(name: string): Promise<void> {
    await this.edit();
    await this.colorOption(name).click();
    await this.saveButton.click();
  }

  /** Otwiera edytor zadania kliknięciem w nazwę. */
  async edit(): Promise<void> {
    await this.label.click();
    await this.saveButton.waitFor();
  }

  /** Czyści termin w edytorze i zapisuje zmianę. */
  async clearDue(): Promise<void> {
    await this.edit();
    await this.clearDueButton.click();
    await this.saveButton.click();
  }

  async start(): Promise<void> {
    await this.startButton.click();
  }

  async finish(): Promise<void> {
    await this.finishButton.click();
  }

  async archive(): Promise<void> {
    await this.archiveButton.click();
  }

  async restore(): Promise<void> {
    await this.restoreButton.click();
  }

  /** „Cofnij”: przenosi zadanie do poprzedniego statusu. */
  async revert(): Promise<void> {
    await this.revertButton.click();
  }

  /** „Oddaj”: zostawia zadanie dla chętnych. */
  async release(): Promise<void> {
    await this.releaseButton.click();
  }
}
