import { redirect } from "next/navigation";

// v18 Asama 11.9 - "Metin Anahtarlari" CRUD/duzenleme sayfalari kaldirildi.
// Sema artik kod ile tanimli (Schema-as-Code); read-only "Sistem Semasi" sayfasina yonlendir.
export default function Page() {
  redirect("/admin/sistem/sema");
}
