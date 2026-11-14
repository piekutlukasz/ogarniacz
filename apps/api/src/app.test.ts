import { type Task, familyMemberSchema, familySchema, taskListSchema, taskSchema, todaySchema } from '@ogarniacz/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_REQUEST_BYTES, createApp } from './app';
import { createUser, setDisabled } from './auth/users';
import { type Db, openDatabase } from './db/client';
import { taskEvents } from './db/schema';

let db: Db;
let close: () => void;
let app: ReturnType<typeof createApp>;
let cookie: string;
let childCookie: string;
let clock: number;
let parentId: string;
let childId: string;
let otherChildId: string;

function sendJson(method: 'POST' | 'PATCH', path: string, body: unknown, session = cookie) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: session },
    body: JSON.stringify(body),
  });
}

async function addTask(title: string, extra: Record<string, unknown> = {}, session = cookie): Promise<Task> {
  const response = await sendJson('POST', '/api/tasks', { title, ...extra }, session);
  expect(response.status).toBe(201);
  return taskSchema.parse(await response.json());
}

async function listTasks(query = ''): Promise<Task[]> {
  const response = await app.request(`/api/tasks${query}`, { headers: { Cookie: cookie } });
  return taskListSchema.parse(await response.json());
}

async function today(session: string) {
  const response = await app.request('/api/tasks/today', { headers: { Cookie: session } });
  expect(response.status).toBe(200);
  return todaySchema.parse(await response.json());
}

/** Loguje się i zwraca nagłówek Cookie z sesją. */
async function logIn(login: string, password: string): Promise<string> {
  const response = await sendJson('POST', '/api/auth/login', { login, password }, '');
  expect(response.status).toBe(200);
  return (response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
}

beforeEach(async () => {
  ({ db, close } = openDatabase(':memory:', './drizzle'));
  // 8 listopada, 12:00 w Polsce.
  clock = Date.parse('2026-11-08T11:00:00Z');
  app = createApp({ db, now: () => new Date(clock) });
  parentId = (await createUser(db, { login: 'tata', name: 'Tata', role: 'parent', password: 'haslo-rodzica' })).id;
  childId = (await createUser(db, { login: 'zosia', name: 'Zosia', role: 'child', password: 'haslo-dziecka' })).id;
  otherChildId = (await createUser(db, { login: 'kuba', name: 'Kuba', role: 'child', password: 'haslo-kuby' })).id;
  cookie = await logIn('tata', 'haslo-rodzica');
  childCookie = await logIn('zosia', 'haslo-dziecka');
});

afterEach(() => close());

describe('API', () => {
  it('odpowiada na health check', async () => {
    const response = await app.request('/api/health');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
  });

  it('zwraca 404 dla nieznanej ścieżki API', async () => {
    const response = await app.request('/api/nie-ma-takiej', { headers: { Cookie: cookie } });

    expect(response.status).toBe(404);
  });
});

describe('postać błędów', () => {
  it('błąd walidacji niesie komunikat ze schematu', async () => {
    const response = await sendJson('POST', '/api/tasks', { title: 'ab' });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.stringMatching(/znak/) });
  });

  it('pole bez własnego komunikatu dostaje ogólny tekst z nazwą pola', async () => {
    const response = await sendJson('POST', '/api/tasks', {});

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Niepoprawne dane w polu „title”' });
  });

  it('niepoprawny parametr zapytania też ma postać { error }', async () => {
    const response = await app.request('/api/tasks?archived=nie', { headers: { Cookie: cookie } });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: expect.any(String) });
  });

  it('niepoprawny JSON daje komunikat zamiast tekstu biblioteki', async () => {
    const response = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: '{"title":',
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Niepoprawne dane żądania' });
  });

  it('nieoczekiwany błąd daje ogólny komunikat, a szczegóły trafiają tylko do logu', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    close();

    const response = await app.request('/api/tasks', { headers: { Cookie: cookie } });

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Coś poszło nie tak' });
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('limit rozmiaru żądania', () => {
  it('odrzuca za duże żądanie jeszcze przed logowaniem', async () => {
    const response = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: 'tata', password: 'x'.repeat(MAX_REQUEST_BYTES) }),
    });

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({ error: 'Za duże żądanie' });
  });

  it('przyjmuje największe prawdziwe żądanie: czyszczenie 500 pozycji zakupów', async () => {
    const ids = Array.from({ length: 500 }, () => crypto.randomUUID());
    const response = await sendJson('POST', '/api/shopping/clear', { ids });

    expect(response.status).not.toBe(413);
  });
});

describe('nagłówki bezpieczeństwa', () => {
  it('każda odpowiedź ma CSP bez zewnętrznych źródeł i zakaz osadzania w ramce', async () => {
    for (const path of ['/api/health', '/api/nie-ma-takiej']) {
      const response = await app.request(path);
      const csp = response.headers.get('Content-Security-Policy') ?? '';

      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain('unsafe-inline');
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    }
  });

  it('nie wysyła HSTS, bo dodaje go proxy kończące TLS', async () => {
    const response = await app.request('/api/health');

    expect(response.headers.get('Strict-Transport-Security')).toBeNull();
  });
});

describe('zadania', () => {
  it('dodaje zadanie jako "todo" i pokazuje je na liście', async () => {
    const task = await addTask('  Wynieść śmieci  ');

    expect(task.title).toBe('Wynieść śmieci');
    expect(task.status).toBe('todo');
    expect(await listTasks()).toEqual([task]);
  });

  it('odrzuca pusty tytuł', async () => {
    const response = await sendJson('POST', '/api/tasks', { title: '   ' });

    expect(response.status).toBe(400);
    expect(await listTasks()).toEqual([]);
  });

  it('przyjmuje tytuł od 3 do 250 znaków', async () => {
    expect((await sendJson('POST', '/api/tasks', { title: 'ab' })).status).toBe(400);
    expect((await sendJson('POST', '/api/tasks', { title: 'x'.repeat(251) })).status).toBe(400);
    expect((await sendJson('POST', '/api/tasks', { title: 'abc' })).status).toBe(201);
    expect((await sendJson('POST', '/api/tasks', { title: 'x'.repeat(250) })).status).toBe(201);

    const [task] = await listTasks();
    expect((await sendJson('PATCH', `/api/tasks/${task!.id}`, { title: 'ab' })).status).toBe(400);
  });

  it('zmienia status i zapisuje historię', async () => {
    const task = await addTask('Podlać kwiaty');

    const response = await sendJson('PATCH', `/api/tasks/${task.id}`, { status: 'in_progress' });

    expect(response.status).toBe(200);
    expect(taskSchema.parse(await response.json()).status).toBe('in_progress');

    const events = db.select().from(taskEvents).where(eq(taskEvents.taskId, task.id)).all();
    expect(events.map((event) => event.type)).toEqual(['created', 'updated']);
    expect(events[1]?.changes).toEqual({ status: 'in_progress' });
  });

  it('ukrywa zarchiwizowane zadanie, ale go nie kasuje', async () => {
    const task = await addTask('Kupić baterie');

    const response = await sendJson('PATCH', `/api/tasks/${task.id}`, { archived: true });

    expect(taskSchema.parse(await response.json()).archivedAt).not.toBeNull();
    expect(await listTasks()).toEqual([]);
  });

  it('zwraca 404 przy zmianie nieistniejącego zadania', async () => {
    const response = await sendJson('PATCH', '/api/tasks/nie-ma-takiego', { status: 'done' });

    expect(response.status).toBe(404);
  });

  it('odrzuca pustą zmianę', async () => {
    const task = await addTask('Odkurzyć');

    const response = await sendJson('PATCH', `/api/tasks/${task.id}`, {});

    expect(response.status).toBe(400);
  });
});

describe('osoba, termin i autor', () => {
  it('rodzic przydziela zadanie z terminem, a autor trafia do zadania i historii', async () => {
    const task = await addTask('Wynieść śmieci', { assigneeId: childId, dueOn: '2026-11-09' });

    expect(task).toMatchObject({ assigneeId: childId, dueOn: '2026-11-09', createdById: parentId });
    const [event] = db.select().from(taskEvents).where(eq(taskEvents.taskId, task.id)).all();
    expect(event).toMatchObject({ type: 'created', actorId: parentId });
  });

  it('zadanie rodzica bez osoby zostaje nieprzypisane', async () => {
    const task = await addTask('Kupić żarówki');

    expect(task).toMatchObject({ assigneeId: null, dueOn: null, createdById: parentId });
  });

  it('zapisuje autora każdej zmiany', async () => {
    const task = await addTask('Podlać kwiaty', { assigneeId: childId });

    await sendJson('PATCH', `/api/tasks/${task.id}`, { dueOn: '2026-11-10' });
    await sendJson('PATCH', `/api/tasks/${task.id}`, { status: 'done' }, childCookie);

    const events = db.select().from(taskEvents).where(eq(taskEvents.taskId, task.id)).all();
    expect(events.map((event) => [event.actorId, event.changes])).toEqual([
      [parentId, { title: 'Podlać kwiaty', assigneeId: childId, dueOn: null, reward: null, color: null }],
      [parentId, { dueOn: '2026-11-10' }],
      [childId, { status: 'done' }],
    ]);
  });

  it('usuwa termin i osobę wartością null', async () => {
    const task = await addTask('Odkurzyć', { assigneeId: childId, dueOn: '2026-11-09' });

    const response = await sendJson('PATCH', `/api/tasks/${task.id}`, { assigneeId: null, dueOn: null });

    expect(taskSchema.parse(await response.json())).toMatchObject({ assigneeId: null, dueOn: null });
  });

  it('odrzuca nieistniejącą osobę, wyłączone konto i zły format daty', async () => {
    const unknown = await sendJson('POST', '/api/tasks', { title: 'xyz', assigneeId: crypto.randomUUID() });
    expect(unknown.status).toBe(400);

    setDisabled(db, 'kuba', true);
    const disabled = await sendJson('POST', '/api/tasks', { title: 'xyz', assigneeId: otherChildId });
    expect(disabled.status).toBe(400);

    const badDate = await sendJson('POST', '/api/tasks', { title: 'xyz', dueOn: '9.11.2026' });
    expect(badDate.status).toBe(400);
    expect(await listTasks()).toEqual([]);
  });

  it('lista rodziny pokazuje aktywne konta bez loginów', async () => {
    setDisabled(db, 'kuba', true);

    const response = await app.request('/api/users', { headers: { Cookie: childCookie } });

    expect(familySchema.parse(await response.json())).toEqual([
      { id: parentId, name: 'Tata', role: 'parent', color: null },
      { id: childId, name: 'Zosia', role: 'child', color: null },
    ]);
  });
});

describe('ustawienia osoby', () => {
  async function family() {
    const response = await app.request('/api/users', { headers: { Cookie: cookie } });
    return familySchema.parse(await response.json());
  }

  it('każdy, także dziecko, wybiera swój kolor i cała rodzina go widzi', async () => {
    const response = await sendJson('PATCH', '/api/users/me', { color: 'lilac' }, childCookie);

    expect(response.status).toBe(200);
    expect(familyMemberSchema.parse(await response.json())).toEqual({ id: childId, name: 'Zosia', role: 'child', color: 'lilac' });
    expect((await family()).find((member) => member.id === childId)?.color).toBe('lilac');
  });

  it('kolory mogą się powtarzać, a pusty wraca do przydziału domyślnego', async () => {
    await sendJson('PATCH', '/api/users/me', { color: 'mint' }, childCookie);
    expect((await sendJson('PATCH', '/api/users/me', { color: 'mint' })).status).toBe(200);
    expect((await family()).map((member) => member.color)).toEqual(['mint', 'mint', null]);

    await sendJson('PATCH', '/api/users/me', { color: null });
    expect((await family()).find((member) => member.id === parentId)?.color).toBeNull();
  });

  it('odrzuca kolor spoza palety', async () => {
    const response = await sendJson('PATCH', '/api/users/me', { color: '#ff0000' }, childCookie);

    expect(response.status).toBe(400);
    expect((await family()).find((member) => member.id === childId)?.color).toBeNull();
  });
});

describe('kolor karteczki', () => {
  it('nowe zadanie jest bez koloru, a kolor wybrany przy dodaniu trafia do zadania i historii', async () => {
    expect((await addTask('Zwykłe')).color).toBeNull();

    const task = await addTask('Kolorowe', { color: 'mint' });

    expect(task.color).toBe('mint');
    const [event] = db.select().from(taskEvents).where(eq(taskEvents.taskId, task.id)).all();
    expect(event?.changes).toMatchObject({ color: 'mint' });
  });

  it('zmienia i zdejmuje kolor, a historia zapisuje zmianę', async () => {
    const task = await addTask('Podlać kwiaty', { color: 'sky' });

    const changed = await sendJson('PATCH', `/api/tasks/${task.id}`, { color: 'pink' });
    expect(taskSchema.parse(await changed.json()).color).toBe('pink');
    const cleared = await sendJson('PATCH', `/api/tasks/${task.id}`, { color: null });
    expect(taskSchema.parse(await cleared.json()).color).toBeNull();

    const events = db.select().from(taskEvents).where(eq(taskEvents.taskId, task.id)).all();
    expect(events.slice(1).map((event) => event.changes)).toEqual([{ color: 'pink' }, { color: null }]);
  });

  it('dziecko koloruje swoje zadania, ale nie cudze ani wspólne', async () => {
    const own = await addTask('Moje', { color: 'yellow' }, childCookie);
    expect(own.color).toBe('yellow');
    expect((await sendJson('PATCH', `/api/tasks/${own.id}`, { color: 'lilac' }, childCookie)).status).toBe(200);

    const brother = await addTask('Zadanie Kuby', { assigneeId: otherChildId });
    const shared = await addTask('Wspólne');
    for (const task of [brother, shared]) {
      const response = await sendJson('PATCH', `/api/tasks/${task.id}`, { color: 'coral' }, childCookie);
      expect(response.status).toBe(403);
    }
  });

  it('odrzuca kolor spoza palety', async () => {
    const created = await sendJson('POST', '/api/tasks', { title: 'Czerwone', color: '#ff0000' });
    expect(created.status).toBe(400);
    expect(await created.json()).toEqual({ error: 'Nieznany kolor karteczki' });

    const task = await addTask('Zwykłe');
    expect((await sendJson('PATCH', `/api/tasks/${task.id}`, { color: 'blue' })).status).toBe(400);
  });
});

describe('archiwum', () => {
  it('pokazuje zarchiwizowane od najnowszego, a rodzic je przywraca', async () => {
    const first = await addTask('Pierwsze');
    const second = await addTask('Drugie');
    await sendJson('PATCH', `/api/tasks/${first.id}`, { archived: true });
    clock += 1000;
    await sendJson('PATCH', `/api/tasks/${second.id}`, { archived: true });

    expect((await listTasks('?archived=true')).map((task) => task.title)).toEqual(['Drugie', 'Pierwsze']);

    const restored = await sendJson('PATCH', `/api/tasks/${first.id}`, { archived: false });
    expect(taskSchema.parse(await restored.json()).archivedAt).toBeNull();
    expect((await listTasks()).map((task) => task.id)).toEqual([first.id]);
    expect((await listTasks('?archived=true')).map((task) => task.id)).toEqual([second.id]);
  });

  it('odrzuca nieznany parametr archiwum', async () => {
    const response = await app.request('/api/tasks?archived=tak', { headers: { Cookie: cookie } });

    expect(response.status).toBe(400);
  });
});

describe('role', () => {
  it('zadanie dziecka bez osoby jest jego własne, a dziecko może je zmieniać', async () => {
    const task = await addTask('Posprzątać pokój', {}, childCookie);
    expect(task).toMatchObject({ assigneeId: childId, createdById: childId });

    const moved = await sendJson('PATCH', `/api/tasks/${task.id}`, { status: 'done', title: 'Pokój', dueOn: '2026-11-09' }, childCookie);
    expect(moved.status).toBe(200);
  });

  it('dziecko nie tworzy zadań dla innych ani bez osoby', async () => {
    for (const assigneeId of [otherChildId, parentId, null]) {
      const response = await sendJson('POST', '/api/tasks', { title: 'Dla brata', assigneeId }, childCookie);
      expect(response.status).toBe(403);
    }
    expect(await listTasks()).toEqual([]);
  });

  it('dziecko nie zmienia cudzych zadań', async () => {
    const task = await addTask('Zadanie Kuby', { assigneeId: otherChildId });

    for (const change of [{ status: 'done' }, { title: 'Zmienione' }, { assigneeId: childId }]) {
      const response = await sendJson('PATCH', `/api/tasks/${task.id}`, change, childCookie);
      expect(response.status).toBe(403);
    }
    expect(await listTasks()).toEqual([task]);
  });

  it('dziecko realizuje zadanie bez osoby i przejmuje je', async () => {
    const task = await addTask('Wspólne');

    const response = await sendJson('PATCH', `/api/tasks/${task.id}`, { status: 'in_progress' }, childCookie);

    expect(response.status).toBe(200);
    expect(taskSchema.parse(await response.json())).toMatchObject({ status: 'in_progress', assigneeId: childId });
    const events = db.select().from(taskEvents).where(eq(taskEvents.taskId, task.id)).all();
    expect(events.at(-1)).toMatchObject({ actorId: childId, changes: { status: 'in_progress', assigneeId: childId } });

    // Teraz to już zadanie dziecka, więc rodzeństwo go nie przejmie.
    const brother = await logIn('kuba', 'haslo-kuby');
    const taken = await sendJson('PATCH', `/api/tasks/${task.id}`, { status: 'done' }, brother);
    expect(taken.status).toBe(403);
  });

  it('dziecko bierze zadanie bez osoby przez przypisanie do siebie', async () => {
    const task = await addTask('Wspólne');

    const response = await sendJson('PATCH', `/api/tasks/${task.id}`, { assigneeId: childId }, childCookie);

    expect(taskSchema.parse(await response.json())).toMatchObject({ status: 'todo', assigneeId: childId });
  });

  it('dziecko nie edytuje zadania bez osoby ani nie oddaje go innym', async () => {
    const task = await addTask('Wspólne', { dueOn: '2026-11-09' });

    for (const change of [{ title: 'Zmienione' }, { dueOn: null }, { status: 'done', title: 'Zmienione' }, { assigneeId: otherChildId }]) {
      const response = await sendJson('PATCH', `/api/tasks/${task.id}`, change, childCookie);
      expect(response.status).toBe(403);
    }
    expect(await listTasks()).toEqual([task]);
  });

  it('dziecko nie oddaje swojego zadania innym', async () => {
    const task = await addTask('Moje', { assigneeId: childId });

    for (const assigneeId of [otherChildId, null]) {
      const response = await sendJson('PATCH', `/api/tasks/${task.id}`, { assigneeId }, childCookie);
      expect(response.status).toBe(403);
    }
  });

  it('dziecko nie archiwizuje ani nie przywraca nawet swoich zadań', async () => {
    const task = await addTask('Wynieść śmieci', { assigneeId: childId });

    const archive = await sendJson('PATCH', `/api/tasks/${task.id}`, { archived: true }, childCookie);
    expect(archive.status).toBe(403);
    expect(await listTasks()).toHaveLength(1);

    await sendJson('PATCH', `/api/tasks/${task.id}`, { archived: true });
    const restore = await sendJson('PATCH', `/api/tasks/${task.id}`, { archived: false }, childCookie);
    expect(restore.status).toBe(403);
  });

  it('rodzic zmienia każde zadanie, także dziecka', async () => {
    const task = await addTask('Posprzątać pokój', {}, childCookie);

    const response = await sendJson('PATCH', `/api/tasks/${task.id}`, { assigneeId: otherChildId, status: 'done' });

    expect(taskSchema.parse(await response.json())).toMatchObject({ assigneeId: otherChildId, status: 'done' });
  });
});

describe('cofanie i oddawanie', () => {
  it('cofa status o krok, także dziecko przy swoim zadaniu', async () => {
    const task = await addTask('Pokój', {}, childCookie);
    await sendJson('PATCH', `/api/tasks/${task.id}`, { status: 'done' }, childCookie);

    const back = await sendJson('PATCH', `/api/tasks/${task.id}`, { status: 'in_progress' }, childCookie);

    expect(taskSchema.parse(await back.json()).status).toBe('in_progress');
  });

  it('zapisuje, kto przypisał osobę', async () => {
    const byParent = await addTask('Od rodzica', { assigneeId: childId });
    const own = await addTask('Własne', {}, childCookie);
    const free = await addTask('Wspólne');

    expect(byParent.assignedById).toBe(parentId);
    expect(own.assignedById).toBe(childId);
    expect(free.assignedById).toBeNull();

    const taken = await sendJson('PATCH', `/api/tasks/${free.id}`, { status: 'in_progress' }, childCookie);
    expect(taskSchema.parse(await taken.json()).assignedById).toBe(childId);
  });

  it('dziecko cofa wzięte zadanie do „Do zrobienia” i oddaje je jako dla chętnych', async () => {
    const task = await addTask('Wspólne');
    await sendJson('PATCH', `/api/tasks/${task.id}`, { status: 'in_progress' }, childCookie);

    const released = await sendJson('PATCH', `/api/tasks/${task.id}`, { status: 'todo', assigneeId: null }, childCookie);

    expect(released.status).toBe(200);
    expect(taskSchema.parse(await released.json())).toMatchObject({ status: 'todo', assigneeId: null, assignedById: null });
    const events = db.select().from(taskEvents).where(eq(taskEvents.taskId, task.id)).all();
    expect(events.at(-1)).toMatchObject({ actorId: childId, changes: { status: 'todo', assigneeId: null } });

    // Oddane zadanie może wziąć ktoś inny.
    const brother = await logIn('kuba', 'haslo-kuby');
    const retaken = await sendJson('PATCH', `/api/tasks/${task.id}`, { status: 'in_progress' }, brother);
    expect(taskSchema.parse(await retaken.json()).assigneeId).toBe(otherChildId);
  });

  it('dziecko nie oddaje zadania w trakcie ani zakończonego', async () => {
    const task = await addTask('Wspólne');
    await sendJson('PATCH', `/api/tasks/${task.id}`, { status: 'in_progress' }, childCookie);

    const inProgress = await sendJson('PATCH', `/api/tasks/${task.id}`, { assigneeId: null }, childCookie);
    expect(inProgress.status).toBe(403);

    const toDone = await sendJson('PATCH', `/api/tasks/${task.id}`, { status: 'done', assigneeId: null }, childCookie);
    expect(toDone.status).toBe(403);
  });

  it('dziecko nie oddaje zadania przydzielonego przez rodzica', async () => {
    const task = await addTask('Wynieść śmieci', { assigneeId: childId });

    const response = await sendJson('PATCH', `/api/tasks/${task.id}`, { assigneeId: null }, childCookie);

    expect(response.status).toBe(403);
    expect((await listTasks())[0]?.assigneeId).toBe(childId);
  });

  it('dziecko nie oddaje zadania, które rodzic przepisał na nie po wzięciu', async () => {
    const task = await addTask('Wspólne');
    await sendJson('PATCH', `/api/tasks/${task.id}`, { assigneeId: childId }, childCookie);
    await sendJson('PATCH', `/api/tasks/${task.id}`, { assigneeId: childId });

    const response = await sendJson('PATCH', `/api/tasks/${task.id}`, { assigneeId: null }, childCookie);

    expect(response.status).toBe(403);
  });
});

describe('dziś', () => {
  it('pokazuje moje zadania na dziś i zaległe, bez cudzych, przyszłych i zarchiwizowanych', async () => {
    const dueToday = await addTask('Na dziś', { assigneeId: childId, dueOn: '2026-11-08' });
    const doneToday = await addTask('Zrobione dziś', { assigneeId: childId, dueOn: '2026-11-08' });
    await sendJson('PATCH', `/api/tasks/${doneToday.id}`, { status: 'done' });
    const older = await addTask('Bardzo zaległe', { assigneeId: childId, dueOn: '2026-11-01' });
    const late = await addTask('Zaległe', { assigneeId: childId, dueOn: '2026-11-07' });
    const doneLate = await addTask('Zaległe, ale zrobione', { assigneeId: childId, dueOn: '2026-11-07' });
    await sendJson('PATCH', `/api/tasks/${doneLate.id}`, { status: 'done' });
    await addTask('Jutro', { assigneeId: childId, dueOn: '2026-11-09' });
    await addTask('Bez terminu', { assigneeId: childId });
    await addTask('Kuby', { assigneeId: otherChildId, dueOn: '2026-11-08' });
    const archived = await addTask('W archiwum', { assigneeId: childId, dueOn: '2026-11-08' });
    await sendJson('PATCH', `/api/tasks/${archived.id}`, { archived: true });

    const result = await today(childCookie);

    expect(result.date).toBe('2026-11-08');
    expect(result.today.map((task) => task.id)).toEqual([dueToday.id, doneToday.id]);
    expect(result.overdue.map((task) => task.id)).toEqual([older.id, late.id]);
  });

  it('liczy dzień w czasie polskim, a nie w UTC', async () => {
    await addTask('Na 9 listopada', { assigneeId: childId, dueOn: '2026-11-09' });

    // 23:30 UTC 8 listopada to już 0:30 9 listopada w Polsce.
    clock = Date.parse('2026-11-08T23:30:00Z');
    const result = await today(childCookie);

    expect(result.date).toBe('2026-11-09');
    expect(result.today.map((task) => task.title)).toEqual(['Na 9 listopada']);
  });
});
