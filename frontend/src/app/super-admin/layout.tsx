"use client";

import { AuthGuard } from "@/components/AuthGuard";

// v19 Asama 8 - /super-admin/* sayfalari super admin guard altinda
// (defense in depth: backend RequireSuperAdmin + frontend AuthGuard).
// CountdownWidget YOK: bu sistem paneli, tenant degil.
export default function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard requireSuperAdmin>{children}</AuthGuard>;
}
