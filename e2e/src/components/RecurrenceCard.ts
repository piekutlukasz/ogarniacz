import type { Locator } from '@playwright/test';
import { Component } from './Component';

/** Reguła na liście zadań cyklicznych. */
export class RecurrenceCard extends Component {
  readonly pauseButton = this.button('Pauza');
  readonly resumeButton = this.button('Wznów');
  readonly pauseUntilInput = this.root.getByLabel('Koniec pauzy');
  readonly confirmPauseButton = this.button('Wstrzymaj');

  constructor(
    scope: Locator,
    readonly title: string,
  ) {
    super(scope.getByRole('listitem').filter({ hasText: title }));
  }

  /** Wstrzymuje regułę do podanego dnia (RRRR-MM-DD) albo, bez daty, do wznowienia. */
  async pause(until?: string): Promise<void> {
    await this.pauseButton.click();
    if (until) await this.pauseUntilInput.fill(until);
    await this.confirmPauseButton.click();
  }

  async resume(): Promise<void> {
    await this.resumeButton.click();
  }
}
