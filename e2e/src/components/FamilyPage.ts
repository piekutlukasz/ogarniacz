import type { Locator, Page } from '@playwright/test';
import { Component } from './Component';

/**
 * Podstrona „Rodzina” w ustawieniach (tylko rodzic): konta, zaproszenia i wejście do dziennika logowań.
 * Akcje konta pokazują się po stuknięciu w osobę; `accountAction` robi to sam.
 */
export class FamilyPage extends Component {
  readonly inviteButton = this.button('Zaproś osobę');
  /** Komunikat po wyłączeniu konta albo unieważnieniu zaproszenia. */
  readonly notice: Locator = this.root.getByRole('status');
  readonly alert: Locator = this.root.getByRole('alert');
  /** Link z tokenem, pokazywany raz, zaraz po utworzeniu zaproszenia albo linku do nowego hasła. */
  readonly createdLink: Locator = this.root.getByRole('region', { name: 'Link zaproszenia' });
  readonly linkField: Locator = this.createdLink.getByLabel('Link');
  readonly qrCode: Locator = this.createdLink.getByRole('img', { name: /^Kod QR/ });
  readonly doneButton: Locator = this.createdLink.getByRole('button', { name: 'Gotowe', exact: true });
  /** Pozycja otwierająca podstronę „Dziennik logowań”. */
  readonly authLog: Locator = this.root.getByRole('button', { name: /^Dziennik logowań/ });
  /** Wpisy na podstronie dziennika, która zastępuje „Rodzinę” w tym samym arkuszu. */
  readonly authLogEntries: Locator;

  constructor(page: Page) {
    const settings = page.getByRole('dialog', { name: 'Ustawienia' });
    super(settings.getByRole('region', { name: 'Rodzina', exact: true }));
    this.authLogEntries = settings
      .getByRole('region', { name: 'Dziennik logowań', exact: true })
      .getByRole('list', { name: 'Wpisy dziennika' })
      .getByRole('listitem');
  }

  /** Zaprasza nową osobę i zwraca link z tokenem. */
  async invite({ name, login, role = 'Dziecko', confirm }: { name: string; login: string; role?: 'Dziecko' | 'Rodzic'; confirm: string }): Promise<string> {
    await this.inviteButton.click();
    const form = this.root.getByRole('form', { name: 'Zaproszenie nowej osoby' });
    await form.getByLabel('Imię').fill(name);
    await form.getByLabel('Login').fill(login);
    await form.getByRole('radio', { name: role, exact: true }).click();
    await form.getByLabel('Twoje hasło').fill(confirm);
    await form.getByRole('button', { name: 'Utwórz zaproszenie' }).click();
    await this.linkField.waitFor();
    return this.linkField.inputValue();
  }

  /** Konto na liście „Konta”. */
  account(name: string): Locator {
    return this.root.getByRole('listitem', { name, exact: true });
  }

  /** Oczekujące zaproszenie dla osoby. */
  pendingInvite(name: string): Locator {
    return this.root.getByRole('listitem', { name: `Zaproszenie: ${name}`, exact: true });
  }

  /** Akcja przy koncie („Nowe hasło”, „Wyłącz konto”, „Włącz konto”) potwierdzona hasłem rodzica. */
  async accountAction(name: string, action: 'Nowe hasło' | 'Wyłącz konto' | 'Włącz konto', confirm: string): Promise<void> {
    const row = this.account(name);
    const actionButton = row.getByRole('button', { name: action, exact: true });
    if (!(await actionButton.isVisible())) await row.getByRole('button', { expanded: false }).click();
    await actionButton.click();
    await row.getByLabel('Twoje hasło').fill(confirm);
    await row.getByRole('button', { name: action === 'Nowe hasło' ? 'Utwórz link' : action === 'Wyłącz konto' ? 'Wyłącz' : 'Włącz', exact: true }).click();
  }

  /** Link do nowego hasła dla osoby; zwraca link z tokenem. */
  async passwordResetLink(name: string, confirm: string): Promise<string> {
    await this.accountAction(name, 'Nowe hasło', confirm);
    await this.linkField.waitFor();
    return this.linkField.inputValue();
  }
}
