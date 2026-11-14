import type { CalendarEvent } from '@ogarniacz/shared';

const time = new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' });
const dayAndMonth = new Intl.DateTimeFormat('pl-PL', { timeZone: 'UTC', day: 'numeric', month: 'long' });

function formatDay(day: string): string {
  return dayAndMonth.format(new Date(`${day}T00:00:00Z`));
}

/** Podpis czasu wydarzenia w „Dziś”: godziny, „Cały dzień” albo informacja o końcu wydarzenia wielodniowego. */
export function describeEventTime(event: CalendarEvent, today: string): string {
  const spansDays = event.endOn > event.startOn;
  if (event.allDay) {
    return spansDays ? `Cały dzień, do ${formatDay(event.endOn)}` : 'Cały dzień';
  }
  if (!event.startsAt || !event.endsAt) return '';
  const start = time.format(new Date(event.startsAt));
  const end = time.format(new Date(event.endsAt));
  if (spansDays) {
    return event.startOn < today ? `do ${formatDay(event.endOn)}, ${end}` : `${start}, do ${formatDay(event.endOn)}`;
  }
  return event.endsAt === event.startsAt ? start : `${start}–${end}`;
}

/** Wydarzenie z godziną, które już się skończyło. Całodniowe do końca dnia nie wygasają. */
export function hasEnded(event: CalendarEvent, nowMs: number): boolean {
  return !event.allDay && event.endsAt !== null && Date.parse(event.endsAt) <= nowMs;
}

/** „przed chwilą”, „12 min temu”, „3 godz. temu”, „2 dni temu”. */
export function timeAgo(iso: string, nowMs: number): string {
  const minutes = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60_000));
  if (minutes < 1) return 'przed chwilą';
  if (minutes < 60) return `${minutes} min temu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} godz. temu`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'wczoraj' : `${days} dni temu`;
}

export function pluralEvents(count: number): string {
  if (count === 1) return '1 wydarzenie';
  const lastTwo = count % 100;
  const last = count % 10;
  return last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? `${count} wydarzenia` : `${count} wydarzeń`;
}
