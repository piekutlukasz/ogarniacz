# Dokumentacja

Od czego zacząć:

- **Co jest zrobione i co dalej?** [PLAN.md](PLAN.md): przegląd etapów, hasłowo, z odnośnikami do szczegółowych planów.
- **Jak działa aplikacja?** [PROJEKT.md](PROJEKT.md): specyfikacja z podziałem na **jest** i **planowane**.
- **Jak coś zainstalować albo obsłużyć?** Katalog [instrukcje](#instrukcje).

## Struktura

```text
docs/
  README.md      ta mapa
  PLAN.md        główny plan: etapy, stan, odnośniki
  PROJEKT.md     specyfikacja: funkcje, architektura, model danych, API, role, bezpieczeństwo
  plany/         szczegółowe plany tego, co zostało do zrobienia
  instrukcje/    obsługa działającej aplikacji
  archiwum/      zamknięte etapy i projekty już zrealizowanych funkcji
  img/           zrzuty ekranu do README
```

## Plany

Każdy plik ma na początku listę kontrolną do odhaczania, potem analizę i uzasadnienia, a na końcu otwarte decyzje.

| Plik | Etap | Zawartość |
|---|---|---|
| [plany/KONTA.md](plany/KONTA.md) | 8 | Konta w aplikacji: zaproszenia, sekcja „Rodzina”, kreator pierwszego uruchomienia; wszystkie trzy kroki zrobione 13 listopada 2026 |
| [plany/PUBLIKACJA.md](plany/PUBLIKACJA.md) | 9 | Instalacja z Dockerem i bez, publikacja repozytorium |
| [plany/TESTY.md](plany/TESTY.md) | 9 | Pomiar pokrycia i nowe rodzaje testów: `shared`, migracje, trasy bez e2e, service worker, regresja wizualna, mutacje |
| [plany/ROZWOJ.md](plany/ROZWOJ.md) | 9 | Pomysły |

## Instrukcje

| Plik | Dla kogo | Zawartość |
|---|---|---|
| [instrukcje/WDROZENIE.md](instrukcje/WDROZENIE.md) | Administrator | Instalacja w Dockerze albo na Node.js: wymagania, proxy, pierwsze konto, aktualizacja, codzienna obsługa |
| [instrukcje/BACKUP.md](instrukcje/BACKUP.md) | Administrator | Kopia na Google Drive przez rclone i odtwarzanie bazy |
| [instrukcje/KALENDARZE.md](instrukcje/KALENDARZE.md) | Rodzina i administrator | Skąd wziąć link ICS z Google i iCloud, dodawanie, błędy, konfiguracja serwera |
| [instrukcje/DEMO.md](instrukcje/DEMO.md) | Programista | Przykładowe dane, tryb `DEMO_MODE` |
| [../e2e/README.md](../e2e/README.md) | Programista | Zasady pisania testów Playwright i page objecty |

## Archiwum

Dokumenty, które się już nie zmieniają, ale wyjaśniają, dlaczego coś działa tak, a nie inaczej.

| Plik | Zawartość |
|---|---|
| [archiwum/ETAPY.md](archiwum/ETAPY.md) | Pełne listy kontrolne etapów 0–7 i podjęte decyzje |
| [archiwum/UTWARDZENIE-PRZEGLAD.md](archiwum/UTWARDZENIE-PRZEGLAD.md) | Przegląd bezpieczeństwa i testów z etapu 8: ustalenia B1–B9, luki T1–T8, sprawdzenia na produkcji, wyniki obu skanów ZAP, notatki z wykonania |
| [archiwum/UTWARDZENIE-TESTY.md](archiwum/UTWARDZENIE-TESTY.md) | Testy po 1.0 (T2–T4, T8) z notatkami z wykonania, decyzje o zegarze w e2e i analizie statycznej (darmowy CodeQL) |
| [archiwum/KIESZONKOWE-DOKONCZENIE.md](archiwum/KIESZONKOWE-DOKONCZENIE.md) | Dokończenie kieszonkowego z etapu 9: projekt rodziny bez dziecka, decyzje o cofnięciu wypłaty i nagrodzie w regułach |
| [archiwum/KALENDARZE-PROJEKT.md](archiwum/KALENDARZE-PROJEKT.md) | Projekt etapu 6: analiza ICS, zagrożenia, różnice między projektem a wykonaniem |

## Zasady utrzymania

- **Jedno miejsce na jedną rzecz.** Lista kontrolna i decyzje mieszkają w pliku planu; PLAN.md ma tylko hasło i odnośnik.
- **Zamknięty etap** przenosi swoją listę kontrolną do `archiwum/ETAPY.md`, a w PLAN.md zostaje jeden wiersz.
- **PROJEKT.md opisuje tylko to, co jest.** Projekt i decyzje planowanych prac mieszkają w pliku planu; PROJEKT.md daje do niego najwyżej jedno zdanie z odnośnikiem.
- **Zrealizowany plan albo jego zrobiona część** (analizy, notatki z wykonania) trafia do `archiwum/`, a to, co opisuje działającą aplikację, przechodzi do PROJEKT.md.
- **Zmiana funkcji** aktualizuje w tym samym PR PROJEKT.md, plik planu i datę „Stan na”.
