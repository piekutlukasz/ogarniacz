// Motyw wybrany w ustawieniach musi być ustawiony przed pierwszym malowaniem, inaczej ekran mignie.
// Osobny plik zamiast skryptu wpisanego w index.html, bo CSP (apps/api/src/app.ts) wpuszcza tylko skrypty z tej domeny.
try {
  var theme = localStorage.getItem('ogarniacz.theme');
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  var look = localStorage.getItem('ogarniacz.look');
  if (look === 'forest' || look === 'stickers') document.documentElement.dataset.look = look;
} catch (error) {}
