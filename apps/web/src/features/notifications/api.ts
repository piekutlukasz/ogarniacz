import {
  type NotificationPrefs,
  type PushConfig,
  type UpdateNotificationPrefs,
  type PushTestResult,
  notificationPrefsSchema,
  pushConfigSchema,
  pushDevicesSchema,
  pushTestResultSchema,
} from '@ogarniacz/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { jsonBody, request, requestNoContent } from '../../lib/http';

export const PUSH_CONFIG_KEY = ['push', 'config'];
export const PUSH_PREFS_KEY = ['push', 'prefs'];

/** Czy ta przeglądarka umie odbierać push. Na iPhonie dopiero po dodaniu aplikacji do ekranu głównego. */
export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent);
}

/** Aplikacja otwarta z ekranu głównego, a nie z karty przeglądarki. */
export function isInstalled(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
}

/** Zarejestrowany service worker albo `undefined`. Nie używamy `ready`: bez service workera (npm run dev) nigdy by się nie rozstrzygnęło. */
async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  return navigator.serviceWorker.getRegistration();
}

/** Klucz publiczny VAPID z serwera (base64url) w postaci wymaganej przez `subscribe`. */
function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  return (await registration())?.pushManager.getSubscription() ?? null;
}

function sendSubscription(subscription: PushSubscription) {
  return request(pushDevicesSchema, '/api/push/subscriptions', jsonBody('POST', subscription.toJSON()));
}

/** Prosi o zgodę (musi wynikać z kliknięcia) i zapisuje urządzenie na koncie. Zwraca `false`, gdy zgody nie dano. */
export async function enablePush(publicKey: string): Promise<boolean> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;
  const reg = await registration();
  if (!reg) throw new Error('Aplikacja nie jest jeszcze gotowa do powiadomień. Odśwież ją i spróbuj ponownie.');
  const subscription =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  await sendSubscription(subscription);
  return true;
}

/** Wyłącza powiadomienia na tym telefonie: serwer przestaje wysyłać, a przeglądarka zapomina subskrypcję. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await requestNoContent('/api/push/subscriptions', { ...jsonBody('POST', { endpoint: subscription.endpoint }), method: 'DELETE' });
  await subscription.unsubscribe();
}

/**
 * Przy wylogowaniu serwer zapomina ten telefon, żeby powiadomienia poprzedniej osoby nie trafiały do następnej.
 * Subskrypcja w przeglądarce zostaje, więc kolejna osoba włącza powiadomienia jednym przyciskiem. Błędy są ciche:
 * wylogowanie nie może na tym polec.
 */
export async function detachPushFromAccount(): Promise<void> {
  try {
    const subscription = await currentSubscription();
    if (!subscription) return;
    await requestNoContent('/api/push/subscriptions', { ...jsonBody('POST', { endpoint: subscription.endpoint }), method: 'DELETE' });
  } catch {
    // Brak sieci albo sesji: serwer sam usunie martwą subskrypcję przy najbliższej wysyłce.
  }
}

/** Odświeża zapis urządzenia po stronie serwera, np. gdy ta sama osoba wraca na telefon po wylogowaniu innej. */
export async function refreshSubscription(): Promise<void> {
  const subscription = await currentSubscription();
  if (subscription) await sendSubscription(subscription);
}

export function usePushConfig(enabled = true) {
  return useQuery({
    queryKey: PUSH_CONFIG_KEY,
    queryFn: (): Promise<PushConfig> => request(pushConfigSchema, '/api/push/config'),
    enabled,
  });
}

export function useNotificationPrefs(enabled = true) {
  return useQuery({
    queryKey: PUSH_PREFS_KEY,
    queryFn: (): Promise<NotificationPrefs> => request(notificationPrefsSchema, '/api/push/prefs'),
    enabled,
  });
}

export function useUpdateNotificationPrefs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: UpdateNotificationPrefs): Promise<NotificationPrefs> =>
      request(notificationPrefsSchema, '/api/push/prefs', { ...jsonBody('POST', change), method: 'PATCH' }),
    onSuccess: (prefs) => queryClient.setQueryData(PUSH_PREFS_KEY, prefs),
  });
}

export function sendTestNotification(): Promise<PushTestResult> {
  return request(pushTestResultSchema, '/api/push/test', { method: 'POST' });
}
