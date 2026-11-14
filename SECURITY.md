# Bezpieczeństwo

Ogarniacz trzyma dane rodziny: konta, zadania, zakupy, linki do prywatnych kalendarzy i subskrypcje powiadomień. Błąd bezpieczeństwa zgłoś prywatnie, nie w publicznym zgłoszeniu ani w pull requeście.

## Jak zgłosić

Użyj prywatnego zgłoszenia na GitHubie: zakładka **Security** → **Report a vulnerability** ([bezpośredni link](https://github.com/piekutlukasz/ogarniacz/security/advisories/new)). Zgłoszenie widzi tylko właściciel repozytorium.

Przydadzą się:

- czego dotyczy błąd (trasa API, ekran, plik) i jaki jest jego skutek,
- kroki do odtworzenia, najlepiej na lokalnym demo (`npm run demo`),
- wersja albo commit, na którym błąd występuje.

Nie testuj na cudzych instalacjach. Lokalne demo z przykładowymi danymi wystarcza do odtworzenia prawie każdego błędu.

## Czego się spodziewać

To projekt jednej rodziny utrzymywany po godzinach. Odpowiedź przychodzi zwykle w ciągu kilku dni. Poprawka trafia na `main`, a stamtąd po zielonym CI na gałąź `prod`, z której aktualizują się instalacje. Po wydaniu poprawki zgłoszenie zostaje opublikowane jako GitHub Security Advisory, z podziękowaniem dla zgłaszającego, jeśli sobie tego życzy.

## Wspierane wersje

Poprawki bezpieczeństwa dostaje tylko najnowsza wersja z gałęzi `main` (i `prod`). Starsze oznaczone wydania nie dostają osobnych poprawek: aktualizacja polega na przejściu na najnowszą wersję ([docs/instrukcje/WDROZENIE.md](docs/instrukcje/WDROZENIE.md)).

## Co już jest

Zabezpieczenia aplikacji (sesje, limit prób logowania, CSP, szyfrowanie linków do kalendarzy, lista usług push) opisuje [docs/PROJEKT.md](docs/PROJEKT.md), rozdział 9.
