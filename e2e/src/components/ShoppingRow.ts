import { type Locator, expect } from '@playwright/test';
import { Component } from './Component';

/** Produkt na liście zakupów: pole do odhaczenia, ilość i przycisk zmiany. */
export class ShoppingRow extends Component {
  /** Całe pole z nazwą odhacza produkt. */
  readonly checkbox: Locator;
  readonly editButton: Locator;
  /** Nazwa produktu. Samo pole wyboru jest ukryte za kółkiem, więc klika się w nazwę, jak na telefonie. */
  readonly label: Locator;
  readonly nameInput = this.root.getByLabel('Nazwa produktu');
  readonly quantityInput = this.root.getByLabel('Ilość produktu');
  readonly saveButton = this.button('Zapisz');
  readonly removeButton = this.button('Usuń z listy');

  constructor(
    scope: Locator,
    readonly name: string,
  ) {
    // W trybie zmiany nazwa jest w polu tekstowym, więc wiersz rozpoznaje też formularz z jego nazwą.
    const items = scope.getByRole('listitem');
    super(items.filter({ hasText: name }).or(items.filter({ has: scope.page().getByRole('form', { name: `Zmiana: ${name}` }) })));
    this.checkbox = this.root.getByRole('checkbox');
    this.label = this.root.getByText(name, { exact: true });
    this.editButton = this.root.getByRole('button', { name: `Zmień ${name}` });
  }

  async toggle(): Promise<void> {
    await this.label.click();
  }

  /**
   * Otwiera formularz zmiany. Wiersz przerysowuje się, gdy z serwera wraca świeża lista, i potrafi
   * pochłonąć kliknięcie, więc klikamy do skutku, aż formularz naprawdę się pokaże.
   */
  private async openEditor(): Promise<void> {
    await expect(async () => {
      if (!(await this.saveButton.isVisible())) await this.editButton.click({ timeout: 1000 });
      await expect(this.saveButton).toBeVisible({ timeout: 1000 });
    }).toPass();
  }

  async changeQuantity(quantity: string): Promise<void> {
    await this.openEditor();
    await this.quantityInput.fill(quantity);
    await this.saveButton.click();
  }

  async remove(): Promise<void> {
    await this.openEditor();
    await this.removeButton.click();
  }
}
