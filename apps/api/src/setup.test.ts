import { authEventsSchema, normalizeSetupCode, setupStatusSchema, userResponseSchema } from '@ogarniacz/shared';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { createAttemptLimiter } from './auth/rateLimit';
import { SETUP_MAX_FAILURES, createSetupGate, formatSetupCode, generateSetupCode } from './auth/setup';
import { createUser, setDisabled } from './auth/users';
import { type Db, openDatabase } from './db/client';
import { users } from './db/schema';
import { EXPIRED_SETUP_CODE, WRONG_SETUP_CODE } from './routes/setup';

const CODE = 'K7M29QXD';
const FORM = { code: 'K7M2-9QXD', name: 'Mama', login: 'mama', password: 'tajne-haslo-1' };

let db: Db;
let close: () => void;
let clock: number;
let app: ReturnType<typeof createApp>;

function makeApp(options: { demo?: boolean; withGate?: boolean; setupLimiter?: ReturnType<typeof createAttemptLimiter> } = {}) {
  const { withGate = true, ...rest } = options;
  return createApp({ db, now: () => new Date(clock), setup: withGate ? createSetupGate(CODE) : undefined, ...rest });
}

function call(method: string, body?: unknown, headers: Record<string, string> = {}) {
  return app.request('/api/setup', {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(() => {
  ({ db, close } = openDatabase(':memory:', './drizzle'));
  clock = Date.parse('2026-11-14T08:00:00Z');
  app = makeApp();
});

afterEach(() => close());

describe('kod pierwszego uruchomienia', () => {
  it('ma 8 znaków z alfabetu bez mylących znaków i w logu dwie czwórki', () => {
    const code = generateSetupCode();
    expect(code).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
    expect(formatSetupCode(code)).toMatch(/^.{4}-.{4}$/);
  });

  it('formularz przyjmuje małe litery, spacje i myślnik', () => {
    expect(normalizeSetupCode(' k7m2 - 9qxd ')).toBe(CODE);
    expect(createSetupGate(CODE).check('k7m2-9qxd')).toBe('ok');
  });
});

describe('kreator na pustej bazie', () => {
  it('pokazuje się, zakłada rodzica z dobrym kodem i od razu go loguje', async () => {
    expect(setupStatusSchema.parse(await (await call('GET')).json())).toEqual({ needed: true });

    const response = await call('POST', FORM, { 'X-Real-IP': '203.0.113.5' });
    expect(response.status).toBe(201);
    const { user } = userResponseSchema.parse(await response.json());
    expect(user).toMatchObject({ login: 'mama', name: 'Mama', role: 'parent' });

    const cookie = (response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
    const me = await app.request('/api/auth/me', { headers: { Cookie: cookie } });
    expect(me.status).toBe(200);

    const events = authEventsSchema.parse(await (await app.request('/api/auth/events', { headers: { Cookie: cookie } })).json());
    expect(events[0]).toMatchObject({ type: 'setup_done', login: 'mama', actorName: 'Mama', ip: '203.0.113.5' });
  });

  it('po założeniu konta znika: obie trasy dają 404, a kod nie działa drugi raz', async () => {
    expect((await call('POST', FORM)).status).toBe(201);

    expect((await call('GET')).status).toBe(404);
    const again = await call('POST', { ...FORM, login: 'tata', name: 'Tata' });
    expect(again.status).toBe(404);
    expect(db.select().from(users).all()).toHaveLength(1);
  });

  it('zły kod daje 403 i nie zakłada konta', async () => {
    const response = await call('POST', { ...FORM, code: 'AAAA-AAAA' });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: WRONG_SETUP_CODE });
    expect(db.select().from(users).all()).toEqual([]);
  });

  it('limit złych kodów na adres, a inny adres próbuje dalej', async () => {
    const wrong = { ...FORM, code: 'AAAA-AAAA' };
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await call('POST', wrong, { 'X-Real-IP': '198.51.100.7' })).status).toBe(403);
    }
    // Po limicie nie przechodzi nawet dobry kod.
    const limited = await call('POST', FORM, { 'X-Real-IP': '198.51.100.7' });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBeTruthy();

    expect((await call('POST', FORM, { 'X-Real-IP': '198.51.100.8' })).status).toBe(201);
  });

  it(`po ${SETUP_MAX_FAILURES} złych kodach z różnych adresów kod wygasa do restartu`, async () => {
    for (let attempt = 1; attempt < SETUP_MAX_FAILURES; attempt += 1) {
      expect((await call('POST', { ...FORM, code: 'AAAA-AAAA' }, { 'X-Real-IP': `198.51.100.${attempt}` })).status).toBe(403);
    }
    const last = await call('POST', { ...FORM, code: 'AAAA-AAAA' }, { 'X-Real-IP': '192.0.2.1' });
    expect(await last.json()).toEqual({ error: EXPIRED_SETUP_CODE });

    expect((await call('POST', FORM, { 'X-Real-IP': '192.0.2.2' })).status).toBe(404);
    expect((await call('GET')).status).toBe(404);
  });

  it('hasło musi spełniać regułę, a odrzucone nie zużywa kodu', async () => {
    const short = await call('POST', { ...FORM, password: 'krotkie' });
    expect(short.status).toBe(400);
    expect(await short.json()).toEqual({ error: 'Hasło musi mieć co najmniej 8 znaków' });

    const withLogin = await call('POST', { ...FORM, password: 'mama-ma-kota' });
    expect(await withLogin.json()).toEqual({ error: 'Hasło nie może zawierać loginu ani imienia' });

    expect((await call('POST', FORM)).status).toBe(201);
  });

  it('login i imię przechodzą przez schematy z shared', async () => {
    const response = await call('POST', { ...FORM, login: 'Zła Nazwa' });
    expect(response.status).toBe(400);
    expect((await call('POST', { ...FORM, login: ' MAMA ' })).status).toBe(201);
    expect(db.select({ login: users.login }).from(users).all()).toEqual([{ login: 'mama' }]);
  });

  it('dwa równoczesne żądania zakładają jedno konto', async () => {
    const [first, second] = await Promise.all([call('POST', FORM), call('POST', { ...FORM, login: 'tata', name: 'Tata' })]);

    expect([first.status, second.status].sort()).toEqual([201, 404]);
    expect(db.select().from(users).all()).toHaveLength(1);
  });

  it('wymaga żądania z tej samej domeny', async () => {
    const response = await call('POST', FORM, { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' });
    expect(response.status).toBe(403);
    expect(db.select().from(users).all()).toEqual([]);
  });
});

describe('kreator niedostępny', () => {
  it('gdy w bazie jest konto, także wyłączone albo założone przez CLI', async () => {
    await createUser(db, { login: 'tata', name: 'Tata', role: 'parent', password: 'haslo-taty-1' });
    setDisabled(db, 'tata', true);

    expect((await call('GET')).status).toBe(404);
    expect((await call('POST', FORM)).status).toBe(404);
    expect(db.select().from(users).where(eq(users.login, 'mama')).all()).toEqual([]);
  });

  it('bez kodu, czyli gdy serwer wystartował z kontami', async () => {
    app = makeApp({ withGate: false });
    expect((await call('GET')).status).toBe(404);
    expect((await call('POST', FORM)).status).toBe(404);
  });

  it('w trybie demo trasy nie ma: 404, a nie 401', async () => {
    app = makeApp({ demo: true });
    expect((await call('GET')).status).toBe(404);
    expect((await call('POST', FORM)).status).toBe(404);
    expect(db.select().from(users).all()).toEqual([]);
  });
});
