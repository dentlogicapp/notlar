"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldCheck, LogOut } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { kvkkApi, authApi } from "@/lib/api";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";

// v21 M7 (K6) - GECILEMEZ KVKK onam ekrani. /ben kvkkOnamGerekli=true iken
// AuthGuard children yerine bunu basar. Onam kimlikli + IP + UA + zaman damgali
// (backend yazar). Pazarlama izni AYRI acik rizadir - zorunlu DEGIL (KVKK geregi
// ayristirilir). Onam zorla alinamaz: reddeden kullanici cikis yapabilir.
export function KvkkGate() {
  const qc = useQueryClient();
  const router = useRouter();
  const [pazarlamaIzni, setPazarlamaIzni] = useState(false);

  const { data: metin, isLoading } = useQuery({
    queryKey: ["kvkk-aktif"],
    queryFn: kvkkApi.aktif,
    retry: false,
    staleTime: 300_000,
  });

  const onam = useMutation({
    mutationFn: () => kvkkApi.onam(pazarlamaIzni),
    onSuccess: () => {
      toast.success("Onamınız kaydedildi. Teşekkürler!");
      qc.invalidateQueries({ queryKey: ["ben"] });  // gate kalkar
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cikis = useMutation({
    mutationFn: () => authApi.cikis(),
    onSuccess: () => { qc.clear(); router.push("/giris"); },
  });

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6 bg-cream-100 dark:bg-ink-900">
      <div className="w-full max-w-2xl kart p-6 sm:p-8 space-y-5 animate-fade-in">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full bg-terracotta/15 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-terracotta" />
          </div>
          <div>
            <h1 className="font-display text-2xl text-clay-900 dark:text-ink-50">KVKK Aydınlatma ve Onam</h1>
            <p className="text-xs text-clay-500 dark:text-ink-200 mt-0.5">
              Devam etmek için aşağıdaki metni okuyup onaylamanız gerekir.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-clay-400 dark:text-ink-300" /></div>
        ) : !metin ? (
          <p className="text-sm text-clay-500 dark:text-ink-200 py-6 text-center">
            Yayınlanmış KVKK metni bulunamadı. Lütfen daha sonra tekrar deneyin.
          </p>
        ) : (
          <>
            <div className="max-h-[45dvh] overflow-y-auto rounded-xl border border-cream-300 dark:border-ink-600 bg-cream-50 dark:bg-ink-800/60 p-4">
              <p className="text-[13px] leading-relaxed text-clay-700 dark:text-ink-100 whitespace-pre-wrap text-justify">
                {metin.icerik}
              </p>
            </div>
            <p className="text-[10px] text-clay-400 dark:text-ink-300 font-mono">
              Versiyon {metin.versiyon} · SHA-256: {metin.sha256Hash.slice(0, 16)}…
            </p>

            {metin.pazarlamaIcerik && (
              <label className="flex items-start gap-2.5 p-3 rounded-xl border border-cream-300 dark:border-ink-600 cursor-pointer hover:bg-cream-100/60 dark:hover:bg-ink-800/60 transition-colors">
                <Checkbox
                  checked={pazarlamaIzni}
                  onCheckedChange={(v) => setPazarlamaIzni(v === true)}
                  className="mt-0.5 shrink-0"
                />
                <span className="text-[12px] leading-relaxed text-clay-600 dark:text-ink-100">
                  <strong className="text-clay-800 dark:text-ink-50">İsteğe bağlı:</strong>{" "}
                  {metin.pazarlamaIcerik}
                </span>
              </label>
            )}

            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => cikis.mutate()}
                className="inline-flex items-center gap-1.5 text-[12px] text-clay-400 dark:text-ink-300 hover:text-red-600 transition-colors"
              >
                <LogOut className="h-3.5 w-3.5" /> Onaylamıyorum, çıkış yap
              </button>
              <Button onClick={() => onam.mutate()} disabled={onam.isPending}>
                {onam.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <ShieldCheck className="h-4 w-4 mr-1.5" />}
                Okudum, onaylıyorum
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
