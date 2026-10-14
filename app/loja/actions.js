"use server";

import { revalidatePath } from "next/cache";
import { MAX_ITENS } from "../../lib/pedido";
import { createClient } from "../../lib/supabase/server";

// Pedido da vitrine: aberto a quem não tem login (o cliente). Não confia em nada do navegador:
// a RPC criar_pedido (security definer) confere produto, saldo, preço e limites de frequência.
export async function criarPedido({ nome, telefone, obs, carrinho }) {
  try {
    const itens = Object.entries(carrinho ?? {})
      .slice(0, MAX_ITENS + 1)
      .map(([produto_id, quantidade]) => ({ produto_id: String(produto_id), quantidade: Number(quantidade) }));
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("criar_pedido", {
      p_nome: String(nome ?? "").slice(0, 200),
      p_telefone: String(telefone ?? "").slice(0, 40),
      p_obs: String(obs ?? "").slice(0, 1000),
      p_itens: itens,
    });
    // P0001 = mensagem escrita para o cliente dentro da função
    if (error?.code === "P0001") return { ok: false, erro: error.message };
    if (error) throw error;
    revalidatePath("/vendas");
    return { ok: true, pedido: data };
  } catch (e) {
    console.error(e);
    return { ok: false, erro: "Não foi possível enviar o pedido. Tente de novo." };
  }
}
