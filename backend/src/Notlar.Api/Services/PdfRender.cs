using Microsoft.Playwright;

namespace Notlar.Api.Services;

/// <summary>
/// v14 — HTML → PDF dönüşümü.
/// Playwright Chromium headless ile davetiye kalitesinde HTML'i pixel-perfect PDF'e çevirir.
/// CSS @page kuralları, Google Fonts, SVG dekoratif öğeler — hepsi korunur.
///
/// Container içinde Chromium binary'sini Microsoft official Playwright .NET base image sağlar.
/// </summary>
public interface IPdfRender
{
    Task<byte[]> HtmlPdfeAsync(string html, CancellationToken ct = default);
}

public sealed class PdfRender : IPdfRender, IAsyncDisposable
{
    private IPlaywright? _playwright;
    private IBrowser? _browser;
    private readonly SemaphoreSlim _initLock = new(1, 1);
    private readonly ILogger<PdfRender> _logger;

    public PdfRender(ILogger<PdfRender> logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Lazy-init: Chromium binary'sini ilk PDF üretiminde başlat, sonra cache'le.
    /// Process boyunca tek browser instance — her PDF için yeni context (izolasyon).
    /// </summary>
    private async Task EnsureBrowserAsync(CancellationToken ct)
    {
        if (_browser is not null) return;
        await _initLock.WaitAsync(ct);
        try
        {
            if (_browser is not null) return;

            _logger.LogInformation("Playwright Chromium başlatılıyor (ilk PDF üretimi)...");
            _playwright = await Playwright.CreateAsync();
            _browser = await _playwright.Chromium.LaunchAsync(new BrowserTypeLaunchOptions
            {
                Headless = true,
                Args = new[]
                {
                    "--disable-dev-shm-usage",  // /dev/shm Docker'da küçük → /tmp kullan
                    "--no-sandbox",               // Container'da sandbox gerekmez
                    "--disable-gpu",
                    "--font-render-hinting=none" // Fraunces variable axis renderlama
                }
            });
            _logger.LogInformation("Playwright Chromium hazır.");
        }
        finally
        {
            _initLock.Release();
        }
    }

    public async Task<byte[]> HtmlPdfeAsync(string html, CancellationToken ct = default)
    {
        await EnsureBrowserAsync(ct);
        if (_browser is null) throw new InvalidOperationException("Browser başlatılamadı");

        var ctx = await _browser.NewContextAsync(new BrowserNewContextOptions
        {
            ViewportSize = new ViewportSize { Width = 1240, Height = 1754 } // A4 @ ~150 DPI
        });

        try
        {
            var page = await ctx.NewPageAsync();

            // HTML'i belleğe yerleştir; Google Fonts ve SVG yüklensin diye networkidle bekle
            await page.SetContentAsync(html, new PageSetContentOptions
            {
                WaitUntil = WaitUntilState.NetworkIdle,
                Timeout = 30_000
            });

            // Google Fonts'un tamamen yüklenmesi için ek bekle (variable axis için kritik)
            await page.EvaluateAsync("() => document.fonts.ready");

            var pdf = await page.PdfAsync(new PagePdfOptions
            {
                Format = "A4",
                PrintBackground = true,
                Margin = new Margin
                {
                    Top = "0",     // CSS @page kuralları margin'i yönetir
                    Right = "0",
                    Bottom = "0",
                    Left = "0"
                },
                PreferCSSPageSize = true,
                DisplayHeaderFooter = false
            });
            return pdf;
        }
        finally
        {
            await ctx.CloseAsync();
        }
    }

    public async ValueTask DisposeAsync()
    {
        if (_browser is not null) await _browser.DisposeAsync();
        _playwright?.Dispose();
        _initLock.Dispose();
    }
}
