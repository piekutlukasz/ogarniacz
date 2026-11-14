import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

// Parametry scrypt: N=2^15, r=8, p=1 zużywa ok. 32 MB i trwa kilkadziesiąt milisekund.
// To wystarcza dla kilku kont i nie blokuje serwera przy logowaniu.
const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 32;
const MAX_MEMORY = 64 * 1024 * 1024;

function deriveKey(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, { N: n, r, p, maxmem: MAX_MEMORY }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, n, r, p, salt, hash] = stored.split('$');
  if (algorithm !== 'scrypt' || !n || !r || !p || !salt || !hash) {
    return false;
  }
  const expected = Buffer.from(hash, 'base64url');
  const key = await deriveKey(password, Buffer.from(salt, 'base64url'), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/**
 * Skrót do porównania, gdy loginu nie ma w bazie. Dzięki niemu odpowiedź trwa tyle samo
 * dla istniejącego i nieistniejącego konta, więc czas nie zdradza, które loginy są prawdziwe.
 */
let dummyHash: Promise<string> | undefined;

export function dummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}
