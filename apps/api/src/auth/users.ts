import { randomUUID } from 'node:crypto';
import { type User, type UserRole, loginSchema, passwordProblem } from '@ogarniacz/shared';
import { and, asc, eq, ne } from 'drizzle-orm';
import type { Db } from '../db/client';
import { sessions, users } from '../db/schema';
import { hashPassword } from './password';
import { sessionId } from './sessions';

export type UserRow = typeof users.$inferSelect;

export function toUser(row: UserRow): User {
  return { id: row.id, name: row.name, login: row.login, role: row.role };
}

/** Reguła z `shared` (`passwordProblem`), ta sama w formularzu, API i CLI. */
export function assertPasswordStrength(password: string, owner: { login: string; name: string }) {
  const problem = passwordProblem(password, owner);
  if (problem) throw new Error(problem);
}

/** Przyjmuje też transakcję (`Pick<Db, 'select'>`), żeby sprawdzenie i zapis szły razem. */
export function findUserByLogin(db: Pick<Db, 'select'>, login: string): UserRow | undefined {
  return db.select().from(users).where(eq(users.login, login.trim().toLowerCase())).get();
}

export function listUsers(db: Db): UserRow[] {
  return db.select().from(users).orderBy(asc(users.createdAt)).all();
}

export async function createUser(
  db: Db,
  input: { login: string; name: string; role: UserRole; password: string },
  now = new Date(),
): Promise<UserRow> {
  const login = loginSchema.parse(input.login);
  const name = input.name.trim();
  if (!name) throw new Error('Podaj imię');
  assertPasswordStrength(input.password, { login, name });
  if (findUserByLogin(db, login)) throw new Error(`Konto „${login}” już istnieje`);

  return db
    .insert(users)
    .values({
      id: randomUUID(),
      login,
      name,
      role: input.role,
      passwordHash: await hashPassword(input.password),
      createdAt: now,
    })
    .returning()
    .get();
}

function requireUser(db: Db, login: string): UserRow {
  const user = findUserByLogin(db, login);
  if (!user) throw new Error(`Nie ma konta „${login}”`);
  return user;
}

/** Zmiana hasła wylogowuje konto na wszystkich urządzeniach. */
export async function setPassword(db: Db, login: string, password: string) {
  const user = requireUser(db, login);
  assertPasswordStrength(password, user);
  const passwordHash = await hashPassword(password);
  db.transaction((tx) => {
    tx.update(users).set({ passwordHash }).where(eq(users.id, user.id)).run();
    tx.delete(sessions).where(eq(sessions.userId, user.id)).run();
  });
}

export function setDisabled(db: Db, login: string, disabled: boolean, now = new Date()) {
  const user = requireUser(db, login);
  db.transaction((tx) => {
    tx.update(users)
      .set({ disabledAt: disabled ? now : null })
      .where(eq(users.id, user.id))
      .run();
    if (disabled) tx.delete(sessions).where(eq(sessions.userId, user.id)).run();
  });
}

/**
 * Zmiana własnego hasła w aplikacji. Bieżąca sesja (`keepToken`) zostaje, pozostałe urządzenia są wylogowane
 * w tej samej transakcji, żeby stare hasło nie zostawiło otwartej sesji na zgubionym telefonie.
 */
export async function changeOwnPassword(db: Db, user: UserRow, password: string, keepToken: string) {
  assertPasswordStrength(password, user);
  const passwordHash = await hashPassword(password);
  return db.transaction((tx) => {
    tx.update(users).set({ passwordHash }).where(eq(users.id, user.id)).run();
    return tx
      .delete(sessions)
      .where(and(eq(sessions.userId, user.id), ne(sessions.id, sessionId(keepToken))))
      .run().changes;
  });
}
