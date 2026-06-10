// v18 Asama 20 - smart skeleton loaders (shimmer, content-shape aware, layout shift yok).

export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-busy="true"
      aria-label="Yukleniyor"
      className={`animate-shimmer rounded bg-gradient-to-r from-cream-200 via-cream-100 to-cream-200 bg-[length:200%_100%] dark:from-ink-700/50 dark:via-ink-700/30 dark:to-ink-700/50 ${className}`}
    />
  );
}

// Marka & Gorunum: 4 sekme + form alanlari + live preview yan panel
export function MarkaSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b border-cream-300 dark:border-ink-700/60 pb-px">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-10 w-24" />
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
        <Skeleton className="hidden h-80 w-full lg:block" />
      </div>
    </div>
  );
}

// Sistem Semasi: filter toggle + kategori kart gruplari
export function SemaSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Skeleton className="h-10 flex-1" />
        <Skeleton className="h-10 w-28" />
        <Skeleton className="h-10 w-28" />
      </div>
      {[...Array(6)].map((_, i) => (
        <Skeleton key={i} className="h-28 w-full" />
      ))}
    </div>
  );
}

// Onboarding wizard: progress + adim baslik + alanlar + nav
export function OnboardingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-8 w-48" />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
      <div className="flex justify-between">
        <Skeleton className="h-10 w-20" />
        <Skeleton className="h-10 w-24" />
      </div>
    </div>
  );
}
