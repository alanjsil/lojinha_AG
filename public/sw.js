// Service worker da Lojinha A&G.
// Páginas: sempre da rede (os dados mudam e dependem do login); sem conexão, mostra /offline.
// Arquivos do Next com hash (/_next/static) e ícones: cache primeiro, porque nunca mudam de conteúdo.
const VERSAO = "v1";
const CACHE_ESTATICO = `estatico-${VERSAO}`;
const CACHE_PAGINAS = `paginas-${VERSAO}`;
const OFFLINE = "/offline";

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_PAGINAS)
      .then((cache) => cache.add(new Request(OFFLINE, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => !n.endsWith(VERSAO)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const req = evento.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    evento.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    evento.respondWith(
      caches.open(CACHE_ESTATICO).then(async (cache) => {
        const salvo = await cache.match(req);
        if (salvo) return salvo;
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      }),
    );
  }
});
