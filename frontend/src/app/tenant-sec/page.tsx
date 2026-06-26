"use client";

import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { BookOpen, Loader2, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { isletmeApi } from "@/lib/api";
import type { Uyelik } from "@/lib/types";

/**
 * v15 — Multi-tenant: kullanıcının birden fazla markaya üye olması durumunda
 * giriş sonrası bu sayfaya yönlendirilir.
 * 1 markaya üye kullanıcılar bu sayfayı görmez (giris/page.tsx otomatik / yönlendirir).
 */
export default function TenantSecSayfasi() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: uyelikler, isLoading } = useQuery({
    queryKey: ["isletme-uyelik"],
    queryFn: isletmeApi.uyelik,
  });

  // Eğer hiç üyelik yoksa veya tek bir üyelik varsa, direkt ana sayfaya yönlendir
  useEffect(() => {
    if (uyelikler && uyelikler.length <= 1) {
      router.replace("/");
    }
  }, [uyelikler, router]);

  const sec = useMutation({
    mutationFn: (id: string) => isletmeApi.aktifDegistir(id),
    onSuccess: (ben) => {
      qc.setQueryData(["ben"], ben);
      // Tüm cache'i temizle — yeni tenant'ın verisini taze çek
      qc.invalidateQueries();
      toast.success(`${ben.uyelikler?.find(u => u.isletmeId === ben.aktifIsletmeId)?.markaAdi ?? "Marka"} seçildi`);
      router.push("/");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-terracotta" />
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-terracotta/15 mb-4">
            <BookOpen className="h-6 w-6 text-terracotta" />
          </div>
          <h1 className="font-display text-3xl text-clay-900 dark:text-ink-50">Hangi marka?</h1>
          <p className="text-clay-500 dark:text-ink-200 mt-1.5 italic text-sm">
            Birden fazla markaya üyesin. Devam etmek istediğini seç.
          </p>
        </div>

        <div className="space-y-3 animate-fade-in">
          {uyelikler?.map((u: Uyelik) => (
            <button
              key={u.isletmeId}
              onClick={() => sec.mutate(u.isletmeId)}
              disabled={sec.isPending || !u.aktif}
              className="kart w-full p-5 sm:p-6 flex items-center gap-4 hover:border-terracotta/40 transition-colors text-left group disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="text-3xl shrink-0">{u.markaEmoji || "🏢"}</div>
              <div className="flex-1 min-w-0">
                <div className="font-display text-lg text-clay-900 dark:text-ink-50 truncate">
                  {u.markaAdi}
                </div>
                <div className="text-xs text-clay-500 dark:text-ink-200 mt-0.5 flex items-center gap-2">
                  <span>
                    {u.rol === "admin" ? "Yönetici" : "Üye"}
                  </span>
                  {!u.aktif && (
                    <span className="px-1.5 py-0.5 text-[10px] rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">
                      pasif
                    </span>
                  )}
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-clay-400 dark:text-ink-300 group-hover:text-terracotta transition-colors shrink-0" />
            </button>
          ))}
        </div>

        {sec.isPending && (
          <div className="mt-6 text-center text-xs text-clay-500 dark:text-ink-200">
            <Loader2 className="h-3.5 w-3.5 animate-spin inline-block mr-1.5" />
            Seçim uygulanıyor...
          </div>
        )}
      </div>
    </main>
  );
}
