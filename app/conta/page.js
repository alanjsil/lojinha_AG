import Link from "next/link";
import AtivarAvisos from "../../components/AtivarAvisos";
import ContaClient from "../../components/ContaClient";
import { createClient, usuarioAtual } from "../../lib/supabase/server";

export const metadata = { title: "Minha conta — Lojinha A&G" };

// Área do cliente: dados, pedidos com o andamento, WhatsApp da loja e avisos no celular.
// A RLS só devolve os pedidos dele (cliente_id).
export default async function Conta() {
  const supabase = await createClient();
  const usuario = await usuarioAtual(supabase);
  const { data: pedidos } = await supabase
    .from("pedidos")
    .select("id, numero, criado_em, status, status_em, itens, total, obs")
    .eq("cliente_id", usuario?.id)
    .order("criado_em", { ascending: false })
    .limit(30);

  return (
    <div className="vitrine">
      <header className="loja-topo">
        {/* eslint-disable-next-line @next/next/no-img-element -- ícone local */}
        <img src="/icons/icon-192.png" alt="" className="loja-logo" />
        <strong>Minha conta</strong>
        <Link href="/" className="loja-entrar">
          Loja
        </Link>
      </header>
      <ContaClient
        usuario={{ nome: usuario?.nome ?? "", telefone: usuario?.telefone ?? "", email: usuario?.email ?? "" }}
        pedidos={(pedidos ?? []).map((p) => ({ ...p, total: Number(p.total) }))}
        whatsapp={process.env.WHATSAPP_LOJA ?? ""}
      >
        <AtivarAvisos chavePublica={process.env.VAPID_PUBLIC_KEY ?? ""} texto="Receba um aviso aqui quando o seu pedido for confirmado, ficar pronto ou for entregue." />
      </ContaClient>
    </div>
  );
}
