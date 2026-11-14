import { userSchema } from '@ogarniacz/shared';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../app';
import { type Db, openDatabase } from '../db/client';
import { authEvents, sessions } from '../db/schema';
import { deleteOldAuthEvents, recordAuthEvent } from './events';
import { verifyPassword } from './password';
import { createLoginLimiter, ipGroup } from './rateLimit';
import { createUser, findUserByLogin, setDisabled, setPassword } from './users';

const DAY = 24 * 60 * 60 * 1000;

let db: Db;
let close: () => void;
let clock: number;
let app: ReturnType<typeof createApp>;

function makeApp(options: { cookieSecure?: boolean } = {}) {
  return createApp({ db, now: () => new Date(clock), limiter: createLoginLimiter(), ...options });
}

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function login(loginName: string, password: string, headers: Record<string, string> = {}) {
  return post('/api/auth/login', { login: loginName, password }, headers);
}

function sessionCookie(response: Response): string {
  return (response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
}

function me(cookie: string) {
  return app.request('/api/auth/me', { headers: { Cookie: cookie } });
}

beforeEach(async () => {
  ({ db, close } = openDatabase(':memory:', './drizzle'));
  clock = Date.parse('2026-11-08T10:00:00Z');
  app = makeApp();
  await createUser(db, { login: 'mama', name: 'Mama', role: 'parent', password: 'bardzo-tajne' });
});

afterEach(() => close());

describe('dostęp bez logowania', () => {
  it('health check jest publiczny', async () => {
    expect((await app.request('/api/health')).status).toBe(200);
  });

  it('API bez sesji zwraca 401', async () => {
    expect((await app.request('/api/tasks')).status).toBe(401);
    expect((await post('/api/tasks', { title: 'xyz' })).status).toBe(401);
    expect((await app.request('/api/nie-ma-takiej')).status).toBe(401);
    expect((await me('ogarniacz_session=zmyslony')).status).toBe(401);
  });
});

describe('logowanie', () => {
  it('loguje, zwraca użytkownika bez hasła i ustawia bezpieczne cookie', async () => {
    const response = await login(' Mama ', 'bardzo-tajne');

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(userSchema.parse(body.user)).toMatchObject({ login: 'mama', role: 'parent' });
    expect(JSON.stringify(body)).not.toContain('scrypt');

    const setCookie = response.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).not.toContain('Secure');

    const current = await me(sessionCookie(response));
    expect((await current.json()).user.login).toBe('mama');
  });

  it('w produkcji cookie ma flagę Secure', async () => {
    app = makeApp({ cookieSecure: true });
    const response = await login('mama', 'bardzo-tajne');
    expect(response.headers.get('Set-Cookie')).toContain('Secure');
  });

  it('nie zdradza, czy login istnieje', async () => {
    const wrongPassword = await login('mama', 'zle-haslo');
    const unknownLogin = await login('nikt', 'zle-haslo');

    expect(wrongPassword.status).toBe(401);
    expect(unknownLogin.status).toBe(401);
    expect(await wrongPassword.json()).toEqual(await unknownLogin.json());
  });

  it('w bazie jest tylko skrót tokenu sesji', async () => {
    const cookie = sessionCookie(await login('mama', 'bardzo-tajne'));
    const token = cookie.split('=')[1] ?? '';
    const stored = db.select().from(sessions).all();

    expect(stored).toHaveLength(1);
    expect(stored[0]?.id).not.toBe(token);
  });

  it('wylogowanie unieważnia sesję', async () => {
    const cookie = sessionCookie(await login('mama', 'bardzo-tajne'));

    const response = await post('/api/auth/logout', {}, { Cookie: cookie });

    expect(response.status).toBe(204);
    expect((await me(cookie)).status).toBe(401);
  });

  it('usuwa cookie z tymi samymi atrybutami, z którymi je ustawiło', async () => {
    const cookie = sessionCookie(await login('mama', 'bardzo-tajne'));

    const setCookie = (await post('/api/auth/logout', {}, { Cookie: cookie })).headers.get('set-cookie');

    expect(setCookie).toContain('Max-Age=0');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
  });
});

describe('konta', () => {
  it('wyłączone konto nie zaloguje się, a jego sesje przestają działać', async () => {
    const cookie = sessionCookie(await login('mama', 'bardzo-tajne'));

    setDisabled(db, 'mama', true);

    expect((await me(cookie)).status).toBe(401);
    expect((await login('mama', 'bardzo-tajne')).status).toBe(401);

    setDisabled(db, 'mama', false);
    expect((await login('mama', 'bardzo-tajne')).status).toBe(200);
  });

  it('zmiana hasła wylogowuje wszystkie urządzenia', async () => {
    const cookie = sessionCookie(await login('mama', 'bardzo-tajne'));

    await setPassword(db, 'mama', 'nowe-haslo-123');

    expect((await me(cookie)).status).toBe(401);
    expect((await login('mama', 'bardzo-tajne')).status).toBe(401);
    expect((await login('mama', 'nowe-haslo-123')).status).toBe(200);
  });

  it('odrzuca duplikat loginu, zły login i krótkie hasło', async () => {
    await expect(createUser(db, { login: 'MAMA', name: 'X', role: 'child', password: 'dlugie-haslo' })).rejects.toThrow(
      'już istnieje',
    );
    await expect(createUser(db, { login: 'żaba', name: 'X', role: 'child', password: 'dlugie-haslo' })).rejects.toThrow();
    await expect(createUser(db, { login: 'ola', name: 'Ola', role: 'child', password: 'krotkie' })).rejects.toThrow(
      'co najmniej 8',
    );
    await expect(createUser(db, { login: 'ola', name: 'Ola', role: 'child', password: 'ola-12345' })).rejects.toThrow(
      'loginu ani imienia',
    );
    await expect(setPassword(db, 'mama', 'mama-2026!')).rejects.toThrow('loginu ani imienia');
  });

  it('hasło jest zapisane jako skrót scrypt', async () => {
    const user = findUserByLogin(db, 'mama');
    expect(user?.passwordHash).toMatch(/^scrypt\$/);
    expect(await verifyPassword('bardzo-tajne', user?.passwordHash ?? '')).toBe(true);
    expect(await verifyPassword('bardzo-tajn', user?.passwordHash ?? '')).toBe(false);
  });
});

describe('limit prób logowania', () => {
  it('blokuje login po 5 nieudanych próbach, także z poprawnym hasłem', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await login('mama', 'zle')).status).toBe(401);
    }

    const blocked = await login('mama', 'bardzo-tajne');
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get('Retry-After'))).toBeGreaterThan(0);

    clock += 15 * 60 * 1000;
    expect((await login('mama', 'bardzo-tajne')).status).toBe(200);
  });

  it('udane logowanie zeruje licznik', async () => {
    for (let i = 0; i < 4; i++) await login('mama', 'zle');
    expect((await login('mama', 'bardzo-tajne')).status).toBe(200);

    for (let i = 0; i < 4; i++) await login('mama', 'zle');
    expect((await login('mama', 'bardzo-tajne')).status).toBe(200);
  });

  it('blokuje adres IP zgadujący wiele loginów', async () => {
    const ip = { 'X-Real-IP': '203.0.113.7' };
    for (let i = 0; i < 20; i++) await login(`konto${i}`, 'zle', ip);

    expect((await login('mama', 'bardzo-tajne', ip)).status).toBe(429);
    expect((await login('mama', 'bardzo-tajne', { 'X-Real-IP': '198.51.100.1' })).status).toBe(200);
  });

  it('obcy zgadujący hasło blokuje tylko siebie, a domownik loguje się ze swojego adresu', async () => {
    const attacker = { 'X-Real-IP': '203.0.113.7' };
    for (let i = 0; i < 5; i++) await login('mama', 'zle', attacker);

    expect((await login('mama', 'bardzo-tajne', attacker)).status).toBe(429);
    expect((await login('mama', 'bardzo-tajne', { 'X-Real-IP': '198.51.100.1' })).status).toBe(200);
  });

  it('bezpiecznik blokuje login zgadywany z wielu adresów, na godzinę', async () => {
    // Niski próg zamiast domyślnych 100: każda próba to scrypt, a 100 prób przekracza czas testu w CI.
    app = createApp({ db, now: () => new Date(clock), limiter: createLoginLimiter({ perLogin: 10 }) });
    for (let i = 0; i < 10; i++) await login('mama', 'zle', { 'X-Real-IP': `203.0.113.${Math.floor(i / 5)}` });

    expect((await login('mama', 'bardzo-tajne', { 'X-Real-IP': '198.51.100.1' })).status).toBe(429);
    clock += 60 * 60 * 1000;
    expect((await login('mama', 'bardzo-tajne', { 'X-Real-IP': '198.51.100.1' })).status).toBe(200);
  });

  it('domyślny bezpiecznik to 100 prób na login w godzinie, a udane logowanie go nie zeruje', () => {
    const limiter = createLoginLimiter();
    const start = clock;
    for (let i = 0; i < 99; i++) limiter.recordFailure('mama', `203.0.113.${Math.floor(i / 5)}`, start);
    limiter.recordSuccess('mama', '198.51.100.1');
    expect(limiter.retryAfterSeconds('mama', '198.51.100.1', start)).toBe(0);

    expect(limiter.recordFailure('mama', '203.0.113.200', start)).toContain('login');
    expect(limiter.retryAfterSeconds('mama', '198.51.100.1', start)).toBe(3600);
    expect(limiter.retryAfterSeconds('mama', '198.51.100.1', start + 60 * 60 * 1000)).toBe(0);
  });

  it('adresy IPv6 z jednej sieci /64 liczą się razem', async () => {
    for (let i = 1; i <= 5; i++) await login('mama', 'zle', { 'X-Real-IP': `2001:db8:1:2::${i}` });

    expect((await login('mama', 'bardzo-tajne', { 'X-Real-IP': '2001:db8:1:2:abcd::99' })).status).toBe(429);
    expect((await login('mama', 'bardzo-tajne', { 'X-Real-IP': '2001:db8:1:3::1' })).status).toBe(200);
  });

  it('bez adresu IP nie blokuje wszystkich naraz', async () => {
    for (let i = 0; i < 25; i++) await login(`konto${i}`, 'zle');

    expect((await login('mama', 'bardzo-tajne')).status).toBe(200);
  });
});

describe('ważność sesji', () => {
  it('sesja wygasa po 90 dniach bez używania', async () => {
    const cookie = sessionCookie(await login('mama', 'bardzo-tajne'));

    clock += 89 * DAY;
    expect((await me(cookie)).status).toBe(200);

    clock += 91 * DAY;
    expect((await me(cookie)).status).toBe(401);
  });

  it('używana sesja jest przedłużana razem z cookie', async () => {
    const cookie = sessionCookie(await login('mama', 'bardzo-tajne'));

    clock += 10 * 60 * 1000;
    expect((await me(cookie)).headers.get('Set-Cookie')).toBeNull();

    for (let i = 0; i < 3; i++) {
      clock += 60 * DAY;
      const response = await me(cookie);
      expect(response.status).toBe(200);
      expect(response.headers.get('Set-Cookie')).toContain('ogarniacz_session=');
    }
  });
});

describe('CSRF', () => {
  it('odrzuca zmiany wysłane z obcej strony', async () => {
    const cookie = sessionCookie(await login('mama', 'bardzo-tajne'));
    const headers = { Cookie: cookie, Host: 'ogarniacz.example', Origin: 'https://zla-strona.example' };

    expect((await post('/api/tasks', { title: 'xyz' }, headers)).status).toBe(403);
    expect((await login('mama', 'bardzo-tajne', { Host: 'ogarniacz.example', Origin: 'https://zla-strona.example' })).status).toBe(403);
  });

  it('przepuszcza żądania z tej samej domeny, także przez https za nginx', async () => {
    const cookie = sessionCookie(await login('mama', 'bardzo-tajne'));
    const headers = { Cookie: cookie, Host: 'ogarniacz.example', Origin: 'https://ogarniacz.example' };

    expect((await post('/api/tasks', { title: 'xyz' }, headers)).status).toBe(201);
  });

  it('uwzględnia X-Forwarded-Host od proxy', async () => {
    const cookie = sessionCookie(await login('mama', 'bardzo-tajne'));
    const headers = {
      Cookie: cookie,
      Host: '127.0.0.1:3000',
      'X-Forwarded-Host': 'ogarniacz.example',
      Origin: 'https://ogarniacz.example',
    };

    expect((await post('/api/tasks', { title: 'xyz' }, headers)).status).toBe(201);
  });
});

describe('klucz adresu dla limitów', () => {
  it('IPv4 zostaje bez zmian, a IPv6 skraca się do sieci /64', () => {
    expect(ipGroup('203.0.113.7')).toBe('203.0.113.7');
    expect(ipGroup('::ffff:203.0.113.7')).toBe('203.0.113.7');
    expect(ipGroup('2001:DB8:0001:0002:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::/64');
    expect(ipGroup('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipGroup('::1')).toBe('0:0:0:0::/64');
  });
});

describe('dziennik logowań', () => {
  const client = { 'X-Real-IP': '203.0.113.7', 'User-Agent': 'Telefon testowy' };

  function events() {
    return db.select().from(authEvents).orderBy(authEvents.createdAt).all();
  }

  it('zapisuje udane logowanie i wylogowanie z adresem i przeglądarką', async () => {
    const cookie = sessionCookie(await login('mama', 'bardzo-tajne', client));
    clock += 1000;
    await post('/api/auth/logout', {}, { ...client, Cookie: cookie });

    const mama = findUserByLogin(db, 'mama');
    expect(events()).toMatchObject([
      { type: 'login_ok', userId: mama?.id, ip: '203.0.113.7', userAgent: 'Telefon testowy', actorId: null },
      { type: 'logout', userId: mama?.id, ip: '203.0.113.7' },
    ]);
  });

  it('zapisuje złe hasło i logowanie na wyłączone konto z powodem', async () => {
    await login('mama', 'zle', client);
    setDisabled(db, 'mama', true);
    await login('mama', 'bardzo-tajne', client);

    expect(events().map((event) => [event.type, event.detail])).toEqual([
      ['login_failed', 'bad_password'],
      ['login_failed', 'disabled'],
    ]);
  });

  it('nie zapisuje wpisanego loginu, gdy konto nie istnieje, i ogranicza takie wpisy do jednego na minutę', async () => {
    await login('moje-tajne-haslo', 'zle', client);
    await login('inny', 'zle', client);
    clock += 60 * 1000;
    await login('jeszcze-inny', 'zle', client);

    const rows = events();
    expect(rows.map((event) => [event.type, event.userId, event.detail])).toEqual([
      ['login_failed', null, 'unknown_login'],
      ['login_failed', null, 'unknown_login'],
    ]);
    expect(JSON.stringify(rows)).not.toContain('moje-tajne-haslo');
  });

  it('zapisuje początek blokady raz, z jej zakresem', async () => {
    for (let i = 0; i < 7; i++) await login('mama', 'zle', client);

    const locked = events().filter((event) => event.type === 'locked');
    expect(locked).toMatchObject([{ detail: 'pair', userId: findUserByLogin(db, 'mama')?.id, ip: '203.0.113.7' }]);
  });

  it('blokada adresu nie wskazuje konta', async () => {
    for (let i = 0; i < 20; i++) await login(`konto${i}`, 'zle', client);

    expect(events().filter((event) => event.type === 'locked')).toMatchObject([{ detail: 'ip', userId: null }]);
  });

  it('przycina długi opis przeglądarki', async () => {
    await login('mama', 'bardzo-tajne', { 'User-Agent': 'x'.repeat(500) });

    expect(events()[0]?.userAgent).toHaveLength(200);
  });

  it('usuwa wpisy starsze niż 90 dni', () => {
    recordAuthEvent(db, { type: 'login_ok' }, new Date(clock - 91 * DAY));
    recordAuthEvent(db, { type: 'login_ok' }, new Date(clock - 89 * DAY));

    expect(deleteOldAuthEvents(db, new Date(clock))).toBe(1);
    expect(events()).toHaveLength(1);
  });
});

describe('zmiana hasła i wylogowanie innych urządzeń', () => {
  function changePassword(cookie: string, current: string, next: string, headers: Record<string, string> = {}) {
    return post('/api/auth/password', { current, next }, { Cookie: cookie, ...headers });
  }

  function logoutAll(cookie: string) {
    return post('/api/auth/logout-all', {}, { Cookie: cookie });
  }

  it('zmienia hasło, zostawia bieżące urządzenie i wylogowuje pozostałe', async () => {
    const phone = sessionCookie(await login('mama', 'bardzo-tajne'));
    const tablet = sessionCookie(await login('mama', 'bardzo-tajne'));

    const response = await changePassword(phone, 'bardzo-tajne', 'nowe-haslo-123');

    expect(response.status).toBe(204);
    expect((await me(phone)).status).toBe(200);
    expect((await me(tablet)).status).toBe(401);
    expect((await login('mama', 'bardzo-tajne')).status).toBe(401);
    expect((await login('mama', 'nowe-haslo-123')).status).toBe(200);
  });

  it('nie zmienia hasła bez poprawnego obecnego i nie wylogowuje przy tym aplikacji', async () => {
    const cookie = sessionCookie(await login('mama', 'bardzo-tajne'));

    const response = await changePassword(cookie, 'zle-haslo', 'nowe-haslo-123');

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Obecne hasło jest nieprawidłowe' });
    expect((await me(cookie)).status).toBe(200);
    expect((await login('mama', 'bardzo-tajne')).status).toBe(200);
  });

  it('odrzuca krótkie hasło i hasło z loginem albo imieniem', async () => {
    await createUser(db, { login: 'kasia', name: 'Kasia Nowak', role: 'child', password: 'dlugie-haslo' });
    const cookie = sessionCookie(await login('kasia', 'dlugie-haslo'));

    for (const [next, error] of [
      ['krotkie', 'Hasło musi mieć co najmniej 8 znaków'],
      ['KASIA2015!', 'Hasło nie może zawierać loginu ani imienia'],
      ['nowak-haslo', 'Hasło nie może zawierać loginu ani imienia'],
    ] as const) {
      const response = await changePassword(cookie, 'dlugie-haslo', next);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error });
    }
    expect((await login('kasia', 'dlugie-haslo')).status).toBe(200);
  });

  it('obecne hasło ma ten sam limit prób co logowanie', async () => {
    const ip = { 'X-Real-IP': '203.0.113.7' };
    const cookie = sessionCookie(await login('mama', 'bardzo-tajne', ip));
    for (let i = 0; i < 5; i++) expect((await changePassword(cookie, 'zle', 'nowe-haslo-123', ip)).status).toBe(403);

    const blocked = await changePassword(cookie, 'bardzo-tajne', 'nowe-haslo-123', ip);
    expect(blocked.status).toBe(429);
    expect((await login('mama', 'bardzo-tajne', ip)).status).toBe(429);

    clock += 15 * 60 * 1000;
    expect((await changePassword(cookie, 'bardzo-tajne', 'nowe-haslo-123', ip)).status).toBe(204);
  });

  it('zapisuje w dzienniku zmianę hasła i nieudane potwierdzenie', async () => {
    const cookie = sessionCookie(await login('mama', 'bardzo-tajne'));
    await login('mama', 'bardzo-tajne');
    await changePassword(cookie, 'zle', 'nowe-haslo-123');
    await changePassword(cookie, 'bardzo-tajne', 'nowe-haslo-123');

    const mama = findUserByLogin(db, 'mama');
    const rows = db.select().from(authEvents).all().filter((event) => event.type !== 'login_ok');
    expect(rows).toMatchObject([
      { type: 'login_failed', userId: mama?.id, detail: 'password_change' },
      { type: 'password_changed', userId: mama?.id, actorId: mama?.id, detail: 'sessions:1' },
    ]);
    expect(JSON.stringify(rows)).not.toContain('nowe-haslo-123');
  });

  it('wylogowuje pozostałe urządzenia i podaje ich liczbę', async () => {
    const phone = sessionCookie(await login('mama', 'bardzo-tajne'));
    const tablet = sessionCookie(await login('mama', 'bardzo-tajne'));
    const laptop = sessionCookie(await login('mama', 'bardzo-tajne'));
    await createUser(db, { login: 'tata', name: 'Tata', role: 'parent', password: 'inne-haslo-1' });
    const other = sessionCookie(await login('tata', 'inne-haslo-1'));

    const response = await logoutAll(phone);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 2 });
    expect((await me(phone)).status).toBe(200);
    expect((await me(tablet)).status).toBe(401);
    expect((await me(laptop)).status).toBe(401);
    expect((await me(other)).status).toBe(200);
    expect(db.select().from(authEvents).all().filter((event) => event.type === 'logout_all')).toMatchObject([
      { userId: findUserByLogin(db, 'mama')?.id, detail: 'sessions:2' },
    ]);
  });

  it('w trybie demo odpowiada 403 i niczego nie zmienia', async () => {
    app = createApp({ db, now: () => new Date(clock), limiter: createLoginLimiter(), demo: true });
    const phone = sessionCookie(await login('mama', 'bardzo-tajne'));
    const tablet = sessionCookie(await login('mama', 'bardzo-tajne'));

    expect((await changePassword(phone, 'bardzo-tajne', 'nowe-haslo-123')).status).toBe(403);
    expect((await logoutAll(phone)).status).toBe(403);
    expect((await me(tablet)).status).toBe(200);
    expect((await login('mama', 'bardzo-tajne')).status).toBe(200);
  });
});
