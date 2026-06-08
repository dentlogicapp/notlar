"use client";

import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";

// v18 Asama 11.7 - Manuel "Yenile" + "Son guncelleme" gostergesi (GitHub/Stripe dashboard pattern).
// Polling/focus arka planda senkron tutar; bu buton acil durumda anlik tetikler.
export function Yenile() {
  const qc = useQueryClient();
  const [sonYenile, setSonYenile] = useState(() => Date.now());
  const [yenileniyor, setYenileniyor] = useState(false);
  const [, tik] = useState(0);

  // "X once" metnini canli tut (10sn'de bir yeniden render)
  useEffect(() => {
    const t = setInterval(() => tik((n) => n + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  const yenile = async () => {
    setYenileniyor(true);
    try {
      await qc.refetchQueries();
      setSonYenile(Date.now());
    } finally {
      setTimeout(() => setYenileniyor(false), 600);
    }
  };

  const sn = Math.floor((Date.now() - sonYenile) / 1000);
  const metin =
    sn < 10 ? "şimdi" : sn < 60 ? `${sn} sn önce` : sn < 3600 ? `${Math.floor(sn / 60)} dk önce` : `${Math.floor(sn / 3600)} saat önce`;

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-clay-400 dark:text-ink-300 hidden sm:inline">Son güncelleme: {metin}</span>
      <button
        type="button"
        onClick={yenile}
        disabled={yenileniyor}
        title="Yenile"
        aria-label="Yenile"
        className="inline-flex items-center justify-center h-7 w-7 rounded-md text-clay-500 hover:text-terracotta hover:bg-cream-200 dark:text-ink-200 dark:hover:bg-ink-800 transition-colors disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${yenileniyor ? "animate-spin" : ""}`} />
      </button>
    </div>
  );
}
