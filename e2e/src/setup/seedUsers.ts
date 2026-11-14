import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TEST_USERS, type TestUser } from '../data/users';

const API_DIR = fileURLToPath(new URL('../../../apps/api/', import.meta.url));
/** Ta sama baza, której używa serwer z `webServer` w playwright.config.ts. */
export const E2E_DATABASE_PATH = './data/e2e.db';

function cli(args: string[], input?: string): string {
  return execFileSync('node', ['--import', 'tsx', 'src/cli.ts', ...args], {
    cwd: API_DIR,
    env: { ...process.env, DATABASE_PATH: E2E_DATABASE_PATH },
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

/** Zakłada konta testowe albo przywraca ich hasła, jeśli zostały z poprzedniego uruchomienia. */
export function seedUsers(): void {
  const existing = cli(['user', 'list']).split('\n');
  for (const user of TEST_USERS) {
    if (existing.some((line) => line.startsWith(`${user.login}\t`))) {
      cli(['user', 'enable', user.login]);
      cli(['user', 'passwd', user.login, '--password-stdin'], user.password);
    } else {
      cli(['user', 'add', '--login', user.login, '--name', user.name, '--role', user.role, '--password-stdin'], user.password);
    }
  }
}

/**
 * Przywraca hasło konta z `TestUser` i kończy jego sesje. Dla testów, które zmieniają hasło: ponowna próba
 * po błędzie zaczyna wtedy od znanego stanu, a nie od hasła ustawionego przez poprzednią.
 */
export function resetUser(user: TestUser): void {
  cli(['user', 'enable', user.login]);
  cli(['user', 'passwd', user.login, '--password-stdin'], user.password);
}
