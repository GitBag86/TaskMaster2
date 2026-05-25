# TaskMaster2 — Deployment Guide

Self-hosted deployment na serwer Linux (Ubuntu) z Dockerem i Nginx jako reverse proxy. Aplikacja jest dostępna przez HTTPS, za FortiGate.

Dla konfiguracji FortiGate zobacz [FORTIGATE_SETUP.md](FORTIGATE_SETUP.md).

---

## 🏗️ Architektura

```
Internet / FortiGate
        ↓ HTTPS (443)
   Nginx (taskmaster-nginx)
   - SSL/TLS termination
   - Rate limiting
   - Security headers
        ↓ HTTP (5000)
   Flask + Gunicorn (taskmaster-web)
        ↓
   SQLite (volume: ./instance)
```

Wszystko żyje w sieci `app-network` w Docker Compose.

---

## ✅ Wymagania

- Ubuntu 20.04+ (lub inna nowsza dystrybucja Linux)
- Docker 24+ i Docker Compose v2
- Otwarte porty 80/443 do serwera
- Opcjonalnie: domena (dla Let's Encrypt)

---

## 🚀 Quick Start (5 minut)

### 1. Przygotuj serwer

```bash
ssh user@your-server-ip

# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# wyloguj i zaloguj ponownie
exit
ssh user@your-server-ip
```

### 2. Sklonuj repo

```bash
sudo mkdir -p /opt && cd /opt
sudo git clone https://github.com/your-repo/taskmaster2.git
cd taskmaster2
sudo chown -R $USER:$USER .
```

### 3. Wygeneruj certyfikat SSL

**Self-signed (sieć wewnętrzna / firmowa):**
```bash
chmod +x scripts/setup-ssl.sh
./scripts/setup-ssl.sh taskmaster.local admin@taskmaster.local
```

**Let's Encrypt (publiczna domena):**
```bash
sudo apt install -y certbot
./scripts/setup-ssl.sh your-domain.com admin@your-domain.com
```

### 4. Skonfiguruj `.env`

```bash
cp .env.example .env
nano .env
```

Ustaw:
```
SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))")
CORS_ORIGINS=https://your-domain.com
DEFAULT_ADMIN_PASSWORD=silne-haslo
```

### 5. Uruchom

```bash
docker-compose up -d --build
```

Sprawdź:
```bash
curl -k https://localhost/health
docker-compose ps
docker-compose logs -f
```

### 6. Otwórz firewall

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

W FortiGate utwórz regułę Allow dla portów 80/443 — szczegóły w [FORTIGATE_SETUP.md](FORTIGATE_SETUP.md).

---

## 🔐 Konfiguracja Nginx

Pliki:
```
nginx/
├── nginx.conf                # główna konfiguracja
├── conf.d/taskmaster.conf    # routing aplikacji
└── ssl/                      # certyfikaty (cert.pem, key.pem)
```

### Co Nginx robi

| Funkcja | Detale |
|---------|--------|
| SSL/TLS | TLSv1.2 + TLSv1.3, strong ciphers, HSTS |
| Rate limiting | Auth: 5/min, API: 30/s, general: 10/s |
| Security headers | X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy |
| Gzip | Włączony dla text/JSON/JS |
| WebSocket | `/socket.io` z upgrade i 7-dniowym timeoutem |
| Static files | SPA fallback przez `try_files` |

### Zmiana domeny

Edytuj `nginx/conf.d/taskmaster.conf`:
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    ...
}
```

Następnie:
```bash
docker-compose exec nginx nginx -s reload
```

---

## 🔄 Operacje

```bash
# Start
docker-compose up -d

# Stop
docker-compose down

# Restart
docker-compose restart

# Logi (live)
docker-compose logs -f

# Logi tylko jednego serwisu
docker-compose logs -f web
docker-compose logs -f nginx

# Status
docker-compose ps

# Wykonaj komendę w kontenerze
docker-compose exec web flask db upgrade
docker-compose exec nginx nginx -t
```

---

## 🔄 Aktualizacja kodu

```bash
cd /opt/taskmaster2
git pull origin main
docker-compose down
docker-compose up -d --build
```

Jeśli były zmiany w modelach, migracje uruchamiają się automatycznie (`start.sh` wywołuje `flask db upgrade` przed startem Gunicorna).

---

## 💾 Backup

### SQLite

```bash
# Ręczny snapshot
docker-compose exec web cp /app/instance/tasks.db /app/instance/tasks.db.$(date +%F)

# Automatyczny backup do hosta (cron co noc o 2:00)
0 2 * * * cd /opt/taskmaster2 && docker-compose exec -T web cp /app/instance/tasks.db /app/instance/tasks.db.$(date +\%F)

# Kopia poza serwer (przykład: scp)
scp /opt/taskmaster2/instance/tasks.db.* backup-host:/backups/taskmaster/
```

### Restore

```bash
docker-compose down
cp /opt/taskmaster2/instance/tasks.db.2026-05-23 /opt/taskmaster2/instance/tasks.db
docker-compose up -d
```

---

## 📊 Monitoring

```bash
# Health checks
curl -k https://localhost/health      # tylko proces Flask
curl -k https://localhost/ready       # DB + Socket.IO

# Zasoby kontenerów
docker stats --no-stream

# Skrypt monitoringu (interaktywny)
./scripts/monitor.sh
```

Health checks są też wbudowane w `docker-compose.yml` — `docker-compose ps` pokaże status `healthy`/`unhealthy`.

---

## 🆘 Troubleshooting

### "Connection refused"
```bash
docker-compose ps                     # czy kontenery działają?
docker-compose logs web | tail -50    # co mówi Flask?
sudo lsof -i :443                     # czy port jest otwarty?
```

### "SSL certificate problem"
```bash
openssl x509 -in nginx/ssl/cert.pem -text -noout    # sprawdź certyfikat

# Regeneruj
rm nginx/ssl/*
./scripts/setup-ssl.sh taskmaster.local admin@taskmaster.local
docker-compose restart nginx
```

### "CORS error" w przeglądarce
```bash
grep CORS_ORIGINS .env
# Powinno zawierać URL z którego wchodzisz, np:
# CORS_ORIGINS=https://taskmaster.example.com
docker-compose restart web
```

### "WebSocket connection failed"
```bash
# Czy Socket.IO odpowiada przez Nginx?
curl -k https://localhost/socket.io/?EIO=4

# Czy Flask emituje?
docker-compose logs web | grep socket
```

### "Port already in use" (80/443)
```bash
sudo lsof -i :80
sudo lsof -i :443
sudo systemctl stop apache2     # albo inny serwis trzymający port
```

### "Frontend not built"
W normalnej sytuacji `Dockerfile` buduje frontend automatycznie. Jeśli widzisz błąd:
```bash
docker-compose build --no-cache web
docker-compose up -d
```

### Flask nie startuje (migracje)
```bash
docker-compose run --rm web flask db upgrade
docker-compose up -d
```

---

## 🔒 Hardening (rekomendacje)

### SSH
```bash
sudo nano /etc/ssh/sshd_config
# Port 2222
# PermitRootLogin no
# PasswordAuthentication no   # użyj kluczy SSH
sudo systemctl restart sshd
```

### Fail2Ban
```bash
sudo apt install -y fail2ban
sudo systemctl enable --now fail2ban
```

### .env permissions
```bash
chmod 600 .env
```

---

## 📋 Checklist przed pierwszym deployem

- [ ] Wygenerowany losowy `SECRET_KEY` (32 bajty hex)
- [ ] Zmienione `DEFAULT_ADMIN_PASSWORD`
- [ ] `CORS_ORIGINS` ustawione na właściwą domenę / IP
- [ ] `SIGNUP_MODE` ustawiony zgodnie z planem rejestracji (`invite_only` zalecane dla wewnętrznych instancji)
- [ ] Certyfikat SSL wygenerowany w `nginx/ssl/`
- [ ] Porty 80/443 otwarte w UFW i FortiGate
- [ ] Skonfigurowane backupy SQLite (cron)
- [ ] Healthcheck zwraca 200 (`curl -k https://localhost/health`)
- [ ] Frontend ładuje się bez błędów CORS
- [ ] Socket.IO łączy się (sprawdź browser DevTools → Network → WS)
- [ ] Test logowania jako bootstrap admin (zostaje promotowany do `super_admin`) → zmiana hasła
- [ ] Super admin tworzy pierwszy zespół i promuje wybranego użytkownika do `manager`

Po przejściu wszystkiego — gotowe do oddania użytkownikom.

---

## 👥 Team Workspaces (multi-tenancy)

TaskMaster2 obsługuje izolację zespołów. Po pierwszym deploy bootstrap admin ma rolę `super_admin` (operuje ponad zespołami), a pozostali użytkownicy są przypisani do zespołu `Default` (utworzonego automatycznie przez migrację).

### Zmienne środowiskowe

```bash
# Tryb rejestracji nowych kont
#   disabled     - rejestracja wylaczona, super_admin/manager zaklada konta recznie
#   invite_only  - wymagany jednorazowy token od managera (DOMYSLNE, zalecane)
#   default_team - nowe konta laduja w zespole "Default" jako zwykly user
SIGNUP_MODE=invite_only

# Czas zycia tokena zaproszenia (dni)
INVITE_TOKEN_TTL_DAYS=7

# Strona startowa dla super-admina po zalogowaniu
SUPER_ADMIN_LANDING=/admin/teams
```

### Migracja istniejącej instancji

Aktualizacja z wersji sprzed feature/team-workspaces wymaga uruchomienia migracji `81d661ec5395` i `2c8e44f754b0`. Migracja jest idempotentna i automatycznie:

1. Tworzy zespół `Default`.
2. Promuje bootstrap admina (`DEFAULT_ADMIN_USERNAME`) do roli `super_admin` z `team_id=NULL`.
3. Pozostali użytkownicy z rolą `admin` → `manager` w zespole `Default`.
4. Wszyscy `user` → członkowie zespołu `Default`.
5. Wszystkie istniejące zadania, projekty, tagi, filtry, szablony, powiadomienia, aktywność trafiają do `Default` (`team_id`).
6. Bumpuje `session_version` u wszystkich userów (każda aktywna sesja zostaje unieważniona — wymagana ponowna autoryzacja).
7. Seeduje `Default` 3 szablonami projektów z katalogu.
8. Drugą migracją wprowadza constraint `NOT NULL` na `team_id` + CHECK `ck_user_team_role_consistency`.

### Bezpieczna procedura migracji na produkcji

```bash
cd /opt/taskmaster2

# 1. Backup PRZED migracją
docker-compose exec -T web cp /app/instance/tasks.db /app/instance/tasks.db.pre-team-migration

# 2. Test backupu na czystej kopii (poza produkcją)
scp instance/tasks.db.pre-team-migration backup-host:/tmp/test.db
# na maszynie testowej: ustaw env, wypal kontener, uruchom flask db upgrade i sprawdź /admin/teams

# 3. Pull i przebudowa
git pull origin main
docker-compose down
docker-compose up -d --build

# 4. Migracja uruchomi się automatycznie ze start.sh; sprawdź logi
docker-compose logs -f web | grep -E '(alembic|team_workspaces|super_admin)'

# 5. Verify: bootstrap admin ma role super_admin, Default team istnieje
curl -k https://localhost/health
docker-compose exec web python -c "from app import create_app; from models import db, Team, User; app=create_app(); ctx=app.app_context(); ctx.push(); print('teams:', [t.name for t in Team.query.all()]); print('super_admins:', [u.username for u in User.query.filter_by(role='super_admin').all()])"
```

### Rollback

Jeśli migracja zachowuje się nieprawidłowo, można cofnąć schema:

```bash
docker-compose exec web flask db downgrade -1   # cofnij Migrację 002 (NOT NULL + constraints)
docker-compose exec web flask db downgrade -1   # cofnij Migrację 001 (team_id columns)
# Tabele team / team_invite / team_audit_log zostają — są nieszkodliwe.
```

Pełniejszy rollback: zatrzymaj kontener, zastąp `instance/tasks.db` plikiem `tasks.db.pre-team-migration`, zrestartuj kontener z poprzednim build.

### Operacje po deploy

1. Zaloguj się jako bootstrap admin → trafiasz na `/admin/teams`.
2. Zmień hasło bootstrap admina.
3. Promuj wybranych userów do `manager` (`POST /admin/users/<id>/role`).
4. Utwórz dedykowane zespoły dla każdego managera (`POST /admin/teams`).
5. Przenieś userów do właściwych zespołów (`POST /admin/users/<id>/team`).
6. Manager każdego zespołu generuje invite tokens dla nowych członków (`POST /team/invites`).
7. Monitoruj `/admin/audit` przez pierwsze 24h.

### Performance

Indeksy z migracji 002 pokrywają hot-path query (`/tasks`, `/tasks/today`, `/tasks/blocked`, `/stats/dashboard`). Benchmark na 5 zespołów × 1000 zadań × 5 komentarzy: wszystkie 4 endpointy < 100ms p95 na SQLite. Skrypt: `scripts/seed_perf.py` + `scripts/perf_bench.py`.
