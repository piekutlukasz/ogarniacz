# Ogarniacz: plan

Stan na 17 listopada 2026. Tu jest tylko przegląd: co zrobione, co zostało i gdzie są szczegóły. Opis produktu i architektury jest w [PROJEKT.md](PROJEKT.md), a mapa całej dokumentacji w [README.md](README.md).

**Zasady planu:** najpierw ryzyko (hosting i push sprawdzone przed resztą), żadnych danych bez logowania i backupu, każdy etap daje rodzinie działającą funkcję, a uwagi z codziennego używania mogą zmienić kolejność. Rozmiar to szacunek względny: S, M albo L.

## Przegląd

| Etap | Cel | Rozmiar | Stan |
|---|---|---|---|
| 0 | Domknięcie fundamentów: repozytorium, CI, obraz Docker | S | Zrobiony |
| 1 | Test hostingu i push na prawdziwym iPhonie i Androidzie | S | Zrobiony |
| 2 | Logowanie, backup, wdrożenie | M | Zrobiony |
| 3 | Pełny Kanban i „Dziś” | M | Zamknięty 10 listopada 2026 |
| 4 | Zadania cykliczne | M | Zamknięty 9 listopada 2026 |
| 5 | Lista zakupów offline | L | Zamknięty 10 listopada 2026 |
| 6 | Kalendarze ICS | M | Zamknięty 10 listopada 2026 |
| 7 | Powiadomienia push | M | Zamknięty 11 listopada 2026 |
| **8** | **Wersja 1.0** | **L** | **W toku** |
| 9 | Rozwój po 1.0 | — | Częściowo zrobiony wcześniej (kieszonkowe, demo) |

Pełne listy kontrolne zamkniętych etapów i podjęte decyzje: [archiwum/ETAPY.md](archiwum/ETAPY.md).

## Etap 8: wersja 1.0

**Cel:** cała rodzina może polegać na aplikacji.

**Gotowe, gdy:** przez dwa tygodnie nie ma utraty danych ani awarii, backup działa każdej nocy, a nową osobę i zapomniane hasło da się obsłużyć z aplikacji, bez dostępu do serwera.

| | Punkt | Szczegóły |
|---|---|---|
| ✅ | Instalacja na wszystkich telefonach (11 listopada 2026) | — |
| ⬜ | Dwa tygodnie codziennego używania i zebranie uwag | Liczone od wdrożenia kont w aplikacji |
| ⬜ | Naprawa problemów z codziennego używania | Zrobione: ikona powiadomienia na Androidzie, przebudowa panelu ustawień na menu z podstronami i blokada przewijania tła pod arkuszem (13 listopada 2026, [plany/ROZWOJ.md](plany/ROZWOJ.md)), potwierdzone w Safari na iPhonie 17 listopada 2026 |
| ✅ | Kopia poza serwer: rclone i zaszyfrowany katalog na Google Drive, próba odtworzenia z Dysku (14 listopada 2026), pierwsza nocna wysyłka (15 listopada 2026) | [instrukcje/BACKUP.md](instrukcje/BACKUP.md) |
| ✅ | Utwardzenie: sprawdzenia na produkcji, poprawki B1–B6, B8, B9, test tras bez sesji, skan ZAP bez podatności (13 listopada 2026); B7 to konta w aplikacji | [archiwum/UTWARDZENIE-PRZEGLAD.md](archiwum/UTWARDZENIE-PRZEGLAD.md) |
| ✅ | Powtórzenie skanu ZAP z trasami kont w aplikacji, na instancji bez `DEMO_MODE`: bez podatności, poprawione atrybuty usuwanego cookie sesji (14 listopada 2026) | [archiwum/UTWARDZENIE-PRZEGLAD.md](archiwum/UTWARDZENIE-PRZEGLAD.md) |
| ✅ | Testy przed 1.0: test dymny na buildzie (T1), migracje na kopii przed restartem (T5), ślady Playwright w CI (T6), 13 listopada 2026 | [archiwum/UTWARDZENIE-PRZEGLAD.md](archiwum/UTWARDZENIE-PRZEGLAD.md) |
| ✅ | Konta w aplikacji, krok 1: zmiana hasła, „wyloguj inne urządzenia” (13 listopada 2026) | [plany/KONTA.md](plany/KONTA.md) |
| ✅ | Konta w aplikacji, krok 2: zaproszenia z linkiem i kodem QR, sekcja „Rodzina”, dziennik logowań w aplikacji (13 listopada 2026) | [plany/KONTA.md](plany/KONTA.md) |
| ✅ | Konta w aplikacji, krok 3: kreator pierwszego uruchomienia (13 listopada 2026) | [plany/KONTA.md](plany/KONTA.md) |
| ✅ | Dokumentacja utrzymania: aktualizacja i powrót do poprzedniej wersji, próba odtworzenia backupu, nowe konto (kreator, zaproszenie, a w razie awarii CLI), 13 listopada 2026 | [instrukcje/WDROZENIE.md](instrukcje/WDROZENIE.md) |

**Kolejność:** utwardzenie, testy T1, T5, T6, wszystkie trzy kroki kont w aplikacji, powtórzenie skanu ZAP i kopia na Google Drive są zrobione. Zostają dwa tygodnie używania, liczone od wdrożenia kont.

## Etap 9: rozwój po 1.0

| Wątek | Hasłowo | Szczegóły |
|---|---|---|
| Instalacja dla innych i publikacja | Docker z HTTPS, wariant z systemd, skrypt aktualizacji, wydania w GHCR, ustawienia publicznego repozytorium; zrobione: czysta historia, licencja MIT, ogólna instrukcja wdrożenia, `SECURITY.md`, wydanie `v0.9.0-beta` (14 listopada 2026) | [plany/PUBLIKACJA.md](plany/PUBLIKACJA.md) |
| Testy po 1.0 | Zrobione: e2e demo (T7), testy jednostkowe `ShoppingSync`, zegar w e2e, e2e sesji, blokady i wyłączonego konta (T2–T4, 15 listopada 2026), sprawdzenie dostępności axe z poprawkami kontrastu (T8, 17 listopada 2026) | [archiwum/UTWARDZENIE-TESTY.md](archiwum/UTWARDZENIE-TESTY.md) |
| Kieszonkowe: dokończenie | Nagroda w regułach cyklicznych; zrobione: ukrycie bez dzieci i cofnięcie wypłaty (17 listopada 2026) | [plany/ROZWOJ.md](plany/ROZWOJ.md) |
| Pomysły | Częstotliwość wypłaty, środowisko UAT, zdjęcie jako potwierdzenie i inne; zrobione: kolor karteczki (14 listopada 2026) | [plany/ROZWOJ.md](plany/ROZWOJ.md) |

## Otwarte decyzje

Każda decyzja jest zapisana w jednym miejscu: w pliku planu, którego dotyczy (rozdział „Decyzje”). Podjęte decyzje z zamkniętych etapów są w [archiwum/ETAPY.md](archiwum/ETAPY.md).

| Plik | Najważniejsze otwarte pytania |
|---|---|
| [plany/PUBLIKACJA.md](plany/PUBLIKACJA.md), rozdział 4 | `rclone` w obrazie, proxy w przykładzie Dockera |

## Ustalenia

- **Użytkownicy:** rodzice i dzieci, każde z własnym telefonem i kontem, na iPhonach i Androidach.
