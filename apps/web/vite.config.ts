import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const THEME_COLOR = '#fbf6ec';

// Porty da się zmienić zmiennymi środowiska: testy e2e startują własny serwer obok deweloperskiego.
// PORT to ta sama zmienna, którą czyta API, więc proxy trafia tam, gdzie ono słucha.
const WEB_PORT = Number(process.env.WEB_PORT ?? 5173);
const API_PORT = Number(process.env.PORT ?? 3000);

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Własna nazwa, bo /sw.js na tej samej domenie należy do strony testowej push (etap 1).
      // Zmiana nazwy po instalacji na telefonach oznaczałaby osierocony stary service worker.
      filename: 'app-sw.js',
      includeAssets: ['icons/apple-touch-icon.png', 'icons/badge-96.png'],
      manifest: {
        name: 'Ogarniacz',
        short_name: 'Ogarniacz',
        description: 'Domowe zadania, kalendarz i zakupy w jednym miejscu.',
        lang: 'pl',
        start_url: '/',
        display: 'standalone',
        background_color: '#fbf6ec',
        theme_color: THEME_COLOR,
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Obsługa powiadomień push (public/push-sw.js) dołączona do wygenerowanego service workera.
        importScripts: ['push-sw.js'],
        // Czcionka leży u nas, żeby aplikacja wyglądała tak samo bez internetu.
        // Tylko łacina i polskie znaki: pozostałe zestawy znaków przeglądarka i tak pominie.
        globPatterns: ['**/*.{js,css,html,svg}', '**/*latin*.woff2'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  build: {
    // W produkcji API serwuje front, więc build trafia do katalogu API.
    outDir: '../api/public',
    emptyOutDir: true,
  },
  server: {
    port: WEB_PORT,
    // Wskazany port jest obowiązkowy: zajęty ma zatrzymać start, a nie przenieść serwer pod inny adres.
    strictPort: process.env.WEB_PORT !== undefined,
    proxy: {
      // Bez zmiany nagłówka Host: API porównuje go z Origin w ochronie przed CSRF.
      // Adres IPv4 wprost, bo API domyślnie nasłuchuje tylko na 127.0.0.1, a `localhost` bywa rozwiązywany na ::1.
      '/api': { target: `http://127.0.0.1:${API_PORT}`, changeOrigin: false },
    },
  },
});
