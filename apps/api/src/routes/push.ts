import { randomUUID } from 'node:crypto';
import { validate } from '../validate';
import {
  type NotificationPrefs,
  type PushConfig,
  pushSubscriptionSchema,
  unsubscribeSchema,
  updateNotificationPrefsSchema,
} from '@ogarniacz/shared';
import { and, count, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import type { AppEnv } from '../auth/middleware';
import type { Db } from '../db/client';
import { pushSubscriptions } from '../db/schema';
import { getPrefs, savePrefs } from '../push/notify';
import { type PushSettings, isKnownPushService } from '../push/sender';

/** Jedna osoba ma najwyżej tyle urządzeń. Z limitem zły klient nie zapcha tabeli. */
const MAX_DEVICES_PER_USER = 10;
const TEST_GAP_MS = 15_000;

type Options = { db: Db; now: () => Date; push?: PushSettings };

/** Subskrypcje urządzeń i ustawienia powiadomień zalogowanej osoby. Każdy zarządza tylko własnymi. */
export function pushRoutes({ db, now, push }: Options) {
  const lastTest = new Map<string, number>();
  const deviceCount = (userId: string) =>
    db.select({ total: count() }).from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId)).get()?.total ?? 0;

  return new Hono<AppEnv>()
    .get('/config', (c) => {
      const body: PushConfig = { enabled: push !== undefined, publicKey: push?.publicKey ?? null, devices: deviceCount(c.get('user').id) };
      return c.json(body);
    })
    .post('/subscriptions', validate('json', pushSubscriptionSchema), (c) => {
      if (!push) return c.json({ error: 'Powiadomienia nie są włączone na serwerze' }, 503);
      const { endpoint, keys } = c.req.valid('json');
      const user = c.get('user');
      if (!isKnownPushService(endpoint)) return c.json({ error: 'Ta przeglądarka używa nieobsługiwanej usługi powiadomień' }, 400);

      const existing = db.select().from(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint)).get();
      if (!existing && deviceCount(user.id) >= MAX_DEVICES_PER_USER) {
        return c.json({ error: 'Za dużo urządzeń z powiadomieniami. Wyłącz je na starych telefonach.' }, 429);
      }
      const values = { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, userAgent: (c.req.header('User-Agent') ?? '').slice(0, 300), lastError: null, failures: 0 };
      // Ten sam telefon po zmianie konta przechodzi na nową osobę: endpoint jest unikalny.
      if (existing) db.update(pushSubscriptions).set(values).where(eq(pushSubscriptions.id, existing.id)).run();
      else db.insert(pushSubscriptions).values({ id: randomUUID(), endpoint, createdAt: now(), ...values }).run();
      return c.json({ devices: deviceCount(user.id) }, existing ? 200 : 201);
    })
    .delete('/subscriptions', validate('json', unsubscribeSchema), (c) => {
      const user = c.get('user');
      db.delete(pushSubscriptions)
        .where(and(eq(pushSubscriptions.endpoint, c.req.valid('json').endpoint), eq(pushSubscriptions.userId, user.id)))
        .run();
      return c.body(null, 204);
    })
    .get('/prefs', (c) => c.json(getPrefs(db, c.get('user').id)))
    .patch('/prefs', validate('json', updateNotificationPrefsSchema), (c) => {
      const user = c.get('user');
      const next: NotificationPrefs = { ...getPrefs(db, user.id), ...c.req.valid('json') };
      savePrefs(db, user.id, next);
      return c.json(next);
    })
    .post('/test', async (c) => {
      if (!push) return c.json({ error: 'Powiadomienia nie są włączone na serwerze' }, 503);
      const user = c.get('user');
      const at = now().getTime();
      if (at - (lastTest.get(user.id) ?? 0) < TEST_GAP_MS) return c.json({ error: 'Odczekaj chwilę przed kolejnym testem' }, 429);

      const devices = db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, user.id)).all();
      if (devices.length === 0) return c.json({ error: 'Najpierw włącz powiadomienia na tym telefonie' }, 400);
      lastTest.set(user.id, at);
      const results = await Promise.all(
        devices.map((device) => push.send(device, { title: 'Ogarniacz', body: `Powiadomienia działają, ${user.name}.`, url: '/', tag: 'test' })),
      );
      // Martwych subskrypcji nie usuwamy tutaj: robi to wysyłka właściwa. Test tylko mówi, ile urządzeń odpowiedziało.
      return c.json({ sent: results.filter((result) => result.ok).length, devices: devices.length });
    });
}
