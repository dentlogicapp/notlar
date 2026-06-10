"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Loader2, Search, Database, Hash } from "lucide-react";
import { UserMenu } from "@/components/UserMenu";
import { SemaSkeleton } from "@/components/skeleton/Skeleton";
import { Input } from "@/components/ui/input";
import { sistemApi, type SemaAnahtar } from "@/lib/api";

const KATEGORI_ETIKET: Record<string, string> = {
  marka: "Marka",
  dashboard: "Dashboard",
  sayac: "Sayaç",
  mail: "Mail",
  bildirim: "Bildirim",
  form: "Form",
};

const KATEGORI_SIRA = ["marka", "dashboard", "sayac", "mail", "bildirim", "form"];

const TIP_ETIKET: Record<string, string> = {
  subject: "Konu",
  body: "Gövde",
  baslik: "Başlık",
  metin: "Metin",
  placeholder_kisa: "Kısa",
};

export default function SemaPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["sema"],
    queryFn: sistemApi.getSema,
  });

  const [arama, setArama] = useState("");
  const [deprecatedGoster, setDeprecatedGoster] = useState(false);
  const [kapsamFiltre, setKapsamFiltre] = useState<"hepsi" | "Tenant" | "Sistem">("hepsi");

  const gruplar = useMemo(() => {
    const anahtarlar = data?.anahtarlar ?? [];
    const q = arama.trim().toLowerCase();
    const filtreli = anahtarlar.filter((a) => {
      if (!deprecatedGoster && a.deprecated) return false;
      if (kapsamFiltre !== "hepsi" && a.kapsam !== kapsamFiltre) return false;
      if (!q) return true;
      return a.anahtar.toLowerCase().includes(q) || a.etiket.toLowerCase().includes(q);
    });
    const harita = new Map<string, SemaAnahtar[]>();
    for (const a of filtreli) {
      if (!harita.has(a.kategori)) harita.set(a.kategori, []);
      harita.get(a.kategori)!.push(a);
    }
    return KATEGORI_SIRA.filter((k) => harita.has(k)).map((k) => ({
      kategori: k,
      anahtarlar: harita.get(k)!,
    }));
  }, [data, arama, deprecatedGoster, kapsamFiltre]);

  const toplamGorunen = gruplar.reduce((s, g) => s + g.anahtarlar.length, 0);
  const toplamAnahtar = data?.anahtarlar.length ?? 0;
  const sonGuncelleme = data?.sonGuncelleme
    ? new Date(data.sonGuncelleme).toLocaleDateString("tr-TR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <main className="min-h-screen pb-24">
      <header className="sticky top-0 z-30 bg-cream-100/85 dark:bg-ink-800/85 backdrop-blur-md border-b border-cream-300 dark:border-ink-700/60">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <Link
            href="/admin"
            className="flex items-center gap-1 text-clay-600 dark:text-ink-100 hover:text-clay-900 dark:hover:text-ink-50 transition-colors min-w-0"
          >
            <ChevronLeft className="h-5 w-5 shrink-0" />
            <span className="truncate">Yönetim</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 pt-6 space-y-5">
        {/* Baslik + B3 surum badge */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl text-clay-900 dark:text-ink-50 flex items-center gap-2">
              <Database className="h-6 w-6 text-terracotta" /> Sistem Şeması
            </h1>
            <p className="text-sm text-clay-500 dark:text-ink-300 mt-1 max-w-xl">
              Anahtar şeması kod ile tanımlıdır (tek doğruluk kaynağı). Bu panel salt okunurdur;
              değişiklik için katalog kodu güncellenip dağıtım yapılır.
            </p>
          </div>
          {data && (
            <div
              className="rounded-lg border border-cream-300 dark:border-ink-700/60 bg-cream-50 dark:bg-ink-900/30 px-3 py-2 text-right"
              title={sonGuncelleme ? `Son güncelleme: ${sonGuncelleme}` : undefined}
            >
              <div className="font-mono text-sm text-clay-900 dark:text-ink-50">v{data.surum}</div>
              <div className="text-[11px] text-clay-400 dark:text-ink-300">{toplamAnahtar} anahtar</div>
            </div>
          )}
        </div>

        {/* Filtreler */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-clay-400 dark:text-ink-300" />
            <Input
              value={arama}
              onChange={(e) => setArama(e.target.value)}
              placeholder="Anahtar veya etiket ara..."
              className="pl-9"
            />
          </div>
          <button
            onClick={() => setDeprecatedGoster((v) => !v)}
            className={`text-xs px-3 min-h-[44px] rounded-lg border transition-colors ${
              deprecatedGoster
                ? "border-terracotta/50 bg-terracotta/10 text-terracotta"
                : "border-cream-300 dark:border-ink-700/60 text-clay-500 dark:text-ink-300"
            }`}
          >
            Deprecated {deprecatedGoster ? "gizle" : "göster"}
          </button>
          <button
            onClick={() =>
              setKapsamFiltre((v) => (v === "hepsi" ? "Tenant" : v === "Tenant" ? "Sistem" : "hepsi"))
            }
            className={`text-xs px-3 min-h-[44px] rounded-lg border transition-colors ${
              kapsamFiltre !== "hepsi"
                ? "border-terracotta/50 bg-terracotta/10 text-terracotta"
                : "border-cream-300 dark:border-ink-700/60 text-clay-500 dark:text-ink-300"
            }`}
          >
            Kapsam: {kapsamFiltre === "hepsi" ? "Tümü" : kapsamFiltre}
          </button>
        </div>

        {/* Liste */}
        {isLoading ? (
          <div className="animate-fade-in">
            <SemaSkeleton />
          </div>
        ) : toplamGorunen === 0 ? (
          <p className="text-clay-400 dark:text-ink-300 py-12 text-center">Sonuç bulunamadı.</p>
        ) : (
          gruplar.map((g) => (
            <section key={g.kategori} className="space-y-2">
              <h2 className="font-display text-lg text-clay-700 dark:text-ink-100">
                {KATEGORI_ETIKET[g.kategori] ?? g.kategori}
                <span className="ml-2 text-sm text-clay-400 dark:text-ink-300">({g.anahtarlar.length})</span>
              </h2>
              <div className="space-y-2">
                {g.anahtarlar.map((a) => (
                  <div
                    key={a.anahtar}
                    className={`rounded-xl border border-cream-300 dark:border-ink-700/60 bg-white/60 dark:bg-ink-800/40 px-4 py-3 ${
                      a.deprecated ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium text-clay-900 dark:text-ink-50 truncate">{a.etiket}</span>
                        {a.zorunlu && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-terracotta/15 text-terracotta">
                            zorunlu
                          </span>
                        )}
                        {a.deprecated && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-clay-200 dark:bg-ink-700 text-clay-500 dark:text-ink-300">
                            deprecated
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-xs text-clay-400 dark:text-ink-300">
                        <span className={`px-1.5 py-0.5 rounded ${a.kapsam === "Sistem" ? "bg-clay-200 text-clay-600 dark:bg-ink-600 dark:text-ink-200" : "bg-terracotta/15 text-terracotta"}`}>
                          {a.kapsam === "Sistem" ? "SISTEM" : "TENANT"}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-cream-200 dark:bg-ink-700/60">
                          {TIP_ETIKET[a.tip] ?? a.tip}
                        </span>
                        <span title="Karakter limiti (* = ozel limit)">
                          {a.efektifLimit}
                          {a.ozelLimit != null && "*"}
                        </span>
                        <span title="Sıra" className="flex items-center">
                          <Hash className="h-3 w-3" />
                          {a.sira}
                        </span>
                      </div>
                    </div>

                    <code className="text-xs text-clay-400 dark:text-ink-300">{a.anahtar}</code>

                    {a.yonlendirme && (
                      <p className="text-sm text-clay-600 dark:text-ink-200 mt-1.5">{a.yonlendirme}</p>
                    )}
                    {a.aciklama && (
                      <p className="text-xs text-clay-400 dark:text-ink-300 mt-1 italic">{a.aciklama}</p>
                    )}

                    <div className="flex items-center justify-between gap-2 flex-wrap mt-2">
                      <div className="flex items-center gap-1 flex-wrap">
                        {a.placeholderlar.map((p) => (
                          <code
                            key={p}
                            className="text-[11px] px-1.5 py-0.5 rounded bg-clay-100 dark:bg-ink-700/40 text-clay-500 dark:text-ink-300"
                          >
                            {`{${p}}`}
                          </code>
                        ))}
                      </div>
                      <span className="text-[11px] text-clay-400 dark:text-ink-300 shrink-0">
                        {a.tenantDolduran}/{a.tenantToplam} tenant doldurdu
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
