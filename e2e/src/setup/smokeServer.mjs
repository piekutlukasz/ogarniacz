// Serwer testu dymnego (T1): zbudowana aplikacja tak jak na produkcji (`node dist/index.cjs`, front z apps/api/public),
// na jednorazowej bazie w katalogu tymczasowym, z jednym kontem testowym. Wymaga wcześniejszego `npm run build`.
// Z `SMOKE_DEMO=true` (T7) to samo, ale w trybie demo: bez konta testowego, bo serwer sam wgrywa dane przykładowe.
// Z `SMOKE_EMPTY=true` (kreator pierwszego uruchomienia) baza zostaje pusta, a kod z logu serwera trafia do pliku
// z `setupCode.mjs`, skąd czyta go scenariusz.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETUP_CODE_LINE, setupCodeFile } from './setupCode.mjs';

const apiDir = fileURLToPath(new URL('../../../apps/api/', import.meta.url));
const port = process.env.SMOKE_PORT ?? '3090';
const demo = process.env.SMOKE_DEMO === 'true';
const empty = process.env.SMOKE_EMPTY === 'true';
const codeFile = setupCodeFile(port);
// To samo konto co SMOKE_USER w src/data/users.ts.
const user = { login: 'e2e-smoke', name: 'Smoke E2E', password: 'testowe-haslo-09' };

if (!existsSync(join(apiDir, 'dist', 'index.cjs')) || !existsSync(join(apiDir, 'public', 'index.html'))) {
  console.error('Test dymny wymaga zbudowanej aplikacji: najpierw npm run build.');
  process.exit(1);
}

const dataDir = mkdtempSync(join(tmpdir(), demo ? 'ogarniacz-smoke-demo-' : empty ? 'ogarniacz-smoke-empty-' : 'ogarniacz-smoke-'));
const env = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: port,
  DATABASE_PATH: join(dataDir, 'smoke.db'),
  BACKUP_DIR: join(dataDir, 'backups'),
  // Serwer działa po http, a cookie Secure by nie zadziałało.
  COOKIE_SECURE: 'false',
};
for (const key of ['BACKUP_REMOTE', 'DEMO_MODE', 'CALENDAR_ENCRYPTION_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']) {
  delete env[key];
}
if (demo) env.DEMO_MODE = 'true';

const cleanup = () => {
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(codeFile, { force: true });
};
// Kod z poprzedniego, przerwanego przebiegu nie może zmylić scenariusza.
rmSync(codeFile, { force: true });

if (!demo && !empty) {
  const seed = spawnSync(
    process.execPath,
    ['dist/cli.cjs', 'user', 'add', '--login', user.login, '--name', user.name, '--role', 'parent', '--password-stdin'],
    { cwd: apiDir, env, input: `${user.password}\n`, stdio: ['pipe', 'inherit', 'inherit'] },
  );
  if (seed.status !== 0) {
    cleanup();
    process.exit(seed.status ?? 1);
  }
}

const server = spawn(process.execPath, ['dist/index.cjs'], { cwd: apiDir, env, stdio: ['ignore', 'pipe', 'inherit'] });
// Wyjście serwera idzie dalej do konsoli; przy pustej bazie wyłuskujemy z niego kod pierwszego uruchomienia.
server.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  const code = empty ? SETUP_CODE_LINE.exec(chunk.toString())?.[1] : undefined;
  if (code) writeFileSync(codeFile, code);
});
server.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 0);
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
