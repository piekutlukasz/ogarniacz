import { DUE_REMINDER_HOUR, addDays, isQuietHour, warsawDate, type Task } from '@ogarniacz/shared';
import { and, asc, eq, gte, isNull, lte, ne, or } from 'drizzle-orm';
import type { Db } from '../db/client';
import { calendarEvents, calendars, shoppingItems, tasks, users } from '../db/schema';
import { getPrefs, notifyUser } from './notify';
import type { PushSettings } from './sender';

/** Podsumowanie poranne można nadrobić po restarcie najpóźniej do tej godziny, potem byłoby już nie na miejscu. */
const MORNING_LATEST_HOUR = 12;
/** Przypomnienie o jutrzejszym terminie wychodzi w tym oknie godzin. */
const DUE_LATEST_HOUR = 22;
const MAX_TITLES = 3;

const hourFormat = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: '2-digit', hourCycle: 'h23' });
const timeFormat = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** Pełna godzina 0-23 w czasie polskim. */
export function warsawHour(moment: Date): number {
  return Number(hourFormat.format(moment));
}

function plural(count: number, one: string, few: string, many: string): string {
  if (count === 1) return one;
  const lastTwo = count % 100;
  const last = count % 10;
  return last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? few : many;
}

function listTitles(titles: string[]): string {
  const shown = titles.slice(0, MAX_TITLES).join(', ');
  return titles.length > MAX_TITLES ? `${shown} i ${titles.length - MAX_TITLES} więcej` : shown;
}

function activeUsers(db: Db) {
  return db.select().from(users).where(isNull(users.disabledAt)).all();
}

export function buildMorningSummary(db: Db, userId: string, date: string, firstName: string) {
  const mine = and(isNull(tasks.archivedAt), eq(tasks.assigneeId, userId), ne(tasks.status, 'done'));
  const dueToday = db.select({ title: tasks.title }).from(tasks).where(and(mine, eq(tasks.dueOn, date))).orderBy(asc(tasks.createdAt)).all();
  const overdue = db.select({ title: tasks.title }).from(tasks).where(and(mine, lte(tasks.dueOn, addDays(date, -1)))).orderBy(asc(tasks.dueOn)).all();
  const events = db
    .select({ title: calendarEvents.title, allDay: calendarEvents.allDay, startsAt: calendarEvents.startsAt })
    .from(calendarEvents)
    .innerJoin(calendars, eq(calendars.id, calendarEvents.calendarId))
    .where(
      and(
        isNull(calendars.archivedAt),
        or(eq(calendars.scope, 'family'), eq(calendars.ownerId, userId)),
        lte(calendarEvents.startOn, date),
        gte(calendarEvents.endOn, date),
      ),
    )
    .orderBy(asc(calendarEvents.allDay), asc(calendarEvents.startsAt), asc(calendarEvents.title))
    .all();
  const toBuy = db.select({ id: shoppingItems.id }).from(shoppingItems).where(and(isNull(shoppingItems.archivedAt), isNull(shoppingItems.checkedAt))).all().length;

  const parts: string[] = [];
  if (dueToday.length > 0) parts.push(`Na dziś: ${listTitles(dueToday.map((task) => task.title))}.`);
  if (overdue.length > 0) {
    parts.push(`Zaległe: ${overdue.length}.`);
  }
  if (events.length > 0) {
    const labels = events.map((event) => (event.allDay || !event.startsAt ? event.title : `${timeFormat.format(event.startsAt)} ${event.title}`));
    parts.push(`Wydarzenia: ${listTitles(labels)}.`);
  }
  if (toBuy > 0) parts.push(`Do kupienia: ${toBuy} ${plural(toBuy, 'rzecz', 'rzeczy', 'rzeczy')}.`);

  const total = dueToday.length + overdue.length;
  const title = total > 0 ? `${firstName}, na dziś ${total} ${plural(total, 'zadanie', 'zadania', 'zadań')}` : `${firstName}, dzień dobry`;
  return { title, body: parts.length > 0 ? parts.join(' ') : 'Nic na dziś. Miłego dnia!' };
}

/**
 * Poranne podsumowanie dla osób, którym już się należy. Wywoływane często i po restarcie serwera: klucz
 * `morning:<dzień>:<osoba>` sprawia, że każda osoba dostaje je najwyżej raz dziennie.
 */
export async function runMorningSummaries(db: Db, push: PushSettings, now: () => Date): Promise<number> {
  const at = now();
  const hour = warsawHour(at);
  const date = warsawDate(at);
  let sent = 0;
  for (const user of activeUsers(db)) {
    const prefs = getPrefs(db, user.id);
    if (!prefs.morning || hour < prefs.morningHour || hour >= MORNING_LATEST_HOUR) continue;
    const { title, body } = buildMorningSummary(db, user.id, date, user.name);
    const outcome = await notifyUser(db, push, now, { userId: user.id, kind: 'morning', dedupeKey: `morning:${date}:${user.id}`, title, body, screen: 'today' });
    if (outcome === 'sent') sent += 1;
  }
  return sent;
}

/** Wieczorne przypomnienie o zadaniach z terminem jutro: jedno zbiorcze na osobę. */
export async function runDueReminders(db: Db, push: PushSettings, now: () => Date): Promise<number> {
  const at = now();
  const hour = warsawHour(at);
  if (hour < DUE_REMINDER_HOUR || hour > DUE_LATEST_HOUR) return 0;
  const tomorrow = addDays(warsawDate(at), 1);
  let sent = 0;
  for (const user of activeUsers(db)) {
    const prefs = getPrefs(db, user.id);
    if (!prefs.due || isQuietHour(hour, prefs)) continue;
    const due = db
      .select({ title: tasks.title })
      .from(tasks)
      .where(and(isNull(tasks.archivedAt), eq(tasks.assigneeId, user.id), ne(tasks.status, 'done'), eq(tasks.dueOn, tomorrow)))
      .orderBy(asc(tasks.createdAt))
      .all();
    if (due.length === 0) continue;
    const title = due.length === 1 ? 'Jutro termin zadania' : `Jutro termin: ${due.length} ${plural(due.length, 'zadanie', 'zadania', 'zadań')}`;
    const outcome = await notifyUser(db, push, now, { userId: user.id, kind: 'due', dedupeKey: `due:${tomorrow}:${user.id}`, title, body: listTitles(due.map((task) => task.title)), screen: 'board' });
    if (outcome === 'sent') sent += 1;
  }
  return sent;
}

/**
 * Powiadomienie o zadaniu przypisanym przez kogoś innego. Wywoływane bez czekania na wynik: błąd wysyłki
 * nie może zepsuć zapisu zadania. W ciszy nocnej pomijane, bo poranne podsumowanie i tak wymieni zadanie.
 */
export async function notifyAssigned(db: Db, push: PushSettings, now: () => Date, task: Pick<Task, 'id' | 'title' | 'dueOn' | 'assigneeId'>, assignerName: string): Promise<void> {
  if (!task.assigneeId) return;
  const prefs = getPrefs(db, task.assigneeId);
  if (!prefs.assigned || isQuietHour(warsawHour(now()), prefs)) return;
  const due = task.dueOn ? `. Termin: ${task.dueOn.split('-').reverse().join('.')}` : '';
  await notifyUser(db, push, now, {
    userId: task.assigneeId,
    kind: 'assigned',
    dedupeKey: `assigned:${task.id}:${task.assigneeId}:${now().getTime()}`,
    title: `Nowe zadanie od ${assignerName}`,
    body: `${task.title}${due}`,
    screen: 'board',
  });
}
