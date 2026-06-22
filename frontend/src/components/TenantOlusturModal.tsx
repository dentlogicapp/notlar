"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail, Eye } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { superAdminIsletmeApi } from "@/lib/api";
import { cn } from "@/lib/utils";

const MODLAR = [
  { kod: "es", etiket: "Eş" },
  { kod: "aile", etiket: "Aile" },
  { kod: "ekip", etiket: "Ekip" },
  { kod: "tatil", etiket: "Tatil" },
  { kod: "ozel", etiket: "Özel" },
];

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-cream-300 dark:border-ink-700 bg-white dark:bg-ink-900 text-sm focus:outline-none focus:ring-2 focus:ring-terracotta/40";

export function TenantOlusturModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [markaAdi, setMarkaAdi] = useState("");
  const [markaEmoji, setMarkaEmoji] = useState("");
  const [kullanimModu, setKullanimModu] = useState("ekip");
  const [adminEkle, setAdminEkle] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [adminAd, setAdminAd] = useState("");
  const [adminCinsiyet, setAdminCinsiyet] = useState<"kadin" | "erkek">("kadin");
  const [onizlemeHtml, setOnizlemeHtml] = useState<string | null>(null);

  const onizleMut = useMutation({
    mutationFn: () => superAdminIsletmeApi.davetOnizle({ markaAdi: markaAdi.trim(), adminAd: adminAd.trim() }),
    onSuccess: (r) => setOnizlemeHtml(r.html),
    onError: () => toast.error("Önizleme alınamadı"),
  });

  const olusturMut = useMutation({
    mutationFn: async () => {
      const t = await superAdminIsletmeApi.olustur({
        markaAdi: markaAdi.trim(),
        markaEmoji: markaEmoji.trim() || undefined,
        kullanimModu,
      });
      if (adminEkle && adminEmail.trim()) {
        await superAdminIsletmeApi.adminAta(t.id, {
          email: adminEmail.trim(),
          adSoyad: adminAd.trim() || adminEmail.trim(),
          cinsiyet: adminCinsiyet,
        });
      }
      return t;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["super-admin-isletmeler"] });
      toast.success(adminEkle ? "Tenant oluşturuldu, davet maili gönderildi" : "Tenant oluşturuldu");
      kapat();
    },
    onError: () => toast.error("Tenant oluşturulamadı"),
  });

  function kapat() {
    setMarkaAdi(""); setMarkaEmoji(""); setKullanimModu("ekip");
    setAdminEkle(false); setAdminEmail(""); setAdminAd(""); setOnizlemeHtml(null);
    onClose();
  }

  const gecerli = markaAdi.trim().length > 0 && (!adminEkle || adminEmail.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && kapat()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Yeni Tenant</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          <Alan etiket="Marka adı *">
            <input value={markaAdi} onChange={(e) => setMarkaAdi(e.target.value)} placeholder="Örn. Diş Kliniği Y" className={inputCls} />
          </Alan>

          <div className="grid grid-cols-2 gap-3">
            <Alan etiket="Emoji">
              <input value={markaEmoji} onChange={(e) => setMarkaEmoji(e.target.value)} placeholder="🏢" maxLength={4} className={inputCls} />
            </Alan>
            <Alan etiket="Kullanım modu">
              <select value={kullanimModu} onChange={(e) => setKullanimModu(e.target.value)} className={inputCls}>
                {MODLAR.map((m) => <option key={m.kod} value={m.kod}>{m.etiket}</option>)}
              </select>
            </Alan>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer text-clay-700 dark:text-ink-100">
            <input type="checkbox" checked={adminEkle} onChange={(e) => setAdminEkle(e.target.checked)} className="accent-terracotta" />
            Hemen bir yönetici ata (davet maili gönderilir)
          </label>

          {adminEkle && (
            <div className="space-y-3 border-l-2 border-cream-300 dark:border-ink-700 pl-3">
              <Alan etiket="Yönetici e-posta *">
                <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@ornek.com" className={inputCls} />
              </Alan>
              <Alan etiket="Yönetici ad soyad">
                <input value={adminAd} onChange={(e) => setAdminAd(e.target.value)} placeholder="Ad Soyad" className={inputCls} />
              </Alan>
              <Alan etiket="Cinsiyet (mail hitabı için)">
                <div className="flex gap-2">
                  {(["kadin", "erkek"] as const).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAdminCinsiyet(c)}
                      className={cn(
                        "flex-1 px-3 py-1.5 rounded-lg text-sm border transition-colors",
                        adminCinsiyet === c
                          ? "border-terracotta bg-terracotta/10 text-terracotta font-medium"
                          : "border-cream-300 dark:border-ink-700 text-clay-500 dark:text-ink-300 hover:border-clay-400"
                      )}
                    >
                      {c === "kadin" ? "Kadın" : "Erkek"}
                    </button>
                  ))}
                </div>
              </Alan>

              <button
                type="button"
                onClick={() => onizleMut.mutate()}
                disabled={onizleMut.isPending}
                className="inline-flex items-center gap-1 text-xs text-terracotta hover:underline disabled:opacity-50"
              >
                {onizleMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3" />}
                Davet mailini önizle
              </button>

              {onizlemeHtml && (
                <div className="border border-cream-300 dark:border-ink-700 rounded-lg overflow-hidden">
                  <div className="bg-cream-200 dark:bg-ink-800 px-3 py-1.5 text-[11px] text-clay-400 dark:text-ink-300 flex items-center gap-1">
                    <Eye className="h-3 w-3" /> Davet maili önizlemesi (yeni tenant varsayılan şablonu)
                  </div>
                  <iframe srcDoc={onizlemeHtml} title="Davet maili önizleme" className="w-full h-72 bg-white" sandbox="" />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button
            type="button"
            onClick={kapat}
            disabled={olusturMut.isPending}
            className="px-4 py-2 text-sm text-clay-500 dark:text-ink-300 hover:text-clay-700 dark:hover:text-ink-100 disabled:opacity-50"
          >
            İptal
          </button>
          <Button onClick={() => olusturMut.mutate()} disabled={!gecerli || olusturMut.isPending}>
            {olusturMut.isPending && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Oluştur
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Alan({ etiket, children }: { etiket: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-clay-500 dark:text-ink-300 mb-1">{etiket}</label>
      {children}
    </div>
  );
}
