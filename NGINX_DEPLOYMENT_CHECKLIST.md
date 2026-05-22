# TaskMaster2 - Nginx Deployment Checklist

Kompletna lista kontrolna do wdrażania TaskMaster2 z Nginx na Ubuntu.

---

## 📋 Pre-Deployment

### Przygotowanie serwera
- [ ] Serwer Ubuntu 20.04+ przygotowany
- [ ] Dostęp SSH skonfigurowany
- [ ] Firewall (UFW) skonfigurowany
- [ ] Docker zainstalowany
- [ ] Docker Compose zainstalowany

### Przygotowanie aplikacji
- [ ] Repozytorium sklonowane
- [ ] Uprawnienia ustawione (`chown -R $USER:$USER .`)
- [ ] Pliki Nginx przygotowane
- [ ] Skrypty deploymentu przygotowane

### Przygotowanie SSL
- [ ] Decyzja: Self-signed czy Let's Encrypt?
- [ ] Domena skonfigurowana (jeśli Let's Encrypt)
- [ ] DNS propagowany (jeśli Let's Encrypt)
- [ ] Certbot zainstalowany (jeśli Let's Encrypt)

### Przygotowanie konfiguracji
- [ ] `.env.production` skopiowany do `.env`
- [ ] `SECRET_KEY` wygenerowany (32+ znaki)
- [ ] `DEFAULT_ADMIN_PASSWORD` zmieniony na silne hasło
- [ ] `CORS_ORIGINS` ustawiony na twoją domenę/IP
- [ ] `MAIL_*` skonfigurowany (opcjonalnie)

---

## 🚀 Deployment

### SSL Setup
- [ ] Uruchomić `./scripts/setup-ssl.sh`
- [ ] Certyfikat wygenerowany w `nginx/ssl/`
- [ ] Certyfikat zweryfikowany: `openssl x509 -in nginx/ssl/cert.pem -text -noout`

### Nginx Configuration
- [ ] `nginx/nginx.conf` przygotowany
- [ ] `nginx/conf.d/taskmaster.conf` przygotowany
- [ ] `server_name` zaktualizowany w konfiguracji
- [ ] Rate limiting skonfigurowany
- [ ] Security headers skonfigurowane

### Docker Build
- [ ] `docker-compose.prod.yml` przygotowany
- [ ] Frontend zbudowany: `npm run build`
- [ ] Docker images zbudowane: `docker-compose -f docker-compose.prod.yml build`
- [ ] Brak błędów w build logach

### Deployment
- [ ] Kontenery uruchomione: `docker-compose -f docker-compose.prod.yml up -d`
- [ ] Czekaj 30 sekund na startup
- [ ] Kontenery działają: `docker-compose -f docker-compose.prod.yml ps`
- [ ] Brak błędów w logach: `docker-compose -f docker-compose.prod.yml logs`

---

## ✅ Post-Deployment

### Sprawdzenie dostępu
- [ ] Health check lokalnie: `curl https://localhost/health -k`
- [ ] Health check z innego komputera: `curl https://your-server-ip/health -k`
- [ ] Readiness check: `curl https://your-server-ip/ready -k`
- [ ] Frontend dostępny: `https://your-server-ip`

### Sprawdzenie funkcjonalności
- [ ] Zaloguj się jako admin
- [ ] Utwórz nowe zadanie
- [ ] Sprawdź Socket.IO (real-time updates)
- [ ] Sprawdź dark mode
- [ ] Sprawdź responsywność (mobile)

### Sprawdzenie bezpieczeństwa
- [ ] SSL certyfikat zweryfikowany
- [ ] Security headers obecne: `curl -I https://your-server-ip`
- [ ] CORS działający
- [ ] Rate limiting działający (test: 6 żądań/min do /auth/login)
- [ ] Sensitive files niedostępne (/.git, /.env, /instance)

### Sprawdzenie wydajności
- [ ] Nginx kompresuje odpowiedzi (gzip)
- [ ] Statyczne pliki serwowane szybko
- [ ] WebSocket działa bez opóźnień
- [ ] Brak błędów w browser console

---

## 🔒 Bezpieczeństwo

### Firewall
- [ ] Porty 80/443 otwarte w UFW
- [ ] Inne porty zamknięte
- [ ] SSH na niestandardowym porcie (opcjonalnie)

### FortiGate
- [ ] Reguła Allow dla HTTPS (443)
- [ ] Reguła Allow dla HTTP (80)
- [ ] Reguły w poprawnej kolejności (przed deny all)
- [ ] Logging włączony
- [ ] DDoS Protection skonfigurowany (opcjonalnie)

### Aplikacja
- [ ] `SECRET_KEY` zmieniony
- [ ] `DEFAULT_ADMIN_PASSWORD` zmieniony
- [ ] `CORS_ORIGINS` ustawiony poprawnie
- [ ] Session cookies secure (HTTPS only)
- [ ] Rate limiting aktywny

### SSL
- [ ] TLSv1.2+ wymuszony
- [ ] Weak ciphers wyłączone
- [ ] HSTS włączony
- [ ] SSL stapling włączony

---

## 📊 Monitoring

### Health Checks
- [ ] `/health` endpoint dostępny
- [ ] `/ready` endpoint dostępny
- [ ] Docker health checks skonfigurowane
- [ ] Monitoring skrypt przygotowany

### Logi
- [ ] Nginx logi dostępne
- [ ] Flask logi dostępne
- [ ] Logi rotacji skonfigurowane (opcjonalnie)
- [ ] Centralized logging skonfigurowany (opcjonalnie)

### Metryki
- [ ] CPU usage monitorowany
- [ ] Memory usage monitorowany
- [ ] Disk usage monitorowany
- [ ] Network usage monitorowany

---

## 💾 Backup

### Baza danych
- [ ] Backup strategy zdefiniowana
- [ ] Automatyczny backup skonfigurowany (cron)
- [ ] Backup location bezpieczna
- [ ] Restore procedure przetestowana

### Konfiguracja
- [ ] `.env` backupowany
- [ ] SSL certyfikaty backupowane
- [ ] Nginx config backupowany
- [ ] Docker volumes backupowane

---

## 🔄 Aktualizacje

### Proces aktualizacji
- [ ] Backup przed aktualizacją
- [ ] Git pull procedure zdefiniowana
- [ ] Docker rebuild procedure zdefiniowana
- [ ] Rollback procedure zdefiniowana

### Migracje
- [ ] Flask-Migrate skonfigurowany
- [ ] Migracje testowane lokalnie
- [ ] Backup bazy przed migracją
- [ ] Migracja procedure zdefiniowana

---

## 📚 Dokumentacja

### Przygotowana dokumentacja
- [ ] QUICK_START.md - Szybki start
- [ ] PRODUCTION_SETUP.md - Pełny przewodnik
- [ ] DEPLOYMENT_NGINX.md - Szczegóły Nginx
- [ ] NGINX_FAQ.md - FAQ
- [ ] FORTIGATE_SETUP.md - Konfiguracja FortiGate
- [ ] NGINX_SETUP_SUMMARY.md - Podsumowanie

### Dokumentacja zespołu
- [ ] Instrukcje dla administratorów
- [ ] Instrukcje dla developerów
- [ ] Troubleshooting guide
- [ ] Runbook dla incydentów

---

## 🧪 Testy

### Testy funkcjonalne
- [ ] Login/logout
- [ ] Tworzenie zadań
- [ ] Edycja zadań
- [ ] Usuwanie zadań
- [ ] Komentarze
- [ ] Podzadania
- [ ] Zależności
- [ ] Projekty
- [ ] Filtry
- [ ] Wyszukiwanie

### Testy wydajności
- [ ] Load test (100+ użytkowników)
- [ ] Stress test (1000+ żądań/s)
- [ ] Endurance test (24h)
- [ ] Spike test (nagły wzrost ruchu)

### Testy bezpieczeństwa
- [ ] SQL injection test
- [ ] XSS test
- [ ] CSRF test
- [ ] Rate limiting test
- [ ] SSL/TLS test
- [ ] CORS test

### Testy dostępności
- [ ] Failover test
- [ ] Backup/restore test
- [ ] Disaster recovery test
- [ ] RTO/RPO verification

---

## 📞 Wsparcie

### Kontakty
- [ ] Administrator systemu
- [ ] DevOps team
- [ ] Security team
- [ ] Support team

### Eskalacja
- [ ] Procedure eskalacji zdefiniowana
- [ ] Kontakty awaryjne dostępne
- [ ] On-call schedule skonfigurowany

---

## 🎯 Finalizacja

### Przed produkcją
- [ ] Wszystkie checklisty ukończone
- [ ] Wszystkie testy przejdzone
- [ ] Dokumentacja ukończona
- [ ] Team przeszkolony
- [ ] Backup strategy przetestowana

### Po deploymencie
- [ ] Monitoring aktywny
- [ ] Alerting skonfigurowany
- [ ] Logi zbierane
- [ ] Metryki zbierane
- [ ] Incident response plan aktywny

### Długoterminowe
- [ ] Regularne backupy
- [ ] Regularne aktualizacje
- [ ] Regularne testy
- [ ] Regularne przeglądy bezpieczeństwa
- [ ] Regularne przeglądy wydajności

---

## ✨ Status

```
Pre-Deployment:    [ ] 0/X
Deployment:        [ ] 0/X
Post-Deployment:   [ ] 0/X
Security:          [ ] 0/X
Monitoring:        [ ] 0/X
Backup:            [ ] 0/X
Updates:           [ ] 0/X
Testing:           [ ] 0/X
Support:           [ ] 0/X
Finalization:      [ ] 0/X

TOTAL:             [ ] 0/X
```

---

## 🎉 Gotowe!

Gdy wszystkie checklisty będą ukończone, Twoja aplikacja TaskMaster2 będzie:
- ✅ Bezpieczna (SSL/TLS, security headers, rate limiting)
- ✅ Wydajna (Nginx reverse proxy, gzip compression)
- ✅ Monitorowana (health checks, logi, metryki)
- ✅ Backupowana (automatyczne backupy)
- ✅ Skalowalna (load balancing, PostgreSQL)
- ✅ Gotowa do produkcji

**Powodzenia! 🚀**
