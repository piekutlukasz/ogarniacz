import { randomUUID } from 'node:crypto';
import { validate } from '../validate';
import {
  canChangeTask,
  canReleaseTask,
  canTakeTask,
  createTaskSchema,
  type Task,
  type UpdateTask,
  updateTaskSchema,
  warsawDate,
} from '@ogarniacz/shared';
import { and, asc, desc, eq, isNotNull, isNull, lt, ne } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import type { AppEnv } from '../auth/middleware';
import type { UserRow } from '../auth/users';
import type { Db } from '../db/client';
import { taskEvents, tasks, users } from '../db/schema';
import { notifyAssigned } from '../push/jobs';
import type { PushSettings } from '../push/sender';

type TaskRow = typeof tasks.$inferSelect;

/** Archiwum rośnie bez końca, a telefon potrzebuje tylko ostatnich pozycji. */
const ARCHIVE_LIMIT = 200;

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    assigneeId: row.assigneeId,
    assignedById: row.assignedById,
    dueOn: row.dueOn,
    createdById: row.createdById,
    recurrenceId: row.recurrenceId,
    reward: row.reward,
    color: row.color,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

/**
 * Uprawnienia z PROJEKT.md, rozdział 6. Zwraca komunikat błędu albo `undefined`, gdy wolno.
 * Rodzic może wszystko. Dziecko zmienia zadania przypisane do siebie i nie przypisuje innych.
 * Zadanie bez osoby dziecko może tylko przejąć: zmienić status albo przypisać do siebie.
 * Oddać (osoba `null`) może tylko zadanie, które samo wzięło, i tylko w „Do zrobienia”.
 * Nagrodę ustawia tylko rodzic, a tytułu zadania z nagrodą dziecko nie zmienia.
 */
function denyChange(user: UserRow, task: TaskRow, change: UpdateTask): string | undefined {
  if (user.role === 'parent') return undefined;
  if (change.archived !== undefined) return 'Tylko rodzic może archiwizować i przywracać zadania';
  if (change.reward !== undefined) return 'Tylko rodzic ustawia nagrodę za zadanie';
  if (change.title !== undefined && task.reward !== null) return 'Nazwę zadania z nagrodą zmienia tylko rodzic';
  if (change.assigneeId === null) {
    if (!canReleaseTask(user, { ...task, status: change.status ?? task.status })) {
      return 'Oddać można tylko zadanie wzięte samodzielnie, gdy jest w „Do zrobienia”';
    }
  } else if (change.assigneeId !== undefined && change.assigneeId !== user.id) {
    return 'Tylko rodzic przypisuje zadania innym';
  }
  if (canTakeTask(user, task)) {
    const onlyTaking = Object.keys(change).every((key) => key === 'status' || key === 'assigneeId');
    return onlyTaking ? undefined : 'Zadanie bez osoby możesz tylko wziąć do zrobienia';
  }
  if (!canChangeTask(user, task)) return 'Możesz zmieniać tylko swoje zadania';
  return undefined;
}

export function isActiveUser(db: Db, id: string): boolean {
  const row = db.select({ disabledAt: users.disabledAt }).from(users).where(eq(users.id, id)).get();
  return row !== undefined && row.disabledAt === null;
}

const listQuerySchema = z.object({ archived: z.enum(['true', 'false']).optional() });

/** Powiadomienie o przypisaniu idzie w tle: błąd wysyłki nie może zepsuć zapisu zadania. */
function announceAssignment(db: Db, push: PushSettings | undefined, now: () => Date, row: TaskRow, actor: UserRow) {
  if (!push || !row.assigneeId || row.assigneeId === actor.id) return;
  notifyAssigned(db, push, now, row, actor.name).catch(() => console.error('[push] BŁĄD powiadomienia o zadaniu'));
}

export function taskRoutes(db: Db, now: () => Date, push?: PushSettings) {
  return new Hono<AppEnv>()
    .get('/', validate('query', listQuerySchema), (c) => {
      if (c.req.valid('query').archived === 'true') {
        const rows = db
          .select()
          .from(tasks)
          .where(isNotNull(tasks.archivedAt))
          .orderBy(desc(tasks.archivedAt))
          .limit(ARCHIVE_LIMIT)
          .all();
        return c.json(rows.map(toTask));
      }
      const rows = db.select().from(tasks).where(isNull(tasks.archivedAt)).orderBy(desc(tasks.createdAt)).all();
      return c.json(rows.map(toTask));
    })
    .get('/today', (c) => {
      const user = c.get('user');
      const date = warsawDate(now());
      const mine = and(isNull(tasks.archivedAt), eq(tasks.assigneeId, user.id));

      const overdue = db
        .select()
        .from(tasks)
        .where(and(mine, lt(tasks.dueOn, date), ne(tasks.status, 'done')))
        .orderBy(asc(tasks.dueOn), asc(tasks.createdAt))
        .all();
      const today = db
        .select()
        .from(tasks)
        .where(and(mine, eq(tasks.dueOn, date)))
        .orderBy(asc(tasks.createdAt))
        .all();

      return c.json({ date, overdue: overdue.map(toTask), today: today.map(toTask) });
    })
    .post('/', validate('json', createTaskSchema), (c) => {
      const input = c.req.valid('json');
      const user = c.get('user');

      // Dziecko tworzy zadania tylko dla siebie, więc pominięta osoba oznacza je samo.
      const fallback = user.role === 'child' ? user.id : null;
      const assigneeId = input.assigneeId === undefined ? fallback : input.assigneeId;
      if (user.role === 'child' && assigneeId !== user.id) {
        return c.json({ error: 'Możesz dodawać zadania tylko dla siebie' }, 403);
      }
      if (user.role === 'child' && input.reward != null) {
        return c.json({ error: 'Tylko rodzic ustawia nagrodę za zadanie' }, 403);
      }
      if (assigneeId && !isActiveUser(db, assigneeId)) {
        return c.json({ error: 'Nie ma takiej osoby' }, 400);
      }

      const at = now();
      const values = {
        title: input.title,
        assigneeId,
        dueOn: input.dueOn ?? null,
        reward: input.reward ?? null,
        color: input.color ?? null,
      };
      const row = db.transaction((tx) => {
        const created = tx
          .insert(tasks)
          .values({
            id: randomUUID(),
            ...values,
            assignedById: assigneeId ? user.id : null,
            createdById: user.id,
            createdAt: at,
            updatedAt: at,
          })
          .returning()
          .get();
        tx.insert(taskEvents)
          .values({ taskId: created.id, type: 'created', changes: values, actorId: user.id, createdAt: at })
          .run();
        return created;
      });

      announceAssignment(db, push, now, row, user);
      return c.json(toTask(row), 201);
    })
    .patch('/:id', validate('json', updateTaskSchema), (c) => {
      const id = c.req.param('id');
      const requested = c.req.valid('json');
      const user = c.get('user');

      const existing = db.select().from(tasks).where(eq(tasks.id, id)).get();
      if (!existing) {
        return c.json({ error: 'Nie znaleziono zadania' }, 404);
      }
      const denied = denyChange(user, existing, requested);
      if (denied) {
        return c.json({ error: denied }, 403);
      }
      // Dziecko, które bierze się za zadanie bez osoby, staje się jego osobą. Historia zapisuje to przypisanie.
      const change = canTakeTask(user, existing) ? { ...requested, assigneeId: user.id } : requested;
      const { archived, ...fields } = change;
      if (fields.assigneeId && !isActiveUser(db, fields.assigneeId)) {
        return c.json({ error: 'Nie ma takiej osoby' }, 400);
      }

      const at = now();
      const row = db.transaction((tx) => {
        const updated = tx
          .update(tasks)
          .set({
            ...fields,
            ...(fields.assigneeId === undefined ? {} : { assignedById: fields.assigneeId ? user.id : null }),
            // Chwila ukończenia decyduje o tygodniu nagrody. Ponowne „Gotowe” jej nie przesuwa, a cofnięcie ją czyści.
            ...(fields.status === undefined || fields.status === existing.status
              ? {}
              : { completedAt: fields.status === 'done' ? at : null }),
            updatedAt: at,
            ...(archived === undefined ? {} : { archivedAt: archived ? at : null }),
          })
          .where(eq(tasks.id, id))
          .returning()
          .get();
        tx.insert(taskEvents).values({ taskId: id, type: 'updated', changes: change, actorId: user.id, createdAt: at }).run();
        return updated;
      });

      if (fields.assigneeId && fields.assigneeId !== existing.assigneeId) announceAssignment(db, push, now, row, user);
      return c.json(toTask(row));
    });
}
