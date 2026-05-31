# 📓 Görev Defteri — Notlar

> Birlikte yapılacaklar, birlikte tamamlanacaklar.

Aşk teması, klasör hiyerarşisi, denetim günlüğü ve düğün geri sayımı içeren çift kullanıcılı not uygulaması.

## Tech Stack

- **Backend:** .NET 8 · ASP.NET Core · EF Core · PostgreSQL 17
- **Frontend:** Next.js 15 · React 19 · TypeScript · Tailwind · shadcn/ui pattern
- **Mail:** Gmail SMTP (prod) · MailPit (dev)
- **Reverse Proxy:** Caddy 2 (otomatik SSL)
- **Auth:** BCrypt + JWT cookie · 5 deneme lockout

## Hızlı Başlangıç (Lokal)

```bash
# Önkoşullar: Docker Desktop, Node 20+ (frontend dev için)
docker compose up -d --build
cd frontend && npm install --legacy-peer-deps && npm run dev
```

Açılır:
- Uygulama: http://localhost:3000
- API: http://localhost:5000
- MailPit: http://localhost:8025
- İlk admin: `musa@local.test` / `Test1234`

## Canlı Deploy

`DEPLOY.md` dosyasına bak — adım adım sunucu kurulum rehberi.

## Lisans

Özel proje · MIT (uygulama kodu)
