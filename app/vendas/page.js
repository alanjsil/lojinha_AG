import Link from "next/link";
import AtivarAvisos from "../../components/AtivarAvisos";
import FormVenda from "../../components/FormVenda";
import ListaVendas from "../../components/ListaVendas";
import PedidosLoja from "../../components/PedidosLoja";
import { brl, dataBR, qtd, somarDias } from "../../lib/formato";
import { ABERTOS } from "../../lib/pedido";
import { primeiroVencimentoVenda } from "../../lib/parcelas";
import { createClient, usuarioAtual } from "../../lib/supabase/server";
import { motivoSemAcessoVenda } from "../../lib/vendas";
import { excluirVenda } from "../actions";

const FORMA = { a_vista: "À Vista", cartao: "Cartão" };

// ?pedido=<id>: o formulário abre com os itens de um pedido da loja (vitrine)
export default async function Vendas({ searchParams }) {
  const { pedido: pedidoId } = await searchParams;
  const supabase = await createClient();
  const usuario = await usuarioAtual(supabase);

  const desde = somarDias(new Date().toLocaleDateString("sv-SE"), -6);
  const [{ data: produtos }, { data: vendas }, { data: pedidos }] = await Promise.all([
    supabase.from("estoque_atual").select("id, nome, unidade, custo, preco, saldo").eq("ativo", true).gt("saldo", 0).order("nome"),
    supabase
      .from("vendas")
      .select(
        "id, grupo_id, vendedor_id, created_at, data, quantidade, preco_unit, custo_unit, pagamento, parcelas, obs, lucro, comissao, comissao_socia, produtos(nome, unidade), perfis!vendas_vendedor_id_fkey(nome), parcelas_venda:parcelas(numero, vencimento, valor, comissao)",
      )
      .gte("data", desde)
      .order("data", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("pedidos").select("id, numero, criado_em, status, cliente_id, cliente_nome, cliente_telefone, obs, itens, total").in("status", ABERTOS).order("criado_em").limit(50),
  ]);
  const pedido = pedidoId ? ((pedidos ?? []).find((p) => p.id === pedidoId) ?? null) : null;

  const mostraSocia = usuario?.gerente || usuario?.papel === "socia";
  const dadosDe = (v) => ({
    id: v.id,
    data: v.data,
    quantidade: String(v.quantidade),
    preco: String(v.preco_unit),
    pagamento: v.pagamento,
    parcelas: String(v.parcelas),
    // 1ª parcela gravada; se virou cartão agora, sugere o dia 8 do mês seguinte
    primeiroVencimento: (v.pagamento === "cartao" ? [...(v.parcelas_venda ?? [])].sort((a, b) => a.numero - b.numero)[0]?.vencimento : null) ?? primeiroVencimentoVenda(v.data),
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
  // motivo de não poder editar/excluir (a regra das 48 h está em lib/vendas.js); null = pode. Itens do mesmo grupo têm o mesmo dono e hora.
  const bloqueioDe = (vs) =>
    vs.map((x) => motivoSemAcessoVenda({ papel: usuario?.papel, usuarioId: usuario?.id, vendedorId: x.vendedor_id, criadaEm: x.created_at })).find(Boolean) ?? null;

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
        bloqueio: bloqueioDe(vs),
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
      bloqueio: bloqueioDe(vs),
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
      {!pedido && <PedidosLoja pedidos={(pedidos ?? []).map((p) => ({ ...p, total: Number(p.total) }))} />}
      {pedido ? (
        <div className="titulo-linha">
          <h1>Pedido nº {pedido.numero}</h1>
          <Link href="/vendas" className="filtro-chip link-chip">
            Voltar
          </Link>
        </div>
      ) : (
        <h1>Nova venda</h1>
      )}
      {pedidoId && !pedido && <p className="alerta">Esse pedido já foi entregue ou cancelado.</p>}
      <FormVenda
        key={pedido?.id ?? "nova"}
        pedido={pedido}
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
      {!pedido && <AtivarAvisos chavePublica={process.env.VAPID_PUBLIC_KEY ?? ""} texto="Receba um aviso neste aparelho quando chegar um pedido novo da loja." />}
    </>
  );
}
