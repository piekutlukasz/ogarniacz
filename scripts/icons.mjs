// Ikony aplikacji: renderuje apps/web/public/icons/logo.svg do PNG-ów (192, 512 i 180 dla iOS),
// a badge.svg do badge-96.png (mała ikona powiadomienia na Androidzie, z przezroczystym tłem).
// Użycie: node scripts/icons.mjs. Po zmianie logo.svg albo badge.svg uruchom i dołącz zmienione PNG-i do commita.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'apps', 'web', 'public', 'icons');
const logo = readFileSync(join(dir, 'logo.svg'), 'utf8');
const badge = readFileSync(join(dir, 'badge.svg'), 'utf8');
const icons = [
  { file: 'icon-512.png', size: 512, svg: logo },
  { file: 'icon-192.png', size: 192, svg: logo },
  { file: 'apple-touch-icon.png', size: 180, svg: logo },
  { file: 'badge-96.png', size: 96, svg: badge },
];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
for (const { file, size, svg } of icons) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
  );
  writeFileSync(join(dir, file), await page.screenshot({ type: 'png', omitBackground: true }));
  await page.close();
}
await browser.close();
