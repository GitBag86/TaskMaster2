# TaskMaster2 + Nginx - FAQ

Odpowiedzi na najczęstsze pytania dotyczące wdrażania z Nginx.

## 🔐 Bezpieczeństwo

### P: Czy Nginx chroni moją aplikację?

**O:** Tak, Nginx zapewnia:
- **SSL/TLS termination** - Szyfrowanie ruchu
- **Rate limiting** - Ochrona przed atakami brute-force
- **Security headers** - Ochrona przed XSS, clickjacking, MIME sniffing
- **Reverse proxy** - Ukrywa backend Flask
- **Firewall rules** - Kontrola dostępu

### P: Czy muszę używać Let's Encrypt?

**O:** Nie, ale jest rekomendowane dla produkcji:
- **Self-signed**: Szybko, ale przeglądarki pokazują ostrzeżenia
- **Let's Encrypt**: Darmowy, zaufany, auto-renewal

Dla sieci wewnętrznej self-signed wystarczy.

### P: Jak zmienić certyfikat SSL?

**O:**
```bash
# Usuń stary certyfikat
rm nginx/ssl/cert.pem nginx/ssl/key.pem

# Wygeneruj nowy
./scripts/setup-ssl.sh your-domain.com admin@your-domain.com

# Przeładuj Nginx
docker-compose -f docker-compose.prod.yml restart nginx
```

### P: Czy Nginx chroni przed DDoS?

**O:** Częściowo:
- Rate limiting zmniejsza wpływ
- FortiGate zapewnia lepszą ochronę
- Dla pełnej ochrony użyj CDN (Cloudflare, AWS Shield)

---

## 🌐 Sieć i Dostęp

### P: Jak zmienić port z 443 na inny?

**O:** Edytuj `docker-compose.prod.yml`:
```yaml
nginx:
  ports:
    - "8443:443"  # Zmień 8443 na dowolny port
```

Przeładuj:
```bash
docker-compose -f docker-compose.prod.yml restart nginx
```

### P: Jak dostać się do aplikacji z innego komputera?

**O:** Upewnij się, że:
1. Port 443 (lub inny) jest otwarty w firewall
2. FortiGate ma regułę Allow dla tego portu
3. DNS wskazuje na IP serwera (lub użyj IP bezpośrednio)

```bash
# Test z innego komputera
curl https://your-server-ip/health -k
```

### P: Czy mogę używać HTTP zamiast HTTPS?

**O:** Nie rekomenduje się dla produkcji, ale możesz:

Edytuj `nginx/conf.d/taskmaster.conf`:
```nginx
server {
    listen 80;  # Zamiast 443 ssl http2
    server_name _;
    
    # ... reszta konfiguracji
}
```

### P: Jak skonfigurować domenę?

**O:**
1. Kup domenę (np. GoDaddy, Namecheap)
2. Ustaw DNS A record na IP serwera
3. Czekaj 24-48 godzin na propagację
4. Wygeneruj Let's Encrypt certyfikat
5. Zaktualizuj `nginx/conf.d/taskmaster.conf`

```nginx
server_name your-domain.com www.your-domain.com;
```

---

## 🐳 Docker

### P: Jak sprawdzić czy kontenery działają?

**O:**
```bash
docker-compose -f docker-compose.prod.yml ps

# Powinno pokazać:
# NAME              STATUS
# taskmaster-nginx  Up
# taskmaster-web    Up
```

### P: Jak zobaczyć logi?

**O:**
```bash
# Ostatnie 50 linii
docker-compose -f docker-compose.prod.yml logs --tail=50

# W czasie rzeczywistym
docker-compose -f docker-compose.prod.yml logs -f

# Tylko Flask
docker-compose -f docker-compose.prod.yml logs web

# Tylko Nginx
docker-compose -f docker-compose.prod.yml logs nginx
```

### P: Jak zatrzymać aplikację?

**O:**
```bash
docker-compose -f docker-compose.prod.yml down
```

### P: Jak uruchomić ponownie?

**O:**
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### P: Jak usunąć wszystkie dane?

**O:**
```bash
# ⚠️ UWAGA: To usunie bazę danych!
docker-compose -f docker-compose.prod.yml down -v
```

---

## 📊 Performance

### P: Jak zwiększyć wydajność?

**O:**
1. **Gzip compression** - Już włączony w Nginx
2. **Caching** - Dodaj do `nginx/conf.d/taskmaster.conf`:
```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=my_cache:10m;

location / {
    proxy_cache my_cache;
    proxy_cache_valid 200 10m;
}
```

3. **Load balancing** - Uruchom wiele instancji Flask
4. **PostgreSQL** - Zamiast SQLite dla wielu użytkowników

### P: Ile użytkowników może obsługiwać?

**O:** Zależy od:
- **SQLite**: ~10-20 równoczesnych użytkowników
- **PostgreSQL**: ~100+ równoczesnych użytkowników
- **Wiele instancji Flask**: Skaluje się liniowo

### P: Jak monitorować wydajność?

**O:**
```bash
# Użycie zasobów
docker stats

# Rozmiar bazy danych
docker-compose -f docker-compose.prod.yml exec web du -sh /app/instance

# Logi dostępu Nginx
docker-compose -f docker-compose.prod.yml exec nginx tail -f /var/log/nginx/taskmaster_access.log
```

---

## 🔄 Aktualizacje

### P: Jak zaktualizować aplikację?

**O:**
```bash
cd /opt/taskmaster2

# Pobierz najnowszy kod
git pull origin main

# Przebuduj i uruchom ponownie
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build
```

### P: Czy aktualizacja spowoduje utratę danych?

**O:** Nie, jeśli używasz volume dla `instance/`:
```yaml
volumes:
  - ./instance:/app/instance  # Dane są persystentne
```

### P: Jak wycofać aktualizację?

**O:**
```bash
# Przywróć poprzednią wersję
git checkout HEAD~1

# Przebuduj
docker-compose -f docker-compose.prod.yml up -d --build
```

---

## 🆘 Problemy

### P: "Connection refused"

**O:** Sprawdź:
```bash
# Czy kontenery działają?
docker-compose -f docker-compose.prod.yml ps

# Czy port jest otwarty?
sudo lsof -i :443

# Czy Nginx jest uruchomiony?
docker-compose -f docker-compose.prod.yml logs nginx
```

### P: "SSL certificate problem"

**O:**
```bash
# Sprawdź certyfikat
openssl x509 -in nginx/ssl/cert.pem -text -noout

# Sprawdź czy plik istnieje
ls -la nginx/ssl/

# Regeneruj
./scripts/setup-ssl.sh taskmaster.local admin@taskmaster.local
```

### P: "CORS error"

**O:**
```bash
# Sprawdź CORS_ORIGINS
grep CORS_ORIGINS .env

# Powinno zawierać twoją domenę
# Jeśli nie, zaktualizuj:
sed -i 's/CORS_ORIGINS=.*/CORS_ORIGINS=https:\/\/your-domain.com/' .env

# Uruchom ponownie
docker-compose -f docker-compose.prod.yml restart web
```

### P: "WebSocket connection failed"

**O:**
```bash
# Sprawdź czy Socket.IO jest dostępny
curl https://your-domain.com/socket.io/ -k

# Sprawdź logi Nginx
docker-compose -f docker-compose.prod.yml logs nginx | grep socket.io

# Sprawdź logi Flask
docker-compose -f docker-compose.prod.yml logs web | grep socket
```

### P: "Port already in use"

**O:**
```bash
# Sprawdź co zajmuje port
sudo lsof -i :80
sudo lsof -i :443

# Zatrzymaj konfliktujący serwis
sudo systemctl stop apache2

# Lub zmień port w docker-compose.prod.yml
```

---

## 💾 Backup

### P: Jak zrobić backup?

**O:**
```bash
# Backup bazy danych
docker-compose -f docker-compose.prod.yml exec web \
    cp /app/instance/tasks.db /app/instance/tasks.db.backup

# Backup całej aplikacji
tar -czf taskmaster2-backup-$(date +%Y%m%d).tar.gz /opt/taskmaster2
```

### P: Jak przywrócić backup?

**O:**
```bash
# Przywróć bazę danych
docker-compose -f docker-compose.prod.yml exec web \
    cp /app/instance/tasks.db.backup /app/instance/tasks.db

# Uruchom ponownie
docker-compose -f docker-compose.prod.yml restart web
```

---

## 🔧 Konfiguracja

### P: Jak zmienić hasło admina?

**O:**
```bash
# Edytuj .env
nano .env

# Zmień DEFAULT_ADMIN_PASSWORD

# Uruchom ponownie
docker-compose -f docker-compose.prod.yml restart web
```

### P: Jak dodać użytkownika?

**O:** Zaloguj się jako admin i użyj panelu administracyjnego.

### P: Jak zmienić CORS_ORIGINS?

**O:**
```bash
# Edytuj .env
nano .env

# Zmień CORS_ORIGINS na twoją domenę
CORS_ORIGINS=https://your-domain.com

# Uruchom ponownie
docker-compose -f docker-compose.prod.yml restart web
```

---

## 📞 Kontakt

Jeśli masz pytania, które nie są tutaj wymienione:

1. Sprawdź [DEPLOYMENT_NGINX.md](DEPLOYMENT_NGINX.md)
2. Sprawdź [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md)
3. Sprawdź logi: `docker-compose -f docker-compose.prod.yml logs -f`

---

**Powodzenia! 🚀**
