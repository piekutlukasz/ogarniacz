import { type SetupStatus, setupRequestSchema } from '@ogarniacz/shared';
import { type Context, Hono } from 'hono';
import { clientOf, tooManyAttempts } from '../auth/attempts';
import { recordAuthEvent } from '../auth/events';
import { type AppEnv, type CookieOptions, setSessionCookie } from '../auth/middleware';
import type { AttemptLimiter } from '../auth/rateLimit';
import { createSession } from '../auth/sessions';
import { type SetupGate, createFirstParent, hasAnyUser } from '../auth/setup';
import { toUser } from '../auth/users';
import type { Db } from '../db/client';
import { validate } from '../validate';

export const WRONG_SETUP_CODE = 'Nieprawidłowy kod pierwszego uruchomienia. Kod jest w logu serwera';
export const EXPIRED_SETUP_CODE = 'Za dużo złych kodów. Uruchom serwer ponownie i przepisz nowy kod z logu';

type SetupOptions = {
  db: Db;
  now: () => Date;
  cookie: CookieOptions;
  clientIpHeader: string;
  /** Kod z logu. Brak, gdy serwer wystartował z kontami w bazie: wtedy kreator nie istnieje. */
  gate?: SetupGate;
  /** Złe kody na adres klienta. */
  limiter: AttemptLimiter;
};

/** Poza kreatorem zwykłe 404, nie 401: front pyta o kreator przed zalogowaniem, a 401 wylogowuje. */
const notFound = (c: Context) => c.json({ error: 'Nie znaleziono' }, 404);

/**
 * Trasy publiczne kreatora pierwszego uruchomienia, montowane przed `requireSession` i tylko poza demo.
 * Działają wyłącznie na bazie bez żadnego konta i z kodem wypisanym w logu przy starcie.
 */
export function setupRoutes({ db, now, cookie, clientIpHeader, gate, limiter }: SetupOptions) {
  const available = () => gate?.active === true && !hasAnyUser(db);

  return new Hono<AppEnv>()
    .get('/', (c) => (available() ? c.json({ needed: true } satisfies SetupStatus) : notFound(c)))
    .post('/', validate('json', setupRequestSchema), async (c) => {
      if (!gate || !available()) return notFound(c);
      const client = clientOf(c, clientIpHeader);
      const wait = limiter.retryAfterSeconds(client.ip, now().getTime());
      if (wait > 0) return tooManyAttempts(c, wait);

      const { code, ...input } = c.req.valid('json');
      const check = gate.check(code);
      if (check !== 'ok') {
        limiter.recordFailure(client.ip, now().getTime());
        if (check === 'expired') console.warn('[kreator] za dużo złych kodów, kod wygasł; nowy da restart serwera');
        return c.json({ error: check === 'expired' ? EXPIRED_SETUP_CODE : WRONG_SETUP_CODE }, 403);
      }

      let user: Awaited<ReturnType<typeof createFirstParent>>;
      try {
        user = await createFirstParent(db, input, now());
      } catch (error) {
        // Za słabe hasło; kod zostaje ważny, żeby można było poprawić formularz.
        return c.json({ error: error instanceof Error ? error.message : 'Niepoprawne hasło' }, 400);
      }
      // Ktoś zdążył założyć konto w tej samej chwili (drugie żądanie albo CLI).
      if (!user) return notFound(c);

      gate.close();
      const at = now();
      recordAuthEvent(db, { type: 'setup_done', userId: user.id, actorId: user.id, ...client }, at);
      console.log(`[kreator] założono pierwsze konto rodzica: ${user.login}; kod pierwszego uruchomienia wygasł`);
      const { token, expiresAt } = createSession(db, user.id, at);
      setSessionCookie(c, token, expiresAt, cookie);
      return c.json({ user: toUser(user) }, 201);
    });
}
