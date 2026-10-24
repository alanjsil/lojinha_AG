import EstoqueClient from "../../components/EstoqueClient";
import { somarDias } from "../../lib/formato";
import { createClient, usuarioAtual } from "../../lib/supabase/server";

export default async function Estoque() {
  const supabase = await createClient();
  const usuario = await usuarioAtual(supabase);
  const desde = somarDias(new Date().toLocaleDateString("sv-SE"), -30);
  // compras (e o custo delas): o gerente lança e edita, a sócia só visualiza; os demais nem recebem esses dados
  const gerente = Boolean(usuario?.gerente);
  const veCompras = gerente || usuario?.papel === "socia";
  const semDados = Promise.resolve({ data: [] });
  const [{ data: produtos }, { data: categorias }, { data: contagens }, { data: compras }, { data: historico }, { data: cartoes }] = await Promise.all([
    supabase.from("estoque_atual").select("id, nome, unidade, custo, preco, ativo, saldo, categoria_id, foto_url, descricao").order("nome"),
    supabase.from("categorias").select("id, nome, ordem, foto_url, ativo").order("ordem").order("nome"),
    supabase.from("contagens_estoque").select("id, data, quantidade_sistema, quantidade_contada, diferenca, observacao, produtos(nome)").order("created_at", { ascending: false }).limit(15),
    veCompras ? supabase.from("compras").select("id, data, quantidade, custo_unit, fornecedor, cartao_id, parcelas, produtos(nome)").gte("data", desde).order("data", { ascending: false }).limit(100) : semDados,
    // sem filtro de data: o último custo de compra pode ser antigo
    gerente ? supabase.from("compras").select("produto_id, custo_unit").order("data", { ascending: false }).order("created_at", { ascending: false }) : semDados,
    veCompras ? supabase.from("cartoes").select("id, nome, dia_fechamento, dia_vencimento, ativo").order("nome") : semDados,
  ]);

  const ultimoCusto = {};
  for (const c of historico ?? []) if (!(c.produto_id in ultimoCusto)) ultimoCusto[c.produto_id] = Number(c.custo_unit);

  return (
    <>
      <EstoqueClient
        gerente={gerente}
        veCompras={veCompras}
        cartoes={cartoes ?? []}
        categorias={categorias ?? []}
        produtos={(produtos ?? []).map((p) => ({ ...p, custo: Number(p.custo), preco: Number(p.preco), saldo: Number(p.saldo) }))}
        produtosCompra={(produtos ?? [])
          .filter((p) => p.ativo)
          .map((p) => ({ id: p.id, nome: p.nome, custo: Number(p.custo), ultimoCusto: ultimoCusto[p.id] ?? null }))}
        compras={(compras ?? []).map((c) => ({
          ...c,
          quantidade: Number(c.quantidade),
          custo_unit: Number(c.custo_unit),
          produto: c.produtos?.nome ?? "Produto",
        }))}
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
