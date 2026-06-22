"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useBen } from "@/lib/useBen";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";

export function AuthGuard({ children, requireAdmin = false, requireSuperAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean; requireSuperAdmin?: boolean }) {
  const { data: ben, isLoading, isError } = useBen();
  const router = useRouter();

  // v15 — Aktif tenant'taki rol
  const aktifRol = ben?.uyelikler?.find(u => u.isletmeId === ben?.aktifIsletmeId)?.rol ?? "kullanici";

  useEffect(() => {
    if (isLoading) return;
    if (isError || !ben) { router.replace("/giris"); return; }
    // v15 — admin kontrolü tenant scope (mevcut ben.rol artık global, geriye uyumluluk için duruyor)
    if (requireSuperAdmin && !ben.superAdmin) { router.replace("/"); return; }
    if (requireAdmin && aktifRol !== "admin") router.replace("/");
  }, [ben, isLoading, isError, requireAdmin, requireSuperAdmin, router, aktifRol]);

  // v16 — document.title artik MarkaBaslik'te tek otorite; eski super admin ⚜ title effect'i oraya tasindi.

  if (isLoading || !ben) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-clay-400 dark:text-ink-300" />
      </div>
    );
  }
  if (requireSuperAdmin && !ben.superAdmin) return null;
  if (requireAdmin && aktifRol !== "admin") return null;

  return (
    <>
      {/* v15 — Süper admin ince altın çizgi (görsel hatırlatıcı) */}
      {ben.superAdmin && (
        <div
          aria-hidden
          className="fixed top-0 left-0 right-0 h-[3px] z-[60] pointer-events-none"
          style={{
            background: "linear-gradient(90deg, transparent 0%, #d4a661 20%, #d4a661 80%, transparent 100%)"
          }}
        />
      )}
      <ImpersonationBanner />
      {children}
    </>
  );
}
