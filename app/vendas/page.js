import FormVenda from "../../components/FormVenda";
import ListaVendas from "../../components/ListaVendas";
import { brl, dataBR, qtd, somarDias } from "../../lib/formato";
import { createClient, usuarioAtual } from "../../lib/supabase/server";
import { excluirVenda } from "../actions";

const FORMA = { a_vista: "À Vista", cartao: "Cartão" };

export default async function Vendas() {
  const supabase = await createClient();
  const usuario = await usuarioAtual(supabase);

  const desde = somarDias(new Date().toLocaleDateString("sv-SE"), -6);
  const [{ data: produtos }, { data: vendas }] = await Promise.all([
    supabase.from("estoque_atual").select("id, nome, unidade, custo, preco, saldo").eq("ativo", true).gt("saldo", 0).order("nome"),
    supabase
      .from("vendas")
      .select(
        "id, grupo_id, data, quantidade, preco_unit, custo_unit, pagamento, parcelas, obs, lucro, comissao, comissao_socia, produtos(nome, unidade), perfis!vendas_vendedor_id_fkey(nome), parcelas_venda:parcelas(numero, vencimento, valor, comissao)",
      )
      .gte("data", desde)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
  ]);

  const mostraSocia = usuario?.gerente || usuario?.papel === "socia";
  const dadosDe = (v) => ({
    id: v.id,
    data: v.data,
    quantidade: String(v.quantidade),
    preco: String(v.preco_unit),
    pagamento: v.pagamento,
    parcelas: String(v.parcelas),
    obs: v.obs ?? "",
  });
  const detalhesDe = (v) => [
    `Custo unit.: ${brl(v.custo_unit)}`,
    `Lucro: ${brl(v.lucro)} · Comissão: ${brl(v.comissao)}`,
    ...(mostraSocia && Number(v.comissao_socia) > 0 ? [`Comissão da sócia: ${brl(v.comissao_socia)}`] : []),
    ...(v.parcelas > 1
      ? [...(v.parcelas_venda ?? [])].sort((a, b) => a.numero - b.numero).map((p) => `${p.numero}/${v.parcelas} · ${dataBR(p.vencimento)} · ${brl(p.valor)} · comissão ${brl(p.comissao)}`)
      : []),
  ];
  const pagamentoDe = (v) => `${FORMA[v.pagamento]}${v.parcelas > 1 ? ` ${v.parcelas}x` : ""}`;

  // itens da mesma venda (mesmo grupo_id) viram um cartão só, na posição do mais recente
  const grupos = new Map();
  for (const v of vendas ?? []) {
    const chave = v.grupo_id ?? v.id;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(v);
  }

  const itens = [...grupos.entries()].map(([chave, vs]) => {
    const v = vs[0];
    if (vs.length === 1) {
      return {
        id: v.id,
        titulo: v.produtos?.nome ?? "Produto",
        sub: `${dataBR(v.data)} · ${qtd(v.quantidade)} × ${brl(v.preco_unit)} · ${pagamentoDe(v)}`,
        valor: brl(v.quantidade * v.preco_unit),
        dados: [dadosDe(v)],
        detalhes: [`Vendedor: ${v.perfis?.nome ?? "-"}`, ...(v.obs ? [`Obs: ${v.obs}`] : []), ...detalhesDe(v)],
      };
    }
    const total = vs.reduce((t, x) => t + x.quantidade * x.preco_unit, 0);
    const lucro = vs.reduce((t, x) => t + Number(x.lucro), 0);
    const comissao = vs.reduce((t, x) => t + Number(x.comissao), 0);
    return {
      id: chave,
      titulo: `${v.produtos?.nome ?? "Produto"} + ${vs.length - 1} ${vs.length === 2 ? "item" : "itens"}`,
      sub: `${dataBR(v.data)} · ${vs.length} itens · ${pagamentoDe(v)}`,
      valor: brl(total),
      dados: vs.map((x) => ({ ...dadosDe(x), nome: x.produtos?.nome ?? "Produto" })),
      detalhes: [
        `Vendedor: ${v.perfis?.nome ?? "-"}`,
        ...(v.obs ? [`Obs: ${v.obs}`] : []),
        `Lucro: ${brl(lucro)} · Comissão: ${brl(comissao)}`,
        ...vs.map((x) => `• ${x.produtos?.nome ?? "Produto"}: ${qtd(x.quantidade)} × ${brl(x.preco_unit)} = ${brl(x.quantidade * x.preco_unit)} (lucro ${brl(x.lucro)})`),
      ],
    };
  });

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
