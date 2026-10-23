// Parcelas de venda no cartão: vencem todo dia 8, a partir do mês seguinte à venda
// (23/10 em 2x → 08/11 e 08/12). Espelha vendas_gerar_parcelas() do banco (mig. 035).
export const DIA_VENCIMENTO = 8;

// 1ª parcela padrão: dia 8 do mês seguinte à data da venda ("AAAA-MM-DD")
export function primeiroVencimentoVenda(data) {
  const [a, m] = data.split("-").map(Number);
  const t = a * 12 + m; // índice (base 0) do mês seguinte
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-${String(DIA_VENCIMENTO).padStart(2, "0")}`;
}
