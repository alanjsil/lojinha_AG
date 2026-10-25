import { redirect } from "next/navigation";
import PainelClient from "../../components/PainelClient";
import { todas } from "../../lib/paginar";
import { fluxoFuturo, indicadores, periodoAnterior, periodoPainel, PERIODOS_PAINEL, resumoEstoque, seriePorTempo, somarPor } from "../../lib/painel";
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
  // base da variação dos indicadores (mês anterior até o mesmo dia, ano passado, N dias antes)
  const ant = periodoAnterior(p, de, ate);

  const camposVenda = "id, grupo_id, data, quantidade, preco_unit, lucro, pagamento, vendedor_id, produto_id, produtos(nome, categoria_id), perfis!vendas_vendedor_id_fkey(nome)";
  // todas() busca página a página: o PostgREST corta cada resposta em 1000 linhas
  const [
    { data: vendas },
    { data: vendasAnt },
    { data: parcelas },
    { data: despesas },
    { data: proLabore },
    { data: acumulado },
    { data: acumuladoHoje },
    { data: estoque },
    { data: categorias },
    { count: pedidosNovos },
    { data: receber },
    { data: pagar },
  ] = await Promise.all([
    todas((a, b) => supabase.from("vendas").select(camposVenda).gte("data", de).lte("data", ate).order("id").range(a, b)),
    todas((a, b) => supabase.from("vendas").select("id, grupo_id, quantidade, preco_unit, lucro").gte("data", ant.de).lte("data", ant.ate).order("id").range(a, b)),
    todas((a, b) => supabase.from("parcelas").select("id, comissao, comissao_socia").gte("vencimento", de).lte("vencimento", ate).order("id").range(a, b)),
    todas((a, b) => supabase.from("despesas").select("id, valor").gte("data", de).lte("data", ate).order("id").range(a, b)),
    todas((a, b) => supabase.from("lancamentos").select("id, valor").eq("tipo", "pro_labore").gte("data", de).lte("data", ate).order("id").range(a, b)),
    supabase.rpc("resumo_acumulado", { ate }),
    // a projeção do A receber parte do caixa de hoje, seja qual for o período escolhido
    ate === hoje ? Promise.resolve({ data: null }) : supabase.rpc("resumo_acumulado", { ate: hoje }),
    todas((a, b) => supabase.from("estoque_atual").select("id, nome, unidade, custo, preco, saldo, ativo").order("id").range(a, b)),
    supabase.from("categorias").select("id, nome"),
    supabase.from("pedidos").select("id", { count: "exact", head: true }).eq("status", "novo"),
    // o que ainda vai entrar (parcelas de venda) e sair (faturas de despesa/compra no cartão) a partir de amanhã
    todas((a, b) => supabase.from("parcelas").select("id, vencimento, valor, comissao, comissao_socia").gt("vencimento", hoje).order("id").range(a, b)),
    todas((a, b) => supabase.from("saidas_parcelas").select("id, vencimento, valor").gt("vencimento", hoje).order("id").range(a, b)),
  ]);

  const lista = vendas ?? [];
  const ind = indicadores({ vendas: lista, parcelas: parcelas ?? [], despesas: despesas ?? [], proLabore: (proLabore ?? []).reduce((s, l) => s + Number(l.valor), 0) });
  const anterior = indicadores({ vendas: vendasAnt ?? [] });
  const nomeCategoria = new Map((categorias ?? []).map((c) => [c.id, c.nome]));
  const est = resumoEstoque(estoque ?? [], new Set(lista.map((v) => v.produto_id)));
  const enxuto = (e) => ({ id: e.id, nome: e.nome, unidade: e.unidade, saldo: Number(e.saldo), valor: Number(e.saldo) * Number(e.custo) });
  const caixaHoje = caixaAte((ate === hoje ? acumulado : acumuladoHoje)?.[0]);

  return (
    <PainelClient
      periodo={{ p, mes, de, ate, por, hoje }}
      indicadores={ind}
      anterior={{ receita: anterior.receita, lucro: anterior.lucro, nVendas: anterior.nVendas, ticketMedio: anterior.ticketMedio, margemBruta: anterior.margemBruta, rotulo: ant.rotulo }}
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
      tabelaProdutos={somarPor(
        lista,
        (v) => v.produto_id,
        (v) => v.produtos?.nome ?? "-",
      )
        .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
        .map((g) => ({ chave: g.chave, nome: g.nome, quantidade: g.quantidade, custo: g.receita - g.lucro, receita: g.receita, lucro: g.lucro }))}
      porPagamento={["a_vista", "cartao"].map((f) => ({ nome: FORMA[f], valor: lista.filter((v) => v.pagamento === f).reduce((s, v) => s + Number(v.quantidade) * Number(v.preco_unit), 0) }))}
      estoque={{ valorCusto: est.valorCusto, valorVenda: est.valorVenda, esgotados: est.esgotados.map(enxuto), parados: est.parados.slice(0, 10).map(enxuto), nParados: est.parados.length }}
      futuro={{ caixaHoje, ...fluxoFuturo({ receber: receber ?? [], pagar: pagar ?? [], caixaHoje: caixaHoje ?? 0 }) }}
    />
  );
}
