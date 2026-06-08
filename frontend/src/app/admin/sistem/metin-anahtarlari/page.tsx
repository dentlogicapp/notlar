"use client";

import Link from "next/link";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Heart, Loader2, Search, FileText } from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import { Input } from "@/components/ui/input";
import { sistemApi } from "@/lib/api";

const KATEGORI_ETIKET: Record<string, string> = {
  mail: "Mail",
  dashboard: "Dashboard",
  sayac: "Sayac",
  bildirim: "Bildirim",
  form: "Form",
  marka: "Marka",
};

export default function Page() {
  const { data: anahtarlar, isLoading } = useQuery({
    queryKey: ["metin-anahtarlari"],
    queryFn: sistemApi.listAnahtar,
  });

  const [arama, setArama] = useState("");

  const gruplu = useMemo(() => {
    const liste = (anahtarlar ?? []).filter((a) => {
      if (!arama.trim()) return true;
      const q = arama.toLowerCase();
      return a.anahtar.toLowerCase().includes(q) || a.etiket.toLowerCase().includes(q);
    });
    const map = new Map<string, typeof liste>();
    for (const a of liste) {
      const k = a.kategori;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(a);
    }
    return Array.from(map.entries()).sort((x, y) => x[0].localeCompare(y[0]));
  }, [anahtarlar, arama]);

  return (
    <main className="min-h-screen pb-24">
      <header className="sticky top-0 z-30 bg-cream-100/85 dark:bg-ink-800/85 backdrop-blur-md border-b border-cream-300 dark:border-ink-700/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link href="/admin" className="flex items-center gap-1 text-clay-600 dark:text-ink-100 hover:text-clay-900 dark:hover:text-ink-50 transition-colors min-w-0">
            <ChevronLeft className="h-5 w-5 shrink-0" />
            <Heart className="h-4 w-4 text-terracotta hidden sm:inline" fill="currentColor" />
            <span className="font-display text-base truncate">Sistem</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-terracotta" />
            <h1 className="font-display text-3xl text-clay-900 dark:text-ink-50">Metin Anahtarlari</h1>
          </div>
        </div>

        <div className="rounded-lg border border-cream-300 dark:border-ink-700/60 bg-cream-50 dark:bg-ink-900/30 px-3 py-2 text-[12px] text-clay-500 dark:text-ink-300">
          Sistem anahtarları kod-bağlı (schema-driven). Yeni anahtar eklemek için sürüm (release) gerekir. Buradan yalnızca dokümantasyon (etiket, yönlendirme, açıklama, sıra, karakter limiti) düzenlenebilir.
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-clay-400 dark:text-ink-300" />
          <Input
            value={arama}
            onChange={(e) => setArama(e.target.value)}
            placeholder="Anahtar veya etiket ara..."
            className="pl-9"
          />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-clay-400 dark:text-ink-300" />
          </div>
        ) : gruplu.length === 0 ? (
          <p className="text-clay-400 dark:text-ink-300 py-12 text-center">
            {arama.trim() ? "Eslesen anahtar yok." : "Henuz metin anahtari tanimlanmamis."}
          </p>
        ) : (
          <div className="space-y-8">
            {gruplu.map(([kategori, liste]) => (
              <section key={kategori} className="space-y-2">
                <h2 className="font-display text-lg text-clay-700 dark:text-ink-100">
                  {KATEGORI_ETIKET[kategori] ?? kategori}
                  <span className="ml-2 text-sm text-clay-400 dark:text-ink-300">({liste.length})</span>
                </h2>
                <div className="space-y-2">
                  {liste.map((a) => (
                    <Link
                      key={a.id}
                      href={`/admin/sistem/metin-anahtarlari/${a.id}`}
                      className="block rounded-xl border border-cream-300 dark:border-ink-700/60 bg-white/60 dark:bg-ink-800/40 px-4 py-3 hover:border-terracotta/50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-clay-900 dark:text-ink-50 truncate">{a.etiket}</span>
                            {a.zorunlu && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-terracotta/15 text-terracotta">zorunlu</span>
                            )}
                            {a.deprecated && (
                              <span className="text-[11px] px-1.5 py-0.5 rounded bg-clay-200 dark:bg-ink-700 text-clay-500 dark:text-ink-300">deprecated</span>
                            )}
                          </div>
                          <code className="text-xs text-clay-400 dark:text-ink-300">{a.anahtar}</code>
                        </div>
                        <span className="text-xs text-clay-400 dark:text-ink-300 shrink-0">{a.tip}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}