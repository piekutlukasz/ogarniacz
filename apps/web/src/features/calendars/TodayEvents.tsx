import { timeAgo, describeEventTime, hasEnded } from './format';
import { useTodayEvents } from './api';

/**
 * Wydarzenia z kalendarzy na dziś. Nie psuje ekranu „Dziś”: bez kalendarzy, bez sieci i przy błędzie sekcja po prostu
 * się nie pojawia. Przy starych danych albo błędzie kalendarza widać ostrzeżenie, a ostatnie wydarzenia zostają.
 */
export function TodayEvents() {
  const query = useTodayEvents();
  if (!query.data || query.data.sync.calendars === 0) return null;

  const { date, events, sync } = query.data;
  const nowMs = Date.now();
  const upToDate = sync.lastSuccessAt ? `Zsynchronizowano ${timeAgo(sync.lastSuccessAt, nowMs)}` : null;

  return (
    <section aria-labelledby="today-events" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="today-events" className="font-extrabold">
          Wydarzenia ({events.length})
        </h3>
        {upToDate && !sync.stale && <span className="text-xs text-ink/50">{upToDate}</span>}
      </div>

      {sync.stale && (
        <p role="status" className="rounded-xl bg-sun/40 px-3 py-2 text-sm font-semibold text-amber-900 dark:bg-sun/15 dark:text-sun">
          Dane z kalendarzy mogą być nieaktualne{sync.lastSuccessAt ? `. Ostatnia synchronizacja: ${timeAgo(sync.lastSuccessAt, nowMs)}` : ''}.
        </p>
      )}

      {events.length === 0 ? (
        <p className="rounded-2xl bg-card px-3 py-3 text-ink/60 shadow-card">Dziś nic nie ma w kalendarzu.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {events.map((event) => {
            const ended = hasEnded(event, nowMs);
            return (
              <li key={event.id} className={`flex items-start gap-3 rounded-2xl bg-card p-3 shadow-card ${ended ? 'opacity-55' : ''}`}>
                <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-brand" />
                <div className="min-w-0 flex-1">
                  <p className="leading-snug font-bold break-words">{event.title}</p>
                  <p className="mt-0.5 flex flex-wrap gap-x-2 text-[0.8125rem] text-ink/60">
                    <span className="font-semibold text-ink/75">{describeEventTime(event, date)}</span>
                    {event.location && <span className="break-words">{event.location}</span>}
                    <span>{event.calendarName}</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
