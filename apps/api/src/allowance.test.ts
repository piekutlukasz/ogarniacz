import { type Allowance, type Task, allowanceSchema, taskSchema } from '@ogarniacz/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createUser } from './auth/users';
import { type Db, openDatabase } from './db/client';
import { payouts, tasks } from './db/schema';

let db: Db;
let close: () => void;
let app: ReturnType<typeof createApp>;
let parentCookie: string;
let zosiaCookie: string;
let kubaCookie: string;
let clock: number;
let parentId: string;
let zosiaId: string;
let kubaId: string;

function send(method: 'POST' | 'PATCH' | 'PUT', path: string, body: unknown, session = parentCookie) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: session },
    body: JSON.stringify(body),
  });
}

async function logIn(login: string, password: string): Promise<string> {
  const response = await send('POST', '/api/auth/login', { login, password }, '');
  expect(response.status).toBe(200);
  return (response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
}

async function addTask(title: string, extra: Record<string, unknown> = {}, session = parentCookie): Promise<Task> {
  const response = await send('POST', '/api/tasks', { title, ...extra }, session);
  expect(response.status).toBe(201);
  return taskSchema.parse(await response.json());
}

async function change(id: string, body: Record<string, unknown>, session = parentCookie) {
  return send('PATCH', `/api/tasks/${id}`, body, session);
}

/** Zadanie z nagrodą dla dziecka, od razu ukończone przez to dziecko. */
async function finish(title: string, reward: number, assigneeId: string, session: string): Promise<Task> {
  const task = await addTask(title, { reward, assigneeId });
  expect((await change(task.id, { status: 'done' }, session)).status).toBe(200);
  return task;
}

async function allowance(session = parentCookie): Promise<Allowance> {
  const response = await app.request('/api/allowance', { headers: { Cookie: session } });
  expect(response.status).toBe(200);
  return allowanceSchema.parse(await response.json());
}

async function allowanceOf(childId: string, session = parentCookie) {
  const child = (await allowance(session)).children.find((item) => item.childId === childId);
  if (!child) throw new Error('Brak dziecka w odpowiedzi');
  return child;
}

function setClock(iso: string) {
  clock = Date.parse(iso);
}

beforeEach(async () => {
  ({ db, close } = openDatabase(':memory:', './drizzle'));
  // Środa 4 listopada 2026, 12:00 w Polsce. Tydzień trwa od 2 do 8 listopada.
  setClock('2026-11-04T11:00:00Z');
  app = createApp({ db, now: () => new Date(clock) });
  // Konta założone w poprzednim tygodniu, żeby tydzień 26 października – 1 listopada był już widoczny jako zamknięty.
  const created = new Date('2026-10-28T10:00:00Z');
  parentId = (await createUser(db, { login: 'tata', name: 'Tata', role: 'parent', password: 'haslo-rodzica' }, created)).id;
  zosiaId = (await createUser(db, { login: 'zosia', name: 'Zosia', role: 'child', password: 'haslo-dziecka' }, created)).id;
  kubaId = (await createUser(db, { login: 'kuba', name: 'Kuba', role: 'child', password: 'haslo-kuby' }, created)).id;
  parentCookie = await logIn('tata', 'haslo-rodzica');
  zosiaCookie = await logIn('zosia', 'haslo-dziecka');
  kubaCookie = await logIn('kuba', 'haslo-kuby');
});

afterEach(() => close());

describe('nagroda na zadaniu', () => {
  it('rodzic ustawia, zmienia i zdejmuje nagrodę', async () => {
    const task = await addTask('Umyj auto', { reward: 15 });
    expect(task.reward).toBe(15);

    const raised = taskSchema.parse(await (await change(task.id, { reward: 20 })).json());
    expect(raised.reward).toBe(20);

    const cleared = taskSchema.parse(await (await change(task.id, { reward: null })).json());
    expect(cleared.reward).toBeNull();
  });

  it('zadanie bez podanej nagrody jej nie ma', async () => {
    expect((await addTask('Odrób lekcje')).reward).toBeNull();
  });

  it('odrzuca nagrodę zerową, ujemną, ułamkową i za dużą', async () => {
    for (const reward of [0, -5, 2.5, 501]) {
      const response = await send('POST', '/api/tasks', { title: 'Umyj auto', reward });
      expect(response.status).toBe(400);
    }
  });

  it('dziecko nie dodaje zadania z nagrodą', async () => {
    const response = await send('POST', '/api/tasks', { title: 'Zjem lody', reward: 100 }, zosiaCookie);

    expect(response.status).toBe(403);
  });

  it('dziecko nie zmienia ani nie zdejmuje nagrody, także na swoim zadaniu', async () => {
    const task = await addTask('Odkurz salon', { reward: 10, assigneeId: zosiaId });

    expect((await change(task.id, { reward: 100 }, zosiaCookie)).status).toBe(403);
    expect((await change(task.id, { reward: null }, zosiaCookie)).status).toBe(403);
    const own = await addTask('Moje zadanie', {}, zosiaCookie);
    expect((await change(own.id, { reward: 5 }, zosiaCookie)).status).toBe(403);
  });

  it('dziecko nie zmienia nazwy zadania z nagrodą, ale zmienia status i termin', async () => {
    const task = await addTask('Odkurz cały dom', { reward: 10, assigneeId: zosiaId });

    expect((await change(task.id, { title: 'Odkurz kąt' }, zosiaCookie)).status).toBe(403);
    expect((await change(task.id, { dueOn: '2026-11-06' }, zosiaCookie)).status).toBe(200);
    expect((await change(task.id, { status: 'in_progress' }, zosiaCookie)).status).toBe(200);
  });

  it('dziecko dalej zmienia nazwę swojego zadania bez nagrody', async () => {
    const task = await addTask('Posprzątaj pokój', { assigneeId: zosiaId });

    expect((await change(task.id, { title: 'Posprzątaj biurko' }, zosiaCookie)).status).toBe(200);
  });
});

describe('kieszonkowe: kto co widzi', () => {
  it('rodzic widzi wszystkie dzieci ze stałą kwotą 50 zł', async () => {
    const result = await allowance();

    expect(result.date).toBe('2026-11-04');
    expect(result.children.map((child) => child.childId)).toEqual([zosiaId, kubaId]);
    for (const child of result.children) {
      expect(child.current).toMatchObject({ weekStart: '2026-11-02', payoutOn: '2026-11-09', base: 50, total: 50, paidAt: null });
    }
    expect(result.open).toEqual([]);
  });

  it('dziecko widzi tylko siebie', async () => {
    await finish('Wynieś śmieci', 5, kubaId, kubaCookie);

    const result = await allowance(zosiaCookie);

    expect(result.children.map((child) => child.childId)).toEqual([zosiaId]);
    expect(result.children[0]?.current.total).toBe(50);
  });

  it('dziecko widzi otwarte zadania z nagrodą: swoje i dla chętnych, od najbliższego terminu', async () => {
    await addTask('Bez terminu', { reward: 5, assigneeId: zosiaId });
    await addTask('Dla chętnych', { reward: 15, dueOn: '2026-11-07' });
    await addTask('Na jutro', { reward: 10, assigneeId: zosiaId, dueOn: '2026-11-05' });
    await addTask('Zadanie Kuby', { reward: 10, assigneeId: kubaId });
    await addTask('Bez nagrody', { assigneeId: zosiaId });
    await finish('Już zrobione', 5, zosiaId, zosiaCookie);

    const { open } = await allowance(zosiaCookie);

    expect(open.map((item) => [item.title, item.reward, item.forAnyone])).toEqual([
      ['Na jutro', 10, false],
      ['Dla chętnych', 15, true],
      ['Bez terminu', 5, false],
    ]);
  });
});

describe('kieszonkowe: naliczanie nagród', () => {
  it('nagroda liczy się od „Gotowe” i znika po cofnięciu', async () => {
    const task = await addTask('Odkurz salon', { reward: 10, assigneeId: zosiaId });
    await change(task.id, { status: 'in_progress' }, zosiaCookie);
    expect((await allowanceOf(zosiaId)).current.total).toBe(50);

    await change(task.id, { status: 'done' }, zosiaCookie);
    const earned = (await allowanceOf(zosiaId)).current;
    expect(earned.total).toBe(60);
    expect(earned.rewards).toEqual([{ taskId: task.id, title: 'Odkurz salon', reward: 10, completedOn: '2026-11-04' }]);

    await change(task.id, { status: 'in_progress' }, zosiaCookie);
    expect((await allowanceOf(zosiaId)).current.total).toBe(50);
  });

  it('zadanie dla chętnych nagradza dziecko, które je wzięło', async () => {
    const task = await addTask('Umyj auto', { reward: 15 });
    await change(task.id, { status: 'done' }, kubaCookie);

    expect((await allowanceOf(kubaId)).current.total).toBe(65);
    expect((await allowanceOf(zosiaId)).current.total).toBe(50);
  });

  it('zarchiwizowane ukończone zadanie dalej się liczy', async () => {
    const task = await finish('Odkurz salon', 10, zosiaId, zosiaCookie);
    await change(task.id, { archived: true });

    expect((await allowanceOf(zosiaId)).current.total).toBe(60);
  });

  it('zadanie ukończone przez rodzica nikomu nie dolicza nagrody', async () => {
    const task = await addTask('Umyj auto', { reward: 15, assigneeId: parentId });
    await change(task.id, { status: 'done' });

    const result = await allowance();
    expect(result.children.map((child) => child.current.total)).toEqual([50, 50]);
  });

  it('nagroda trafia do tygodnia ukończenia według czasu polskiego', async () => {
    // Niedziela 8 listopada, 23:30 w Polsce.
    setClock('2026-11-08T22:30:00Z');
    await finish('W niedzielę wieczorem', 10, zosiaId, zosiaCookie);
    // Poniedziałek 9 listopada, 00:30 w Polsce.
    setClock('2026-11-08T23:30:00Z');
    await finish('W poniedziałek po północy', 5, zosiaId, zosiaCookie);

    const child = await allowanceOf(zosiaId);

    expect(child.current).toMatchObject({ weekStart: '2026-11-09', payoutOn: '2026-11-16', total: 55 });
    expect(child.closed[0]).toMatchObject({ weekStart: '2026-11-02', payoutOn: '2026-11-09', total: 60, paidAt: null });
  });

  it('nagroda za spóźnione zadanie też się liczy', async () => {
    await finish('Po terminie', 10, zosiaId, zosiaCookie);
    const task = await addTask('Zaległe', { reward: 5, assigneeId: zosiaId, dueOn: '2026-11-01' });
    await change(task.id, { status: 'done' }, zosiaCookie);

    expect((await allowanceOf(zosiaId)).current.total).toBe(65);
  });

  it('nie pokazuje tygodni sprzed założenia konta', async () => {
    const child = await allowanceOf(zosiaId);

    expect(child.closed.map((week) => week.weekStart)).toEqual(['2026-10-26']);
  });
});

describe('kieszonkowe: stawka', () => {
  it('nowa stawka obowiązuje od trwającego tygodnia i nie działa wstecz', async () => {
    // Poniedziałek 9 listopada: tydzień 2–8 listopada czeka na wypłatę.
    setClock('2026-11-09T08:00:00Z');

    const response = await send('PUT', '/api/allowance/rates', { rates: [{ childId: zosiaId, amount: 70 }] });
    expect(response.status).toBe(200);

    const zosia = await allowanceOf(zosiaId);
    expect(zosia.current).toMatchObject({ weekStart: '2026-11-09', base: 70, total: 70 });
    expect(zosia.closed[0]).toMatchObject({ weekStart: '2026-11-02', base: 50, total: 50 });
    expect((await allowanceOf(kubaId)).current.base).toBe(50);

    // Tydzień później stawka dalej obowiązuje, a poprzedni tydzień ma już nową.
    setClock('2026-11-16T08:00:00Z');
    const later = await allowanceOf(zosiaId);
    expect(later.current.base).toBe(70);
    expect(later.closed.map((week) => week.base)).toEqual([70, 50, 50]);
  });

  it('druga zmiana w tym samym tygodniu zastępuje pierwszą', async () => {
    await send('PUT', '/api/allowance/rates', { rates: [{ childId: zosiaId, amount: 70 }] });
    await send('PUT', '/api/allowance/rates', { rates: [{ childId: zosiaId, amount: 55 }] });

    expect((await allowanceOf(zosiaId)).current.base).toBe(55);
  });

  it('zero wyłącza kieszonkowe, a nagrody zostają', async () => {
    await send('PUT', '/api/allowance/rates', { rates: [{ childId: zosiaId, amount: 0 }] });
    await finish('Odkurz salon', 10, zosiaId, zosiaCookie);

    expect((await allowanceOf(zosiaId)).current).toMatchObject({ base: 0, total: 10 });
  });

  it('dziecko nie ustawia stawki', async () => {
    const response = await send('PUT', '/api/allowance/rates', { rates: [{ childId: zosiaId, amount: 500 }] }, zosiaCookie);

    expect(response.status).toBe(403);
    expect((await allowanceOf(zosiaId)).current.base).toBe(50);
  });

  it('odrzuca stawkę dla rodzica i kwotę spoza zakresu', async () => {
    expect((await send('PUT', '/api/allowance/rates', { rates: [{ childId: parentId, amount: 50 }] })).status).toBe(400);
    expect((await send('PUT', '/api/allowance/rates', { rates: [{ childId: zosiaId, amount: -5 }] })).status).toBe(400);
    expect((await send('PUT', '/api/allowance/rates', { rates: [{ childId: zosiaId, amount: 501 }] })).status).toBe(400);
  });
});

describe('kieszonkowe: wypłata', () => {
  const lastWeek = { weekStart: '2026-11-02' };

  it('rodzic oznacza wypłatę za zamknięty tydzień, a kwota zostaje zapisana', async () => {
    const task = await finish('Odkurz salon', 10, zosiaId, zosiaCookie);
    setClock('2026-11-09T08:00:00Z');

    const response = await send('POST', '/api/allowance/payouts', { childId: zosiaId, ...lastWeek });
    expect(response.status).toBe(200);

    const paid = (await allowanceOf(zosiaId)).closed[0];
    expect(paid).toMatchObject({ weekStart: '2026-11-02', base: 50, total: 60, paidAt: '2026-11-09T08:00:00.000Z' });
    expect(paid?.rewards.map((item) => item.taskId)).toEqual([task.id]);
    // Wypłata jednego dziecka nie rusza drugiego.
    expect((await allowanceOf(kubaId)).closed[0]?.paidAt).toBeNull();

    // Zmiany po wypłacie nie ruszają zapisanej kwoty.
    await change(task.id, { reward: 100 });
    await send('PUT', '/api/allowance/rates', { rates: [{ childId: zosiaId, amount: 90 }] });
    expect((await allowanceOf(zosiaId)).closed[0]?.total).toBe(60);
  });

  it('cofnięte i ponownie ukończone zadanie nie liczy się drugi raz', async () => {
    const task = await finish('Odkurz salon', 10, zosiaId, zosiaCookie);
    setClock('2026-11-09T08:00:00Z');
    await send('POST', '/api/allowance/payouts', { childId: zosiaId, ...lastWeek });

    await change(task.id, { status: 'in_progress' }, zosiaCookie);
    await change(task.id, { status: 'done' }, zosiaCookie);

    const child = await allowanceOf(zosiaId);
    expect(child.current.total).toBe(50);
    expect(child.closed[0]?.total).toBe(60);
  });

  it('ponowne oznaczenie niczego nie zmienia', async () => {
    await finish('Odkurz salon', 10, zosiaId, zosiaCookie);
    setClock('2026-11-09T08:00:00Z');
    await send('POST', '/api/allowance/payouts', { childId: zosiaId, ...lastWeek });
    setClock('2026-11-09T09:00:00Z');

    const again = await send('POST', '/api/allowance/payouts', { childId: zosiaId, ...lastWeek });

    expect(again.status).toBe(200);
    expect((await allowanceOf(zosiaId)).closed[0]).toMatchObject({ total: 60, paidAt: '2026-11-09T08:00:00.000Z' });
  });

  it('nie da się oznaczyć trwającego tygodnia ani dnia, który nie jest poniedziałkiem', async () => {
    expect((await send('POST', '/api/allowance/payouts', { childId: zosiaId, ...lastWeek })).status).toBe(400);
    expect((await send('POST', '/api/allowance/payouts', { childId: zosiaId, weekStart: '2026-10-27' })).status).toBe(400);
    expect((await send('POST', '/api/allowance/payouts', { childId: parentId, weekStart: '2026-10-26' })).status).toBe(400);
  });

  it('dziecko nie oznacza wypłaty', async () => {
    setClock('2026-11-09T08:00:00Z');

    const response = await send('POST', '/api/allowance/payouts', { childId: zosiaId, ...lastWeek }, zosiaCookie);

    expect(response.status).toBe(403);
    expect((await allowanceOf(zosiaId)).closed[0]?.paidAt).toBeNull();
  });

  it('niewypłacony tydzień czeka dalej po kolejnym poniedziałku', async () => {
    await finish('Odkurz salon', 10, zosiaId, zosiaCookie);
    setClock('2026-11-18T11:00:00Z');

    const child = await allowanceOf(zosiaId);

    expect(child.closed.map((week) => [week.weekStart, week.total, week.paidAt])).toEqual([
      ['2026-11-09', 50, null],
      ['2026-11-02', 60, null],
      ['2026-10-26', 50, null],
    ]);
  });

  it('nagroda dodana po wypłacie tygodnia przechodzi na trwający tydzień', async () => {
    const task = await addTask('Odkurz salon', { assigneeId: zosiaId });
    await change(task.id, { status: 'done' }, zosiaCookie);
    setClock('2026-11-09T08:00:00Z');
    await send('POST', '/api/allowance/payouts', { childId: zosiaId, ...lastWeek });

    await change(task.id, { reward: 10 });

    const child = await allowanceOf(zosiaId);
    expect(child.closed[0]?.total).toBe(50);
    expect(child.current.total).toBe(60);
  });
});

describe('kieszonkowe: cofnięcie wypłaty', () => {
  const lastWeek = { weekStart: '2026-11-02' };
  const cancel = (body: Record<string, unknown>, session = parentCookie) => send('POST', '/api/allowance/payouts/cancel', body, session);

  it('rodzic cofa wypłatę: tydzień znów czeka, a nagrody wracają do niego', async () => {
    const task = await finish('Odkurz salon', 10, zosiaId, zosiaCookie);
    setClock('2026-11-09T08:00:00Z');
    await send('POST', '/api/allowance/payouts', { childId: zosiaId, ...lastWeek });

    const response = await cancel({ childId: zosiaId, ...lastWeek });

    expect(response.status).toBe(200);
    const week = allowanceSchema.parse(await response.json()).children.find((item) => item.childId === zosiaId)?.closed[0];
    expect(week).toMatchObject({ weekStart: '2026-11-02', total: 60, paidAt: null });
    expect(week?.rewards.map((item) => item.taskId)).toEqual([task.id]);
  });

  it('po cofnięciu wypłatę można oznaczyć jeszcze raz, z aktualnymi kwotami', async () => {
    const task = await finish('Odkurz salon', 10, zosiaId, zosiaCookie);
    setClock('2026-11-09T08:00:00Z');
    await send('POST', '/api/allowance/payouts', { childId: zosiaId, ...lastWeek });
    await cancel({ childId: zosiaId, ...lastWeek });
    await change(task.id, { reward: 15 });
    setClock('2026-11-09T09:00:00Z');

    expect((await send('POST', '/api/allowance/payouts', { childId: zosiaId, ...lastWeek })).status).toBe(200);

    expect((await allowanceOf(zosiaId)).closed[0]).toMatchObject({ total: 65, paidAt: '2026-11-09T09:00:00.000Z' });
  });

  it('cofnięta wypłata zostaje w bazie z tym, kto i kiedy ją cofnął', async () => {
    await finish('Odkurz salon', 10, zosiaId, zosiaCookie);
    setClock('2026-11-09T08:00:00Z');
    await send('POST', '/api/allowance/payouts', { childId: zosiaId, ...lastWeek });
    setClock('2026-11-09T08:05:00Z');
    await cancel({ childId: zosiaId, ...lastWeek });

    const rows = db.select().from(payouts).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ base: 50, rewards: 10, cancelledById: parentId, cancelledAt: new Date('2026-11-09T08:05:00Z') });
    expect(db.select().from(tasks).all().every((task) => task.payoutId === null)).toBe(true);
  });

  it('ponowne cofnięcie i cofnięcie niewypłaconego tygodnia niczego nie zmienia', async () => {
    await finish('Odkurz salon', 10, zosiaId, zosiaCookie);
    setClock('2026-11-09T08:00:00Z');

    expect((await cancel({ childId: zosiaId, ...lastWeek })).status).toBe(200);
    await send('POST', '/api/allowance/payouts', { childId: zosiaId, ...lastWeek });
    await cancel({ childId: zosiaId, ...lastWeek });
    expect((await cancel({ childId: zosiaId, ...lastWeek })).status).toBe(200);

    expect((await allowanceOf(zosiaId)).closed[0]).toMatchObject({ total: 60, paidAt: null });
  });

  it('cofnięcie dotyczy tylko jednego dziecka', async () => {
    setClock('2026-11-09T08:00:00Z');
    await send('POST', '/api/allowance/payouts', { childId: zosiaId, ...lastWeek });
    await send('POST', '/api/allowance/payouts', { childId: kubaId, ...lastWeek });

    await cancel({ childId: zosiaId, ...lastWeek });

    expect((await allowanceOf(zosiaId)).closed[0]?.paidAt).toBeNull();
    expect((await allowanceOf(kubaId)).closed[0]?.paidAt).not.toBeNull();
  });

  it('nie cofa trwającego tygodnia, zbyt starego ani wypłaty rodzica', async () => {
    setClock('2026-11-09T08:00:00Z');
    expect((await cancel({ childId: zosiaId, weekStart: '2026-11-09' })).status).toBe(400);
    expect((await cancel({ childId: zosiaId, weekStart: '2026-10-05' })).status).toBe(400);
    expect((await cancel({ childId: parentId, ...lastWeek })).status).toBe(400);
  });

  it('dziecko nie cofa wypłaty', async () => {
    setClock('2026-11-09T08:00:00Z');
    await send('POST', '/api/allowance/payouts', { childId: zosiaId, ...lastWeek });

    expect((await cancel({ childId: zosiaId, ...lastWeek }, zosiaCookie)).status).toBe(403);
    expect((await allowanceOf(zosiaId)).closed[0]?.paidAt).not.toBeNull();
  });
});
