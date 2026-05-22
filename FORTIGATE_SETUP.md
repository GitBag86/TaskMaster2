# TaskMaster2 - FortiGate Configuration Guide

Przewodnik do konfiguracji FortiGate dla TaskMaster2.

## 🎯 Cel

Skonfigurować FortiGate do:
- Zezwalania na dostęp do TaskMaster2 z internetu
- Ochrony przed atakami DDoS
- Logowania ruchu
- Opcjonalnie: SSL inspection

---

## 🔧 Konfiguracja Firewall Rules

### Krok 1: Zaloguj się do FortiGate

```
URL: https://your-fortigate-ip:8443
Username: admin
Password: (twoje hasło)
```

### Krok 2: Utwórz regułę Allow

1. Przejdź do **Policy & Objects** → **Firewall Policy**
2. Kliknij **Create New**
3. Wypełnij pola:

```
Name: Allow TaskMaster2 HTTPS
Incoming Interface: WAN (lub port, z którego przychodzi ruch)
Outgoing Interface: LAN (lub port, do którego idzie ruch)
Source: Any (lub konkretny IP/zakres)
Destination: Your-Server-IP (IP serwera z TaskMaster2)
Service: HTTPS (443)
Action: Accept
```

4. Kliknij **OK**

### Krok 3: Utwórz regułę dla HTTP (redirect)

Powtórz krok 2, ale:

```
Name: Allow TaskMaster2 HTTP
Service: HTTP (80)
Action: Accept
```

### Krok 4: Sprawdź kolejność reguł

Reguły powinny być **przed** regułą `deny all`:

```
1. Allow TaskMaster2 HTTPS
2. Allow TaskMaster2 HTTP
3. ... inne reguły ...
N. Deny All (default)
```

---

## 🛡️ DDoS Protection

### Krok 1: Utwórz DDoS Policy

1. Przejdź do **Security Profiles** → **DDoS Policy**
2. Kliknij **Create New**
3. Wypełnij pola:

```
Name: TaskMaster2-DDoS
Threshold: 100 requests/second
Action: Drop
```

4. Kliknij **OK**

### Krok 2: Przypisz do reguły firewall

1. Przejdź do **Policy & Objects** → **Firewall Policy**
2. Edytuj regułę "Allow TaskMaster2 HTTPS"
3. W sekcji **Security Profiles** zaznacz:
   - DDoS Policy: TaskMaster2-DDoS
4. Kliknij **OK**

---

## 🔒 SSL Inspection (opcjonalnie)

### Krok 1: Utwórz SSL/TLS Inspection Policy

1. Przejdź do **Security Profiles** → **SSL/TLS Inspection**
2. Kliknij **Create New**
3. Wypełnij pola:

```
Name: TaskMaster2-SSL-Inspection
Action: Inspect
```

4. Kliknij **OK**

### Krok 2: Przypisz do reguły firewall

1. Przejdź do **Policy & Objects** → **Firewall Policy**
2. Edytuj regułę "Allow TaskMaster2 HTTPS"
3. W sekcji **Security Profiles** zaznacz:
   - SSL/TLS Inspection: TaskMaster2-SSL-Inspection
4. Kliknij **OK**

---

## 📊 Logging

### Krok 1: Włącz logging

1. Przejdź do **Policy & Objects** → **Firewall Policy**
2. Edytuj regułę "Allow TaskMaster2 HTTPS"
3. Zaznacz:
   - ✅ Log Allowed Traffic
   - ✅ Log Denied Traffic
4. Kliknij **OK**

### Krok 2: Sprawdź logi

1. Przejdź do **Log & Report** → **Traffic**
2. Filtruj po:
   - Destination: Your-Server-IP
   - Service: HTTPS

---

## 🌐 Port Forwarding (jeśli potrzebne)

Jeśli serwer jest w sieci wewnętrznej:

### Krok 1: Utwórz Virtual IP

1. Przejdź do **Policy & Objects** → **Virtual IPs**
2. Kliknij **Create New**
3. Wypełnij pola:

```
Name: TaskMaster2-VIP
External IP Address: Your-Public-IP (lub WAN IP)
Mapped IP Address: Your-Server-IP (IP wewnętrzny)
Port Forwarding: Enable
External Service Port: 443
Internal Service Port: 443
Protocol: TCP
```

4. Kliknij **OK**

### Krok 2: Utwórz regułę firewall dla VIP

1. Przejdź do **Policy & Objects** → **Firewall Policy**
2. Kliknij **Create New**
3. Wypełnij pola:

```
Name: Allow TaskMaster2 VIP
Incoming Interface: WAN
Outgoing Interface: LAN
Source: Any
Destination: TaskMaster2-VIP
Service: HTTPS
Action: Accept
```

4. Kliknij **OK**

---

## 🔐 Geo-Blocking (opcjonalnie)

Jeśli chcesz ograniczyć dostęp do konkretnych krajów:

### Krok 1: Utwórz Address Group

1. Przejdź do **Policy & Objects** → **Addresses**
2. Kliknij **Create New** → **Address**
3. Wypełnij pola:

```
Name: Allowed-Countries
Type: Geo IP Address
Countries: Zaznacz kraje, z których chcesz zezwolić dostęp
```

4. Kliknij **OK**

### Krok 2: Przypisz do reguły firewall

1. Przejdź do **Policy & Objects** → **Firewall Policy**
2. Edytuj regułę "Allow TaskMaster2 HTTPS"
3. Zmień Source na: Allowed-Countries
4. Kliknij **OK**

---

## 📈 Monitoring

### Krok 1: Sprawdź statystyki

1. Przejdź do **Dashboard**
2. Sprawdź:
   - Traffic Statistics
   - Threat Statistics
   - DDoS Statistics

### Krok 2: Utwórz Alert

1. Przejdź do **System** → **Alerts**
2. Kliknij **Create New**
3. Wypełnij pola:

```
Name: TaskMaster2-High-Traffic
Trigger: Traffic exceeds 1 Gbps
Action: Send Email
Email: admin@your-domain.com
```

4. Kliknij **OK**

---

## 🧪 Test

### Krok 1: Sprawdź dostęp z internetu

```bash
# Z komputera poza siecią
curl https://your-public-ip/health -k

# Powinno zwrócić:
# {"status": "healthy", "timestamp": "..."}
```

### Krok 2: Sprawdź logi w FortiGate

1. Przejdź do **Log & Report** → **Traffic**
2. Filtruj po:
   - Destination: Your-Server-IP
   - Service: HTTPS
3. Powinieneś zobaczyć wpisy z Twoim IP

### Krok 3: Sprawdź DDoS Protection

```bash
# Symuluj DDoS (ostrożnie!)
# Nie rób tego na produkcji!
# ab -n 10000 -c 100 https://your-public-ip/
```

---

## 🆘 Troubleshooting

### "Connection refused"

1. Sprawdź czy reguła firewall jest **Accept**
2. Sprawdź czy reguła jest **przed** regułą deny all
3. Sprawdź czy IP serwera jest poprawne
4. Sprawdź logi: **Log & Report** → **Traffic**

### "Connection timeout"

1. Sprawdź czy serwer jest dostępny:
   ```bash
   ping your-server-ip
   ```
2. Sprawdź czy port 443 jest otwarty:
   ```bash
   telnet your-server-ip 443
   ```
3. Sprawdź logi FortiGate

### "SSL certificate error"

1. Jeśli używasz self-signed certyfikatu, to normalne
2. Dodaj wyjątek w przeglądarce
3. Dla produkcji użyj Let's Encrypt

### "DDoS Protection blocking legitimate traffic"

1. Zwiększ threshold w DDoS Policy
2. Lub wyłącz DDoS Protection dla testów

---

## 📋 Checklist

- [ ] Zaloguj się do FortiGate
- [ ] Utwórz regułę Allow dla HTTPS (443)
- [ ] Utwórz regułę Allow dla HTTP (80)
- [ ] Sprawdź kolejność reguł (przed deny all)
- [ ] Włącz logging
- [ ] Utwórz DDoS Policy (opcjonalnie)
- [ ] Utwórz SSL Inspection Policy (opcjonalnie)
- [ ] Przetestuj dostęp z internetu
- [ ] Sprawdź logi
- [ ] Skonfiguruj alerting (opcjonalnie)

---

## 📞 Wsparcie

Jeśli coś nie działa:

1. Sprawdź logi: **Log & Report** → **Traffic**
2. Sprawdź reguły: **Policy & Objects** → **Firewall Policy**
3. Sprawdź czy serwer jest dostępny: `ping your-server-ip`
4. Sprawdź czy port jest otwarty: `telnet your-server-ip 443`

---

## 🎉 Gotowe!

Twoja aplikacja TaskMaster2 powinna być dostępna z internetu przez FortiGate.

**Powodzenia! 🚀**
