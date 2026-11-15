import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { z } from 'zod';

const booleanFlag = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  /**
   * Adres nasłuchu. Domyślnie tylko lokalnie, bo ruch z internetu ma przechodzić przez proxy (nginx), które ustawia
   * nagłówki z adresem klienta i hosta. W kontenerze Dockera `0.0.0.0`: port wystawia dopiero mapowanie portów.
   */
  HOST: z.string().min(1).default('127.0.0.1'),
  DATABASE_PATH: z.string().min(1).default('./data/ogarniacz.db'),
  MIGRATIONS_DIR: z.string().min(1).default('./drizzle'),
  PUBLIC_DIR: z.string().min(1).default('./public'),
  /** Domyślnie włączone w produkcji. Lokalnie serwer działa po http, a cookie Secure by nie działało. */
  COOKIE_SECURE: booleanFlag.optional(),
  /** Domyślnie katalog `backups` obok bazy. */
  BACKUP_DIR: z.string().min(1).optional(),
  BACKUP_KEEP_DAYS: z.coerce.number().int().min(1).default(14),
  /** Cel rclone dla kopii poza serwerem, np. `ogarniacz-backup:`. Bez niego kopie zostają tylko lokalnie. */
  BACKUP_REMOTE: z.string().min(1).optional(),
  BACKUP_REMOTE_KEEP_DAYS: z.coerce.number().int().min(1).default(60),
  /** Tryb demo: dane przykładowe, reset co godzinę, logowanie jednym przyciskiem, bez kopii zapasowych. */
  DEMO_MODE: booleanFlag.default(false),
  /** Nagłówek z adresem klienta, którego ufamy przy limicie prób logowania (ustawia go proxy, np. nginx). */
  CLIENT_IP_HEADER: z.string().min(1).default('X-Real-IP'),
  RCLONE_PATH: z.string().min(1).default('rclone'),
  /** Klucz szyfrujący linki do kalendarzy: 32 bajty w base64 (`openssl rand -base64 32`). Bez niego kalendarze są wyłączone. */
  CALENDAR_ENCRYPTION_KEY: z.string().min(1).optional(),
  /** Dodatkowe hosty kalendarzy po przecinku, np. `outlook.office365.com`. Domyślnie tylko Google i iCloud. */
  CALENDAR_ALLOWED_HOSTS: z.string().optional(),
  /** Klucze VAPID powiadomień push (`npm run vapid -w @ogarniacz/api`). Muszą być stałe: zmiana unieważnia wszystkie subskrypcje. Bez nich powiadomienia są wyłączone. */
  VAPID_PUBLIC_KEY: z.string().min(80).optional(),
  VAPID_PRIVATE_KEY: z.string().min(40).optional(),
  /** Kontakt do administratora dla usług push: `mailto:adres` albo `https://domena`. */
  VAPID_SUBJECT: z.string().regex(/^(mailto:.+@.+|https:\/\/.+)$/, 'VAPID_SUBJECT: mailto:adres albo https://domena').optional(),
  /** Tylko do testów e2e: http i adresy lokalne. Na produkcji start jest odrzucany. */
  CALENDAR_ALLOW_HTTP: booleanFlag.default(false),
  /** Tylko do testów e2e: nagłówek `X-Test-Now` przesuwa zegar serwera dla jednego żądania. Na produkcji start jest odrzucany. */
  TEST_CLOCK: booleanFlag.default(false),
});

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig() {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  const env = envSchema.parse(process.env);
  if (env.CALENDAR_ALLOW_HTTP && env.NODE_ENV === 'production') {
    throw new Error('CALENDAR_ALLOW_HTTP jest tylko do testów i nie może być włączone na produkcji');
  }
  if (env.TEST_CLOCK && env.NODE_ENV === 'production') {
    throw new Error('TEST_CLOCK jest tylko do testów i nie może być włączone na produkcji');
  }
  return {
    ...env,
    COOKIE_SECURE: env.COOKIE_SECURE ?? env.NODE_ENV === 'production',
    BACKUP_DIR: env.BACKUP_DIR ?? join(dirname(env.DATABASE_PATH), 'backups'),
  };
}
