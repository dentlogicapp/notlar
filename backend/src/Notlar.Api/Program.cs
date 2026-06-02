using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
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
                    ctx.HttpContext.Response.Cookies.Delete("auth_token");
                    ctx.Fail("KULLANICI_PASIF_VEYA_SILINDI");
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
        ");
        Log.Information("Şema güncellemeleri kontrol edildi (idempotent)");
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

app.Run();
