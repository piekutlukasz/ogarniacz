import { randomUUID } from 'node:crypto';
import { type RecurrencePattern, type TaskColor, type TaskStatus, addDays, daysBetween, shoppingNameKey, warsawDate, weekStart } from '@ogarniacz/shared';
import { count } from 'drizzle-orm';
import { hashPassword, verifyPassword } from './auth/password';
import type { Db } from './db/client';
import { zonedToInstant } from './calendars/zones';
import { allowanceRates, authEvents, calendarEvents, calendars, invites, notificationPrefs, notifications, payouts, pushSubscriptions, recurrences, sessions, shoppingItems, taskEvents, tasks, users } from './db/schema';
import { generateRecurringTasks } from './jobs/recurrences';

/** Wspólne hasło kont demo. Jawne, bo to dane przykładowe na lokalnej, jednorazowej bazie. */
export const DEMO_PASSWORD = 'demo-haslo';

export const DEMO_ACCOUNTS = [
  { login: 'tata', name: 'Tata', role: 'parent', color: 'blue' },
  { login: 'mama', name: 'Mama', role: 'parent', color: 'coral' },
  { login: 'kasia', name: 'Kasia', role: 'child', color: 'mint' },
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Reset demo: co godzinę, o pełnej godzinie czasu polskiego. */
export const DEMO_RESET_CRON = '0 * * * *';

/** Najwięcej wierszy każdego rodzaju w demo. Chroni bazę przed zasypaniem przez przypadkowych gości. */
export const DEMO_ROW_LIMIT = 300;

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Czy w bazie są wyłącznie konta przykładowe (albo żadnych). Konto liczy się jako demo, gdy jego login jest
 * na liście `DEMO_ACCOUNTS` i działa na nie jawne hasło demo. Samo dopasowanie loginu nie wystarcza:
 * prawdziwa rodzina też może mieć konto „tata”, a demo wpuszcza na takie konto bez hasła.
 */
export async function isDemoDatabase(db: Db): Promise<boolean> {
  const demoLogins: readonly string[] = DEMO_ACCOUNTS.map((account) => account.login);
  const accounts = db.select({ login: users.login, passwordHash: users.passwordHash }).from(users).all();
  for (const account of accounts) {
    if (!demoLogins.includes(account.login) || !(await verifyPassword(DEMO_PASSWORD, account.passwordHash))) {
      return false;
    }
  }
  return true;
}

/**
 * Wypełnia pustą bazę przykładowymi danymi. Wszystkie daty liczy względem `now`, więc demo
 * zawsze wygląda na bieżące: zadania na dziś, zaległe, wypłata za zeszły tydzień.
 * Odmawia pracy na bazie, w której są już konta, żeby nie wymieszać przykładów z prawdziwymi danymi.
 * `replace: true` (reset demo) najpierw czyści całą bazę, ale tylko gdy są w niej same konta demo.
 */
export async function seedDemo(db: Db, now = new Date(), { replace = false }: { replace?: boolean } = {}) {
  if (!replace && db.select({ id: users.id }).from(users).limit(1).get()) {
    throw new Error('Baza nie jest pusta. Dane demo można wgrać tylko do nowej bazy');
  }
  if (replace && !(await isDemoDatabase(db))) {
    throw new Error('Baza ma konta spoza demo. Reset skasowałby prawdziwe dane, więc go nie wykonuję');
  }

  // Hasło liczymy raz, przed jakimkolwiek zapisem. Dalej nie ma już await, więc reset nie zostawia
  // żądaniom okna z pustą bazą, a wszystkie konta dzielą jeden skrót.
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  db.transaction((tx) => {
    if (replace) clearDatabase(tx);
    fillDatabase(tx, now, passwordHash);
  });
  // Reguły mają własną transakcję, więc generujemy zadania po zapisie danych.
  generateRecurringTasks(db, now);

  return { accounts: DEMO_ACCOUNTS.map(({ login, name, role }) => ({ login, name, role })), password: DEMO_PASSWORD };
}

/** Przywraca świeże dane demo. Wylogowuje wszystkich, bo konta powstają od nowa. */
export function resetDemo(db: Db, now = new Date()) {
  return seedDemo(db, now, { replace: true });
}

/** Zapisuje demo, gdy baza jest pusta (start nowego kontenera). Zwraca, czy coś wgrano. */
export async function seedDemoIfEmpty(db: Db, now = new Date()): Promise<boolean> {
  if (db.select({ id: users.id }).from(users).limit(1).get()) return false;
  await seedDemo(db, now);
  return true;
}

/** Liczba wierszy, od której demo odmawia dodawania nowych. */
export function demoIsFull(db: Db, table: typeof tasks | typeof shoppingItems | typeof recurrences): boolean {
  const row = db.select({ total: count() }).from(table).get();
  return (row?.total ?? 0) >= DEMO_ROW_LIMIT;
}

// Kolejność od tabel zależnych: klucze obce nie pozwolą usunąć wiersza, na który ktoś jeszcze wskazuje.
function clearDatabase(tx: Tx) {
  tx.delete(notifications).run();
  tx.delete(notificationPrefs).run();
  tx.delete(pushSubscriptions).run();
  tx.delete(calendarEvents).run();
  tx.delete(calendars).run();
  tx.delete(taskEvents).run();
  tx.delete(tasks).run();
  tx.delete(payouts).run();
  tx.delete(allowanceRates).run();
  tx.delete(shoppingItems).run();
  tx.delete(recurrences).run();
  tx.delete(sessions).run();
  tx.delete(authEvents).run();
  tx.delete(invites).run();
  tx.delete(users).run();
}

function fillDatabase(db: Tx, now: Date, passwordHash: string) {
  const today = warsawDate(now);
  const at = (daysAgo: number, hour = 12) => new Date(now.getTime() - daysAgo * DAY_MS + (hour - 12) * 3_600_000);

  // Konta powstają trzy tygodnie temu, żeby Kasia miała już zamknięte tygodnie kieszonkowego.
  const created = at(21);
  const accounts: Record<string, string> = {};
  for (const account of DEMO_ACCOUNTS) {
    const id = randomUUID();
    db.insert(users)
      .values({ id, login: account.login, name: account.name, role: account.role, color: account.color, passwordHash, createdAt: created })
      .run();
    accounts[account.login] = id;
  }
  const [tata, mama, kasia] = [accounts.tata as string, accounts.mama as string, accounts.kasia as string];

  const addTask = (input: {
    title: string;
    status?: TaskStatus;
    assigneeId?: string;
    assignedById?: string;
    dueOn?: string;
    reward?: number;
    color?: TaskColor;
    createdById: string;
    createdDaysAgo?: number;
    completedDaysAgo?: number;
    payoutId?: string;
  }) => {
    const createdAt = at(input.createdDaysAgo ?? 2);
    const status = input.status ?? 'todo';
    const completedAt = status === 'done' ? at(input.completedDaysAgo ?? 0) : null;
    const id = randomUUID();
    db.insert(tasks)
      .values({
        id,
        title: input.title,
        status,
        assigneeId: input.assigneeId ?? null,
        assignedById: input.assigneeId ? (input.assignedById ?? input.createdById) : null,
        dueOn: input.dueOn ?? null,
        reward: input.reward ?? null,
        color: input.color ?? null,
        createdById: input.createdById,
        completedAt,
        payoutId: input.payoutId ?? null,
        createdAt,
        updatedAt: completedAt ?? createdAt,
      })
      .run();
    db.insert(taskEvents)
      .values({
        taskId: id,
        type: 'created',
        changes: {
          title: input.title,
          assigneeId: input.assigneeId ?? null,
          dueOn: input.dueOn ?? null,
          ...(input.color ? { color: input.color } : {}),
        },
        actorId: input.createdById,
        createdAt,
      })
      .run();
  };

  // Tablica: zadania w trzech kolumnach, z terminami i bez.
  addTask({ title: 'Zapłacić rachunek za prąd', assigneeId: tata, dueOn: addDays(today, -1), color: 'yellow', createdById: mama });
  addTask({ title: 'Wynieść śmieci', assigneeId: kasia, dueOn: today, reward: 5, createdById: mama, createdDaysAgo: 1 });
  addTask({ title: 'Odkurzyć salon', assigneeId: kasia, dueOn: addDays(today, 1), reward: 10, color: 'mint', createdById: tata });
  addTask({ title: 'Umówić przegląd samochodu', assigneeId: mama, dueOn: addDays(today, 5), createdById: tata });
  addTask({ title: 'Kupić prezent dla babci', dueOn: addDays(today, 7), color: 'pink', createdById: mama });
  addTask({ title: 'Wyczyścić klatkę chomika', reward: 8, createdById: tata });
  addTask({ title: 'Pomalować półkę w pokoju Kasi', status: 'in_progress', color: 'sky', assigneeId: tata, createdById: tata, createdDaysAgo: 3 });
  addTask({ title: 'Spakować rzeczy na basen', status: 'in_progress', assigneeId: kasia, dueOn: today, createdById: mama, createdDaysAgo: 1 });
  addTask({ title: 'Umyć okna w kuchni', status: 'done', assigneeId: mama, createdById: mama, createdDaysAgo: 4, completedDaysAgo: 1 });

  // Kieszonkowe: tydzień sprzed dwóch tygodni jest już wypłacony, zeszły czeka na wypłatę, a obecny trwa.
  const currentWeek = weekStart(today);
  const paidWeek = addDays(currentWeek, -14);
  const lastWeek = addDays(currentWeek, -7);
  db.insert(allowanceRates)
    .values({ childId: kasia, effectiveFrom: paidWeek, amount: 40, setById: tata, updatedAt: created })
    .run();
  const payoutId = randomUUID();
  db.insert(payouts)
    .values({ id: payoutId, childId: kasia, weekStart: paidWeek, base: 40, rewards: 15, paidById: tata, paidAt: at(7) })
    .run();
  const daysSince = (date: string) => daysBetween(date, today);
  addTask({
    title: 'Posprzątać garaż',
    status: 'done',
    assigneeId: kasia,
    reward: 15,
    createdById: tata,
    createdDaysAgo: daysSince(paidWeek) + 1,
    completedDaysAgo: daysSince(addDays(paidWeek, 2)),
    payoutId,
  });
  // Ukończone w zeszłym tygodniu, więc czekają na wypłatę niezależnie od dnia uruchomienia demo.
  for (const [title, reward, day] of [
    ['Wyprowadzić psa sąsiadów', 12, 1],
    ['Pomóc w zakupach', 6, 3],
  ] as const) {
    addTask({
      title,
      status: 'done',
      assigneeId: kasia,
      reward,
      createdById: mama,
      createdDaysAgo: daysSince(lastWeek) + day + 1,
      completedDaysAgo: daysSince(addDays(lastWeek, day)),
    });
  }

  // Zadania cykliczne: pierwsze wystąpienia generuje ten sam kod co harmonogram.
  const rules: { title: string; pattern: RecurrencePattern; assigneeId: string; reward?: number }[] = [
    { title: 'Wynieść segregację', pattern: { kind: 'weekly', weekdays: [1, 4] }, assigneeId: kasia, reward: 5 },
    { title: 'Podlać kwiaty', pattern: { kind: 'interval', days: 3 }, assigneeId: mama },
    { title: 'Opłacić czynsz', pattern: { kind: 'monthly', day: 10 }, assigneeId: tata },
  ];
  for (const rule of rules) {
    db.insert(recurrences)
      .values({
        id: randomUUID(),
        title: rule.title,
        assigneeId: rule.assigneeId,
        pattern: rule.pattern,
        reward: rule.reward ?? null,
        startOn: addDays(today, -14),
        // Kursor sprzed startu: harmonogram tworzy od razu najświeższe wystąpienie, więc demo ma zaległe i bieżące zadania.
        lastDueOn: addDays(today, -15),
        createdById: mama,
        createdAt: created,
        updatedAt: created,
      })
      .run();
  }
  // Lista zakupów: część w koszyku, a kupione wcześniej zostają w historii jako podpowiedzi.
  const addItem = (name: string, quantity: string | null, by: string, extra: { checked?: boolean; archived?: boolean } = {}) => {
    const createdAt = at(extra.archived ? 6 : 1);
    db.insert(shoppingItems)
      .values({
        id: randomUUID(),
        name,
        nameKey: shoppingNameKey(name),
        quantity,
        checkedAt: extra.checked || extra.archived ? at(extra.archived ? 5 : 0) : null,
        checkedById: extra.checked || extra.archived ? by : null,
        addedById: by,
        createdAt,
        updatedAt: createdAt,
        archivedAt: extra.archived ? at(5) : null,
      })
      .run();
  };
  fillCalendar(db, today, tata, created);
  addItem('Mleko', '2 l', mama);
  addItem('Chleb', null, mama);
  addItem('Jajka', '10 szt.', tata);
  addItem('Masło', null, mama, { checked: true });
  addItem('Pomidory', '1 kg', kasia);
  addItem('Płatki owsiane', null, kasia, { checked: true });
  for (const name of ['Ser żółty', 'Jogurt naturalny', 'Makaron', 'Papier toaletowy', 'Banany']) {
    addItem(name, null, mama, { archived: true });
  }
}

/** Kalendarz z przykładowymi wydarzeniami. Nie ma linku: demo nie pobiera żadnych adresów z internetu. */
function fillCalendar(db: Tx, today: string, ownerId: string, created: Date) {
  const calendarId = randomUUID();
  db.insert(calendars)
    .values({ id: calendarId, name: 'Rodzina', urlEnc: '', urlHost: 'przykład', scope: 'family', ownerId, createdAt: created, updatedAt: created })
    .run();
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  const at = (hour: number, minute = 0) => new Date(zonedToInstant({ year, month, day, hour, minute, second: 0 }, 'Europe/Warsaw'));
  const timed = (title: string, start: Date, end: Date, location: string | null = null) => ({
    calendarId,
    uid: `demo-${title}`,
    instance: '',
    title,
    location,
    allDay: false,
    startsAt: start,
    endsAt: end,
    startOn: today,
    endOn: today,
  });
  db.insert(calendarEvents)
    .values([
      timed('Basen', at(17), at(18, 30), 'Pływalnia miejska'),
      timed('Wywiadówka', at(18, 30), at(19, 30), 'Szkoła'),
      { calendarId, uid: 'demo-urodziny', instance: '', title: 'Urodziny babci', location: null, allDay: true, startsAt: null, endsAt: null, startOn: today, endOn: today },
      { calendarId, uid: 'demo-wycieczka', instance: '', title: 'Wycieczka klasowa', location: null, allDay: true, startsAt: null, endsAt: null, startOn: addDays(today, 2), endOn: addDays(today, 3) },
    ])
    .run();
}
