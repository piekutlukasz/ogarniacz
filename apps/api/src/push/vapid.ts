import webpush from 'web-push';

// Klucze generuje się raz i trzyma stałe: ich zmiana unieważnia wszystkie subskrypcje.
const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log('Wklej do ustawień serwera (klucz prywatny jest sekretem, nie commituj go):\n');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:twoj@adres');
