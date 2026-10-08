// Histórico de novidades mostrado ao abrir o app. Mais recente primeiro.
// Para anunciar algo: acrescente uma entrada NO TOPO com `versao` nova (a ordem é o que vale).
export const NOVIDADES = [
  {
    versao: "2026-10-08",
    titulo: "Novidades da Lojinha",
    itens: [
      "Vendas no cartão agora podem ser parceladas em até 12x, direto no app.",
      "A comissão acompanha as parcelas: cada uma carrega a sua fatia e entra no mês em que vence.",
      "Visual novo: a Lojinha A&G ganhou um logo renovado.",
      "Resumos agora tem a seção Repasses, com o que foi recebido, entregue e ainda pendente.",
      "O ranking de mais vendidos pode ser recolhido para deixar a tela mais limpa.",
    ],
  },
];

// Entradas que o usuário ainda não viu: tudo acima da última versão vista.
// Sem versão vista (primeiro acesso ou storage vazio) mostra só a mais recente.
export function novidadesPendentes(lista, vista) {
  if (!lista.length) return [];
  const i = lista.findIndex((n) => n.versao === vista);
  if (i === -1) return [lista[0]];
  return lista.slice(0, i);
}
