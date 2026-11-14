import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

/** Klucza nie da się użyć albo szyfrogram nie pasuje do klucza. */
export class CalendarKeyError extends Error {}

/** Klucz to 32 bajty zapisane jako base64 (`openssl rand -base64 32`). */
export function parseEncryptionKey(value: string): Buffer {
  const key = Buffer.from(value.trim(), 'base64');
  if (key.length !== 32) throw new CalendarKeyError('CALENDAR_ENCRYPTION_KEY musi mieć 32 bajty w base64 (openssl rand -base64 32)');
  return key;
}

/**
 * Szyfruje link do kalendarza (AES-256-GCM). `aad` to identyfikator kalendarza: szyfrogramu nie da się
 * przenieść do innego wiersza. Format: `v1:<iv>:<tag>:<szyfrogram>`, wszystko w base64.
 */
export function encryptUrl(url: string, key: Buffer, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(aad));
  const data = Buffer.concat([cipher.update(url, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

export function decryptUrl(stored: string, key: Buffer, aad: string): string {
  const [version, iv, tag, data] = stored.split(':');
  if (version !== VERSION || !iv || !tag || !data) throw new CalendarKeyError('Nieznany format zapisanego linku');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    // Zły klucz albo zmieniony szyfrogram. Treść błędu nie jest potrzebna.
    throw new CalendarKeyError('Nie można odczytać zapisanego linku');
  }
}
