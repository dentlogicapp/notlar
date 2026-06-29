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

// Push bildirimi geldiginde goster
self.addEventListener("push", (event) => {
  let veri = { title: "Planlama Defterimiz", body: "" };
  try {
    if (event.data) veri = Object.assign(veri, event.data.json());
  } catch (e) {
    if (event.data) veri.body = event.data.text();
  }
  event.waitUntil(
    self.registration.showNotification(veri.title, {
      body: veri.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: veri.data || {},
    })
  );
});

// Bildirime tiklayinca uygulamayi ac/odakla
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const hedef = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const c of clients) {
        if ("focus" in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(hedef);
    })
  );
});
