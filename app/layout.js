import BottomNav from "../components/BottomNav";
import Novidades from "../components/Novidades";
import RegistrarSW from "../components/RegistrarSW";
import { createClient } from "../lib/supabase/server";
import "./globals.css";

export const metadata = {
  title: "Lojinha A&G",
  description: "Vendas, estoque e comissões da Lojinha A&G",
  // permite "Adicionar à tela de início" e abrir como app, sem barra do navegador
  appleWebApp: {
    capable: true,
    title: "Lojinha A&G",
    statusBarStyle: "default",
  },
};

// A CSP usa um nonce novo a cada resposta (proxy.js); página pré-renderizada no build
// sairia sem nonce e o navegador bloquearia os scripts, então tudo é renderizado na hora.
export const dynamic = "force-dynamic";

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#111827",
};

export default async function RootLayout({ children }) {
  // papel vem do app_metadata do Auth (mesma fonte do proxy.js), sem consultar o banco
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const gerente = user?.app_metadata?.papel === "gerente";

  return (
    <html lang="pt-BR">
      <body>
        <main className="content">{children}</main>
        <BottomNav gerente={gerente} />
        <Novidades />
        <RegistrarSW />
      </body>
    </html>
  );
}
