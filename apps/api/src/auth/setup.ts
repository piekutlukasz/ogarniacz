import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { SETUP_CODE_ALPHABET, SETUP_CODE_LENGTH, normalizeSetupCode } from '@ogarniacz/shared';
import type { Db } from '../db/client';
import { users } from '../db/schema';
import { hashPassword } from './password';
import { type UserRow, assertPasswordStrength } from './users';

/**
 * Kreator pierwszego uruchomienia (docs/plany/KONTA.md, krok 3). Kod żyje tylko w pamięci procesu: zmienia się
 * przy każdym starcie, a po założeniu konta albo po zbyt wielu złych próbach przestaje istnieć.
 */

/** Po tylu złych kodach (ze wszystkich adresów razem) kod wygasa; nowy daje dopiero restart serwera. */
export const SETUP_MAX_FAILURES = 20;

/** Losowy kod: 8 znaków z 31, około 40 bitów. Przy limicie prób zgadywanie nie ma szans. */
export function generateSetupCode(): string {
  return Array.from({ length: SETUP_CODE_LENGTH }, () => SETUP_CODE_ALPHABET[randomInt(SETUP_CODE_ALPHABET.length)]).join('');
}

/** Zapis do logu: dwie czwórki z myślnikiem, łatwiejsze do przepisania. */
export function formatSetupCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export type SetupCheck = 'ok' | 'wrong' | 'expired';
export type SetupGate = ReturnType<typeof createSetupGate>;

export function createSetupGate(code: string, maxFailures = SETUP_MAX_FAILURES) {
  let current: Buffer | null = Buffer.from(normalizeSetupCode(code));
  let failures = 0;

  return {
    /** Czy kod jeszcze działa. Bez kodu kreator jest niedostępny, nawet gdy baza jest pusta. */
    get active() {
      return current !== null;
    },
    check(input: string): SetupCheck {
      if (!current) return 'expired';
      const given = Buffer.from(normalizeSetupCode(input));
      if (given.length === current.length && timingSafeEqual(given, current)) return 'ok';
      failures += 1;
      if (failures >= maxFailures) {
        current = null;
        return 'expired';
      }
      return 'wrong';
    },
    /** Po założeniu konta kod jest zużyty. */
    close() {
      current = null;
    },
  };
}

export function hasAnyUser(db: Pick<Db, 'select'>): boolean {
  // Liczą się też konta wyłączone: baza, w której kiedykolwiek było konto, kreatora nie pokaże.
  return db.select({ id: users.id }).from(users).limit(1).get() !== undefined;
}

/**
 * Zakłada pierwszego rodzica. Warunek „brak kont” jest sprawdzany w tej samej transakcji co zapis, więc dwa
 * równoczesne żądania nie założą dwóch kont. Zwraca `undefined`, gdy konto już jest.
 */
export async function createFirstParent(
  db: Db,
  input: { login: string; name: string; password: string },
  now: Date,
): Promise<UserRow | undefined> {
  assertPasswordStrength(input.password, input);
  // Skrót liczymy przed transakcją, bo transakcja w better-sqlite3 musi być synchroniczna.
  const passwordHash = await hashPassword(input.password);
  return db.transaction((tx) => {
    if (hasAnyUser(tx)) return undefined;
    return tx
      .insert(users)
      .values({ id: randomUUID(), login: input.login, name: input.name, role: 'parent', passwordHash, createdAt: now })
      .returning()
      .get();
  });
}
