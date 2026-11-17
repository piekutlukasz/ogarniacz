import { randomUUID } from 'node:crypto';
import { validate } from '../validate';
import {
  ALLOWANCE_WEEKS_BACK,
  type Allowance,
  type AllowanceReward,
  type AllowanceWeek,
  type ChildAllowance,
  DEFAULT_ALLOWANCE,
  addDays,
  cancelPayoutSchema,
  markPayoutSchema,
  payoutDay,
  setAllowanceRatesSchema,
  warsawDate,
  weekStart,
} from '@ogarniacz/shared';
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or } from 'drizzle-orm';
import { Hono } from 'hono';
import { type AppEnv, requireRole } from '../auth/middleware';
import { type UserRow, listUsers } from '../auth/users';
import type { Db } from '../db/client';
import { allowanceRates, payouts, tasks } from '../db/schema';

type TaskRow = typeof tasks.$inferSelect;
type PayoutRow = typeof payouts.$inferSelect;
type RateRow = typeof allowanceRates.$inferSelect;

function activeChildren(db: Db): UserRow[] {
  return listUsers(db).filter((user) => user.role === 'child' && user.disabledAt === null);
}

/** Stawka tygodnia to ostatnia ustawiona nie później niż w nim. `rates` są od najnowszej. */
function rateFor(rates: RateRow[], childId: string, week: string): number {
  return rates.find((rate) => rate.childId === childId && rate.effectiveFrom <= week)?.amount ?? DEFAULT_ALLOWANCE;
}

/** Zamknięte tygodnie dziecka od najnowszego. Nie sięgamy przed tydzień założenia konta. */
function closedWeeks(child: UserRow, currentWeek: string): string[] {
  const firstWeek = weekStart(warsawDate(child.createdAt));
  const weeks: string[] = [];
  for (let back = 1; back <= ALLOWANCE_WEEKS_BACK; back += 1) {
    const week = addDays(currentWeek, -7 * back);
    if (week >= firstWeek) weeks.push(week);
  }
  return weeks;
}

function toReward(task: TaskRow, fallbackDay: string): AllowanceReward {
  return {
    taskId: task.id,
    title: task.title,
    reward: task.reward ?? 0,
    completedOn: task.completedAt ? warsawDate(task.completedAt) : fallbackDay,
  };
}

function sum(rewards: AllowanceReward[]): number {
  return rewards.reduce((total, item) => total + item.reward, 0);
}

/**
 * Kieszonkowe podanych dzieci. Niewypłacona nagroda trafia do tygodnia ukończenia zadania,
 * a gdy ten jest już wypłacony albo za stary, przechodzi na trwający tydzień, żeby nie przepadła.
 */
function buildAllowance(db: Db, children: UserRow[], today: string): ChildAllowance[] {
  if (children.length === 0) return [];
  const childIds = children.map((child) => child.id);
  const currentWeek = weekStart(today);

  const rates = db
    .select()
    .from(allowanceRates)
    .where(inArray(allowanceRates.childId, childIds))
    .orderBy(desc(allowanceRates.effectiveFrom))
    .all();
  // Cofnięte wypłaty zostają w bazie, ale tydzień znów czeka na wypłatę.
  const paid = db
    .select()
    .from(payouts)
    .where(and(inArray(payouts.childId, childIds), isNull(payouts.cancelledAt)))
    .all();
  const unpaidTasks = db
    .select()
    .from(tasks)
    .where(
      and(
        inArray(tasks.assigneeId, childIds),
        isNotNull(tasks.reward),
        eq(tasks.status, 'done'),
        isNotNull(tasks.completedAt),
        isNull(tasks.payoutId),
      ),
    )
    .orderBy(asc(tasks.completedAt))
    .all();
  const paidTasks =
    paid.length === 0
      ? []
      : db
          .select()
          .from(tasks)
          .where(
            and(
              inArray(
                tasks.payoutId,
                paid.map((payout) => payout.id),
              ),
              isNotNull(tasks.reward),
            ),
          )
          .orderBy(asc(tasks.completedAt))
          .all();

  return children.map((child) => {
    const weeks = closedWeeks(child, currentWeek);
    const payoutByWeek = new Map<string, PayoutRow>(
      paid.filter((payout) => payout.childId === child.id).map((payout) => [payout.weekStart, payout]),
    );
    const unpaidWeeks = new Set(weeks.filter((week) => !payoutByWeek.has(week)));

    const rewardsByWeek = new Map<string, AllowanceReward[]>();
    for (const task of unpaidTasks) {
      if (task.assigneeId !== child.id || !task.completedAt) continue;
      const completedWeek = weekStart(warsawDate(task.completedAt));
      const week = unpaidWeeks.has(completedWeek) ? completedWeek : currentWeek;
      rewardsByWeek.set(week, [...(rewardsByWeek.get(week) ?? []), toReward(task, week)]);
    }

    const openWeek = (week: string): AllowanceWeek => {
      const rewards = rewardsByWeek.get(week) ?? [];
      const base = rateFor(rates, child.id, week);
      return { weekStart: week, payoutOn: payoutDay(week), base, rewards, total: base + sum(rewards), paidAt: null };
    };
    const paidWeek = (payout: PayoutRow): AllowanceWeek => ({
      weekStart: payout.weekStart,
      payoutOn: payoutDay(payout.weekStart),
      base: payout.base,
      rewards: paidTasks
        .filter((task) => task.payoutId === payout.id)
        .map((task) => toReward(task, addDays(payout.weekStart, 6))),
      // Kwota z chwili wypłaty: późniejsza zmiana zadania jej nie rusza.
      total: payout.base + payout.rewards,
      paidAt: payout.paidAt.toISOString(),
    });

    return {
      childId: child.id,
      current: openWeek(currentWeek),
      closed: weeks.map((week) => {
        const payout = payoutByWeek.get(week);
        return payout ? paidWeek(payout) : openWeek(week);
      }),
    };
  });
}

/**
 * Kieszonkowe: stała kwota na tydzień plus nagrody za zadania ukończone od poniedziałku do niedzieli.
 * Rodzic widzi wszystkie dzieci, ustawia stawki i oznacza wypłaty. Dziecko widzi tylko siebie.
 */
export function allowanceRoutes(db: Db, now: () => Date) {
  const respond = (user: UserRow): Allowance => {
    const date = warsawDate(now());
    const children = user.role === 'parent' ? activeChildren(db) : [user];
    const open =
      user.role === 'parent'
        ? []
        : db
            .select()
            .from(tasks)
            .where(
              and(
                isNull(tasks.archivedAt),
                isNotNull(tasks.reward),
                ne(tasks.status, 'done'),
                or(eq(tasks.assigneeId, user.id), isNull(tasks.assigneeId)),
              ),
            )
            .orderBy(asc(tasks.createdAt))
            .all()
            // Najpierw najbliższe terminy, zadania bez terminu na końcu.
            .sort((a, b) => (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999'))
            .map((task) => ({
              taskId: task.id,
              title: task.title,
              reward: task.reward ?? 0,
              dueOn: task.dueOn,
              forAnyone: task.assigneeId === null,
            }));
    return { date, children: buildAllowance(db, children, date), open };
  };

  return new Hono<AppEnv>()
    .get('/', (c) => c.json(respond(c.get('user'))))
    .put('/rates', requireRole('parent'), validate('json', setAllowanceRatesSchema), (c) => {
      const { rates } = c.req.valid('json');
      const user = c.get('user');
      const children = activeChildren(db);
      if (rates.some((rate) => !children.some((child) => child.id === rate.childId))) {
        return c.json({ error: 'Kieszonkowe można ustawić tylko dziecku' }, 400);
      }

      const at = now();
      const week = weekStart(warsawDate(at));
      db.transaction((tx) => {
        const known = tx.select().from(allowanceRates).orderBy(desc(allowanceRates.effectiveFrom)).all();
        for (const { childId, amount } of rates) {
          // Bez zmiany nie zapisujemy wiersza, żeby historia stawek pokazywała tylko prawdziwe zmiany.
          if (rateFor(known, childId, week) === amount) continue;
          tx.insert(allowanceRates)
            .values({ childId, effectiveFrom: week, amount, setById: user.id, updatedAt: at })
            .onConflictDoUpdate({
              target: [allowanceRates.childId, allowanceRates.effectiveFrom],
              set: { amount, setById: user.id, updatedAt: at },
            })
            .run();
        }
      });

      return c.json(respond(user));
    })
    .post('/payouts', requireRole('parent'), validate('json', markPayoutSchema), (c) => {
      const { childId, weekStart: week } = c.req.valid('json');
      const user = c.get('user');
      const child = activeChildren(db).find((item) => item.id === childId);
      if (!child) {
        return c.json({ error: 'Nie ma takiego dziecka' }, 400);
      }

      const at = now();
      const closed = buildAllowance(db, [child], warsawDate(at))[0]?.closed.find((item) => item.weekStart === week);
      if (!closed) {
        return c.json({ error: 'Wypłatę można oznaczyć tylko za zakończony tydzień' }, 400);
      }
      // Drugie stuknięcie albo drugi rodzic: wypłata już jest, więc nic nie zmieniamy.
      if (closed.paidAt === null) {
        db.transaction((tx) => {
          const id = randomUUID();
          tx.insert(payouts)
            .values({
              id,
              childId,
              weekStart: week,
              base: closed.base,
              rewards: sum(closed.rewards),
              paidById: user.id,
              paidAt: at,
            })
            .run();
          const taskIds = closed.rewards.map((item) => item.taskId);
          if (taskIds.length > 0) {
            tx.update(tasks).set({ payoutId: id }).where(inArray(tasks.id, taskIds)).run();
          }
        });
      }

      return c.json(respond(user));
    })
    .post('/payouts/cancel', requireRole('parent'), validate('json', cancelPayoutSchema), (c) => {
      const { childId, weekStart: week } = c.req.valid('json');
      const user = c.get('user');
      const child = activeChildren(db).find((item) => item.id === childId);
      if (!child) {
        return c.json({ error: 'Nie ma takiego dziecka' }, 400);
      }
      // Cofnąć można tylko wypłatę widoczną na ekranie, czyli z ostatnich tygodni.
      const at = now();
      if (!closedWeeks(child, weekStart(warsawDate(at))).includes(week)) {
        return c.json({ error: 'Można cofnąć tylko wypłatę z ostatnich tygodni' }, 400);
      }

      // Drugie stuknięcie albo drugi rodzic: wypłaty już nie ma, więc nic nie zmieniamy.
      db.transaction((tx) => {
        const payout = tx
          .select()
          .from(payouts)
          .where(and(eq(payouts.childId, childId), eq(payouts.weekStart, week), isNull(payouts.cancelledAt)))
          .get();
        if (!payout) return;
        tx.update(payouts).set({ cancelledAt: at, cancelledById: user.id }).where(eq(payouts.id, payout.id)).run();
        // Zadania wracają do niewypłaconych: liczą się znów w tygodniu ukończenia.
        tx.update(tasks).set({ payoutId: null }).where(eq(tasks.payoutId, payout.id)).run();
      });

      return c.json(respond(user));
    });
}
