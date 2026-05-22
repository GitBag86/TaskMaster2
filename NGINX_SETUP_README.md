# 🚀 TaskMaster2 - Nginx Production Setup

Kompletny production-ready setup z Nginx, SSL i bezpieczeństwem dla Ubuntu.

## 📦 Co zostało przygotowane

Wszystko co potrzebujesz do wdrażania TaskMaster2 na serwerze Ubuntu z Nginx:

### ✅ Konfiguracja Nginx
- `nginx/nginx.conf` - Główna konfiguracja
- `nginx/conf.d/taskmaster.conf` - Konfiguracja aplikacji
- Rate limiting (Auth: 5/min, API: 30/s)
- Security headers (HSTS, X-Frame-Options, CSP)
- Gzip compression
- SSL/TLS termination

### ✅ Docker Compose
- `docker-compose.prod.yml` - Production setup
- Nginx + Flask + PostgreSQL (opcjonalnie)
- Health checks
- Persistent volumes
- Network isolation

### ✅ Skrypty
- `scripts/setup-ssl.sh` - Generowanie SSL certyfikatów
- `scripts/deploy.sh` - Automatyczny deployment
- `scripts/monitor.sh` - Monitoring w czasie rzeczywistym

### ✅ Dokumentacja
- `QUICK_START.md` - Szybki start (5 minut)
- `PRODUCTION_SETUP.md` - Pełny przewodnik
- `DEPLOYMENT_NGINX.md` - Szczegóły Nginx
- `NGINX_FAQ.md` - FAQ i troubleshooting
- `FORTIGATE_SETUP.md` - Konfiguracja FortiGate
- `NGINX_SETUP_SUMMARY.md` - Podsumowanie
- `NGINX_DEPLOYMENT_CHECKLIST.md` - Checklist

### ✅ Konfiguracja
- `.env.production` - Template zmiennych

---

## 🎯 Szybki Start (5 minut)

### 1. Przygotuj serwer
```bash
ssh user@your-server-ip
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit && ssh user@your-server-ip
```

### 2. Sklonuj aplikację
```bash
cd /opt
sudo git clone https://github.com/your-repo/taskmaster2.git
cd taskmaster2
sudo chown -R $USER:$USER .
```

### 3. Skonfiguruj SSL
```bash
chmod +x scripts/setup-ssl.sh
./scripts/setup-ssl.sh taskmaster.local admin@taskmaster.local
```

### 4. Skonfiguruj zmienne
```bash
cp .env.production .env
nano .env  # Zmień SECRET_KEY, DEFAULT_ADMIN_PASSWORD, CORS_ORIGINS
```

### 5. Uruchom
```bash
chmod +x scripts/deploy.sh
./scripts/deploy.sh taskmaster.local admin@taskmaster.local
```

### 6. Sprawdź dostęp
```bash
curl https://localhost/health -k
curl https://your-server-ip/health -k
```

---

## 🏗️ Architektura

```
Internet / FortiGate
        ↓ HTTPS (443)
    Nginx (Reverse Proxy)
    - SSL/TLS Termination
    - Rate Limiting
    - Security Headers
    - Gzip Compression
        ↓ HTTP (5000)
    Flask Backend (Gunicorn)
    - REST API
    - Socket.IO
    - Database ORM
        ↓
    SQLite / PostgreSQL
```

---

## 🔐 Bezpieczeństwo

✅ **SSL/TLS**
- TLSv1.2 + TLSv1.3
- Strong ciphers
- HSTS (Strict-Transport-Security)
- SSL stapling

✅ **Security Headers**
- X-Frame-Options: SAMEORIGIN
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Referrer-Policy
- Permissions-Policy

✅ **Rate Limiting**
- Auth endpoints: 5 żądań/minutę
- API endpoints: 30 żądań/sekundę
- General: 10 żądań/sekundę

✅ **Reverse Proxy**
- Ukrywa backend Flask
- Proxy headers (X-Real-IP, X-Forwarded-For)
- Timeouts (60s HTTP, 7d WebSocket)

✅ **Firewall**
- Deny sensitive files (/.*, /instance)
- Deny .git, .env, etc.

---

## 📊 Konfiguracja

### Nginx Routing

| Path | Limit | Timeout | Opis |
|------|-------|---------|------|
| `/` | 10/s | 60s | Static files + SPA |
| `/socket.io` | 50/s | 7d | WebSocket |
| `/auth/*` | 5/min | 60s | Authentication |
| `/tasks/*` | 30/s | 60s | API endpoints |
| `/health` | ∞ | 10s | Health check |

### Compression
- Gzip enabled (level 6)
- Kompresja dla: text, JSON, JavaScript, SVG, fonts

### Buffering
- Proxy buffering enabled
- Buffer size: 4k
- Buffers: 8x4k

---

## 🔧 Operacje

### Uruchomienie
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Zatrzymanie
```bash
docker-compose -f docker-compose.prod.yml down
```

### Restart
```bash
docker-compose -f docker-compose.prod.yml restart
```

### Logi
```bash
docker-compose -f docker-compose.prod.yml logs -f
```

### Monitoring
```bash
chmod +x scripts/monitor.sh
./scripts/monitor.sh
```

---

## 📋 Checklist

### Przed deploymentem
- [ ] Serwer Ubuntu przygotowany
- [ ] Docker zainstalowany
- [ ] Repozytorium sklonowane
- [ ] SSL certyfikat wygenerowany
- [ ] Zmienne w `.env` skonfigurowane
- [ ] Porty 80/443 otwarte w firewall
- [ ] FortiGate rules skonfigurowane

### Po deploymencie
- [ ] Health check przejdzie
- [ ] Frontend dostępny
- [ ] Login działa
- [ ] Socket.IO działa
- [ ] SSL certyfikat zweryfikowany
- [ ] Security headers obecne
- [ ] Rate limiting działa

---

## 🆘 Troubleshooting

### "Connection refused"
```bash
docker-compose -f docker-compose.prod.yml ps
docker-compose -f docker-compose.prod.yml logs web
```

### "SSL certificate problem"
```bash
openssl x509 -in nginx/ssl/cert.pem -text -noout
rm nginx/ssl/*
./scripts/setup-ssl.sh taskmaster.local admin@taskmaster.local
```

### "CORS error"
```bash
grep CORS_ORIGINS .env
# Powinno zawierać twoją domenę
```

### "WebSocket connection failed"
```bash
curl https://your-domain.com/socket.io/ -k
docker-compose -f docker-compose.prod.yml logs nginx | grep socket.io
```

---

## 📚 Dokumentacja

| Dokument | Opis |
|----------|------|
| [QUICK_START.md](QUICK_START.md) | Szybki start (5 minut) |
| [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md) | Pełny przewodnik wdrażania |
| [DEPLOYMENT_NGINX.md](DEPLOYMENT_NGINX.md) | Szczegółowa dokumentacja Nginx |
| [NGINX_FAQ.md](NGINX_FAQ.md) | FAQ i troubleshooting |
| [FORTIGATE_SETUP.md](FORTIGATE_SETUP.md) | Konfiguracja FortiGate |
| [NGINX_SETUP_SUMMARY.md](NGINX_SETUP_SUMMARY.md) | Podsumowanie |
| [NGINX_DEPLOYMENT_CHECKLIST.md](NGINX_DEPLOYMENT_CHECKLIST.md) | Checklist |

---

## 🎯 Następne kroki

1. **Przeczytaj [QUICK_START.md](QUICK_START.md)** - Szybki start
2. **Przeczytaj [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md)** - Pełny przewodnik
3. **Skonfiguruj FortiGate** - [FORTIGATE_SETUP.md](FORTIGATE_SETUP.md)
4. **Skonfiguruj backup** - Automatyczne backupy
5. **Skonfiguruj monitoring** - Alerting

---

## 💡 Wskazówki

- **Self-signed certyfikat** - Dla testów/sieci wewnętrznej
- **Let's Encrypt** - Dla produkcji (darmowy, zaufany)
- **Rate limiting** - Chroni przed atakami brute-force
- **Health checks** - Monitoruj dostępność aplikacji
- **Backup** - Codziennie o 2:00 AM

---

## 🎉 Gotowe!

Twoja aplikacja TaskMaster2 jest gotowa do produkcji z:
- ✅ Nginx reverse proxy
- ✅ SSL/TLS encryption
- ✅ Rate limiting
- ✅ Security headers
- ✅ Health checks
- ✅ Monitoring
- ✅ Backup strategy

**Powodzenia! 🚀**

---

## 📞 Wsparcie

Jeśli coś nie działa:

1. Sprawdź logi: `docker-compose -f docker-compose.prod.yml logs -f`
2. Sprawdź status: `docker-compose -f docker-compose.prod.yml ps`
3. Sprawdź konfigurację: `cat .env`
4. Sprawdź Nginx: `docker-compose -f docker-compose.prod.yml exec nginx nginx -t`
5. Przeczytaj [NGINX_FAQ.md](NGINX_FAQ.md)

---

**Ostatnia aktualizacja: 2026-05-23**
