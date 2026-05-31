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

app.Run();
