import { somarDias, somarMeses, ultimoDiaDoMes } from "./formato.js";

// Contas do Painel (PC). Mesmas regras do Resumos: lucro já desconta o custo fotografado na venda,
// comissão conta no vencimento da parcela, lucro líquido = lucro − comissões − despesas − pró-labore.

export const PERIODOS_PAINEL = { mes: "Mês", 30: "30 dias", 90: "90 dias", ano: "Ano" };

// [de, ate] e a granularidade do gráfico de evolução ("dia" ou "mes")
export function periodoPainel(p, hoje, mes) {
  if (p === "30") return { de: somarDias(hoje, -29), ate: hoje, por: "dia" };
  if (p === "90") return { de: somarDias(hoje, -89), ate: hoje, por: "dia" };
  if (p === "ano") return { de: `${hoje.slice(0, 4)}-01-01`, ate: hoje, por: "mes" };
  return { de: `${mes}-01`, ate: mes === hoje.slice(0, 7) ? hoje : ultimoDiaDoMes(mes), por: "dia" };
}

const MES_CURTO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesCurto = (ym) => `${MES_CURTO[Number(ym.slice(5, 7)) - 1]}/${ym.slice(0, 4)}`;

// base da variação dos KPIs: mês → mês anterior do dia 1 até o mesmo dia (mês fechado = mês anterior inteiro);
// ano → mesmas datas do ano passado; 30/90 dias → os N dias imediatamente antes
export function periodoAnterior(p, de, ate) {
  if (p === "mes") {
    const ant = somarMeses(de.slice(0, 7), -1);
    const fimAnt = ultimoDiaDoMes(ant);
    const fechado = ate === ultimoDiaDoMes(de.slice(0, 7));
    const dia = Math.min(Number(ate.slice(8)), Number(fimAnt.slice(8)));
    const ateAnt = fechado ? fimAnt : `${ant}-${String(dia).padStart(2, "0")}`;
    return { de: `${ant}-01`, ate: ateAnt, rotulo: fechado ? `vs. ${mesCurto(ant)}` : `vs. ${mesCurto(ant)} até dia ${Number(ateAnt.slice(8))}` };
  }
  if (p === "ano") {
    const ano = String(Number(de.slice(0, 4)) - 1);
    // 29/02 vira 28/02 no ano anterior
    const md = ate.slice(5) === "02-29" ? "02-28" : ate.slice(5);
    return { de: `${ano}-01-01`, ate: `${ano}-${md}`, rotulo: `vs. ${ano} até ${md.slice(3)}/${md.slice(0, 2)}` };
  }
  const dias = Math.round((new Date(`${ate}T12:00:00`) - new Date(`${de}T12:00:00`)) / 864e5) + 1;
  return { de: somarDias(de, -dias), ate: somarDias(de, -1), rotulo: `vs. ${dias} dias anteriores` };
}

// Contas a receber × cartão a pagar, mês a mês a partir de amanhã. receber: parcelas de venda que ainda vão vencer
// (valor, comissão e comissão da sócia embutidas); pagar: parcelas de despesa/compra no cartão que ainda vão vencer.
// saldo = caixa de hoje + recebido − comissões dessas parcelas − pago, acumulado mês a mês.
export function fluxoFuturo({ receber = [], pagar = [], caixaHoje = 0 }) {
  const meses = new Map();
  const mes = (venc) => {
    const k = venc.slice(0, 7);
    const m = meses.get(k) ?? { chave: k, receber: 0, comissao: 0, pagar: 0 };
    meses.set(k, m);
    return m;
  };
  for (const r of receber) {
    const m = mes(r.vencimento);
    m.receber += Number(r.valor);
    m.comissao += Number(r.comissao ?? 0) + Number(r.comissao_socia ?? 0);
  }
  for (const s of pagar) mes(s.vencimento).pagar += Number(s.valor);
  let saldo = Number(caixaHoje) || 0;
  const lista = [...meses.values()]
    .sort((a, b) => (a.chave < b.chave ? -1 : 1))
    .map((m) => {
      saldo += m.receber - m.comissao - m.pagar;
      return { ...m, saldo };
    });
  const soma = (campo) => lista.reduce((s, m) => s + m[campo], 0);
  return { meses: lista, receber: soma("receber"), comissao: soma("comissao"), pagar: soma("pagar"), saldoFinal: saldo };
}

const receitaDe = (v) => Number(v.quantidade) * Number(v.preco_unit);

// uma vez por venda: itens do mesmo grupo_id contam como uma venda só
export function contarVendas(vendas) {
  return new Set(vendas.map((v, i) => v.grupo_id ?? v.id ?? `i${i}`)).size;
}

export function indicadores({ vendas, parcelas = [], despesas = [], proLabore = 0 }) {
  const receita = vendas.reduce((s, v) => s + receitaDe(v), 0);
  const lucro = vendas.reduce((s, v) => s + Number(v.lucro), 0);
  const comissoes = parcelas.reduce((s, p) => s + Number(p.comissao) + Number(p.comissao_socia ?? 0), 0);
  const totalDespesas = despesas.reduce((s, d) => s + Number(d.valor), 0);
  const n = contarVendas(vendas);
  const liquido = lucro - comissoes - totalDespesas - proLabore;
  return {
    receita,
    custo: receita - lucro,
    lucro,
    comissoes,
    despesas: totalDespesas,
    proLabore,
    liquido,
    nVendas: n,
    ticketMedio: n > 0 ? receita / n : 0,
    margemBruta: receita > 0 ? lucro / receita : 0,
    margemLiquida: receita > 0 ? liquido / receita : 0,
  };
}

// todas as chaves do período, para o gráfico não pular dias/meses sem venda
export function chavesPeriodo(de, ate, por) {
  const chaves = [];
  if (por === "mes") {
    for (let m = de.slice(0, 7); m <= ate.slice(0, 7); m = somarMeses(m, 1)) chaves.push(m);
  } else {
    for (let d = de; d <= ate; d = somarDias(d, 1)) chaves.push(d);
  }
  return chaves;
}

// receita e lucro por dia (ou mês) do período
export function seriePorTempo(vendas, de, ate, por = "dia") {
  const mapa = new Map(chavesPeriodo(de, ate, por).map((k) => [k, { chave: k, receita: 0, lucro: 0 }]));
  for (const v of vendas) {
    const ponto = mapa.get(por === "mes" ? v.data.slice(0, 7) : v.data);
    if (!ponto) continue;
    ponto.receita += receitaDe(v);
    ponto.lucro += Number(v.lucro);
  }
  return [...mapa.values()];
}

// soma receita/lucro/quantidade por uma chave (vendedor, produto, categoria, pagamento), maior receita primeiro
export function somarPor(vendas, chaveDe, nomeDe) {
  const mapa = new Map();
  for (const v of vendas) {
    const k = chaveDe(v) ?? "—";
    const g = mapa.get(k) ?? { chave: k, nome: nomeDe(v), receita: 0, lucro: 0, quantidade: 0, itens: [] };
    g.receita += receitaDe(v);
    g.lucro += Number(v.lucro);
    g.quantidade += Number(v.quantidade);
    g.itens.push(v);
    mapa.set(k, g);
  }
  return [...mapa.values()].map(({ itens, ...g }) => ({ ...g, vendas: contarVendas(itens) })).sort((a, b) => b.receita - a.receita);
}

// Estoque: valor parado a custo e a preço, esgotados (ativos com saldo ≤ 0) e parados (com saldo e sem venda no período)
export function resumoEstoque(estoque, vendidosNoPeriodo) {
  const ativos = estoque.filter((e) => e.ativo);
  const comSaldo = ativos.filter((e) => Number(e.saldo) > 0);
  return {
    valorCusto: comSaldo.reduce((s, e) => s + Number(e.saldo) * Number(e.custo), 0),
    valorVenda: comSaldo.reduce((s, e) => s + Number(e.saldo) * Number(e.preco), 0),
    esgotados: ativos.filter((e) => Number(e.saldo) <= 0),
    parados: comSaldo.filter((e) => !vendidosNoPeriodo.has(e.id)).sort((a, b) => Number(b.saldo) * Number(b.custo) - Number(a.saldo) * Number(a.custo)),
  };
}
