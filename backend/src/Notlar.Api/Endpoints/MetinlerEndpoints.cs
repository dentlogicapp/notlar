using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Notlar.Api.Data;
using Notlar.Api.Models;
using Notlar.Api.Models.Sema;
using Notlar.Api.Services;

namespace Notlar.Api.Endpoints;

/// <summary>
/// v18 - Tenant icerigi (isletme_metinleri) endpoint'leri.
/// Guard: AdminOnly (aktif tenant admin) + write'larda Goruntuleme-Modu header => 403.
/// Goruntuleme-Modu header'ini v19 salt-okunur akisi set eder; burada ileri-uyumlu guard.
/// </summary>
public static class MetinlerEndpoints
{
    public static void MapMetinlerEndpoints(this WebApplication app)
    {
        // v18 - Public okuma: render icin (dashboard/marka/sayac/mail) TUM auth kullanicilar (es dahil,
        // kullanici rolu). Sadece GET; duzenleme /api/admin/metinler (AdminOnly) altinda kalir. Tenant-scoped.
        var gOku = app.MapGroup("/api/metinler").WithTags("Metinler").RequireAuthorization();
        gOku.MapGet("/", async (AppDbContext db, IUserContext uc, IIsletmeMetinService svc, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tid = uc.AktifIsletmeId.Value;
            var anahtarlar = await db.MetinAnahtarlari
                .Where(a => !a.Deprecated).OrderBy(a => a.Sira).ToListAsync(ct);
            var metinler = await svc.TumunuGetirAsync(tid, ct);
            var map = metinler.ToDictionary(m => m.Anahtar, m => m.Icerik);
            var sonuc = anahtarlar.Select(a => Birlestir(a, map.GetValueOrDefault(a.Anahtar))).ToList();
            return Results.Ok(sonuc);
        });

        var g = app.MapGroup("/api/admin/metinler").WithTags("Metinler").RequireAuthorization("AdminOnly");

        // GET / -> katalog (metin_anahtarlari) + tenant degeri (isletme_metinleri) birlesik
        g.MapGet("/", async (AppDbContext db, IUserContext uc, IIsletmeMetinService svc, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tid = uc.AktifIsletmeId.Value;

            var anahtarlar = await db.MetinAnahtarlari
                .Where(a => !a.Deprecated).OrderBy(a => a.Sira).ToListAsync(ct);
            var metinler = await svc.TumunuGetirAsync(tid, ct);
            var map = metinler.ToDictionary(m => m.Anahtar, m => m.Icerik);

            var sonuc = anahtarlar.Select(a => Birlestir(a, map.GetValueOrDefault(a.Anahtar))).ToList();
            return Results.Ok(sonuc);
        });

        // GET /{anahtar} -> tek anahtar (katalog + deger)
        g.MapGet("/{anahtar}", async (string anahtar, AppDbContext db, IUserContext uc, IIsletmeMetinService svc, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var katalog = await db.MetinAnahtarlari.FirstOrDefaultAsync(a => a.Anahtar == anahtar && !a.Deprecated, ct);
            if (katalog is null) return Results.NotFound(new { hata = "ANAHTAR_BULUNAMADI", mesaj = "Key not found." });
            var metin = await svc.GetirAsync(uc.AktifIsletmeId.Value, anahtar, ct);
            return Results.Ok(Birlestir(katalog, metin?.Icerik));
        });

        // PUT /{anahtar} -> icerik guncelle (versiyona kaydet)
        g.MapPut("/{anahtar}", async (string anahtar, MetinKaydetIstegi req, HttpContext http,
            AppDbContext db, IUserContext uc, IIsletmeMetinService svc, IAuditService audit,
            Ganss.Xss.HtmlSanitizer sanitizer, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (GoruntulemeYazmaYok(http) is { } engel) return engel;
            if (string.IsNullOrWhiteSpace(req.Icerik))
                return Results.BadRequest(new { hata = "ICERIK_ZORUNLU", mesaj = "Content is required." });

            var katalog = await db.MetinAnahtarlari.FirstOrDefaultAsync(a => a.Anahtar == anahtar && !a.Deprecated, ct);
            if (katalog is null) return Results.NotFound(new { hata = "ANAHTAR_BULUNAMADI", mesaj = "Key not found." });

            // v18 Asama10 - body tipi WYSIWYG HTML uretir; 2. katman sanitize (TipTap whitelist arkasinda).
            var icerik = req.Icerik.Trim();
            if (katalog.Tip == "body") icerik = sanitizer.Sanitize(icerik);
            var metin = await svc.KaydetAsync(uc.AktifIsletmeId.Value, anahtar, icerik, uc.KullaniciId, ct);
            await audit.YazAsync("isletme_metni_guncelle", "isletme_metni", metin.Id, detay: anahtar, ct: ct);
            return Results.Ok(Birlestir(katalog, metin.Icerik));
        });

        // DELETE /{anahtar} -> icerigi sifirla (tenant override kaldir)
        g.MapDelete("/{anahtar}", async (string anahtar, HttpContext http,
            IUserContext uc, IIsletmeMetinService svc, IAuditService audit, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (GoruntulemeYazmaYok(http) is { } engel) return engel;

            var silindi = await svc.SifirlaAsync(uc.AktifIsletmeId.Value, anahtar, uc.KullaniciId, ct);
            if (!silindi) return Results.NotFound(new { hata = "METIN_BULUNAMADI", mesaj = "No override to reset." });
            await audit.YazAsync("isletme_metni_sil", "isletme_metni", null, detay: anahtar, ct: ct);
            return Results.NoContent();
        });

        // POST /test-mail -> v19 6c: admin kendi adresine ornek davetiye alir (gercek token/kullanici OLUSTURMAZ).
        // Mevcut davetiye render'i (SifreBelirleMailGonderAsync) reuse; link dummy (sadece gorsel onizleme).
        g.MapPost("/test-mail", async (HttpContext http, IUserContext uc, IEmailService email,
            IAuditService audit, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null || string.IsNullOrWhiteSpace(uc.Email)) return Results.Unauthorized();
            if (GoruntulemeYazmaYok(http) is { } engel) return engel;

            var dummyLink = "https://notlar.dentlogicapp.com/giris?onizleme=1";
            await email.SifreBelirleMailGonderAsync(uc.Email, "Test", dummyLink, uc.AktifIsletmeId.Value, ct);
            await audit.YazAsync("test_mail_gonderildi", "isletme", uc.AktifIsletmeId, detay: uc.Email, ct: ct);
            return Results.Ok(new { gonderildi = true, email = uc.Email });
        });

        // POST /mail-onizle -> v19 4-B/Is2: canli HTML onizleme (gonderme yok). Body'deki degerler kaydedilmemis
        // duzenleme degerleridir; kayitli metinlerin uzerine binerek ANLIK onizleme saglar. Degerler bos -> kayitli hali.
        g.MapPost("/mail-onizle", async (MailOnizleIstegi req, IUserContext uc, IEmailService email, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var gecerli = new[] { "davet", "hatirlatma", "eklendi", "sifre" };
            if (string.IsNullOrWhiteSpace(req.Tip) || !gecerli.Contains(req.Tip))
                return Results.BadRequest(new { hata = "GECERSIZ_TIP", mesaj = "tip: davet|hatirlatma|eklendi|sifre" });

            var html = await email.MailOnizleHtmlAsync(uc.AktifIsletmeId.Value, req.Tip, req.Degerler, ct);
            return Results.Content(html, "text/html; charset=utf-8");
        });

        // GET /{anahtar}/versiyonlar -> son 10 versiyon
        g.MapGet("/{anahtar}/versiyonlar", async (string anahtar, IUserContext uc, IIsletmeMetinService svc, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var versiyonlar = await svc.VersiyonlariGetirAsync(uc.AktifIsletmeId.Value, anahtar, ct);
            var yanit = versiyonlar.Select(v => new MetinVersiyonYaniti(v.Id, v.Versiyon, v.Icerik, v.OlusturmaZamani)).ToList();
            return Results.Ok(yanit);
        });

        // POST /{anahtar}/versiyona-don/{versiyonId} -> eski versiyona don
        g.MapPost("/{anahtar}/versiyona-don/{versiyonId:guid}", async (string anahtar, Guid versiyonId, HttpContext http,
            IUserContext uc, IIsletmeMetinService svc, IAuditService audit, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            if (GoruntulemeYazmaYok(http) is { } engel) return engel;

            var basarili = await svc.VersiyonaDonAsync(uc.AktifIsletmeId.Value, anahtar, versiyonId, uc.KullaniciId, ct);
            if (!basarili) return Results.NotFound(new { hata = "VERSIYON_BULUNAMADI", mesaj = "Version not found." });
            await audit.YazAsync("isletme_metni_versiyona_don", "isletme_metni", versiyonId, detay: anahtar, ct: ct);
            return Results.Ok(new { basarili = true });
        });

        // GET /onboarding-durum -> zorunlu anahtarlarin kac tanesi dolu
        g.MapGet("/onboarding-durum", async (AppDbContext db, IUserContext uc, IIsletmeMetinService svc, CancellationToken ct) =>
        {
            if (uc.AktifIsletmeId is null) return Results.Unauthorized();
            var tid = uc.AktifIsletmeId.Value;

            var zorunlu = await db.MetinAnahtarlari
                .Where(a => !a.Deprecated && a.Zorunlu && a.Kapsam == "Tenant").Select(a => a.Anahtar).ToListAsync(ct);
            var metinler = await svc.TumunuGetirAsync(tid, ct);
            var doluSet = metinler.Where(m => !string.IsNullOrWhiteSpace(m.Icerik)).Select(m => m.Anahtar).ToHashSet();

            var eksik = zorunlu.Where(a => !doluSet.Contains(a)).ToList();
            return Results.Ok(new OnboardingDurum(zorunlu.Count, zorunlu.Count - eksik.Count, eksik));
        });
    }

    // Goruntuleme-Modu header'i true ise yazma yasak (v19 salt-okunur akisi icin ileri-uyumlu guard)
    private static IResult? GoruntulemeYazmaYok(HttpContext http)
        => http.Request.Headers["Goruntuleme-Modu"] == "true"
            ? Results.Json(new { hata = "GORUNTULEME_MODU_YAZMA_YOK", mesaj = "Read-only view mode; write not allowed." }, statusCode: 403)
            : null;

    // metin_anahtarlari (katalog) + tenant Icerik -> birlesik yanit
    private static MetinBirlesik Birlestir(Notlar.Api.Entities.MetinAnahtari a, string? icerik)
        => new(a.Anahtar, a.Etiket, a.Yonlendirme, a.Aciklama, a.Tip, a.Kategori, a.Zorunlu, a.Sira,
               PlaceholderListesi(a.DesteklenenPlaceholderlar), icerik, a.KarakterLimiti, a.Deprecated, a.Kapsam,
               AnahtarKatalogu.Tumu.FirstOrDefault(x => x.Anahtar == a.Anahtar)?.Varsayilan);

    private static IReadOnlyList<string> PlaceholderListesi(string jsonb)
    {
        try { return JsonSerializer.Deserialize<List<string>>(jsonb) ?? new List<string>(); }
        catch { return new List<string>(); }
    }
}

public record MailOnizleIstegi(string Tip, Dictionary<string, string>? Degerler);