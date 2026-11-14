import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { z } from 'zod';

/**
 * Komunikat dla reguł bez własnego tekstu w schemacie. Schematy w `shared` mają polskie komunikaty tam, gdzie
 * błąd może zobaczyć domownik (tytuł, nagroda, pusta zmiana); reszta to dane, które front i tak sprawdza przed wysłaniem.
 */
function fallbackMessage(issue: { path?: PropertyKey[] }): string {
  const field = issue.path?.map(String).join('.');
  return field ? `Niepoprawne dane w polu „${field}”` : 'Niepoprawne dane';
}

/**
 * Walidacja wejścia schematem z `shared`. Błąd ma postać kontraktu, `{ error: 'komunikat' }`, z pierwszym
 * komunikatem ze schematu, więc front pokazuje go użytkownikowi zamiast samego kodu odpowiedzi.
 */
export function validate<Target extends keyof ValidationTargets, Schema extends z.ZodType>(target: Target, schema: Schema) {
  return zValidator(
    target,
    schema,
    (result, c) => {
      if (!result.success) {
        return c.json({ error: result.error.issues[0]?.message ?? 'Niepoprawne dane' }, 400);
      }
    },
    // Rzutowanie tylko dla typów: biblioteka nie rozwiązuje typu wyniku dla schematu podanego przez parametr generyczny.
    { validationFunction: (s, value) => s.safeParseAsync(value, { error: fallbackMessage }) as never },
  );
}
