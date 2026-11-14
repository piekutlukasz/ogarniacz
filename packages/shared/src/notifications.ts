import { z } from 'zod';

/** Rodzaje powiadomień, które osoba może włączyć albo wyłączyć. */
export const notificationKindSchema = z.enum(['morning', 'assigned', 'due']);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

/**
 * Rodzaj wpisu w dzienniku wysłanych powiadomień. `security` (nowe konto, nowe hasło, blokada logowania) dostają
 * wszyscy rodzice bez względu na ustawienia, bo zmiana kont nie może przejść po cichu.
 */
export type NotificationLogKind = NotificationKind | 'security';

export const NOTIFICATION_KIND_LABELS: Record<NotificationKind, { title: string; hint: string }> = {
  morning: { title: 'Poranne podsumowanie', hint: 'Raz dziennie: zadania na dziś, wydarzenia i zakupy.' },
  assigned: { title: 'Nowe zadanie dla mnie', hint: 'Gdy ktoś inny przypisze mi zadanie.' },
  due: { title: 'Termin jutro', hint: 'Wieczorem przed terminem moich otwartych zadań.' },
};

/** Godziny porannego podsumowania do wyboru. Domyślnie 7:00. */
export const MORNING_HOURS = [5, 6, 7, 8, 9, 10] as const;
export const DEFAULT_MORNING_HOUR = 7;
/** Przypomnienie o jutrzejszym terminie wychodzi o tej godzinie (czas polski). */
export const DUE_REMINDER_HOUR = 18;

const hourSchema = z.number().int().min(0).max(23);

/**
 * Ustawienia osoby. Cisza nocna to pełne godziny w czasie polskim: od `quietFrom` do `quietTo`, także przez północ.
 * Gdy obie są równe, ciszy nie ma. Poranne podsumowanie ignoruje ciszę, bo osoba sama wybiera jego godzinę.
 */
export const notificationPrefsSchema = z.object({
  morning: z.boolean(),
  assigned: z.boolean(),
  due: z.boolean(),
  morningHour: z.number().int().refine((hour) => (MORNING_HOURS as readonly number[]).includes(hour), 'Wybierz godzinę z listy'),
  quietFrom: hourSchema,
  quietTo: hourSchema,
});
export type NotificationPrefs = z.infer<typeof notificationPrefsSchema>;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  morning: true,
  assigned: true,
  due: true,
  morningHour: DEFAULT_MORNING_HOUR,
  quietFrom: 21,
  quietTo: 7,
};

export const updateNotificationPrefsSchema = notificationPrefsSchema.partial().refine((value) => Object.keys(value).length > 0, 'Podaj co najmniej jedno ustawienie');
export type UpdateNotificationPrefs = z.infer<typeof updateNotificationPrefsSchema>;

/** Czy godzina (0-23) wypada w ciszy nocnej. */
export function isQuietHour(hour: number, prefs: Pick<NotificationPrefs, 'quietFrom' | 'quietTo'>): boolean {
  const { quietFrom, quietTo } = prefs;
  if (quietFrom === quietTo) return false;
  return quietFrom < quietTo ? hour >= quietFrom && hour < quietTo : hour >= quietFrom || hour < quietTo;
}

/** Ekrany, które otwiera kliknięcie powiadomienia. Adres to `/?ekran=<nazwa>`. */
export const notificationScreenSchema = z.enum(['today', 'board', 'shopping']);
export type NotificationScreen = z.infer<typeof notificationScreenSchema>;

/** Klucze subskrypcji z `PushSubscription.toJSON()`. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

export const pushConfigSchema = z.object({
  /** Fałsz, gdy serwer nie ma kluczy VAPID albo działa jako demo. */
  enabled: z.boolean(),
  publicKey: z.string().nullable(),
  /** Liczba urządzeń zalogowanej osoby z włączonymi powiadomieniami. */
  devices: z.number().int(),
});
export type PushConfig = z.infer<typeof pushConfigSchema>;

export const unsubscribeSchema = z.object({ endpoint: z.url().max(1000) });

/** Odpowiedź po zapisie urządzenia: ile urządzeń osoby odbiera powiadomienia. */
export const pushDevicesSchema = z.object({ devices: z.number().int() });

/** Wynik testu: ile urządzeń przyjęło powiadomienie z liczby wszystkich osoby. */
export const pushTestResultSchema = z.object({ sent: z.number().int(), devices: z.number().int() });
export type PushTestResult = z.infer<typeof pushTestResultSchema>;
