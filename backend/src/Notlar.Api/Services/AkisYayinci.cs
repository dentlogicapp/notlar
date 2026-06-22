using System.Collections.Concurrent;
using System.Threading.Channels;

namespace Notlar.Api.Services;

/// <summary>
/// v19 Asama 7 - SSE akis olayi (super admin real-time feed). Audit'in canli hali.
/// Tenant-bagimsiz sistem olaylari (super admin paneli izler).
/// </summary>
public sealed record AkisOlayi(
    string Olay,
    string? HedefTip,
    Guid? HedefId,
    Guid? IsletmeId,
    string? AktorEmail,
    string? Detay,
    DateTimeOffset Zaman);

/// <summary>
/// v19 Asama 7 - In-memory event broker (singleton). Fan-out: her abone (SSE baglantisi)
/// kendi bounded channel'ina sahip; Yayinla tum abonelere yazar.
///
/// Tasarim:
///   - Tek-instance in-memory (Redis pub/sub gelecek surumde).
///   - Bounded channel (kapasite 100, DropOldest): yavas/tikanan abone tum yayini bloklamaz.
///   - Yayinla fire-and-forget TryWrite (asla throw etmez, audit yazimini bloklamaz).
///   - Thread-safe: ConcurrentDictionary + Channel (yerlesik thread-safe).
/// </summary>
public interface IAkisYayinci
{
    void Yayinla(AkisOlayi olay);
    (Guid Id, ChannelReader<AkisOlayi> Reader) AboneOl();
    void Cik(Guid id);
}

public sealed class AkisYayinci : IAkisYayinci
{
    private readonly ConcurrentDictionary<Guid, Channel<AkisOlayi>> _aboneler = new();

    public void Yayinla(AkisOlayi olay)
    {
        // Fan-out: tum abonelere yaz. TryWrite throw etmez; dolu channel'da DropOldest devreye girer.
        foreach (var ch in _aboneler.Values)
            ch.Writer.TryWrite(olay);
    }

    public (Guid Id, ChannelReader<AkisOlayi> Reader) AboneOl()
    {
        var id = Guid.NewGuid();
        var ch = Channel.CreateBounded<AkisOlayi>(new BoundedChannelOptions(100)
        {
            FullMode = BoundedChannelFullMode.DropOldest,
            SingleReader = true,
            SingleWriter = false,
        });
        _aboneler[id] = ch;
        return (id, ch.Reader);
    }

    public void Cik(Guid id)
    {
        if (_aboneler.TryRemove(id, out var ch))
            ch.Writer.TryComplete();
    }
}
