using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using Notlar.Api.Data;

namespace Notlar.Api.Services;

/// <summary>
/// v17 - Aktif AI saglayicisina gore IAiAssistService cozucu (Strategy resolver).
/// ai_ayarlari.Saglayici switch. Saglayici degeri 60sn IMemoryCache'te (her cagrida DB sorgusu yok - G.2).
/// </summary>
public interface IAiAssistServiceFactory
{
    Task<IAiAssistService> ServisGetirAsync(CancellationToken ct = default);
    void CacheTemizle();
}

/// <summary>
/// G.9: Scoped. OpenAiAssistService AppDbContext'e (scoped) baglidir; singleton factory
/// captive dependency yaratirdi. Cache IMemoryCache (singleton) icinde - 60sn paylasim korunur.
/// </summary>
public sealed class AiAssistServiceFactory : IAiAssistServiceFactory
{
    private const string CACHE_ANAHTAR = "ai_ayar_saglayici";

    private readonly IServiceProvider _sp;
    private readonly IMemoryCache _cache;
    private readonly AppDbContext _db;

    public AiAssistServiceFactory(IServiceProvider sp, IMemoryCache cache, AppDbContext db)
    {
        _sp = sp;
        _cache = cache;
        _db = db;
    }

    public async Task<IAiAssistService> ServisGetirAsync(CancellationToken ct = default)
    {
        var saglayici = await _cache.GetOrCreateAsync(CACHE_ANAHTAR, async entry =>
        {
            entry.AbsoluteExpirationRelativeToNow = TimeSpan.FromSeconds(60);
            var ayar = await _db.AiAyarlari.FirstOrDefaultAsync(ct);
            return ayar?.Saglayici ?? "openai";
        }) ?? "openai";

        return saglayici switch
        {
            "openai" => _sp.GetRequiredService<OpenAiAssistService>(),
            "anthropic" => _sp.GetRequiredService<AnthropicAssistService>(),
            "lokal" => _sp.GetRequiredService<LokalLlmAssistService>(),
            _ => throw new AiKullanilamazException("AI_SAGLAYICI_HENUZ_DESTEKLENMIYOR")
        };
    }

    // PUT /ai-ayarlari saglayici degistirince cagrilir (v17 Asama 7 / v18 endpoint).
    public void CacheTemizle() => _cache.Remove(CACHE_ANAHTAR);
}