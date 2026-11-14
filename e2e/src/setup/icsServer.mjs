// Mały serwer kalendarzy ICS dla testów e2e. Podaje wydarzenia na dziś w czasie polskim, więc testy
// nie zależą od daty. Tytuł wydarzenia jest w ścieżce (`/feed/<tytuł>.ics`), dzięki czemu każdy test ma swoje dane.
import { createServer } from 'node:http';

const PORT = Number(process.env.ICS_PORT ?? 5199);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(new Date()).replaceAll('-', '');
const nextDay = (day) => {
  const date = new Date(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10).replaceAll('-', '');
};

function feed(title) {
  const day = today();
  const event = (uid, ...lines) => ['BEGIN:VEVENT', `UID:${uid}@e2e`, ...lines, 'END:VEVENT'].join('\r\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//ogarniacz e2e//EN',
    event('timed', `DTSTART;TZID=Europe/Warsaw:${day}T180000`, `DTEND;TZID=Europe/Warsaw:${day}T190000`, `SUMMARY:${title}`, 'LOCATION:Pływalnia'),
    event('allday', `DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${nextDay(day)}`, `SUMMARY:${title} (cały dzień)`),
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

createServer((request, response) => {
  const path = new URL(request.url ?? '/', 'http://localhost').pathname;
  const match = /^\/feed\/(.+)\.ics$/.exec(path);
  if (path === '/health') {
    response.writeHead(200).end('ok');
  } else if (match) {
    response.writeHead(200, { 'Content-Type': 'text/calendar; charset=utf-8' }).end(feed(decodeURIComponent(match[1])));
  } else if (path === '/not-ics') {
    response.writeHead(200, { 'Content-Type': 'text/html' }).end('<html><body>Zaloguj się</body></html>');
  } else {
    response.writeHead(404).end('nie ma');
  }
}).listen(PORT, '127.0.0.1', () => console.log(`Serwer ICS dla e2e na :${PORT}`));
