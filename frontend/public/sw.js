// Planlama Defteri - PWA service worker
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
// Push bildirimi geldiginde goster (v20: duyuru push'una aksiyon butonlari eklenir)
self.addEventListener("push", (event) => {
  let veri = { title: "Planlama Defteri", body: "" };
  try {
    if (event.data) veri = Object.assign(veri, event.data.json());
  } catch (e) {
    if (event.data) veri.body = event.data.text();
  }
  const ayarlar = {
    body: veri.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: veri.data || {},
  };
  // v20 - duyuru bildirimi (url'de duyuru= parametresi): 2 aksiyon (Web Push max 2 buton).
  // "Kapat" ayri buton DEGIL; bildirim kaydirma/dogal kapatma ile kapanir (spec karari).
  // iOS Safari PWA aksiyon butonlarini gostermeyebilir -> bildirime dokunma ayni URL'e
  // duser (kabul edilen fallback); aksiyonlari desteklemeyen platform sessizce yok sayar.
  const hedefUrl = (veri.data && veri.data.url) || "";
  if (hedefUrl.indexOf("duyuru=") !== -1) {
    ayarlar.actions = [
      { action: "okey", title: "👍 Okey" },
      { action: "yanitla", title: "Yanıtla" },
    ];
  }
  event.waitUntil(self.registration.showNotification(veri.title, ayarlar));
});

// Bildirime tiklayinca uygulamayi ac/odakla
// Bildirime tiklayinca uygulamayi ac/odakla (v20: duyuru aksiyon ayrimi)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let hedef = (event.notification.data && event.notification.data.url) || "/";
  // v20 - aksiyon butonlari: okey -> hizli onay parametresi, yanitla -> yanit modali
  // parametresi. Parametreyi frontend isler (goruldu POST + toast / modal ac - Asama 5).
  // SW'den dogrudan API'ye POST YAPILMAZ: API farkli origin'de, adresi sw.js'e hardcode
  // etmek yasak (Bolum 3), env erisimi yok. Buton yoksa (iOS) dokunma sade URL acar.
  if (event.action === "okey") hedef += (hedef.indexOf("?") !== -1 ? "&" : "?") + "okey=1";
  else if (event.action === "yanitla") hedef += (hedef.indexOf("?") !== -1 ? "&" : "?") + "yanit=1";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Mevcut pencere varsa: client-side yonlendirme icin mesaj gonder
      // (reload YOK -> menu ici tiklama gibi yumusak scroll + highlight calisir)
      for (const c of clients) {
        if ("focus" in c) {
          c.focus();
          c.postMessage({ type: "notlar-focus", url: hedef });
          return;
        }
      }
      // Pencere yoksa hedef URL ile yeni pencere ac
      if (self.clients.openWindow) return self.clients.openWindow(hedef);
    })
  );
});
