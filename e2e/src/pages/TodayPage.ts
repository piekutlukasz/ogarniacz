import type { Locator } from '@playwright/test';
import { TaskCard } from '../components/TaskCard';
import { TaskListScreen } from './Screen';

/** „Dziś”: zadania z terminem na dziś i zaległe zalogowanej osoby. Ekran startowy. */
export class TodayPage extends TaskListScreen {
  protected readonly navLabel = 'Dziś';
  readonly dueTodaySection: Locator = this.main.getByRole('region', { name: /na dziś/ });
  readonly overdueSection: Locator = this.main.getByRole('region', { name: /Zaległe/ });
  /** Skrót listy zakupów; znika, gdy nic nie czeka do kupienia. */
  readonly shoppingSection: Locator = this.main.getByRole('region', { name: /Zakupy/ });

  /** Wydarzenia z kalendarzy na dziś; sekcji nie ma, gdy osoba nie widzi żadnego kalendarza. */
  readonly eventsSection: Locator = this.main.getByRole('region', { name: /Wydarzenia/ });
  /** Ostrzeżenie o nieaktualnych danych z kalendarzy. */
  readonly staleWarning: Locator = this.eventsSection.getByRole('status');

  event(title: string): Locator {
    // Dokładny tytuł: wydarzenie „X (cały dzień)” nie ma pasować do „X”.
    return this.eventsSection.getByRole('listitem').filter({ has: this.page.getByText(title, { exact: true }) });
  }

  dueTodayTask(title: string): TaskCard {
    return new TaskCard(this.dueTodaySection, title);
  }
}
