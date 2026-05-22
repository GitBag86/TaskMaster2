# TaskMaster2 - Production Setup Guide

Kompletny przewodnik do wdrażania TaskMaster2 na serwerze Ubuntu z Nginx, SSL i bezpieczeństwem.

## 🎯 Architektura

```
┌─────────────────────────────────────────────────────────────┐
│                     Internet / FortiGate                     │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS (443)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Nginx (Reverse Proxy)                     │
│  - SSL/TLS Termination                                       │
│  - Rate Limiting                                             │
│  - Security Headers                                          │
│  - Load Balancing                                            │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP (5000)
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              Flask Backend (Gunicorn + gthread)              │
│  - REST API                                                  │
│  - Socket.IO (WebSocket)                                     │
│  - Database ORM                                              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   SQLite / PostgreSQL                        │
│                    (Persistent Volume)                       │
└─────────────────────────────────────────────────────────────┘
```

## 📋 Wymagania

- **OS**: Ubuntu 20.04+ (lub inny Linux)
- **CPU**: 2+ cores
- **RAM**: 2+ GB
- **Disk**: 10+ GB
- **Network**: Dostęp do internetu (dla Let's Encrypt)
- **Domena**: (opcjonalnie, dla Let's Encrypt)

## 🚀 Instalacja (Krok po kroku)

### Krok 1: Przygotuj serwer

```bash
# Zaloguj się na serwer
ssh user@your-server-ip

# Zaktualizuj system
sudo apt update && sudo apt upgrade -y

# Zainstaluj wymagane pakiety
sudo apt install -y \
    curl \
    wget \
    git \
    openssl \
    python3 \
    python3-pip

# Zainstaluj Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Zainstaluj Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
    -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Wyloguj się i zaloguj ponownie, aby grupy Docker zadziałały
exit
ssh user@your-server-ip
```

### Krok 2: Sklonuj aplikację

```bash
# Przejdź do katalogu instalacji
cd /opt

# Sklonuj repozytorium
sudo git clone https://github.com/your-repo/taskmaster2.git
cd taskmaster2

# Zmień właściciela
sudo chown -R $USER:$USER .
```

### Krok 3: Skonfiguruj SSL

**Opcja A: Self-signed (dla testów/sieci wewnętrznej)**

```bash
chmod +x scripts/setup-ssl.sh
./scripts/setup-ssl.sh taskmaster.local admin@taskmaster.local
```

**Opcja B: Let's Encrypt (dla produkcji)**

```bash
# Zainstaluj certbot
sudo apt install -y certbot

# Wygeneruj certyfikat
chmod +x scripts/setup-ssl.sh
./scripts/setup-ssl.sh your-domain.com admin@your-domain.com
```

### Krok 4: Skonfiguruj zmienne środowiskowe

```bash
# Skopiuj plik konfiguracji
cp .env.production .env

# Edytuj zmienne
nano .env
```

**Zmień następujące wartości:**

```bash
# Wygeneruj losowy SECRET_KEY
SECRET_KEY=$(python3 -c 'import secrets; print(secrets.token_hex(32))')

# Zmień hasło admina
DEFAULT_ADMIN_PASSWORD=your-strong-password-here

# Ustaw CORS_ORIGINS na twoją domenę/IP
CORS_ORIGINS=https://your-domain.com

# (Opcjonalnie) Skonfiguruj e-mail
MAIL_SERVER=smtp.gmail.com
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password
```

### Krok 5: Uruchom aplikację

```bash
# Użyj skryptu deploymentu
chmod +x scripts/deploy.sh
./scripts/deploy.sh your-domain.com admin@your-domain.com
```

Lub ręcznie:

```bash
# Zbuduj i uruchom kontenery
docker-compose -f docker-compose.prod.yml up -d --build

# Czekaj na startup
sleep 30

# Sprawdź status
docker-compose -f docker-compose.prod.yml ps
```

### Krok 6: Sprawdź dostęp

```bash
# Lokalnie na serwerze
curl https://localhost/health -k

# Z innego komputera
curl https://your-server-ip/health -k
```

## 🔒 Konfiguracja FortiGate

### Firewall Rules

1. Zaloguj się do FortiGate
2. Przejdź do **Policy & Objects** → **Firewall Policy**
3. Utwórz nową regułę:

```
Name: Allow TaskMaster2
Incoming Interface: WAN
Outgoing Interface: LAN
Source: Any
Destination: Your-Server-IP
Service: HTTPS (443), HTTP (80)
Action: Accept
```

### DDoS Protection (opcjonalnie)

1. Przejdź do **Security Profiles** → **DDoS Policy**
2. Utwórz nową politykę:

```
Name: TaskMaster2-DDoS
Threshold: 100 requests/second
Action: Drop
```

### SSL Inspection (opcjonalnie)

Jeśli chcesz inspektować ruch HTTPS:

1. Przejdź do **Security Profiles** → **SSL/TLS Inspection**
2. Utwórz nową politykę dla TaskMaster2

## 🔐 Bezpieczeństwo

### 1. Firewall (UFW)

```bash
# Otwórz tylko niezbędne porty
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw enable
```

### 2. SSH Hardening

```bash
# Edytuj SSH config
sudo nano /etc/ssh/sshd_config

# Zmień:
Port 2222                    # Zmień port z 22
PermitRootLogin no          # Wyłącz root login
PasswordAuthentication no   # Użyj kluczy SSH
```

### 3. Fail2Ban (opcjonalnie)

```bash
# Zainstaluj
sudo apt install -y fail2ban

# Skonfiguruj
sudo nano /etc/fail2ban/jail.local

# Dodaj:
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true
```

### 4. Nginx Security Headers

Już skonfigurowane w `nginx/conf.d/taskmaster.conf`:

- `Strict-Transport-Security` - Wymusza HTTPS
- `X-Frame-Options` - Zapobiega clickjacking
- `X-Content-Type-Options` - Zapobiega MIME sniffing
- `X-XSS-Protection` - Ochrona XSS
- `Referrer-Policy` - Kontroluje referer

### 5. Rate Limiting

Skonfigurowane dla:
- **Auth endpoints**: 5 żądań/minutę
- **API endpoints**: 30 żądań/sekundę
- **General**: 10 żądań/sekundę

## 📊 Monitoring

### Monitoring w czasie rzeczywistym

```bash
# Uruchom skrypt monitorowania
chmod +x scripts/monitor.sh
./scripts/monitor.sh
```

### Health Checks

```bash
# Sprawdź status aplikacji
curl https://your-domain.com/health -k

# Sprawdź gotowość
curl https://your-domain.com/ready -k
```

### Logi

```bash
# Logi Flask
docker-compose -f docker-compose.prod.yml logs web

# Logi Nginx
docker-compose -f docker-compose.prod.yml logs nginx

# Logi w czasie rzeczywistym
docker-compose -f docker-compose.prod.yml logs -f
```

## 🔄 Backup i Restore

### Backup bazy danych

```bash
# Ręczny backup
docker-compose -f docker-compose.prod.yml exec web \
    cp /app/instance/tasks.db /app/instance/tasks.db.backup

# Automatyczny backup (cron)
# Dodaj do crontab:
0 2 * * * cd /opt/taskmaster2 && \
    docker-compose -f docker-compose.prod.yml exec web \
    cp /app/instance/tasks.db /app/instance/tasks.db.$(date +\%Y\%m\%d)
```

### Restore bazy danych

```bash
# Przywróć z backupu
docker-compose -f docker-compose.prod.yml exec web \
    cp /app/instance/tasks.db.backup /app/instance/tasks.db

# Uruchom ponownie
docker-compose -f docker-compose.prod.yml restart web
```

## 🔄 Aktualizacje

### Aktualizuj kod

```bash
cd /opt/taskmaster2

# Pobierz najnowszy kod
git pull origin main

# Przebuduj i uruchom ponownie
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build
```

### Migracje bazy danych

```bash
# Jeśli zmieniłeś modele
docker-compose -f docker-compose.prod.yml exec web \
    flask db migrate -m "description"

docker-compose -f docker-compose.prod.yml exec web \
    flask db upgrade
```

## 🆘 Troubleshooting

### "Connection refused"

```bash
# Sprawdź czy kontenery działają
docker-compose -f docker-compose.prod.yml ps

# Sprawdź logi
docker-compose -f docker-compose.prod.yml logs web
```

### "SSL certificate problem"

```bash
# Sprawdź certyfikat
openssl x509 -in nginx/ssl/cert.pem -text -noout

# Regeneruj self-signed
rm nginx/ssl/*
./scripts/setup-ssl.sh taskmaster.local admin@taskmaster.local
docker-compose -f docker-compose.prod.yml restart nginx
```

### "CORS error"

```bash
# Sprawdź CORS_ORIGINS
grep CORS_ORIGINS .env

# Powinno zawierać twoją domenę
# Przykład: CORS_ORIGINS=https://taskmaster.example.com
```

### "WebSocket connection failed"

```bash
# Sprawdź czy Socket.IO jest dostępny
curl https://your-domain.com/socket.io/ -k

# Sprawdź logi Nginx
docker-compose -f docker-compose.prod.yml logs nginx | grep socket.io
```

### "Port already in use"

```bash
# Sprawdź co zajmuje port 80/443
sudo lsof -i :80
sudo lsof -i :443

# Zatrzymaj konfliktujący serwis
sudo systemctl stop apache2
```

## 📈 Skalowanie

### Wiele instancji Flask

Edytuj `docker-compose.prod.yml`:

```yaml
services:
  web:
    deploy:
      replicas: 3  # 3 instancje Flask
```

Nginx automatycznie będzie load balancować.

### PostgreSQL (zamiast SQLite)

Odkomentuj sekcję `postgres` w `docker-compose.prod.yml`:

```yaml
postgres:
  image: postgres:15-alpine
  environment:
    POSTGRES_DB: taskmaster
    POSTGRES_USER: taskmaster
    POSTGRES_PASSWORD: ${DB_PASSWORD}
  volumes:
    - postgres_data:/var/lib/postgresql/data
```

Zaktualizuj `.env`:
```
DATABASE_URL=postgresql://taskmaster:password@postgres:5432/taskmaster
```

## 📝 Checklist przed produkcją

- [ ] Zmienić `SECRET_KEY` na losowy
- [ ] Zmienić `DEFAULT_ADMIN_PASSWORD` na silne hasło
- [ ] Skonfigurować `CORS_ORIGINS` na twoją domenę
- [ ] Wygenerować SSL certyfikat (Let's Encrypt lub self-signed)
- [ ] Otworzyć porty 80/443 w firewall
- [ ] Skonfigurować FortiGate rules
- [ ] Przetestować dostęp z innego komputera
- [ ] Skonfigurować backup
- [ ] Skonfigurować monitoring
- [ ] Skonfigurować auto-renewal certyfikatu (Let's Encrypt)
- [ ] Skonfigurować SSH hardening
- [ ] Skonfigurować Fail2Ban
- [ ] Przetestować failover

## 🎉 Gotowe!

Twoja aplikacja powinna być dostępna na `https://your-domain.com`

**Domyślne dane logowania:**
- Username: `admin`
- Password: (z `.env` `DEFAULT_ADMIN_PASSWORD`)

## 📚 Dodatkowe zasoby

- [DEPLOYMENT_NGINX.md](DEPLOYMENT_NGINX.md) - Szczegółowa dokumentacja Nginx
- [AGENTS.md](AGENTS.md) - Instrukcje dla agentów AI
- [README.md](README.md) - Ogólna dokumentacja aplikacji

## 🆘 Wsparcie

Jeśli coś nie działa:

1. Sprawdź logi: `docker-compose -f docker-compose.prod.yml logs -f`
2. Sprawdź status: `docker-compose -f docker-compose.prod.yml ps`
3. Sprawdź konfigurację: `cat .env`
4. Sprawdź Nginx: `docker-compose -f docker-compose.prod.yml exec nginx nginx -t`

---

**Powodzenia! 🚀**
