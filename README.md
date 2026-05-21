# TaskMaster2

TaskMaster2 to pelna aplikacja do zarzadzania zadaniami i projektami zespolowymi. Backend dziala jako Flask REST API, frontend jako React/TypeScript SPA. Aplikacja obsluguje role uzytkownikow, projekty, zadania, podzadania, komentarze, zaleznosci miedzy zadaniami, widoki dzienne, Kanban, raporty, szablony projektow, szybkie dodawanie zadan i synchronizacje w czasie rzeczywistym przez Socket.IO.

## Spis Tresci

- [Najwazniejsze Funkcje](#najwazniejsze-funkcje)
- [Role i Uprawnienia](#role-i-uprawnienia)
- [Jak Uruchomic](#jak-uruchomic)
- [Jak Uzywac Aplikacji](#jak-uzywac-aplikacji)
- [Widoki Aplikacji](#widoki-aplikacji)
- [Zadania i Zaleznosci](#zadania-i-zaleznosci)
- [Projekty i Szablony](#projekty-i-szablony)
- [Szybkie Dodawanie](#szybkie-dodawanie)
- [Komentarze i Wzmianki](#komentarze-i-wzmianki)
- [Raporty i Dashboard](#raporty-i-dashboard)
- [API](#api)
- [Development](#development)
- [Testy](#testy)
- [Konfiguracja](#konfiguracja)
- [Troubleshooting](#troubleshooting)

## Najwazniejsze Funkcje

TaskMaster2 zawiera:

- rejestracje i logowanie uzytkownikow,
- role `admin` i `user`,
- tworzenie i edycje zadan,
- przypisywanie wielu uzytkownikow do zadania,
- priorytety: niski, sredni, wysoki,
- statusy: do zrobienia, w toku, zakonczone,
- projekty z opisem, kolorem, postepem i lista zadan,
- szablony projektow z gotowymi zadaniami i zaleznosciami,
- podzadania,
- komentarze,
- wzmianki `@username` w komentarzach,
- zaleznosci miedzy zadaniami,
- blokowanie zakonczenia zadania, jesli jego zaleznosci sa otwarte,
- blokowanie zakonczenia projektu, jesli projekt nie spelnia checklisty gotowosci,
- widok Dzis,
- Kanban z drag-and-drop,
- dashboard statystyk,
- panel blokad,
- raport tygodniowy,
- aktywnosc i historia zmian,
- szybkie dodawanie zadan z Command Palette,
- ciemny motyw,
- PWA assets,
- Socket.IO do synchronizacji miedzy klientami,
- health checki `/health` i `/ready`.

## Role i Uprawnienia

### Admin

Admin moze:

- tworzyc zadania,
- edytowac zadania,
- usuwac zadania,
- przypisywac zadania uzytkownikom,
- tworzyc projekty,
- konczyc projekty,
- tworzyc projekty z szablonow,
- zarzadzac uzytkownikami,
- wykonywac operacje masowe,
- dodawac i usuwac zaleznosci.

### User

Zwykly uzytkownik moze:

- widziec zadania przypisane do siebie,
- konczyc swoje zadania, jesli nie sa zablokowane,
- dodawac komentarze,
- dodawac i zmieniac podzadania w przypisanych zadaniach,
- widziec projekty, w ktorych ma przypisane zadania,
- korzystac z widokow Dzis, Kanban, Dashboard, Aktywnosc w zakresie swoich zadan.

## Jak Uruchomic

### Opcja 1: Docker

Najprostszy sposob lokalnego uruchomienia:

```bash
docker-compose up --build
```

Aplikacja bedzie dostepna pod adresem:

```text
http://localhost:5000
```

Zatrzymanie:

```bash
docker-compose down
```

Reset bazy danych Docker/SQLite:

```bash
docker-compose down -v
docker-compose up --build
```

### Opcja 2: Lokalny Backend i Frontend

Backend:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
flask db upgrade
python app.py
```

Frontend w drugim terminalu:

```bash
cd frontend
npm install
npm run dev
```

Frontend Vite dziala zwykle na:

```text
http://localhost:3000
```

Backend Flask dziala na:

```text
http://localhost:5000
```

## Jak Uzywac Aplikacji

### Pierwsze Uruchomienie

1. Otworz aplikacje w przegladarce.
2. Utworz konto.
3. Pierwszy uzytkownik moze zostac administratorem, zaleznie od konfiguracji i bootstrapu aplikacji.
4. Admin moze dodac kolejnych uzytkownikow w widoku `Uzytkownicy`.
5. Utworz projekt albo skorzystaj z szablonu projektu.
6. Dodaj zadania i przypisz je uzytkownikom.

### Typowy Przeplyw Pracy

1. Admin tworzy projekt.
2. Admin tworzy zadania albo generuje je z szablonu.
3. Admin przypisuje zadania uzytkownikom.
4. Uzytkownicy pracuja w widoku `Dzis`, `Zadania` albo `Kanban`.
5. Komentarze i wzmianki pomagaja koordynowac prace.
6. Zaleznosci blokuja zadania, ktorych nie mozna jeszcze domknac.
7. Dashboard pokazuje postep, blokady i raport tygodniowy.
8. Gdy wszystkie warunki sa spelnione, admin konczy projekt.

## Widoki Aplikacji

### Zadania

Widok `Zadania` sluzy do przegladania i zarzadzania zadaniami.

Funkcje:

- lista zadan,
- wyszukiwarka,
- filtrowanie po priorytecie,
- filtrowanie po projekcie,
- filtrowanie po statusie,
- filtr zadan zablokowanych,
- statystyki widocznej strony,
- zaznaczanie zadan,
- operacje masowe dla admina,
- tworzenie zadan,
- otwieranie szczegolow zadania.

W szczegolach zadania mozna:

- zobaczyc notatki,
- edytowac zadanie,
- dodawac podzadania,
- oznaczac podzadania jako wykonane,
- dodawac komentarze,
- uzywac `@wzmianek`,
- ogladac historie zmian,
- dodawac i usuwac zaleznosci,
- zobaczyc, co blokuje zadanie,
- zobaczyc, jakie inne zadania sa blokowane przez to zadanie,
- usunac zadanie,
- oznaczyc zadanie jako zakonczone.

### Dzis

Widok `Dzis` jest kokpitem codziennej pracy.

Sekcje:

- `Po terminie`,
- `Na dzis`,
- `Nastepne 7 dni`.

Metryki:

- liczba zadan po terminie,
- liczba zadan na dzis,
- liczba zadan w ciagu 7 dni,
- zadania gotowe do pracy,
- zadania zablokowane,
- zadania o wysokim priorytecie.

Akcje:

- `Start` ustawia zadanie jako `w toku`,
- przycisk zakonczenia konczy zadanie, jesli nie jest zablokowane.

### Projekty

Widok `Projekty` pokazuje projekty oraz zadania przypisane do wybranego projektu.

Funkcje:

- tworzenie pustego projektu,
- przeglad projektow,
- postep projektu,
- lista zadan projektu,
- przypisywanie istniejacego zadania do projektu,
- tworzenie projektu z szablonu,
- zakonczanie projektu.

Projektu nie da sie zakonczyc, dopoki nie spelni checklisty:

- wszystkie zadania sa zakonczone,
- nie ma zablokowanych zadan,
- nie ma otwartych zadan po terminie.

### Kanban

Widok `Kanban` dzieli zadania na kolumny:

- `Do zrobienia`,
- `W toku`,
- `Zakonczone`.

Zadania mozna przeciagac miedzy kolumnami. Jesli zadanie jest zablokowane przez zaleznosci, nie mozna przeniesc go do `Zakonczone`.

### Statystyki

Widok `Statystyki` zawiera:

- laczna liczbe zadan,
- liczbe zadan zakonczonych,
- liczbe zadan w toku,
- liczbe zadan zaleglych,
- procent ukonczenia,
- wykres priorytetow,
- wykres projektow.

Dashboard zawiera tez panel `Blokady` i `Raport tygodniowy`.

### Kalendarz

Widok `Kalendarz` pokazuje zadania w ukladzie miesiecznym wedlug terminu.

### Aktywnosc

Widok `Aktywnosc` pokazuje ostatnie zdarzenia w aplikacji:

- tworzenie zadan,
- aktualizacje,
- komentarze,
- wzmianki,
- zmiany podzadan,
- zakonczenia i przywrocenia,
- zmiany zaleznosci.

### Uzytkownicy

Widok dostepny dla admina.

Admin moze:

- dodawac uzytkownikow,
- ustawic role,
- usuwac konta, z zachowaniem zabezpieczen przed usunieciem siebie lub ostatniego admina.

## Zadania i Zaleznosci

Zaleznosc oznacza, ze jedno zadanie musi zostac zakonczone, zanim inne moze zostac zakonczone.

Przyklad:

```text
Przygotowac testy -> Wdrozyc na produkcje
```

W takim przypadku `Wdrozyc na produkcje` jest zablokowane, dopoki `Przygotowac testy` nie zostanie zakonczone.

Aplikacja pilnuje tego po stronie backendu:

- nie da sie zakonczyc zablokowanego zadania,
- nie da sie masowo zakonczyc zablokowanych zadan,
- nie da sie ustawic statusu `done`, jesli zadanie ma otwarte zaleznosci,
- nie da sie utworzyc cyklu zaleznosci,
- nie da sie dodac zaleznosci zadania od samego siebie,
- nie da sie dodac duplikatu zaleznosci.

Panel `Blokady` na dashboardzie pokazuje:

- zadania zablokowane,
- najwieksze blokery,
- zadania gotowe do pracy.

## Projekty i Szablony

### Tworzenie Projektu

Admin moze utworzyc projekt recznie, podajac:

- nazwe,
- opis,
- kolor.

### Tworzenie z Szablonu

Widok `Projekty` zawiera sekcje `Szablony projektow`.

Dostepne szablony:

- `Wdrozenie klienta`,
- `Release`,
- `Kampania`.

Szablon tworzy:

- projekt,
- zestaw zadan,
- terminy zadan,
- zaleznosci miedzy zadaniami.

Przy tworzeniu projektu z szablonu mozna podac:

- nazwe projektu,
- date startu.

Terminy zadan sa liczone wzgledem daty startu. Jesli data startu nie zostanie podana, aplikacja uzywa dzisiejszej daty.

## Szybkie Dodawanie

Command Palette otwiera sie skrotem:

```text
Ctrl+K
```

na macOS:

```text
Cmd+K
```

Szybkie dodawanie zadania dziala przez wpis zaczynajacy sie od `+`.

Przyklad:

```text
+ Napisać ofertę #Sprzedaz @quickuser jutro !high
```

Parser rozpoznaje:

- `#Projekt` jako projekt,
- `@username` jako przypisanego uzytkownika,
- `dzis`, `dziś`, `today` jako dzisiejszy termin,
- `jutro`, `tomorrow` jako termin na jutro,
- date `YYYY-MM-DD`,
- `!high`, `!medium`, `!low`,
- polskie aliasy priorytetow, np. `!wysoki`, `!sredni`, `!średni`, `!niski`.

Wszystko, co nie jest tokenem sterujacym, trafia do tytulu zadania.

## Komentarze i Wzmianki

W komentarzu mozna uzyc wzmianki:

```text
@anna sprawdzisz to?
```

Jesli istnieje uzytkownik `anna`, aplikacja:

- zapisze komentarz,
- utworzy aktywnosc `mentioned`,
- wysle event Socket.IO,
- pokaze toast wspomnianemu uzytkownikowi.

## Raporty i Dashboard

### Panel Blokady

Panel pokazuje:

- `Zablokowane`: zadania czekajace na inne zadania,
- `Najwieksze blokery`: zadania blokujace najwiecej innych,
- `Gotowe do pracy`: otwarte zadania bez blokad.

### Raport Tygodniowy

Raport tygodniowy pokazuje:

- zakres dat,
- liczbe utworzonych zadan,
- liczbe zakonczonych zadan,
- liczbe zadan po terminie,
- liczbe zablokowanych zadan,
- liczbe otwartych zadan,
- podsumowanie projektow,
- zakonczenia wedlug uzytkownikow.

## API

Najwazniejsze endpointy:

### Auth

- `POST /auth/signup` - rejestracja,
- `POST /auth/login` - logowanie,
- `POST /auth/logout` - wylogowanie,
- `GET /auth/me` - aktualny uzytkownik.

### Users

- `GET /users` - lista uzytkownikow,
- `POST /users` - utworzenie uzytkownika,
- `PUT /users/<id>/role` - zmiana roli,
- `DELETE /users/<id>` - usuniecie uzytkownika.

### Tasks

- `GET /tasks` - lista zadan,
- `POST /tasks` - utworzenie zadania,
- `PUT /tasks/<id>` - aktualizacja zadania,
- `DELETE /tasks/<id>` - usuniecie zadania,
- `PUT /tasks/<id>/complete` - przelaczenie zakonczone/przywrocone,
- `POST /tasks/quick-add` - szybkie dodanie zadania,
- `GET /tasks/today` - widok Dzis,
- `GET /tasks/blocked` - zadania zablokowane,
- `GET /tasks/dependency-board` - panel blokad,
- `GET /tasks/search?q=...` - wyszukiwanie,
- `GET /tasks/filter` - filtrowanie,
- `PUT /tasks/bulk/complete` - masowe zakonczenie,
- `DELETE /tasks/bulk/delete` - masowe usuniecie,
- `PUT /tasks/bulk/update` - masowa aktualizacja.

### Dependencies

- `GET /tasks/<id>/dependencies` - zaleznosci zadania,
- `POST /tasks/<id>/dependencies` - dodanie zaleznosci,
- `DELETE /dependencies/<id>` - usuniecie zaleznosci.

### Comments and Subtasks

- `POST /tasks/<id>/comments` - dodanie komentarza,
- `GET /tasks/<id>/activity` - historia zadania,
- `POST /tasks/<id>/subtasks` - dodanie podzadania,
- `PUT /subtasks/<id>/complete` - przelaczenie podzadania,
- `DELETE /subtasks/<id>` - usuniecie podzadania.

### Projects

- `GET /projects` - lista projektow,
- `POST /projects` - utworzenie projektu,
- `PUT /projects/<id>` - aktualizacja projektu,
- `DELETE /projects/<id>` - archiwizacja/zakonczenie z walidacja,
- `GET /projects/<id>/completion` - checklista gotowosci projektu,
- `POST /projects/<id>/complete` - zakonczenie projektu.

### Project Templates

- `GET /project-templates` - lista szablonow,
- `POST /project-templates/<id>/use` - utworzenie projektu z szablonu.

### Stats and Reports

- `GET /stats/dashboard` - statystyki dashboardu,
- `GET /reports/weekly` - raport tygodniowy,
- `GET /activity?limit=100` - aktywnosc,
- `GET /tasks/export/csv` - eksport CSV.

### Health

- `GET /health` - prosty health check,
- `GET /ready` - readiness check z baza i Socket.IO.

## Development

### Struktura Projektu

```text
TaskMaster2/
  app.py
  config.py
  extensions.py
  models.py
  schemas.py
  routes/
    auth.py
    users.py
    tasks.py
    stats.py
    filters.py
  tests/
  migrations/
  frontend/
    src/
      api/
      components/
      store/
      types/
```

### Backend

```bash
source .venv/bin/activate
python app.py
```

### Frontend

```bash
cd frontend
npm run dev
```

### Build Frontendu

```bash
cd frontend
npm run build
```

Flask serwuje zbudowany frontend z:

```text
frontend/dist
```

Po zmianach frontendowych, jesli testujesz przez Flask na porcie 5000, wykonaj `npm run build`.

## Testy

Backend:

```bash
.venv/bin/pytest
```

Szybka walidacja skladni:

```bash
python3 -m py_compile models.py routes/tasks.py routes/stats.py routes/filters.py
```

Frontend:

```bash
cd frontend
npm run build
```

## Konfiguracja

Najwazniejsze zmienne srodowiskowe:

```text
SECRET_KEY=...
DATABASE_URL=...
CORS_ORIGINS=http://localhost:5000
LOG_LEVEL=INFO
ENABLE_SCHEDULER=true
SOCKETIO_ASYNC_MODE=threading
MAIL_SERVER=...
MAIL_PORT=587
MAIL_USERNAME=...
MAIL_PASSWORD=...
MAIL_DEFAULT_SENDER=...
```

SQLite jest domyslna baza lokalna. Plik bazy znajduje sie zwykle w:

```text
instance/tasks.db
```

Migracje:

```bash
flask db migrate -m "opis zmiany"
flask db upgrade
```

## Troubleshooting

### Port 5000 jest zajety

Sprawdz proces:

```bash
lsof -i :5000
```

Albo zmien port w konfiguracji/Docker Compose.

### Frontend nie pokazuje zmian

Jesli uzywasz Flask jako serwera frontendowego, zbuduj frontend:

```bash
cd frontend
npm run build
```

### Socket.IO nie laczy sie

Sprawdz:

- czy backend dziala,
- czy `CORS_ORIGINS` pasuje do adresu frontendu,
- czy przegladarka nie blokuje WebSocket,
- console/network tab w DevTools.

### Nie moge zakonczyc zadania

Najczestsza przyczyna: zadanie jest zablokowane przez zaleznosc. Otworz szczegoly zadania albo panel `Blokady`, aby zobaczyc, co je blokuje.

### Nie moge zakonczyc projektu

Projekt musi spelnic checklist:

- wszystkie zadania zakonczone,
- brak zablokowanych zadan,
- brak otwartych zadan po terminie.

### Nie dziala szybkie dodawanie

Upewnij sie, ze:

- jestes adminem,
- wpis zaczyna sie od `+`,
- uzywasz poprawnej nazwy uzytkownika po `@`,
- priorytet ma postac `!high`, `!medium`, `!low` albo polski alias.

## Uwagi Implementacyjne

- Backend waliduje dane przez Marshmallow.
- SQLAlchemy obsluguje modele i relacje.
- Flask-Migrate/Alembic obsluguje migracje.
- Socket.IO wysyla event `task_action` po zmianach stanu.
- Frontend uzywa React Context API zamiast Redux.
- Dark mode opiera sie o Tailwind `darkMode: 'class'`.
- Zadania i projekty sa synchronizowane po mutacjach przez eventy Socket.IO.

