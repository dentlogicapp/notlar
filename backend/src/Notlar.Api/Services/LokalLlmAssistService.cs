using Microsoft.Extensions.Caching.Memory;
using Notlar.Api.Data;
using Notlar.Api.Entities;

namespace Notlar.Api.Services;

// v19 - Lokal LLM saglayici (LM Studio / Ollama / vLLM - OpenAI uyumlu API).
// OpenAiUyumluAssistService'i extend eder: prompt uretimi, /chat/completions cagrisi ve
// yanit parse tamamen base'ten gelir. LM Studio/Ollama OpenAI uyumlu endpoint sundugu icin
// kod tekrari sifirdir. Tek fark: BaseUrl tenant ayarindan (ayar.BaseUrl) gelir.
// Auth opsiyonel (base virtual default): lokal sunucular genelde auth gerektirmez, ApiKeyEncrypted bos kalir.
public sealed class LokalLlmAssistService : OpenAiUyumluAssistService
{
    public LokalLlmAssistService(
        HttpClient http, AppDbContext db, IApiKeyKripto kripto,
        IMemoryCache cache, ILogger<LokalLlmAssistService> log)
        : base(http, db, kripto, cache, log) { }

    public override string SaglayiciAdi => "lokal";

    protected override string BaseUrlBelirle(AiAyari ayar)
    {
        if (string.IsNullOrWhiteSpace(ayar.BaseUrl))
            throw new AiKullanilamazException("AI_BASE_URL_ZORUNLU", "Lokal saglayici icin Base URL zorunlu.");
        return ayar.BaseUrl.TrimEnd('/');
    }
}
