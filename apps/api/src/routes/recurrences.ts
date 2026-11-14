import { randomUUID } from 'node:crypto';
import { validate } from '../validate';
import {
  type Recurrence,
  addDays,
  createRecurrenceSchema,
  nextOccurrence,
  updateRecurrenceSchema,
  warsawDate,
} from '@ogarniacz/shared';
import { asc, eq, isNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { type AppEnv, requireRole } from '../auth/middleware';
import type { Db } from '../db/client';
import { recurrences } from '../db/schema';
import { generateRecurringTasks } from '../jobs/recurrences';
import { isActiveUser } from './tasks';

type RecurrenceRow = typeof recurrences.$inferSelect;

function later(a: string, b: string): string {
  return b > a ? b : a;
}

function toRecurrence(row: RecurrenceRow, today: string): Recurrence {
  const paused = row.pausedAt !== null;
  let nextOn: string | null = null;
  if (!paused || row.pausedUntil !== null) {
    let from = later(today, addDays(row.lastDueOn, 1));
    if (paused && row.pausedUntil !== null) from = later(from, addDays(row.pausedUntil, 1));
    nextOn = nextOccurrence(row.pattern, row.startOn, from) ?? null;
  }
  return {
    id: row.id,
    title: row.title,
    assigneeId: row.assigneeId,
    pattern: row.pattern,
    startOn: row.startOn,
    paused,
    pausedUntil: row.pausedUntil,
    nextOn,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Reguły cykliczne. Zarządza nimi tylko rodzic (PROJEKT.md, rozdział 6). */
export function recurrenceRoutes(db: Db, now: () => Date) {
  const find = (id: string) => db.select().from(recurrences).where(eq(recurrences.id, id)).get();

  return new Hono<AppEnv>()
    .use('*', requireRole('parent'))
    .get('/', (c) => {
      const today = warsawDate(now());
      const rows = db
        .select()
        .from(recurrences)
        .where(isNull(recurrences.archivedAt))
        .orderBy(asc(recurrences.createdAt))
        .all();
      return c.json(rows.map((row) => toRecurrence(row, today)));
    })
    .post('/', validate('json', createRecurrenceSchema), (c) => {
      const input = c.req.valid('json');
      const assigneeId = input.assigneeId ?? null;
      if (assigneeId && !isActiveUser(db, assigneeId)) {
        return c.json({ error: 'Nie ma takiej osoby' }, 400);
      }

      const at = now();
      const today = warsawDate(at);
      const startOn = input.startOn ?? today;
      const id = randomUUID();
      db.insert(recurrences)
        .values({
          id,
          title: input.title,
          assigneeId,
          pattern: input.pattern,
          startOn,
          // Wcześniejszych dni nie nadrabiamy: pierwsze zadanie powstaje dziś albo w dniu startu.
          lastDueOn: addDays(later(startOn, today), -1),
          createdById: c.get('user').id,
          createdAt: at,
          updatedAt: at,
        })
        .run();
      generateRecurringTasks(db, at, id);

      return c.json(toRecurrence(find(id) as RecurrenceRow, today), 201);
    })
    .patch('/:id', validate('json', updateRecurrenceSchema), (c) => {
      const id = c.req.param('id');
      const { pause, archived, ...fields } = c.req.valid('json');
      const existing = find(id);
      if (!existing || existing.archivedAt) {
        return c.json({ error: 'Nie znaleziono reguły' }, 404);
      }
      if (fields.assigneeId && !isActiveUser(db, fields.assigneeId)) {
        return c.json({ error: 'Nie ma takiej osoby' }, 400);
      }

      const at = now();
      const today = warsawDate(at);
      if (pause?.until && pause.until < today) {
        return c.json({ error: 'Koniec pauzy nie może być w przeszłości' }, 400);
      }

      const yesterday = addDays(today, -1);
      // Po zmianie wzorca i po wznowieniu nie nadrabiamy dni, które już minęły.
      const skipPast = fields.pattern !== undefined || fields.startOn !== undefined || pause === null;
      db.update(recurrences)
        .set({
          ...fields,
          ...(skipPast ? { lastDueOn: later(existing.lastDueOn, yesterday) } : {}),
          ...(pause === undefined ? {} : { pausedAt: pause ? at : null, pausedUntil: pause?.until ?? null }),
          ...(archived ? { archivedAt: at } : {}),
          updatedAt: at,
        })
        .where(eq(recurrences.id, id))
        .run();

      if (archived) return c.body(null, 204);
      generateRecurringTasks(db, at, id);
      return c.json(toRecurrence(find(id) as RecurrenceRow, today));
    });
}
