import { allowanceSchema } from '@ogarniacz/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createUser } from './auth/users';
import { type Db, openDatabase } from './db/client';
import { TEST_NOW_HEADER } from './testClock';

let db: Db;
let close: () => void;
// 15 listopada 2026, 12:00 w Polsce.
const NOW = new Date('2026-11-15T11:00:00Z');

async function logIn(app: ReturnType<typeof createApp>): Promise<string> {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: 'tata', password: 'haslo-rodzica' }),
  });
  expect(response.status).toBe(200);
  return (response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
}

async function serverDate(app: ReturnType<typeof createApp>, cookie: string, testNow?: string) {
  const headers: Record<string, string> = { Cookie: cookie };
  if (testNow !== undefined) headers[TEST_NOW_HEADER] = testNow;
  const response = await app.request('/api/allowance', { headers });
  return { status: response.status, body: (await response.json()) as unknown };
}

beforeEach(async () => {
  ({ db, close } = openDatabase(':memory:', './drizzle'));
  await createUser(db, { login: 'tata', name: 'Tata', role: 'parent', password: 'haslo-rodzica' });
});

afterEach(() => close());

describe('zegar testów e2e (X-Test-Now)', () => {
  it('bez TEST_CLOCK nagłówek nic nie zmienia', async () => {
    const app = createApp({ db, now: () => NOW });
    const cookie = await logIn(app);

    const { status, body } = await serverDate(app, cookie, '2026-12-01T10:00:00Z');

    expect(status).toBe(200);
    expect(allowanceSchema.parse(body).date).toBe('2026-11-15');
  });

  it('z TEST_CLOCK nagłówek ustawia „teraz” tylko dla swojego żądania', async () => {
    const app = createApp({ db, now: () => NOW, testClock: true });
    const cookie = await logIn(app);

    const shifted = await serverDate(app, cookie, '2026-12-01T10:00:00Z');
    const plain = await serverDate(app, cookie);

    expect(allowanceSchema.parse(shifted.body).date).toBe('2026-12-01');
    expect(allowanceSchema.parse(plain.body).date).toBe('2026-11-15');
  });

  it('niepoprawna data w nagłówku daje 400 z komunikatem', async () => {
    const app = createApp({ db, now: () => NOW, testClock: true });
    const cookie = await logIn(app);

    const { status, body } = await serverDate(app, cookie, 'jutro');

    expect(status).toBe(400);
    expect(body).toEqual({ error: 'Niepoprawny nagłówek X-Test-Now' });
  });
});
