# TaskMaster2 — Przewodnik użytkownika

Witaj w TaskMaster2 — aplikacji do zarządzania zadaniami zespołowymi. Ten przewodnik pomoże Ci zacząć i poznać najważniejsze funkcje.

> © 2026 Krzysztof Graczyk. Wszelkie prawa zastrzeżone.

---

## Spis treści

1. [Pierwsze kroki](#1-pierwsze-kroki)
2. [Role i uprawnienia](#2-role-i-uprawnienia)
3. [Widok Zadania](#3-widok-zadania)
4. [Widok Dziś](#4-widok-dziś)
5. [Projekty](#5-projekty)
6. [Kanban](#6-kanban)
7. [Dashboard i statystyki](#7-dashboard-i-statystyki)
8. [Kalendarz](#8-kalendarz)
9. [Aktywność](#9-aktywność)
10. [Komentarze i wzmianki](#10-komentarze-i-wzmianki)
11. [Zależności między zadaniami](#11-zależności-między-zadaniami)
12. [Szybkie dodawanie](#12-szybkie-dodawanie)
13. [Powiadomienia](#13-powiadomienia)
14. [Zarządzanie zespołem (manager)](#14-zarządzanie-zespołem-manager)
15. [Panel super-admina](#15-panel-super-admina)
16. [FAQ](#16-faq)

---

## 1. Pierwsze kroki

### Logowanie

1. Otwórz adres aplikacji w przeglądarce.
2. Wpisz nazwę użytkownika i hasło.
3. Kliknij **Zaloguj**.

### Rejestracja przez zaproszenie

Jeśli aplikacja działa w trybie `invite_only` (najczęściej):

1. Otrzymujesz od Managera link postaci `https://app.example.com/auth?token=abc123...`
2. Otwórz link.
3. Wypełnij formularz rejestracji (nazwa, e-mail, hasło).
4. Zaakceptuj regulamin i politykę prywatności.
5. Po wysłaniu zostaniesz zalogowany do swojego zespołu.

### Pierwsze logowanie super-admina

Super-admin (rola domyślnie przypisana do bootstrap konta `admin`) po zalogowaniu trafia od razu do panelu **Zespoły** (`/admin/teams`).

---

## 2. Role i uprawnienia

W TaskMaster2 są trzy poziomy uprawnień:

### 👑 Super Admin

- Operuje **ponad zespołami** (nie należy do żadnego).
- Zarządza zespołami: tworzy, archiwizuje, usuwa, zmienia nazwy.
- Przenosi użytkowników między zespołami.
- Zmienia role (super_admin / manager / user).
- Przegląda audit log (historia operacji administracyjnych).
- **Nie widzi** zadań ani projektów żadnego zespołu — używa wyłącznie panelu `/admin/...`.

### ⚙️ Manager (menedżer zespołu)

- Pełne uprawnienia w **swoim** zespole.
- Tworzy, edytuje, usuwa zadania, projekty, tagi, szablony.
- Przypisuje wykonawców (z członków swojego zespołu).
- Generuje **invite tokens** dla nowych członków.
- Zarządza członkami zespołu.
- **Nie widzi** danych innych zespołów.

### 👤 User (zwykły użytkownik)

- Widzi tylko zadania **przypisane do siebie** w swoim zespole.
- Widzi projekty, w których jest **członkiem** lub ma w nich przypisane zadania.
- Może kończyć swoje zadania (jeśli nie są zablokowane).
- Dodaje komentarze i podzadania w widocznych zadaniach.
- Korzysta z widoków: Dziś, Kanban, Dashboard, Kalendarz, Aktywność (w zakresie swoich zadań).

---

## 3. Widok Zadania

Widok główny po zalogowaniu (manager / user).

### Lista zadań

- **Wyszukiwarka** w górnej części — szuka po tytule i notatkach.
- **Filtry**: priorytet, projekt, status, zablokowane.
- **Statystyki** widocznej strony (ile zakończonych, ile w toku itd.).
- **Paginacja** — domyślnie 24 zadania na stronę.

### Akcje na zadaniu

- Kliknij zadanie → otwiera **panel szczegółów** po prawej (lub modal na mobile).
- W szczegółach:
  - Edytuj tytuł, priorytet, projekt, termin.
  - Notatki (markdown / plain).
  - Podzadania (checklista).
  - Komentarze (z wzmianami `@username`).
  - Zależności (co blokuje to zadanie, co to zadanie blokuje).
  - Tagi.
  - Historia zmian.
  - Przyciski: **Start** (in_progress), **Zakończ**, **Usuń**.

### Operacje masowe (manager)

Zaznacz checkboxy przy zadaniach → pasek u góry pojawia się z opcjami:
- Zakończ zaznaczone.
- Usuń zaznaczone.
- Zmień priorytet / status / projekt zaznaczonych.

### Tworzenie zadania

1. Kliknij **+ Nowe zadanie** (prawy górny róg).
2. Wypełnij:
   - **Tytuł** (wymagane).
   - **Priorytet**: niski / średni / wysoki.
   - **Projekt** (opcjonalny).
   - **Wykonawca** — jedna osoba z Twojego zespołu.
   - **Termin** (opcjonalny).
   - **Notatki**.
3. **Zapisz**.

---

## 4. Widok Dziś

Skupiony widok na codzienną pracę. Otwórz przez sidebar **Dziś**.

### Sekcje

- 🔴 **Po terminie** — zadania, których termin minął.
- 🟡 **Na dziś** — zadania z dzisiejszym terminem.
- 🟢 **Następne 7 dni** — zadania z terminem w nadchodzącym tygodniu.

### Metryki na górze

- Liczba zadań w każdej sekcji.
- **Gotowe do pracy** — bez aktywnych blokad.
- **Zablokowane** — czekające na inne zadania.
- **Wysoki priorytet** — count.

### Akcje

- **Start** — przełącza status na `in_progress`.
- **Zakończ** — kończy zadanie (jeśli nie zablokowane).

---

## 5. Projekty

Otwórz przez sidebar **Projekty**.

### Lista projektów

- Karty z nazwą, opisem, kolorem, postępem (% ukończenia), liczbą członków.
- Filtr: aktywne / zarchiwizowane.

### Szczegóły projektu

Kliknij projekt:
- Header: nazwa, opis, postęp.
- Lista zadań projektu.
- Panel **Członkowie** — managera może dodawać/usuwać.
- Sekcja **Aktywność** projektu.

### Tworzenie projektu

#### Pusty projekt

1. **+ Nowy projekt**.
2. Wypełnij: nazwa, opis, kolor, członkowie (z Twojego zespołu).
3. **Utwórz**.

#### Z szablonu

1. W zakładce **Szablony projektów** wybierz jeden z 3 dostępnych:
   - **Wdrożenie klienta** — proces startu współpracy.
   - **Release** — checklista wydania.
   - **Kampania** — plan kampanii marketingowej.
2. Podaj **nazwę projektu** i **datę startu**.
3. Aplikacja utworzy projekt z gotowymi zadaniami, terminami (liczonymi od daty startu) i zależnościami.

### Zakończenie projektu

Projekt można zakończyć dopiero gdy spełnia **checklistę gotowości**:

- ✅ Wszystkie zadania zakończone.
- ✅ Brak zablokowanych zadań.
- ✅ Brak otwartych zadań po terminie.

Sprawdź checklistę przyciskiem **Sprawdź gotowość**.

---

## 6. Kanban

Trzy kolumny:

- **Do zrobienia**
- **W toku**
- **Zakończone**

### Drag & Drop

Przeciągnij zadanie między kolumnami żeby zmienić jego status.

**Uwaga**: Jeśli zadanie jest zablokowane przez otwartą zależność, nie da się go przenieść do kolumny "Zakończone".

---

## 7. Dashboard i statystyki

Otwórz przez sidebar **Dashboard**.

### Sekcje

- **Liczniki**: wszystkie zadania, zakończone, w toku, zaległe, % ukończenia.
- **Wykres priorytetów** — rozkład wysokie/średnie/niskie.
- **Wykres projektów** — top projekty po liczbie zadań.
- **Panel Blokady**:
  - Zablokowane.
  - Najwięksi blokerzy.
  - Gotowe do pracy.
- **Raport tygodniowy** — utworzone, zakończone, po terminie, zablokowane, otwarte (zakres tygodnia).

---

## 8. Kalendarz

Otwórz przez sidebar **Kalendarz**.

- Widok miesięczny.
- Zadania pojawiają się w dniach swojego terminu.
- Kliknij dzień → zobaczysz wszystkie zadania z tym terminem.
- Kliknij zadanie → otwiera panel szczegółów.

---

## 9. Aktywność

Otwórz przez sidebar **Aktywność**.

Chronologiczny feed wszystkich zdarzeń w zespole:

- Tworzenie zadań.
- Aktualizacje (kto, co, kiedy).
- Komentarze i wzmianki.
- Zmiany podzadań.
- Zakończenia i przywrócenia.
- Zmiany zależności.

---

## 10. Komentarze i wzmianki

W szczegółach zadania znajdziesz sekcję **Komentarze**.

### Dodawanie

Wpisz tekst i naciśnij **Dodaj komentarz**.

### Wzmianki (mentions)

```
@anna sprawdzisz to przed piątkiem?
```

Jeśli `anna` istnieje w Twoim zespole:
- Komentarz zostanie zapisany.
- Anna otrzyma **powiadomienie** w aplikacji.
- Anna zobaczy toast z dźwiękiem (jeśli aktualnie jest online).
- W feedzie aktywności pojawi się wpis `mentioned`.

**Wzmianki działają tylko w obrębie Twojego zespołu** — nie możesz wzmiankować użytkowników z innych zespołów.

---

## 11. Zależności między zadaniami

**Zależność** = jedno zadanie musi zostać zakończone przed innym.

```
"Przygotować testy"  →  "Wdrożyć na produkcję"
```

Tutaj "Wdrożyć na produkcję" jest zablokowane dopóki "Przygotować testy" nie zostanie zakończone.

### Dodawanie zależności

1. Otwórz szczegóły zadania.
2. Sekcja **Zależności**.
3. **Dodaj zależność** → wybierz zadanie z listy (tylko z Twojego zespołu).
4. Aplikacja sprawdzi:
   - Czy zadanie nie zależy od samego siebie.
   - Czy nie powstanie cykl (A→B→C→A).
   - Czy zadanie nie jest już dodane.

### Co widać w szczegółach

- **Blokowane przez** — lista zadań, które muszą się skończyć przed tym.
- **Blokuje** — lista zadań, które czekają na to.
- **Status: Zablokowane** (czerwona ikona) jeśli ma otwarte zależności.

### Panel Blokady (Dashboard)

- Wszystkie zablokowane zadania.
- Top 10 największych "blokerów" (zadania, które blokują najwięcej innych).
- Zadania gotowe do pracy.

---

## 12. Szybkie dodawanie

**Command Palette** otwiera się skrótem:

- Windows / Linux: `Ctrl + K`
- macOS: `Cmd + K`

### Składnia szybkiego dodawania

Wpis zaczynający się od `+`:

```
+ Napisać ofertę dla klienta #Sprzedaż @anna jutro !high
```

### Tokeny

| Token | Znaczenie | Przykład |
|-------|-----------|----------|
| `#Projekt` | Nazwa projektu | `#Sprzedaż` |
| `@username` | Wykonawca | `@anna` |
| `dziś` / `today` | Termin: dzisiaj | `dziś` |
| `jutro` / `tomorrow` | Termin: jutro | `jutro` |
| `YYYY-MM-DD` | Konkretna data | `2026-06-15` |
| `!high` / `!medium` / `!low` | Priorytet | `!high` |
| `!wysoki` / `!sredni` / `!niski` | Priorytet (PL) | `!wysoki` |

Wszystko, co nie jest tokenem, trafia do tytułu zadania.

### Przykłady

```
+ Sprawdzić rezultaty kampanii !low
→ tytuł: "Sprawdzić rezultaty kampanii", priorytet: niski

+ Spotkanie z klientem #Marketing jutro !high
→ tytuł: "Spotkanie z klientem", projekt: Marketing, termin: jutro, priorytet: wysoki

+ Zaktualizować dokumentację @piotr 2026-07-01
→ tytuł: "Zaktualizować dokumentację", wykonawca: piotr, termin: 1 lipca 2026
```

---

## 13. Powiadomienia

### W aplikacji

Dzwonek w prawym górnym rogu pokazuje liczbę nieprzeczytanych powiadomień. Kliknij żeby zobaczyć listę.

### Typy powiadomień

- **Przypisanie** — zostałeś przypisany do zadania.
- **Wzmianka** — ktoś napisał `@ciebie` w komentarzu.
- **Zmiana statusu** — zadanie, którym jesteś zainteresowany, zmieniło status.
- **Zbliżający się termin** — zadanie ma termin w ciągu 24h.
- **Zakończenie projektu** — projekt, w którym jesteś członkiem, został zakończony.

### E-mail

Jeśli administrator instancji skonfigurował SMTP, możesz dodatkowo otrzymywać powiadomienia mailem dla najważniejszych zdarzeń (przypisanie, zmiana statusu).

---

## 14. Zarządzanie zespołem (manager)

W sidebarze: **Członkowie zespołu** i **Zaproszenia**.

### Lista członków

Tabela:
- Nazwa, email.
- Rola (manager / user).
- Data dołączenia.

Akcje:
- **Usuń z zespołu** — zwykłemu userowi (nie sobie).

### Zaproszenia (invite tokens)

#### Generowanie zaproszenia

1. Zakładka **Zaproszenia** → **Wygeneruj zaproszenie**.
2. (Opcjonalnie) Podaj e-mail osoby zapraszanej.
3. Kliknij **Wygeneruj**.
4. Aplikacja pokaże:
   - **Raw token** (jednorazowy, kopiuj do schowka).
   - **Pełny link** typu `https://app.example.com/auth?token=...`.
   - **Datę wygaśnięcia** (domyślnie 7 dni).

⚠️ **Token widoczny tylko raz**. Jeśli go nie skopiujesz, musisz wygenerować nowy.

#### Lista zaproszeń

Wszystkie aktywne (niewygasłe, niewykorzystane) tokeny:
- Data utworzenia.
- Data wygaśnięcia.
- Email zapraszanej osoby.
- Akcja **Revoke** — unieważnia zaproszenie.

#### Limitacja

Manager **nie może** wystawiać zaproszeń z `default_role='manager'`. Promocja do managera wymaga super-admina.

---

## 15. Panel super-admina

Domyślny landing po loginie: `/admin/teams`.

### Zarządzanie zespołami

Lista wszystkich zespołów:
- Nazwa, slug, opis.
- Liczba członków.
- Liczba zasobów (zadań, projektów).
- Status (aktywny / archived).
- Data utworzenia.

#### Akcje

- **+ Nowy zespół** — tworzy zespół (auto-seed 3 szablonów projektów).
- **Edycja** — zmiana nazwy / opisu (slug aktualizuje się automatycznie).
- **Archiwizacja** — uniemożliwia logowanie członkom (bumpuje session_version). Zespół znika z listy aktywnych ale dane pozostają.
- **Unarchive** — przywrócenie zespołu do aktywności.
- **Usuń** — możliwe **tylko gdy zespół jest pusty** (brak userów, brak zasobów). Inaczej `409 team_not_empty`.

### Szczegóły zespołu

Kliknij zespół → szczegóły:
- Header z toggle archiwizacji.
- **Członkowie** — lista z opcjami:
  - **Promote** → manager.
  - **Demote** → user.
  - **Move to team** → przeniesienie do innego zespołu (atomicznie: bump session_version, przeniesienie filtrów / powiadomień / aktywności, usunięcie z assignees w starym zespole).
- **Audit log** — wszystkie operacje administracyjne dotyczące tego zespołu.

### Zarządzanie rolami

`/admin/users/<id>/role`:

- `super_admin` → `team_id` ustawiane na NULL.
- `manager` / `user` → wymaga `team_id` w body.

Każda zmiana roli bumpuje `session_version` (force re-login).

### Globalny audit log

`/admin/audit` — wszystkie operacje administracyjne ze wszystkich zespołów.

Akcje rejestrowane:
- `team.create`, `team.update`, `team.archive`, `team.unarchive`, `team.delete`.
- `user.move`, `user.role_change`.

---

## 16. FAQ

### Nie mogę zakończyć zadania — dlaczego?

Najczęstsze powody:
- Zadanie ma **otwarte zależności** (czeka na inne zadania).
- Zadanie ma **otwarte podzadania**.

Otwórz szczegóły zadania, sekcja **Blokowane przez** pokazuje co blokuje. Zakończ blokery → wtedy będziesz mógł zakończyć główne zadanie.

### Widzę projekt, ale nie widzę wszystkich zadań

To zachowanie jest **celowe**. Jako zwykły user widzisz projekt (bo jesteś w nim członkiem), ale tylko swoje przypisane zadania w nim. Manager widzi pełną listę.

### Wzmianka nie zadziałała

Sprawdź:
- Czy `@username` zgadza się dokładnie (case-sensitive).
- Czy ta osoba **należy do Twojego zespołu**. Wzmianki nie przekraczają granic zespołów.

### Quick-add zignorował projekt

Sprawdź:
- Czy nazwa projektu po `#` istnieje **w Twoim zespole** (case-sensitive).
- Jeśli projekt nie istnieje, token `#Nazwa` zostaje w tytule jako tekst.

### Quick-add zignorował wykonawcę

Token `@user_z_innego_teamu` **zostaje w tytule jako literał**, bo TaskMaster2 nie znajduje takiego usera w Twoim zespole.

### Wylogowało mnie nagle

Jedna z trzech sytuacji:
- Twój super-admin **przeniósł Cię do innego zespołu** lub **zmienił Twoją rolę** (bumpuje session_version).
- Twój zespół został **zarchiwizowany**.
- Sesja wygasła w sposób naturalny.

W każdym wypadku zaloguj się ponownie.

### Nie mogę dodać kilku osób do zadania

To również **celowe**. Każde zadanie ma tylko **jednego wykonawcę**. Wielu uczestników projektu dodaje się jako **członków projektu** — wtedy widzą projekt i mogą dostać przypisane zadania.

### Reset hasła

Aplikacja w wersji self-hosted nie ma funkcji "Forgot password". Skontaktuj się z managerem swojego zespołu lub super-adminem instancji, by zresetował Ci hasło ręcznie.

### Tryb ciemny

Ikonka słońce/księżyc w prawym górnym rogu (obok dzwonka). Stan zapamiętywany w przeglądarce.

### Skróty klawiszowe

- `Ctrl/Cmd + K` — Command Palette / quick-add.
- `Esc` — zamknij modal / panel.

---

## Wsparcie

W razie problemów technicznych skontaktuj się z administratorem swojej instancji TaskMaster2.

W sprawach dotyczących oprogramowania (zgłoszenia błędów, prośby o licencję): **Krzysztof Graczyk** (autor).

---

© 2026 Krzysztof Graczyk. Wszelkie prawa zastrzeżone. Patrz [LICENSE](LICENSE).
