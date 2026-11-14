/**
 * Limit nieudanych prób logowania, trzymany w pamięci. Wystarcza, bo aplikacja ma dokładnie
 * jeden proces. Restart serwera zeruje liczniki, co przy tej skali nie jest problemem.
 *
 * Trzy liczniki (docs/archiwum/UTWARDZENIE-PRZEGLAD.md, B1):
 * - `pair`: login z jednego adresu. Właściwa blokada: obcy, który zgaduje hasło, blokuje tylko siebie,
 *   a domownik loguje się dalej ze swojego telefonu.
 * - `ip`: jeden adres zgadujący wiele loginów.
 * - `login`: bezpiecznik przed zgadywaniem jednego loginu z wielu adresów, z dużo wyższym progiem.
 */
export type LoginLimiter = ReturnType<typeof createLoginLimiter>;

/** Zakres blokady; trafia też do dziennika logowań. */
export type LimitScope = 'pair' | 'ip' | 'login';

type Rule = { limit: number; windowMs: number };
type Window = { failures: number; startedAt: number };

const MINUTE = 60 * 1000;

/**
 * Klucz adresu dla limitów. IPv6 grupujemy po prefiksie /64, bo jeden abonent dostaje całą pulę
 * i bez tego zmieniałby adres przy każdej próbie. IPv4 zapisany jako IPv6 (`::ffff:1.2.3.4`) wraca do IPv4.
 */
export function ipGroup(ip: string): string {
  const address = ip.trim().toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(address);
  if (mapped?.[1]) return mapped[1];
  if (!address.includes(':')) return address;

  const [head = '', tail] = address.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const missing = tail === undefined ? 0 : 8 - headGroups.length - tailGroups.length;
  const groups = [...headGroups, ...Array<string>(Math.max(missing, 0)).fill('0'), ...tailGroups];
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

export function createLoginLimiter({
  perPair = 5,
  perIp = 20,
  perLogin = 100,
  pairWindowMs = 15 * MINUTE,
  ipWindowMs = 15 * MINUTE,
  loginWindowMs = 60 * MINUTE,
}: {
  perPair?: number;
  perIp?: number;
  perLogin?: number;
  pairWindowMs?: number;
  ipWindowMs?: number;
  loginWindowMs?: number;
} = {}) {
  const rules: Record<LimitScope, Rule> = {
    pair: { limit: perPair, windowMs: pairWindowMs },
    ip: { limit: perIp, windowMs: ipWindowMs },
    login: { limit: perLogin, windowMs: loginWindowMs },
  };
  const windows = new Map<string, Window>();

  function pairKey(login: string, ip: string | undefined) {
    return `pair:${login}|${ip ? ipGroup(ip) : '-'}`;
  }

  /** Klucze liczników dla próby. Bez znanego adresu para to sam login, a limitu na adres nie ma, żeby obcy nie zablokowali wszystkich naraz. */
  function keys(login: string, ip: string | undefined): [LimitScope, string][] {
    const group = ip ? ipGroup(ip) : undefined;
    const result: [LimitScope, string][] = [
      ['pair', pairKey(login, ip)],
      ['login', `login:${login}`],
    ];
    if (group) result.push(['ip', `ip:${group}`]);
    return result;
  }

  function current(scope: LimitScope, key: string, now: number): Window | undefined {
    const window = windows.get(key);
    if (window && now - window.startedAt >= rules[scope].windowMs) {
      windows.delete(key);
      return undefined;
    }
    return window;
  }

  return {
    /** Ile sekund trzeba odczekać, albo 0, gdy próba jest dozwolona. */
    retryAfterSeconds(login: string, ip: string | undefined, now = Date.now()): number {
      let wait = 0;
      for (const [scope, key] of keys(login, ip)) {
        const window = current(scope, key, now);
        if (window && window.failures >= rules[scope].limit) {
          wait = Math.max(wait, Math.ceil((window.startedAt + rules[scope].windowMs - now) / 1000));
        }
      }
      return wait;
    },
    /** Zapisuje nieudaną próbę i zwraca zakresy, które właśnie osiągnęły limit (blokada zaczyna się teraz). */
    recordFailure(login: string, ip: string | undefined, now = Date.now()): LimitScope[] {
      const locked: LimitScope[] = [];
      for (const [scope, key] of keys(login, ip)) {
        const window = current(scope, key, now);
        if (window) window.failures += 1;
        else windows.set(key, { failures: 1, startedAt: now });
        if ((window?.failures ?? 1) === rules[scope].limit) locked.push(scope);
      }
      return locked;
    },
    /** Udane logowanie zeruje tylko licznik pary: bezpiecznik na login i limit na adres liczą dalej. */
    recordSuccess(login: string, ip: string | undefined) {
      windows.delete(pairKey(login, ip));
    },
  };
}

/**
 * Prosty limit nieudanych prób na adres klienta, np. złych tokenów zaproszeń na trasach publicznych.
 * Token ma 256 bitów, więc zgadywanie i tak nie ma szans; limit chroni przed zasypywaniem serwera żądaniami.
 */
export function createAttemptLimiter({ limit = 20, windowMs = 15 * MINUTE }: { limit?: number; windowMs?: number } = {}) {
  const windows = new Map<string, Window>();
  const key = (ip: string | undefined) => (ip ? ipGroup(ip) : '-');

  function current(ip: string | undefined, now: number): Window | undefined {
    const window = windows.get(key(ip));
    if (window && now - window.startedAt >= windowMs) {
      windows.delete(key(ip));
      return undefined;
    }
    return window;
  }

  return {
    retryAfterSeconds(ip: string | undefined, now = Date.now()): number {
      const window = current(ip, now);
      return window && window.failures >= limit ? Math.ceil((window.startedAt + windowMs - now) / 1000) : 0;
    },
    recordFailure(ip: string | undefined, now = Date.now()) {
      const window = current(ip, now);
      if (window) window.failures += 1;
      else windows.set(key(ip), { failures: 1, startedAt: now });
    },
  };
}
export type AttemptLimiter = ReturnType<typeof createAttemptLimiter>;
