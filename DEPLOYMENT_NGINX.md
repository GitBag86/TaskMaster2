# TaskMaster2 - Production Deployment with Nginx

Kompletny przewodnik do wdrażania TaskMaster2 na serwerze Ubuntu z Nginx, SSL i reverse proxy.

## 📋 Wymagania

- Ubuntu 20.04+ (lub inny Linux)
- Docker + Docker Compose
- Domena (opcjonalnie, dla Let's Encrypt)
- Dostęp root/sudo

## 🚀 Szybki Start (5 minut)

### 1. Przygotuj serwer

```bash
# Zaloguj się na serwer
ssh user@your-server-ip

# Zainstaluj Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER
newgrp docker

# Zainstaluj Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. Sklonuj aplikację

```bash
cd /opt
sudo git clone https://github.com/your-repo/taskmaster2.git
cd taskmaster2
sudo chown -R $USER:$USER .
```

### 3. Skonfiguruj SSL

**Opcja A: Self-signed (dla testów/sieci wewnętrznej)**
```bash
chmod +x scripts/setup-ssl.sh
./scripts/setup-ssl.sh taskmaster.local admin@taskmaster.local
```

**Opcja B: Let's Encrypt (dla produkcji)**
```bash
chmod +x scripts/setup-ssl.sh
./scripts/setup-ssl.sh your-domain.com admin@your-domain.com
```

### 4. Skonfiguruj zmienne środowiskowe

```bash
cp .env.production .env
nano .env

# Zmień:
# - SECRET_KEY (wygeneruj: python3 -c 'import secrets; print(secrets.token_hex(32))')
# - CORS_ORIGINS (twoja domena/IP)
# - DEFAULT_ADMIN_PASSWORD (silne hasło)
# - MAIL_* (jeśli chcesz e-mail)
```

### 5. Uruchom aplikację

```bash
docker-compose -f docker-compose.prod.yml up -d

# Czekaj ~30 sekund na startup
sleep 30

# Sprawdź status
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs -f web
```

### 6. Sprawdź dostęp

```bash
# Lokalnie na serwerze
curl https://localhost/health -k

# Z innego komputera
curl https://your-server-ip/health -k
```

---

## 🔒 Konfiguracja Nginx

### Struktura plików

```
nginx/
├── nginx.conf              # Główna konfiguracja
├── conf.d/
│   └── taskmaster.conf     # Konfiguracja aplikacji
├── ssl/
│   ├── cert.pem           # Certyfikat SSL
│   └── key.pem            # Klucz prywatny
└── certbot/               # Let's Encrypt (opcjonalnie)
    ├── conf/
    └── www/
```

### Kluczowe ustawienia

| Ustawienie | Opis |
|-----------|------|
| **SSL/TLS** | TLSv1.2 + TLSv1.3 |
| **Ciphers** | HIGH:!aNULL:!MD5 |
| **HSTS** | max-age=31536000 (1 rok) |
| **Rate Limiting** | Auth: 5/min, API: 30/s, General: 10/s |
| **Gzip** | Włączony dla tekstu/JSON |
| **Security Headers** | X-Frame-Options, X-Content-Type-Options, CSP |

### Dostosowanie domeny

Edytuj `nginx/conf.d/taskmaster.conf`:

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;  # ← Zmień tutaj
    
    # ... reszta konfiguracji
}
```

Przeładuj Nginx:
```bash
docker-compose -f docker-compose.prod.yml exec nginx nginx -s reload
```

---

## 🔐 Bezpieczeństwo

### 1. Firewall (UFW)

```bash
# Otwórz tylko porty 80 i 443
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 2. FortiGate (jeśli używasz)

**Firewall Rules:**
```
Source: Internal Network
Destination: External (jeśli dostęp z internetu)
Service: TCP 80, TCP 443
Action: Accept
```

**Opcjonalnie - DDoS Protection:**
- Enable rate limiting
- Enable geo-blocking (jeśli potrzebne)
- Enable IPS/IDS

### 3. Nginx Security Headers

Już skonfigurowane w `nginx/conf.d/taskmaster.conf`:
- `X-Frame-Options: SAMEORIGIN` - Zapobiega clickjacking
- `X-Content-Type-Options: nosniff` - Zapobiega MIME sniffing
- `Strict-Transport-Security` - Wymusza HTTPS
- `Referrer-Policy` - Kontroluje informacje o refererze

### 4. Rate Limiting

Skonfigurowane dla:
- **Auth endpoints** (login/signup): 5 żądań/minutę
- **API endpoints**: 30 żądań/sekundę
- **General**: 10 żądań/sekundę

---

## 📊 Monitoring

### Health Checks

```bash
# Sprawdź status aplikacji
curl https://your-domain.com/health -k

# Sprawdź gotowość (readiness)
curl https://your-domain.com/ready -k
```

### Logi

```bash
# Logi Nginx
docker-compose -f docker-compose.prod.yml logs nginx

# Logi Flask
docker-compose -f docker-compose.prod.yml logs web

# Logi w czasie rzeczywistym
docker-compose -f docker-compose.prod.yml logs -f
```

### Metryki

```bash
# Rozmiar kontenerów
docker-compose -f docker-compose.prod.yml exec web du -sh /app/instance

# Użycie zasobów
docker stats
```

---

## 🔄 Aktualizacje

### Aktualizuj kod

```bash
cd /opt/taskmaster2
git pull origin main
```

### Przebuduj i uruchom ponownie

```bash
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build
```

### Migracje bazy danych

```bash
# Jeśli zmieniłeś modele
docker-compose -f docker-compose.prod.yml exec web flask db migrate -m "description"
docker-compose -f docker-compose.prod.yml exec web flask db upgrade
```

---

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
# Sprawdź CORS_ORIGINS w .env
grep CORS_ORIGINS .env

# Powinno zawierać twoją domenę/IP
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
sudo systemctl stop apache2  # lub inny serwis
```

---

## 📈 Skalowanie

### Wiele instancji Flask (load balancing)

Edytuj `docker-compose.prod.yml`:

```yaml
services:
  web:
    deploy:
      replicas: 3  # 3 instancje Flask
```

Nginx automatycznie będzie load balancować między nimi.

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

---

## 🔄 Backup

### Backup bazy danych (SQLite)

```bash
# Ręczny backup
docker-compose -f docker-compose.prod.yml exec web cp /app/instance/tasks.db /app/instance/tasks.db.backup

# Automatyczny backup (cron)
0 2 * * * cd /opt/taskmaster2 && docker-compose -f docker-compose.prod.yml exec web cp /app/instance/tasks.db /app/instance/tasks.db.$(date +\%Y\%m\%d)
```

### Backup PostgreSQL

```bash
# Ręczny backup
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U taskmaster taskmaster > backup.sql

# Restore
docker-compose -f docker-compose.prod.yml exec -T postgres psql -U taskmaster taskmaster < backup.sql
```

---

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

---

## 🆘 Wsparcie

Jeśli coś nie działa:

1. Sprawdź logi: `docker-compose -f docker-compose.prod.yml logs -f`
2. Sprawdź status: `docker-compose -f docker-compose.prod.yml ps`
3. Sprawdź konfigurację: `cat .env`
4. Sprawdź Nginx: `docker-compose -f docker-compose.prod.yml exec nginx nginx -t`

---

**Gotowe! 🎉 Twoja aplikacja powinna być dostępna na `https://your-domain.com`**
