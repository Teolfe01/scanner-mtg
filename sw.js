// Service worker da Biblioteca MTG: deixa o app instalável e funcionando offline.
const V = "bmtg-v2";
const CORE = ["./", "index.html", "manifest.webmanifest", "icon-v2-192.png", "icon-v2-512.png", "icon-v2-maskable-512.png",
  "css/mana.css", "css/keyrune.css", "fonts/mana.woff2", "fonts/keyrune.woff2", "data/cards.json.gz",
  "lib/tesseract.min.js", "lib/worker.min.js", "lib/eng.traineddata.gz"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V && k !== "bmtg-imgs").map(k => caches.delete(k)))).then(() => self.clients.claim())); });
async function trimImgs() { const c = await caches.open("bmtg-imgs"); const ks = await c.keys(); if (ks.length > 4000) for (const k of ks.slice(0, ks.length - 3500)) await c.delete(k); }
self.addEventListener("fetch", (e) => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Imagens das cartas: guarda para ver offline
  if (url.hostname === "cards.scryfall.io") {
    e.respondWith(caches.open("bmtg-imgs").then(async c => { const hit = await c.match(req); if (hit) return hit;
      const r = await fetch(req); if (r.ok || r.type === "opaque") { c.put(req, r.clone()); if (Math.random() < .02) trimImgs(); } return r; }));
    return;
  }
  if (url.origin !== location.origin) return; // Firebase, EDHREC, Scryfall API etc. vão direto pra rede
  // Página: rede primeiro (pega atualizações), cache se estiver offline
  if (req.mode === "navigate" || url.pathname.endsWith("/index.html")) {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(V).then(c => c.put("index.html", cp)); return r; }).catch(() => caches.match("index.html")));
    return;
  }
  // Demais arquivos do app: cache na hora e atualiza em segundo plano
  e.respondWith(caches.open(V).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r.ok) c.put(req, r.clone()); return r; }).catch(() => hit);
    return hit || net;
  }));
});
