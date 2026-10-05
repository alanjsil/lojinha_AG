import { createClient, usuarioAtual } from "../../lib/supabase/server";
import { brl, dataBR, qtd, somarDias } from "../../lib/formato";
import FormVenda from "../../components/FormVenda";
import ListaVendas from "../../components/ListaVendas";
import { excluirVenda } from "../actions";

const FORMA = { dinheiro: "Dinheiro", pix: "Pix", cartao: "Cartão" };

export default async function Vendas() {
  const supabase = createClient();
  const usuario = await usuarioAtual(supabase);

  const desde = somarDias(new Date().toLocaleDateString("sv-SE"), -6);
  const [{ data: produtos }, { data: vendas }] = await Promise.all([
    supabase
      .from("estoque_atual")
      .select("id, nome, unidade, custo, preco, saldo")
      .eq("ativo", true)
      .gt("saldo", 0)
      .order("nome"),
    supabase
      .from("vendas")
      .select(
        "id, data, quantidade, preco_unit, custo_unit, pagamento, lucro, comissao, produtos(nome, unidade), perfis(nome)",
      )
      .gte("data", desde)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const itens = (vendas ?? []).map((v) => ({
    id: v.id,
    titulo: v.produtos?.nome ?? "Produto",
    sub: `${dataBR(v.data)} · ${qtd(v.quantidade)} × ${brl(v.preco_unit)} · ${FORMA[v.pagamento]}`,
    valor: brl(v.quantidade * v.preco_unit),
    dados: {
      id: v.id,
      data: v.data,
      quantidade: String(v.quantidade),
      preco: String(v.preco_unit),
      pagamento: v.pagamento,
    },
    detalhes: [
      `Vendedor: ${v.perfis?.nome ?? "-"}`,
      `Custo unit.: ${brl(v.custo_unit)}`,
      `Lucro: ${brl(v.lucro)} · Comissão: ${brl(v.comissao)}`,
    ],
  }));

  return (
    <>
      <h1>Nova venda</h1>
      <FormVenda
        produtos={(produtos ?? []).map((p) => ({
          ...p,
          custo: Number(p.custo),
          preco: Number(p.preco),
          saldo: Number(p.saldo),
        }))}
        comissaoPct={usuario?.comissaoPct ?? 0}
      />
      <div className="card">
        <h2>Últimos 7 dias</h2>
        <ListaVendas itens={itens} excluir={excluirVenda} />
      </div>
    </>
  );
}
