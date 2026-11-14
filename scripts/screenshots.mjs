// Zrzuty ekranów do README: łączy się z uruchomionym demo, zapisuje ekrany w docs/img
// i składa z nich dwa obrazy: ekrany.png (cztery ekrany) oraz wyglad.png (tryb ciemny i inne wyglądy).
// Użycie: npm run demo (w drugim terminalu), potem node scripts/screenshots.mjs [adres]
// Adres domyślnie http://localhost:3000, a port demo zmienia PORT=3100 npm run demo.
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'docs', 'img');
const baseURL = process.argv[2] ?? 'http://localhost:3000';
mkdirSync(out, { recursive: true });

// Rozmiar iPhone'a 15; drugie dziecko i rodzic pokazują dwa różne widoki tych samych ekranów.
const viewport = { width: 393, height: 852 };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

async function session(login, { look, theme } = {}) {
  const context = await browser.newContext({
    baseURL,
    viewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    colorScheme: theme === 'dark' ? 'dark' : 'light',
    // CSP zbudowanej aplikacji blokuje wstrzyknięty niżej styl, który chowa baner demo.
    bypassCSP: true,
  });
  await context.addInitScript(
    ({ look, theme }) => {
      if (look) localStorage.setItem('ogarniacz.look', look);
      if (theme) localStorage.setItem('ogarniacz.theme', theme);
    },
    { look, theme },
  );
  const page = await context.newPage();
  await page.goto('/');
  // Wejście bez hasła na konto przykładowe, jak przyciski na ekranie logowania w demo.
  const response = await page.evaluate(async (login) => {
    const result = await fetch('/api/demo/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login }),
    });
    return result.status;
  }, login);
  if (response !== 200) throw new Error(`Logowanie demo jako ${login} nie powiodło się (${response}). Czy serwer działa w trybie DEMO_MODE?`);
  await page.reload();
  await page.getByRole('button', { name: 'Dziś' }).waitFor();
  // Baner demo to nie część wyglądu aplikacji, a zabiera miejsce na ekranie.
  await page.addStyleTag({ content: 'p[role="note"] { display: none; }' });
  return { context, page };
}

async function shot(page, screen, file) {
  await page.getByRole('button', { name: screen, exact: true }).click();
  // Czas na zapytania i animacje wejścia.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(out, `${file}.png`) });
  console.log(`docs/img/${file}.png`);
}

const parent = await session('tata');
await shot(parent.page, 'Dziś', 'dzis');
await shot(parent.page, 'Tablica', 'tablica');
await shot(parent.page, 'Zakupy', 'zakupy');
await shot(parent.page, 'Kieszonkowe', 'kieszonkowe');
await parent.context.close();

const dark = await session('mama', { theme: 'dark' });
await shot(dark.page, 'Dziś', 'dzis-ciemny');
await dark.context.close();

for (const look of ['forest', 'stickers']) {
  const variant = await session('tata', { look });
  await shot(variant.page, 'Dziś', `dzis-${look}`);
  await variant.context.close();
}

/** Składa zrzuty w jeden obraz: telefony obok siebie na tle z gradientem. */
async function montage(files, file, { background, width }) {
  const images = files.map((name) => `data:image/png;base64,${readFileSync(join(out, `${name}.png`)).toString('base64')}`);
  const page = await browser.newPage({ viewport: { width, height: 800 }, deviceScaleFactor: 1.5 });
  await page.setContent(`<!doctype html><style>
    body { margin: 0; padding: 48px 40px; display: flex; gap: 32px; justify-content: center; background: ${background}; }
    img { width: 280px; display: block; border-radius: 34px; box-shadow: 0 18px 40px rgb(60 40 20 / 0.22), 0 0 0 6px rgb(255 255 255 / 0.9); }
  </style>${images.map((src) => `<img src="${src}">`).join('')}`);
  await page.locator('body').screenshot({ path: join(out, `${file}.png`) });
  await page.close();
  console.log(`docs/img/${file}.png`);
}

await montage(['dzis', 'tablica', 'zakupy', 'kieszonkowe'], 'ekrany', {
  background: 'linear-gradient(135deg, #fbe3d6, #fbf1d9)',
  width: 1400,
});
await montage(['dzis-ciemny', 'dzis-forest', 'dzis-stickers'], 'wyglad', {
  background: 'linear-gradient(135deg, #e3ecdc, #fbf1d9)',
  width: 1100,
});

// Pojedyncze zrzuty były tylko materiałem do składania, w repozytorium zostają dwa obrazy.
for (const name of ['dzis', 'tablica', 'zakupy', 'kieszonkowe', 'dzis-ciemny', 'dzis-forest', 'dzis-stickers']) {
  rmSync(join(out, `${name}.png`));
}

await browser.close();
