// Obsługa powiadomień push. Ładowany do app-sw.js przez importScripts (vite.config.ts), bo vite-plugin-pwa
// generuje service worker sam. Nazwy app-sw.js nie wolno zmieniać, ten plik może zmieniać się swobodnie.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    data = { body: event.data?.text() };
  }

  // Safari cofa zgodę, jeśli push nie pokaże powiadomienia, więc pokazujemy je zawsze, nawet z domyślną treścią.
  event.waitUntil(
    self.registration.showNotification(data.title || 'Ogarniacz', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      // Android maluje badge jednym kolorem według przezroczystości, więc pełna ikona dałaby jednolity kwadrat.
      badge: '/icons/badge-96.png',
      // Ten sam rodzaj zastępuje poprzednie powiadomienie zamiast się piętrzyć.
      tag: data.tag,
      data: { url: typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url ?? '/', self.location.origin);

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const open = clients.find((client) => new URL(client.url).origin === target.origin);
      if (!open) return self.clients.openWindow(target.href);
      // Otwarta aplikacja nie przeładowuje się: dostaje wiadomość i przełącza ekran.
      open.postMessage({ type: 'open-screen', screen: target.searchParams.get('ekran') });
      return open.focus();
    }),
  );
});
