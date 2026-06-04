using System.Diagnostics;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Notlar.Api.Data;
using Notlar.Api.Entities;
using Notlar.Api.Models;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

/// <summary>
/// v17 - AI saglayici ayar yonetimi (super admin) + saglik durumu (siradan admin).
/// Senaryo A: dogrudan AppDbContext (singleton ai_ayarlari). Test factory + IAiAssistService uzerinden.
/// </summary>
public static class AiAyarlariEndpoints
{
    private static readonly string[] Saglayicilar = { "openai", "anthropic", "lokal" };

    public static void MapAiAyarlariEndpoints(this IEndpointRouteBuilder app)
    {
        // --- Grup 1: super admin ai-ayarlari yonetimi ---
        var g = app.MapGroup("/api/super-admin/ai-ayarlari")
            .WithTags("SuperAdmin")
            .RequireAuthorization()
            .RequireSuperAdmin();

        // GET / - mevcut config (apiKey maskeli)
        g.MapGet("/", async (AppDbContext db, IApiKeyKripto kripto, CancellationToken ct) =>
        {
            var a = await db.AiAyarlari.FirstOrDefaultAsync(ct);
            if (a is null)
                return Results.NotFound(new { hata = "AI_AYAR_BULUNAMADI", mesaj = "AI ayari bulunamadi." });
            return Results.Ok(AyarYanit(a, kripto));
        });

        // PUT / - config guncelle (saglayici/saglik cache invalidate)
        g.MapPut("/", async (
            AiAyariGuncelleIstegi req, AppDbContext db, IUserContext uc, IApiKeyKripto kripto,
            IAiAssistServiceFactory factory, IAuditService audit, IMemoryCache cache, CancellationToken ct) =>
        {
            var saglayici = (req.Saglayici ?? "").Trim().ToLowerInvariant();
            if (!Saglayicilar.Contains(saglayici))
                return Results.BadRequest(new { hata = "AI_SAGLAYICI_GECERSIZ", mesaj = "Gecersiz saglayici." });

            var modelId = (req.ModelId ?? "").Trim();
            if (modelId.Length is < 1 or > 120)
                return Results.BadRequest(new { hata = "DOGRULAMA_HATASI", mesaj = "ModelId 1-120 karakter olmali." });

            var baseUrl = string.IsNullOrWhiteSpace(req.BaseUrl) ? null : req.BaseUrl.Trim();
            if (saglayici == "lokal" && baseUrl is null)
                return Results.BadRequest(new { hata = "AI_BASE_URL_ZORUNLU", mesaj = "Lokal saglayici icin baseUrl zorunlu." });

            var timeout = req.TimeoutMs ?? 30000;
            if (timeout is < 1000 or > 120000)
                return Results.BadRequest(new { hata = "DOGRULAMA_HATASI", mesaj = "TimeoutMs 1000-120000 araliginda olmali." });

            var a = await db.AiAyarlari.FirstOrDefaultAsync(ct);
            if (a is null)
                return Results.NotFound(new { hata = "AI_AYAR_BULUNAMADI", mesaj = "AI ayari bulunamadi." });

            // openai/anthropic: apiKey zorunlu (yeni girilmedi VE mevcut yoksa hata)
            if ((saglayici == "openai" || saglayici == "anthropic")
                && string.IsNullOrWhiteSpace(req.ApiKey)
                && string.IsNullOrEmpty(a.ApiKeyEncrypted))
                return Results.BadRequest(new { hata = "AI_API_KEY_ZORUNLU", mesaj = "Bu saglayici icin API key zorunlu." });

            // diff (degisen alan eski/yeni snapshot)
            var degisenler = new Dictionary<string, object>();
            if (saglayici != a.Saglayici) { degisenler["Saglayici"] = new { eski = a.Saglayici, yeni = saglayici }; a.Saglayici = saglayici; }
            if (modelId != a.ModelId) { degisenler["ModelId"] = new { eski = a.ModelId, yeni = modelId }; a.ModelId = modelId; }
            if (baseUrl != a.BaseUrl) { degisenler["BaseUrl"] = new { eski = a.BaseUrl, yeni = baseUrl }; a.BaseUrl = baseUrl; }
            if (timeout != a.TimeoutMs) { degisenler["TimeoutMs"] = new { eski = a.TimeoutMs, yeni = timeout }; a.TimeoutMs = timeout; }
            var aktif = req.Aktif ?? a.Aktif;
            if (aktif != a.Aktif) { degisenler["Aktif"] = new { eski = a.Aktif, yeni = aktif }; a.Aktif = aktif; }
            // apiKey: yeni girilirse sifrele (rotation), bos ise koru. Ham/cipher audit'e YAZILMAZ.
            if (!string.IsNullOrWhiteSpace(req.ApiKey))
            {
                a.ApiKeyEncrypted = kripto.Sifrele(req.ApiKey.Trim());
                degisenler["ApiKey"] = "(degistirildi)";
            }

            // Degisiklik yoksa: yazma + audit yok, mevcut config'i don
            if (degisenler.Count > 0)
            {
                a.GuncellemeZamani = DateTimeOffset.UtcNow;
                a.GuncelleyenKullaniciId = uc.KullaniciId;
                await audit.YazAsync("ai_ayar_guncelle", "ai_ayari", a.Id,
                    degisenAlanlar: JsonSerializer.Serialize(degisenler), ct: ct);

                // Saglayici degismis olabilir + Aktif/key degisti -> cache temizle (anlik yeniden cozulsun)
                factory.CacheTemizle();
                foreach (var s in Saglayicilar) cache.Remove($"ai_saglik_{s}");
            }
            return Results.Ok(AyarYanit(a, kripto));
        });

        // POST /test - anlik ping (saglik cache bypass + factory)
        g.MapPost("/test", async (
            AppDbContext db, IAiAssistServiceFactory factory, IMemoryCache cache,
            IAuditService audit, CancellationToken ct) =>
        {
            var a = await db.AiAyarlari.FirstOrDefaultAsync(ct);
            if (a is null)
                return Results.NotFound(new { hata = "AI_AYAR_BULUNAMADI", mesaj = "AI ayari bulunamadi." });

            cache.Remove($"ai_saglik_{a.Saglayici}");   // anlik test: onbellegi atla
            var basla = Stopwatch.GetTimestamp();
            try
            {
                var servis = await factory.ServisGetirAsync(ct);
                var saglikli = await servis.SaglikKontrolAsync(ct);
                var sure = (long)Stopwatch.GetElapsedTime(basla).TotalMilliseconds;
                await audit.YazAsync("ai_ayar_test", "ai_ayari", a.Id,
                    degisenAlanlar: JsonSerializer.Serialize(new { saglikli, saglayici = a.Saglayici }), ct: ct);
                return Results.Ok(new
                {
                    saglikli,
                    yanitSuresi = sure,
                    modelAdi = a.ModelId,
                    saglayici = a.Saglayici,
                    mesaj = saglikli
                        ? "Saglayici erisilebilir, yanit veriyor."
                        : "Saglayici yanit vermedi veya AI kapali."
                });
            }
            catch (AiKullanilamazException ex)
            {
                return Results.Json(new { hata = ex.Kod, mesaj = "AI testi basarisiz." }, statusCode: 503);
            }
        });

        // GET /modeller - saglayiciya gore desteklenen model listesi (statik)
        g.MapGet("/modeller", (string? saglayici) =>
        {
            var s = (saglayici ?? "openai").Trim().ToLowerInvariant();
            object[] modeller = s switch
            {
                "openai" => new object[]
                {
                    new { id = "gpt-4o-mini", etiket = "GPT-4o mini (hizli + ucuz, onerilen)" },
                    new { id = "gpt-4o", etiket = "GPT-4o (yuksek kalite)" },
                    new { id = "gpt-4-turbo", etiket = "GPT-4 Turbo (legacy)" }
                },
                // anthropic/lokal v17'de placeholder - model listesi gelecek surumde doldurulur
                _ => Array.Empty<object>()
            };
            return Results.Ok(new { saglayici = s, modeller });
        });

        // --- Grup 2: siradan admin saglik durumu (hizli okuma) ---
        var g2 = app.MapGroup("/api/admin/ai-assist")
            .WithTags("AiAssist")
            .RequireAuthorization();

        // GET /saglik - AI kullanilabilir mi (ai_ayarlari.SonSaglik* kolonlarindan)
        g2.MapGet("/saglik", async (AppDbContext db, CancellationToken ct) =>
        {
            var a = await db.AiAyarlari.FirstOrDefaultAsync(ct);
            var kullanilabilir = a is not null && a.Aktif && (a.SonSaglikDurum ?? false);
            return Results.Ok(new { kullanilabilir, sonKontrol = a?.SonSaglikKontrol });
        });
    }

    // --- Helper: entity -> yanit DTO (apiKey son 4 maskeli) ---
    private static AiAyariYaniti AyarYanit(AiAyari a, IApiKeyKripto kripto)
    {
        string? maskeli = null;
        if (!string.IsNullOrEmpty(a.ApiKeyEncrypted))
        {
            try
            {
                var raw = kripto.Coz(a.ApiKeyEncrypted);
                maskeli = raw.Length <= 8 ? "****" : $"{raw[..8]}...{raw[^4..]}";
            }
            catch
            {
                maskeli = "****";   // cipher cozulemezse (DataProtection key kaybi)
            }
        }
        return new AiAyariYaniti(
            a.Saglayici, a.ModelId, maskeli, a.BaseUrl, a.TimeoutMs, a.Aktif,
            a.SonSaglikKontrol, a.SonSaglikDurum);
    }
}