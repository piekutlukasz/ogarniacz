// Lokalne demo: buduje aplikację, zakłada jednorazową bazę z przykładowymi danymi i uruchamia serwer.
// Użycie: npm run demo [-- --no-build]. Port z PORT (domyślnie 3000). Baza znika po zatrzymaniu (Ctrl+C).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = join(root, 'apps', 'api');
const skipBuild = process.argv.includes('--no-build');
const port = process.env.PORT ?? '3000';

const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 12)) {
  console.error(`Demo wymaga Node.js 22.12 lub nowszego, uruchomiono ${process.version}.`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32', ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// npm zapisuje node_modules/.package-lock.json przy każdej instalacji. Gdy lockfile jest nowszy
// (albo instalacji nie było), zależności są przestarzałe i build zgłosiłby brak modułu.
const installed = join(root, 'node_modules', '.package-lock.json');
if (!existsSync(installed) || statSync(installed).mtimeMs < statSync(join(root, 'package-lock.json')).mtimeMs) {
  console.log('Instaluję zależności (npm ci)…');
  run('npm', ['ci'], { cwd: root });
}

const built = existsSync(join(apiDir, 'dist', 'index.cjs')) && existsSync(join(apiDir, 'public', 'index.html'));
if (skipBuild && !built) {
  console.error('Nie ma builda. Uruchom npm run demo bez --no-build.');
  process.exit(1);
}
if (!skipBuild) {
  console.log('Buduję aplikację…');
  run('npm', ['run', 'build'], { cwd: root });
}

// Baza i kopie leżą w katalogu tymczasowym, więc demo nie dotyka lokalnych danych deweloperskich.
const dataDir = mkdtempSync(join(tmpdir(), 'ogarniacz-demo-'));
const env = {
  ...process.env,
  PORT: port,
  DATABASE_PATH: join(dataDir, 'demo.db'),
  BACKUP_DIR: join(dataDir, 'backups'),
  // Serwer działa po http, a cookie Secure nie zadziałałoby.
  COOKIE_SECURE: 'false',
  // Tryb demo: przyciski wejścia na konta, baner i reset danych co godzinę.
  DEMO_MODE: 'true',
};
delete env.BACKUP_REMOTE;

function cleanup() {
  rmSync(dataDir, { recursive: true, force: true });
}

const seed = spawnSync(process.execPath, ['dist/cli.cjs', 'demo', 'seed'], { cwd: apiDir, env, stdio: 'inherit' });
if (seed.status !== 0) {
  cleanup();
  process.exit(seed.status ?? 1);
}

const server = spawn(process.execPath, ['dist/index.cjs'], { cwd: apiDir, env, stdio: 'inherit' });
console.log(`\nDemo: http://localhost:${port}  (Ctrl+C zatrzymuje i usuwa dane demo; dane wracają do stanu początkowego co godzinę)\n`);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
server.on('exit', (code) => {
  cleanup();
  process.exit(code ?? 0);
});
