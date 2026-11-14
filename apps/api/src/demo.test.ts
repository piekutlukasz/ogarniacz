import { describe, expect, it } from 'vitest';
import { allowanceSchema, eventsResponseSchema, shoppingListSchema, taskListSchema } from '@ogarniacz/shared';
import { createApp } from './app';
import { hashPassword } from './auth/password';
import { DEMO_PASSWORD, DEMO_ROW_LIMIT, isDemoDatabase, resetDemo, seedDemo, seedDemoIfEmpty } from './demo';
import { openDatabase } from './db/client';
import { calendarEvents, calendars, sessions, tasks, users } from './db/schema';

const NOW = new Date('2026-11-11T10:00:00Z');

async function login(app: ReturnType<typeof createApp>, loginName: string) {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: loginName, password: DEMO_PASSWORD }),
  });
  expect(response.status).toBe(200);
  return (response.headers.get('set-cookie') ?? '').split(';')[0] as string;
}

describe('dane demo', () => {
  it('pozwalają zalogować się na każde konto i pokazują zadania, zakupy oraz kieszonkowe', async () => {
    const { db } = openDatabase(':memory:', './drizzle');
    await seedDemo(db, NOW);
    const app = createApp({ db, now: () => NOW });

    const parent = await login(app, 'tata');
    const child = await login(app, 'kasia');
    await login(app, 'mama');

    const taskList = taskListSchema.parse(await (await app.request('/api/tasks', { headers: { Cookie: parent } })).json());
    expect(taskList.length).toBeGreaterThanOrEqual(10);
    expect(new Set(taskList.map((task) => task.status))).toEqual(new Set(['todo', 'in_progress', 'done']));
    // Zadania cykliczne powstały z reguł, więc ich ślad jest na tablicy.
    expect(taskList.some((task) => task.title === 'Wynieść segregację')).toBe(true);

    const shopping = shoppingListSchema.parse(await (await app.request('/api/shopping', { headers: { Cookie: child } })).json());
    expect(shopping.length).toBeGreaterThanOrEqual(5);

    const allowance = allowanceSchema.parse(await (await app.request('/api/allowance', { headers: { Cookie: parent } })).json());
    expect(allowance.children).toHaveLength(1);
    const closed = allowance.children[0]?.closed ?? [];
    expect(closed.some((week) => week.paidAt !== null)).toBe(true);
    expect(closed.some((week) => week.paidAt === null && week.rewards.length > 0)).toBe(true);
  });

  it('zawierają kalendarz z wydarzeniami na dziś, bez linku i bez ostrzeżenia o nieaktualności', async () => {
    const { db } = openDatabase(':memory:', './drizzle');
    await seedDemo(db, NOW);
    const app = createApp({ db, now: () => NOW });
    const child = await login(app, 'kasia');

    const events = eventsResponseSchema.parse(await (await app.request('/api/events', { headers: { Cookie: child } })).json());
    expect(events.events.map((event) => event.title)).toEqual(['Urodziny babci', 'Basen', 'Wywiadówka']);
    expect(events.events[1]).toMatchObject({ startsAt: '2026-11-11T16:00:00.000Z', location: 'Pływalnia miejska' });
    expect(events.sync).toMatchObject({ calendars: 1, stale: false, failing: 0 });
    expect(db.select().from(calendars).get()?.urlEnc).toBe('');
  });

  it('odmawia wgrania do bazy, w której są już konta', async () => {
    const { db } = openDatabase(':memory:', './drizzle');
    await seedDemo(db, NOW);
    const before = { users: db.select().from(users).all().length, tasks: db.select().from(tasks).all().length };

    await expect(seedDemo(db, NOW)).rejects.toThrow('Baza nie jest pusta');
    expect(db.select().from(users).all()).toHaveLength(before.users);
    expect(db.select().from(tasks).all()).toHaveLength(before.tasks);
  });
});

describe('tryb demo', () => {
  it('reset czyści też kalendarze i wgrywa je od nowa', async () => {
    const { db } = openDatabase(':memory:', './drizzle');
    await seedDemo(db, NOW);
    await resetDemo(db, NOW);
    expect(db.select().from(calendars).all()).toHaveLength(1);
    expect(db.select().from(calendarEvents).all()).toHaveLength(4);
  });

  async function demoApp() {
    const { db } = openDatabase(':memory:', './drizzle');
    await seedDemo(db, NOW);
    return { db, app: createApp({ db, now: () => NOW, demo: true }) };
  }

  const json = (body: unknown) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  it('podaje konta i wpuszcza na wybrane bez hasła', async () => {
    const { app } = await demoApp();

    const info = await (await app.request('/api/demo')).json();
    expect(info).toMatchObject({ demo: true });
    expect(info.accounts.map((account: { login: string }) => account.login)).toEqual(['tata', 'mama', 'kasia']);

    const response = await app.request('/api/demo/login', json({ login: 'kasia' }));
    expect(response.status).toBe(200);
    const cookie = (response.headers.get('set-cookie') ?? '').split(';')[0] as string;
    const me = await (await app.request('/api/auth/me', { headers: { Cookie: cookie } })).json();
    expect(me.user.login).toBe('kasia');
  });

  it('nie wpuszcza bez hasła na konto spoza listy demo', async () => {
    const { db, app } = await demoApp();
    const now = new Date();
    db.insert(users).values({ id: crypto.randomUUID(), login: 'obcy', name: 'Obcy', role: 'parent', passwordHash: 'x', createdAt: now }).run();

    const response = await app.request('/api/demo/login', json({ login: 'obcy' }));
    expect(response.status).toBe(404);
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  it('na zwykłym serwerze tras demo nie ma', async () => {
    const { db } = openDatabase(':memory:', './drizzle');
    await seedDemo(db, NOW);
    const app = createApp({ db, now: () => NOW });

    expect((await app.request('/api/demo')).status).toBe(404);
    expect((await app.request('/api/demo/login', json({ login: 'tata' }))).status).toBe(404);
    expect((await app.request('/robots.txt')).status).toBe(404);
    expect((await app.request('/api/health')).headers.get('X-Robots-Tag')).toBeNull();
  });

  it('zakazuje indeksowania', async () => {
    const { app } = await demoApp();
    expect((await app.request('/api/health')).headers.get('X-Robots-Tag')).toBe('noindex, nofollow');
    const robots = await app.request('/robots.txt');
    expect(await robots.text()).toContain('Disallow: /');
  });

  it('odmawia nowych zadań, gdy demo jest pełne, ale pozwala edytować istniejące', async () => {
    const { db, app } = await demoApp();
    const cookie = ((await app.request('/api/demo/login', json({ login: 'tata' }))).headers.get('set-cookie') ?? '').split(';')[0] as string;
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };
    const existing = db.select().from(tasks).limit(1).get();
    const missing = DEMO_ROW_LIMIT - db.select().from(tasks).all().length;
    for (let i = 0; i < missing; i += 1) {
      db.insert(tasks).values({ id: crypto.randomUUID(), title: `Wypełniacz ${i}`, createdAt: NOW, updatedAt: NOW }).run();
    }

    const refused = await app.request('/api/tasks', { method: 'POST', headers, body: JSON.stringify({ title: 'Jedno za dużo' }) });
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toContain('Demo jest pełne');

    const edited = await app.request(`/api/tasks/${existing?.id}`, { method: 'PATCH', headers, body: JSON.stringify({ title: 'Zmieniony tytuł' }) });
    expect(edited.status).toBe(200);
  });

  it('reset przywraca dane początkowe i wylogowuje wszystkich', async () => {
    const { db, app } = await demoApp();
    const cookie = ((await app.request('/api/demo/login', json({ login: 'tata' }))).headers.get('set-cookie') ?? '').split(';')[0] as string;
    const created = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ title: 'Śmieci gościa' }),
    });
    expect(created.status).toBe(201);
    const initialCount = db.select().from(tasks).all().length - 1;

    await resetDemo(db, NOW);

    const titles = db.select().from(tasks).all().map((task) => task.title);
    expect(titles).not.toContain('Śmieci gościa');
    expect(titles).toHaveLength(initialCount);
    expect(db.select().from(sessions).all()).toHaveLength(0);
    expect(db.select().from(users).all()).toHaveLength(3);
    expect((await app.request('/api/auth/me', { headers: { Cookie: cookie } })).status).toBe(401);
    await login(app, 'tata');
  });

  describe('bezpiecznik przed prawdziwymi danymi', () => {
    const realAccount = async (login: string) => ({
      id: crypto.randomUUID(),
      login,
      name: 'Prawdziwa osoba',
      role: 'parent' as const,
      passwordHash: await hashPassword('prawdziwe-haslo-rodziny'),
      createdAt: NOW,
    });

    it('rozpoznaje bazę demo i pustą bazę, ale nie bazę z cudzym kontem', async () => {
      const { db } = openDatabase(':memory:', './drizzle');
      expect(await isDemoDatabase(db)).toBe(true);

      await seedDemo(db, NOW);
      expect(await isDemoDatabase(db)).toBe(true);

      db.insert(users).values(await realAccount('anna')).run();
      expect(await isDemoDatabase(db)).toBe(false);
    });

    it('reset odmawia i niczego nie kasuje, gdy w bazie jest konto spoza demo', async () => {
      const { db } = openDatabase(':memory:', './drizzle');
      await seedDemo(db, NOW);
      db.insert(users).values(await realAccount('anna')).run();
      const before = { users: db.select().from(users).all().length, tasks: db.select().from(tasks).all().length };

      await expect(resetDemo(db, NOW)).rejects.toThrow('Reset skasowałby prawdziwe dane');

      expect(db.select().from(users).all()).toHaveLength(before.users);
      expect(db.select().from(tasks).all()).toHaveLength(before.tasks);
    });

    it('login „tata” z prawdziwym hasłem też nie jest kontem demo', async () => {
      const { db } = openDatabase(':memory:', './drizzle');
      db.insert(users).values(await realAccount('tata')).run();

      expect(await isDemoDatabase(db)).toBe(false);
      await expect(resetDemo(db, NOW)).rejects.toThrow('Reset skasowałby prawdziwe dane');
      expect(db.select().from(users).all()).toHaveLength(1);
    });
  });

  it('wgrywa dane tylko do pustej bazy przy starcie', async () => {
    const { db } = openDatabase(':memory:', './drizzle');
    expect(await seedDemoIfEmpty(db, NOW)).toBe(true);
    expect(await seedDemoIfEmpty(db, NOW)).toBe(false);
    expect(db.select().from(users).all()).toHaveLength(3);
  });
});
