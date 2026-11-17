import { AsyncLocalStorage } from 'node:async_hooks';
import type { MiddlewareHandler } from 'hono';

/**
 * Nagłówek, którym test e2e podaje chwilę, jaką serwer ma uznać za „teraz” (ISO 8601, np. `2026-11-23T10:00:00Z`).
 * Działa tylko z `TEST_CLOCK=true`, którego konfiguracja nie przyjmuje na produkcji.
 */
export const TEST_NOW_HEADER = 'X-Test-Now';

/**
 * Zegar sterowany z testów e2e (docs/archiwum/UTWARDZENIE-TESTY.md, T3). Przesuwa czas tylko dla żądania z nagłówkiem
 * `X-Test-Now`, więc testy biegnące równolegle na tym samym serwerze nie przeszkadzają sobie nawzajem.
 * Zadania w tle (`jobs/scheduler.ts`) mają własny zegar i nagłówka nie widzą.
 */
export function createTestClock(now: () => Date) {
  const requestNow = new AsyncLocalStorage<Date>();

  const middleware: MiddlewareHandler = async (c, next) => {
    const value = c.req.header(TEST_NOW_HEADER);
    if (value === undefined) return next();
    const at = new Date(value);
    if (Number.isNaN(at.getTime())) {
      return c.json({ error: `Niepoprawny nagłówek ${TEST_NOW_HEADER}` }, 400);
    }
    return requestNow.run(at, next);
  };

  return { now: () => requestNow.getStore() ?? now(), middleware };
}
