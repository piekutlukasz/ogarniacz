import {
  INVALID_INVITE_MESSAGE,
  accountsSchema,
  authEventsSchema,
  createdInviteSchema,
  invitePreviewSchema,
  invitesSchema,
  userResponseSchema,
} from '@ogarniacz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './app';
import { createLoginLimiter } from './auth/rateLimit';
import { createUser, findUserByLogin } from './auth/users';
import { type Db, openDatabase } from './db/client';
import { authEvents, invites, pushSubscriptions } from './db/schema';
import type { PushPayload, PushSettings } from './push/sender';

const HOUR = 60 * 60 * 1000;

let db: Db;
let close: () => void;
let clock: number;
let app: ReturnType<typeof createApp>;
let sent: { userId: string; payload: PushPayload }[];
let push: PushSettings;
let mama: string;
let tata: string;
let kasia: string;

function makeApp(options: { demo?: boolean } = {}) {
  return createApp({ db, now: () => new Date(clock), limiter: createLoginLimiter(), push, ...options });
}

function call(method: string, path: string, body?: unknown, cookie = mama, headers: Record<string, string> = {}) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function logIn(login: string, password: string) {
  const response = await call('POST', '/api/auth/login', { login, password }, '');
  expect(response.status).toBe(200);
  return (response.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
}

async function invite(body: Record<string, unknown>, cookie = mama) {
  return call('POST', '/api/invites', { confirm: 'haslo-mamy-1', ...body }, cookie);
}

async function inviteKasiaToken() {
  const response = await invite({ kind: 'new_account', login: 'zosia', name: 'Zosia', role: 'child' });
  expect(response.status).toBe(201);
  return createdInviteSchema.parse(await response.json()).token;
}

function subscribe(login: string) {
  const user = findUserByLogin(db, login)!;
  db.insert(pushSubscriptions)
    .values({ id: `urzadzenie-${login}`, userId: user.id, endpoint: `https://web.push.apple.com/${login}`, p256dh: 'k', auth: 'a', createdAt: new Date(clock) })
    .run();
}

function events(type?: string) {
  return db
    .select()
    .from(authEvents)
    .orderBy(authEvents.createdAt)
    .all()
    .filter((event) => !type || event.type === type);
}

beforeEach(async () => {
  ({ db, close } = openDatabase(':memory:', './drizzle'));
  // 12:00 w Warszawie: poza ciszą nocną.
  clock = Date.parse('2026-11-13T11:00:00Z');
  sent = [];
  push = {
    publicKey: 'klucz',
    send: async (target, payload) => {
      sent.push({ userId: db.select().from(pushSubscriptions).all().find((row) => row.endpoint === target.endpoint)?.userId ?? '', payload });
      return { ok: true };
    },
  };
  app = makeApp();
  await createUser(db, { login: 'mama', name: 'Mama', role: 'parent', password: 'haslo-mamy-1' });
  await createUser(db, { login: 'tata', name: 'Tata', role: 'parent', password: 'haslo-taty-1' });
  await createUser(db, { login: 'kasia', name: 'Kasia', role: 'child', password: 'haslo-dziecka' });
  mama = await logIn('mama', 'haslo-mamy-1');
  tata = await logIn('tata', 'haslo-taty-1');
  kasia = await logIn('kasia', 'haslo-dziecka');
});

afterEach(() => close());

describe('zaproszenie nowej osoby', () => {
  it('rodzic zaprasza, osoba widzi powitanie, ustawia hasło i jest zalogowana', async () => {
    const response = await invite({ kind: 'new_account', login: ' Zosia ', name: ' Zosia ', role: 'child' });

    expect(response.status).toBe(201);
    const { invite: created, token } = createdInviteSchema.parse(await response.json());
    expect(created).toMatchObject({ kind: 'new_account', login: 'zosia', name: 'Zosia', role: 'child', createdBy: 'Mama' });
    expect(Date.parse(created.expiresAt) - clock).toBe(24 * HOUR);

    const preview = await call('POST', '/api/invites/preview', { token }, '');
    expect(invitePreviewSchema.parse(await preview.json())).toEqual({ kind: 'new_account', name: 'Zosia', login: 'zosia' });

    const accepted = await call('POST', '/api/invites/accept', { token, password: 'moje-nowe-haslo' }, '');
    expect(accepted.status).toBe(201);
    expect(userResponseSchema.parse(await accepted.json()).user).toMatchObject({ login: 'zosia', role: 'child' });
    const cookie = (accepted.headers.get('Set-Cookie') ?? '').split(';')[0] ?? '';
    expect((await call('GET', '/api/auth/me', undefined, cookie)).status).toBe(200);
    expect((await call('POST', '/api/auth/login', { login: 'zosia', password: 'moje-nowe-haslo' }, '')).status).toBe(200);
  });

  it('token jest w bazie tylko jako skrót i nie wraca na liście', async () => {
    const token = await inviteKasiaToken();

    expect(db.select().from(invites).all()[0]?.tokenHash).not.toBe(token);
    const list = await call('GET', '/api/invites');
    expect(invitesSchema.parse(await list.json())).toHaveLength(1);
    expect(JSON.stringify(await (await call('GET', '/api/invites')).json())).not.toContain(token);
  });

  it('zły, użyty, wygasły i unieważniony token dają ten sam komunikat', async () => {
    const used = await inviteKasiaToken();
    await call('POST', '/api/invites/accept', { token: used, password: 'moje-nowe-haslo' }, '');

    const revokedResponse = await invite({ kind: 'new_account', login: 'ola', name: 'Ola', role: 'child' });
    const revoked = createdInviteSchema.parse(await revokedResponse.json());
    expect((await call('DELETE', `/api/invites/${revoked.invite.id}`)).status).toBe(204);

    const expiredResponse = await invite({ kind: 'new_account', login: 'franek', name: 'Franek', role: 'child' });
    const expired = createdInviteSchema.parse(await expiredResponse.json()).token;
    clock += 24 * HOUR;

    for (const token of ['zmyslony-token', used, revoked.token, expired]) {
      for (const path of ['/api/invites/preview', '/api/invites/accept']) {
        const response = await call('POST', path, { token, password: 'moje-nowe-haslo' }, '');
        expect(response.status).toBe(404);
        expect(await response.json()).toEqual({ error: INVALID_INVITE_MESSAGE });
      }
    }
  });

  it('dwa równoczesne przyjęcia zakładają jedno konto', async () => {
    const token = await inviteKasiaToken();

    const responses = await Promise.all([
      call('POST', '/api/invites/accept', { token, password: 'pierwsze-haslo' }, ''),
      call('POST', '/api/invites/accept', { token, password: 'drugie-haslo-1' }, ''),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 404]);
    expect(accountsSchema.parse(await (await call('GET', '/api/users/accounts')).json()).filter((a) => a.login === 'zosia')).toHaveLength(1);
  });

  it('hasło musi spełniać regułę, a odrzucone nie zużywa zaproszenia', async () => {
    const token = await inviteKasiaToken();

    const weak = await call('POST', '/api/invites/accept', { token, password: 'zosia-2015' }, '');
    expect(weak.status).toBe(400);
    expect(await weak.json()).toEqual({ error: 'Hasło nie może zawierać loginu ani imienia' });
    expect((await call('POST', '/api/invites/accept', { token, password: 'moje-nowe-haslo' }, '')).status).toBe(201);
  });

  it('login jest zajęty od chwili zaproszenia, a zajęty przez konto odrzucony od razu', async () => {
    await inviteKasiaToken();

    const duplicate = await invite({ kind: 'new_account', login: 'zosia', name: 'Inna Zosia', role: 'child' });
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).error).toContain('czeka już zaproszenie');

    const taken = await invite({ kind: 'new_account', login: 'kasia', name: 'Kasia', role: 'child' });
    expect(taken.status).toBe(409);
    expect((await taken.json()).error).toContain('jest już zajęty');
  });

  it('najwyżej 5 oczekujących zaproszeń', async () => {
    for (const login of ['a1', 'a2', 'a3', 'a4', 'a5']) {
      expect((await invite({ kind: 'new_account', login, name: login, role: 'child' })).status).toBe(201);
    }
    const sixth = await invite({ kind: 'new_account', login: 'a6', name: 'a6', role: 'child' });
    expect(sixth.status).toBe(409);
    expect((await sixth.json()).error).toContain('najwyżej 5');

    clock += 25 * HOUR;
    expect((await invite({ kind: 'new_account', login: 'a6', name: 'a6', role: 'child' })).status).toBe(201);
  });

  it('najwyżej 10 aktywnych kont, licząc oczekujące zaproszenia', async () => {
    for (let i = 0; i < 6; i++) await createUser(db, { login: `osoba${i}`, name: `Osoba ${i}`, role: 'child', password: 'dlugie-haslo' });

    expect((await invite({ kind: 'new_account', login: 'dziewiec', name: 'Dziewięć', role: 'child' })).status).toBe(201);
    const eleventh = await invite({ kind: 'new_account', login: 'jedenascie', name: 'Jedenaście', role: 'child' });
    expect(eleventh.status).toBe(409);
    expect((await eleventh.json()).error).toContain('najwyżej 10');
  });

  it('wymaga hasła rodzica, a pomyłki liczą się do limitu logowania', async () => {
    const ip = { 'X-Real-IP': '203.0.113.7' };
    const missing = await call('POST', '/api/invites', { kind: 'new_account', login: 'zosia', name: 'Zosia', role: 'child' });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: 'Potwierdź swoim hasłem' });

    for (let i = 0; i < 5; i++) {
      const wrong = await call('POST', '/api/invites', { kind: 'new_account', login: 'zosia', name: 'Zosia', role: 'child', confirm: 'zle' }, mama, ip);
      expect(wrong.status).toBe(403);
    }
    expect((await call('POST', '/api/invites', { kind: 'new_account', login: 'zosia', name: 'Zosia', role: 'child', confirm: 'haslo-mamy-1' }, mama, ip)).status).toBe(429);
    expect(db.select().from(invites).all()).toHaveLength(0);
  });

  it('dziecko nie zaprasza, nie widzi zaproszeń, kont ani dziennika', async () => {
    expect((await invite({ kind: 'new_account', login: 'zosia', name: 'Zosia', role: 'child', confirm: 'haslo-dziecka' }, kasia)).status).toBe(403);
    expect((await call('GET', '/api/invites', undefined, kasia)).status).toBe(403);
    expect((await call('GET', '/api/users/accounts', undefined, kasia)).status).toBe(403);
    expect((await call('GET', '/api/auth/events', undefined, kasia)).status).toBe(403);
    expect((await call('PATCH', `/api/users/${findUserByLogin(db, 'kasia')!.id}`, { disabled: true, confirm: 'haslo-dziecka' }, kasia)).status).toBe(403);
  });

  it('limit złych tokenów na adres klienta', async () => {
    const ip = { 'X-Real-IP': '203.0.113.7' };
    for (let i = 0; i < 20; i++) await call('POST', '/api/invites/preview', { token: `zly-${i}` }, '', ip);
    const token = await inviteKasiaToken();

    expect((await call('POST', '/api/invites/preview', { token }, '', ip)).status).toBe(429);
    expect((await call('POST', '/api/invites/preview', { token }, '', { 'X-Real-IP': '198.51.100.1' })).status).toBe(200);
  });

  it('dziennik i push do rodziców po dodaniu konta', async () => {
    subscribe('mama');
    subscribe('tata');
    subscribe('kasia');
    const token = await inviteKasiaToken();
    await call('POST', '/api/invites/accept', { token, password: 'moje-nowe-haslo' }, '');

    const zosia = findUserByLogin(db, 'zosia')!;
    const mamaId = findUserByLogin(db, 'mama')!.id;
    expect(events().filter((event) => event.type !== 'login_ok')).toMatchObject([
      { type: 'invite_created', userId: null, actorId: mamaId, detail: 'new_account:zosia' },
      { type: 'account_created', userId: zosia.id, actorId: mamaId, detail: 'invite' },
      { type: 'invite_accepted', userId: zosia.id, detail: 'new_account' },
    ]);
    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent.map((item) => item.userId).sort()).toEqual([mamaId, findUserByLogin(db, 'tata')!.id].sort());
    expect(sent[0]?.payload.title).toBe('Dodano konto: Zosia');
  });
});

describe('link do nowego hasła', () => {
  async function resetLink(userId: string, cookie = mama) {
    const response = await invite({ kind: 'password_reset', userId }, cookie);
    expect(response.status).toBe(201);
    return createdInviteSchema.parse(await response.json());
  }

  it('ustawia nowe hasło, wylogowuje osobę wszędzie i loguje na tym telefonie', async () => {
    const kasiaId = findUserByLogin(db, 'kasia')!.id;
    const { token, invite: created } = await resetLink(kasiaId);
    expect(created).toMatchObject({ kind: 'password_reset', userId: kasiaId, name: 'Kasia', role: null });

    const preview = await call('POST', '/api/invites/preview', { token }, '');
    expect(invitePreviewSchema.parse(await preview.json())).toEqual({ kind: 'password_reset', name: 'Kasia', login: 'kasia' });

    const accepted = await call('POST', '/api/invites/accept', { token, password: 'nowe-haslo-123' }, '');
    expect(accepted.status).toBe(200);
    expect((await call('GET', '/api/auth/me', undefined, kasia)).status).toBe(401);
    expect((await call('POST', '/api/auth/login', { login: 'kasia', password: 'haslo-dziecka' }, '')).status).toBe(401);
    expect((await call('POST', '/api/auth/login', { login: 'kasia', password: 'nowe-haslo-123' }, '')).status).toBe(200);
  });

  it('rodzic wystawia link drugiemu rodzicowi, a rodzice dostają push bez osoby, której dotyczy', async () => {
    subscribe('mama');
    subscribe('tata');
    const tataId = findUserByLogin(db, 'tata')!.id;
    const { token } = await resetLink(tataId);
    await call('POST', '/api/invites/accept', { token, password: 'nowe-haslo-123' }, '');

    await vi.waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toMatchObject({ userId: findUserByLogin(db, 'mama')!.id, payload: { title: 'Nowe hasło: Tata' } });
    expect(events('password_reset')).toMatchObject([{ userId: tataId, actorId: findUserByLogin(db, 'mama')!.id, detail: 'invite' }]);
  });

  it('nowszy link unieważnia starszy dla tej samej osoby', async () => {
    const kasiaId = findUserByLogin(db, 'kasia')!.id;
    const first = await resetLink(kasiaId);
    const second = await resetLink(kasiaId);

    expect((await call('POST', '/api/invites/preview', { token: first.token }, '')).status).toBe(404);
    expect((await call('POST', '/api/invites/preview', { token: second.token }, '')).status).toBe(200);
    expect(events('invite_revoked')).toMatchObject([{ userId: kasiaId, detail: 'replaced' }]);
  });

  it('nie dla siebie, nie dla wyłączonego konta, a wyłączenie unieważnia wystawiony link', async () => {
    const self = await invite({ kind: 'password_reset', userId: findUserByLogin(db, 'mama')!.id });
    expect(self.status).toBe(400);

    const kasiaId = findUserByLogin(db, 'kasia')!.id;
    const { token } = await resetLink(kasiaId);
    await call('PATCH', `/api/users/${kasiaId}`, { disabled: true, confirm: 'haslo-mamy-1' });

    expect((await call('POST', '/api/invites/accept', { token, password: 'nowe-haslo-123' }, '')).status).toBe(404);
    expect((await invite({ kind: 'password_reset', userId: kasiaId })).status).toBe(400);
  });
});

describe('konta rodziny', () => {
  it('lista kont ze stanem, ostatnim logowaniem i użyciem, bez haseł', async () => {
    const response = await call('GET', '/api/users/accounts');

    const accounts = accountsSchema.parse(await response.json());
    expect(accounts.map((account) => account.login)).toEqual(['mama', 'tata', 'kasia']);
    expect(accounts[2]).toMatchObject({ role: 'child', disabled: false, lastLoginAt: new Date(clock).toISOString(), lastSeenAt: new Date(clock).toISOString() });
    expect(JSON.stringify(accounts)).not.toContain('scrypt');
  });

  it('rodzic wyłącza i włącza konto dziecka; wyłączone jest od razu wylogowane', async () => {
    const kasiaId = findUserByLogin(db, 'kasia')!.id;

    const disabled = await call('PATCH', `/api/users/${kasiaId}`, { disabled: true, confirm: 'haslo-mamy-1' });
    expect(disabled.status).toBe(200);
    expect((await disabled.json()).disabled).toBe(true);
    expect((await call('GET', '/api/auth/me', undefined, kasia)).status).toBe(401);

    const enabled = await call('PATCH', `/api/users/${kasiaId}`, { disabled: false, confirm: 'haslo-mamy-1' });
    expect((await enabled.json()).disabled).toBe(false);
    expect((await call('POST', '/api/auth/login', { login: 'kasia', password: 'haslo-dziecka' }, '')).status).toBe(200);
    expect(events().filter((event) => event.type.startsWith('account_')).map((event) => event.type)).toEqual(['account_disabled', 'account_enabled']);
  });

  it('wymaga hasła rodzica i nie wyłącza konta rodzica', async () => {
    const kasiaId = findUserByLogin(db, 'kasia')!.id;
    expect((await call('PATCH', `/api/users/${kasiaId}`, { disabled: true, confirm: 'zle' })).status).toBe(403);
    expect((await call('GET', '/api/auth/me', undefined, kasia)).status).toBe(200);

    const parent = await call('PATCH', `/api/users/${findUserByLogin(db, 'tata')!.id}`, { disabled: true, confirm: 'haslo-mamy-1' });
    expect(parent.status).toBe(403);
    expect(await parent.json()).toEqual({ error: 'Konto rodzica wyłącza się tylko na serwerze' });
    expect((await call('PATCH', '/api/users/00000000-0000-4000-8000-000000000000', { disabled: true, confirm: 'haslo-mamy-1' })).status).toBe(404);
  });
});

describe('dziennik logowań dla rodzica', () => {
  it('pokazuje ostatnie wpisy od najnowszego, z imionami', async () => {
    clock += 1000;
    await inviteKasiaToken();

    const list = authEventsSchema.parse(await (await call('GET', '/api/auth/events')).json());
    expect(list[0]).toMatchObject({ type: 'invite_created', actorName: 'Mama', name: null, detail: 'new_account:zosia' });
    expect(list.filter((event) => event.type === 'login_ok').map((event) => event.name)).toEqual(['Kasia', 'Tata', 'Mama']);
  });
});

describe('push o blokadzie konta', () => {
  it('rodzice dostają jedno powiadomienie na godzinę', async () => {
    subscribe('mama');
    subscribe('tata');
    for (let i = 0; i < 12; i++) await call('POST', '/api/auth/login', { login: 'kasia', password: 'zle' }, '', { 'X-Real-IP': `203.0.113.${Math.floor(i / 5)}` });

    await vi.waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[0]?.payload.title).toBe('Zablokowano logowanie: Kasia');
  });

  it('w ciszy nocnej nie wysyła', async () => {
    clock = Date.parse('2026-11-13T23:00:00Z');
    subscribe('mama');
    for (let i = 0; i < 5; i++) await call('POST', '/api/auth/login', { login: 'kasia', password: 'zle' }, '');

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(sent).toHaveLength(0);
    expect(events('locked')).toHaveLength(1);
  });
});

describe('tryb demo', () => {
  it('zaproszenia i zmiany kont odpowiadają 403', async () => {
    app = makeApp({ demo: true });
    const kasiaId = findUserByLogin(db, 'kasia')!.id;

    expect((await invite({ kind: 'new_account', login: 'zosia', name: 'Zosia', role: 'child' })).status).toBe(403);
    expect((await invite({ kind: 'password_reset', userId: kasiaId })).status).toBe(403);
    expect((await call('PATCH', `/api/users/${kasiaId}`, { disabled: true, confirm: 'haslo-mamy-1' })).status).toBe(403);
    expect((await call('POST', '/api/invites/accept', { token: 'cokolwiek', password: 'moje-nowe-haslo' }, '')).status).toBe(403);
    expect((await call('GET', '/api/invites')).status).toBe(200);
  });
});
