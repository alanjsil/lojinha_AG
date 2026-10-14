// Service worker da Lojinha A&G.
// Páginas: sempre da rede (os dados mudam e dependem do login); sem conexão, mostra /offline.
// Arquivos do Next com hash (/_next/static) e ícones: cache primeiro, porque nunca mudam de conteúdo.
const VERSAO = "v2";
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

// Aviso (push) vindo do servidor: { titulo, corpo, url, tag }
self.addEventListener("push", (evento) => {
  let dados = {};
  try {
    dados = evento.data?.json() ?? {};
  } catch {
    dados = { corpo: evento.data?.text() };
  }
  evento.waitUntil(
    self.registration.showNotification(dados.titulo || "Lojinha A&G", {
      body: dados.corpo || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: dados.tag,
      renotify: Boolean(dados.tag),
      data: { url: dados.url || "/" },
    }),
  );
});

// Toque no aviso: foca uma aba já aberta do app (indo para a página do aviso) ou abre uma nova
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.url || "/", self.location.origin).href;
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((abas) => {
      const aba = abas.find((a) => new URL(a.url).origin === self.location.origin);
      if (aba) return aba.focus().then(() => aba.navigate(destino));
      return self.clients.openWindow(destino);
    }),
  );
});
