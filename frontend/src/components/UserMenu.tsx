"use client";

import * as DM from "@radix-ui/react-dropdown-menu";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { LogOut, Shield, Trash2, ListTodo } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";
import { useBen } from "@/lib/useBen";
import { cn, bastari } from "@/lib/utils";

export function UserMenu() {
  const { data: ben } = useBen();
  const router = useRouter();
  const qc = useQueryClient();

  const cikis = useMutation({
    mutationFn: () => authApi.cikis(),
    onSuccess: () => { qc.clear(); router.push("/giris"); },
  });

  if (!ben) return null;

  return (
    <DM.Root>
      <DM.Trigger asChild>
        <button
          className={cn(
            "flex items-center gap-2 rounded-full pl-1 pr-2 py-1 hover:bg-cream-200 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta/40"
          )}
        >
          <div className="h-9 w-9 rounded-full bg-clay-800 text-cream-50 flex items-center justify-center text-xs font-medium">
            {bastari(ben.adSoyad)}
          </div>
          <span className="text-sm text-clay-700 hidden sm:inline pr-1">
            {ben.adSoyad.split(" ")[0]}
          </span>
        </button>
      </DM.Trigger>

      <DM.Portal>
        <DM.Content
          align="end" sideOffset={8}
          className="min-w-[220px] kart p-1 z-50 animate-fade-in"
        >
          <div className="px-3 py-2.5 border-b border-cream-300">
            <p className="text-sm font-medium text-clay-900">{ben.adSoyad}</p>
            <p className="text-xs text-clay-400 truncate">{ben.email}</p>
            {ben.rol === "admin" && (
              <p className="text-xs text-terracotta mt-1 font-medium">⚜ Yönetici</p>
            )}
          </div>

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
