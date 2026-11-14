import { createHash, randomBytes, randomUUID } from 'node:crypto';
import {
  INVALID_INVITE_MESSAGE,
  INVITE_TTL_HOURS,
  type Invite,
  MAX_ACTIVE_ACCOUNTS,
  MAX_PENDING_INVITES,
  type UserRole,
  passwordProblem,
} from '@ogarniacz/shared';
import { and, asc, count, eq, gt, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { Db } from '../db/client';
import { invites, sessions, users } from '../db/schema';
import { hashPassword } from './password';
import { findUserByLogin, type UserRow } from './users';

export type InviteRow = typeof invites.$inferSelect;

/** Błąd z komunikatem dla domownika; trasy zamieniają go na `{ error }` z podanym kodem. */
export class AccountError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

const HOUR_MS = 60 * 60 * 1000;

function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Zaproszenie, którego da się jeszcze użyć: nieużyte, nieunieważnione i nie po terminie. */
function pending(now: Date) {
  return and(isNull(invites.usedAt), isNull(invites.revokedAt), gt(invites.expiresAt, now));
}

export function countActiveAccounts(db: Pick<Db, 'select'>): number {
  return db.select({ total: count() }).from(users).where(isNull(users.disabledAt)).get()?.total ?? 0;
}

/** Oczekujące zaproszenia od najstarszego, z imieniem rodzica, który je wystawił. Bez skrótów tokenów. */
export function listPendingInvites(db: Db, now: Date): Invite[] {
  const creators = alias(users, 'creators');
  return db
    .select({ invite: invites, createdBy: creators.name })
    .from(invites)
    .innerJoin(creators, eq(invites.createdById, creators.id))
    .where(pending(now))
    .orderBy(asc(invites.createdAt))
    .all()
    .map(({ invite, createdBy }) => toInvite(invite, createdBy));
}

export function toInvite(row: InviteRow, createdBy: string): Invite {
  return {
    id: row.id,
    kind: row.kind,
    login: row.login,
    name: row.name,
    role: row.role ?? null,
    userId: row.kind === 'password_reset' ? row.userId : null,
    createdBy,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

type NewInvite = { kind: 'new_account'; login: string; name: string; role: UserRole } | { kind: 'password_reset'; userId: string };

/**
 * Tworzy zaproszenie i zwraca token, jedyny raz. Sprawdzenia i zapis są w jednej transakcji, więc dwa równoczesne
 * żądania nie przekroczą limitów ani nie zajmą tego samego loginu. Starszy link do nowego hasła dla tej samej osoby
 * jest unieważniany, żeby w obiegu był tylko najnowszy.
 */
export function createInvite(db: Db, parent: UserRow, input: NewInvite, now: Date) {
  const token = randomBytes(32).toString('base64url');
  return db.transaction((tx) => {
    const pendingCount = tx.select({ total: count() }).from(invites).where(pending(now)).get()?.total ?? 0;
    let target: { login: string; name: string; role: UserRole | null; userId: string | null };
    const revoked: InviteRow[] = [];

    if (input.kind === 'new_account') {
      if (pendingCount >= MAX_PENDING_INVITES) {
        throw new AccountError(`Może czekać najwyżej ${MAX_PENDING_INVITES} zaproszeń. Unieważnij któreś albo poczekaj, aż ktoś je przyjmie`, 409);
      }
      if (findUserByLogin(tx, input.login)) throw new AccountError(`Login „${input.login}” jest już zajęty`, 409);
      if (tx.select({ id: invites.id }).from(invites).where(and(pending(now), eq(invites.login, input.login), eq(invites.kind, 'new_account'))).get()) {
        throw new AccountError(`Na login „${input.login}” czeka już zaproszenie`, 409);
      }
      const pendingAccounts =
        tx.select({ total: count() }).from(invites).where(and(pending(now), eq(invites.kind, 'new_account'))).get()?.total ?? 0;
      if (countActiveAccounts(tx) + pendingAccounts >= MAX_ACTIVE_ACCOUNTS) {
        throw new AccountError(`Rodzina może mieć najwyżej ${MAX_ACTIVE_ACCOUNTS} aktywnych kont`, 409);
      }
      target = { login: input.login, name: input.name, role: input.role, userId: null };
    } else {
      const user = tx.select().from(users).where(eq(users.id, input.userId)).get();
      if (!user) throw new AccountError('Nie ma takiego konta', 404);
      if (user.id === parent.id) throw new AccountError('Własne hasło zmienisz w ustawieniach, w sekcji „Hasło i urządzenia”');
      if (user.disabledAt) throw new AccountError('To konto jest wyłączone. Najpierw je włącz');
      const older = tx
        .select()
        .from(invites)
        .where(and(pending(now), eq(invites.kind, 'password_reset'), eq(invites.userId, user.id)))
        .all();
      if (pendingCount - older.length >= MAX_PENDING_INVITES) {
        throw new AccountError(`Może czekać najwyżej ${MAX_PENDING_INVITES} zaproszeń. Unieważnij któreś albo poczekaj, aż ktoś je przyjmie`, 409);
      }
      for (const invite of older) {
        tx.update(invites).set({ revokedAt: now }).where(eq(invites.id, invite.id)).run();
        revoked.push(invite);
      }
      target = { login: user.login, name: user.name, role: null, userId: user.id };
    }

    const row = tx
      .insert(invites)
      .values({
        id: randomUUID(),
        createdAt: now,
        createdById: parent.id,
        tokenHash: hashInviteToken(token),
        kind: input.kind,
        ...target,
        expiresAt: new Date(now.getTime() + INVITE_TTL_HOURS * HOUR_MS),
      })
      .returning()
      .get();
    return { invite: toInvite(row, parent.name), token, row, revoked };
  });
}

/** Unieważnia oczekujące zaproszenie. Zwraca je albo `undefined`, gdy nie ma takiego oczekującego. */
export function revokeInvite(db: Db, id: string, now: Date): InviteRow | undefined {
  return db
    .update(invites)
    .set({ revokedAt: now })
    .where(and(eq(invites.id, id), pending(now)))
    .returning()
    .get();
}

/** Ważne zaproszenie dla tokenu albo błąd z jednym komunikatem dla każdego powodu. */
export function findValidInvite(db: Db, token: string, now: Date): InviteRow {
  const row = db
    .select()
    .from(invites)
    .where(and(eq(invites.tokenHash, hashInviteToken(token)), pending(now)))
    .get();
  if (!row) throw new AccountError(INVALID_INVITE_MESSAGE, 404);
  if (row.kind === 'password_reset') {
    const user = row.userId ? db.select().from(users).where(eq(users.id, row.userId)).get() : undefined;
    // Konto wyłączone po wystawieniu linku: link przestaje działać, bez zdradzania powodu.
    if (!user || user.disabledAt) throw new AccountError(INVALID_INVITE_MESSAGE, 404);
  }
  return row;
}

/**
 * Przyjęcie zaproszenia: zakłada konto albo ustawia nowe hasło. Token jest zużywany w tej samej transakcji
 * co zmiana konta, warunkiem „wciąż oczekuje”, więc dwa równoczesne przyjęcia nie założą dwóch kont.
 * Nowe hasło wylogowuje tę osobę na wszystkich urządzeniach.
 */
export async function acceptInvite(db: Db, token: string, password: string, now: Date) {
  const invite = findValidInvite(db, token, now);
  const problem = passwordProblem(password, invite);
  if (problem) throw new AccountError(problem);
  const passwordHash = await hashPassword(password);

  return db.transaction((tx) => {
    const claimed = tx
      .update(invites)
      .set({ usedAt: now })
      .where(and(eq(invites.id, invite.id), pending(now)))
      .returning()
      .get();
    if (!claimed) throw new AccountError(INVALID_INVITE_MESSAGE, 404);

    if (claimed.kind === 'new_account') {
      // Login mógł zająć w międzyczasie ktoś z CLI, a limit kont mogło wyczerpać włączenie wyłączonego konta.
      if (findUserByLogin(tx, claimed.login)) throw new AccountError(INVALID_INVITE_MESSAGE, 404);
      if (countActiveAccounts(tx) >= MAX_ACTIVE_ACCOUNTS) {
        throw new AccountError(`Rodzina ma już ${MAX_ACTIVE_ACCOUNTS} aktywnych kont. Poproś rodzica o wyłączenie któregoś`, 409);
      }
      const user = tx
        .insert(users)
        .values({ id: randomUUID(), login: claimed.login, name: claimed.name, role: claimed.role ?? 'child', passwordHash, createdAt: now })
        .returning()
        .get();
      tx.update(invites).set({ userId: user.id }).where(eq(invites.id, claimed.id)).run();
      return { invite: claimed, user };
    }

    const userId = claimed.userId ?? '';
    tx.update(users).set({ passwordHash }).where(eq(users.id, userId)).run();
    tx.delete(sessions).where(eq(sessions.userId, userId)).run();
    const user = tx.select().from(users).where(eq(users.id, userId)).get();
    if (!user) throw new AccountError(INVALID_INVITE_MESSAGE, 404);
    return { invite: claimed, user };
  });
}
