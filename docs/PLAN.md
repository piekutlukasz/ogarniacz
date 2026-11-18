# Ogarniacz: plan

Stan na 18 listopada 2026. Tu jest tylko przegląd: co zrobione, co zostało i gdzie są szczegóły. Opis produktu i architektury jest w [PROJEKT.md](PROJEKT.md), a mapa całej dokumentacji w [README.md](README.md).

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
| 8 | Wersja 1.0 | L | Zamknięty 18 listopada 2026, wydanie `v1.0.0` |
| **9** | **Rozwój po 1.0** | — | **W toku** |

Pełne listy kontrolne zamkniętych etapów i podjęte decyzje: [archiwum/ETAPY.md](archiwum/ETAPY.md).

## Etap 9: rozwój po 1.0

| Wątek | Hasłowo | Szczegóły |
|---|---|---|
| Instalacja dla innych i publikacja | Wariant z systemd, skrypty aktualizacji, `rclone` w obrazie; zrobione: czysta historia, licencja MIT, ogólna instrukcja wdrożenia, `SECURITY.md`, wydanie `v0.9.0-beta` (14 listopada 2026), wydanie `v1.0.0` z obrazem w GHCR, Docker z HTTPS (Caddy), `.env` i `HEALTHCHECK` (18 listopada 2026) | [plany/PUBLIKACJA.md](plany/PUBLIKACJA.md) |
| Testy po 1.0 | Zrobione: e2e demo (T7), testy jednostkowe `ShoppingSync`, zegar w e2e, e2e sesji, blokady i wyłączonego konta (T2–T4, 15 listopada 2026), sprawdzenie dostępności axe z poprawkami kontrastu (T8, 17 listopada 2026) | [archiwum/UTWARDZENIE-TESTY.md](archiwum/UTWARDZENIE-TESTY.md) |
| Pokrycie i nowe testy | Zrobione: pomiar pokrycia w Vitest z progami w CI, testy `shared` z `fast-check` i poprawka konfliktu odhaczenia w zakupach (18 listopada 2026); dalej migracje i powrót wersji, trasy bez e2e, aktualizacja service workera, regresja wizualna, mutacje | [plany/TESTY.md](plany/TESTY.md) |
| Kieszonkowe: dokończenie | Zamknięte 17 listopada 2026: ukrycie bez dzieci, cofnięcie wypłaty, nagroda w regułach cyklicznych | [archiwum/KIESZONKOWE-DOKONCZENIE.md](archiwum/KIESZONKOWE-DOKONCZENIE.md) |
| Pomysły | Częstotliwość wypłaty, środowisko UAT, zdjęcie jako potwierdzenie i inne; zrobione: kolor karteczki (14 listopada 2026) | [plany/ROZWOJ.md](plany/ROZWOJ.md) |

## Otwarte decyzje

Każda decyzja jest zapisana w jednym miejscu: w pliku planu, którego dotyczy (rozdział „Decyzje”). Podjęte decyzje z zamkniętych etapów są w [archiwum/ETAPY.md](archiwum/ETAPY.md).

Obecnie żaden plan nie ma otwartych decyzji.

## Ustalenia

- **Użytkownicy:** rodzice i dzieci, każde z własnym telefonem i kontem, na iPhonach i Androidach.
