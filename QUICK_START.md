# TaskMaster2 - Quick Start (5 minut)

Najszybszy sposób na uruchomienie TaskMaster2 z Nginx na Ubuntu.

## 🚀 Instalacja

### 1. Przygotuj serwer (2 minuty)

```bash
# Zaloguj się na serwer
ssh user@your-server-ip

# Zainstaluj Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit && ssh user@your-server-ip

# Zainstaluj Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" \
    -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
```

### 2. Sklonuj i skonfiguruj (2 minuty)

```bash
# Sklonuj aplikację
cd /opt
sudo git clone https://github.com/your-repo/taskmaster2.git
cd taskmaster2
sudo chown -R $USER:$USER .

# Skonfiguruj SSL (self-signed)
chmod +x scripts/setup-ssl.sh
./scripts/setup-ssl.sh taskmaster.local admin@taskmaster.local

# Skonfiguruj zmienne
cp .env.production .env
nano .env  # Zmień SECRET_KEY, DEFAULT_ADMIN_PASSWORD, CORS_ORIGINS
```

### 3. Uruchom (1 minuta)

```bash
# Uruchom deployment
chmod +x scripts/deploy.sh
./scripts/deploy.sh taskmaster.local admin@taskmaster.local

# Lub ręcznie
docker-compose -f docker-compose.prod.yml up -d --build
sleep 30
docker-compose -f docker-compose.prod.yml ps
```

## ✅ Sprawdzenie

```bash
# Sprawdź status
curl https://localhost/health -k

# Sprawdź dostęp z innego komputera
curl https://your-server-ip/health -k
```

## 🎯 Następne kroki

1. **Otwórz port w firewall**
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

2. **Skonfiguruj FortiGate**
   - Utwórz regułę Allow dla portów 80/443

3. **Zaloguj się**
   - URL: `https://your-server-ip`
   - Username: `admin`
   - Password: (z `.env`)

4. **Zmień hasło admina**
   - W panelu administracyjnym

## 📊 Monitoring

```bash
# Sprawdź logi
docker-compose -f docker-compose.prod.yml logs -f

# Sprawdź zasoby
docker stats

# Uruchom monitoring
chmod +x scripts/monitor.sh
./scripts/monitor.sh
```

## 🆘 Problemy?

```bash
# Sprawdź status kontenerów
docker-compose -f docker-compose.prod.yml ps

# Sprawdź logi
docker-compose -f docker-compose.prod.yml logs web

# Sprawdź Nginx
docker-compose -f docker-compose.prod.yml exec nginx nginx -t
```

## 📚 Dokumentacja

- [PRODUCTION_SETUP.md](PRODUCTION_SETUP.md) - Pełny przewodnik
- [DEPLOYMENT_NGINX.md](DEPLOYMENT_NGINX.md) - Szczegóły Nginx
- [NGINX_FAQ.md](NGINX_FAQ.md) - FAQ

---

**Gotowe! 🎉**

Twoja aplikacja powinna być dostępna na `https://your-server-ip`
