import { afterEach, describe, expect, it } from 'vitest';
import { IcsFormatError, MAX_ITERATION_STEPS, dropOldEvents, parseIcs } from './ics';
import { resolveZone, zonedToInstant } from './zones';

/** 10 listopada 2026, 11:00 w Polsce. */
const NOW = new Date('2026-11-10T10:00:00Z');

function calendar(...events: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...events, 'END:VCALENDAR', ''].join('\r\n');
}

function event(uid: string, ...lines: string[]): string {
  return ['BEGIN:VEVENT', `UID:${uid}`, ...lines, 'END:VEVENT'].join('\r\n');
}

function parse(text: string, now = NOW) {
  return parseIcs(text, now);
}

function titles(text: string, now = NOW) {
  return parse(text, now).events.map((e) => `${e.startOn}${e.endOn === e.startOn ? '' : `..${e.endOn}`} ${e.title}`);
}

const originalZone = process.env.TZ;
afterEach(() => {
  if (originalZone === undefined) delete process.env.TZ;
  else process.env.TZ = originalZone;
});

describe('parseIcs: wydarzenia jednorazowe', () => {
  it('liczy godzinę w strefie polskiej i dzień w czasie polskim', () => {
    const { events } = parse(
      calendar(event('a', 'DTSTART;TZID=Europe/Warsaw:20261110T180000', 'DTEND;TZID=Europe/Warsaw:20261110T190000', 'SUMMARY:Basen', 'LOCATION:Pływalnia')),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ title: 'Basen', location: 'Pływalnia', allDay: false, startOn: '2026-11-10', endOn: '2026-11-10' });
    expect(events[0]?.startsAt?.toISOString()).toBe('2026-11-10T17:00:00.000Z');
    expect(events[0]?.endsAt?.toISOString()).toBe('2026-11-10T18:00:00.000Z');
  });

  it('czas UTC bywa w Polsce już następnego dnia', () => {
    const { events } = parse(calendar(event('a', 'DTSTART:20261110T223000Z', 'DTEND:20261110T233000Z', 'SUMMARY:Późno')));
    expect(events[0]).toMatchObject({ startOn: '2026-11-10', endOn: '2026-11-11' });
    const late = parse(calendar(event('b', 'DTSTART:20261110T233000Z', 'DTEND:20261111T003000Z', 'SUMMARY:Przez północ')));
    expect(late.events[0]).toMatchObject({ startOn: '2026-11-11', endOn: '2026-11-11' });
  });

  it('wydarzenie kończące się o północy nie wchodzi na następny dzień', () => {
    const { events } = parse(
      calendar(event('a', 'DTSTART;TZID=Europe/Warsaw:20261110T230000', 'DTEND;TZID=Europe/Warsaw:20261111T000000', 'SUMMARY:Do północy')),
    );
    expect(events[0]).toMatchObject({ startOn: '2026-11-10', endOn: '2026-11-10' });
  });

  it('wydarzenie bez końca ma ten sam początek i koniec', () => {
    const { events } = parse(calendar(event('a', 'DTSTART:20261110T200000Z', 'SUMMARY:Punkt')));
    expect(events[0]?.startsAt?.getTime()).toBe(events[0]?.endsAt?.getTime());
  });

  it('wydarzenie całodniowe i wielodniowe mają włączne dni, a koniec ICS jest wyłączny', () => {
    expect(
      titles(
        calendar(
          event('a', 'DTSTART;VALUE=DATE:20261110', 'DTEND;VALUE=DATE:20261111', 'SUMMARY:Jeden dzień'),
          event('b', 'DTSTART;VALUE=DATE:20261110', 'DTEND;VALUE=DATE:20261113', 'SUMMARY:Wycieczka'),
          event('c', 'DTSTART;VALUE=DATE:20261112', 'SUMMARY:Bez końca'),
        ),
      ),
    ).toEqual(['2026-11-10 Jeden dzień', '2026-11-10..2026-11-12 Wycieczka', '2026-11-12 Bez końca']);
    const { events } = parse(calendar(event('a', 'DTSTART;VALUE=DATE:20261110', 'DTEND;VALUE=DATE:20261111', 'SUMMARY:X')));
    expect(events[0]).toMatchObject({ allDay: true, startsAt: null, endsAt: null });
  });

  it('czas bez strefy liczy się w strefie polskiej, a X-WR-TIMEZONE ją zmienia', () => {
    const floating = event('a', 'DTSTART:20261110T080000', 'SUMMARY:Lokalne');
    expect(parse(calendar(floating)).events[0]?.startsAt?.toISOString()).toBe('2026-11-10T07:00:00.000Z');
    const london = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:x', 'X-WR-TIMEZONE:Europe/London', floating, 'END:VCALENDAR'].join('\r\n');
    expect(parse(london).events[0]?.startsAt?.toISOString()).toBe('2026-11-10T08:00:00.000Z');
  });

  it('strefa z nazwą Windows działa bez VTIMEZONE', () => {
    const { events, unknownZones } = parse(
      calendar(event('a', 'DTSTART;TZID=W. Europe Standard Time:20261111T090000', 'DTEND;TZID=W. Europe Standard Time:20261111T100000', 'SUMMARY:Outlook')),
    );
    expect(events[0]?.startsAt?.toISOString()).toBe('2026-11-11T08:00:00.000Z');
    expect(unknownZones).toBe(0);
  });

  it('nieznana strefa daje czas polski i jest liczona', () => {
    const { events, unknownZones } = parse(calendar(event('a', 'DTSTART;TZID=Mars/Olympus:20261111T090000', 'SUMMARY:Obca')));
    expect(events[0]?.startsAt?.toISOString()).toBe('2026-11-11T08:00:00.000Z');
    expect(unknownZones).toBe(1);
  });

  it('pomija wydarzenia poza oknem i odwołane', () => {
    expect(
      titles(
        calendar(
          event('stare', 'DTSTART:20250101T100000Z', 'DTEND:20250101T110000Z', 'SUMMARY:Stare'),
          event('dalekie', 'DTSTART:20270601T100000Z', 'DTEND:20270601T110000Z', 'SUMMARY:Dalekie'),
          event('odwolane', 'DTSTART:20261110T100000Z', 'DTEND:20261110T110000Z', 'STATUS:CANCELLED', 'SUMMARY:Odwołane'),
          event('wczoraj', 'DTSTART;VALUE=DATE:20261109', 'DTEND;VALUE=DATE:20261110', 'SUMMARY:Wczoraj'),
          event('trwa', 'DTSTART;VALUE=DATE:20261105', 'DTEND;VALUE=DATE:20261112', 'SUMMARY:Trwa'),
        ),
      ),
    ).toEqual(['2026-11-05..2026-11-11 Trwa', '2026-11-09 Wczoraj']);
  });

  it('czyści tytuł z niebezpiecznych znaków i go przycina', () => {
    const long = 'x'.repeat(500);
    const { events } = parse(
      calendar(event('a', 'DTSTART:20261110T100000Z', 'SUMMARY:<b>Alert</b>\\n‮odwrócony'), event('b', 'DTSTART:20261110T110000Z', `SUMMARY:${long}`), event('c', 'DTSTART:20261110T120000Z')),
    );
    expect(events[0]?.title).toBe('<b>Alert</b> odwrócony');
    expect(events[1]?.title).toHaveLength(200);
    expect(events[2]?.title).toBe('(bez tytułu)');
  });

  it('odrzuca plik, który nie jest kalendarzem', () => {
    expect(() => parse('<html><body>Zaloguj się</body></html>')).toThrow(IcsFormatError);
    expect(() => parse('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:zepsute\r\n')).toThrow(IcsFormatError);
  });

  it('pusty kalendarz jest poprawny', () => {
    expect(parse(calendar()).events).toEqual([]);
  });
});

describe('parseIcs: wydarzenia powtarzalne', () => {
  const warsaw = (value: string) => `;TZID=Europe/Warsaw:${value}`;

  it('seria tygodniowa z EXDATE, przesuniętym i odwołanym wystąpieniem', () => {
    const text = calendar(
      event(
        'seria',
        `DTSTART${warsaw('20261026T180000')}`,
        `DTEND${warsaw('20261026T190000')}`,
        'RRULE:FREQ=WEEKLY;BYDAY=MO',
        `EXDATE${warsaw('20261109T180000')}`,
        'SUMMARY:Basen',
      ),
      event('seria', `RECURRENCE-ID${warsaw('20261116T180000')}`, `DTSTART${warsaw('20261116T200000')}`, `DTEND${warsaw('20261116T210000')}`, 'SUMMARY:Basen (później)'),
      event('seria', `RECURRENCE-ID${warsaw('20261123T180000')}`, `DTSTART${warsaw('20261123T180000')}`, `DTEND${warsaw('20261123T190000')}`, 'STATUS:CANCELLED', 'SUMMARY:Odwołany'),
    );
    const { events } = parse(text);
    const starts = events.map((e) => `${e.startsAt?.toISOString()} ${e.title}`);
    expect(starts).toContain('2026-11-16T19:00:00.000Z Basen (później)');
    expect(starts.some((s) => s.startsWith('2026-11-09'))).toBe(false);
    expect(starts.some((s) => s.startsWith('2026-11-23'))).toBe(false);
    expect(starts).toContain('2026-11-30T17:00:00.000Z Basen');
    expect(starts).toContain('2026-12-07T17:00:00.000Z Basen');
  });

  it('wydarzenie 18:00 zostaje 18:00 po przejściu na czas zimowy i letni', () => {
    const text = calendar(event('d', `DTSTART${warsaw('20261020T180000')}`, `DTEND${warsaw('20261020T190000')}`, 'RRULE:FREQ=DAILY', 'SUMMARY:Codziennie'));
    const winter = parse(text, new Date('2026-10-24T10:00:00Z')).events;
    const hours = Object.fromEntries(winter.map((e) => [e.startOn, e.startsAt?.toISOString()]));
    expect(hours['2026-10-24']).toBe('2026-10-24T16:00:00.000Z');
    expect(hours['2026-10-26']).toBe('2026-10-26T17:00:00.000Z');
    const spring = calendar(event('d', `DTSTART${warsaw('20270320T180000')}`, `DTEND${warsaw('20270320T190000')}`, 'RRULE:FREQ=DAILY', 'SUMMARY:Codziennie'));
    const after = Object.fromEntries(parse(spring, new Date('2027-03-27T10:00:00Z')).events.map((e) => [e.startOn, e.startsAt?.toISOString()]));
    expect(after['2027-03-27']).toBe('2027-03-27T17:00:00.000Z');
    expect(after['2027-03-29']).toBe('2027-03-29T16:00:00.000Z');
  });

  it('seria z COUNT i UNTIL kończy się w porę', () => {
    const count = calendar(event('c', 'DTSTART;VALUE=DATE:20261109', 'RRULE:FREQ=DAILY;COUNT=3', 'SUMMARY:Trzy dni'));
    expect(titles(count)).toEqual(['2026-11-09 Trzy dni', '2026-11-10 Trzy dni', '2026-11-11 Trzy dni']);
    const until = calendar(event('u', 'DTSTART;VALUE=DATE:20261108', 'RRULE:FREQ=DAILY;UNTIL=20261110', 'SUMMARY:Do wtorku'));
    expect(titles(until)).toEqual(['2026-11-09 Do wtorku', '2026-11-10 Do wtorku']);
  });

  it('coroczne całodniowe wypada w tym samym dniu niezależnie od strefy', () => {
    const text = calendar(event('y', 'DTSTART;VALUE=DATE:20200315', 'RRULE:FREQ=YEARLY', 'SUMMARY:Urodziny'));
    expect(titles(text, new Date('2027-03-15T10:00:00Z'))).toEqual(['2027-03-15 Urodziny']);
  });

  it('seria bez końca sprzed lat dochodzi do dzisiejszego dnia', () => {
    const text = calendar(event('d', `DTSTART${warsaw('20200101T080000')}`, `DTEND${warsaw('20200101T083000')}`, 'RRULE:FREQ=DAILY', 'SUMMARY:Lekarstwo'));
    const { events, skippedSeries } = parse(text);
    expect(skippedSeries).toBe(0);
    expect(events.map((e) => e.startOn)).toContain('2026-11-10');
  });

  it('bomba FREQ=SECONDLY jest pomijana, a reszta kalendarza działa', () => {
    const text = calendar(
      event('bomba', 'DTSTART:20200101T000000Z', 'RRULE:FREQ=SECONDLY', 'SUMMARY:Bomba'),
      event('ok', 'DTSTART:20261110T100000Z', 'DTEND:20261110T110000Z', 'SUMMARY:Zwykłe'),
    );
    const result = parse(text);
    expect(result.skippedSeries).toBe(1);
    expect(result.events.map((e) => e.title)).toEqual(['Zwykłe']);
    expect(MAX_ITERATION_STEPS).toBeGreaterThan(5000);
  });

  it('wyjątek bez głównego wydarzenia jest zwykłym wydarzeniem', () => {
    const text = calendar(event('x', `RECURRENCE-ID${warsaw('20261111T100000')}`, `DTSTART${warsaw('20261111T120000')}`, `DTEND${warsaw('20261111T130000')}`, 'SUMMARY:Jedno wystąpienie'));
    expect(parse(text).events.map((e) => e.title)).toEqual(['Jedno wystąpienie']);
  });
});

describe('parseIcs: niezależność od strefy procesu', () => {
  const text = calendar(
    event('a', 'DTSTART;VALUE=DATE:20261110', 'DTEND;VALUE=DATE:20261112', 'SUMMARY:Całodniowe'),
    event('b', 'DTSTART:20261110T080000', 'SUMMARY:Bez strefy'),
    event('c', 'DTSTART;TZID=W. Europe Standard Time:20261111T090000', 'DTEND;TZID=W. Europe Standard Time:20261111T100000', 'SUMMARY:Windows'),
    event('d', 'DTSTART;TZID=Europe/Warsaw:20261026T180000', 'DTEND;TZID=Europe/Warsaw:20261026T190000', 'RRULE:FREQ=WEEKLY;BYDAY=MO', 'SUMMARY:Seria'),
    event('e', 'DTSTART;VALUE=DATE:20200101', 'RRULE:FREQ=YEARLY', 'SUMMARY:Nowy rok'),
  );

  it('daje identyczny wynik przy UTC, Warszawie i Los Angeles', () => {
    const results = ['UTC', 'Europe/Warsaw', 'America/Los_Angeles', 'Pacific/Kiritimati'].map((zone) => {
      process.env.TZ = zone;
      return JSON.stringify(parse(text).events);
    });
    expect(new Set(results).size).toBe(1);
    expect(JSON.parse(results[0] as string).length).toBeGreaterThan(4);
  });
});

describe('dropOldEvents', () => {
  it('usuwa stare wydarzenia jednorazowe, a zostawia serie i wyjątki', () => {
    const text = calendar(
      event('stare', 'DTSTART:20200101T100000Z', 'DTEND:20200101T110000Z'),
      event('seria', 'DTSTART:20200101T100000Z', 'RRULE:FREQ=DAILY'),
      event('wyjatek', 'RECURRENCE-ID:20200101T100000Z', 'DTSTART:20200101T100000Z'),
      event('nowe', 'DTSTART:20261110T100000Z'),
      event('wielodniowe', 'DTSTART;VALUE=DATE:20261101', 'DTEND;VALUE=DATE:20261112'),
    );
    const kept = dropOldEvents(text, '2026-11-09');
    expect(kept).not.toContain('UID:stare');
    for (const uid of ['seria', 'wyjatek', 'nowe', 'wielodniowe']) expect(kept).toContain(`UID:${uid}`);
  });
});

describe('strefy', () => {
  it('rozpoznaje nazwy IANA, Windows i z prefiksem', () => {
    expect(resolveZone('Europe/Warsaw')).toBe('Europe/Warsaw');
    expect(resolveZone('"Central European Standard Time"')).toBe('Europe/Warsaw');
    expect(resolveZone('/mozilla.org/20050126_1/Europe/Warsaw')).toBe('Europe/Warsaw');
    expect(resolveZone('Nie/Ma')).toBeNull();
  });

  it('zamienia czas ścienny na chwilę niezależnie od strefy procesu', () => {
    const wall = { year: 2026, month: 7, day: 1, hour: 12, minute: 0, second: 0 };
    expect(new Date(zonedToInstant(wall, 'Europe/Warsaw')).toISOString()).toBe('2026-07-01T10:00:00.000Z');
    expect(new Date(zonedToInstant({ ...wall, month: 1 }, 'Europe/Warsaw')).toISOString()).toBe('2026-01-01T11:00:00.000Z');
  });

  it('godzina z pominiętej doby zmiany czasu przesuwa się do przodu', () => {
    const gap = { year: 2027, month: 3, day: 28, hour: 2, minute: 30, second: 0 };
    expect(new Date(zonedToInstant(gap, 'Europe/Warsaw')).toISOString()).toBe('2027-03-28T01:30:00.000Z');
  });
});
