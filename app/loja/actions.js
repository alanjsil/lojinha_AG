"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { after } from "next/server";
import { brl } from "../../lib/formato";
import { hashDeIp, ipDoCliente } from "../../lib/ip";
import { MAX_ITENS } from "../../lib/pedido";
import { avisarEquipe } from "../../lib/push";
import { ehEquipe } from "../../lib/rotas";
import { criarAdmin } from "../../lib/supabase/admin";
import { createClient } from "../../lib/supabase/server";

// Pedido da vitrine: aberto a quem não tem login (o cliente). Não confia em nada do navegador:
// a RPC criar_pedido (security definer) confere produto, saldo, preço e limites de frequência.
// Ela só é executável pela service role (mig. 036): se ficasse aberta ao anon, qualquer um chamaria
// /rest/v1/rpc/criar_pedido direto e passaria por cima do limite por IP daqui.
export async function criarPedido({ nome, telefone, obs, carrinho }) {
  try {
    const itens = Object.entries(carrinho ?? {})
      .slice(0, MAX_ITENS + 1)
      .map(([produto_id, quantidade]) => ({ produto_id: String(produto_id), quantidade: Number(quantidade) }));

    const admin = criarAdmin();
    if (!admin) {
      console.error("criarPedido: SUPABASE_SERVICE_ROLE_KEY ausente; sem ela o banco não aceita o pedido.");
      return { ok: false, erro: "Os pedidos pelo site estão indisponíveis agora. Chame a loja no WhatsApp." };
    }

    // cliente logado fica como dono do pedido; visitante e equipe não (o banco confere que o perfil é de cliente)
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const clienteId = user && !ehEquipe(user) ? user.id : null;
    const ipHash = hashDeIp(ipDoCliente(await headers()), process.env.SUPABASE_SERVICE_ROLE_KEY);

    const { data, error } = await admin.rpc("criar_pedido", {
      p_nome: String(nome ?? "").slice(0, 200),
      p_telefone: String(telefone ?? "").slice(0, 40),
      p_obs: String(obs ?? "").slice(0, 1000),
      p_itens: itens,
      p_cliente_id: clienteId,
      p_ip_hash: ipHash,
    });
    // P0001 = mensagem escrita para o cliente dentro da função
    if (error?.code === "P0001") return { ok: false, erro: error.message };
    if (error) throw error;
    revalidatePath("/vendas");
    // depois da resposta: o cliente não espera o envio dos avisos
    after(() =>
      avisarEquipe({
        titulo: `Novo pedido nº ${data.numero}`,
        corpo: `${String(nome ?? "").trim()} · ${data.itens.length} ${data.itens.length === 1 ? "item" : "itens"} · ${brl(data.total)}`,
        url: "/vendas",
        tag: `pedido-${data.numero}`,
      }),
    );
    return { ok: true, pedido: data };
  } catch (e) {
    console.error(e);
    return { ok: false, erro: "Não foi possível enviar o pedido. Tente de novo." };
  }
}
