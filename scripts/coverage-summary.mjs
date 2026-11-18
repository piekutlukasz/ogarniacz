// Podsumowanie pokrycia testami w Markdownie, z raportów `json-summary` Vitesta.
// Użycie: npm run test:coverage && node scripts/coverage-summary.mjs. W CI trafia do podsumowania przebiegu.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const packages = [
  ['Reguły wspólne (`packages/shared`, własne testy)', 'packages/shared'],
  ['API (z `packages/shared`)', 'apps/api'],
  ['Front', 'apps/web'],
];
// Pliki poniżej tej wartości (linie) są wypisane z nazwy: to kandydaci na nowe testy.
const LOW = 60;

const pct = (metric) => `${metric.pct.toFixed(1)}%`;
const lines = ['## Pokrycie testami', '', '| Paczka | Linie | Gałęzie | Funkcje |', '|---|---|---|---|'];
const low = [];

for (const [name, dir] of packages) {
  const file = join(root, dir, 'coverage', 'coverage-summary.json');
  if (!existsSync(file)) {
    lines.push(`| ${name} | brak raportu | | |`);
    continue;
  }
  const summary = JSON.parse(readFileSync(file, 'utf8'));
  const { total } = summary;
  lines.push(`| ${name} | ${pct(total.lines)} | ${pct(total.branches)} | ${pct(total.functions)} |`);
  for (const [path, metrics] of Object.entries(summary)) {
    if (path !== 'total' && metrics.lines.pct < LOW) {
      low.push(`- \`${relative(root, path)}\`: ${pct(metrics.lines)} linii`);
    }
  }
}

if (low.length > 0) {
  lines.push('', `<details><summary>Pliki poniżej ${LOW}% linii (${low.length})</summary>`, '', ...low, '', '</details>');
}
lines.push('', 'Pełny raport HTML: artefakt `pokrycie-…` tego przebiegu. Zasady i progi: `docs/plany/TESTY.md`.');
console.log(lines.join('\n'));
