import { validate } from '../validate';
import { type DemoInfo, demoLoginRequestSchema } from '@ogarniacz/shared';
import { type MiddlewareHandler, Hono } from 'hono';
import { type AppEnv, type CookieOptions, setSessionCookie } from '../auth/middleware';
import { createSession } from '../auth/sessions';
import { findUserByLogin, toUser } from '../auth/users';
import type { Db } from '../db/client';
import { recurrences, shoppingItems, tasks } from '../db/schema';
import { DEMO_ACCOUNTS, demoIsFull } from '../demo';

/** Trasy trybu demo: lista kont i wejście na wybrane konto bez hasła. Montowane tylko w trybie demo. */
export function demoRoutes({ db, cookie, now }: { db: Db; cookie: CookieOptions; now: () => Date }) {
  return new Hono<AppEnv>()
    .get('/', (c) => {
      const info: DemoInfo = {
        demo: true,
        accounts: DEMO_ACCOUNTS.map(({ login, name, role }) => ({ login, name, role })),
      };
      return c.json(info);
    })
    .post('/login', validate('json', demoLoginRequestSchema), (c) => {
      const { login } = c.req.valid('json');
      // Tylko konta przykładowe: nic innego, co trafiło do bazy, nie wpuści bez hasła.
      const user = DEMO_ACCOUNTS.some((account) => account.login === login) ? findUserByLogin(db, login) : undefined;
      if (!user || user.disabledAt) return c.json({ error: 'Nie ma takiego konta demo' }, 404);
      const { token, expiresAt } = createSession(db, user.id, now());
      setSessionCookie(c, token, expiresAt, cookie);
      return c.json({ user: toUser(user) });
    });
}

const LIMITED = [
  { path: '/api/tasks', table: tasks },
  { path: '/api/shopping', table: shoppingItems },
  { path: '/api/recurrences', table: recurrences },
] as const;

/** Odmawia dodawania nowych wierszy, gdy demo jest pełne. Reszta operacji (edycje, odhaczanie, czyszczenie) działa. */
export function demoLimits(db: Db): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (c.req.method === 'POST') {
      const limited = LIMITED.find((item) => item.path === c.req.path);
      if (limited && demoIsFull(db, limited.table)) {
        return c.json({ error: 'Demo jest pełne. Dane wrócą do stanu początkowego przy najbliższym resecie.' }, 409);
      }
    }
    await next();
  };
}
