import {
  type CreateRecurrence,
  type Recurrence,
  type RecurrencePattern,
  daysBetween,
  latestOccurrence,
  nextOccurrence,
  occursOn,
  recurrenceListSchema,
  recurrenceSchema,
  taskListSchema,
} from '@ogarniacz/shared';
import { asc, eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createUser, setDisabled } from './auth/users';
import { type Db, openDatabase } from './db/client';
import { recurrences, tasks } from './db/schema';
import { generateRecurringTasks } from './jobs/recurrences';

let db: Db;
let close: () => void;
let app: ReturnType<typeof createApp>;
let cookie: string;
let childCookie: string;
let clock: number;
let childId: string;

/** Ustawia zegar na godzinę w Polsce podaną jako przesunięcie UTC, np. `2026-11-08T11:00:00Z` to 12:00. */
function setClock(iso: string) {
  clock = Date.parse(iso);
}

/** Uruchomienie harmonogramu, tak jak robi to cron co godzinę albo start serwera. */
function runJob() {
  return generateRecurringTasks(db, new Date(clock));
}

function sendJson(method: 'POST' | 'PATCH', path: string, body: unknown, session = cookie) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: session },
    body: JSON.stringify(body),
  });
}

async function addRule(input: CreateRecurrence): Promise<Recurrence> {
  const response = await sendJson('POST', '/api/recurrences', input);
  expect(response.status).toBe(201);
  return recurrenceSchema.parse(await response.json());
}

async function changeRule(id: string, change: unknown) {
  return sendJson('PATCH', `/api/recurrences/${id}`, change);
}

async function listRules(): Promise<Recurrence[]> {
  const response = await app.request('/api/recurrences', { headers: { Cookie: cookie } });
  expect(response.status).toBe(200);
  return recurrenceListSchema.parse(await response.json());
}

async function ruleTasks(ruleId: string) {
  const response = await app.request('/api/tasks', { headers: { Cookie: cookie } });
  return taskListSchema
    .parse(await response.json())
    .filter((task) => task.recurrenceId === ruleId)
    .sort((a, b) => (a.dueOn ?? '').localeCompare(b.dueOn ?? ''));
}

async function finish(taskId: string) {
  const response = await sendJson('PATCH', `/api/tasks/${taskId}`, { status: 'done' });
  expect(response.status).toBe(200);
}

async function logIn(login: string, password: string): Promise<string> {
  const response = await sendJson('POST', '/api/auth/login', { login, password }, '');
  expect(response.status).toBe(200);
  return (response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
}

const DAILY = { kind: 'interval', days: 1 } as const;

beforeEach(async () => {
  ({ db, close } = openDatabase(':memory:', './drizzle'));
  // Niedziela 8 listopada 2026, 12:00 w Polsce.
  setClock('2026-11-08T11:00:00Z');
  app = createApp({ db, now: () => new Date(clock) });
  await createUser(db, { login: 'tata', name: 'Tata', role: 'parent', password: 'haslo-rodzica' });
  childId = (await createUser(db, { login: 'zosia', name: 'Zosia', role: 'child', password: 'haslo-dziecka' })).id;
  cookie = await logIn('tata', 'haslo-rodzica');
  childCookie = await logIn('zosia', 'haslo-dziecka');
});

afterEach(() => close());

describe('wzorce powtórzeń', () => {
  it('co tydzień wypada w wybrane dni tygodnia', () => {
    const pattern: RecurrencePattern = { kind: 'weekly', weekdays: [1, 4] };
    // 9 listopada 2026 to poniedziałek, 12 czwartek.
    expect(occursOn(pattern, '2026-11-01', '2026-11-09')).toBe(true);
    expect(occursOn(pattern, '2026-11-01', '2026-11-10')).toBe(false);
    expect(occursOn(pattern, '2026-11-01', '2026-11-12')).toBe(true);
    expect(nextOccurrence(pattern, '2026-11-01', '2026-11-10')).toBe('2026-11-12');
  });

  it('nie wypada przed dniem startu', () => {
    expect(occursOn(DAILY, '2026-11-10', '2026-11-09')).toBe(false);
    expect(nextOccurrence(DAILY, '2026-11-10', '2026-11-01')).toBe('2026-11-10');
  });

  it('co miesiąc 31. dnia wypada ostatniego lutego, także w roku przestępnym', () => {
    const pattern = { kind: 'monthly', day: 31 } as const;
    expect(nextOccurrence(pattern, '2027-01-01', '2027-02-01')).toBe('2027-02-28');
    expect(nextOccurrence(pattern, '2028-01-01', '2028-02-01')).toBe('2028-02-29');
    expect(nextOccurrence(pattern, '2028-01-01', '2028-04-01')).toBe('2028-04-30');
    expect(occursOn({ kind: 'monthly', day: 29 }, '2027-01-01', '2027-02-28')).toBe(true);
    expect(occursOn({ kind: 'monthly', day: 29 }, '2028-01-01', '2028-02-28')).toBe(false);
  });

  it('co N dni liczy pełne dni mimo zmiany czasu', () => {
    // Zmiana czasu: 28 marca 2027 na letni, 25 października 2026 na zimowy.
    expect(daysBetween('2027-03-27', '2027-03-29')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
    const pattern = { kind: 'interval', days: 2 } as const;
    expect(occursOn(pattern, '2026-10-24', '2026-10-26')).toBe(true);
    expect(occursOn(pattern, '2027-03-27', '2027-03-29')).toBe(true);
  });

  it('znajduje najpóźniejsze wystąpienie w przedziale', () => {
    const pattern: RecurrencePattern = { kind: 'weekly', weekdays: [1, 4] };
    expect(latestOccurrence(pattern, '2026-11-01', '2026-11-08', '2026-11-13')).toBe('2026-11-12');
    expect(latestOccurrence(pattern, '2026-11-01', '2026-11-12', '2026-11-13')).toBeUndefined();
  });
});

describe('reguły cykliczne', () => {
  it('tylko rodzic widzi i zmienia reguły', async () => {
    const list = await app.request('/api/recurrences', { headers: { Cookie: childCookie } });
    const create = await sendJson('POST', '/api/recurrences', { title: 'Śmieci', pattern: DAILY }, childCookie);

    expect(list.status).toBe(403);
    expect(create.status).toBe(403);
  });

  it('odrzuca tydzień bez dni', async () => {
    const response = await sendJson('POST', '/api/recurrences', { title: 'Śmieci', pattern: { kind: 'weekly', weekdays: [] } });

    expect(response.status).toBe(400);
  });

  it('tworzy zadanie od razu, gdy reguła wypada dziś, z osobą i oznaczeniem reguły', async () => {
    const rule = await addRule({ title: 'Podlać kwiaty', assigneeId: childId, pattern: { kind: 'weekly', weekdays: [7] } });

    const [task] = await ruleTasks(rule.id);
    expect(task).toMatchObject({ title: 'Podlać kwiaty', assigneeId: childId, dueOn: '2026-11-08', status: 'todo' });

    const response = await app.request('/api/tasks/today', { headers: { Cookie: childCookie } });
    expect(JSON.stringify(await response.json())).toContain('Podlać kwiaty');
    expect((await listRules())[0]?.nextOn).toBe('2026-11-15');
  });

  it('nie tworzy zadania, gdy reguła dziś nie wypada', async () => {
    const rule = await addRule({ title: 'Śmieci', pattern: { kind: 'weekly', weekdays: [1, 4] } });

    expect(await ruleTasks(rule.id)).toEqual([]);
    expect(rule.nextOn).toBe('2026-11-09');
  });

  it('nie nadrabia dni sprzed utworzenia reguły', async () => {
    const rule = await addRule({ title: 'Kwiaty', pattern: { kind: 'interval', days: 3 }, startOn: '2026-11-01' });

    // 1, 4, 7 listopada już minęły, następne 10.
    expect(await ruleTasks(rule.id)).toEqual([]);
    expect(rule.nextOn).toBe('2026-11-10');
  });

  it('po restarcie serwera nie dubluje zadań', async () => {
    const rule = await addRule({ title: 'Śmieci', pattern: DAILY });

    runJob();
    runJob();
    // Nowa instancja aplikacji na tej samej bazie, jak po restarcie kontenera.
    app = createApp({ db, now: () => new Date(clock) });
    runJob();

    expect(await ruleTasks(rule.id)).toHaveLength(1);
  });

  it('indeks unikalny blokuje drugie zadanie na ten sam dzień, nawet z cofniętym kursorem', async () => {
    const rule = await addRule({ title: 'Śmieci', pattern: DAILY });
    const [task] = await ruleTasks(rule.id);
    await finish(task?.id ?? '');
    db.update(recurrences).set({ lastDueOn: '2026-11-07' }).where(eq(recurrences.id, rule.id)).run();

    expect(runJob().created).toBe(0);
    expect(await ruleTasks(rule.id)).toHaveLength(1);
  });

  it('tworzy następne wystąpienie w jego dniu', async () => {
    const rule = await addRule({ title: 'Śmieci', pattern: { kind: 'weekly', weekdays: [1, 4] } });

    // Poniedziałek, 0:05 w Polsce.
    setClock('2026-11-08T23:05:00Z');
    runJob();

    expect((await ruleTasks(rule.id)).map((task) => task.dueOn)).toEqual(['2026-11-09']);
  });

  it('trzyma jedno otwarte wystąpienie naraz i nie nadrabia pominiętych dni', async () => {
    const rule = await addRule({ title: 'Kwiaty', pattern: DAILY });

    setClock('2026-11-09T11:00:00Z');
    expect(runJob()).toEqual({ created: 0, skipped: 1 });
    setClock('2026-11-10T11:00:00Z');
    runJob();
    expect((await ruleTasks(rule.id)).map((task) => task.dueOn)).toEqual(['2026-11-08']);

    const [open] = await ruleTasks(rule.id);
    await finish(open?.id ?? '');
    // Po wykonaniu zadania następne powstaje dopiero przy kolejnym wystąpieniu, a nie od razu za 10 listopada.
    runJob();
    expect(await ruleTasks(rule.id)).toHaveLength(1);
    setClock('2026-11-11T11:00:00Z');
    runJob();
    expect((await ruleTasks(rule.id)).map((task) => task.dueOn)).toEqual(['2026-11-08', '2026-11-11']);
  });

  it('po kilku dniach przestoju tworzy tylko ostatnie zaległe wystąpienie', async () => {
    const rule = await addRule({ title: 'Śmieci', pattern: { kind: 'weekly', weekdays: [1, 4] } });

    // Serwer nie działał od niedzieli do piątku, a reguła wypadała w poniedziałek i czwartek.
    setClock('2026-11-13T11:00:00Z');
    runJob();

    expect((await ruleTasks(rule.id)).map((task) => task.dueOn)).toEqual(['2026-11-12']);
  });

  it('tworzy zadanie we właściwym dniu tuż po zmianie czasu', async () => {
    setClock('2026-10-24T10:00:00Z');
    const rule = await addRule({ title: 'Kwiaty', pattern: { kind: 'interval', days: 2 } });
    const finishAll = async () => {
      for (const task of await ruleTasks(rule.id)) await finish(task.id);
    };

    // 26 października, 0:30 czasu zimowego (CET, UTC+1).
    await finishAll();
    setClock('2026-10-25T23:30:00Z');
    runJob();
    // 28 marca 2027, 0:30 czasu zimowego, i ta sama doba po przejściu na letni o 2:00.
    await finishAll();
    await changeRule(rule.id, { pattern: DAILY });
    setClock('2027-03-27T23:30:00Z');
    // Po kilku miesiącach sesja testowa wygasła.
    cookie = await logIn('tata', 'haslo-rodzica');
    runJob();
    await finishAll();
    setClock('2027-03-28T21:30:00Z');
    runJob();
    // 29 marca, 0:30 czasu letniego (CEST, UTC+2).
    setClock('2027-03-28T22:30:00Z');
    runJob();

    expect((await ruleTasks(rule.id)).map((task) => task.dueOn)).toEqual([
      '2026-10-24',
      '2026-10-26',
      '2027-03-28',
      '2027-03-29',
    ]);
  });

  it('co miesiąc 31. dnia tworzy zadanie 29 lutego w roku przestępnym', async () => {
    // Regułę zakładamy dziś ze startem w 2028 roku. Dalej zegar idzie naprzód bez API,
    // bo cookie sesji nie może wygasać ponad 400 dni po prawdziwej dacie.
    const rule = await addRule({ title: 'Rachunki', pattern: { kind: 'monthly', day: 31 }, startOn: '2028-01-31' });
    expect(rule.nextOn).toBe('2028-01-31');
    const dueDays = () =>
      db.select().from(tasks).where(eq(tasks.recurrenceId, rule.id)).orderBy(asc(tasks.dueOn)).all().map((task) => task.dueOn);

    setClock('2028-01-31T11:00:00Z');
    runJob();
    db.update(tasks).set({ status: 'done' }).where(eq(tasks.recurrenceId, rule.id)).run();
    setClock('2028-02-28T11:00:00Z');
    runJob();
    expect(dueDays()).toEqual(['2028-01-31']);
    // 29 lutego, 0:30 w Polsce.
    setClock('2028-02-28T23:30:00Z');
    runJob();

    expect(dueDays()).toEqual(['2028-01-31', '2028-02-29']);
  });

  it('pauza do daty pomija wystąpienia i kończy się sama', async () => {
    const rule = await addRule({ title: 'Kwiaty', pattern: DAILY });
    const [first] = await ruleTasks(rule.id);
    await finish(first?.id ?? '');

    const paused = recurrenceSchema.parse(await (await changeRule(rule.id, { pause: { until: '2026-11-10' } })).json());
    expect(paused).toMatchObject({ paused: true, pausedUntil: '2026-11-10', nextOn: '2026-11-11' });

    setClock('2026-11-09T11:00:00Z');
    runJob();
    setClock('2026-11-10T11:00:00Z');
    runJob();
    expect(await ruleTasks(rule.id)).toHaveLength(1);

    setClock('2026-11-11T05:00:00Z');
    runJob();
    expect((await ruleTasks(rule.id)).map((task) => task.dueOn)).toEqual(['2026-11-08', '2026-11-11']);
    expect((await listRules())[0]).toMatchObject({ paused: false, pausedUntil: null });
  });

  it('pauza bez końca wstrzymuje regułę do wznowienia, a wznowienie nie nadrabia przerwy', async () => {
    const rule = await addRule({ title: 'Śmieci', pattern: { kind: 'weekly', weekdays: [1, 4] } });
    await changeRule(rule.id, { pause: { until: null } });
    expect((await listRules())[0]).toMatchObject({ paused: true, pausedUntil: null, nextOn: null });

    setClock('2026-11-20T11:00:00Z');
    runJob();
    expect(await ruleTasks(rule.id)).toEqual([]);

    // Wznowienie w czwartek tworzy zadanie na dziś, ale nie za poniedziałek z przerwy.
    setClock('2026-11-26T11:00:00Z');
    const resumed = recurrenceSchema.parse(await (await changeRule(rule.id, { pause: null })).json());
    expect(resumed.paused).toBe(false);
    expect((await ruleTasks(rule.id)).map((task) => task.dueOn)).toEqual(['2026-11-26']);
  });

  it('odrzuca koniec pauzy w przeszłości', async () => {
    const rule = await addRule({ title: 'Śmieci', pattern: DAILY });

    const response = await changeRule(rule.id, { pause: { until: '2026-11-01' } });

    expect(response.status).toBe(400);
  });

  it('usunięta reguła znika z listy i nie tworzy zadań, a utworzone zostają', async () => {
    const rule = await addRule({ title: 'Śmieci', pattern: DAILY });
    const [task] = await ruleTasks(rule.id);
    await finish(task?.id ?? '');

    expect((await changeRule(rule.id, { archived: true })).status).toBe(204);
    setClock('2026-11-09T11:00:00Z');
    runJob();

    expect(await listRules()).toEqual([]);
    expect(await ruleTasks(rule.id)).toHaveLength(1);
  });

  it('zmienia tytuł i osobę następnych wystąpień', async () => {
    const rule = await addRule({ title: 'Śmieci', pattern: { kind: 'weekly', weekdays: [1] } });

    await changeRule(rule.id, { title: 'Wynieść śmieci', assigneeId: childId });
    setClock('2026-11-09T11:00:00Z');
    runJob();

    expect((await ruleTasks(rule.id))[0]).toMatchObject({ title: 'Wynieść śmieci', assigneeId: childId });
  });

  it('wystąpienie dla wyłączonego konta trafia do puli „dla chętnych”', async () => {
    const rule = await addRule({ title: 'Śmieci', assigneeId: childId, pattern: { kind: 'weekly', weekdays: [1] } });
    setDisabled(db, 'zosia', true);

    setClock('2026-11-09T11:00:00Z');
    runJob();

    expect((await ruleTasks(rule.id))[0]?.assigneeId).toBeNull();
  });

  it('nagroda z reguły trafia do każdego tworzonego zadania', async () => {
    const rule = await addRule({ title: 'Śmieci', assigneeId: childId, pattern: { kind: 'weekly', weekdays: [7, 1] }, reward: 5 });
    expect(rule.reward).toBe(5);

    const [first] = await ruleTasks(rule.id);
    expect(first).toMatchObject({ dueOn: '2026-11-08', reward: 5 });
    await finish(first?.id ?? '');
    setClock('2026-11-09T11:00:00Z');
    runJob();

    expect((await ruleTasks(rule.id)).find((task) => task.dueOn === '2026-11-09')?.reward).toBe(5);
  });

  it('zmiana nagrody dotyczy następnych wystąpień, a utworzone zachowują swoją', async () => {
    const rule = await addRule({ title: 'Śmieci', assigneeId: childId, pattern: { kind: 'weekly', weekdays: [7, 1, 2] }, reward: 5 });
    const [first] = await ruleTasks(rule.id);
    await finish(first?.id ?? '');

    expect((await changeRule(rule.id, { reward: 10 })).status).toBe(200);
    setClock('2026-11-09T11:00:00Z');
    runJob();
    const monday = (await ruleTasks(rule.id)).find((task) => task.dueOn === '2026-11-09');
    expect(monday?.reward).toBe(10);
    await finish(monday?.id ?? '');

    await changeRule(rule.id, { reward: null });
    setClock('2026-11-10T11:00:00Z');
    runJob();

    const rewards = Object.fromEntries((await ruleTasks(rule.id)).map((task) => [task.dueOn, task.reward]));
    expect(rewards).toEqual({ '2026-11-08': 5, '2026-11-09': 10, '2026-11-10': null });
    expect((await listRules())[0]?.reward).toBeNull();
  });

  it('reguła bez nagrody tworzy zadania bez nagrody', async () => {
    const rule = await addRule({ title: 'Podlać kwiaty', pattern: DAILY });

    expect(rule.reward).toBeNull();
    expect((await ruleTasks(rule.id))[0]?.reward).toBeNull();
  });

  it('odrzuca nagrodę zerową, ułamkową i za dużą', async () => {
    for (const reward of [0, 2.5, 501]) {
      expect((await sendJson('POST', '/api/recurrences', { title: 'Śmieci', pattern: DAILY, reward })).status).toBe(400);
    }
    const rule = await addRule({ title: 'Śmieci', pattern: DAILY });
    expect((await changeRule(rule.id, { reward: -5 })).status).toBe(400);
  });
});
