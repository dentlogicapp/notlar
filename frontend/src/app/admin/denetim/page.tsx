"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, FileText } from "lucide-react";
import { AuthGuard } from "@/components/AuthGuard";
import { CountdownWidget } from "@/components/CountdownWidget";
import { UserMenu } from "@/components/UserMenu";
import { Button } from "@/components/ui/button";
import { adminApi } from "@/lib/api";
import { tarihFormat } from "@/lib/utils";

export default function Page() {
  return (
    <AuthGuard requireAdmin>
      <Icerik />
    </AuthGuard>
  );
}

const SAYFA = 50;

function Icerik() {
  const [skip, setSkip] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["denetim", skip],
    queryFn: () => adminApi.denetim(skip, SAYFA),
  });

  const toplam = data?.toplam ?? 0;
  const sayfaSayisi = Math.ceil(toplam / SAYFA);
  const sayfa = Math.floor(skip / SAYFA) + 1;

  return (
    <main className="min-h-screen pb-24">
      <CountdownWidget />

      <header className="sticky top-0 z-30 bg-cream-100/85 dark:bg-ink-800/85 backdrop-blur-md border-b border-cream-300 dark:border-ink-700/60">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Link href="/admin" className="flex items-center gap-1 text-clay-600 dark:text-ink-100 hover:text-clay-900 dark:hover:text-ink-50 transition-colors min-w-0">
            <ChevronLeft className="h-5 w-5 shrink-0" />
            <span className="font-display text-base truncate">Denetim Günlüğü</span>
          </Link>
          <UserMenu />
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-terracotta" />
          <h1 className="font-display text-3xl text-clay-900 dark:text-ink-50">Denetim Günlüğü</h1>
          <span className="text-sm text-clay-400 dark:text-ink-300">({toplam} kayıt)</span>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-clay-400 dark:text-ink-300" /></div>
        ) : (
          <>
            <div className="kart overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-xs text-clay-500 dark:text-ink-200 uppercase tracking-wider bg-cream-100/60 dark:bg-ink-800/60">
                  <tr>
                    <th className="text-left py-3 px-4 font-medium">Zaman</th>
                    <th className="text-left py-3 px-4 font-medium">Olay</th>
                    <th className="text-left py-3 px-4 font-medium hidden md:table-cell">Aktör</th>
                    <th className="text-left py-3 px-4 font-medium hidden lg:table-cell">IP</th>
                    <th className="text-left py-3 px-4 font-medium hidden md:table-cell">Detay</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.kayitlar ?? []).map((d) => (
                    <tr key={d.id} className="border-t border-cream-300 dark:border-ink-700 hover:bg-cream-100/40 dark:hover:bg-ink-800/40">
                      <td className="py-2.5 px-4 text-xs text-clay-500 dark:text-ink-200 whitespace-nowrap">
                        {tarihFormat(d.zaman)}
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="text-xs font-mono text-clay-800 dark:text-ink-50 bg-cream-200 dark:bg-ink-800 px-2 py-0.5 rounded">
                          {d.olay}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-clay-700 dark:text-ink-100 hidden md:table-cell text-xs">
                        {d.aktorEmail ?? "—"}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-clay-500 dark:text-ink-200 hidden lg:table-cell font-mono">
                        {d.ip ?? "—"}
                      </td>
                      <td className="py-2.5 px-4 text-xs text-clay-600 dark:text-ink-100 hidden md:table-cell max-w-xs truncate" title={d.detay ?? ""}>
                        {d.detay ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {sayfaSayisi > 1 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-clay-500 dark:text-ink-200">{sayfa} / {sayfaSayisi}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={skip === 0} onClick={() => setSkip(Math.max(0, skip - SAYFA))}>
                    <ChevronLeft className="h-4 w-4" /> Önceki
                  </Button>
                  <Button variant="outline" size="sm" disabled={sayfa >= sayfaSayisi} onClick={() => setSkip(skip + SAYFA)}>
                    Sonraki <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
