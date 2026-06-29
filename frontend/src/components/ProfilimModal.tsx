"use client";

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Mail, Bell, BellOff, Loader2, KeyRound, ShieldCheck, Check } from "lucide-react";
import { authApi } from "@/lib/api";
import { pushDurumu, pushAboneOl, pushCikar, type PushDurum } from "@/lib/push";
import { useBen } from "@/lib/useBen";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Cinsiyet } from "@/lib/types";

export function ProfilimModal({
  acik,
  onOpenChange,
}: {
  acik: boolean;
  onOpenChange: (a: boolean) => void;
}) {
  const qc = useQueryClient();
  const { data: ben } = useBen();

  const [adSoyad, setAdSoyad] = useState("");
  const [cinsiyet, setCinsiyet] = useState<Cinsiyet | null>(null);
  const [pushDurum, setPushDurum] = useState<PushDurum>("kapali");
  const [pushYukleniyor, setPushYukleniyor] = useState(false);
  const [sifreGonderildi, setSifreGonderildi] = useState(false);

  // modal acilinca mevcut degerleri doldur
  useEffect(() => {
    if (acik && ben) {
      setAdSoyad(ben.adSoyad);
      setCinsiyet(ben.cinsiyet);
      setSifreGonderildi(false);
    }
  }, [acik, ben]);

  useEffect(() => {
    if (acik) pushDurumu().then(setPushDurum);
  }, [acik]);

  const profilMutation = useMutation({
    mutationFn: () => authApi.profilGuncelle(adSoyad.trim(), cinsiyet),
    onSuccess: () => {
      toast.success("Profiliniz güncellendi");
      qc.invalidateQueries({ queryKey: ["ben"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Güncellenemedi"),
  });

  const sifreMutation = useMutation({
    mutationFn: () => authApi.sifreSifirlaIste(ben!.email),
    onSuccess: () => {
      setSifreGonderildi(true);
      toast.success("Şifre yenileme bağlantısı e-postanıza gönderildi");
    },
    onError: () => toast.error("Bağlantı gönderilemedi"),
  });

  async function pushToggle() {
    setPushYukleniyor(true);
    try {
      if (pushDurum === "abone") {
        await pushCikar();
        toast.success("Bu cihazda bildirimler kapatıldı");
      } else {
        await pushAboneOl();
        toast.success("Bildirimler açıldı");
        qc.invalidateQueries({ queryKey: ["cihazlar"] });
      }
      setPushDurum(await pushDurumu());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "İşlem başarısız");
    } finally {
      setPushYukleniyor(false);
    }
  }

  if (!ben) return null;

  const degisti = adSoyad.trim() !== ben.adSoyad || cinsiyet !== ben.cinsiyet;
  const adGecerli = adSoyad.trim().length > 0;

  return (
    <Dialog open={acik} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="sm:max-w-md max-h-[85vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Profilim</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* E-posta - degistirilemez */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-clay-500 dark:text-ink-200 font-semibold mb-1.5 block">
              E-posta
            </label>
            <div className="flex items-center gap-2.5 rounded-xl border border-cream-300 dark:border-ink-700 bg-cream-100/60 dark:bg-ink-800/40 px-3 py-2.5">
              <Mail className="h-4 w-4 text-clay-400 dark:text-ink-300 shrink-0" />
              <span className="flex-1 text-sm text-clay-700 dark:text-ink-100 truncate">{ben.email}</span>
              <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-clay-400 dark:text-ink-300 font-semibold shrink-0">
                <ShieldCheck className="h-3 w-3" />
                Değiştirilemez
              </span>
            </div>
          </div>

          {/* Ad Soyad */}
          <div>
            <label
              htmlFor="profil-ad"
              className="text-[11px] uppercase tracking-wider text-clay-500 dark:text-ink-200 font-semibold mb-1.5 block"
            >
              Ad Soyad
            </label>
            <input
              id="profil-ad"
              type="text"
              value={adSoyad}
              onChange={(e) => setAdSoyad(e.target.value)}
              className="w-full rounded-xl border border-cream-300 dark:border-ink-700 bg-white dark:bg-ink-900 px-3 py-2.5 text-[16px] md:text-sm text-clay-800 dark:text-ink-50 outline-none focus:border-terracotta focus:ring-1 focus:ring-terracotta/30"
              placeholder="Adınız Soyadınız"
            />
          </div>

          {/* Cinsiyet */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-clay-500 dark:text-ink-200 font-semibold mb-1.5 block">
              Cinsiyet
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["kadin", "erkek"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCinsiyet(c)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                    cinsiyet === c
                      ? "border-terracotta bg-terracotta/10 text-terracotta"
                      : "border-cream-300 dark:border-ink-700 text-clay-600 dark:text-ink-200 hover:bg-cream-100 dark:hover:bg-ink-800/50"
                  )}
                >
                  {c === "kadin" ? "Kadın" : "Erkek"}
                </button>
              ))}
            </div>
          </div>

          {/* Kaydet */}
          <button
            type="button"
            onClick={() => profilMutation.mutate()}
            disabled={!degisti || !adGecerli || profilMutation.isPending}
            className="w-full rounded-xl bg-terracotta py-2.5 text-sm font-semibold text-white transition-colors hover:bg-terracotta/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {profilMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            Değişiklikleri kaydet
          </button>

          <div className="h-px bg-cream-300 dark:bg-ink-700" />

          {/* Bildirim Izni */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-clay-500 dark:text-ink-200 font-semibold mb-2 block">
              Bildirim İzni
            </label>
            {pushDurum === "desteklenmiyor" ? (
              <p className="text-sm text-clay-500 dark:text-ink-300">Bu cihaz/tarayıcı bildirimleri desteklemiyor.</p>
            ) : pushDurum === "izin-reddedildi" ? (
              <p className="text-sm text-clay-500 dark:text-ink-300">
                Bildirim izni reddedilmiş. Cihaz/tarayıcı ayarlarından açmanız gerekiyor.
              </p>
            ) : (
              <button
                type="button"
                onClick={pushToggle}
                disabled={pushYukleniyor}
                className="w-full flex items-center gap-3 rounded-xl border border-cream-300 dark:border-ink-700 p-3 hover:bg-cream-100 dark:hover:bg-ink-800/50 transition-colors disabled:opacity-60"
              >
                {pushDurum === "abone" ? (
                  <Bell className="h-5 w-5 text-terracotta" />
                ) : (
                  <BellOff className="h-5 w-5 text-clay-400" />
                )}
                <span className="flex-1 text-left text-sm font-medium text-clay-700 dark:text-ink-50">
                  {pushDurum === "abone" ? "Bu cihazda bildirimler açık" : "Bu cihazda bildirimleri aç"}
                </span>
                {pushYukleniyor ? (
                  <Loader2 className="h-4 w-4 animate-spin text-terracotta" />
                ) : (
                  <span
                    role="switch"
                    aria-checked={pushDurum === "abone"}
                    className={cn(
                      "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                      pushDurum === "abone" ? "bg-terracotta" : "bg-clay-200 dark:bg-ink-700"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                        pushDurum === "abone" ? "translate-x-[18px]" : "translate-x-0.5"
                      )}
                    />
                  </span>
                )}
              </button>
            )}
          </div>

          <div className="h-px bg-cream-300 dark:bg-ink-700" />

          {/* Sifremi Yenile */}
          <div>
            <label className="text-[11px] uppercase tracking-wider text-clay-500 dark:text-ink-200 font-semibold mb-2 block">
              Güvenlik
            </label>
            <button
              type="button"
              onClick={() => sifreMutation.mutate()}
              disabled={sifreMutation.isPending || sifreGonderildi}
              className="w-full flex items-center gap-3 rounded-xl border border-cream-300 dark:border-ink-700 p-3 hover:bg-cream-100 dark:hover:bg-ink-800/50 transition-colors disabled:opacity-60"
            >
              {sifreGonderildi ? (
                <Check className="h-5 w-5 text-terracotta" />
              ) : (
                <KeyRound className="h-5 w-5 text-clay-400 dark:text-ink-300" />
              )}
              <span className="flex-1 text-left text-sm font-medium text-clay-700 dark:text-ink-50">
                {sifreGonderildi ? "Bağlantı e-postanıza gönderildi" : "Şifremi yenile"}
              </span>
              {sifreMutation.isPending && <Loader2 className="h-4 w-4 animate-spin text-terracotta" />}
            </button>
            <p className="mt-1.5 text-[11px] text-clay-400 dark:text-ink-300">
              E-posta adresinize bir şifre yenileme bağlantısı göndeririz.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
