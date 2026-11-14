import { describe, expect, it } from 'vitest';
import { CalendarKeyError, decryptUrl, encryptUrl, parseEncryptionKey } from './crypto';
import { CalendarError, DEFAULT_ALLOWED_HOSTS, MAX_DOWNLOAD_BYTES, checkCalendarUrl, fetchCalendar } from './fetch';

const options = { allowedHosts: DEFAULT_ALLOWED_HOSTS, resolve: async () => ['142.250.1.1'] };
const GOOGLE = 'https://calendar.google.com/calendar/ical/abc/private-secret/basic.ics';

function respond(handler: (url: URL, call: number) => Response) {
  let call = 0;
  const seen: string[] = [];
  const fetchImpl = (async (input: URL | string) => {
    const url = new URL(String(input));
    seen.push(url.toString());
    call += 1;
    return handler(url, call);
  }) as unknown as typeof fetch;
  return { fetchImpl, seen };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof CalendarError) return error.code;
    throw error;
  }
  return 'ok';
}

describe('checkCalendarUrl', () => {
  it('zamienia webcal na https i przyjmuje Google oraz iCloud', () => {
    expect(checkCalendarUrl('webcal://p12-caldav.icloud.com/published/2/abc', options).toString()).toBe('https://p12-caldav.icloud.com/published/2/abc');
    expect(checkCalendarUrl(`  ${GOOGLE}  `, options).host).toBe('calendar.google.com');
  });

  it('odrzuca obce hosty, http, dane logowania i adresy lokalne', () => {
    for (const bad of ['https://example.com/a.ics', 'http://calendar.google.com/a.ics', 'https://user:pass@calendar.google.com/a.ics', 'https://127.0.0.1:3001/api/health', 'https://icloud.com.evil.example/a.ics', 'https://icloud.com/a.ics', 'file:///etc/passwd']) {
      expect(() => checkCalendarUrl(bad, options), bad).toThrow(CalendarError);
    }
    expect(() => checkCalendarUrl('to nie jest adres', options)).toThrow(CalendarError);
  });

  it('dodatkowy host z konfiguracji działa, w tym z portem', () => {
    const extended = { allowedHosts: [...DEFAULT_ALLOWED_HOSTS, 'outlook.office365.com', '127.0.0.1:5199'], allowInsecure: true };
    expect(checkCalendarUrl('https://outlook.office365.com/owa/calendar/x.ics', extended).hostname).toBe('outlook.office365.com');
    expect(checkCalendarUrl('http://127.0.0.1:5199/a.ics', extended).port).toBe('5199');
    expect(() => checkCalendarUrl('http://127.0.0.1:5200/a.ics', extended)).toThrow(CalendarError);
  });
});

describe('fetchCalendar', () => {
  it('pobiera treść i zapamiętuje ETag oraz Last-Modified', async () => {
    const { fetchImpl } = respond(() => new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR', { headers: { ETag: '"v1"', 'Last-Modified': 'Tue, 10 Nov 2026 10:00:00 GMT' } }));
    const result = await fetchCalendar(GOOGLE, { ...options, fetchImpl });
    expect(result).toMatchObject({ notModified: false, etag: '"v1"', lastModified: 'Tue, 10 Nov 2026 10:00:00 GMT' });
  });

  it('wysyła pytanie warunkowe i rozumie 304', async () => {
    let headers: Headers | undefined;
    const fetchImpl = (async (_url: unknown, init: RequestInit) => {
      headers = new Headers(init.headers);
      return new Response(null, { status: 304 });
    }) as unknown as typeof fetch;
    const result = await fetchCalendar(GOOGLE, { ...options, fetchImpl }, { etag: '"v1"', lastModified: 'x' });
    expect(result).toEqual({ notModified: true });
    expect(headers?.get('if-none-match')).toBe('"v1"');
    expect(headers?.get('user-agent')).toBe('Ogarniacz');
  });

  it('zamienia statusy HTTP na kody błędów', async () => {
    const cases: [number, string][] = [[401, 'auth'], [403, 'auth'], [404, 'not_found'], [410, 'not_found'], [429, 'rate_limited'], [500, 'network'], [503, 'network']];
    for (const [status, code] of cases) {
      const { fetchImpl } = respond(() => new Response('', { status }));
      expect(await codeOf(fetchCalendar(GOOGLE, { ...options, fetchImpl })), String(status)).toBe(code);
    }
  });

  it('błąd sieci nie ujawnia adresu', async () => {
    const fetchImpl = (async () => {
      throw new TypeError(`fetch failed for ${GOOGLE}`);
    }) as unknown as typeof fetch;
    const error = await fetchCalendar(GOOGLE, { ...options, fetchImpl }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(CalendarError);
    expect(JSON.stringify(error)).not.toContain('secret');
    expect(String((error as Error).message)).not.toContain('secret');
  });

  it('idzie za przekierowaniem na dozwolony host, ale nie na obcy ani lokalny', async () => {
    const ok = respond((url, call) => (call === 1 ? new Response(null, { status: 302, headers: { Location: 'https://p12-caldav.icloud.com/x.ics' } }) : new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR')));
    expect((await fetchCalendar(GOOGLE, { ...options, fetchImpl: ok.fetchImpl })).notModified).toBe(false);
    expect(ok.seen[1]).toBe('https://p12-caldav.icloud.com/x.ics');

    for (const target of ['https://example.com/x.ics', 'http://127.0.0.1:3001/api/health', 'https://169.254.169.254/latest/meta-data/']) {
      const bad = respond(() => new Response(null, { status: 302, headers: { Location: target } }));
      expect(await codeOf(fetchCalendar(GOOGLE, { ...options, fetchImpl: bad.fetchImpl })), target).toBe('blocked');
      expect(bad.seen).toHaveLength(1);
    }
  });

  it('przerywa pętlę przekierowań', async () => {
    const loop = respond(() => new Response(null, { status: 302, headers: { Location: GOOGLE } }));
    expect(await codeOf(fetchCalendar(GOOGLE, { ...options, fetchImpl: loop.fetchImpl }))).toBe('network');
    expect(loop.seen).toHaveLength(4);
  });

  it('odrzuca host rozwiązujący się na adres prywatny', async () => {
    const { fetchImpl, seen } = respond(() => new Response(''));
    for (const address of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1']) {
      expect(await codeOf(fetchCalendar(GOOGLE, { ...options, resolve: async () => ['142.250.1.1', address], fetchImpl })), address).toBe('blocked');
    }
    expect(seen).toHaveLength(0);
  });

  it('zbyt duża odpowiedź kończy się błędem, także po rozpakowaniu', async () => {
    const big = 'x'.repeat(MAX_DOWNLOAD_BYTES + 10);
    const { fetchImpl } = respond(() => new Response(big));
    expect(await codeOf(fetchCalendar(GOOGLE, { ...options, fetchImpl }))).toBe('too_large');
  });

  it('przekroczenie czasu to błąd sieci', async () => {
    const fetchImpl = ((_: unknown, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      })) as unknown as typeof fetch;
    expect(await codeOf(fetchCalendar(GOOGLE, { ...options, fetchImpl, timeoutMs: 20 }))).toBe('network');
  });

  it('w trybie testowym pozwala na lokalny http bez sprawdzania adresu', async () => {
    const { fetchImpl } = respond(() => new Response('BEGIN:VCALENDAR\r\nEND:VCALENDAR'));
    const result = await fetchCalendar('http://127.0.0.1:5199/a.ics', { allowedHosts: ['127.0.0.1:5199'], allowInsecure: true, fetchImpl });
    expect(result.notModified).toBe(false);
  });
});

describe('szyfrowanie linków', () => {
  const key = parseEncryptionKey(Buffer.alloc(32, 7).toString('base64'));

  it('odszyfrowuje to, co zaszyfrowało, a szyfrogram nie zawiera linku', () => {
    const stored = encryptUrl(GOOGLE, key, 'cal-1');
    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored).not.toContain('google');
    expect(decryptUrl(stored, key, 'cal-1')).toBe(GOOGLE);
    expect(encryptUrl(GOOGLE, key, 'cal-1')).not.toBe(stored);
  });

  it('nie odszyfruje innym kluczem, w innym wierszu ani po zmianie szyfrogramu', () => {
    const stored = encryptUrl(GOOGLE, key, 'cal-1');
    expect(() => decryptUrl(stored, parseEncryptionKey(Buffer.alloc(32, 9).toString('base64')), 'cal-1')).toThrow(CalendarKeyError);
    expect(() => decryptUrl(stored, key, 'cal-2')).toThrow(CalendarKeyError);
    expect(() => decryptUrl(`${stored.slice(0, -4)}AAAA`, key, 'cal-1')).toThrow(CalendarKeyError);
    expect(() => decryptUrl('nie-szyfrogram', key, 'cal-1')).toThrow(CalendarKeyError);
  });

  it('odrzuca klucz o złej długości', () => {
    expect(() => parseEncryptionKey('abc')).toThrow(CalendarKeyError);
  });
});
