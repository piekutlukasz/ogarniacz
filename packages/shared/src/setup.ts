import { z } from 'zod';
import { personNameSchema } from './accounts';
import { MAX_PASSWORD_LENGTH, loginSchema } from './auth';

/**
 * Kreator pierwszego uruchomienia (docs/plany/KONTA.md, krok 3): na bazie bez żadnego konta zakłada pierwszego
 * rodzica. Wymaga kodu, który serwer wypisuje w logu przy starcie, więc świeża instancja nie należy do pierwszej
 * osoby, która trafi na adres.
 */

/** Znaki kodu: bez 0, O, 1, I i L, żeby kod przepisany z logu na telefon nie mylił się przy czytaniu. */
export const SETUP_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
/** Długość kodu bez myślnika; zapis to dwie czwórki, np. `K7M2-9QXD`. */
export const SETUP_CODE_LENGTH = 8;

/** Kod z formularza w postaci porównywalnej z wypisanym: wielkie litery, bez spacji i myślników. */
export function normalizeSetupCode(code: string): string {
  return code.replace(/[\s-]/g, '').toUpperCase();
}

/** Odpowiedź `GET /api/setup`, gdy kreator jest potrzebny. Inaczej serwer odpowiada 404. */
export const setupStatusSchema = z.object({ needed: z.literal(true) });
export type SetupStatus = z.infer<typeof setupStatusSchema>;

export const setupRequestSchema = z.object({
  code: z.string().trim().min(1, 'Podaj kod pierwszego uruchomienia').max(40, 'Nieprawidłowy kod pierwszego uruchomienia'),
  name: personNameSchema,
  login: loginSchema,
  password: z.string().min(1, 'Podaj hasło').max(MAX_PASSWORD_LENGTH, `Hasło może mieć najwyżej ${MAX_PASSWORD_LENGTH} znaków`),
});
export type SetupRequest = z.infer<typeof setupRequestSchema>;
