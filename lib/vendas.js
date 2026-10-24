// Quem pode editar ou excluir uma venda. Quem realmente barra é a policy do banco (pode_mexer_venda);
// esta função espelha a regra para dar a mensagem certa e esconder os botões que não valem.
//   gerente → qualquer venda, a qualquer momento
//   vendedor e sócia → só a própria, até 48 h depois de lançada (conta o created_at, não a data da venda,
//   que pode ser retroativa); a sócia não ganha poder de gerente
export const JANELA_VENDA_HORAS = 48;
const HORA_MS = 60 * 60 * 1000;

// devolve o motivo da recusa, ou null quando pode
export function motivoSemAcessoVenda({ papel, usuarioId, vendedorId, criadaEm, agora = new Date() }) {
  if (papel === "gerente") return null;
  if (papel !== "vendedor" && papel !== "socia") return "Sem acesso.";
  if (!usuarioId || usuarioId !== vendedorId) return "Só quem lançou a venda (ou o gerente) pode mudá-la.";
  const lancada = new Date(criadaEm).getTime();
  if (!Number.isFinite(lancada) || agora.getTime() - lancada >= JANELA_VENDA_HORAS * HORA_MS) {
    return `Já passaram ${JANELA_VENDA_HORAS} horas do lançamento: só o gerente muda esta venda.`;
  }
  return null;
}

export const podeMexerNaVenda = (dados) => motivoSemAcessoVenda(dados) === null;
