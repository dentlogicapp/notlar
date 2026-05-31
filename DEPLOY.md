# 🚀 Canlı Deploy Rehberi

> Bu doc: Hetzner CX22 sunucuda Görev Defteri'ni canlıya almak için adım adım rehber.

Tahmini süre: **30-45 dakika** (ilk seferde, DNS yayılması dahil).

---

## ⚙️ Önkoşullar

- ✅ GitHub repo: `dentlogicapp/notlar` push edilmiş
- ✅ Hetzner CX22 sunucu açılmış (Ubuntu 24.04 LTS, SSH key eklenmiş)
- ✅ Sunucu IP'si elinde (örn. `49.13.x.x`)
- ✅ Domain: `dentlogicapp.com` (METUnic'te DNS yönetimi sende)

---

## 1️⃣ DNS Ayarı (METUnic) — İlk yap, yayılması başlasın

METUnic panelinde **DNS Yönetimi** → A kayıtları ekle:

| Tip  | Ad           | Değer       | TTL |
|------|--------------|-------------|-----|
| A    | `notlar`     | `<SUNUCU_IP>` | 300 |
| A    | `notlar-api` | `<SUNUCU_IP>` | 300 |

Yayılma 5-30 dakika sürer. Test:

```bash
nslookup notlar.dentlogicapp.com
nslookup notlar-api.dentlogicapp.com
```

---

## 2️⃣ Gmail App Password

1. Tarayıcıda → https://myaccount.google.com
2. Security → 2-Step Verification (zaten açık olmalı, değilse aç)
3. Security → App passwords → "Mail" için yeni şifre oluştur
4. **16 karakterlik şifreyi kopyala** (boşluksuz, sadece bir kez gösterilir)

---

## 3️⃣ Sunucuya SSH

```bash
ssh root@<SUNUCU_IP>
```

İlk girişte parmak izi onayla (`yes`).

---

## 4️⃣ Sunucu Hazırlığı

```bash
# Sistem güncelle
apt update && apt upgrade -y

# Docker yükle
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# Test
docker --version
docker compose version

# UFW firewall - sadece SSH + HTTP + HTTPS
apt install -y ufw
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

---

## 5️⃣ Kodu Çek

```bash
# GitHub'dan public repo ise:
cd /opt
git clone https://github.com/dentlogicapp/notlar.git
cd notlar

# Eğer private repo ise (önerilen):
# - GitHub'da Personal Access Token üret (Settings → Developer settings → PAT classic)
# - Sonra: git clone https://<TOKEN>@github.com/dentlogicapp/notlar.git
```

---

## 6️⃣ .env Dosyasını Oluştur

```bash
cp .env.production.example .env
nano .env
```

Şu alanları doldur:

```bash
POSTGRES_PASSWORD=...      # openssl rand -base64 24
JWT_SECRET=...             # openssl rand -base64 48
SMTP_USER=dentlogicapp@gmail.com
SMTP_PASS=...              # Adım 2'deki 16 haneli app password
SMTP_FROM=dentlogicapp@gmail.com
ILK_ADMIN_EMAIL=dentlogicapp@gmail.com
ILK_ADMIN_AD=Musa Deveci
ILK_ADMIN_SIFRE=...        # İlk giriş için, sonra UI'dan değiştirebilirsin
```

Güçlü şifreler için:

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=')"
echo "JWT_SECRET=$(openssl rand -base64 48 | tr -d '/+=')"
```

Çıktıları .env'ye yapıştır.

---

## 7️⃣ Build & Up

```bash
cd /opt/notlar
docker compose -f docker-compose.production.yml up -d --build
```

İlk build 5-10 dakika sürer (.NET + Next.js + Caddy).

İlerleme:

```bash
docker compose -f docker-compose.production.yml logs -f
# CTRL+C ile çık (containers çalışmaya devam eder)
```

---

## 8️⃣ Caddy SSL Otomatik

Caddy ayağa kalkar kalkmaz Let's Encrypt'e gidip her iki subdomain için sertifika alır. **DNS doğru ise 30-60 saniye içinde tamamlanır.**

Kontrol:

```bash
docker logs notlar_caddy | grep -i "obtain\|cert"
```

Başarılı log şunun gibidir:

```
certificate obtained successfully  identifier=notlar.dentlogicapp.com
certificate obtained successfully  identifier=notlar-api.dentlogicapp.com
```

**Hata olursa:** DNS henüz yayılmamış olabilir. Birkaç dakika bekle, `docker restart notlar_caddy`.

---

## 9️⃣ Test

Tarayıcıdan:

- ✅ https://notlar.dentlogicapp.com → giriş sayfası açılmalı
- ✅ https://notlar-api.dentlogicapp.com/health → `{"status":"ok"}` JSON

Giriş:

- Email: `dentlogicapp@gmail.com`
- Şifre: .env'deki `ILK_ADMIN_SIFRE`

İlk girişten sonra:

1. UI'dan Yönetim → kendine "şifre sıfırla" gönder (Gmail SMTP testi)
2. Maili aç, bağlantıya tıkla, yeni şifreyi belirle
3. Eşine kullanıcı oluştur (Yönetim → Yeni Kullanıcı), o da maille şifresini belirlesin

---

## 🔧 Bakım Komutları

```bash
# Durum
docker compose -f docker-compose.production.yml ps

# Loglar
docker compose -f docker-compose.production.yml logs -f backend
docker compose -f docker-compose.production.yml logs -f frontend
docker compose -f docker-compose.production.yml logs -f caddy

# Yeniden başlat
docker compose -f docker-compose.production.yml restart backend

# Güncelleme (yeni kod push'tan sonra)
cd /opt/notlar
git pull
docker compose -f docker-compose.production.yml up -d --build

# DB backup (haftada bir manuel veya cron)
docker exec notlar_postgres pg_dump -U notlaruser notlar | gzip > /opt/backup/notlar-$(date +%Y%m%d).sql.gz

# Tüm sistemi durdur
docker compose -f docker-compose.production.yml down

# Sıfırdan başla (DB silinir!)
docker compose -f docker-compose.production.yml down -v
```

---

## 🆘 Sorun Giderme

### "Site açılmıyor" / SSL hatası
1. `nslookup notlar.dentlogicapp.com` → IP gelirken sunucu IP ile aynı mı?
2. `docker logs notlar_caddy` → sertifika alma loglarını incele
3. UFW açık mı: `ufw status` → 80 ve 443 ALLOW olmalı

### "Email gönderilmiyor"
1. Gmail'de 2FA aktif mi?
2. App Password 16 karakter, boşluksuz mu?
3. `docker logs notlar_backend | grep -i smtp`

### "İlk admin girişi çalışmıyor"
- `.env`'deki `ILK_ADMIN_SIFRE` ile gir
- Backend loguna bak: `docker logs notlar_backend | grep "İlk admin"`

### "Database connection refused"
- Postgres healthcheck failed? `docker logs notlar_postgres`
- Volume bozuldu mu? Test: `docker exec -it notlar_postgres psql -U notlaruser -d notlar -c '\dt'`

---

## 🔒 Güvenlik Notları

- `.env` ASLA git'e commit etme (`.gitignore`'da)
- İlk girişten sonra `ILK_ADMIN_SIFRE` değerini UI'dan değiştirip .env'den temizle
- Hetzner Console → Automatic Backups aktif et (€0.92/ay, CX22 için)
- 3 ayda bir: `apt update && apt upgrade` + `docker compose pull && up -d`
