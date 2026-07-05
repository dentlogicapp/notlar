"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useBen } from "@/lib/useBen";
import { ImpersonationBanner } from "@/components/ImpersonationBanner";
import { KvkkGate } from "@/components/KvkkGate";

export function AuthGuard({ children, requireAdmin = false, requireSuperAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean; requireSuperAdmin?: boolean }) {
  const { data: ben, isLoading, isError } = useBen();
  const router = useRouter();
  const qc = useQueryClient();

  // v19 İş 2 - kesintisiz tenant geçişi: aktif tenant pasifleşip backend başka tenant'a geçirdiyse
  // (X-Tenant-Gecis header) tüm tenant-scoped veriyi (ben/marka/sayaç/notlar/klasörler) tazele.
  useEffect(() => {
    function gecis() {
      qc.invalidateQueries();
      toast.info("Aktif markanız pasifleştirildi; başka markanıza geçirildiniz.");
    }
    window.addEventListener("tenant-gecis", gecis);
    return () => window.removeEventListener("tenant-gecis", gecis);
  }, [qc]);

  // v15 — Aktif tenant'taki rol
  const aktifRol = ben?.uyelikler?.find(u => u.isletmeId === ben?.aktifIsletmeId)?.rol ?? "kullanici";

  useEffect(() => {
    if (isLoading) return;
    if (isError || !ben) { router.replace("/giris"); return; }
    // Defense in depth: aktif uyelik yok (pasif/silinmis) + super admin degil -> cikis.
    // Backend /ben zaten 403 verir; bu ek katman API atlansa bile oturumu kapatir.
    if (!ben.superAdmin && (ben.uyelikler?.length ?? 0) === 0) { router.replace("/giris"); return; }
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
  // v21 M7 (K6) - KVKK onam gate: aktif metne onami olmayan kullanici HICBIR sayfaya
  // gecemez; children yerine gecilemez onam ekrani basilir (tek merkezi nokta).
  if (ben.kvkkOnamGerekli) return <KvkkGate />;
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
