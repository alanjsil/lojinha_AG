import { redirect } from "next/navigation";
import PainelClient from "../../components/PainelClient";
import { somarDias } from "../../lib/formato";
import { indicadores, PERIODOS_PAINEL, periodoPainel, resumoEstoque, seriePorTempo, somarPor } from "../../lib/painel";
import { createClient, usuarioAtual } from "../../lib/supabase/server";

export const metadata = { title: "Painel — Lojinha A&G" };

// o servidor roda em UTC; "hoje" precisa ser o dia de Brasília
const hojeBR = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

const FORMA = { a_vista: "À vista", cartao: "Cartão" };

// caixa (dinheiro), mesma conta do Resumos: recebido + capital + aportes − compras − despesas − saques − pró-labore − comissões pagas
const caixaAte = (r) =>
  r ? Number(r.recebido) + Number(r.capital_inicial) + Number(r.aportes) - Number(r.compras) - Number(r.despesas) - Number(r.saques) - Number(r.pro_labore) - Number(r.comissoes_pagas) : null;

// Painel analítico para tela grande: gerente e sócia (mesmo acesso do Resumos completo)
export default async function Painel({ searchParams }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const usuario = await usuarioAtual(supabase);
  if (!usuario?.gerente && usuario?.papel !== "socia") redirect("/resumos");

  const hoje = hojeBR();
  const p = PERIODOS_PAINEL[sp?.p] ? sp.p : "mes";
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp?.m ?? "") ? sp.m : hoje.slice(0, 7);
  const { de, ate, por } = periodoPainel(p, hoje, mes);
  // período anterior de mesmo tamanho, para a variação dos indicadores
  const dias = Math.round((new Date(`${ate}T12:00:00`) - new Date(`${de}T12:00:00`)) / 864e5) + 1;
  const deAnt = somarDias(de, -dias);
  const ateAnt = somarDias(de, -1);

  const camposVenda = "id, grupo_id, data, quantidade, preco_unit, lucro, pagamento, vendedor_id, produto_id, produtos(nome, categoria_id), perfis!vendas_vendedor_id_fkey(nome)";
  const [{ data: vendas }, { data: vendasAnt }, { data: parcelas }, { data: despesas }, { data: proLabore }, { data: acumulado }, { data: estoque }, { data: categorias }, { count: pedidosNovos }] =
    await Promise.all([
      supabase.from("vendas").select(camposVenda).gte("data", de).lte("data", ate).limit(10000),
      supabase.from("vendas").select("id, grupo_id, quantidade, preco_unit, lucro").gte("data", deAnt).lte("data", ateAnt).limit(10000),
      supabase.from("parcelas").select("comissao, comissao_socia").gte("vencimento", de).lte("vencimento", ate).limit(10000),
      supabase.from("despesas").select("valor").gte("data", de).lte("data", ate).limit(10000),
      supabase.from("lancamentos").select("valor").eq("tipo", "pro_labore").gte("data", de).lte("data", ate).limit(1000),
      supabase.rpc("resumo_acumulado", { ate }),
      supabase.from("estoque_atual").select("id, nome, unidade, custo, preco, saldo, ativo").limit(5000),
      supabase.from("categorias").select("id, nome"),
      supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "novo"),
    ]);

  const lista = vendas ?? [];
  const ind = indicadores({ vendas: lista, parcelas: parcelas ?? [], despesas: despesas ?? [], proLabore: (proLabore ?? []).reduce((s, l) => s + Number(l.valor), 0) });
  const ant = indicadores({ vendas: vendasAnt ?? [] });
  const nomeCategoria = new Map((categorias ?? []).map((c) => [c.id, c.nome]));
  const est = resumoEstoque(estoque ?? [], new Set(lista.map((v) => v.produto_id)));
  const enxuto = (e) => ({ id: e.id, nome: e.nome, unidade: e.unidade, saldo: Number(e.saldo), valor: Number(e.saldo) * Number(e.custo) });

  return (
    <PainelClient
      periodo={{ p, mes, de, ate, por, hoje }}
      indicadores={ind}
      anterior={{ receita: ant.receita, lucro: ant.lucro, nVendas: ant.nVendas, ticketMedio: ant.ticketMedio, margemBruta: ant.margemBruta }}
      caixa={caixaAte(acumulado?.[0])}
      pedidosNovos={pedidosNovos ?? 0}
      serie={seriePorTempo(lista, de, ate, por)}
      porCategoria={somarPor(
        lista,
        (v) => v.produtos?.categoria_id ?? "outros",
        (v) => nomeCategoria.get(v.produtos?.categoria_id) ?? "Outros",
      )}
      porVendedor={somarPor(
        lista,
        (v) => v.vendedor_id,
        (v) => v.perfis?.nome ?? "-",
      )}
      porProduto={somarPor(
        lista,
        (v) => v.produto_id,
        (v) => v.produtos?.nome ?? "-",
      ).slice(0, 10)}
      porPagamento={["a_vista", "cartao"].map((f) => ({ nome: FORMA[f], valor: lista.filter((v) => v.pagamento === f).reduce((s, v) => s + Number(v.quantidade) * Number(v.preco_unit), 0) }))}
      estoque={{ valorCusto: est.valorCusto, valorVenda: est.valorVenda, esgotados: est.esgotados.map(enxuto), parados: est.parados.slice(0, 10).map(enxuto), nParados: est.parados.length }}
    />
  );
}
