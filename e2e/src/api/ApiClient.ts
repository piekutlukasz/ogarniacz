import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { Account, Calendar, CalendarScope, FamilyMember, Task, UpdateTask } from '@ogarniacz/shared';
import type { TestUser } from '../data/users';

export type NewTask = {
  title: string;
  /** Pominięta: rodzic tworzy zadanie bez osoby, dziecko dla siebie. `null` jawnie bez osoby. */
  assignee?: TestUser | null;
  dueOn?: string | null;
  /** Tylko rodzic. */
  reward?: number;
};

/**
 * Klient API do przygotowania danych (arrange). Działa na sesji kontekstu, z którego pochodzi
 * `request`, więc wykonuje żądania jako zalogowana w nim osoba. Interfejs testujemy przez
 * page objecty, a przez API tylko ustawiamy stan, którego dany test nie sprawdza.
 */
export class ApiClient {
  constructor(private readonly request: APIRequestContext) {}

  async logIn(user: TestUser): Promise<void> {
    await this.send(this.request.post('/api/auth/login', { data: { login: user.login, password: user.password } }));
  }

  async family(): Promise<FamilyMember[]> {
    return this.json(this.request.get('/api/users'));
  }

  async userId(user: TestUser): Promise<string> {
    const member = (await this.family()).find((candidate) => candidate.name === user.name);
    if (!member) throw new Error(`Brak konta „${user.name}” w rodzinie`);
    return member.id;
  }

  async createTask({ title, assignee, dueOn, reward }: NewTask): Promise<Task> {
    const assigneeId = assignee === undefined ? undefined : assignee && (await this.userId(assignee));
    return this.json(this.request.post('/api/tasks', { data: { title, assigneeId, dueOn, reward } }));
  }

  async updateTask(id: string, change: UpdateTask): Promise<Task> {
    return this.json(this.request.patch(`/api/tasks/${id}`, { data: change }));
  }

  async addCalendar(input: { name: string; url: string; scope?: CalendarScope }): Promise<Calendar> {
    return this.json(this.request.post('/api/calendars', { data: { scope: 'family', ...input } }));
  }

  /** Odpina kalendarz o podanej nazwie, jeśli istnieje. Sprzątanie po teście: baza e2e nie jest czyszczona. */
  async detachCalendar(name: string): Promise<void> {
    const calendars = await this.json<Calendar[]>(this.request.get('/api/calendars'));
    for (const calendar of calendars.filter((candidate) => candidate.name === name)) {
      await this.send(this.request.patch(`/api/calendars/${calendar.id}`, { data: { archived: true } }));
    }
  }

  /**
   * Wyłącza aktywne konta dzieci, których login zaczyna się od `prefix`. Sprzątanie po testach zaproszeń: baza e2e
   * nie jest czyszczona, a wyłączone konto nie liczy się do limitu 10 aktywnych. Wymaga sesji i hasła rodzica.
   */
  async disableAccounts(prefix: string, parentPassword: string): Promise<void> {
    const accounts = await this.json<Account[]>(this.request.get('/api/users/accounts'));
    for (const account of accounts.filter((candidate) => candidate.login.startsWith(prefix) && !candidate.disabled)) {
      await this.send(this.request.patch(`/api/users/${account.id}`, { data: { disabled: true, confirm: parentPassword } }));
    }
  }

  private async json<T>(pending: Promise<APIResponse>): Promise<T> {
    return (await this.send(pending)).json() as Promise<T>;
  }

  private async send(pending: Promise<APIResponse>): Promise<APIResponse> {
    const response = await pending;
    if (!response.ok()) {
      throw new Error(`${response.status()} ${response.url()}: ${await response.text()}`);
    }
    return response;
  }
}
