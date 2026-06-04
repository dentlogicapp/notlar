"use client";

import { AuthGuard } from "@/components/AuthGuard";

// v17 - Tum /admin/sistem/* sayfalari super admin guard altinda (defense in depth: backend RequireSuperAdmin)
export default function SistemLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard requireSuperAdmin>{children}</AuthGuard>;
}