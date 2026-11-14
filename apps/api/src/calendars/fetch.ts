import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { CalendarErrorCode } from '@ogarniacz/shared';

/** Błąd pobierania z kodem do zapisania przy kalendarzu. Treść nigdy nie zawiera adresu. */
export class CalendarError extends Error {
  constructor(readonly code: CalendarErrorCode) {
    super(code);
  }
}

/** Domyślnie obsługujemy Google Kalendarz i iCloud. Inne serwisy dopisuje administrator w `CALENDAR_ALLOWED_HOSTS`. */
export const DEFAULT_ALLOWED_HOSTS = ['calendar.google.com', '*.icloud.com'];
export const MAX_DOWNLOAD_BYTES = 5 * 1024 * 1024;
export const FETCH_TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

export type Resolver = (hostname: string) => Promise<string[]>;

export type FetchOptions = {
  allowedHosts: string[];
  /** Tylko do testów: pozwala na http i adresy lokalne. Konfiguracja nie przepuszcza tego na produkcji. */
  allowInsecure?: boolean;
  fetchImpl?: typeof fetch;
  resolve?: Resolver;
  timeoutMs?: number;
};

export type Fetched = { notModified: true } | { notModified: false; text: string; etag: string | null; lastModified: string | null };

function hostAllowed(url: URL, allowed: string[]): boolean {
  return allowed.some((entry) => {
    const pattern = entry.trim().toLowerCase();
    if (!pattern) return false;
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1);
      return url.hostname.endsWith(suffix) && url.hostname.length > suffix.length;
    }
    return url.hostname === pattern || url.host === pattern;
  });
}

/** Zamienia `webcal://` na `https://` i sprawdza, czy adres wolno pobierać. Zwraca adres do pobrania. */
export function checkCalendarUrl(input: string, options: Pick<FetchOptions, 'allowedHosts' | 'allowInsecure'>): URL {
  const text = input.trim().replace(/^webcal:\/\//i, 'https://');
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new CalendarError('format');
  }
  const protocols = options.allowInsecure ? ['https:', 'http:'] : ['https:'];
  if (!protocols.includes(url.protocol) || url.username || url.password) throw new CalendarError('blocked');
  if (!hostAllowed(url, options.allowedHosts)) throw new CalendarError('blocked');
  return url;
}

/** Host do pokazania w interfejsie. Reszta adresu jest tajna. */
export function hostOf(url: URL): string {
  return url.hostname;
}

function isPrivateAddress(address: string): boolean {
  const mapped = address.toLowerCase().replace(/^::ffff:/, '');
  if (isIP(mapped) === 4) {
    const [a, b] = mapped.split('.').map(Number) as [number, number];
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = mapped;
  return v6 === '::' || v6 === '::1' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe8') || v6.startsWith('fe9') || v6.startsWith('fea') || v6.startsWith('feb');
}

const defaultResolve: Resolver = async (hostname) => (await lookup(hostname, { all: true })).map((entry) => entry.address);

async function assertPublic(url: URL, options: FetchOptions) {
  if (options.allowInsecure) return;
  let addresses: string[];
  if (isIP(url.hostname.replace(/^\[|\]$/g, ''))) {
    addresses = [url.hostname.replace(/^\[|\]$/g, '')];
  } else {
    try {
      addresses = await (options.resolve ?? defaultResolve)(url.hostname);
    } catch {
      throw new CalendarError('network');
    }
  }
  if (addresses.length === 0) throw new CalendarError('network');
  if (addresses.some(isPrivateAddress)) throw new CalendarError('blocked');
}

function statusToError(status: number): CalendarError {
  if (status === 401 || status === 403) return new CalendarError('auth');
  if (status === 404 || status === 410) return new CalendarError('not_found');
  if (status === 429) return new CalendarError('rate_limited');
  return new CalendarError('network');
}

async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    // Liczymy bajty po rozpakowaniu, bo spakowana odpowiedź może być bombą.
    if (total > MAX_DOWNLOAD_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw new CalendarError('too_large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * Pobiera plik kalendarza. Przekierowania sprawdzamy ręcznie, każdy cel przechodzi te same kontrole co adres początkowy.
 * Każdy błąd zamienia się w `CalendarError`: komunikaty biblioteki sieciowej mogą zawierać adres, więc ich nie przekazujemy.
 */
export async function fetchCalendar(
  rawUrl: string,
  options: FetchOptions,
  conditional?: { etag?: string | null; lastModified?: string | null },
): Promise<Fetched> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = AbortSignal.timeout(options.timeoutMs ?? FETCH_TIMEOUT_MS);
  let url = checkCalendarUrl(rawUrl, options);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublic(url, options);
    const headers: Record<string, string> = {
      'User-Agent': 'Ogarniacz',
      Accept: 'text/calendar, text/plain;q=0.8, */*;q=0.5',
    };
    if (conditional?.etag) headers['If-None-Match'] = conditional.etag;
    if (conditional?.lastModified) headers['If-Modified-Since'] = conditional.lastModified;

    let response: Response;
    try {
      response = await fetchImpl(url, { headers, redirect: 'manual', signal });
    } catch {
      throw new CalendarError('network');
    }

    if (response.status === 304) return { notModified: true };
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      await response.body?.cancel().catch(() => undefined);
      if (!location) throw new CalendarError('network');
      let target: string;
      try {
        target = new URL(location, url).toString();
      } catch {
        throw new CalendarError('network');
      }
      url = checkCalendarUrl(target, options);
      continue;
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw statusToError(response.status);
    }
    try {
      const text = await readLimited(response);
      return { notModified: false, text, etag: response.headers.get('etag'), lastModified: response.headers.get('last-modified') };
    } catch (error) {
      if (error instanceof CalendarError) throw error;
      throw new CalendarError('network');
    }
  }
  throw new CalendarError('network');
}
