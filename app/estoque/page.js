import { createClient, usuarioAtual } from "../../lib/supabase/server";
import EstoqueClient from "../../components/EstoqueClient";

export default async function Estoque() {
  const supabase = await createClient();
  const usuario = await usuarioAtual(supabase);
  const [{ data: produtos }, { data: categorias }, { data: contagens }] = await Promise.all([
    supabase.from("estoque_atual").select("id, nome, unidade, custo, preco, ativo, saldo, categoria_id, foto_url, descricao").order("nome"),
    supabase.from("categorias").select("id, nome, ordem, foto_url, ativo").order("ordem").order("nome"),
    supabase.from("contagens_estoque").select("id, data, quantidade_sistema, quantidade_contada, diferenca, observacao, produtos(nome)").order("created_at", { ascending: false }).limit(15),
  ]);

  return (
    <>
      <EstoqueClient
        gerente={Boolean(usuario?.gerente)}
        categorias={categorias ?? []}
        produtos={(produtos ?? []).map((p) => ({ ...p, custo: Number(p.custo), preco: Number(p.preco), saldo: Number(p.saldo) }))}
        contagens={(contagens ?? []).map((c) => ({
          id: c.id,
          data: c.data,
          produto: c.produtos?.nome ?? "Produto",
          sistema: Number(c.quantidade_sistema),
          contada: Number(c.quantidade_contada),
          diferenca: Number(c.diferenca),
          observacao: c.observacao,
        }))}
      />
    </>
  );
}
