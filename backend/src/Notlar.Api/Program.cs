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
builder.Services.AddSingleton<IOperasyonelBildirimGonderici, OperasyonelBildirimGonderici>();  // v19 B8 - fire-and-forget super admin bildirim
builder.Services.AddSingleton<IAkisYayinci, AkisYayinci>();  // v19 Asama 7 - SSE in-memory event broker
builder.Services.AddScoped<IAuditService, AuditService>();
builder.Services.AddSingleton<IPushGonderici, PushGonderici>();  // v19 push - Web Push gonderim (cok cihaz + gecersiz temizleme + audit)
builder.Services.AddScoped<AnahtarSyncService>();  // v18 Asama 11.9 - Schema-as-Code sync
// v17 - AI API key sifreleme + DataProtection key persistence (docker volume /keys)
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo("/keys"))
    .SetApplicationName("Notlar");
builder.Services.AddSingleton<IApiKeyKripto, DataProtectionApiKeyKripto>();

// v17 - AI Strategy Pattern (HttpClient typed + IMemoryCache 60sn + saglayici factory)
builder.Services.AddMemoryCache();
builder.Services.AddHttpClient<OpenAiAssistService>();
builder.Services.AddHttpClient<AnthropicAssistService>();  // v19 - Anthropic concrete
builder.Services.AddHttpClient<LokalLlmAssistService>();   // v19 - Lokal LLM concrete
builder.Services.AddScoped<IAiAssistServiceFactory, AiAssistServiceFactory>();
// v17 - Runtime placeholder cozucu (G.4 minimal iskelet, stateless singleton)
builder.Services.AddSingleton<ISablonResolver, SablonResolver>();
// v18 Asama10 - WYSIWYG body sanitize (XSS 2. katman, TipTap whitelist arkasinda). Izinli: strong/em/a[href]/br/p.
builder.Services.AddSingleton(_ =>
{
    var s = new Ganss.Xss.HtmlSanitizer();
    s.AllowedTags.Clear();
    foreach (var t in new[] { "strong", "em", "a", "br", "p" }) s.AllowedTags.Add(t);
    s.AllowedAttributes.Clear();
    s.AllowedAttributes.Add("href");
    s.AllowedSchemes.Clear();
    foreach (var sc in new[] { "http", "https", "mailto" }) s.AllowedSchemes.Add(sc);
    return s;
});
// v18 - tenant icerigi + version history (Senaryo A, dogrudan AppDbContext)
builder.Services.AddScoped<IIsletmeMetinService, IsletmeMetinService>();
builder.Services.AddScoped<INotBildirimServisi, NotBildirimServisi>();  // v19 4c - not olay/uye push tetikleyici

// v14 — Defteri İndir servisleri
// PdfRender: Playwright Chromium browser tek instance (singleton, lazy-init), her PDF için yeni context
builder.Services.AddSingleton<IPdfRender, PdfRender>();
builder.Services.AddScoped<IDocxDonusturucu, DocxDonusturucu>();

// Arka plan
builder.Services.AddHostedService<CopKutusuTemizleyici>();
builder.Services.AddHostedService<HatirlaticiKontrolcusu>();
builder.Services.AddHostedService<InaktifTenantTarayici>();  // v19 B8 - hareketsiz tenant gunluk tarama
builder.Services.AddHostedService<SessizSaatBosaltici>();    // v19 4d - sessiz saat kuyrugu bosaltma
builder.Services.AddHostedService<DuyuruTemizleyici>();     // v20 - duyuru gecici veri temizligi (cift kosul + audit)

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
                // v18 Asama 17.3 - once Authorization header (app), yoksa cookie (web - mevcut davranis)
                var headerToken = ctx.Request.Headers["Authorization"]
                    .FirstOrDefault()?.Split(" ").LastOrDefault();
                if (!string.IsNullOrEmpty(headerToken))
                    ctx.Token = headerToken;
                else if (ctx.Request.Cookies.TryGetValue("auth_token", out var token))
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
                        .Select(u => new { u.Aktif, u.SuperAdmin })
                        .FirstOrDefaultAsync(ctx.HttpContext.RequestAborted);

                    // durum null = kullanıcı silinmiş (hard delete); !Aktif = global pasifleştirilmiş
                    bool gecersiz = durum is null || !durum.Aktif;
                    string sebep = "KULLANICI_PASIF_VEYA_SILINDI";

                    // v19 K5 - super_admin DB-claim sync: mevcut kullanici super admin yapilinca/kaldirilinca
                    // JWT eski kalir (claim guncel degil) -> RequireSuperAdmin 403 verir. Yeniden giris beklemeden
                    // anlik yetki: claim != DB ise JWT'yi yenile (tenant gecis pattern; aktif tenant rolu korunur).
                    if (!gecersiz && durum is not null)
                    {
                        var claimSuper = ctx.Principal?.FindFirst("super_admin")?.Value == "true";
                        if (claimSuper != durum.SuperAdmin)
                        {
                            var saKullanici = await db.Kullanicilar.FirstAsync(u => u.Id == kullaniciId, ctx.HttpContext.RequestAborted);
                            var saMevcutRol = ctx.Principal?.FindFirst(System.Security.Claims.ClaimTypes.Role)?.Value;
                            var saJwt = ctx.HttpContext.RequestServices.GetRequiredService<Notlar.Api.Services.IJwtService>();
                            var saYeniToken = saJwt.TokenUret(saKullanici, aktifRol: saMevcutRol);
                            var saCfg = ctx.HttpContext.RequestServices.GetRequiredService<Microsoft.Extensions.Configuration.IConfiguration>();
                            var saGun = int.Parse(saCfg["Jwt:GunOmru"] ?? "30");
                            Notlar.Api.Endpoints.AuthEndpoints.CookieEkle(ctx.HttpContext, saYeniToken, saGun, saCfg, persistent: true);
                            var saYeniJwt = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().ReadJwtToken(saYeniToken);
                            var saKimlik = new System.Security.Claims.ClaimsIdentity(saYeniJwt.Claims, ctx.Principal!.Identity!.AuthenticationType);
                            ctx.Principal = new System.Security.Claims.ClaimsPrincipal(saKimlik);
                        }
                    }

                    // v19 A3 - tenant scope üyelik kontrolü. Yönetimden üye pasifleştirilir/çıkarılırsa anlık çıkış.
                    // toggleAktif IsletmeUyelik.Aktif'i değiştirir; global Kullanici.Aktif değişmez -> eski kod kaçırıyordu.
                    // Super admin hariç: tenant üyeliği olmayabilir + görüntüleme modunda hedef tenant'a üye değildir.
                    if (!gecersiz && durum is not null && !durum.SuperAdmin)
                    {
                        var aktifIsletmeClaim = ctx.Principal?.FindFirst("aktif_isletme_id")?.Value;
                        if (Guid.TryParse(aktifIsletmeClaim, out var aktifIsletmeId))
                        {
                            // v19 İş 2 - aktif tenant GEÇERLİ mi: üye aktif + tenant aktif + silinmemiş.
                            // (A3'ten genişletildi: eskiden sadece IsletmeUyelik.Aktif; artık tenant pasif/silinmiş de yakalanır.)
                            var aktifGecerli = await db.IsletmeUyelikleri
                                .AnyAsync(u => u.IsletmeId == aktifIsletmeId
                                            && u.KullaniciId == kullaniciId
                                            && u.Aktif
                                            && u.Isletme.Aktif
                                            && !u.Isletme.Silindi, ctx.HttpContext.RequestAborted);
                            if (!aktifGecerli)
                            {
                                // Aktif tenant pasif/silinmiş. Başka aktif tenant varsa KESİNTİSİZ GEÇİŞ; yoksa logout.
                                var baska = await db.IsletmeUyelikleri
                                    .Where(u => u.KullaniciId == kullaniciId
                                             && u.Aktif && u.Isletme.Aktif && !u.Isletme.Silindi)
                                    .Select(u => new { u.IsletmeId, u.Rol })
                                    .FirstOrDefaultAsync(ctx.HttpContext.RequestAborted);
                                if (baska is not null)
                                {
                                    // KESİNTİSİZ GEÇİŞ: DB AktifIsletmeId güncelle + yeni token + cookie + bu istek için principal yenile.
                                    var kullanici = await db.Kullanicilar.FirstAsync(u => u.Id == kullaniciId, ctx.HttpContext.RequestAborted);
                                    kullanici.AktifIsletmeId = baska.IsletmeId;
                                    await db.SaveChangesAsync(ctx.HttpContext.RequestAborted);

                                    var jwt = ctx.HttpContext.RequestServices.GetRequiredService<Notlar.Api.Services.IJwtService>();
                                    var yeniToken = jwt.TokenUret(kullanici, aktifRol: baska.Rol);

                                    var yeniCfg = ctx.HttpContext.RequestServices.GetRequiredService<Microsoft.Extensions.Configuration.IConfiguration>();
                                    var yeniGun = int.Parse(yeniCfg["Jwt:GunOmru"] ?? "30");
                                    Notlar.Api.Endpoints.AuthEndpoints.CookieEkle(ctx.HttpContext, yeniToken, yeniGun, yeniCfg, persistent: true);

                                    // Bu istek de yeni tenant bağlamında çalışsın (kesintisiz): principal'i yeni token claim'leriyle yenile.
                                    var yeniJwt = new System.IdentityModel.Tokens.Jwt.JwtSecurityTokenHandler().ReadJwtToken(yeniToken);
                                    var kimlik = new System.Security.Claims.ClaimsIdentity(yeniJwt.Claims,
                                        ctx.Principal!.Identity!.AuthenticationType);
                                    ctx.Principal = new System.Security.Claims.ClaimsPrincipal(kimlik);

                                    // Frontend UI'yi yeni tenant'a senkronlasın (marka/sayaç/notlar): response header -> client invalidate.
                                    ctx.HttpContext.Response.Headers.Append("X-Tenant-Gecis", baska.IsletmeId.ToString());
                                }
                                else
                                {
                                    // Tek tenant'lı kullanıcı + o tenant pasif -> sistemden çıkış.
                                    gecersiz = true;
                                    sebep = "TENANT_PASIF_BASKA_AKTIF_YOK";
                                }
                            }
                        }
                    }

                    if (gecersiz)
                    {
                        // Cookie'yi de temizle — tarayıcı yeniden istek atmasın
                        ctx.HttpContext.Response.Cookies.Delete("auth_token", new Microsoft.AspNetCore.Http.CookieOptions
                        {
                            HttpOnly = true,
                            Secure = ctx.HttpContext.Request.IsHttps,
                            SameSite = Microsoft.AspNetCore.Http.SameSiteMode.Lax,
                            Path = "/"
                        });
                        ctx.Fail(sebep);
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
    // v19 G.5 - super_admin de admin yetkisine sahip: sistem yoneticisi tum tenant'larda admin
    // islemleri yapabilir. (Onceki hal sadece Role="admin" idi; global Rol="kullanici" + tenant
    // Rol="admin" olan super admin, eski JWT veya uye-olmayan-tenant goruntulemede 403 aliyordu.)
    // Yazma islemleri ayrica endpoint icinde GoruntulemeYazmaYok ile korunur (goruntuleme modu = salt okuma).
    opt.AddPolicy("AdminOnly", p => p.RequireAssertion(ctx =>
        ctx.User.IsInRole("admin") || ctx.User.HasClaim("super_admin", "true")));
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
        .WithExposedHeaders("Content-Disposition", "X-Tenant-Gecis")  // v19 - defter indir dosya adi + Is 2 kesintisiz tenant gecisi
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
            -- v19 4d - sessiz saatler (rahatsiz edilmeme) + ertelenen bildirim kuyrugu
            ALTER TABLE kullanicilar
                ADD COLUMN IF NOT EXISTS ""SessizSaatAktif"" boolean NOT NULL DEFAULT false;
            -- Yeni kullanici varsayilani kapali (Musa karari). Kolon zaten varsa ADD atlanir;
            -- bu ALTER mevcut DB'de default'u false'a ceker. Mevcut kullanici SATIRLARINA dokunmaz.
            ALTER TABLE kullanicilar
                ALTER COLUMN ""SessizSaatAktif"" SET DEFAULT false;
            ALTER TABLE kullanicilar
                ADD COLUMN IF NOT EXISTS ""SessizSaatBaslangic"" time without time zone NOT NULL DEFAULT '22:00';
            ALTER TABLE kullanicilar
                ADD COLUMN IF NOT EXISTS ""SessizSaatBitis"" time without time zone NOT NULL DEFAULT '08:00';

            CREATE TABLE IF NOT EXISTS ertelenen_bildirimler (
                ""Id"" uuid PRIMARY KEY,
                ""IsletmeId"" uuid NOT NULL,
                ""KullaniciId"" uuid NOT NULL,
                ""Baslik"" text NOT NULL,
                ""Govde"" text NOT NULL,
                ""Url"" text,
                ""OlusturmaZamani"" timestamp with time zone NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS ""IX_ertelenen_bildirimler_KullaniciId""
                ON ertelenen_bildirimler (""KullaniciId"");
            CREATE INDEX IF NOT EXISTS ""IX_ertelenen_bildirimler_IsletmeId""
                ON ertelenen_bildirimler (""IsletmeId"");

            -- kullanicilar.cinsiyet (v9)
            ALTER TABLE kullanicilar
                ADD COLUMN IF NOT EXISTS ""Cinsiyet"" character varying(10);

            -- notlar hatırlatma kolonları (v9)
            ALTER TABLE notlar
                ADD COLUMN IF NOT EXISTS ""HatirlatmaZamani"" timestamp with time zone;
            ALTER TABLE notlar
                ADD COLUMN IF NOT EXISTS ""HatirlatmaKime"" character varying(10);
            ALTER TABLE notlar
                ADD COLUMN IF NOT EXISTS ""HatirlatmaAliciIdler"" jsonb;
            ALTER TABLE notlar
                ADD COLUMN IF NOT EXISTS ""HatirlatmaSekli"" character varying(15);
            ALTER TABLE notlar
                ADD COLUMN IF NOT EXISTS ""HatirlatmaGonderildiMi"" boolean NOT NULL DEFAULT false;
            ALTER TABLE notlar
                ADD COLUMN IF NOT EXISTS ""HatirlatmaGonderimZamani"" timestamp with time zone;
            ALTER TABLE notlar
                ADD COLUMN IF NOT EXISTS ""HatirlatmaKuranKullaniciId"" uuid;
            -- Olusturma bildirimi durumu. Mevcut notlar zaten duyuruldu (DEFAULT true);
            -- yeni notlar create'te false baslar (ALTER), ilk Kaydet'te duyurulur. Cift bildirim onlenir.
            ALTER TABLE notlar
                ADD COLUMN IF NOT EXISTS ""Duyuruldu"" boolean NOT NULL DEFAULT true;
            ALTER TABLE notlar
                ALTER COLUMN ""Duyuruldu"" SET DEFAULT false;

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
                ""KarsilamaBasligi"" character varying(120) NOT NULL DEFAULT 'Hoş geldin',
                ""KarsilamaAltMetni"" character varying(280) NOT NULL DEFAULT 'Bugün ne planlayalım?',
                ""SayacAktif"" boolean NOT NULL DEFAULT true,
                ""SayacBasligi"" character varying(60) NOT NULL DEFAULT '',
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
            -- v19 B7: 2FA hazirligi (kolon eklenir, aktivasyon v20+)
            ALTER TABLE kullanicilar ADD COLUMN IF NOT EXISTS ""IkiFaktorEtkin"" boolean NOT NULL DEFAULT false;
            -- v19 B8: Operasyonel bildirim altyapisi (super admin mail opt-out + inaktif tarayici cooldown)
            ALTER TABLE kullanicilar ADD COLUMN IF NOT EXISTS ""OperasyonelBildirimAl"" boolean NOT NULL DEFAULT true;
            ALTER TABLE isletmeler ADD COLUMN IF NOT EXISTS ""SonInaktifBildirim"" timestamp with time zone;
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

            -- NOT (v19): Tek-seferlik gecis migration'lari (eski blok 6-9) kaldirildi.
            -- Veri tasima/uyelik/super-admin-bootstrap/AktifIsletmeId-default gorevini v18'de
            -- tamamladi; her restart calisip yeni kullanicilari yanlislikla Planlama Defterimiz'e
            -- cekiyordu (tenant izolasyon driftine sebep). Uyelik artik explicit endpoint'lerle
            -- (admin-ata / Yeni Kullanici) dogru tenant'a yazilir. Idempotent seed bloklari korundu.

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
                ""GuncellemeZamani"" timestamp with time zone NOT NULL DEFAULT now(),
                ""KarakterLimiti"" integer
            );
            CREATE INDEX IF NOT EXISTS ""IX_metin_anahtarlari_Kategori"" 
                ON metin_anahtarlari (""Kategori"");
            CREATE INDEX IF NOT EXISTS ""IX_metin_anahtarlari_Deprecated"" 
                ON metin_anahtarlari (""Deprecated"");
            -- v18 Asama 11.8: anahtar bazinda karakter limiti override (mevcut DB icin; null = tipten gelen default)
            ALTER TABLE metin_anahtarlari
                ADD COLUMN IF NOT EXISTS ""KarakterLimiti"" integer;
            -- v18 Asama 17.1: anahtar kapsami (Tenant doldurur | Sistem super admin ortak)
            ALTER TABLE metin_anahtarlari
                ADD COLUMN IF NOT EXISTS ""Kapsam"" character varying(20) NOT NULL DEFAULT 'Tenant';
            CREATE INDEX IF NOT EXISTS ""IX_metin_anahtarlari_Kapsam""
                ON metin_anahtarlari (""Kapsam"");
            -- v18 Asama 17.3: app push notification cihaz kaydi
            CREATE TABLE IF NOT EXISTS kullanici_cihazlari (
                ""Id"" uuid NOT NULL PRIMARY KEY,
                ""KullaniciId"" uuid NOT NULL REFERENCES kullanicilar(""Id"") ON DELETE CASCADE,
                ""PushToken"" character varying(500) NOT NULL,
                ""Platform"" character varying(20) NOT NULL,
                ""CihazAdi"" character varying(120),
                ""OlusturmaZamani"" timestamp with time zone NOT NULL DEFAULT now(),
                ""SonAktiflik"" timestamp with time zone NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS ""IX_kullanici_cihazlari_KullaniciId""
                ON kullanici_cihazlari (""KullaniciId"");
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_kullanici_cihazlari_PushToken""
                ON kullanici_cihazlari (""PushToken"");
            -- v19 push: Web Push abonelik alanlari (endpoint=PushToken; p256dh+auth ile sifreleme)
            ALTER TABLE kullanici_cihazlari ADD COLUMN IF NOT EXISTS ""PushP256dh"" character varying(200);
            ALTER TABLE kullanici_cihazlari ADD COLUMN IF NOT EXISTS ""PushAuth"" character varying(100);
            -- v19 push: hatirlatici maili kaldirildi; eski email/her_ikisi sekiller uygulama'ya (push+zil)
            UPDATE notlar SET ""HatirlatmaSekli"" = 'uygulama'
                WHERE ""HatirlatmaSekli"" IN ('email', 'her_ikisi');
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

            -- NOT (v19): Tek-seferlik blok 17b (isletmeler kolonlari -> isletme_metinleri,
            -- FROM isletmeler filtresiz) kaldirildi. Mevcut Planlama Defterimiz metinleri v18'de
            -- tasindi (ON CONFLICT korur). Her restart yeni tenant'a deprecated kolon degerlerini
            -- isliyor, AnahtarKatalogu.Varsayilan + Sifir Sablon mimarisini bypass ediyordu.
            -- Artik metin tek dogruluk kaynagi: isletme_metinleri + AnahtarKatalogu.Varsayilan fallback.



            -- 18a. v18 (geri bildirim A+B) marka_ikon_seti kaldirildi: deprecate -> GET / filtreler, sayfada gorunmez
            UPDATE metin_anahtarlari SET ""Deprecated"" = true, ""GuncellemeZamani"" = now()
            WHERE ""Anahtar"" = 'marka_ikon_seti' AND ""Deprecated"" = false;

            -- 18b. v18 sayac_hedef_tarihi: tarih+saat yonlendirmesi (gereksiz '5 yil' ifadesi kaldirildi)
            UPDATE metin_anahtarlari SET
                ""Yonlendirme"" = 'Geri sayımın yöneleceği tarih ve saat.',
                ""Aciklama"" = 'Tarih ve saati seçin; sayaç bu ana kadar geri sayar.',
                ""GuncellemeZamani"" = now()
            WHERE ""Anahtar"" = 'sayac_hedef_tarihi';

            -- v20 - Duyuru Paylasimi (gecici veri: 24 saat mutlak TTL; kalici kayit audit'te)
            CREATE TABLE IF NOT EXISTS duyurular (
                ""Id"" uuid PRIMARY KEY,
                ""IsletmeId"" uuid NOT NULL REFERENCES isletmeler(""Id"") ON DELETE CASCADE,
                ""OlusturanKullaniciId"" uuid NOT NULL REFERENCES kullanicilar(""Id"") ON DELETE CASCADE,
                ""Icerik"" character varying(500) NOT NULL,
                ""AliciTipi"" character varying(10) NOT NULL DEFAULT 'tum',
                ""OlusturmaZamani"" timestamp with time zone NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS ""IX_duyurular_IsletmeId_OlusturmaZamani""
                ON duyurular (""IsletmeId"", ""OlusturmaZamani"");

            CREATE TABLE IF NOT EXISTS duyuru_alicilari (
                ""Id"" uuid PRIMARY KEY,
                ""IsletmeId"" uuid NOT NULL REFERENCES isletmeler(""Id"") ON DELETE CASCADE,
                ""DuyuruId"" uuid NOT NULL REFERENCES duyurular(""Id"") ON DELETE CASCADE,
                ""KullaniciId"" uuid NOT NULL REFERENCES kullanicilar(""Id"") ON DELETE CASCADE,
                ""Goruldu"" boolean NOT NULL DEFAULT false,
                ""GorulmeZamani"" timestamp with time zone NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS ""IX_duyuru_alicilari_DuyuruId_KullaniciId""
                ON duyuru_alicilari (""DuyuruId"", ""KullaniciId"");
            CREATE INDEX IF NOT EXISTS ""IX_duyuru_alicilari_KullaniciId_Goruldu""
                ON duyuru_alicilari (""KullaniciId"", ""Goruldu"");
            CREATE INDEX IF NOT EXISTS ""IX_duyuru_alicilari_IsletmeId""
                ON duyuru_alicilari (""IsletmeId"");

            CREATE TABLE IF NOT EXISTS duyuru_mesajlari (
                ""Id"" uuid PRIMARY KEY,
                ""IsletmeId"" uuid NOT NULL REFERENCES isletmeler(""Id"") ON DELETE CASCADE,
                ""DuyuruId"" uuid NOT NULL REFERENCES duyurular(""Id"") ON DELETE CASCADE,
                ""GonderenKullaniciId"" uuid NOT NULL REFERENCES kullanicilar(""Id"") ON DELETE CASCADE,
                ""Icerik"" character varying(500) NOT NULL,
                ""OlusturmaZamani"" timestamp with time zone NOT NULL DEFAULT now()
            );
            CREATE INDEX IF NOT EXISTS ""IX_duyuru_mesajlari_DuyuruId_OlusturmaZamani""
                ON duyuru_mesajlari (""DuyuruId"", ""OlusturmaZamani"");
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

// v19 PRIORITY 0 (OWASP A01 Broken Access Control) - Server-authoritative impersonation write-guard.
// goruntuleme_modu JWT claim'i + write metodu + tenant yolu (super-admin disi) -> 403 + audit (B1 forensic).
// Defense in depth katman 1: genis kapsam middleware (tum tenant write'lari). Otorite: JWT claim.
app.Use(async (ctx, next) =>
{
    if (ctx.User?.FindFirst("goruntuleme_modu")?.Value == "true")
    {
        var metod = ctx.Request.Method;
        var yazma = HttpMethods.IsPost(metod) || HttpMethods.IsPut(metod)
                 || HttpMethods.IsPatch(metod) || HttpMethods.IsDelete(metod);
        var path = ctx.Request.Path.Value ?? "";
        // /api/super-admin/* istisna: goruntule/bitir cikis + super admin islemleri serbest
        var superAdminYolu = path.StartsWith("/api/super-admin", StringComparison.OrdinalIgnoreCase);
        // /api/auth/* istisna: login/logout/refresh kimlik islemleridir, tenant verisi yazma degildir.
        // Kullanici goruntuleme oturumundan ancak bu yollarla cikabilir; engellenirse hesaba kilitlenir.
        var authYolu = path.StartsWith("/api/auth", StringComparison.OrdinalIgnoreCase);
        if (yazma && !superAdminYolu && !authYolu)
        {
            // B1 - audit trail (atomik: audit yazimi + 403 response ayni istek scope'unda)
            using var scope = ctx.RequestServices.CreateScope();
            var audit = scope.ServiceProvider.GetRequiredService<IAuditService>();
            await audit.YazAsync(
                "goruntuleme_modu_write_engellendi",
                hedefTip: "tenant",
                degisenAlanlar: System.Text.Json.JsonSerializer.Serialize(new
                {
                    metod,
                    path,
                    ip = ctx.Connection.RemoteIpAddress?.ToString(),
                    user_agent = ctx.Request.Headers.UserAgent.ToString()
                }));
            ctx.Response.StatusCode = 403;
            await ctx.Response.WriteAsJsonAsync(new
            {
                hata = "GORUNTULEME_MODU",
                mesaj = "Goruntuleme modunda yazma islemi yapilamaz."
            });
            return;
        }
    }
    await next();
});

app.MapGet("/health", () => Results.Ok(new { status = "ok", time = DateTimeOffset.UtcNow }));
app.MapAuthEndpoints();
app.MapAdminEndpoints();
app.MapFolderEndpoints();
app.MapNoteEndpoints();
app.MapNotificationEndpoints();
app.MapLockEndpoints();
app.MapExportEndpoints();
app.MapIsletmeEndpoints();  // v15
app.MapSuperAdminIsletmeEndpoints();  // v19 Asama 2 - super admin tenant yonetimi
app.MapSuperAdminYonetimEndpoints();   // v19 Asama 5 - multi super admin
app.MapAkisEndpoints();                 // v19 Asama 7 - SSE real-time olay akisi
app.MapSistemEndpoints();   // v17 — super admin metin anahtar katalogu
app.MapSemaEndpoints();      // v18 Asama 11.9 B2 - read-only sistem semasi
app.MapCihazEndpoints();     // v18 Asama 17.3 - app push cihaz kaydi
app.MapTurAuditEndpoints();  // v18 Asama 19 B2 - tur analytics
app.MapAiAyarlariEndpoints();
app.MapMetinlerEndpoints();   // v18 - tenant icerigi   // v17 - AI saglayici ayar yonetimi + saglik
app.MapAiAssistEndpoints();   // v18 Asama 11/12 - AI taslak oneri (saglik + taslak-oner)
app.MapDuyuruEndpoints();     // v20 - duyuru paylasimi

// v18 Asama 11.9 - Schema-as-Code: anahtar katalogu DB'ye senkronize (idempotent, migration sonrasi)
using (var semaScope = app.Services.CreateScope())
{
    var sync = semaScope.ServiceProvider.GetRequiredService<AnahtarSyncService>();
    await sync.SenkronizeAsync();
}

app.Run();
