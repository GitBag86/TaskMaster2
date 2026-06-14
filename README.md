# TaskMaster2  <img src="https://img.shields.io/badge/version-1.0-success" alt="v1.0">

**TaskMaster2 v1.0** — pełna aplikacja do zarządzania zadaniami i projektami zespołowymi z izolacją multi‑tenant (Team Workspaces). Backend jako Flask REST API, frontend jako React/TypeScript SPA. Obsługuje role użytkowników, projekty, zadania, podzadania, komentarze, zależności między zadaniami, widok Dziś, Kanban z drag‑and‑drop, dashboard, raport tygodniowy, szablony projektów, szybkie dodawanie przez Command Palette, synchronizację w czasie rzeczywistym przez Socket.IO, audit log operacji administracyjnych oraz powiadomienia e‑mail.

### ✨ Nowości w wersji 1.0

- **Multi‑tenancy (Team Workspaces)** — pełna izolacja danych między zespołami z trzema poziomami uprawnień (super_admin / manager / user).
- **Panel super‑admina** — retro/hackerman console do zarządzania zespołami, użytkownikami i globalnym audit logiem.
- **Archiwizacja zespołów** — możliwość zamrożenia zespołu bez utraty danych.
- **Przenoszenie użytkowników** między zespołami z atomicznym przeniesieniem filtrów, powiadomień i aktywności.
- **PostgreSQL** jako baza produkcyjna (Railway managed obok SQLite dla lokalnego dev).
- **Usprawnione usuwanie** — bezpieczne kaskadowe usuwanie użytkowników i zespołów z obsługą FK w PostgreSQL.
- **CSRF protection** z auto‑odświeżaniem tokena co 20 minut i wydłużonym timeoutem.
- **Docker Compose** do lokalnego developmentu.

---

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
- [Powiadomienia E-mail](#powiadomienia-e-mail)
- [Raporty i Dashboard](#raporty-i-dashboard)
- [API](#api)
- [Development](#development)
- [Testy](#testy)
- [Konfiguracja](#konfiguracja)
- [Troubleshooting](#troubleshooting)

## Najwazniejsze Funkcje

TaskMaster2 zawiera:

- rejestracje i logowanie uzytkownikow,
- role `super_admin`, `manager` i `user`,
- tworzenie i edycje zadan,
- przypisywanie wielu uzytkownikow do projektu,
- przypisywanie jednego wykonawcy do zadania,
- priorytety: niski, sredni, wysoki,
- statusy: do zrobienia, w toku, zakonczone,
- projekty z opisem, kolorem, czlonkami, postepem i lista zadan,
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
- powiadomienia e-mail z szablonami HTML,
- szybkie dodawanie zadan z Command Palette,
- ciemny motyw,
- PWA assets,
- Socket.IO do synchronizacji miedzy klientami,
- health checki `/health` i `/ready`.

## Role i Uprawnienia

TaskMaster2 obsługuje multi-tenancy (Team Workspaces) z trzema poziomami uprawnień. Każdy użytkownik z rolą `manager` lub `user` należy do dokładnie jednego zespołu (workspace), a `super_admin` operuje ponad zespołami.

### Super Admin

Super admin nie nalezy do zadnego zespolu (`team_id = NULL`) i nie pojawia sie w widokach team-scoped (np. `/tasks`, `/projects`). Sluzy wylacznie do administracji platforma.

Super admin moze:

- tworzyc i usuwac zespoly (`/admin/teams`),
- zmieniac nazwe i opis zespolu,
- archiwizowac zespoly (uniemozliwia logowanie czlonkom),
- przenosic uzytkownikow miedzy zespolami,
- zmieniac role uzytkownikow (super_admin / manager / user),
- przegladac globalny audit log (`/admin/audit`),
- przegladac audit log per zespol.

Po zalogowaniu super admin laduje na `/admin` — retro `Super Admin Console` — a stamtąd może przejść do `/admin/teams` albo `/admin/audit`.

### Manager (Menedżer Zespołu)

Manager jest odpowiednikiem dawnego `admin` w obrebie jednego zespolu. Widzi tylko zasoby swojego zespolu. To on zarzadza zadaniami, projektami i czlonkami.

Manager moze:

- tworzyc, edytowac i usuwac zadania w swoim zespole,
- przypisywac wykonawcow do zadan (z czlonkow swojego zespolu),
- tworzyc projekty i zarzadzac czlonkami projektu,
- konczyc projekty,
- tworzyc projekty z szablonow,
- generowac jednorazowe zaproszenia (invite tokens) dla nowych czlonkow zespolu,
- usuwac uzytkownikow z zespolu,
- wykonywac operacje masowe na zadaniach,
- dodawac i usuwac zaleznosci miedzy zadaniami.

Manager **nie moze** wystawiac zaproszen na role `manager` ani widziec zasobow innych zespolow.

### User (Zwykly Uzytkownik)

Uzytkownik widzi:

- zadania przypisane do siebie w swoim zespole,
- projekty, w ktorych jest czlonkiem albo ma przypisane zadanie,
- wlasne komentarze, podzadania, powiadomienia.

Uzytkownik moze:

- konczyc swoje zadania (jesli nie sa zablokowane przez zaleznosci),
- dodawac komentarze i podzadania,
- korzystac z widokow Dzis, Kanban, Dashboard, Aktywnosc, Kalendarz w zakresie wlasnych zadan.

### Izolacja zespolow

Kazdy zasob (zadanie, projekt, tag, filtr, szablon, powiadomienie, audit log) jest sztywno powiazany z jednym zespolem przez kolumne `team_id`. Manager A zwraca HTTP 404 przy probie dostepu do zasobu zespolu B; super admin nie widzi zasobow team-scoped przez standardowe endpointy (uzywa endpointow `/admin/...`).

## Jak Uruchomic

### Opcja 1: Lokalny Backend i Frontend

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

### Opcja 2: Docker Compose (zalecane)

Jedno polecenie — wszystko dziala od razu:

```bash
docker compose up -d
```

Aplikacja dostepna pod adresem **http://localhost:5000**.  
Domyślne konto super-admina: `admin` / `dakos1admin2`.

> **Dostosowanie:** skopiuj `.env.example` → `.env` i edytuj zmienne (SECRET_KEY, SIGNUP_MODE itp.)
> przed `docker compose up`, jesli potrzebujesz zmienic domyslne ustawienia.

Po pierwszym logowaniu jako super-admin:
1. Przejdz do `/admin` i otworz `Super Admin Console`.
2. Utworz pierwszy zespol w `Konsola` albo w `/admin/teams`.
3. Wyloguj sie i zaloguj ponownie jako manager (lub zmien role swojego konta).
4. Rozpocznij prace — utworz projekt, zapros czlonkow, dodaj zadania.

**Zatrzymanie:**

```bash
docker compose down
# Aby usunac rowniez baze danych:
docker compose down -v
```

**Logi:**

```bash
docker compose logs -f app
docker compose logs -f db
```

### Opcja 3: Lokalnie przez Dockerfile

Aplikacja ma multi-stage `Dockerfile` (frontend build + Python runtime). Lokalnie zbudujesz i uruchomisz tak:

```bash
docker build -t taskmaster2 .
docker run -p 5000:5000 --env-file .env taskmaster2
```

### Wdrozenie na Railway

Aplikacja dziala produkcyjnie na **Railway**. Railway wykrywa `Dockerfile`, buduje obraz i serwuje go za swoim edge proxy (SSL + WebSocket out-of-the-box). Konfiguracja:

1. New Project -> Deploy from GitHub repo.
2. W zakladce Variables ustaw zmienne z [.env.example](.env.example) (minimum: `SECRET_KEY`, `CORS_ORIGINS`, `PUBLIC_BASE_URL`, dane SMTP jesli chcesz powiadomienia e-mail).
3. Railway sam doda zmienna `PORT`, ktora jest uzywana w `start.sh` (Gunicorn binduje sie na `0.0.0.0:$PORT`).

Backend Flask dziala na:

```text
http://localhost:5000
```

## Jak Uzywac Aplikacji

### Pierwsze Uruchomienie

1. Otworz aplikacje w przegladarce.
2. Utworz konto.
3. Pierwszy uzytkownik moze zostac administratorem, zaleznie od konfiguracji i bootstrapu aplikacji.
4. Super-admin moze dodac kolejnych uzytkownikow w widoku `Konsola`, wybierajac aktywny zespol.
5. Utworz projekt albo skorzystaj z szablonu projektu.
6. Przypisz czlonkow projektu.
7. Dodaj zadania i przypisz po jednym wykonawcy do kazdego zadania.

### Typowy Przeplyw Pracy

1. Admin tworzy projekt.
2. Admin przypisuje kilku czlonkow projektu.
3. Admin tworzy zadania albo generuje je z szablonu.
4. Admin przypisuje do kazdego zadania maksymalnie jednego wykonawce.
5. Uzytkownicy pracuja w widoku `Dzis`, `Zadania` albo `Kanban`.
6. Komentarze i wzmianki pomagaja koordynowac prace.
7. Zaleznosci i otwarte podzadania blokuja zadania, ktorych nie mozna jeszcze domknac.
8. Dashboard pokazuje postep, blokady i raport tygodniowy.
9. Gdy wszystkie warunki sa spelnione, admin konczy projekt.

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
- przypisywanie jednego wykonawcy,
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

Widocznosc projektow:

- admin widzi wszystkie projekty i wszystkie zadania,
- zwykly uzytkownik widzi projekt, jesli jest czlonkiem projektu albo ma w nim przypisane zadanie,
- zwykly uzytkownik w projekcie widzi tylko zadania przypisane do siebie.

Funkcje:

- tworzenie pustego projektu,
- przypisywanie wielu czlonkow projektu,
- przeglad projektow,
- postep projektu,
- lista zadan projektu,
- dodawanie zadania bezposrednio do projektu,
- przypisywanie istniejacego zadania do projektu,
- tworzenie projektu z szablonu,
- zakonczanie projektu.

Przy dodawaniu zadania z poziomu projektu wykonawce wybiera sie z czlonkow tego projektu. Zadanie moze miec tylko jednego wykonawce; mozna tez zostawic je bez przypisania.

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

### Konsola super-admina

Widok dostepny dla `super_admin` pod `/admin`. Jest to domyslny landing super-admina i ma retro/hackerman styl.

Super admin moze:
- zobaczyc liczniki tozsamosci: wszystkie konta, `ROOT`, managerowie i konta przypisane do zespolow,
- dodac nowego uzytkownika do wybranego aktywnego zespolu,
- zobaczyc macierz uzytkownikow z workspace, rola, czasem utworzenia i statusem sesji,
- usunac konto, z zachowaniem zabezpieczenia przed usunieciem wlasnej aktywnej sesji,
- przejsc do `/admin/teams` do zarzadzania zespolami,
- przejsc do `/admin/audit` do globalnego audit logu.

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
- nie da sie ustawic statusu `done`, jesli zadanie ma otwarte zaleznosci albo otwarte podzadania,
- nie da sie utworzyc cyklu zaleznosci,
- nie da sie dodac zaleznosci zadania od samego siebie,
- nie da sie dodac duplikatu zaleznosci.

Kazde zadanie moze miec najwyzej jednego przypisanego wykonawce. Backend odrzuca probe zapisania kilku wykonawcow dla jednego zadania.

Panel `Blokady` na dashboardzie pokazuje:

- zadania zablokowane,
- najwieksze blokery,
- zadania gotowe do pracy.

## Projekty i Szablony

### Tworzenie Projektu

Admin moze utworzyc projekt recznie, podajac:

- nazwe,
- opis,
- kolor,
- czlonkow projektu.

### Czlonkowie Projektu

Projekt moze miec wielu czlonkow. Czlonkostwo daje zwyklemu uzytkownikowi dostep do samego projektu, nawet jesli nie ma jeszcze przypisanego zadania w tym projekcie.

Zadania w projekcie sa nadal widoczne dla zwyklych uzytkownikow tylko wtedy, gdy sa do nich przypisani. To pozwala pokazac kontekst projektu bez ujawniania calej listy zadan kazdemu czlonkowi.

Admin moze zmieniac czlonkow projektu w widoku `Projekty`, w panelu bocznym `Czlonkowie projektu`.

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
- `@username` jako jednego przypisanego wykonawce,
- `dzis`, `dziś`, `today` jako dzisiejszy termin,
- `jutro`, `tomorrow` jako termin na jutro,
- date `YYYY-MM-DD`,
- `!high`, `!medium`, `!low`,
- polskie aliasy priorytetow, np. `!wysoki`, `!sredni`, `!średni`, `!niski`.

Wszystko, co nie jest tokenem sterujacym, trafia do tytulu zadania.

Jesli w szybkim dodawaniu pojawi sie kilka wzmianek `@username`, zadanie zostanie przypisane tylko do pierwszego rozpoznanego uzytkownika.

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

## Powiadomienia E-mail

Aplikacja wysyla powiadomienia e-mail jako HTML z tekstowym fallbackiem. Wszystkie szablony sa generowane w `utils/email_sender.py` i maja wspolny styl TaskMaster: naglowek, kontekst zdarzenia, sekcje szczegolow i przycisk przejscia do zadania albo projektu.

Obslugiwane przypadki:

- przypisanie uzytkownika do zadania,
- zmiana statusu zadania,
- zakonczenie albo przywrocenie zadania,
- aktywnosc w projekcie, np. nowe zadanie, komentarz, podzadanie albo zmiana ustawien,
- zakonczenie lub archiwizacja projektu,
- ostrzezenie o zblizajacym sie terminie zadania.

Szablony automatycznie escapuja dane uzytkownika, np. tytuly zadan, zanim trafia do HTML-a maila.

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

- `POST /auth/signup` - rejestracja (zaleznie od `SIGNUP_MODE`),
- `GET /auth/signup-info?token=...` - tryb signupu i nazwa zespolu (publiczny endpoint),
- `POST /auth/login` - logowanie,
- `POST /auth/logout` - wylogowanie,
- `GET /auth/me` - aktualny uzytkownik (zawiera `team_id`, `role`, opcjonalnie `team`).

Tryb rejestracji ustawia zmienna `SIGNUP_MODE`:

- `disabled` - rejestracja wylaczona,
- `invite_only` (domyslne) - wymagany jednorazowy `invite_token` od menedzera,
- `default_team` - nowe konta laduja w zespole "Default" jako `user`.

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

Payload zadania moze zawierac `assignee_ids`, ale lista moze miec maksymalnie jeden identyfikator:

```json
{
  "title": "Przygotowac oferte",
  "project_id": 1,
  "assignee_ids": [3]
}
```

Pusta lista oznacza zadanie bez przypisanego wykonawcy.

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

Payload projektu moze zawierac `member_ids`, czyli liste czlonkow projektu:

```json
{
  "name": "Wdrozenie klienta",
  "description": "Proces startu wspolpracy",
  "color": "#14b8a6",
  "member_ids": [2, 3, 4]
}
```

### Project Templates

- `GET /project-templates` - lista szablonow,
- `POST /project-templates/<id>/use` - utworzenie projektu z szablonu.

### Stats and Reports

- `GET /stats/dashboard` - statystyki dashboardu,
- `GET /reports/weekly` - raport tygodniowy,
- `GET /activity?limit=100` - aktywnosc,
- `GET /tasks/export/csv` - eksport CSV.

### Team Invites (manager)

- `GET /team/invites` - lista nieskonsumowanych zaproszen w zespole,
- `POST /team/invites` - wygenerowanie jednorazowego tokena (`raw_token` zwracany tylko raz),
- `DELETE /team/invites/<id>` - revoke zaproszenia.

Token wazny przez `INVITE_TOKEN_TTL_DAYS` (domyslnie 7 dni). Manager nie moze wystawiac zaproszen na role `manager` (tylko `user`).

### Admin (super_admin)

Frontend route:
- `/admin` — `Super Admin Console` (domyślny landing super_admina),
- `/admin/teams` — zarządzanie zespołami,
- `/admin/teams/<id>` — szczegóły zespołu,
- `/admin/audit` — globalny audit log.

Backend endpoints:
- `GET /admin/teams` - lista zespolow z statystykami,
- `POST /admin/teams` - utworzenie zespolu (auto-seed szablonow projektow),
- `PUT /admin/teams/<id>` - zmiana nazwy/opisu,
- `POST /admin/teams/<id>/archive` - archiwizacja (zwraca 403 `team_archived` przy logowaniu czlonkom),
- `DELETE /admin/teams/<id>` - usuniecie pustego zespolu (409 `team_not_empty` jesli ma zasoby),
- `GET /admin/teams/<id>/members` - czlonkowie zespolu,
- `POST /admin/teams/<id>/members` - dodanie uzytkownika do zespolu,
- `DELETE /admin/users/<id>` - usuniecie uzytkownika przez super_admina,
- `GET /admin/teams/<id>/audit` - audit log per zespol,
- `GET /admin/audit` - globalny audit log,
- `POST /admin/users/<id>/team` - przeniesienie uzytkownika do innego zespolu (bump session_version, wyrzuca z assignees w starym zespole, przenosi powiadomienia/filtry/aktywnosc),
- `POST /admin/users/<id>/role` - zmiana roli (super_admin -> team_id NULL, manager/user -> team_id wymagany).

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
    __init__.py
    auth.py
    users.py
    tasks.py
    stats.py
    filters.py
    admin.py
    invites.py
    notifications.py
  utils/
    auth_layer.py
    auth_decorators.py
    scoping.py
    errors.py
    email_sender.py
    notifications.py
    realtime.py
    socket_rooms.py
    delete_helpers.py
    logging_config.py
  jobs/
    deadline_notifier.py
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

Backend (220 testów, 1 skip):

```bash
.venv/bin/pytest
```

Szybka walidacja skladni:

```bash
python3 -m py_compile models.py routes/*.py utils/*.py
```

Frontend (18 testów):

```bash
cd frontend
npm run test
```

Frontend build:

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
PUBLIC_BASE_URL=https://twoja-domena.com
LOG_LEVEL=INFO
ENABLE_SCHEDULER=true
SOCKETIO_ASYNC_MODE=threading
MAIL_SERVER=...
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USE_SSL=false
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

Po aktualizacji do wersji z czlonkami projektow trzeba wykonac:

```bash
flask db upgrade
```

Migracja dodaje tabele `project_members`, ktora laczy projekty z wieloma uzytkownikami.

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

Najczestsza przyczyna: zadanie jest zablokowane przez zaleznosc albo ma otwarte podzadania. Otworz szczegoly zadania albo panel `Blokady`, aby zobaczyc, co je blokuje.

### Uzytkownik widzi projekt, ale nie widzi wszystkich zadan

To oczekiwane zachowanie. Czlonkostwo w projekcie daje dostep do projektu, ale zwykly uzytkownik widzi tylko zadania przypisane do siebie. Admin widzi pelna liste zadan projektu.

### Nie moge przypisac kilku osob do zadania

To oczekiwane zachowanie. Kilku uzytkownikow przypisuje sie do projektu jako czlonkow, a pojedyncze zadanie ma tylko jednego wykonawce.

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
- Multi-tenancy: 12 tabel z `team_id NOT NULL`, CHECK constraint na User (`super_admin` → NULL, `manager`/`user` → NOT NULL).
- Auth: `utils/auth_layer.py` — before_request hook z session_version i team archive guard.
- Scoping: `utils/scoping.py` — `team_scoped()` i `get_team_resource_or_404()` dla automatycznej filtracji per-team.
- Projekty maja relacje wiele-do-wielu z uzytkownikami przez `project_members`.
- Zadania maja max. jednego wykonawce (warstwa API ogranicza `assignee_ids` do 1).
- `Comment`, `Subtask`, `TaskDependency`, `CustomField` maja denormalizowane `team_id` z parent task.
- Socket.IO wysyla event `task_action` z `room=f'team:{team_id}'` (per-team isolation).
- Frontend uzywa React Context API zamiast Redux.
- Dark mode opiera sie o Tailwind `darkMode: 'class'`.
- Badania wydajnosciowe: `scripts/seed_perf.py` + `scripts/perf_bench.py`.
