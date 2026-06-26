"use client";

import { Heart, Minus, Users, Home, Palmtree, Clock, type LucideIcon } from "lucide-react";

const IKON_MAP: Record<string, LucideIcon> = {
  kalp: Heart, klasik: Minus, ekip: Users, aile: Home, tatil: Palmtree,
};

export function MarkaOnizleme({ markaAdi, markaEmoji, ikonSeti }: {
  markaAdi?: string; markaEmoji?: string; ikonSeti?: string;
}) {
  const ad = markaAdi || "Marka Adı";
  const emoji = markaEmoji || "🏢";
  const Ikon = IKON_MAP[ikonSeti ?? "klasik"] ?? Minus;
  return (
    <div className="space-y-3">
      {/* Tarayici sekmesi mock */}
      <div className="flex items-center gap-2 rounded-t-lg bg-cream-200 dark:bg-ink-800 px-3 py-1.5 max-w-[240px]">
        <span className="text-sm">{emoji}</span>
        <span className="text-xs text-clay-600 dark:text-ink-100 truncate">{ad}</span>
      </div>
      {/* Header mock (app/page.tsx stili) */}
      <div className="flex items-center gap-2.5 rounded-xl border border-cream-300 dark:border-ink-700 px-4 py-3">
        <span className="text-xl">{emoji}</span>
        <span className="font-display text-lg text-clay-900 dark:text-ink-50 truncate">{ad}</span>
      </div>
      {/* Ikon seti gostergesi */}
      <div className="flex items-center gap-2 text-clay-500 dark:text-ink-200">
        <Ikon className="h-4 w-4 text-terracotta" />
        <span className="text-xs italic">İkon seti: {ikonSeti || "klasik"}</span>
      </div>
    </div>
  );
}

export function KarsilamaOnizleme({ karsilamaBasligi, karsilamaAltMetni }: {
  karsilamaBasligi?: string; karsilamaAltMetni?: string;
}) {
  return (
    <div className="rounded-xl border border-cream-300 dark:border-ink-700 px-4 py-4">
      <p className="font-display text-xl text-clay-900 dark:text-ink-50 leading-tight">
        {karsilamaBasligi || "Karşılama Başlığı"}
      </p>
      <p className="text-clay-500 dark:text-ink-200 mt-1.5 italic text-sm leading-relaxed">
        {karsilamaAltMetni || "Karşılama alt metni burada görünür."}
      </p>
    </div>
  );
}

function geriSayim(tarih?: string | null) {
  if (!tarih) return null;
  const hedef = new Date(`${tarih}T00:00:00`).getTime();
  if (Number.isNaN(hedef)) return null;
  const fark = hedef - Date.now();
  if (fark <= 0) return { gun: 0, sa: 0, dk: 0 };
  return {
    gun: Math.floor(fark / 86400000),
    sa: Math.floor((fark % 86400000) / 3600000),
    dk: Math.floor((fark % 3600000) / 60000),
  };
}

function MiniKutu({ deger, etiket }: { deger: number; etiket: string }) {
  return (
    <span className="inline-flex items-baseline gap-0.5 tabular-nums">
      <span className="font-display text-xl text-clay-900 dark:text-ink-50 font-semibold leading-none">
        {deger.toString().padStart(2, "0")}
      </span>
      <span className="text-[10px] text-clay-400 dark:text-ink-300 font-medium">{etiket}</span>
    </span>
  );
}

export function SayacOnizleme({ sayacAktif, sayacBasligi, sayacHedefTarihi }: {
  sayacAktif?: boolean; sayacBasligi?: string; sayacHedefTarihi?: string | null;
}) {
  if (!sayacAktif) {
    return (
      <div className="rounded-xl border border-dashed border-clay-300 dark:border-ink-700 px-4 py-6 text-center">
        <p className="text-sm text-clay-400 dark:text-ink-300 italic">Sayaç kapalı — dashboard&apos;da gösterilmez</p>
      </div>
    );
  }
  const k = geriSayim(sayacHedefTarihi);
  return (
    <div className="rounded-xl border border-cream-300 dark:border-ink-700 px-4 py-4 flex items-center gap-3">
      <Clock className="h-7 w-7 text-terracotta shrink-0" strokeWidth={1.5} />
      <div className="flex flex-col min-w-0">
        <span className="uppercase tracking-[0.2em] text-[10px] text-clay-500 dark:text-ink-200 leading-none font-medium">
          {sayacBasligi || "Sayaç başlığı"}
        </span>
        <div className="flex items-baseline gap-2 mt-1.5">
          {k ? (
            <>
              <MiniKutu deger={k.gun} etiket="gün" />
              <span className="text-clay-300 dark:text-ink-400">·</span>
              <MiniKutu deger={k.sa} etiket="sa" />
              <span className="text-clay-300 dark:text-ink-400">·</span>
              <MiniKutu deger={k.dk} etiket="dk" />
            </>
          ) : (
            <span className="text-xs text-clay-400 dark:text-ink-300 italic">Tarih seçilmedi</span>
          )}
        </div>
      </div>
    </div>
  );
}

const TON_SELAM: Record<string, string> = {
  samimi: "Selam! 👋 Birlikte planlamak için seni aramıza bekliyoruz.",
  profesyonel: "Merhaba, planlama sistemine katılımınız için davet edildiniz.",
};

export function MailOnizleme({ mailImza, mailTonu }: {
  mailImza?: string; mailTonu?: string;
}) {
  const selam = TON_SELAM[mailTonu ?? "samimi"] ?? TON_SELAM.samimi;
  return (
    <div className="rounded-xl overflow-hidden border border-[#ebe3d4]" style={{ background: "#faf6ef" }}>
      <div className="bg-white mx-3 my-3 rounded-2xl border border-[#ebe3d4] px-5 py-5 text-center">
        <p className="text-[13px] leading-relaxed" style={{ color: "#5d4a37" }}>{selam}</p>
        <div className="my-3 border-t border-[#ebe3d4]" />
        <p className="text-[13px]" style={{ color: "#3d2817" }}>{mailImza || "İmza"}</p>
        <p className="mt-3 text-[10px]" style={{ color: "#9c8a73" }}>Planlama Defterimiz · notlar.dentlogicapp.com</p>
      </div>
    </div>
  );
}
