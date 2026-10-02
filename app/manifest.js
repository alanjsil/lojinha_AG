// Manifesto do app: no Android, "Adicionar à tela inicial" instala como app em tela cheia
export default function manifest() {
  return {
    name: "Lojinha A&G",
    short_name: "A&G",
    start_url: "/vendas",
    display: "standalone",
    background_color: "#f5f6f8",
    theme_color: "#111827",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
