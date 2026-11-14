import type { Context } from 'hono';
import type { Db } from '../db/client';
import type { PushSettings } from '../push/sender';
import { notifyParents } from '../push/security';
import { recordAuthEvent } from './events';
import { verifyPassword } from './password';
import type { LoginLimiter } from './rateLimit';
import type { UserRow } from './users';

/** Wszystko, czego potrzebuje sprawdzanie hasła: wspólny limit prób, dziennik i powiadomienia o blokadzie. */
export type AttemptDeps = { db: Db; limiter: LoginLimiter; now: () => Date; push?: PushSettings };

export type Client = { ip?: string; userAgent?: string };

const HOUR_MS = 60 * 60 * 1000;

export function tooManyAttempts(c: Context, wait: number) {
  c.header('Retry-After', String(wait));
  return c.json({ error: `Za dużo prób. Spróbuj ponownie za ${Math.ceil(wait / 60)} min.` }, 429);
}

/**
 * Nieudana próba hasła: licznik w limicie, wpisy o blokadach, które właśnie się zaczęły, i push do rodziców,
 * gdy blokada dotyczy konta. Wpis `login_failed` zapisuje wywołujący, bo przy nieznanym loginie ma własne reguły.
 */
export function recordFailedAttempt(deps: AttemptDeps, login: string, user: UserRow | undefined, client: Client, at: Date) {
  const locked = deps.limiter.recordFailure(login, client.ip, at.getTime());
  for (const scope of locked) {
    recordAuthEvent(deps.db, { type: 'locked', userId: scope === 'ip' ? null : user?.id, detail: scope, ...client }, at);
  }
  if (user && locked.some((scope) => scope !== 'ip')) {
    void notifyParents(deps.db, deps.push, deps.now, {
      // Najwyżej jedno powiadomienie o blokadzie konta na godzinę.
      key: `locked:${user.id}:${Math.floor(at.getTime() / HOUR_MS)}`,
      title: `Zablokowano logowanie: ${user.name}`,
      body: 'Wiele nieudanych prób hasła. Szczegóły w dzienniku logowań.',
      respectQuietHours: true,
    });
  }
}

/**
 * Ponowne podanie własnego hasła przy operacji na koncie (zmiana hasła, zaproszenie, wyłączenie konta).
 * Ten sam limit prób co logowanie, więc odblokowany telefon nie pozwala hasła zgadywać. Błąd to `403`, nie `401`,
 * bo `401` wylogowałoby aplikację. Zwraca odpowiedź z błędem albo `undefined`, gdy hasło się zgadza.
 */
export async function confirmOwnPassword(
  deps: AttemptDeps,
  c: Context,
  user: UserRow,
  password: string,
  client: Client,
  { detail, message }: { detail: string; message: string },
) {
  const wait = deps.limiter.retryAfterSeconds(user.login, client.ip, deps.now().getTime());
  if (wait > 0) return tooManyAttempts(c, wait);

  if (!(await verifyPassword(password, user.passwordHash))) {
    const at = deps.now();
    recordAuthEvent(deps.db, { type: 'login_failed', userId: user.id, detail, ...client }, at);
    recordFailedAttempt(deps, user.login, user, client, at);
    return c.json({ error: message }, 403);
  }
  deps.limiter.recordSuccess(user.login, client.ip);
  return undefined;
}

/**
 * Adres i przeglądarka klienta do limitów i dziennika. Proxy przekazuje adres w nagłówku (nginx: X-Real-IP);
 * API nasłuchuje tylko lokalnie, a proxy musi nadpisać ten nagłówek (docs/instrukcje/WDROZENIE.md),
 * żeby nie dało się go podrobić z zewnątrz.
 */
export function clientOf(c: Context, clientIpHeader: string): Client {
  return { ip: c.req.header(clientIpHeader) || undefined, userAgent: c.req.header('User-Agent') };
}
