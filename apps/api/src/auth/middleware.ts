import type { UserRole } from '@ogarniacz/shared';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { Db } from '../db/client';
import { findSession } from './sessions';
import type { UserRow } from './users';

export type AppEnv = { Variables: { user: UserRow } };

export const SESSION_COOKIE = 'ogarniacz_session';

export type CookieOptions = { secure: boolean };

export function setSessionCookie(c: Context, token: string, expiresAt: Date, { secure }: CookieOptions) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(c: Context, { secure }: CookieOptions) {
  // Te same atrybuty co przy ustawianiu: puste cookie też nie ma być dostępne dla skryptów (skan ZAP, 14 listopada 2026).
  deleteCookie(c, SESSION_COOKIE, { path: '/', secure, httpOnly: true, sameSite: 'Lax' });
}

export function getSessionToken(c: Context): string | undefined {
  return getCookie(c, SESSION_COOKIE);
}

/** Wpuszcza tylko z ważną sesją i udostępnia zalogowanego użytkownika jako `c.get('user')`. */
export function requireSession(db: Db, cookie: CookieOptions, now: () => Date) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const token = getSessionToken(c);
    const session = token ? findSession(db, token, now()) : undefined;

    if (!token || !session) {
      if (token) clearSessionCookie(c, cookie);
      return c.json({ error: 'Zaloguj się' }, 401);
    }
    if (session.renewedUntil) {
      setSessionCookie(c, token, session.renewedUntil, cookie);
    }

    c.set('user', session.user);
    await next();
  });
}

export function requireRole(role: UserRole) {
  return createMiddleware<AppEnv>(async (c, next) => {
    if (c.get('user').role !== role) {
      return c.json({ error: 'Brak uprawnień' }, 403);
    }
    await next();
  });
}

/**
 * Ochrona przed CSRF. Cookie z SameSite=Lax już blokuje większość ataków, a to sprawdzenie
 * odrzuca dodatkowo żądania zmieniające dane, wysłane przez przeglądarkę z obcej strony.
 * Porównujemy sam host, bo za nginx aplikacja widzi http, a przeglądarka wysyła https.
 * Zakłada, że proxy (nginx, Vite) przekazuje oryginalny Host albo X-Forwarded-Host.
 */
export const sameOriginOnly = createMiddleware(async (c, next) => {
  const origin = c.req.header('Origin');
  if (origin && !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    // API nasłuchuje tylko lokalnie za nginx, więc nagłówkowi od proxy można ufać.
    const host = c.req.header('X-Forwarded-Host') ?? c.req.header('Host');
    let originHost: string | undefined;
    try {
      originHost = new URL(origin).host;
    } catch {
      originHost = undefined;
    }
    if (!host || originHost !== host) {
      return c.json({ error: 'Niedozwolone źródło żądania' }, 403);
    }
  }
  await next();
});
