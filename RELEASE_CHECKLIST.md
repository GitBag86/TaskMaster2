# Release Checklist (TaskMaster2)

Checklista do użycia przed każdym wdrożeniem na Render.

## 1. Przed commitem (lokalnie)

- [ ] Wejdź do katalogu projektu:
```bash
cd /mnt/c/Users/krzys/CODE/TaskMaster2
```

- [ ] Aktywuj virtualenv:
```bash
source .venv/bin/activate
```

- [ ] Backend testy:
```bash
pytest -q
```

- [ ] Frontend build:
```bash
cd frontend
npm run build
cd ..
```

- [ ] Szybki smoke test lokalny:
  - [ ] logowanie działa
  - [ ] tworzenie zadania działa
  - [ ] edycja zadania (w tym przypisanie usera) działa
  - [ ] modal dodawania/edycji nie ucina się pod headerem

## 2. Commit i push

- [ ] Sprawdź status:
```bash
git status
```

- [ ] Commit:
```bash
git add .
git commit -m "Krótki opis zmian"
```

- [ ] Push:
```bash
git push
```

## 3. Deploy na Render

- [ ] Render -> Web Service -> `Manual Deploy` -> `Deploy latest commit`
- [ ] Poczekaj aż status będzie `Live`
- [ ] Sprawdź logi, czy nie ma tracebacków

## 4. Weryfikacja po deployu (prod)

- [ ] Health endpoint:
```bash
curl https://TWOJ-SERWIS.onrender.com/health
```

- [ ] Ready endpoint:
```bash
curl https://TWOJ-SERWIS.onrender.com/ready
```

- [ ] Smoke test na URL aplikacji:
  - [ ] signup/login
  - [ ] tworzenie taska
  - [ ] edycja taska + przypisanie usera
  - [ ] status taska (todo/in_progress/done)
  - [ ] wylogowanie

## 5. Zmienne środowiskowe (Render)

Upewnij się, że istnieją i mają poprawne wartości:

- [ ] `SECRET_KEY`
- [ ] `SQLALCHEMY_DATABASE_URI`
- [ ] `CORS_ORIGINS` (np. `https://twoj-serwis.onrender.com`)
- [ ] `ENABLE_SCHEDULER` (opcjonalnie: `false`, jeśli nie chcesz jobów)

## 6. Szybki rollback (gdy coś padnie)

- [ ] Render -> `Events` / `Deploys`
- [ ] Wybierz poprzedni działający deploy
- [ ] `Redeploy` poprzedniej wersji
- [ ] Zweryfikuj `/health` i login

## 7. Dobra praktyka na przyszłość

- [ ] Każdy deploy ma mały, czytelny commit
- [ ] Po udanym deployu dodaj tag:
```bash
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin vX.Y.Z
```
- [ ] Dla większych zmian: najpierw deploy na staging

