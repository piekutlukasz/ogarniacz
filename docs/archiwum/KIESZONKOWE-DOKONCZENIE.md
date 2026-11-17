# Kieszonkowe: dokończenie

Zamknięte 17 listopada 2026. Wątek z etapu 9, przeniesiony z [plany/ROZWOJ.md](../plany/ROZWOJ.md). Główna część kieszonkowego powstała 9 listopada 2026, przed 1.0 (zakres w [ETAPY.md](ETAPY.md)). Opis działania: [PROJEKT.md](../PROJEKT.md), rozdział 2, „Kieszonkowe i nagrody”. Ten plik się nie zmienia.

- [x] Ukrycie ekranu „Kieszonkowe” i wyboru nagrody, gdy w rodzinie nie ma aktywnego konta dziecka (PR 22)
- [x] Cofnięcie pomyłkowo oznaczonej wypłaty (PR 23)
- [x] Nagroda w regułach cyklicznych, np. śmieci +5 zł co tydzień (PR 24)

## Kieszonkowe bez dzieci

**Projekt z 11 listopada 2026.** Gdy w rodzinie nie ma aktywnego konta dziecka, ekran „Kieszonkowe” znika z paska nawigacji, a formularz zadania nie pokazuje wyboru nagrody, bo nie miałby kto jej dostać. Link z powiadomienia (`?ekran=allowance`) prowadzi wtedy do „Dziś”, tak jak przy ekranie niedostępnym dla roli. Front zna rodzinę z `GET /api/users` (`useFamily`), więc nie trzeba nowej trasy; API zostaje bez zmian, a dodanie albo włączenie konta dziecka przywraca ekran.

**Decyzja z 17 listopada 2026:** nagrody już ustawione na otwartych zadaniach znikają z karteczek, ale zostają w bazie i wracają z kontem dziecka. Archiwum zadań pokazuje je dalej, bo to historia.

**Notatki z wykonania:**

- Hook `useHasChildren` zakłada, że dziecko jest, dopóki lista rodziny się wczytuje, żeby w typowej rodzinie ekran nie mrugał przy starcie.
- Rodzinę bez dziecka sprawdza test dymny kreatora pierwszego uruchomienia (pusta baza, jeden rodzic), bo wspólna baza e2e zawsze ma dziecko.
- Znane ograniczenie: gdy dziecko przyjmie zaproszenie na swoim telefonie, u rodzica „Kieszonkowe” wraca dopiero po odświeżeniu listy rodziny (najwyżej po godzinie albo po ponownym uruchomieniu aplikacji).

## Cofnięcie wypłaty

**Wykonanie:** rodzic cofa wypłatę przyciskiem „Cofnij” przy „Ostatnich wypłatach”, z drugim stuknięciem jak przy „Wypłacone”. Cofnąć można tylko wypłatę z tygodni widocznych na ekranie (ostatnie cztery).

**Decyzje:**

- Nic nie kasujemy: wypłata dostaje `cancelled_at` i `cancelled_by`, a zadaniom tej wypłaty czyścimy `payout_id`, więc znów są niewypłacone i liczą się w tygodniu ukończenia.
- Unikalny indeks dziecko + tydzień stał się częściowy (`WHERE cancelled_at IS NULL`), żeby cofnięta wypłata nie blokowała ponownego oznaczenia. To jedyna migracja w projekcie, która zastępuje indeks zamiast tylko dodawać. Starszy kod na nowszej bazie pokaże cofniętą wypłatę jako wypłaconą (bez listy nagród) i nie pozwoli oznaczyć jej drugi raz; danych nie psuje.
- Odrzucony wariant: zostawienie zadaniom `payout_id` wskazującego cofniętą wypłatę. Wymagałby sprawdzania stanu wypłaty w każdym zapytaniu o niewypłacone nagrody.

## Nagroda w regułach cyklicznych

**Wykonanie:** reguła ma kolumnę `reward`, a harmonogram przekazuje ją każdemu tworzonemu zadaniu. Wybór nagrody w formularzu reguły i plakietka na liście reguł znikają w rodzinie bez dziecka.

**Decyzja:** zmiana nagrody w regule działa tylko na następne wystąpienia. Utworzone zadania zachowują nagrodę z chwili utworzenia, tak jak tytuł i osobę.
