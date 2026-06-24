"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { CountdownWidget } from "@/components/CountdownWidget";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { notApi } from "@/lib/api";
import { useBen } from "@/lib/useBen";
import { tarihFormat } from "@/lib/utils";
import type { Not } from "@/lib/types";

export default function Page() {
  return (
    <AuthGuard>
      <Icerik />
    </AuthGuard>
  );
}

function Icerik() {
  const qc = useQueryClient();
  const { data: ben } = useBen();
  const { data, isLoading } = useQuery({
    queryKey: ["notlar", { silindi: true }],
    queryFn: () => notApi.list({ silindi: true }),
  });

  // v19 Paket 3 - aktif tenant admin mi (kalici silme yetkisi: admin tum notlari, uye yalnizca kendi olusturdugunu)
  const benAdmin = (ben?.uyelikler ?? []).find((u) => u.isletmeId === ben?.aktifIsletmeId)?.rol === "admin";
  const yetkili = (n: Not) => benAdmin || ben?.id === n.olusturanId;

  const [bosaltOnay, setBosaltOnay] = useState(false);

  const geri = useMutation({
    mutationFn: (id: string) => notApi.geriYukle(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notlar"] });
      toast.success("Geri yüklendi");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const kaliciSil = useMutation({
    mutationFn: (id: string) => notApi.kaliciSil(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notlar"] });
      toast.success("Kalıcı olarak silindi");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const copBosalt = useMutation({
    mutationFn: () => notApi.copBosalt(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["notlar"] });
      setBosaltOnay(false);
      toast.success(r.silinen > 0 ? `${r.silinen} not kalıcı silindi` : "Silinecek not yok");
    },
    onError: (err: Error) => {
      setBosaltOnay(false);
      toast.error(err.message);
    },
  });

  // Yetki dahilinde kalici silinebilecek cop notu var mi -> bosalt butonu goster
  const bosaltilabilirVar = (data ?? []).some((n) => yetkili(n));

  return (
    <main className="min-h-screen pb-24">
      <CountdownWidget />

      <header className="sticky top-0 z-30 bg-cream-100/85 dark:bg-ink-800/85 backdrop-blur-md border-b border-cream-300 dark:border-ink-700/60">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-1 text-clay-600 dark:text-ink-100 hover:text-clay-900 dark:hover:text-ink-50 transition-colors min-w-0">
            <ChevronLeft className="h-5 w-5 shrink-0" />
            <span className="font-display text-base truncate">Çöp Kutusu</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <section>
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <div className="flex items-center gap-3">
              <Trash2 className="h-6 w-6 text-clay-500 dark:text-ink-200" />
              <h1 className="font-display text-3xl text-clay-900 dark:text-ink-50">Çöp Kutusu</h1>
            </div>
            {bosaltilabilirVar && !bosaltOnay && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBosaltOnay(true)}
                className="text-red-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20"
              >
                <Trash2 className="h-4 w-4 mr-1.5" /> Kutuyu Boşalt
              </Button>
            )}
            {bosaltOnay && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-700 dark:text-rose-300">Tümü kalıcı silinsin mi?</span>
                <Button variant="danger" size="sm" onClick={() => copBosalt.mutate()} disabled={copBosalt.isPending}>
                  Evet, sil
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setBosaltOnay(false)}>
                  Vazgeç
                </Button>
              </div>
            )}
          </div>
          <p className="text-sm text-clay-500 dark:text-ink-200 italic">
            Silinen notlar burada 30 gün bekler, sonra otomatik temizlenir. Kalıcı silme geri alınamaz.
          </p>
        </section>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-clay-400 dark:text-ink-300" /></div>
        ) : !data || data.length === 0 ? (
          <div className="text-center py-12">
            <p className="font-display text-2xl text-clay-300 dark:text-ink-400 italic">çöp kutusu boş</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.map((n) => (
              <SilinmisKart
                key={n.id}
                n={n}
                yetkili={yetkili(n)}
                onGeri={() => geri.mutate(n.id)}
                onKaliciSil={() => kaliciSil.mutate(n.id)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function SilinmisKart({ n, yetkili, onGeri, onKaliciSil }: {
  n: Not; yetkili: boolean; onGeri: () => void; onKaliciSil: () => void;
}) {
  const [silOnay, setSilOnay] = useState(false);
  const silinme = n.silinmeZamani ? new Date(n.silinmeZamani) : null;
  const otoSilme = silinme ? new Date(silinme.getTime() + 30 * 86400000) : null;
  const gun = otoSilme ? Math.max(0, Math.ceil((otoSilme.getTime() - Date.now()) / 86400000)) : null;

  return (
    <div className="kart p-4 flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <h4 className="text-[15px] text-clay-700 dark:text-ink-100 line-through">{n.baslik}</h4>
        {n.icerik && <p className="text-sm text-clay-400 dark:text-ink-300 line-clamp-2 mt-1">{n.icerik}</p>}
        <p className="text-xs text-clay-400 dark:text-ink-300 mt-2">
          {silinme && <>Silindi: {tarihFormat(n.silinmeZamani)} · </>}
          {gun !== null && <span className="text-amber-700">Otomatik silmeye {gun} gün</span>}
        </p>
      </div>
      <div className="flex flex-col sm:flex-row items-end sm:items-center gap-2 shrink-0">
        {!silOnay ? (
          <>
            <Button variant="outline" size="sm" onClick={onGeri}>
              <RotateCcw className="h-4 w-4 mr-1.5" /> Geri Yükle
            </Button>
            {yetkili && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSilOnay(true)}
                className="text-red-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20"
              >
                <Trash2 className="h-4 w-4 mr-1.5" /> Kalıcı Sil
              </Button>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-700 dark:text-rose-300">Kalıcı sil?</span>
            <Button variant="danger" size="sm" onClick={onKaliciSil}>Evet</Button>
            <Button variant="ghost" size="sm" onClick={() => setSilOnay(false)}>Vazgeç</Button>
          </div>
        )}
      </div>
    </div>
  );
}
