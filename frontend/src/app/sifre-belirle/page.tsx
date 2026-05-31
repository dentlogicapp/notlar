"use client";

import { Suspense } from "react";
import { SifreBelirleForm } from "@/components/SifreBelirleForm";
import { Loader2 } from "lucide-react";

export default function Page() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-clay-400" />
      </div>
    }>
      <SifreBelirleForm baslik="Şifreni Belirle" />
    </Suspense>
  );
}
