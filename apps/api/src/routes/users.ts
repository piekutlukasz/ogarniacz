import { validate } from '../validate';
import { type Account, type FamilyMember, MAX_ACTIVE_ACCOUNTS, updateAccountSchema, updateMeSchema } from '@ogarniacz/shared';
import { eq, max } from 'drizzle-orm';
import { Hono } from 'hono';
import { type AttemptDeps, clientOf, confirmOwnPassword } from '../auth/attempts';
import { recordAuthEvent } from '../auth/events';
import { countActiveAccounts } from '../auth/invites';
import { type AppEnv, requireRole } from '../auth/middleware';
import { type UserRow, listUsers, setDisabled } from '../auth/users';
import type { Db } from '../db/client';
import { authEvents, sessions, users } from '../db/schema';
import { DEMO_ACCOUNTS_LOCKED } from './invites';

function toFamilyMember(user: UserRow): FamilyMember {
  return { id: user.id, name: user.name, role: user.role, color: user.color ?? null };
}

/** Konta z ostatnim logowaniem (z dziennika, więc najwyżej 90 dni wstecz) i ostatnim użyciem aplikacji. */
function listAccounts(db: Db): Account[] {
  const logins = new Map(
    db
      .select({ userId: authEvents.userId, at: max(authEvents.createdAt) })
      .from(authEvents)
      .where(eq(authEvents.type, 'login_ok'))
      .groupBy(authEvents.userId)
      .all()
      .map((row) => [row.userId, row.at]),
  );
  const seen = new Map(
    db
      .select({ userId: sessions.userId, at: max(sessions.lastSeenAt) })
      .from(sessions)
      .groupBy(sessions.userId)
      .all()
      .map((row) => [row.userId, row.at]),
  );
  return listUsers(db).map((user) => toAccount(user, logins.get(user.id), seen.get(user.id)));
}

function toAccount(user: UserRow, lastLoginAt?: Date | null, lastSeenAt?: Date | null): Account {
  return {
    id: user.id,
    name: user.name,
    login: user.login,
    role: user.role,
    disabled: user.disabledAt !== null,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: lastLoginAt?.toISOString() ?? null,
    lastSeenAt: lastSeenAt?.toISOString() ?? null,
  };
}

type UserOptions = AttemptDeps & { clientIpHeader: string; demo: boolean };

/**
 * Lista rodziny do wyboru osoby przy zadaniu, własne ustawienia oraz konta dla rodzica: lista ze stanem
 * i wyłączanie albo włączanie konta dziecka. Konto rodzica wyłącza się tylko przez CLI na serwerze.
 */
export function userRoutes({ clientIpHeader, demo, ...deps }: UserOptions) {
  const { db, now } = deps;
  const parentOnly = requireRole('parent');
  return new Hono<AppEnv>()
    .get('/', (c) => {
      const family = listUsers(db)
        .filter((user) => user.disabledAt === null)
        .map(toFamilyMember);
      return c.json(family);
    })
    .patch('/me', validate('json', updateMeSchema), (c) => {
      const { color } = c.req.valid('json');
      const user = db.update(users).set({ color }).where(eq(users.id, c.get('user').id)).returning().get();
      return c.json(toFamilyMember(user));
    })
    .get('/accounts', parentOnly, (c) => c.json(listAccounts(db)))
    .patch('/:id', parentOnly, validate('json', updateAccountSchema), async (c) => {
      if (demo) return c.json({ error: DEMO_ACCOUNTS_LOCKED }, 403);
      const parent = c.get('user');
      const { disabled, confirm } = c.req.valid('json');
      const target = db.select().from(users).where(eq(users.id, c.req.param('id'))).get();
      if (!target) return c.json({ error: 'Nie ma takiego konta' }, 404);
      if (target.role !== 'child') return c.json({ error: 'Konto rodzica wyłącza się tylko na serwerze' }, 403);

      const client = clientOf(c, clientIpHeader);
      const refused = await confirmOwnPassword(deps, c, parent, confirm, client, {
        detail: 'confirm',
        message: 'Nieprawidłowe hasło. Potwierdź swoim hasłem',
      });
      if (refused) return refused;

      if (disabled !== (target.disabledAt !== null)) {
        if (!disabled && countActiveAccounts(db) >= MAX_ACTIVE_ACCOUNTS) {
          return c.json({ error: `Rodzina może mieć najwyżej ${MAX_ACTIVE_ACCOUNTS} aktywnych kont` }, 409);
        }
        // Wyłączenie usuwa też sesje, więc dziecko jest od razu wylogowane na wszystkich urządzeniach.
        setDisabled(db, target.login, disabled, now());
        recordAuthEvent(db, { type: disabled ? 'account_disabled' : 'account_enabled', userId: target.id, actorId: parent.id, ...client }, now());
      }
      return c.json(listAccounts(db).find((account) => account.id === target.id));
    });
}
