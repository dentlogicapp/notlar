"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, Send, History, Users } from "lucide-react";
import { toast } from "sonner";
import { kvkkApi } from "@/lib/api";
import { Button } from "./ui/button";
import { Textarea } from "./ui/input";
import { tarihFormat } from "@/lib/utils";
import { cn } from "@/lib/utils";

// v21 M7 + B2 - Super admin KVKK yonetimi: metin yayinla (ATOMIK: eski aktifler
// duser, yeni aktif; yeni versiyon = TUM kullanicilar yeniden onamlar) +
// versiyon gecmisi + onam kayitlari (salt-okunur hukuki kanit; son 500).
// SERH: yayinlanan metin hukuki gecerlilik icin AVUKAT ONAYINDAN gecmis olmalidir.
export function KvkkYonetim() {
  const qc = useQueryClient();
  const [icerik, setIcerik] = useState("");
  const [pazarlama, setPazarlama] = useState("");
  const [sekme, setSekme] = useState<"yayin" | "onamlar">("yayin");

  const { data: metinler } = useQuery({ queryKey: ["kvkk-metinler"], queryFn: kvkkApi.metinler });
  const { data: onamlar, isLoading: onamYukleniyor, isError: onamHata,
    error: onamHataNesnesi, refetch: onamYenile } = useQuery({
    queryKey: ["kvkk-onamlar"],
    queryFn: kvkkApi.onamlar,
    enabled: sekme === "onamlar",
  });

  const yayinla = useMutation({
    mutationFn: () => kvkkApi.metinYayinla(icerik.trim(), pazarlama.trim() || null),
    onSuccess: (r) => {
      toast.success(`KVKK metni v${r.versiyon} yayınlandı - tüm kullanıcılardan yeniden onam istenecek`);
      setIcerik(""); setPazarlama("");
      qc.invalidateQueries({ queryKey: ["kvkk-metinler"] });
      qc.invalidateQueries({ queryKey: ["kvkk-aktif"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="kart p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-clay-800 dark:text-ink-50 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-terracotta" /> KVKK Yönetimi
        </h2>
        <div className="flex gap-1.5">
          <button type="button" onClick={() => setSekme("yayin")}
            className={cn("px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors",
              sekme === "yayin" ? "bg-terracotta/15 text-terracotta" : "text-clay-400 dark:text-ink-300 hover:bg-cream-200 dark:hover:bg-ink-800")}>
            Metin Yayınla
          </button>
          <button type="button" onClick={() => setSekme("onamlar")}
            className={cn("px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1",
              sekme === "onamlar" ? "bg-terracotta/15 text-terracotta" : "text-clay-400 dark:text-ink-300 hover:bg-cream-200 dark:hover:bg-ink-800")}>
            <Users className="h-3 w-3" /> Onam Kayıtları
          </button>
        </div>
      </div>

      {sekme === "yayin" ? (
        <div className="space-y-3">
          <p className="text-[11px] text-clay-400 dark:text-ink-300 leading-relaxed">
            Yeni versiyon yayınlamak, eski versiyonu pasifleştirir ve <strong>tüm kullanıcılardan yeniden onam ister</strong>.
            Metin, hukuki geçerlilik için avukat onayından geçmiş olmalıdır.
          </p>
          <Textarea rows={8} value={icerik} onChange={(e) => setIcerik(e.target.value)}
            placeholder="KVKK aydınlatma ve onam metni (avukat onaylı)..." className="text-justify" />
          <Textarea rows={3} value={pazarlama} onChange={(e) => setPazarlama(e.target.value)}
            placeholder="Pazarlama izni metni (isteğe bağlı; ayrı açık rıza olarak sunulur)..." className="text-justify" />
          <div className="flex justify-end">
            <Button size="sm" disabled={!icerik.trim() || yayinla.isPending}
              onClick={() => { if (confirm("Yeni versiyon yayınlanacak ve TÜM kullanıcılardan yeniden onam istenecek. Devam?")) yayinla.mutate(); }}>
              {yayinla.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
              Yayınla
            </Button>
          </div>

          {(metinler ?? []).length > 0 && (
            <div className="pt-2 border-t border-cream-300 dark:border-ink-600">
              <p className="text-[11px] font-semibold text-clay-600 dark:text-ink-100 flex items-center gap-1.5 mb-2">
                <History className="h-3 w-3" /> Versiyon Geçmişi
              </p>
              <div className="space-y-1">
                {(metinler ?? []).map((m) => (
                  <div key={m.id} className="flex items-center gap-2 text-[11px] text-clay-500 dark:text-ink-200">
                    <span className={cn("px-1.5 py-0.5 rounded-md font-mono",
                      m.aktif ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400" : "bg-cream-200 dark:bg-ink-800")}>
                      v{m.versiyon}{m.aktif && " · aktif"}
                    </span>
                    <span>{tarihFormat(m.yayinZamani)}</span>
                    <span className="font-mono text-clay-400 dark:text-ink-300 truncate">{m.sha256Hash.slice(0, 12)}…</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : onamYukleniyor ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-clay-400 dark:text-ink-300" /></div>
      ) : onamHata ? (
        <div className="py-6 text-center space-y-3">
          <p className="text-[12px] text-red-600 dark:text-red-400">
            Onam kayitlari yuklenemedi: {(onamHataNesnesi as Error)?.message ?? "sunucu hatasi"}
          </p>
          <Button size="sm" onClick={() => onamYenile()}>Tekrar Dene</Button>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead className="text-clay-400 dark:text-ink-300 uppercase tracking-wider">
              <tr>
                <th className="text-left py-1.5 pr-3 font-medium">Kullanıcı</th>
                <th className="text-left py-1.5 pr-3 font-medium">Versiyon</th>
                <th className="text-left py-1.5 pr-3 font-medium">Pazarlama</th>
                <th className="text-left py-1.5 pr-3 font-medium hidden sm:table-cell">IP</th>
                <th className="text-left py-1.5 font-medium">Zaman</th>
              </tr>
            </thead>
            <tbody>
              {(onamlar ?? []).map((o) => (
                <tr key={o.id} title={o.kullaniciAjan ?? undefined} className="border-t border-cream-300 dark:border-ink-700">
                  <td className="py-1.5 pr-3">
                    <span className="text-clay-800 dark:text-ink-50">{o.adSoyad}</span>
                    <span className="text-clay-400 dark:text-ink-300 hidden md:inline"> · {o.email}</span>
                  </td>
                  <td className="py-1.5 pr-3 font-mono">v{o.versiyon}</td>
                  <td className="py-1.5 pr-3">{o.pazarlamaIzni ? "✓ verdi" : "—"}</td>
                  <td className="py-1.5 pr-3 font-mono hidden sm:table-cell">{o.ip ?? "—"}</td>
                  <td className="py-1.5 whitespace-nowrap">{tarihFormat(o.onamZamani)}</td>
                </tr>
              ))}
              {(onamlar ?? []).length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-clay-400 dark:text-ink-300">Henüz onam kaydı yok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
