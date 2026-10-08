// Manifesto do app: no Android, "Adicionar à tela inicial" instala como app em tela cheia
export default function manifest() {
  return {
    name: "Lojinha A&G",
    short_name: "A&G",
    start_url: "/vendas",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#111827",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
