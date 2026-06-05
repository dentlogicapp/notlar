using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Notlar.Api.Background;
using Notlar.Api.Data;
using Notlar.Api.Endpoints;
using Notlar.Api.Entities;
using Notlar.Api.Services;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

// QuestPDF community lisansı (free for projects with <$1M annual revenue)
QuestPDF.Settings.License = QuestPDF.Infrastructure.LicenseType.Community;

builder.Host.UseSerilog((ctx, cfg) => cfg
    .ReadFrom.Configuration(ctx.Configuration)
    .WriteTo.Console(outputTemplate:
        "[{Timestamp:HH:mm:ss} {Level:u3}] {Message:lj}{NewLine}{Exception}"));

// EF
builder.Services.AddDbContext<AppDbContext>(opt =>
    opt.UseNpgsql(builder.Configuration.GetConnectionString("Postgres")));

// Servisler
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<IUserContext, UserContext>();
builder.Services.AddScoped<IPasswordService, PasswordService>();
builder.Services.AddScoped<IJwtService, JwtService>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<IAuditService, AuditService>();
// v17 - AI API key sifreleme + DataProtection key persistence (docker volume /keys)
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo("/keys"))
    .SetApplicationName("Notlar");
builder.Services.AddSingleton<IApiKeyKripto, DataProtectionApiKeyKripto>();

// v17 - AI Strategy Pattern (HttpClient typed + IMemoryCache 60sn + saglayici factory)
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient<OpenAiAssistService>();
builder.Services.AddScoped<IAiAssistServiceFactory, AiAssistServiceFactory>();
// v17 - Runtime placeholder cozucu (G.4 minimal iskelet, stateless singleton)
builder.Services.AddSingleton<ISablonResolver, SablonResolver>();
// v18 - tenant icerigi + version history (Senaryo A, dogrudan AppDbContext)
builder.Services.AddScoped<IIsletmeMetinService, IsletmeMetinService>();

// v14 — Defteri İndir servisleri
// PdfRender: Playwright Chromium browser tek instance (singleton, lazy-init), her PDF için yeni context
builder.Services.AddSingleton<IPdfRender, PdfRender>();
builder.Services.AddScoped<IDocxDonusturucu, DocxDonusturucu>();

// Arka plan
builder.Services.AddHostedService<CopKutusuTemizleyici>();
builder.Services.AddHostedService<HatirlaticiKontrolcusu>();

// JWT
var jwtSecret = builder.Configuration["Jwt:Secret"]
    ?? throw new InvalidOperationException("Jwt:Secret config eksik");

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(opt =>
    {
        opt.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"] ?? "notlar",
            ValidAudience = builder.Configuration["Jwt:Audience"] ?? "notlar",
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret))
        };
        opt.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                if (ctx.Request.Cookies.TryGetValue("auth_token", out var token))
                    ctx.Token = token;
                return Task.CompletedTask;
            },

            // v11 — Pasif/silindi kullanıcı kontrolü
            // Token geçerli olsa bile DB'de kullanıcı durumu kontrol edilir.
            // Admin pasif yaparsa veya silerse, sonraki istekte anlık çıkış sağlanır.
            // Not: Silme = hard delete (kayıt yok) → durum null gelir.
            OnTokenValidated = async ctx =>
            {
                try
                {
                    var sub = ctx.Principal?.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value
                           ?? ctx.Principal?.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;

                    if (!Guid.TryParse(sub, out var kullaniciId))
                    {
                        ctx.Fail("GECERSIZ_TOKEN");
                        return;
                    }

                    var db = ctx.HttpContext.RequestServices.GetRequiredService<Notlar.Api.Data.AppDbContext>();
                    var durum = await db.Kullanicilar
                        .Where(u => u.Id == kullaniciId)
                        .Select(u => new { u.Aktif })
                        .FirstOrDefaultAsync(ctx.HttpContext.RequestAborted);

                    // durum null = kullanıcı silinmiş (hard delete)
                    // !durum.Aktif = pasifleştirilmiş
                    if (durum is null || !durum.Aktif)
                    {
                        // Cookie'yi de temizle — tarayıcı yeniden istek atmasın
                        ctx.HttpContext.Response.Cookies.Delete("auth_token", new Microsoft.AspNetCore.Http.CookieOptions
                        {
                            HttpOnly = true,
                            Secure = ctx.HttpContext.Request.IsHttps,
                            SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Lax,
                            Path = "/"
                        });
                        ctx.Fail("KULLANICI_PASIF_VEYA_SILINDI");
                    }
                }
                catch (OperationCanceledException)
                {
                    // İstek iptal edildi — sessizce geç, exception loglamaya gerek yok
                }
                catch (Exception ex)
                {
                    // Beklenmedik hata — logla ama auth pipeline'ı kırma
                    // (kullanıcı yine de işlem yapabilsin, hata kalıcı olmasın)
                    Log.Warning(ex, "OnTokenValidated kullanıcı durumu kontrolü başarısız (token validation devam ediyor)");
                }
            }
        };
    });

builder.Services.AddAuthorization(opt =>
{
    opt.AddPolicy("AdminOnly", p => p.RequireRole("admin"));
});

// CORS — env-driven
var corsOrigins = (builder.Configuration["Cors:AllowedOrigins"] ?? "http://localhost:3000")
    .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

builder.Services.AddCors(opt =>
{
    opt.AddDefaultPolicy(p => p
        .WithOrigins(corsOrigins)
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials());
});

// Forwarded headers (Caddy arkasında çalışacağız)
builder.Services.Configure<ForwardedHeadersOptions>(opt =>
{
    opt.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    opt.KnownNetworks.Clear();
    opt.KnownProxies.Clear();
});

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var app = builder.Build();

// Migration + ilk admin
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

    // Postgres DNS resolve + healthy olana kadar bekle (max 60 saniye)
    for (int deneme = 1; deneme <= 30; deneme++)
    {
        try
        {
            await db.Database.EnsureCreatedAsync();
            Log.Information("PostgreSQL bağlantısı kuruldu (deneme {Deneme})", deneme);
            break;
        }
        catch (Exception ex)
        {
            if (deneme == 30)
            {
                Log.Error(ex, "PostgreSQL bağlantısı 60 saniye içinde kurulamadı");
                throw;
            }
            Log.Warning("PostgreSQL henüz hazır değil, 2sn sonra tekrar denenecek ({Deneme}/30): {Hata}",
                deneme, ex.GetType().Name);
            await Task.Delay(2000);
        }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ŞEMA GÜNCELLEMELERİ (idempotent raw SQL)
    // EnsureCreatedAsync mevcut veritabanına yeni kolon/tablo eklemez.
    // EF Migrations'a geçişe kadar bu helper'la şema upgrade yapıyoruz.
    // Her komut IF NOT EXISTS ile güvenli — defalarca çalışabilir.
    // ──────────────────────────────────────────────────────────────────────────
    try
    {
        await db.Database.ExecuteSqlRawAsync(@"
            -- kullanicilar.cinsiyet (v9)
            ALTER TABLE kullanicilar
                ADD COLUMN IF NOT EXISTS ""Cinsiyet"" character varying(10);

            -- notlar hatırlatma kolonları (v9)
            ALTER TABLE notlar
                ADD COLUMN IF NOT EXISTS ""HatirlatmaZamani"" timestamp with time zone;
            ALTER TABLE notlar
                ADD COLUMN IF NOT EXISTS ""HatirlatmaKime"" character varying(10);
            ALTER TABLE notlar
                ADD COLUMN IF NOT EXISTS ""HatirlatmaSekli"" character varying(15);
            ALTER TABLE notlar
                ADD COLUMN IF NOT EXISTS ""HatirlatmaGonderildiMi"" boolean NOT NULL DEFAULT false;
            ALTER TABLE notlar
                ADD COLUMN IF NOT EXISTS ""HatirlatmaGonderimZamani"" timestamp with time zone;
            ALTER TABLE notlar
                ADD COLUMN IF NOT EXISTS ""HatirlatmaKuranKullaniciId"" uuid;

            CREATE INDEX IF NOT EXISTS ""IX_notlar_HatirlatmaZamani_HatirlatmaGonderildiMi""
                ON notlar (""HatirlatmaZamani"", ""HatirlatmaGonderildiMi"");

            -- bildirimler tablosu (v9)
            CREATE TABLE IF NOT EXISTS bildirimler (
                ""Id""                uuid PRIMARY KEY,
                ""KullaniciId""       uuid NOT NULL REFERENCES kullanicilar(""Id"") ON DELETE CASCADE,
                ""Tip""               character varying(30) NOT NULL,
                ""NotId""             uuid NULL,
                ""Baslik""            character varying(120) NOT NULL,
                ""Mesaj""             character varying(500) NOT NULL,
                ""OkunduMu""          boolean NOT NULL DEFAULT false,
                ""OkumaZamani""       timestamp with time zone NULL,
                ""OlusturmaZamani""   timestamp with time zone NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS ""IX_bildirimler_KullaniciId_OkunduMu_OlusturmaZamani""
                ON bildirimler (""KullaniciId"", ""OkunduMu"", ""OlusturmaZamani"");

            -- v10: notlar edit lock + eski klasör (yeniden açma için)
            ALTER TABLE notlar
                ADD COLUMN IF NOT EXISTS ""KilitKullaniciId"" uuid;
            ALTER TABLE notlar
                ADD COLUMN IF NOT EXISTS ""KilitZamani"" timestamp with time zone;
            ALTER TABLE notlar
                ADD COLUMN IF NOT EXISTS ""EskiKlasorId"" uuid;

            -- v10: klasörler edit lock + sistem klasör flag
            ALTER TABLE klasorler
                ADD COLUMN IF NOT EXISTS ""KilitKullaniciId"" uuid;
            ALTER TABLE klasorler
                ADD COLUMN IF NOT EXISTS ""KilitZamani"" timestamp with time zone;
            ALTER TABLE klasorler
                ADD COLUMN IF NOT EXISTS ""SistemMi"" boolean NOT NULL DEFAULT false;

            CREATE INDEX IF NOT EXISTS ""IX_klasorler_SistemMi""
                ON klasorler (""SistemMi"");

            -- v11: not_gecmisi.YapanKullaniciId nullable + FK ON DELETE SET NULL
            -- Kullanıcı silindiğinde audit kayıtları kalır, YapanKullaniciId null olur.
            -- Idempotent: kolon zaten nullable ise hata vermez, FK varsa drop+recreate.
            ALTER TABLE not_gecmisi
                ALTER COLUMN ""YapanKullaniciId"" DROP NOT NULL;

            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.referential_constraints
                    WHERE constraint_name = 'FK_not_gecmisi_kullanicilar_YapanKullaniciId'
                ) THEN
                    ALTER TABLE not_gecmisi DROP CONSTRAINT ""FK_not_gecmisi_kullanicilar_YapanKullaniciId"";
                END IF;
            END $$;

            ALTER TABLE not_gecmisi
                ADD CONSTRAINT ""FK_not_gecmisi_kullanicilar_YapanKullaniciId""
                FOREIGN KEY (""YapanKullaniciId"")
                REFERENCES kullanicilar (""Id"")
                ON DELETE SET NULL;

            -- ════════════════════════════════════════════════════════════════
            -- v15 — Multi-tenant Backbone
            -- Her komut idempotent: tekrar çalıştırılabilir, veri kaybetmez.
            -- ════════════════════════════════════════════════════════════════

            -- 1. İşletmeler (tenant) tablosu
            CREATE TABLE IF NOT EXISTS isletmeler (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""MarkaAdi"" character varying(80) NOT NULL DEFAULT 'Planlama Defterimiz',
                ""MarkaEmoji"" character varying(10) NOT NULL DEFAULT '🤍',
                ""IkonSeti"" character varying(20) NOT NULL DEFAULT 'kalp',
                ""KarsilamaBasligi"" character varying(120) NOT NULL DEFAULT 'Merhaba Aşkım',
                ""KarsilamaAltMetni"" character varying(280) NOT NULL DEFAULT 'Bugün aklına gelen bir şeyi birlikte planlayıp tamamlamak için not etmek ister misin?',
                ""SayacAktif"" boolean NOT NULL DEFAULT true,
                ""SayacBasligi"" character varying(60) NOT NULL DEFAULT 'kavuşmamıza son',
                ""SayacHedefTarihi"" date,
                ""MailImza"" character varying(80) NOT NULL DEFAULT 'Sevgilerle',
                ""MailTonu"" character varying(20) NOT NULL DEFAULT 'samimi',
                ""KullanimModu"" character varying(20) NOT NULL DEFAULT 'es',
                ""OlusturmaZamani"" timestamp with time zone NOT NULL DEFAULT now(),
                ""OlusturanSuperAdminId"" uuid,
                ""Aktif"" boolean NOT NULL DEFAULT true,
                ""Silindi"" boolean NOT NULL DEFAULT false
            );
            CREATE INDEX IF NOT EXISTS ""IX_isletmeler_Aktif"" ON isletmeler (""Aktif"");
            CREATE INDEX IF NOT EXISTS ""IX_isletmeler_Silindi"" ON isletmeler (""Silindi"");

            -- 2. İşletme üyelikleri (kullanıcı ↔ tenant)
            CREATE TABLE IF NOT EXISTS isletme_uyelikleri (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""IsletmeId"" uuid NOT NULL REFERENCES isletmeler(""Id"") ON DELETE CASCADE,
                ""KullaniciId"" uuid NOT NULL REFERENCES kullanicilar(""Id"") ON DELETE CASCADE,
                ""Rol"" character varying(20) NOT NULL DEFAULT 'kullanici',
                ""KatilmaZamani"" timestamp with time zone NOT NULL DEFAULT now(),
                ""Aktif"" boolean NOT NULL DEFAULT true
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_isletme_uyelikleri_IsletmeId_KullaniciId"" 
                ON isletme_uyelikleri (""IsletmeId"", ""KullaniciId"");
            CREATE INDEX IF NOT EXISTS ""IX_isletme_uyelikleri_KullaniciId"" 
                ON isletme_uyelikleri (""KullaniciId"");

            -- 3. Kullanıcılar tablosuna yeni kolonlar
            ALTER TABLE kullanicilar ADD COLUMN IF NOT EXISTS ""SuperAdmin"" boolean NOT NULL DEFAULT false;
            ALTER TABLE kullanicilar ADD COLUMN IF NOT EXISTS ""AktifIsletmeId"" uuid;
            CREATE INDEX IF NOT EXISTS ""IX_kullanicilar_SuperAdmin"" 
                ON kullanicilar (""SuperAdmin"") WHERE ""SuperAdmin"" = true;

            -- 4. Core tablolara IsletmeId
            ALTER TABLE klasorler ADD COLUMN IF NOT EXISTS ""IsletmeId"" uuid;
            ALTER TABLE notlar ADD COLUMN IF NOT EXISTS ""IsletmeId"" uuid;
            ALTER TABLE bildirimler ADD COLUMN IF NOT EXISTS ""IsletmeId"" uuid;
            ALTER TABLE denetim_gunlukleri ADD COLUMN IF NOT EXISTS ""IsletmeId"" uuid;
            ALTER TABLE not_gecmisi ADD COLUMN IF NOT EXISTS ""IsletmeId"" uuid;

            -- 5. Planlama Defterimiz tenant'ını seed et (sabit UUID ile idempotent)
            INSERT INTO isletmeler (
                ""Id"", ""MarkaAdi"", ""MarkaEmoji"", ""IkonSeti"",
                ""KarsilamaBasligi"", ""KarsilamaAltMetni"",
                ""SayacAktif"", ""SayacBasligi"", ""SayacHedefTarihi"",
                ""MailImza"", ""MailTonu"", ""KullanimModu"",
                ""OlusturmaZamani"", ""Aktif"", ""Silindi""
            )
            VALUES (
                'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                'Planlama Defterimiz', '🤍', 'kalp',
                'Merhaba Aşkım',
                'Bugün aklına gelen bir şeyi birlikte planlayıp tamamlamak için not etmek ister misin?',
                true, 'kavuşmamıza son', DATE '2026-09-01',
                'Sevgilerle', 'samimi', 'es',
                now(), true, false
            )
            ON CONFLICT (""Id"") DO NOTHING;

            -- 6. Mevcut tüm veriyi Planlama Defterimiz tenant'ına bağla
            UPDATE klasorler SET ""IsletmeId"" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE ""IsletmeId"" IS NULL;
            UPDATE notlar SET ""IsletmeId"" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE ""IsletmeId"" IS NULL;
            UPDATE bildirimler SET ""IsletmeId"" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE ""IsletmeId"" IS NULL;
            UPDATE denetim_gunlukleri SET ""IsletmeId"" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE ""IsletmeId"" IS NULL;
            UPDATE not_gecmisi SET ""IsletmeId"" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' WHERE ""IsletmeId"" IS NULL;

            -- 7. Mevcut kullanıcıları Planlama Defterimiz'e üye yap (Kullanicilar.Rol'den rol al)
            INSERT INTO isletme_uyelikleri (""Id"", ""IsletmeId"", ""KullaniciId"", ""Rol"", ""KatilmaZamani"", ""Aktif"")
            SELECT 
                gen_random_uuid(),
                'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
                k.""Id"",
                k.""Rol"",
                k.""OlusturmaZamani"",
                k.""Aktif""
            FROM kullanicilar k
            WHERE NOT EXISTS (
                SELECT 1 FROM isletme_uyelikleri u 
                WHERE u.""IsletmeId"" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' 
                  AND u.""KullaniciId"" = k.""Id""
            );

            -- 8. En eski admin'i SuperAdmin yap (yoksa hiçbir kullanıcı admin değil, atla)
            UPDATE kullanicilar SET ""SuperAdmin"" = true
            WHERE ""Id"" = (
                SELECT ""Id"" FROM kullanicilar 
                WHERE ""Rol"" = 'admin' AND ""Aktif"" = true
                ORDER BY ""OlusturmaZamani"" ASC 
                LIMIT 1
            )
            AND NOT EXISTS (SELECT 1 FROM kullanicilar WHERE ""SuperAdmin"" = true);

            -- 9. AktifIsletmeId default ata
            UPDATE kullanicilar SET ""AktifIsletmeId"" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' 
            WHERE ""AktifIsletmeId"" IS NULL;

            -- 10. FK constraints (idempotent — varsa atla)
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_klasorler_isletmeler_IsletmeId'
                ) THEN
                    ALTER TABLE klasorler ADD CONSTRAINT ""FK_klasorler_isletmeler_IsletmeId""
                        FOREIGN KEY (""IsletmeId"") REFERENCES isletmeler(""Id"") ON DELETE CASCADE;
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_notlar_isletmeler_IsletmeId'
                ) THEN
                    ALTER TABLE notlar ADD CONSTRAINT ""FK_notlar_isletmeler_IsletmeId""
                        FOREIGN KEY (""IsletmeId"") REFERENCES isletmeler(""Id"") ON DELETE CASCADE;
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_bildirimler_isletmeler_IsletmeId'
                ) THEN
                    ALTER TABLE bildirimler ADD CONSTRAINT ""FK_bildirimler_isletmeler_IsletmeId""
                        FOREIGN KEY (""IsletmeId"") REFERENCES isletmeler(""Id"") ON DELETE CASCADE;
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_denetim_gunlukleri_isletmeler_IsletmeId'
                ) THEN
                    ALTER TABLE denetim_gunlukleri ADD CONSTRAINT ""FK_denetim_gunlukleri_isletmeler_IsletmeId""
                        FOREIGN KEY (""IsletmeId"") REFERENCES isletmeler(""Id"") ON DELETE SET NULL;
                END IF;
                IF NOT EXISTS (
                    SELECT 1 FROM pg_constraint WHERE conname = 'FK_not_gecmisi_isletmeler_IsletmeId'
                ) THEN
                    ALTER TABLE not_gecmisi ADD CONSTRAINT ""FK_not_gecmisi_isletmeler_IsletmeId""
                        FOREIGN KEY (""IsletmeId"") REFERENCES isletmeler(""Id"") ON DELETE CASCADE;
                END IF;
            END $$;

            -- 11. Composite index'ler (tenant-filtered query'leri hızlandır)
            CREATE INDEX IF NOT EXISTS ""IX_klasorler_IsletmeId_Silindi"" 
                ON klasorler (""IsletmeId"", ""Silindi"");
            CREATE INDEX IF NOT EXISTS ""IX_notlar_IsletmeId_Silindi"" 
                ON notlar (""IsletmeId"", ""Silindi"");
            CREATE INDEX IF NOT EXISTS ""IX_bildirimler_IsletmeId_KullaniciId"" 
                ON bildirimler (""IsletmeId"", ""KullaniciId"");
            CREATE INDEX IF NOT EXISTS ""IX_denetim_gunlukleri_IsletmeId_Zaman"" 
                ON denetim_gunlukleri (""IsletmeId"", ""Zaman"");
            CREATE INDEX IF NOT EXISTS ""IX_not_gecmisi_IsletmeId"" 
                ON not_gecmisi (""IsletmeId"");
            -- 12. Sistem metin anahtar kataloğu (v17 — sıfır şablon mimarisi)
            CREATE TABLE IF NOT EXISTS metin_anahtarlari (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""Anahtar"" character varying(80) NOT NULL UNIQUE,
                ""Etiket"" character varying(120) NOT NULL,
                ""Yonlendirme"" text NOT NULL,
                ""Aciklama"" text NOT NULL,
                ""Tip"" character varying(20) NOT NULL,
                ""Zorunlu"" boolean NOT NULL DEFAULT false,
                ""DesteklenenPlaceholderlar"" jsonb NOT NULL DEFAULT '[]'::jsonb,
                ""Sira"" integer NOT NULL DEFAULT 100,
                ""Kategori"" character varying(40) NOT NULL,
                ""Deprecated"" boolean NOT NULL DEFAULT false,
                ""OlusturmaZamani"" timestamp with time zone NOT NULL DEFAULT now(),
                ""GuncellemeZamani"" timestamp with time zone NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS ""IX_metin_anahtarlari_Kategori"" 
                ON metin_anahtarlari (""Kategori"");
            CREATE INDEX IF NOT EXISTS ""IX_metin_anahtarlari_Deprecated"" 
                ON metin_anahtarlari (""Deprecated"");
            -- 13. AI sağlayıcı ayarı (v17 — singleton, Strategy Pattern)
            CREATE TABLE IF NOT EXISTS ai_ayarlari (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""Saglayici"" character varying(40) NOT NULL DEFAULT 'openai',
                ""ModelId"" character varying(120) NOT NULL DEFAULT 'gpt-4o-mini',
                ""ApiKeyEncrypted"" text,
                ""BaseUrl"" character varying(500),
                ""TimeoutMs"" integer NOT NULL DEFAULT 30000,
                ""Aktif"" boolean NOT NULL DEFAULT false,
                ""SonSaglikKontrol"" timestamp with time zone,
                ""SonSaglikDurum"" boolean,
                ""GuncellemeZamani"" timestamp with time zone NOT NULL DEFAULT now(),
                ""GuncelleyenKullaniciId"" uuid REFERENCES kullanicilar(""Id"") ON DELETE SET NULL
            );
            -- 13.1 Singleton default kayit (sabit UUID, idempotent — super admin elle aktive eder)
            INSERT INTO ai_ayarlari (
                ""Id"", ""Saglayici"", ""ModelId"", ""TimeoutMs"", ""Aktif"", ""GuncellemeZamani""
            )
            VALUES (
                'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
                'openai', 'gpt-4o-mini', 30000, false, now()
            )
            ON CONFLICT (""Id"") DO NOTHING;

            -- 14. v17 metin anahtarlari seed (20 anahtar, uretim kalitesi, idempotent ON CONFLICT Anahtar)
            INSERT INTO metin_anahtarlari (
                ""Id"",""Anahtar"",""Etiket"",""Yonlendirme"",""Aciklama"",""Tip"",""Zorunlu"",""DesteklenenPlaceholderlar"",""Sira"",""Kategori"",""Deprecated"",""OlusturmaZamani"",""GuncellemeZamani""
            ) VALUES
            (gen_random_uuid(), 'marka_adi', 'Marka Adı', 'Çalışma grubu, işletme veya etkinlik için kullanılacak ismi yazınız.', 'Browser sekmesi, dashboard başlığı ve mail footer''da görünür.', 'baslik', true, '[]'::jsonb, 10, 'marka', false, now(), now()),
            (gen_random_uuid(), 'marka_emoji', 'Marka Emojisi', 'Markanı temsil eden tek bir emoji seç. (Örn: 🤍, 📚, ☕, 🏢)', 'Browser sekmesi ve dashboard üst başlıkta marka adınla birlikte görünür.', 'placeholder_kisa', false, '[]'::jsonb, 20, 'marka', false, now(), now()),
            (gen_random_uuid(), 'marka_ikon_seti', 'İkon Seti', 'Dashboard ikonların tonu. (kalp / klasik / ekip / aile / tatil)', 'Geri sayım ve karşılama widget''larında kullanılacak ikon stili.', 'placeholder_kisa', false, '[]'::jsonb, 30, 'marka', false, now(), now()),
            (gen_random_uuid(), 'dashboard_karsilama_basligi', 'Dashboard Karşılama Başlığı', 'Kullanıcılar siteye girince üstte gördüğü ana başlık. (Örn: ''Merhaba'', ''Hoşgeldin'', ''Selam Ekip'')', 'Her sayfada üst kısımda görünür.', 'baslik', true, '[""alici_ad""]'::jsonb, 100, 'dashboard', false, now(), now()),
            (gen_random_uuid(), 'dashboard_karsilama_alt_metin', 'Dashboard Karşılama Alt Metni', 'Başlığın altında zarif bir cümle. (Örn: ''Bugün ne planlayalım?'', ''Çalışmaya hazır mıyız?'')', 'Dashboard üstünde italik gri olarak görünür.', 'metin', false, '[]'::jsonb, 110, 'dashboard', false, now(), now()),
            (gen_random_uuid(), 'not_form_placeholder', 'Not Ekleme Form İpucu', 'Yeni not ekleme kutusunda kullanıcıya gösterilecek soluk ipucu. (Örn: ''Bir hatıra düşün...'', ''Bir dosya notu ekle...'', ''Bir menü fikri yaz...'')', 'Ana sayfada büyük not ekleme kutusunda görünür.', 'placeholder_kisa', false, '[]'::jsonb, 120, 'dashboard', false, now(), now()),
            (gen_random_uuid(), 'sayac_aktif', 'Sayaç Aktif', 'Geri sayım widget''ı dashboard''da görünsün mü? (true / false)', 'Sayaç kapalıysa hiç gösterilmez.', 'placeholder_kisa', false, '[]'::jsonb, 200, 'sayac', false, now(), now()),
            (gen_random_uuid(), 'sayac_aktif_cumle', 'Sayaç Aktif Cümle', 'Geri sayımda kalan süre öncesinde gösterilecek cümle. (Örn: ''Düğünümüze kaldı'', ''Lansmana kaldı'', ''Sınava kaldı'')', 'Hedef tarihe ne kadar kaldığını anlatır.', 'metin', false, '[""kalan_gun"",""kalan_saat""]'::jsonb, 210, 'sayac', false, now(), now()),
            (gen_random_uuid(), 'sayac_bitti_cumle', 'Sayaç Bitti Cümle', 'Hedef tarih geldikten sonra gösterilecek cümle. (Örn: ''Bugün en güzel günümüz'', ''Açılışımız oldu'', ''Sınava girdik'')', 'Sayaç 0 olduğunda görünür.', 'metin', false, '[]'::jsonb, 220, 'sayac', false, now(), now()),
            (gen_random_uuid(), 'sayac_hedef_tarihi', 'Sayaç Hedef Tarihi', 'Geri sayımın yöneleceği tarih. (YYYY-AA-GG formatında)', 'Bugünden en az 1 gün sonra, en fazla 5 yıl sonra olmalı.', 'placeholder_kisa', false, '[]'::jsonb, 230, 'sayac', false, now(), now()),
            (gen_random_uuid(), 'mail_imza', 'Mail İmzası', 'Mail sonunda gösterilecek ve çalışmanızı en iyi açıklayacak imzanızı yazınız. (Örn: ''Bilgi Kitap Evi Çalışma Grup Yönetimi'', ''Sevgilerle, Musa & Ayşegül'', ''Saygılarımızla, Yıldız Hukuk Bürosu'')', 'Hatırlatıcı ve davet maillerinin sonunda görünür.', 'metin', true, '[]'::jsonb, 300, 'mail', false, now(), now()),
            (gen_random_uuid(), 'mail_davetiye_konu', 'Davet Maili Konusu', 'Yeni kullanıcıya gönderilecek davet e-postasının konusu. {{alici_ad}} yazarsanız kullanıcının ilk adı otomatik gelir. (Örn: ''{{alici_ad}}, planlama defterimiz seni bekliyor'')', 'E-posta inbox''unda subject olarak görünür. İlgi çekici ve kişisel tutun.', 'subject', true, '[""alici_ad"",""marka_adi""]'::jsonb, 310, 'mail', false, now(), now()),
            (gen_random_uuid(), 'mail_davetiye_alt_baslik', 'Davet Maili Alt Başlık', 'Mail içinde isim altında italik gösterilecek kısa açıklama. (Örn: ''planlama defterimiz seni bekliyor 🤍'', ''ekibe hoşgeldin'', ''çalışma grubumuza katılım daveti'')', 'Mail içinde başlığın hemen altında küçük italik metin olarak görünür.', 'metin', false, '[]'::jsonb, 320, 'mail', false, now(), now()),
            (gen_random_uuid(), 'mail_davetiye_giris_metni', 'Davet Maili Giriş Metni', 'Mail''in üst kısmında kullanıcıya hitap eden açıklama paragraf. Markanı, neden davet ettiğini ve nasıl katkıda bulunabileceğini anlat.', 'Mail içinde CTA butonundan önce görünür. 2-4 cümle önerilir.', 'body', true, '[""alici_ad"",""marka_adi""]'::jsonb, 330, 'mail', false, now(), now()),
            (gen_random_uuid(), 'mail_hatirlatma_konu', 'Hatırlatıcı Maili Konusu', 'Bir not için hatırlatıcı kurulduğunda gönderilecek mail''in konusu. (Örn: ''♡ Hatırlatıcı - {{not_basligi}}'', ''Hatırlatıyoruz: {{not_basligi}}'')', 'Hatırlatma zamanı geldiğinde gönderilen mail''in subject''i.', 'subject', false, '[""not_basligi"",""kullanici_adi""]'::jsonb, 340, 'mail', false, now(), now()),
            (gen_random_uuid(), 'bildirim_yeni_not_metin', 'Yeni Not Bildirimi Metni', 'Diğer kullanıcı yeni not eklediğinde in-app bildirim metni. (Örn: ''{{kullanici_adi}} yeni bir not ekledi: {{not_basligi}}'')', 'Sağ üst köşede toast olarak görünür.', 'metin', false, '[""kullanici_adi"",""not_basligi""]'::jsonb, 400, 'bildirim', false, now(), now()),
            (gen_random_uuid(), 'bildirim_not_tamamlandi_metin', 'Not Tamamlandı Bildirimi', 'Bir not tamamlandığında gösterilecek bildirim. (Örn: ''✓ {{not_basligi}} tamamlandı'', ''{{kullanici_adi}} tamamladı: {{not_basligi}}'')', 'İlgili kullanıcılara in-app + opsiyonel mail.', 'metin', false, '[]'::jsonb, 410, 'bildirim', false, now(), now()),
            (gen_random_uuid(), 'bildirim_hatirlatici_metin', 'Hatırlatıcı Bildirimi Metni', 'Hatırlatıcı zamanı geldiğinde gösterilen bildirim. (Örn: ''⏰ Hatırlatma: {{not_basligi}}'', ''{{not_basligi}} için bugün son gün'')', 'Tarih/saat geldiğinde in-app + mail.', 'metin', false, '[]'::jsonb, 420, 'bildirim', false, now(), now()),
            (gen_random_uuid(), 'form_klasor_olustur_placeholder', 'Klasör Oluştur Formu İpucu', 'Yeni klasör oluşturma form alanı için soluk ipucu. (Örn: ''Yeni klasör adı...'', ''Konu başlığı...'', ''Proje adı yaz...'')', 'Sol panelden ''Yeni klasör'' tıklandığında açılan formda görünür.', 'placeholder_kisa', false, '[]'::jsonb, 500, 'form', false, now(), now()),
            (gen_random_uuid(), 'form_giris_email_placeholder', 'Giriş Formu E-posta İpucu', 'Login sayfasında e-posta alanı için ipucu. (Örn: ''E-posta adresin'', ''E-mail address'', ''ornek@firma.com'')', 'Login sayfasında üst form alanında görünür.', 'placeholder_kisa', false, '[]'::jsonb, 510, 'form', false, now(), now()),
            (gen_random_uuid(), 'mail_tonu', 'Mail Tonu', 'Mail metinlerinin genel tarzı. (Örn: samimi / profesyonel / resmi)', 'Davetiye ve hatirlatma maillerinin genel tonu - AI yardimcisi onerileri ve ton sliderinin varsayilan degeri.', 'placeholder_kisa', false, '[]'::jsonb, 305, 'mail', false, now(), now())
            ON CONFLICT (""Anahtar"") DO NOTHING;

            -- 15. v18 isletme_metinleri (tenant icerigi, Sifir Sablon KATMAN 2)
            CREATE TABLE IF NOT EXISTS isletme_metinleri (
                ""Id"" uuid PRIMARY KEY,
                ""IsletmeId"" uuid NOT NULL REFERENCES isletmeler(""Id"") ON DELETE CASCADE,
                ""Anahtar"" character varying(80) NOT NULL,
                ""Icerik"" text NOT NULL,
                ""GuncellemeZamani"" timestamptz NOT NULL DEFAULT now(),
                ""GuncelleyenKullaniciId"" uuid REFERENCES kullanicilar(""Id"") ON DELETE SET NULL,
                CONSTRAINT uq_isletme_metinleri UNIQUE (""IsletmeId"", ""Anahtar"")
            );
            CREATE INDEX IF NOT EXISTS ""IX_isletme_metinleri_IsletmeId"" ON isletme_metinleri (""IsletmeId"");
            CREATE INDEX IF NOT EXISTS ""IX_isletme_metinleri_Anahtar"" ON isletme_metinleri (""Anahtar"");

            -- 16. v18 isletme_metin_versiyonlari (version history, son 10 tutulur)
            CREATE TABLE IF NOT EXISTS isletme_metin_versiyonlari (
                ""Id"" uuid PRIMARY KEY,
                ""IsletmeId"" uuid NOT NULL REFERENCES isletmeler(""Id"") ON DELETE CASCADE,
                ""Anahtar"" character varying(80) NOT NULL,
                ""Icerik"" text NOT NULL,
                ""Versiyon"" integer NOT NULL,
                ""OlusturmaZamani"" timestamptz NOT NULL DEFAULT now(),
                ""OlusturanKullaniciId"" uuid REFERENCES kullanicilar(""Id"") ON DELETE SET NULL
            );
            CREATE INDEX IF NOT EXISTS ""IX_isletme_metin_versiyonlari_kayit""
                ON isletme_metin_versiyonlari (""IsletmeId"", ""Anahtar"", ""Versiyon"" DESC);

            -- 17a. v18 mail_tonu katalog guvence (Asama 11 seed ile ayni, idempotent emniyet)
            INSERT INTO metin_anahtarlari (
                ""Id"",""Anahtar"",""Etiket"",""Yonlendirme"",""Aciklama"",""Tip"",""Zorunlu"",""DesteklenenPlaceholderlar"",""Sira"",""Kategori"",""Deprecated"",""OlusturmaZamani"",""GuncellemeZamani""
            ) VALUES
            (gen_random_uuid(), 'mail_tonu', 'Mail Tonu', 'Mail metinlerinin genel tarzı. (Örn: samimi / profesyonel / resmi)', 'Davetiye ve hatirlatma maillerinin genel tonu - AI yardimcisi onerileri ve ton sliderinin varsayilan degeri.', 'placeholder_kisa', false, '[]'::jsonb, 305, 'mail', false, now(), now())
            ON CONFLICT (""Anahtar"") DO NOTHING;

            -- 17b. v18 mevcut tenant verisi: isletmeler kolonlari -> isletme_metinleri (idempotent)
            INSERT INTO isletme_metinleri (""Id"", ""IsletmeId"", ""Anahtar"", ""Icerik"", ""GuncellemeZamani"")
            SELECT gen_random_uuid(), i.""Id"", v.anahtar, v.icerik, now()
            FROM isletmeler i
            CROSS JOIN LATERAL (VALUES
                ('marka_adi', i.""MarkaAdi""),
                ('marka_emoji', i.""MarkaEmoji""),
                ('marka_ikon_seti', i.""IkonSeti""),
                ('dashboard_karsilama_basligi', i.""KarsilamaBasligi""),
                ('dashboard_karsilama_alt_metin', i.""KarsilamaAltMetni""),
                ('sayac_aktif', CASE WHEN i.""SayacAktif"" THEN 'true' ELSE 'false' END),
                ('sayac_aktif_cumle', i.""SayacBasligi""),
                ('sayac_hedef_tarihi', to_char(i.""SayacHedefTarihi"", 'YYYY-MM-DD')),
                ('mail_imza', i.""MailImza""),
                ('mail_tonu', i.""MailTonu"")
            ) AS v(anahtar, icerik)
            WHERE v.icerik IS NOT NULL AND v.icerik <> ''
            ON CONFLICT (""IsletmeId"", ""Anahtar"") DO NOTHING;
        ");
        Log.Information("Şema güncellemeleri kontrol edildi (v15 multi-tenant dahil — idempotent)");
    }
    catch (Exception ex)
    {
        Log.Error(ex, "Şema güncellemeleri sırasında hata");
        throw;
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SİSTEM KLASÖRÜ SEED — "Tamamlananlar"
    // Sistemde her zaman var olur. İdempotent: zaten varsa hiçbir şey yapmaz.
    // ──────────────────────────────────────────────────────────────────────────
    try
    {
        var tamamlananlarVar = await db.Klasorler
            .AnyAsync(k => k.SistemMi && k.Ad == "Tamamlananlar");

        if (!tamamlananlarVar)
        {
            // İlk admin'i olusturan olarak ata (yoksa system bir kullanıcı yok henüz, seed atla)
            var ilkAdmin = await db.Kullanicilar
                .Where(u => u.Rol == "admin")
                .OrderBy(u => u.OlusturmaZamani)
                .FirstOrDefaultAsync();

            if (ilkAdmin is not null)
            {
                db.Klasorler.Add(new Klasor
                {
                    Ad = "Tamamlananlar",
                    Aciklama = "Tamamlanan tüm notlar burada toplanır",
                    Ikon = "check-circle",
                    SistemMi = true,
                    OlusturanKullaniciId = ilkAdmin.Id,
                });
                await db.SaveChangesAsync();
                Log.Information("Tamamlananlar sistem klasörü oluşturuldu");
            }
        }
    }
    catch (Exception ex)
    {
        Log.Error(ex, "Tamamlananlar sistem klasörü seed sırasında hata");
        // Seed başarısız olsa bile uygulama açılabilir
    }

    var ilkEmail = builder.Configuration["IlkAdmin:Email"];
    var ilkAd = builder.Configuration["IlkAdmin:AdSoyad"];

    if (!string.IsNullOrWhiteSpace(ilkEmail) && !await db.Kullanicilar.AnyAsync())
    {
        var pwd = scope.ServiceProvider.GetRequiredService<IPasswordService>();
        var ilkSifre = builder.Configuration["IlkAdmin:Sifre"];

        var admin = new Kullanici
        {
            Email = ilkEmail.ToLowerInvariant(),
            AdSoyad = ilkAd ?? "Admin",
            Rol = "admin",
            Aktif = true,
            SifreHash = !string.IsNullOrEmpty(ilkSifre) ? pwd.Hashle(ilkSifre) : null,
            SifreBelirlenmeZamani = !string.IsNullOrEmpty(ilkSifre) ? DateTimeOffset.UtcNow : null
        };
        db.Kullanicilar.Add(admin);

        // Eğer şifre verilmemişse setup token üret + mail (ama mail SMTP'siz başarısız olur)
        if (string.IsNullOrEmpty(ilkSifre))
        {
            var t = AuthEndpoints.TokenUret();
            db.AuthTokenlar.Add(new AuthToken
            {
                KullaniciId = admin.Id,
                Token = t,
                Amac = "setup",
                GecerlilikSonu = DateTimeOffset.UtcNow.AddDays(7)
            });
            Log.Warning("İlk admin için setup token: {Token} (BU LOG'U KULLAN, mail göndermeden setup yap)", t);
        }

        await db.SaveChangesAsync();
        Log.Information("İlk admin oluşturuldu: {Email}", ilkEmail);
    }
}

app.UseForwardedHeaders();
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
app.UseSerilogRequestLogging();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok", time = DateTimeOffset.UtcNow }));
app.MapAuthEndpoints();
app.MapAdminEndpoints();
app.MapFolderEndpoints();
app.MapNoteEndpoints();
app.MapNotificationEndpoints();
app.MapLockEndpoints();
app.MapExportEndpoints();
app.MapIsletmeEndpoints();  // v15
app.MapSistemEndpoints();   // v17 — super admin metin anahtar katalogu
app.MapAiAyarlariEndpoints();
app.MapMetinlerEndpoints();   // v18 - tenant icerigi   // v17 - AI saglayici ayar yonetimi + saglik

app.Run();
