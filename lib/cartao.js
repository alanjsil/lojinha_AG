// Despesa/compra no cartão: o lucro conta na data do gasto (competência) e o caixa no vencimento
// de cada parcela da fatura. Espelha vencimento_fatura() e saidas_gerar_parcelas() do banco (mig. 034),
// para o formulário mostrar quando a 1ª parcela vence.

// "AAAA-MM-DD" + n meses, com o dia já definido (1–28, então sempre existe)
function mesMais(ano, mes, n, dia) {
  const t = ano * 12 + (mes - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

// gasto a partir do dia de fechamento cai na fatura seguinte; a fatura vence no mesmo mês do fechamento
// se o vencimento é depois dele (fecha 3, vence 10), senão no mês seguinte (fecha 28, vence 10)
export function vencimentoFatura(data, fechamento, vencimento) {
  const [a, m, d] = data.split("-").map(Number);
  const meses = (d >= fechamento ? 1 : 0) + (vencimento > fechamento ? 0 : 1);
  return mesMais(a, m, meses, vencimento);
}

// 1ª saída de caixa: à vista (sem cartão) é a própria data
export function primeiroVencimento(data, cartao) {
  return cartao ? vencimentoFatura(data, cartao.dia_fechamento, cartao.dia_vencimento) : data;
}

// parcelas mensais a partir do 1º vencimento; a última leva a sobra do arredondamento
export function parcelasSaida(valor, n, primeiro) {
  const total = Math.round(Number(valor) * 100);
  const parte = Math.round(total / n);
  const [a, m, d] = primeiro.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => ({
    numero: i + 1,
    vencimento: i === 0 ? primeiro : mesMais(a, m, i, d),
    valor: (i === n - 1 ? total - parte * (n - 1) : parte) / 100,
  }));
}
