# Poprawki 3 — Plan ulepszeń

> Branch: `poprawki3`
> Created: 2026-06-05

---

## Legenda

- `[ ]` — do zrobienia
- `[x]` — zrobione

---

## 🔴 Krytyczne / Bezpieczeństwo

- [ ] **1. Domyślne hasło admina w kodzie** (`config.py:38`)
  - `DEFAULT_ADMIN_PASSWORD` ma fallback `"dakos1admin2"` w source code
  - Railway używa env vars, ale kod wycieka — usunąć domyślne hasło, wymuszać ustawienie przez env

- [ ] **2. Certyfikaty SSL w repo** (`nginx/ssl/`)
  - `.pem` i `key.pem` są untracked ale wiszą w katalogu
  - Dodać `nginx/ssl/` do `.gitignore`

---

## 🟡 Średnie — dead code, potencjalne bugi

- [ ] **3. `utils/task_visibility.py` — dead code**
  - Używa starego systemu ról (`user.role == 'admin'`), który nie istnieje od team-workspaces
  - Funkcje nie są importowane nigdzie — usunąć plik

- [ ] **4. `utils/socket_rooms.py` — dead code**
  - `task_recipient_ids()` i `project_recipient_ids()` nie są używane
  - Team scope roomy zastąpiły ten mechanizm — usunąć plik

- [ ] **5. `config.py` — nieużywana stała `BASE_DIR`**
  - `BASE_DIR = os.path.abspath(os.path.dirname(__file__))` jest zdefiniowana ale nigdy nie używana
  - Usunąć

- [ ] **6. Memory leak w SocketContext** (`frontend/src/store/SocketContext.tsx`)
  - Cleanup w `useEffect` robi tylko `socket.disconnect()`, nie robi `socket.off()`
  - Nasłuchiwacze (`socket.on`) wiszą w pamięci do next mount
  - Dodać `socket.off()` dla każdego eventu przed disconnect

---

## 🟢 Poprawki kodu — refaktoring

- [ ] **7. Duplikacja sprawdzania roli** (`routes/tasks.py`)
  - `g.get('current_role') not in ('manager', 'super_admin')` powtórzone ~15x
  - Dodać dekorator `@require_manager_or_super` w `utils/auth_decorators.py`

- [ ] **8. `routes/tasks.py` za duży (~850 linii)**
  - Mógłby być podzielony na osobne moduły:
    - `routes/tasks.py` — tylko zadania
    - `routes/projects.py` — projekty (wydzielone)
    - `routes/comments.py` — komentarze (wydzielone)
    - `routes/dependencies.py` — zależności (wydzielone)

- [ ] **9. Brak Error Boundary w React** (`frontend/src/App.tsx`)
  - Crash w dowolnym komponencie → biały ekran
  - Dodać `<ErrorBoundary>` komponent

---

## 🔵 Testy

- [ ] **10. Frontend — więcej testów**
  - Obecnie tylko 18 testów w 2 plikach (EmptyState, CommandPalette)
  - Brak testów dla: AuthPage, TasksPage, TaskDetail, TaskForm, DashboardPage, TeamMembersPage, AdminPage, api/client.ts, contextów

- [ ] **11. Pokrycie kodu (coverage)**
  - `pytest --cov` ani `vitest --coverage` nie są skonfigurowane
  - Dodać konfigurację coverage do obu środowisk

- [ ] **12. Testy E2E**
  - Żadnych testów Playwright/Cypress dla krytycznych ścieżek
  - Przynajmniej: logowanie → create task → invite user → signup z tokenem

---

## ⚪ Drobne

- [ ] **13. N+1 w `get_task_activity()`** (`routes/tasks.py`)
  - Ładuje ActivityLog, potem osobny query na Userów
  - Użyć `joinedload(User)` lub podquery

- [ ] **14. Brak `__init__.py` w `tests/`**
  - Działa bez, ale konwencyjnie warto dodać dla kompatybilności z niektórymi narzędziami

- [ ] **15. Mieszane PL/EN w kodzie**
  - Komunikaty błędów po polsku, ale kod i logi po angielsku
  - Przejrzeć i ujednolicić (np. wszystkie komunikaty użytkownika po polsku, kod po angielsku)

---

## Postęp

| Poziom | Tasks | Zrobione |
|--------|-------|----------|
| 🔴 Krytyczne | 1-2 | 0/2 |
| 🟡 Średnie | 3-6 | 0/4 |
| 🟢 Refaktoring | 7-9 | 0/3 |
| 🔵 Testy | 10-12 | 0/3 |
| ⚪ Drobne | 13-15 | 0/3 |
| **Razem** | **1-15** | **0/15** |
