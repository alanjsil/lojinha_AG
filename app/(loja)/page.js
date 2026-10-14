import Vitrine from "../../components/Vitrine";
import { createClient } from "../../lib/supabase/server";

// Link que vai para os clientes: precisa ficar bonito quando colado no WhatsApp
export const metadata = {
  title: "Lojinha A&G — faça seu pedido",
  description: "Veja os produtos da Lojinha A&G, monte seu carrinho e envie o pedido pelo WhatsApp.",
  openGraph: {
    title: "Lojinha A&G",
    description: "Veja os produtos, monte seu carrinho e envie o pedido pelo WhatsApp.",
    images: [{ url: "/icons/icon-512.png", width: 512, height: 512 }],
    locale: "pt_BR",
    type: "website",
  },
};

// Vitrine pública (sem login). Os produtos vêm da função vitrine(), que não expõe custo nem saldo.
export default async function Inicio() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    { data: produtos, error },
  ] = await Promise.all([supabase.auth.getUser(), supabase.rpc("vitrine")]);
  if (error) console.error(error);

  return <Vitrine logado={Boolean(user)} whatsapp={process.env.WHATSAPP_LOJA ?? ""} erro={Boolean(error)} produtos={(produtos ?? []).map((p) => ({ ...p, preco: Number(p.preco) }))} />;
}
