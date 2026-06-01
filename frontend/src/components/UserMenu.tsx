"use client";

import * as DM from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Shield, Trash2, ListTodo, Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authApi, bildirimApi } from "@/lib/api";
import { useBen } from "@/lib/useBen";
import { cn, bastari } from "@/lib/utils";
import type { Bildirim } from "@/lib/types";

function gecenSureMetni(zaman: string): string {
  const t = new Date(zaman).getTime();
  const diff = Math.max(0, Date.now() - t);
  const dk = Math.floor(diff / 60000);
  if (dk < 1) return "az önce";
  if (dk < 60) return `${dk} dk önce`;
  const sa = Math.floor(dk / 60);
  if (sa < 24) return `${sa} sa önce`;
  const gun = Math.floor(sa / 24);
  if (gun < 7) return `${gun} gün önce`;
  return new Date(zaman).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

export function UserMenu() {
  const { data: ben } = useBen();
  const router = useRouter();
  const qc = useQueryClient();
  const [acik, setAcik] = useState(false);

  const bildirimSorgu = useQuery({
    queryKey: ["bildirimler"],
    queryFn: () => bildirimApi.list(),
    enabled: !!ben,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const hepsiOkundu = useMutation({
    mutationFn: () => bildirimApi.hepsiOkundu(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["bildirimler"] }),
  });

  const cikis = useMutation({
    mutationFn: () => authApi.cikis(),
    onSuccess: () => { qc.clear(); router.push("/giris"); },
  });

  const okunmamis = bildirimSorgu.data?.okunmamisSayisi ?? 0;
  const bildirimler = bildirimSorgu.data?.bildirimler ?? [];

  // Dropdown açıldığında okunmamış varsa "hepsi okundu" tetikle
  useEffect(() => {
    if (acik && okunmamis > 0) {
      hepsiOkundu.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik]);

  const bildirimeTikla = (b: Bildirim) => {
    setAcik(false);
    if (b.notId) {
      router.push(`/?focus=${b.notId}`);
    }
  };

  if (!ben) return null;

  return (
    <DM.Root open={acik} onOpenChange={setAcik}>
      <DM.Trigger asChild>
        <button
          aria-label="Kullanıcı menüsü"
          className={cn(
            "relative flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-cream-200 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/40"
          )}
        >
          <div
            className={cn(
              "h-9 w-9 rounded-full text-cream-50 flex items-center justify-center text-xs font-medium relative",
              okunmamis > 0
                ? "bg-red-500 animate-pulse-red-bildirim"
                : "bg-clay-800"
            )}
          >
            {bastari(ben.adSoyad)}
            {okunmamis > 0 && (
              <span
                aria-label={`${okunmamis} okunmamış bildirim`}
                className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-red-600 text-[10px] font-semibold flex items-center justify-center border border-red-500"
              >
                {okunmamis > 9 ? "9+" : okunmamis}
              </span>
            )}
          </div>
          <span className="text-sm text-clay-700 hidden sm:inline pr-1">
            {ben.adSoyad.split(" ")[0]}
          </span>
        </button>
      </DM.Trigger>

      <DM.Portal>
        <DM.Content
          align="end" sideOffset={8}
          className="min-w-[300px] max-w-[340px] kart p-1 z-50 animate-fade-in"
        >
          {/* User identity */}
          <div className="px-3 py-2.5 border-b border-cream-300">
            <p className="text-sm font-medium text-clay-900">{ben.adSoyad}</p>
            <p className="text-xs text-clay-400 truncate">{ben.email}</p>
            {ben.rol === "admin" && (
              <p className="text-xs text-terracotta mt-1 font-medium">⚜ Yönetici</p>
            )}
          </div>

          {/* BİLDİRİMLER — Instagram-vari özet feed */}
          <div className="border-b border-cream-300 max-h-[280px] overflow-y-auto">
            <div className="flex items-center gap-2 px-3 py-2 sticky top-0 bg-white">
              <Bell className="h-3.5 w-3.5 text-terracotta" />
              <span className="text-[11px] uppercase tracking-wider text-clay-500 font-semibold">
                Bildirimler
              </span>
            </div>
            {bildirimler.length === 0 ? (
              <p className="px-3 pb-2.5 text-xs text-clay-400 italic">
                Henüz bildirim yok.
              </p>
            ) : (
              <div className="px-1 pb-1.5">
                {bildirimler.slice(0, 8).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => bildirimeTikla(b)}
                    className={cn(
                      "w-full text-left rounded-lg px-2.5 py-2 hover:bg-cream-200 transition-colors flex items-start gap-2 group",
                      !b.okunduMu && "bg-cream-100"
                    )}
                  >
                    <Bell className="h-3.5 w-3.5 text-terracotta shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-xs leading-snug truncate",
                        b.okunduMu ? "text-clay-500" : "text-clay-800 font-medium"
                      )}>
                        {b.mesaj}
                      </p>
                      <p className="text-[10px] text-clay-400 mt-0.5">
                        {gecenSureMetni(b.olusturmaZamani)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Menü */}
          <DM.Item asChild>
            <Link href="/" className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-cream-200 cursor-pointer outline-none">
              <ListTodo className="h-4 w-4 text-clay-500" />
              Notlar
            </Link>
          </DM.Item>

          {ben.rol === "admin" && (
            <DM.Item asChild>
              <Link href="/admin" className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-cream-200 cursor-pointer outline-none">
                <Shield className="h-4 w-4 text-clay-500" />
                Yönetim
              </Link>
            </DM.Item>
          )}

          <DM.Item asChild>
            <Link href="/cop-kutusu" className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-cream-200 cursor-pointer outline-none">
              <Trash2 className="h-4 w-4 text-clay-500" />
              Çöp Kutusu
            </Link>
          </DM.Item>

          <DM.Separator className="h-px bg-cream-300 my-1" />

          <DM.Item
            onSelect={() => cikis.mutate()}
            className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-rose-50 hover:text-red-700 cursor-pointer outline-none text-clay-700"
          >
            <LogOut className="h-4 w-4" />
            Çıkış
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}
