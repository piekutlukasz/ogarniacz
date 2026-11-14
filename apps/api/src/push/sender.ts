import webpush from 'web-push';

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; url: string; tag?: string };
/** Wynik jednej wysyłki. `statusCode` pochodzi z usługi push (Apple, Google, Mozilla); jego brak oznacza błąd sieci. */
export type PushResult = { ok: true } | { ok: false; statusCode?: number };
export type PushSend = (target: PushTarget, payload: PushPayload) => Promise<PushResult>;

/** Ustawienia powiadomień. Bez nich (brak kluczy VAPID, demo) powiadomienia są wyłączone. */
export type PushSettings = { publicKey: string; send: PushSend };

/**
 * Wysyłka idzie tylko do znanych usług push. Adres subskrypcji podaje klient, więc bez tej listy
 * serwer wysłałby żądanie pod dowolny adres wskazany przez zalogowaną osobę.
 */
const PUSH_SERVICE_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^(.+\.)?push\.apple\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^(.+\.)?notify\.windows\.com$/,
];

export function isKnownPushService(endpoint: string): boolean {
  try {
    const { protocol, hostname } = new URL(endpoint);
    return protocol === 'https:' && PUSH_SERVICE_HOSTS.some((host) => host.test(hostname));
  } catch {
    return false;
  }
}

/** Prawdziwa wysyłka Web Push z kluczami VAPID. Treść nigdy nie trafia do logu. */
export function createWebPushSettings(keys: { publicKey: string; privateKey: string; subject: string }): PushSettings {
  const vapidDetails = { subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey };
  return {
    publicKey: keys.publicKey,
    async send(target, payload) {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
          JSON.stringify(payload),
          // Przypomnienie spóźnione o pół dnia jest bezużyteczne, więc usługa push może je porzucić.
          { vapidDetails, TTL: 6 * 3600, urgency: 'normal', timeout: 10_000 },
        );
        return { ok: true };
      } catch (error) {
        const statusCode = (error as { statusCode?: unknown }).statusCode;
        return { ok: false, statusCode: typeof statusCode === 'number' ? statusCode : undefined };
      }
    },
  };
}
