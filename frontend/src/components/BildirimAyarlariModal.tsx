"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Bell, BellOff, Trash2, Loader2 } from "lucide-react";
import { cihazApi } from "@/lib/api";
import { pushDurumu, pushAboneOl, pushCikar, type PushDurum } from "@/lib/push";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export function BildirimAyarlariModal({
  acik,
  onOpenChange,
}: {
  acik: boolean;
  onOpenChange: (a: boolean) => void;
}) {
  const qc = useQueryClient();
  const [durum, setDurum] = useState<PushDurum>("kapali");
  const [yukleniyor, setYukleniyor] = useState(false);

  useEffect(() => {
    if (acik) pushDurumu().then(setDurum);
  }, [acik]);

  const cihazlarQuery = useQuery({
    queryKey: ["cihazlar"],
    queryFn: () => cihazApi.liste(),
    enabled: acik,
  });

  async function toggle() {
    setYukleniyor(true);
    try {
      if (durum === "abone") {
        await pushCikar();
        toast.success("Bu cihazda bildirimler kapatıldı");
      } else {
        await pushAboneOl();
        toast.success("Bildirimler açıldı");
        qc.invalidateQueries({ queryKey: ["cihazlar"] });
      }
      setDurum(await pushDurumu());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "İşlem başarısız");
    } finally {
      setYukleniyor(false);
    }
  }

  const silMutation = useMutation({
    mutationFn: (id: string) => cihazApi.sil(id),
    onSuccess: () => {
      toast.success("Cihaz kaldırıldı");
      qc.invalidateQueries({ queryKey: ["cihazlar"] });
    },
    onError: () => toast.error("Cihaz kaldırılamadı"),
  });

  const cihazlar = cihazlarQuery.data ?? [];

  return (
    <Dialog open={acik} onOpenChange={onOpenChange}>
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bildirim Ayarları</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {durum === "desteklenmiyor" ? (
            <p className="text-sm text-clay-500 dark:text-ink-300">
              Bu cihaz/tarayıcı bildirimleri desteklemiyor.
            </p>
          ) : durum === "izin-reddedildi" ? (
            <p className="text-sm text-clay-500 dark:text-ink-300">
              Bildirim izni reddedilmiş. Tarayıcı veya cihaz ayarlarından izni açmanız gerekiyor.
            </p>
          ) : (
            <button
              type="button"
              onClick={toggle}
              disabled={yukleniyor}
              className="w-full flex items-center gap-3 rounded-xl border border-cream-300 dark:border-ink-700 p-3 hover:bg-cream-100 dark:hover:bg-ink-800/50 transition-colors disabled:opacity-60"
            >
              {durum === "abone" ? (
                <Bell className="h-5 w-5 text-terracotta" />
              ) : (
                <BellOff className="h-5 w-5 text-clay-400" />
              )}
              <span className="flex-1 text-left text-sm font-medium text-clay-700 dark:text-ink-50">
                {durum === "abone" ? "Bu cihazda bildirimler açık" : "Bu cihazda bildirimleri aç"}
              </span>
              {yukleniyor ? (
                <Loader2 className="h-4 w-4 animate-spin text-terracotta" />
              ) : (
                <span
                  role="switch"
                  aria-checked={durum === "abone"}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                    durum === "abone" ? "bg-terracotta" : "bg-clay-200 dark:bg-ink-700"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm",
                      durum === "abone" ? "translate-x-[18px]" : "translate-x-0.5"
                    )}
                  />
                </span>
              )}
            </button>
          )}

          <div>
            <p className="text-[11px] uppercase tracking-wider text-clay-500 dark:text-ink-200 font-semibold mb-2">
              Bildirim alan cihazlar
            </p>
            {cihazlarQuery.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-terracotta" />
            ) : cihazlar.length === 0 ? (
              <p className="text-sm text-clay-400 dark:text-ink-300">Henüz abone cihaz yok.</p>
            ) : (
              <ul className="space-y-1.5">
                {cihazlar.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center gap-2 rounded-lg border border-cream-200 dark:border-ink-700 px-3 py-2"
                  >
                    <Bell className="h-3.5 w-3.5 text-terracotta shrink-0" />
                    <span className="flex-1 text-[13px] text-clay-700 dark:text-ink-100">
                      {c.cihazAdi ?? c.platform}
                    </span>
                    <span className="text-[10px] text-clay-400 dark:text-ink-300 tabular-nums">...{c.tokenSon}</span>
                    <button
                      type="button"
                      onClick={() => silMutation.mutate(c.id)}
                      disabled={silMutation.isPending}
                      aria-label="Cihazı kaldır"
                      className="text-clay-400 hover:text-terracotta transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
