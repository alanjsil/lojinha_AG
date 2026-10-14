// Manifesto do app: no Android, "Adicionar à tela inicial" instala como app em tela cheia.
// Instalado, abre direto nas Vendas (quem não tem login cai na tela de login); os clientes usam o link da vitrine.
export default function manifest() {
  return {
    id: "/vendas",
    name: "Lojinha A&G",
    short_name: "A&G",
    description: "Vendas, estoque e comissões da Lojinha A&G",
    lang: "pt-BR",
    start_url: "/vendas",
    scope: "/",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#111827",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // toque longo no ícone instalado
    shortcuts: [
      { name: "Nova venda", url: "/vendas", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Estoque", url: "/estoque", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Resumos", url: "/resumos", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
