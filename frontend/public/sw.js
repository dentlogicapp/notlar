// Planlama Defterimiz - PWA service worker
// Senkron ilkesi: veri (API) ASLA onbellege alinmaz (her zaman canli); sayfa icerigi network-first
// (en guncel surum); yalnizca degismez statik varliklar (hash'li JS/CSS/ikon) cache-first.
const CACHE = "planlama-pwa-v1";

self.addEventListener("install", (event) => {
  // Yeni surum beklemeden devreye girsin (web gelistirmeleri aninda yansisin)
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add("/")).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  // Eski surum onbelleklerini temizle, kontrolu hemen al
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // sadece okuma istekleri

  const url = new URL(request.url);

  // 1) Baska origin (API: api.dentlogicapp.com vb.) -> hic dokunma, her zaman canli/senkron
  if (url.origin !== self.location.origin) return;

  // 2) Sayfa gezinmesi -> network-first: her zaman en guncel surum; cevrimdisiyse onbellekten kabuk
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const kopya = res.clone();
          caches.open(CACHE).then((c) => c.put(request, kopya));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match("/")))
    );
    return;
  }

  // 3) Degismez statik varliklar (hash'li) -> cache-first (hizli + cevrimdisi). Yeni surumde hash degisir.
  const statikMi =
    url.pathname.startsWith("/_next/static") ||
    url.pathname.startsWith("/icons") ||
    /\.(?:png|svg|ico|woff2?|css|js)$/.test(url.pathname);
  if (statikMi) {
    event.respondWith(
      caches.match(request).then((cached) =>
        cached ||
        fetch(request).then((res) => {
          const kopya = res.clone();
          caches.open(CACHE).then((c) => c.put(request, kopya));
          return res;
        })
      )
    );
    return;
  }

  // 4) Digerleri -> network, cevrimdisiyse varsa onbellek
  event.respondWith(fetch(request).catch(() => caches.match(request)));
});
