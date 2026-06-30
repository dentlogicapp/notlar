"use client";

import * as DM from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LogOut, Shield, Trash2, ListTodo, Bell, Download,
  FileText, FileSpreadsheet, FileType, FileCode, Loader2, X,
  Moon, Sun, Crown, UserCircle
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authApi, bildirimApi, defteriIndir, isletmeApi, type DefteriIndirFormat } from "@/lib/api";
import { useBen } from "@/lib/useBen";
import { useIsletmeMetinleri, metinDeger } from "@/lib/useIsletmeMetinleri";
import { useTema } from "@/lib/tema";
import { cn, bastari } from "@/lib/utils";
import type { Bildirim, Not } from "@/lib/types";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
} from "./ui/dialog";
import { ProfilimModal } from "./ProfilimModal";

const ILK_BILDIRIM = 5;
const MAX_BILDIRIM = 30;

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
  // v18 - aktif workspace adi/emoji isletme_metinleri'nden (tek kaynak); uyelik (isletmeler) fallback.
  const { data: metinler } = useIsletmeMetinleri();
  const aktifMarkaAdi = metinDeger(metinler, "marka_adi", "");
  const aktifMarkaEmoji = metinDeger(metinler, "marka_emoji", "");
  const router = useRouter();
  const qc = useQueryClient();
  const [acik, setAcik] = useState(false);
  const [indirAcik, setIndirAcik] = useState(false);
  const [profilModalAcik, setProfilModalAcik] = useState(false);
  const [gosterilen, setGosterilen] = useState(ILK_BILDIRIM);
  const [tema, , temaTersle] = useTema();

  // v15 — Aktif tenant'taki rol (Yönetim linki için)
  const aktifRol = ben?.uyelikler?.find(u => u.isletmeId === ben?.aktifIsletmeId)?.rol ?? "kullanici";
  const cokluUyelik = (ben?.uyelikler?.length ?? 0) >= 2;
  const aktifUyelik = ben?.uyelikler?.find(u => u.isletmeId === ben?.aktifIsletmeId);

  const bildirimSorgu = useQuery({
    queryKey: ["bildirimler"],
    queryFn: () => bildirimApi.list(),
    enabled: !!ben,
    refetchInterval: 10_000, // 10 saniye — bildirim için daha sık
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

  // v16 — menu-ici workspace switcher: aktif tenant degistir -> JWT yenile -> hard refresh
  const markaDegistir = useMutation({
    mutationFn: (id: string) => isletmeApi.aktifDegistir(id),
    onSuccess: () => { window.location.reload(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const okunmamis = bildirimSorgu.data?.okunmamisSayisi ?? 0;
  const tumBildirimler = (bildirimSorgu.data?.bildirimler ?? []).slice(0, MAX_BILDIRIM);
  const goruntuBildirimler = tumBildirimler.slice(0, gosterilen);
  const dahaVar = tumBildirimler.length > gosterilen;

  // Dropdown açıldığında okunmamış varsa "hepsi okundu" tetikle + gösterileni sıfırla
  useEffect(() => {
    if (acik) {
      if (okunmamis > 0) hepsiOkundu.mutate();
      setGosterilen(ILK_BILDIRIM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acik]);

  const bildirimeTikla = (b: Bildirim) => {
    setAcik(false);
    if (!b.notId) return;
    // Push tiklama ile ayni mantik: not tamamlanmissa Tamamlananlar klasorune,
    // degilse ana listeye yonlendir (her ikisinde de ?focus -> scroll + highlight).
    const notlar = qc.getQueryData<Not[]>(["notlar"]) ?? [];
    const not = notlar.find((n) => n.id === b.notId);
    const hedef = not?.tamamlandi && not.klasorId
      ? `/klasor/${not.klasorId}?focus=${b.notId}`
      : `/?focus=${b.notId}`;
    // Radix dropdown kapanirken navigation yutulmasin diye bir tick ertele
    setTimeout(() => router.push(hedef), 0);
  };

  if (!ben) return null;

  return (
    <>
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
            className="min-w-[320px] max-w-[360px] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto kart p-1 z-50 animate-fade-in"
          >
            {/* User identity */}
            <div className="px-3 py-2.5 border-b border-cream-300 dark:border-ink-700">
              <p className="text-sm font-medium text-clay-900 dark:text-ink-50">{ben.adSoyad}</p>
              <p className="text-xs text-clay-400 dark:text-ink-300 truncate">{ben.email}</p>
              {aktifRol === "admin" && !ben.superAdmin && (
                <p className="text-xs text-terracotta mt-1 font-medium">⚜ Yönetici</p>
              )}
              {ben.superAdmin && (
                <p className="text-xs text-gold mt-1 font-medium">⚜ Süper Yönetici</p>
              )}
              {aktifUyelik && (
                <p className="text-[11px] text-clay-500 dark:text-ink-200 mt-1.5 truncate">
                  {cokluUyelik && <span className="opacity-60">Aktif marka:{" "}</span>}
                  {aktifMarkaEmoji || aktifUyelik.markaEmoji} {aktifMarkaAdi || aktifUyelik.markaAdi}
                </p>
              )}
            </div>

            {/* Profilim */}
            <DM.Item
              onSelect={(e) => {
                e.preventDefault();
                setProfilModalAcik(true);
              }}
              className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-cream-200 dark:hover:bg-ink-800 cursor-pointer outline-none text-clay-700 dark:text-ink-100"
            >
              <UserCircle className="h-4 w-4 text-clay-500 dark:text-ink-300" />
              Profilim
            </DM.Item>
            <DM.Separator className="my-1 h-px bg-cream-300 dark:bg-ink-700" />

            {/* MENÜ */}
            <DM.Item asChild>
              <Link href="/" className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-cream-200 dark:hover:bg-ink-800 cursor-pointer outline-none text-clay-700 dark:text-ink-100">
                <ListTodo className="h-4 w-4 text-clay-500 dark:text-ink-300" />
                Notlar
              </Link>
            </DM.Item>

            {aktifRol === "admin" && (
              <DM.Item asChild>
                <Link href="/admin" className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-cream-200 dark:hover:bg-ink-800 cursor-pointer outline-none text-clay-700 dark:text-ink-100">
                  <Shield className="h-4 w-4 text-clay-500 dark:text-ink-300" />
                  Yönetim
                </Link>
              </DM.Item>
            )}

            {ben.superAdmin && (
              <DM.Item asChild>
                <Link href="/super-admin" className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-cream-200 dark:hover:bg-ink-800 cursor-pointer outline-none text-gold font-medium">
                  <Crown className="h-4 w-4 text-gold" />
                  Süper Panel
                </Link>
              </DM.Item>
            )}

            {/* v16 — Menu-ici workspace switcher (sadece 2+ marka üyeliği varsa) */}
            {cokluUyelik && (
              <>
                <DM.Separator className="my-1 h-px bg-cream-300 dark:bg-ink-700" />
                <DM.Label className="px-3 pt-1 pb-1 text-[11px] font-medium text-clay-400 dark:text-ink-300">
                  Diğer çalışma alanların
                </DM.Label>
                {ben.uyelikler
                  .filter(u => u.isletmeId !== ben.aktifIsletmeId)
                  .map(u => (
                    <DM.Item
                      key={u.isletmeId}
                      disabled={markaDegistir.isPending}
                      onSelect={(e) => { e.preventDefault(); markaDegistir.mutate(u.isletmeId); }}
                      className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-cream-200 dark:hover:bg-ink-800 cursor-pointer outline-none text-clay-700 dark:text-ink-100"
                    >
                      <span className="text-base leading-none w-5 text-center shrink-0">{u.markaEmoji}</span>
                      <span className="truncate flex-1">{u.markaAdi}</span>
                      {u.rol === "admin" ? (
                        <span className="inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-terracotta/15 text-terracotta-dark font-medium shrink-0">Yönetici</span>
                      ) : (
                        <span className="text-xs text-clay-500 dark:text-ink-200 shrink-0">Kullanıcı</span>
                      )}
                    </DM.Item>
                  ))}
              </>
            )}

            <DM.Item asChild>
              <Link href="/cop-kutusu" className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-cream-200 dark:hover:bg-ink-800 cursor-pointer outline-none text-clay-700 dark:text-ink-100">
                <Trash2 className="h-4 w-4 text-clay-500 dark:text-ink-300" />
                Çöp Kutusu
              </Link>
            </DM.Item>

            <DM.Item
              onSelect={(e) => {
                e.preventDefault();
                setAcik(false);
                // Küçük gecikme — menü kapanması bitsin sonra dialog açılsın
                setTimeout(() => setIndirAcik(true), 50);
              }}
              className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-cream-200 dark:hover:bg-ink-800 cursor-pointer outline-none text-clay-700 dark:text-ink-100"
            >
              <Download className="h-4 w-4 text-terracotta" />
              Defteri İndir
            </DM.Item>

            {/* v11 — Tema Toggle (Defteri İndir ile Bildirimler arası) */}
            <DM.Item
              onSelect={(e) => {
                e.preventDefault();
                temaTersle();
              }}
              className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-cream-200 dark:hover:bg-ink-800 cursor-pointer outline-none text-clay-700 dark:text-ink-100"
            >
              {tema === "acik"
                ? <Moon className="h-4 w-4 text-clay-500 dark:text-ink-300" />
                : <Sun className="h-4 w-4 text-gold dark:text-gold" />}
              <span className="flex-1">
                {tema === "acik" ? "Koyu Temaya Geç" : "Açık Temaya Geç"}
              </span>
              {/* Görsel toggle switch (Hatırlatıcı kur stilinde) */}
              <span
                role="switch"
                aria-checked={tema === "koyu"}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                  tema === "koyu" ? "bg-terracotta" : "bg-clay-200 dark:bg-ink-700"
                )}
              >
                <span
                  className={cn(
                    "inline-block h-4 w-4 transform rounded-full bg-white dark:bg-ink-50 transition-transform shadow-sm",
                    tema === "koyu" ? "translate-x-[18px]" : "translate-x-0.5"
                  )}
                />
              </span>
            </DM.Item>

            {/* BİLDİRİMLER — Çöp Kutusu altı, Çıkış üstü, paginate edilmiş */}
            <DM.Separator className="h-px bg-cream-300 dark:bg-ink-700 my-1" />

            <div className="px-3 pt-2 pb-1 flex items-center gap-2">
              <Bell className="h-3.5 w-3.5 text-terracotta" />
              <span className="text-[11px] uppercase tracking-wider text-clay-500 dark:text-ink-200 font-semibold">
                Bildirimler
              </span>
              {tumBildirimler.length > 0 && (
                <span className="text-[10px] text-clay-400 dark:text-ink-300 ml-auto">
                  {tumBildirimler.length}{tumBildirimler.length >= MAX_BILDIRIM ? "+" : ""} adet
                </span>
              )}
            </div>

            {tumBildirimler.length === 0 ? (
              <p className="px-3 pb-2.5 text-xs text-clay-400 dark:text-ink-300 italic">
                Henüz bildirim yok.
              </p>
            ) : (
              <div className="relative px-1 pb-1.5 max-h-[300px] overflow-y-auto bildirim-scroll">
                {/* Üst gradient fade */}
                {gosterilen > ILK_BILDIRIM && (
                  <div
                    className="sticky top-0 z-10 h-3 -mx-1 mb-[-12px] pointer-events-none gradient-fade"
                  />
                )}

                {goruntuBildirimler.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => bildirimeTikla(b)}
                    className={cn(
                      "w-full text-left rounded-lg px-2.5 py-2 hover:bg-cream-200 dark:hover:bg-ink-800 transition-colors flex items-start gap-2 group",
                      !b.okunduMu && "bg-cream-100 dark:bg-ink-800/60"
                    )}
                  >
                    <Bell className="h-3.5 w-3.5 text-terracotta shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-xs leading-snug truncate",
                        b.okunduMu
                          ? "text-clay-500 dark:text-ink-200"
                          : "text-clay-800 dark:text-ink-50 font-medium"
                      )}>
                        {b.mesaj}
                      </p>
                      <p className="text-[10px] text-clay-400 dark:text-ink-300 mt-0.5">
                        {gecenSureMetni(b.olusturmaZamani)}
                      </p>
                    </div>
                  </button>
                ))}

                {dahaVar && (
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setGosterilen(g => Math.min(g + 5, MAX_BILDIRIM));
                    }}
                    className="w-full text-center text-[11px] text-terracotta hover:text-terracotta/80 py-2 mt-1 font-medium hover:bg-cream-50 dark:hover:bg-ink-800 rounded-lg transition-colors"
                  >
                    ⌄ Daha eski bildirimleri gör ({tumBildirimler.length - gosterilen})
                  </button>
                )}
                {!dahaVar && tumBildirimler.length > ILK_BILDIRIM && (
                  <p className="text-center text-[10px] text-clay-400 dark:text-ink-300 italic py-1.5">
                    {tumBildirimler.length >= MAX_BILDIRIM
                      ? "Yalnızca son 30 bildirim görüntülenir"
                      : "Daha eski bildirim yok"}
                  </p>
                )}
              </div>
            )}

            <DM.Separator className="h-px bg-cream-300 dark:bg-ink-700 my-1" />

            <DM.Item
              onSelect={() => cikis.mutate()}
              className="flex items-center gap-2.5 px-3 py-2 text-sm rounded-lg hover:bg-rose-50 dark:hover:bg-red-900/20 hover:text-red-700 dark:hover:text-red-400 cursor-pointer outline-none text-clay-700 dark:text-ink-100"
            >
              <LogOut className="h-4 w-4" />
              Çıkış
            </DM.Item>
          </DM.Content>
        </DM.Portal>
      </DM.Root>

      {/* Defteri İndir — Format seçim dialog'u */}
      <DefteriIndirDialog open={indirAcik} onOpenChange={setIndirAcik} />

      {/* Profilim modali */}
      <ProfilimModal acik={profilModalAcik} onOpenChange={setProfilModalAcik} />
    </>
  );
}

// ──────── Defteri İndir Dialog ────────

function DefteriIndirDialog({
  open, onOpenChange
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [yuklenenFormat, setYuklenenFormat] = useState<DefteriIndirFormat | null>(null);

  const indir = async (format: DefteriIndirFormat) => {
    setYuklenenFormat(format);
    try {
      await defteriIndir(format);
      toast.success(`Defterin indirildi`);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setYuklenenFormat(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Defteri İndir</DialogTitle>
          <DialogDescription>
            Sevdiğin formatı seç — tüm klasör ve notlarımız özenle hazırlanıp indirilecek.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 mt-3">
          <FormatKart
            ad="PDF"
            etiket="Kağıda Baskı"
            aciklama="Kalemle üzerinde çalış"
            icon={<FileType className="h-7 w-7" />}
            renk="bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900 hover:border-red-400 dark:hover:border-red-700"
            yukleniyor={yuklenenFormat === "pdf"}
            disabled={!!yuklenenFormat}
            onClick={() => indir("pdf")}
          />
          <FormatKart
            ad="Word"
            etiket="Düzenlenebilir"
            aciklama="Üzerinde yazıp değiştir"
            icon={<FileText className="h-7 w-7" />}
            renk="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900 hover:border-blue-400 dark:hover:border-blue-700"
            yukleniyor={yuklenenFormat === "docx"}
            disabled={!!yuklenenFormat}
            onClick={() => indir("docx")}
          />
          <FormatKart
            ad="Excel"
            etiket="Liste / Tablo"
            aciklama="Filtre + sırala"
            icon={<FileSpreadsheet className="h-7 w-7" />}
            renk="bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900 hover:border-green-400 dark:hover:border-green-700"
            yukleniyor={yuklenenFormat === "xlsx"}
            disabled={!!yuklenenFormat}
            onClick={() => indir("xlsx")}
          />
          <FormatKart
            ad="HTML"
            etiket="Tarayıcıda"
            aciklama="Görsel önizleme"
            icon={<FileCode className="h-7 w-7" />}
            renk="bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-900 hover:border-purple-400 dark:hover:border-purple-700"
            yukleniyor={yuklenenFormat === "html"}
            disabled={!!yuklenenFormat}
            onClick={() => indir("html")}
          />
        </div>

        <p className="text-[11px] text-clay-400 dark:text-ink-300 italic text-center mt-3">
          Defterimizdeki klasör, not, açıklama ve hatırlatıcılar dahil her şey indirilecek.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function FormatKart({
  ad, etiket, aciklama, icon, renk, yukleniyor, disabled, onClick
}: {
  ad: string;
  etiket: string;
  aciklama: string;
  icon: React.ReactNode;
  renk: string;
  yukleniyor: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "border-2 rounded-xl p-4 text-left transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed",
        renk
      )}
    >
      <div className="flex items-start justify-between mb-2">
        {yukleniyor ? <Loader2 className="h-7 w-7 animate-spin" /> : icon}
        <span className="text-[10px] uppercase tracking-wider font-semibold opacity-70">
          {etiket}
        </span>
      </div>
      <p className="font-display text-xl">{ad}</p>
      <p className="text-[11px] mt-0.5 opacity-80">{aciklama}</p>
    </button>
  );
}
