"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useBen } from "@/lib/useBen";

export function AuthGuard({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { data: ben, isLoading, isError } = useBen();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (isError || !ben) { router.replace("/giris"); return; }
    if (requireAdmin && ben.rol !== "admin") router.replace("/");
  }, [ben, isLoading, isError, requireAdmin, router]);

  if (isLoading || !ben) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-clay-400 dark:text-ink-300" />
      </div>
    );
  }
  if (requireAdmin && ben.rol !== "admin") return null;
  return <>{children}</>;
}
