import { fileURLToPath } from 'node:url';
import type { UserRole } from '@ogarniacz/shared';

export type TestUser = {
  readonly login: string;
  readonly name: string;
  readonly role: UserRole;
  /** Hasła służą tylko testom i bazie e2e. Nie mogą zawierać loginu ani słów imienia (`passwordProblem` w shared). */
  readonly password: string;
};

/** Konta testowe zakładane w bazie e2e przez projekt `setup`. */
export const PARENT: TestUser = { login: 'e2e-rodzic', name: 'Rodzic E2E', role: 'parent', password: 'testowe-haslo-01' };
export const CHILD: TestUser = { login: 'e2e-dziecko', name: 'Dziecko E2E', role: 'child', password: 'testowe-haslo-02' };
/**
 * Dzieci na test koloru, po jednym na projekt. Kolor należy do konta, a projekty biegną naraz na jednej bazie,
 * więc wspólne `CHILD` miałoby kolor nadpisywany przez drugi telefon w trakcie testu.
 */
export const COLOR_CHILDREN: Readonly<Record<string, TestUser>> = {
  iphone: { login: 'e2e-dziecko-iphone', name: 'Dziecko iPhone E2E', role: 'child', password: 'testowe-haslo-03' },
  android: { login: 'e2e-dziecko-android', name: 'Dziecko Android E2E', role: 'child', password: 'testowe-haslo-04' },
};
/**
 * Konta do testów zmiany hasła i wylogowania innych urządzeń, po dwa na projekt. Te operacje kończą sesje konta,
 * więc nie wolno ich robić na wspólnych aktorach ani na koncie, którego używa drugi telefon w tym samym czasie.
 */
export const ACCOUNT_USERS: Readonly<Record<string, { readonly password: TestUser; readonly devices: TestUser }>> = {
  iphone: {
    password: { login: 'e2e-haslo-iphone', name: 'Zmiana Hasła iPhone', role: 'child', password: 'testowe-haslo-05' },
    devices: { login: 'e2e-urzadzenia-iphone', name: 'Urządzenia iPhone', role: 'child', password: 'testowe-haslo-06' },
  },
  android: {
    password: { login: 'e2e-haslo-android', name: 'Zmiana Hasła Android', role: 'child', password: 'testowe-haslo-07' },
    devices: { login: 'e2e-urzadzenia-android', name: 'Urządzenia Android', role: 'child', password: 'testowe-haslo-08' },
  },
};
/** Jedyne konto testu dymnego (`npm run test:smoke`), zakładane przez src/setup/smokeServer.mjs w jednorazowej bazie. */
export const SMOKE_USER: TestUser = { login: 'e2e-smoke', name: 'Smoke E2E', role: 'parent', password: 'testowe-haslo-09' };
/** Pierwszy rodzic zakładany kreatorem na serwerach testu dymnego z pustą bazą (smoke/setup.spec.ts). */
export const SETUP_PARENT: TestUser = { login: 'e2e-pierwszy', name: 'Pierwsza Mama', role: 'parent', password: 'testowe-haslo-31' };
/**
 * Konta przykładowe serwera demo (`DEMO_ACCOUNTS` i `DEMO_PASSWORD` w apps/api/src/demo.ts); wgrywa je sam serwer
 * testu dymnego w trybie demo. Hasło jest publiczne: to samo podaje instrukcja demo.
 */
export const DEMO_PARENT: TestUser = { login: 'tata', name: 'Tata', role: 'parent', password: 'demo-haslo' };
export const DEMO_SECOND_PARENT: TestUser = { login: 'mama', name: 'Mama', role: 'parent', password: 'demo-haslo' };
export const DEMO_CHILD: TestUser = { login: 'kasia', name: 'Kasia', role: 'child', password: 'demo-haslo' };
export const TEST_USERS: readonly TestUser[] = [
  PARENT,
  CHILD,
  ...Object.values(COLOR_CHILDREN),
  ...Object.values(ACCOUNT_USERS).flatMap(({ password, devices }) => [password, devices]),
];

const AUTH_DIR = fileURLToPath(new URL('../../.auth/', import.meta.url));

/** Plik z zapisaną sesją konta, który projekt `setup` tworzy, a fixture'y aktorów wczytują. */
export function storageStatePath(user: TestUser): string {
  return `${AUTH_DIR}${user.login}.json`;
}
