import type { CalendarEvent } from '@ogarniacz/shared';
import { describe, expect, it } from 'vitest';
import { describeEventTime, hasEnded, pluralEvents, timeAgo } from './format';

/** Wydarzenie 18 listopada 2026, 18:00–19:30 czasu polskiego; pola, których format nie czyta, są pominięte. */
function event(fields: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    allDay: false,
    startOn: '2026-11-18',
    endOn: '2026-11-18',
    startsAt: '2026-11-18T17:00:00.000Z',
    endsAt: '2026-11-18T18:30:00.000Z',
    ...fields,
  } as CalendarEvent;
}

describe('describeEventTime', () => {
  it('godziny w czasie polskim, także latem', () => {
    expect(describeEventTime(event(), '2026-11-18')).toBe('18:00–19:30');
    expect(describeEventTime(event({ startsAt: '2026-07-01T16:00:00.000Z', endsAt: '2026-07-01T16:00:00.000Z' }), '2026-07-01')).toBe(
      '18:00',
    );
  });

  it('cały dzień, jeden albo kilka dni', () => {
    const allDay = { allDay: true, startsAt: null, endsAt: null };
    expect(describeEventTime(event(allDay), '2026-11-18')).toBe('Cały dzień');
    expect(describeEventTime(event({ ...allDay, endOn: '2026-11-20' }), '2026-11-18')).toBe('Cały dzień, do 20 listopada');
  });

  it('wydarzenie przez noc: pierwszego dnia początek, następnych koniec', () => {
    const overnight = { endOn: '2026-11-19', endsAt: '2026-11-19T09:00:00.000Z' };
    expect(describeEventTime(event(overnight), '2026-11-18')).toBe('18:00, do 19 listopada');
    expect(describeEventTime(event({ ...overnight, startOn: '2026-11-17', startsAt: '2026-11-17T17:00:00.000Z' }), '2026-11-18')).toBe(
      'do 19 listopada, 10:00',
    );
  });
});

describe('hasEnded', () => {
  it('z godziną kończy się o czasie końca, całodniowe nie wygasa', () => {
    const end = Date.parse('2026-11-18T18:30:00.000Z');
    expect(hasEnded(event(), end - 1)).toBe(false);
    expect(hasEnded(event(), end)).toBe(true);
    expect(hasEnded(event({ allDay: true, startsAt: null, endsAt: null }), end + 86_400_000)).toBe(false);
  });
});

describe('timeAgo', () => {
  const now = Date.parse('2026-11-18T12:00:00.000Z');
  const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

  it.each([
    [0, 'przed chwilą'],
    [-5, 'przed chwilą'],
    [12, '12 min temu'],
    [59, '59 min temu'],
    [60, '1 godz. temu'],
    [23 * 60 + 59, '23 godz. temu'],
    [24 * 60, 'wczoraj'],
    [3 * 24 * 60, '3 dni temu'],
  ])('%i min → %s', (minutes, expected) => {
    expect(timeAgo(ago(minutes), now)).toBe(expected);
  });
});

describe('pluralEvents', () => {
  it.each([
    [1, '1 wydarzenie'],
    [3, '3 wydarzenia'],
    [5, '5 wydarzeń'],
    [13, '13 wydarzeń'],
    [23, '23 wydarzenia'],
  ])('%i → %s', (count, expected) => {
    expect(pluralEvents(count)).toBe(expected);
  });
});
