import { MORNING_HOURS, NOTIFICATION_KIND_LABELS, type NotificationKind } from '@ogarniacz/shared';
import { useEffect, useState } from 'react';
import { ErrorNote } from '../../lib/ErrorNote';
import {
  PUSH_CONFIG_KEY,
  currentSubscription,
  disablePush,
  enablePush,
  isInstalled,
  isIos,
  pushSupported,
  refreshSubscription,
  sendTestNotification,
  useNotificationPrefs,
  usePushConfig,
  useUpdateNotificationPrefs,
} from './api';
import { useQueryClient } from '@tanstack/react-query';

const KINDS: NotificationKind[] = ['morning', 'assigned', 'due'];
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
export type DeviceState = 'checking' | 'unsupported' | 'blocked' | 'off' | 'on';

const hourLabel = (hour: number) => `${hour}:00`;

export type PushDevice = {
  /** Fałsz, gdy serwer nie ma kluczy VAPID (np. demo): wtedy powiadomień w ustawieniach nie ma. */
  available: boolean;
  publicKey: string;
  device: DeviceState;
  setDevice: (device: DeviceState) => void;
};

/**
 * Stan powiadomień na tym telefonie. Liczony raz po otwarciu ustawień, bo menu pokazuje go obok pozycji,
 * a podstrona go zmienia.
 */
export function usePushDevice(open: boolean): PushDevice {
  const queryClient = useQueryClient();
  const config = usePushConfig(open);
  const available = config.data?.enabled === true;
  const [device, setDevice] = useState<DeviceState>('checking');

  useEffect(() => {
    if (!open || !available) return;
    let cancelled = false;
    (async () => {
      if (!pushSupported()) return setDevice('unsupported');
      if (Notification.permission === 'denied') return setDevice('blocked');
      const subscription = await currentSubscription().catch(() => null);
      if (cancelled) return;
      if (subscription && Notification.permission === 'granted') {
        setDevice('on');
        // Ten sam telefon mógł obsługiwać inną osobę: przypisujemy go do zalogowanej.
        refreshSubscription().then(() => queryClient.invalidateQueries({ queryKey: PUSH_CONFIG_KEY }), () => undefined);
      } else setDevice('off');
    })();
    return () => {
      cancelled = true;
    };
  }, [open, available, queryClient]);

  return { available, publicKey: config.data?.publicKey ?? '', device, setDevice };
}

/** Krótki stan do menu ustawień. */
export function pushDeviceSummary(device: DeviceState): string {
  return { checking: '', unsupported: 'Niedostępne', blocked: 'Zablokowane', off: 'Wyłączone', on: 'Włączone' }[device];
}

/**
 * Podstrona „Powiadomienia”. Zgodę wywołuje dopiero kliknięcie (wymóg iOS), a bez dodania aplikacji
 * do ekranu głównego iPhone w ogóle nie udostępnia push, więc zamiast przycisku pokazujemy instrukcję.
 */
export function NotificationsSection({ push }: { push: PushDevice }) {
  const queryClient = useQueryClient();
  const { device, setDevice } = push;
  const prefs = useNotificationPrefs(push.available);
  const updatePrefs = useUpdateNotificationPrefs();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      await action();
      await queryClient.invalidateQueries({ queryKey: PUSH_CONFIG_KEY });
    } catch (caught) {
      setError(caught instanceof Error ? caught : new Error('Błąd'));
    } finally {
      setBusy(false);
    }
  }

  const turnOn = () =>
    run(async () => {
      const granted = await enablePush(push.publicKey);
      setDevice(granted ? 'on' : Notification.permission === 'denied' ? 'blocked' : 'off');
    });
  const turnOff = () =>
    run(async () => {
      await disablePush();
      setDevice('off');
    });
  const test = () =>
    run(async () => {
      const result = await sendTestNotification();
      setTestResult(result.sent > 0 ? 'Wysłano. Powiadomienie powinno pojawić się za chwilę.' : 'Serwer nie dotarł do telefonu. Wyłącz powiadomienia i włącz je ponownie.');
    });

  const value = prefs.data;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink/55">Przypomnienia i poranne podsumowanie na ten telefon.</p>

      {device === 'unsupported' && (
        <p className="rounded-2xl bg-paper-deep px-4 py-3 text-sm text-ink/80">
          {isIos() && !isInstalled()
            ? 'Na iPhonie powiadomienia działają tylko z ekranu głównego. W Safari stuknij „Udostępnij”, potem „Do ekranu głównego”, otwórz Ogarniacza z nowej ikony i wróć tutaj.'
            : 'Ta przeglądarka nie obsługuje powiadomień. Spróbuj w Chrome albo Safari.'}
        </p>
      )}
      {device === 'blocked' && (
        <p className="rounded-2xl bg-paper-deep px-4 py-3 text-sm text-ink/80">
          Powiadomienia są zablokowane w ustawieniach telefonu. Zezwól na nie dla Ogarniacza i wróć tutaj.
        </p>
      )}
      {device === 'off' && (
        <button type="button" onClick={turnOn} disabled={busy} className="rounded-2xl bg-brand px-4 py-3 font-bold text-on-brand disabled:opacity-60">
          Włącz powiadomienia na tym telefonie
        </button>
      )}

      {device === 'on' && (
        <>
          <p className="text-sm font-semibold text-ink/80">Włączone na tym telefonie.</p>

          {value && (
            <>
              <ul className="flex flex-col gap-1">
                {KINDS.map((kind) => (
                  <li key={kind}>
                    <label className="flex items-center gap-3 rounded-2xl bg-paper-deep px-4 py-3">
                      <input
                        type="checkbox"
                        checked={value[kind]}
                        onChange={(event) => updatePrefs.mutate({ [kind]: event.target.checked })}
                        className="size-5 accent-brand"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{NOTIFICATION_KIND_LABELS[kind].title}</span>
                        <span className="block text-[0.8125rem] text-ink/55">{NOTIFICATION_KIND_LABELS[kind].hint}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>

              <div className="grid grid-cols-2 gap-2">
                <HourSelect label="Podsumowanie o" hours={[...MORNING_HOURS]} value={value.morningHour} onChange={(morningHour) => updatePrefs.mutate({ morningHour })} />
                <span />
                <HourSelect label="Cisza nocna od" hours={HOURS} value={value.quietFrom} onChange={(quietFrom) => updatePrefs.mutate({ quietFrom })} />
                <HourSelect label="Cisza nocna do" hours={HOURS} value={value.quietTo} onChange={(quietTo) => updatePrefs.mutate({ quietTo })} />
              </div>
              <p className="text-[0.8125rem] text-ink/55">W ciszy nocnej nie dostajesz przypomnień o nowych zadaniach. Poranne podsumowanie wychodzi o wybranej godzinie.</p>
            </>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={test} disabled={busy} className="rounded-xl bg-paper-deep px-4 py-2 text-sm font-bold disabled:opacity-60">
              Wyślij testowe powiadomienie
            </button>
            <button type="button" onClick={turnOff} disabled={busy} className="rounded-xl px-4 py-2 text-sm font-semibold text-ink/55 underline underline-offset-2 disabled:opacity-60">
              Wyłącz na tym telefonie
            </button>
          </div>
          {testResult && <p role="status" className="text-sm text-ink/80">{testResult}</p>}
        </>
      )}

      {(error || updatePrefs.isError) && <ErrorNote error={error ?? updatePrefs.error} />}
    </div>
  );
}

function HourSelect({ label, hours, value, onChange }: { label: string; hours: number[]; value: number; onChange: (hour: number) => void }) {
  return (
    <label className="flex flex-col gap-1 text-[0.8125rem] font-semibold text-ink/55">
      {label}
      <select
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="rounded-xl bg-paper-deep px-3 py-2 text-base font-bold text-ink"
      >
        {hours.map((hour) => (
          <option key={hour} value={hour}>
            {hourLabel(hour)}
          </option>
        ))}
      </select>
    </label>
  );
}
