import {
  INVALID_INVITE_MESSAGE,
  type InvitePreview,
  acceptInviteSchema,
  createInviteSchema,
  invitePreviewRequestSchema,
} from '@ogarniacz/shared';
import { type Context, Hono } from 'hono';
import { type AttemptDeps, clientOf, confirmOwnPassword, tooManyAttempts } from '../auth/attempts';
import { recordAuthEvent } from '../auth/events';
import { AccountError, acceptInvite, createInvite, findValidInvite, listPendingInvites, revokeInvite } from '../auth/invites';
import { type AppEnv, type CookieOptions, requireRole, setSessionCookie } from '../auth/middleware';
import type { AttemptLimiter } from '../auth/rateLimit';
import { createSession } from '../auth/sessions';
import { toUser } from '../auth/users';
import { notifyParents } from '../push/security';
import { validate } from '../validate';

export const DEMO_ACCOUNTS_LOCKED = 'W wersji demonstracyjnej nie można zapraszać osób ani zmieniać kont';

type InviteOptions = AttemptDeps & { cookie: CookieOptions; clientIpHeader: string; demo: boolean };

function accountError(c: Context, error: unknown) {
  if (error instanceof AccountError) return c.json({ error: error.message }, error.status);
  throw error;
}

/**
 * Trasy publiczne, montowane przed `requireSession`: podgląd zaproszenia (powitanie „Cześć, Kasia”) i jego przyjęcie.
 * Token przychodzi w treści żądania, a złe tokeny liczy limit na adres klienta.
 */
export function publicInviteRoutes({ cookie, clientIpHeader, demo, publicLimiter, ...deps }: InviteOptions & { publicLimiter: AttemptLimiter }) {
  const { db, now } = deps;

  /** Odmowa, gdy adres przekroczył limit złych tokenów. */
  function limited(c: Context) {
    const wait = publicLimiter.retryAfterSeconds(clientOf(c, clientIpHeader).ip, now().getTime());
    return wait > 0 ? tooManyAttempts(c, wait) : undefined;
  }
  /** Zły token liczy się do limitu adresu; inne błędy (np. za słabe hasło) nie. */
  function invalid(c: Context, error: unknown) {
    if (error instanceof AccountError && error.message === INVALID_INVITE_MESSAGE) {
      publicLimiter.recordFailure(clientOf(c, clientIpHeader).ip, now().getTime());
    }
    return accountError(c, error);
  }

  return new Hono<AppEnv>()
    .post('/preview', validate('json', invitePreviewRequestSchema), (c) => {
      const refused = limited(c);
      if (refused) return refused;
      try {
        const invite = findValidInvite(db, c.req.valid('json').token, now());
        return c.json({ kind: invite.kind, name: invite.name, login: invite.login } satisfies InvitePreview);
      } catch (error) {
        return invalid(c, error);
      }
    })
    .post('/accept', validate('json', acceptInviteSchema), async (c) => {
      if (demo) return c.json({ error: DEMO_ACCOUNTS_LOCKED }, 403);
      const refused = limited(c);
      if (refused) return refused;
      const { token, password } = c.req.valid('json');

      let accepted: Awaited<ReturnType<typeof acceptInvite>>;
      try {
        accepted = await acceptInvite(db, token, password, now());
      } catch (error) {
        return invalid(c, error);
      }

      const { invite, user } = accepted;
      const client = clientOf(c, clientIpHeader);
      const at = now();
      const created = invite.kind === 'new_account';
      recordAuthEvent(db, { type: created ? 'account_created' : 'password_reset', userId: user.id, actorId: invite.createdById, detail: 'invite', ...client }, at);
      recordAuthEvent(db, { type: 'invite_accepted', userId: user.id, actorId: user.id, detail: invite.kind, ...client }, at);
      void notifyParents(db, deps.push, now, {
        key: `invite:${invite.id}`,
        title: created ? `Dodano konto: ${user.name}` : `Nowe hasło: ${user.name}`,
        body: created
          ? `${user.role === 'parent' ? 'Rodzic' : 'Dziecko'}, login ${user.login}. Konto z zaproszenia w aplikacji.`
          : 'Ustawione z linku od rodzica. Pozostałe urządzenia tej osoby zostały wylogowane.',
        exceptUserId: user.id,
      });

      const { token: sessionToken, expiresAt } = createSession(db, user.id, at);
      setSessionCookie(c, sessionToken, expiresAt, cookie);
      return c.json({ user: toUser(user) }, created ? 201 : 200);
    });
}

/** Zarządzanie zaproszeniami, tylko dla rodzica. Utworzenie wymaga jego hasła. */
export function inviteRoutes({ cookie: _cookie, clientIpHeader, demo, ...deps }: InviteOptions) {
  const { db, now } = deps;
  return new Hono<AppEnv>()
    .use('*', requireRole('parent'))
    .get('/', (c) => c.json(listPendingInvites(db, now())))
    .post('/', validate('json', createInviteSchema), async (c) => {
      if (demo) return c.json({ error: DEMO_ACCOUNTS_LOCKED }, 403);
      const parent = c.get('user');
      const { confirm, ...input } = c.req.valid('json');
      const client = clientOf(c, clientIpHeader);
      const refused = await confirmOwnPassword(deps, c, parent, confirm, client, {
        detail: 'confirm',
        message: 'Nieprawidłowe hasło. Potwierdź swoim hasłem',
      });
      if (refused) return refused;

      let created: ReturnType<typeof createInvite>;
      try {
        created = createInvite(db, parent, input, now());
      } catch (error) {
        return accountError(c, error);
      }
      const at = now();
      for (const old of created.revoked) {
        recordAuthEvent(db, { type: 'invite_revoked', userId: old.userId, actorId: parent.id, detail: 'replaced', ...client }, at);
      }
      const { row } = created;
      recordAuthEvent(db, { type: 'invite_created', userId: row.userId, actorId: parent.id, detail: `${row.kind}:${row.login}`, ...client }, at);
      return c.json({ invite: created.invite, token: created.token }, 201);
    })
    .delete('/:id', (c) => {
      if (demo) return c.json({ error: DEMO_ACCOUNTS_LOCKED }, 403);
      const parent = c.get('user');
      const row = revokeInvite(db, c.req.param('id'), now());
      if (!row) return c.json({ error: 'Nie ma takiego oczekującego zaproszenia' }, 404);
      recordAuthEvent(db, { type: 'invite_revoked', userId: row.userId, actorId: parent.id, detail: `${row.kind}:${row.login}`, ...clientOf(c, clientIpHeader) }, now());
      return c.body(null, 204);
    });
}
