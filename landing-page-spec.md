# TaskMaster2 — Specyfikacja strony promocyjnej

> **Status:** Spec — gotowe do implementacji
> **Data:** 2026-06-30
> **Autor:** Krzysztof Graczyk (kristuff86@proton.me)

---

## 1. Opis ogólny

Samodzielna strona marketingowa dla **TaskMaster2** — pełnoprawnej aplikacji do zarządzania zadaniami zespołowymi. Celem strony jest **zaprezentowanie interfejsu i kluczowych funkcji aplikacji** technicznym odbiorcom oraz liderom zespołów. Strona ma charakter portfolio — pokazuje możliwości produktu, a nie jest optymalizowana pod konwersję sprzedażową.

**Slogan (do wyboru):** Proponowane opcje:

1. *"TaskMaster2 — Inteligentne zarządzanie zadaniami dla zespołów"*
2. *"TaskMaster2 — Planuj. Organizuj. Realizuj."*
3. *"TaskMaster2 — Zarządzanie projektami, które działa w czasie rzeczywistym"*
4. *"TaskMaster2 — Task management, reimagined for teams"* (opcja angielska)

---

## 2. Struktura strony

Wielostronicowa witryna z trzema podstronami:

| Podstrona | Cel |
|-----------|------|
| **Strona główna (Hero)** | Pierwsze wrażenie: makieta aplikacji, slogan, krótka propozycja wartości, przewijanie do funkcji |
| **Funkcje** | Szczegółowa prezentacja 3 kluczowych funkcji ze zrzutami ekranu i opisami |
| **Kontakt** | Kontakt e-mail + prosta stopka |

Nawigacja na wszystkich podstronach: minimalny górny pasek z logo, linkami do podstron i opcjonalnym linkiem do GitHub.

---

## 3. Stack technologiczny

| Warstwa | Wybór | Uzasadnienie |
|---------|-------|--------------|
| Framework | **React 18 + TypeScript** | Taki sam stack jak aplikacja; możliwość reuse wiedzy |
| Build tool | **Vite** | Szybki development, zoptymalizowane buildy |
| Styling | **Tailwind CSS v3** | Taki sam jak w aplikacji; wsparcie dark mode |
| Routing | **React Router v6** | Proste wielostronicowe routowanie |
| Animacje | **Framer Motion** | Już jest zależnością w aplikacji; płynne przejścia między stronami, animacje przy scrollu |
| Deployment | **Static build** (`npm run build` → `dist/`) | Można wdrożyć na Vercel/Netlify/Railway static hosting później |

Brak backendu — w pełni statyczna strona.

---

## 4. Estetyka i branding

### 4.1 Kierunek wizualny

**Ciemny i tech-forward** — inspirowany Vercel, Supabase i nowoczesnymi stronami narzędzi deweloperskich.

- **Tła:** Ciemny granat (`#0f0a1a` / `hsl(262, 80%, 8%)`) — zgodny z dark mode aplikacji
- **Akcent główny:** Turkus (`#14b8a6` / `hsl(180, 100%, 50%)`) — z `--primary` w dark mode
- **Akcent drugorzędny:** Fiolet (`hsl(270, 100%, 70%)`) — z `--secondary` w dark mode
- **Tekst:** Prawie biały (`hsl(180, 100%, 95%)`) na ciemnych tłach
- **Tekst przygaszony:** Stonowany szary (`hsl(262, 20%, 60%)`)
- **Karty/paniele:** Jaśniejsze od tła (`hsl(262, 80%, 12%)`)
- **Ramki:** Subtelne fioletowe obramowania (`hsl(270, 50%, 30%)`)

### 4.2 Typografia

- **Nagłówki:** Pogrubione, duże (`text-3xl` do `text-5xl`), używające domyślnego systemowego fontu sans-serif (Inter jeśli dostępny)
- **Treść:** Zwykła waga, `text-sm` do `text-base`, wygładzone (`antialiased`)
- **Monospace:** Do fragmentów kodu lub skrótów klawiszowych jeśli pokazywane

### 4.3 Logo

Użyć istniejącej ikony PWA z `frontend/public/icon-512.svg`. Jeśli niedostępna, stworzyć prosty znak geometryczny: stylizowany checkbox + zarys clipboardu w turkusie, lub sam tekst "TM" w monogramie.

---

## 5. Szczegóły podstron

### 5.1 Strona główna / Hero (`/`)

**Układ:**
- Sekcja hero na pełną wysokość ekranu z gradientowym ciemnym tłem
- Wyśrodkowana treść: slogan (h1), podtytuł (1-2 zdania), animowany wskaźnik przewijania
- Poniżej: duża makieta aplikacji (zrzut ekranu lub mockup CSS tablicy Kanban)

**Bloki treści:**
1. **Hero** — Slogan + podtytuł + krótka propozycja wartości
   - *Przykład:* "TaskMaster2 to nowoczesne narzędzie do zarządzania zadaniami. Zaprojektowane dla zespołów, które cenią efektywność i przejrzystość."
2. **Pasek podglądu funkcji** — Siatka 3 kolumn z ikonami i hasłami dla 3 kluczowych funkcji (Kanban, Dashboard, Kalendarz), każda z linkiem do podstrony Funkcje
3. **Podświetlenie tech stacku** — Niewielka sekcja z odznakami technologii (React, Flask, Socket.IO, PostgreSQL)
4. **Stopka** — Copyright (Krzysztof Graczyk), link e-mail

**Animacje:**
- Fade-in-up dla tekstu hero przy ładowaniu
- Scroll-triggered reveals dla sekcji poniżej (Framer Motion `whileInView`)
- Subtelna animacja gradientu na tle hero (wolne pulsowanie)

---

### 5.2 Podstrona Funkcje (`/features`)

**Układ:**
- Trzy pełnoszerokościowe sekcje funkcji, każda z:
  - **Lewa strona:** Duży zrzut ekranu funkcji (1200+ px szerokości, wygenerowany z live aplikacji)
  - **Prawa strona:** Tytuł funkcji, opis, wypunktowane możliwości

**Funkcja 1: Tablica Kanban**
- Zrzut ekranu widoku Kanban z zadaniami w 3 kolumnach (Do zrobienia, W toku, Zakończone)
- Opis: Przeciąganie i upuszczanie między kolumnami, synchronizacja w czasie rzeczywistym przez Socket.IO, odznaki priorytetów, avatary przypisanych osób, wskaźniki zablokowanych zadań
- Wzmianka: Optymistyczne aktualizacje z automatycznym przywracaniem przy błędzie

**Funkcja 2: Dashboard i wykresy**
- Zrzut ekranu strony Dashboard z kartami statystyk, tablicą zależności, wykresem kołowym priorytetów, wykresem słupkowym projektów
- Opis: 5 kart statystyk (łączna liczba, ukończone, oczekujące, zaległe, wskaźnik ukończenia), wykres kołowy według priorytetu, wykres słupkowy według projektu, panel raportu tygodniowego, tablica zależności

**Funkcja 3: Kalendarz**
- Zrzut ekranu widoku Kalendarza z zadaniami na datach
- Opis: Widok miesięczny z harmonogramem zadań, kodowane kolorami według priorytetu/projektu, panel boczny ze szczegółami zadania

**Każda sekcja funkcji zawiera:**
- Adnotację CTA: "Dostępne od razu po zalogowaniu"
- Płynne animacje scrolla między sekcjami

---

### 5.3 Podstrona Kontakt (`/contact`)

**Układ:**
- Wyśrodkowana karta na ciemnym tle
- Proste dane kontaktowe:
  - **E-mail:** [kristuff86@proton.me](mailto:kristuff86@proton.me)
  - **Autor:** Krzysztof Graczyk
- Opcjonalnie: mała sekcja linków społecznościowych (GitHub, LinkedIn — do potwierdzenia)
- Przycisk powrotu do strony głównej

---

## 6. Zrzuty ekranu

### 6.1 Plan generowania

Ponieważ użytkownik wybrał **prawdziwe zrzuty ekranu**, należy:

1. Uruchomić aplikację lokalnie (backend + frontend)
2. Zasiedlić demo (użyć `scripts/seed_production.py` lub stworzyć demo seed)
3. Przejść do każdej podstrony i zrobić zrzuty w wysokiej rozdzielczości
4. Zapisać jako WebP w katalogu `public/screenshots/` strony landingowej

**Wymagane zrzuty ekranu:**

| Zrzut | Ścieżka | Uwagi |
|-------|---------|-------|
| Tablica Kanban | `/kanban` | 3 kolumny z zadaniami, niektóre zablokowane, różne priorytety |
| Dashboard | `/dashboard` | Z kartami statystyk, wykresami, tablicą zależności |
| Kalendarz | `/calendar` | Widok miesięczny z zadaniami na datach |

**Alternatywne podejście (jeśli aplikacja nie może być uruchomiona):** Zbudować zrzuty jako wysokiej jakości mockupy HTML/CSS dokładnie odwzorowujące style Tailwind aplikacji.

---

## 7. Struktura projektu

```
landing/
├── public/
│   ├── screenshots/
│   │   ├── kanban.webp
│   │   ├── dashboard.webp
│   │   └── calendar.webp
│   └── icon.svg              # Skopiowane z manifest.json aplikacji
├── src/
│   ├── App.tsx               # Konfiguracja routingu
│   ├── main.tsx              # Punkt wejścia
│   ├── index.css             # Imports Tailwind + własny ciemny motyw
│   ├── components/
│   │   ├── Layout.tsx        # Otoczka Navbar + Stopka
│   │   ├── HeroSection.tsx   # Sekcja hero strony głównej
│   │   ├── FeatureCard.tsx   # Wielokrotnego użytku karta funkcji w siatce
│   │   ├── FeatureShowcase.tsx # Pełnoszerokościowy blok funkcji (zrzut + tekst)
│   │   └── ContactForm.tsx   # Strona kontakt
│   ├── pages/
│   │   ├── HomePage.tsx
│   │   ├── FeaturesPage.tsx
│   │   └── ContactPage.tsx
│   └── vite-env.d.ts
├── index.html
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── vite.config.ts
└── README.md
```

---

## 8. URL-e i nawigacja

- `/` — Strona główna / Hero
- `/features` — Funkcje
- `/contact` — Kontakt

Górny pasek nawigacyjny (fixed, półprzezroczyste ciemne tło z rozmyciem):
- Logo (lewo) → link do `/`
- Linki nawigacyjne (środek/prawo): Funkcje, Kontakt
- Wszystkie linki używają React Router do nawigacji

---

## 9. Responsywność

- **Desktop-first** — zrzuty ekranu i układ zoptymalizowane dla ekranów 1280px+
- **Tablet** (768px+) — sekcje funkcji układają się pionowo, zrzuty skalują się w dół
- **Mobile** (<768px) — układ jednokolumnowy, mniejsze zrzuty, hamburger menu dla nawigacji

---

## 10. Wydajność i SEO

- Wszystkie zrzuty ekranu w formacie **WebP** dla mniejszych rozmiarów plików
- Leniwe ładowanie zrzutów z `loading="lazy"`
- Meta tagi: `<title>`, `<meta name="description">`, `<meta name="keywords">` dla każdej podstrony
- Open Graph tagi do udostępniania w social media
- Strona statyczna → szybkie ładowanie, brak potrzeby SSR

---

## 11. Kroki implementacji

1. **Inicjalizacja projektu** — `npm create vite@latest landing -- --template react-ts`
2. **Instalacja zależności** — `tailwindcss`, `react-router-dom`, `framer-motion`, `postcss`, `autoprefixer`
3. **Konfiguracja Tailwind** — ciemny motyw zgodny z paletą aplikacji
4. **Generowanie zrzutów ekranu** — uruchomienie aplikacji, seed danych, wykonanie zrzutów
5. **Budowa komponentów** — Layout, Hero, FeatureShowcase, komponenty podstron
6. **Konfiguracja routingu** — React Router dla 3 podstron
7. **Dodanie animacji** — Framer Motion dla przejść między stronami i odkrywania przy scrollu
8. **Build i deploy** — `npm run build` → wdrożenie na wybranej platformie

---

## 12. Otwarte pytania / przyszłe rozważania

| Pytanie | Status |
|---------|--------|
| Link do repozytorium GitHub projektu? | Nie określono — można dodać przycisk "Zobacz na GitHub" |
| Linki do social media w stopce? | Nie określono — można dodać później |
| Wersja angielska strony? | Treść jest po polsku, zgodnie z UI aplikacji — angielska wersja do dodania później |
| Narzędzia/format zrzutów ekranu? | Standardowe zrzuty z devtools przeglądarki lub skrypt Puppeteer |
| Aktualny URL wdrożonej aplikacji? | Nie udostępniony — link do demo ukryty zgodnie z prośbą |

---

## Zmiany względem poprzedniej wersji

- **Cały przetłumaczony na język polski** — nagłówki, opisy, tabele, lista kroków
- Usunięta sekcja "Multi-language support" z tabeli otwartych pytań (teraz domyślnie PL)
- Zaktualizowany opis celu strony na bardziej precyzyjny
