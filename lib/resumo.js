// Contas do Resumos (mês). Mesmas bases do Painel: receita, custo e lucro na data da venda;
// comissão no vencimento da parcela; despesas na data do gasto.

// meta do sócio: sobrar (antes do pró-labore) 20% do lucro bruto
export const META_SOBRA = 0.2;

// ordem = ordem do select em Saídas (gasolina, a mais lançada, primeiro)
export const TIPOS_DESPESA = {
  gasolina: "Gasolina",
  alimentacao: "Alimentação",
  pedagio: "Pedágio",
  outros: "Outros",
  aluguel: "Aluguel",
  agua: "Água",
  luz: "Luz",
  internet: "Internet",
};

// motivo da diferença na contagem de estoque (mig. 039)
export const MOTIVOS_CONTAGEM = { perda: "Perda", quebra: "Quebra", erro: "Erro de lançamento", outro: "Outro" };

// com diferença, a contagem precisa dizer o porquê; sem diferença, não tem motivo
export function motivoDaContagem(diferenca, motivo) {
  if (Math.abs(Number(diferenca) || 0) < 0.005) return { motivo: null };
  if (!MOTIVOS_CONTAGEM[motivo]) return { erro: "Diga o motivo da diferença (perda, quebra, erro ou outro)." };
  return { motivo };
}

// receita, lucro (bruto), comissões, despesas e pró-labore do período → margens, equilíbrio e meta
export function indicadoresResumo({ receita, lucro, comissoes, despesas, proLabore = 0 }) {
  const liquido = lucro - comissoes - despesas - proLabore;
  const por = (v) => (receita > 0 ? v / receita : 0);
  const margemBruta = por(lucro);
  // contribuição = o que cada real vendido deixa depois da mercadoria e da comissão, para pagar as despesas
  const margemContrib = por(lucro - comissoes);
  const margemMinima = por(despesas);
  const pontoEquilibrio = margemContrib > 0 ? despesas / margemContrib : null;
  // meta: vendas × margem de contribuição − despesas = META × vendas × margem bruta
  const denom = margemContrib - META_SOBRA * margemBruta;
  const metaFaturar = denom > 0 ? despesas / denom : null;
  return {
    liquido,
    margemBruta,
    margemContrib,
    margemLiquida: por(liquido),
    margemMinima,
    // a margem de contribuição (não a bruta) é que precisa cobrir as despesas
    minimaOk: margemContrib >= margemMinima,
    pontoEquilibrio,
    metaFaturar,
    pctMeta: metaFaturar > 0 ? receita / metaFaturar : null,
    sobra: lucro - comissoes - despesas,
    sobraMeta: META_SOBRA * lucro,
  };
}

// despesas somadas por tipo, maior primeiro
export function despesasPorTipo(despesas) {
  const mapa = new Map();
  for (const d of despesas) mapa.set(d.tipo, (mapa.get(d.tipo) ?? 0) + Number(d.valor));
  return [...mapa]
    .map(([tipo, valor]) => ({ tipo, nome: TIPOS_DESPESA[tipo] ?? tipo, valor }))
    .sort((a, b) => b.valor - a.valor);
}

// contagens com falta (diferença < 0), por motivo, em quantidade e valor ao custo atual do produto (aproximado:
// o custo da contagem não é fotografado). custoDe(produto_id) → custo atual.
export function perdasPorMotivo(contagens, custoDe) {
  const mapa = new Map();
  for (const c of contagens) {
    const d = Number(c.diferenca);
    if (!(d < 0)) continue;
    const chave = c.motivo ?? "sem_motivo";
    const g = mapa.get(chave) ?? { motivo: chave, nome: MOTIVOS_CONTAGEM[chave] ?? "Sem motivo (antigas)", quantidade: 0, valor: 0 };
    g.quantidade += -d;
    g.valor += -d * (Number(custoDe(c.produto_id)) || 0);
    mapa.set(chave, g);
  }
  const itens = [...mapa.values()].sort((a, b) => b.valor - a.valor);
  return { itens, total: itens.reduce((s, i) => s + i.valor, 0) };
}
