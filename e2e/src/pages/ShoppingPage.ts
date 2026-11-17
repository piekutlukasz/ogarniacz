import { type Locator, expect } from '@playwright/test';
import type { ShoppingItem } from '@ogarniacz/shared';
import { ShoppingRow } from '../components/ShoppingRow';
import { Screen } from './Screen';

/** „Zakupy”: wspólna lista rodziny z podpowiedziami z historii. */
export class ShoppingPage extends Screen {
  protected readonly navLabel = 'Zakupy';
  readonly nameInput: Locator = this.main.getByLabel('Nowy produkt');
  readonly quantityInput: Locator = this.main.getByLabel('Ilość', { exact: true });
  readonly addButton: Locator = this.main.getByRole('button', { name: 'Dodaj', exact: true });
  readonly toBuySection: Locator = this.main.getByRole('region', { name: /Do kupienia/ });
  readonly cartSection: Locator = this.main.getByRole('region', { name: /W koszyku/ });
  readonly clearButton: Locator = this.main.getByRole('button', { name: 'Wyczyść kupione' });
  /** Informacja o pracy bez sieci i niewysłanych zmianach. */
  readonly syncNote: Locator = this.main.getByRole('status');

  toBuy(name: string): ShoppingRow {
    return new ShoppingRow(this.toBuySection, name);
  }

  inCart(name: string): ShoppingRow {
    return new ShoppingRow(this.cartSection, name);
  }

  suggestion(name: string): Locator {
    return this.main.getByRole('button', { name: `Dodaj ${name}`, exact: true });
  }

  /** Wpisuje i dodaje produkt, bez czekania na wiersz, np. gdy po dodaniu aplikacja pokaże logowanie. */
  async submit(name: string, quantity?: string): Promise<void> {
    await this.nameInput.fill(name);
    if (quantity) await this.quantityInput.fill(quantity);
    await this.addButton.click();
  }

  async add(name: string, quantity?: string): Promise<ShoppingRow> {
    await this.submit(name, quantity);
    const row = this.toBuy(name);
    await expect(row.root).toBeVisible();
    return row;
  }

  /**
   * Lista jest wspólna dla całej rodziny, a testy biegną równolegle na jednej bazie. Ten ekran pokazuje
   * tylko produkty z `marker` w nazwie, więc „Wyczyść kupione” nie zdejmie produktów innych testów.
   */
  async showOnly(marker: string): Promise<void> {
    await this.page.route('**/api/shopping', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      try {
        const response = await route.fetch();
        const items = (await response.json()) as ShoppingItem[];
        await route.fulfill({ response, json: items.filter((item) => item.name.includes(marker)) });
      } catch {
        // Lista odświeża się co kilka sekund, więc żądanie może trwać jeszcze przy zamykaniu strony po teście.
        // Gdyby zawiodło w trakcie testu, ekran pokaże błąd i test i tak nie przejdzie.
      }
    });
  }
}
