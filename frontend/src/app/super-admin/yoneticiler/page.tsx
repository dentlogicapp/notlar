"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Loader2, ShieldPlus, Trash2, Mail, Clock } from "lucide-react";
import { toast } from "sonner";
import { superAdminYoneticiApi } from "@/lib/api";
import type { SuperAdminOzet } from "@/lib/types";
import { cn } from "@/lib/utils";

function tarih(iso: string | null): string {
  if (!iso) return "hiç girmedi";
  try { return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" }); }
  catch { return "—"; }
}

export default function YoneticilerPage() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");

  const { data: liste, isLoading, isError } = useQuery({
    queryKey: ["super-admin-yoneticiler"],
    queryFn: () => superAdminYoneticiApi.list(),
  });

  const ataMut = useMutation({
    mutationFn: () => superAdminYoneticiApi.ata(email.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin-yoneticiler"] });
      toast.success("Süper admin atandı");
      setEmail("");
    },
    onError: () => toast.error("Atanamadı (kullanıcı bulunamadı veya zaten süper admin)"),
  });

  const kaldirMut = useMutation({
    mutationFn: (kid: string) => superAdminYoneticiApi.kaldir(kid),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin-yoneticiler"] });
      toast.success("Süper admin yetkisi kaldırıldı");
    },
    onError: () => toast.error("Kaldırılamadı (son süper admin korunur)"),
  });

  const tekKisi = (liste?.length ?? 0) <= 1;
  const gecerli = email.trim().length > 0;

  return (
    <main className="min-h-screen bg-cream-100 dark:bg-ink-900 pb-16">
      <header className="max-w-2xl mx-auto px-4 sm:px-6 pt-6 pb-4">
        <Link href="/super-admin" className="inline-flex items-center gap-1.5 text-sm text-clay-400 hover:text-clay-700 dark:text-ink-300 dark:hover:text-ink-100 transition-colors">
          <ChevronLeft className="h-4 w-4" /> Tenant listesi
        </Link>
        <h1 className="text-2xl font-display font-semibold text-clay-900 dark:text-ink-50 mt-3">Süper Adminler</h1>
        <p className="text-sm text-clay-400 dark:text-ink-300 mt-1">Platform yönetimi yetkisine sahip kullanıcılar.</p>
      </header>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 space-y-5">
        {/* Atama */}
        <div className="kart p-5 space-y-3">
          <h2 className="text-sm font-semibold text-clay-800 dark:text-ink-50">Yeni süper admin ata</h2>
          <p className="text-[11px] text-clay-400 dark:text-ink-300">Kullanıcı sistemde kayıtlı olmalı. E-postasıyla süper admin yetkisi verilir.</p>
          <div className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="kullanici@ornek.com"
              className="flex-1 rounded-lg border border-cream-300 dark:border-ink-700 bg-cream-50 dark:bg-ink-800 px-3 py-2 text-sm text-clay-900 dark:text-ink-50 placeholder:text-clay-300 dark:placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-terracotta/40"
            />
            <button
              type="button"
              onClick={() => ataMut.mutate()}
              disabled={!gecerli || ataMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-terracotta px-4 py-2 text-sm font-medium text-white hover:bg-terracotta/90 disabled:opacity-50 transition-colors shrink-0"
            >
              {ataMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldPlus className="h-4 w-4" />} Ata
            </button>
          </div>
        </div>

        {/* Liste */}
        <div className="kart p-5">
          <h2 className="text-sm font-semibold text-clay-800 dark:text-ink-50 mb-3">
            Mevcut süper adminler {liste ? `(${liste.length})` : ""}
          </h2>
          {isLoading ? (
            <div className="flex items-center justify-center py-10 text-clay-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : isError ? (
            <p className="text-sm text-red-600 dark:text-red-400 py-6 text-center">Liste yüklenemedi.</p>
          ) : !liste || liste.length === 0 ? (
            <p className="text-sm text-clay-400 dark:text-ink-300 italic py-6 text-center">Süper admin yok.</p>
          ) : (
            <div className="space-y-2">
              {liste.map((y) => (
                <YoneticiSatiri
                  key={y.id}
                  y={y}
                  tekKisi={tekKisi}
                  mesgul={kaldirMut.isPending}
                  onKaldir={() => {
                    if (confirm(`"${y.email}" kullanıcısının süper admin yetkisini kaldırmak istediğinize emin misiniz?`)) kaldirMut.mutate(y.id);
                  }}
                />
              ))}
            </div>
          )}
          {tekKisi && liste && liste.length === 1 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-3 italic">Son süper admin kaldırılamaz. Önce başka bir süper admin atayın.</p>
          )}
        </div>
      </div>
    </main>
  );
}

function YoneticiSatiri({ y, tekKisi, mesgul, onKaldir }: {
  y: SuperAdminOzet;
  tekKisi: boolean;
  mesgul: boolean;
  onKaldir: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-cream-200 dark:border-ink-700/50 last:border-0">
      <div className="h-8 w-8 rounded-full bg-terracotta/15 flex items-center justify-center text-xs font-semibold text-terracotta shrink-0">
        {(y.adSoyad || y.email).slice(0, 1).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-clay-900 dark:text-ink-50 truncate">{y.adSoyad || "—"}</p>
        <p className="text-[11px] text-clay-400 dark:text-ink-300 flex items-center gap-1 truncate">
          <Mail className="h-3 w-3 shrink-0" /> {y.email}
        </p>
      </div>
      <p className="text-[10px] text-clay-400 dark:text-ink-300 flex items-center gap-1 shrink-0">
        <Clock className="h-2.5 w-2.5" /> {tarih(y.sonGiris)}
      </p>
      <button
        type="button"
        disabled={tekKisi || mesgul}
        onClick={onKaldir}
        title={tekKisi ? "Son süper admin kaldırılamaz" : "Yetkiyi kaldır"}
        className={cn(
          "flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors shrink-0",
          tekKisi
            ? "text-clay-300 dark:text-ink-500 cursor-not-allowed"
            : "text-clay-400 dark:text-ink-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
        )}
      >
        <Trash2 className="h-3 w-3" /> Kaldır
      </button>
    </div>
  );
}
