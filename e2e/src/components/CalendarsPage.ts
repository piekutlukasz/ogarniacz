import type { Locator, Page } from '@playwright/test';
import { Component } from './Component';

/** Podstrona „Kalendarze” w ustawieniach. Tylko rodzic. */
export class CalendarsPage extends Component {
  readonly addButton = this.button('Dodaj kalendarz');
  readonly nameField: Locator = this.root.getByLabel('Nazwa kalendarza');
  readonly urlField: Locator = this.root.getByLabel('Link do kalendarza', { exact: true });
  readonly saveButton = this.button('Zapisz');
  /** Komunikat po dodaniu: „Dodano kalendarz … Znaleziono: …”. */
  readonly addedNote: Locator = this.root.getByRole('status');
  /** Błąd formularza albo kalendarza. */
  readonly alert: Locator = this.root.getByRole('alert');

  constructor(page: Page) {
    super(page.getByRole('dialog', { name: 'Ustawienia' }).getByRole('region', { name: 'Kalendarze', exact: true }));
  }

  /** Wypełnia i wysyła formularz dodawania. */
  async add({ name, url, scope = 'Cała rodzina' }: { name: string; url: string; scope?: 'Cała rodzina' | 'Tylko ja' }): Promise<void> {
    await this.addButton.click();
    await this.nameField.fill(name);
    await this.urlField.fill(url);
    await this.root.getByRole('radio', { name: scope, exact: true }).click();
    await this.saveButton.click();
  }

  item(name: string): Locator {
    return this.root.getByRole('listitem').filter({ hasText: name });
  }

  refresh(name: string): Locator {
    return this.item(name).getByRole('button', { name: 'Odśwież teraz', exact: true });
  }

  replaceLink(name: string): Locator {
    return this.item(name).getByRole('button', { name: 'Wymień link', exact: true });
  }

  /** Odpina kalendarz, potwierdzając pytanie przeglądarki. */
  async detach(name: string): Promise<void> {
    this.root.page().once('dialog', (dialog) => void dialog.accept());
    await this.item(name).getByRole('button', { name: 'Odepnij', exact: true }).click();
  }
}
