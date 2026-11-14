import { zValidator } from '@hono/zod-validator';
import { type AuthEvent, type LogoutOthersResponse, changePasswordSchema, loginRequestSchema } from '@ogarniacz/shared';
import { type Context, Hono } from 'hono';
import {
  type AppEnv,
  type CookieOptions,
  clearSessionCookie,
  getSessionToken,
  requireRole,
  requireSession,
  setSessionCookie,
} from '../auth/middleware';
import { clientOf as readClient, confirmOwnPassword, recordFailedAttempt, tooManyAttempts } from '../auth/attempts';
import { createEventThrottle, listAuthEvents, recordAuthEvent } from '../auth/events';
import { dummyPasswordHash, verifyPassword } from '../auth/password';
import type { LoginLimiter } from '../auth/rateLimit';
import { createSession, deleteOtherSessions, deleteSession } from '../auth/sessions';
import { changeOwnPassword, findUserByLogin, toUser } from '../auth/users';
import type { Db } from '../db/client';
import type { PushSettings } from '../push/sender';
import { validate } from '../validate';

const INVALID_CREDENTIALS = 'Nieprawidłowy login lub hasło';

type AuthOptions = {
  db: Db;
  cookie: CookieOptions;
  limiter: LoginLimiter;
  now: () => Date;
  /** Nagłówek z adresem klienta, który ustawia nasze proxy. */
  clientIpHeader?: string;
  /** W demo konta są wspólne dla gości, więc zmiana hasła i wylogowanie innych urządzeń blokowałyby pozostałych. */
  demo?: boolean;
  /** Powiadomienia do rodziców o blokadzie konta. */
  push?: PushSettings;
};

const DEMO_LOCKED = 'W wersji demonstracyjnej nie można zmieniać haseł ani wylogowywać innych urządzeń';

export function authRoutes({ db, cookie, limiter, now, clientIpHeader = 'X-Real-IP', demo = false, push }: AuthOptions) {
  const attempts = { db, limiter, now, push };
  const session = requireSession(db, cookie, now);
  // Próby na nieistniejące loginy zapisujemy najwyżej raz na minutę na adres, żeby nikt nie zapchał dziennika.
  const unknownLoginThrottle = createEventThrottle();
  const clientOf = (c: Context) => readClient(c, clientIpHeader);

  return new Hono<AppEnv>()
    .post(
      '/login',
      zValidator('json', loginRequestSchema, (result, c) => {
        if (!result.success) return c.json({ error: INVALID_CREDENTIALS }, 400);
      }),
      async (c) => {
        const { login, password } = c.req.valid('json');
        const client = clientOf(c);
        const { ip } = client;

        const wait = limiter.retryAfterSeconds(login, ip, now().getTime());
        if (wait > 0) return tooManyAttempts(c, wait);

        const user = findUserByLogin(db, login);
        const valid = await verifyPassword(password, user?.passwordHash ?? (await dummyPasswordHash()));

        if (!user || !valid || user.disabledAt) {
          const at = now();
          // Wpisany login trafia do dziennika tylko jako istniejące konto: w polu loginu bywa hasło.
          if (user) {
            recordAuthEvent(db, { type: 'login_failed', userId: user.id, detail: valid ? 'disabled' : 'bad_password', ...client }, at);
          } else if (unknownLoginThrottle(ip ?? '-', at.getTime())) {
            recordAuthEvent(db, { type: 'login_failed', detail: 'unknown_login', ...client }, at);
          }
          recordFailedAttempt(attempts, login, user, client, at);
          return c.json({ error: INVALID_CREDENTIALS }, 401);
        }

        limiter.recordSuccess(login, ip);
        recordAuthEvent(db, { type: 'login_ok', userId: user.id, ...client }, now());
        const { token, expiresAt } = createSession(db, user.id, now());
        setSessionCookie(c, token, expiresAt, cookie);
        return c.json({ user: toUser(user) });
      },
    )
    .post('/logout', (c) => {
      const token = getSessionToken(c);
      const userId = token ? deleteSession(db, token) : undefined;
      if (userId) {
        recordAuthEvent(db, { type: 'logout', userId, ...clientOf(c) }, now());
      }
      clearSessionCookie(c, cookie);
      return c.body(null, 204);
    })
    .get('/me', session, (c) => c.json({ user: toUser(c.get('user')) }))
    /** Zmiana własnego hasła; obecne sprawdza `confirmOwnPassword` z limitem prób logowania. */
    .post('/password', session, validate('json', changePasswordSchema), async (c) => {
      if (demo) return c.json({ error: DEMO_LOCKED }, 403);
      const user = c.get('user');
      const { current, next } = c.req.valid('json');
      const client = clientOf(c);

      const refused = await confirmOwnPassword(attempts, c, user, current, client, {
        detail: 'password_change',
        message: 'Obecne hasło jest nieprawidłowe',
      });
      if (refused) return refused;

      let loggedOut: number;
      try {
        // Sesja przeszła przez `session`, więc token jest na pewno.
        loggedOut = await changeOwnPassword(db, user, next, getSessionToken(c) ?? '');
      } catch (error) {
        return c.json({ error: error instanceof Error ? error.message : 'Niepoprawne hasło' }, 400);
      }
      recordAuthEvent(db, { type: 'password_changed', userId: user.id, actorId: user.id, detail: `sessions:${loggedOut}`, ...client }, now());
      return c.body(null, 204);
    })
    /** Wylogowuje osobę na pozostałych urządzeniach; bieżące zostaje zalogowane. */
    .post('/logout-all', session, (c) => {
      if (demo) return c.json({ error: DEMO_LOCKED }, 403);
      const user = c.get('user');
      const count = deleteOtherSessions(db, user.id, getSessionToken(c) ?? '');
      recordAuthEvent(db, { type: 'logout_all', userId: user.id, actorId: user.id, detail: `sessions:${count}`, ...clientOf(c) }, now());
      return c.json({ count } satisfies LogoutOthersResponse);
    })
    /** Dziennik logowań i zmian kont, ostatnie 100 wpisów; tylko rodzic. */
    .get('/events', session, requireRole('parent'), (c) => {
      const events: AuthEvent[] = listAuthEvents(db).map((event) => ({ ...event, createdAt: event.createdAt.toISOString() }));
      return c.json(events);
    });
}
