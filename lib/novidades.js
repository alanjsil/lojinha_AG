// Histórico de novidades mostrado ao abrir o app. Mais recente primeiro.
// Para anunciar algo: acrescente uma entrada NO TOPO com `versao` nova (a ordem é o que vale).
export const NOVIDADES = [
  {
    versao: "2026-10-14",
    titulo: "Novidades da Lojinha",
    itens: [
      "Loja online: o link do app agora abre uma vitrine para os clientes, com carrinho; o pedido chega aqui em Vendas (\"Pedidos da loja\") e no WhatsApp.",
      "Em Vendas, toque no pedido e em \"Lançar venda\": o formulário já vem com os itens do cliente.",
      "Produtos ganharam categoria, foto e descrição (Estoque › Categorias, só o gerente); a lista do Estoque fica agrupada por categoria.",
      "No computador, o app ganhou menu lateral e o Painel, com gráficos e indicadores.",
      "O app pode ser instalado no celular e mostra um aviso quando estiver sem internet.",
      "Clientes podem criar conta na loja para acompanhar o pedido (Recebido › Confirmado › Pronto › Entregue).",
      "Pedidos da loja têm botões para Confirmar e Marcar como pronto; o cliente com conta recebe aviso no celular.",
      "Em Vendas, \"Ativar avisos\" faz este aparelho tocar quando chegar pedido novo da loja.",
    ],
  },
  {
    versao: "2026-10-13",
    titulo: "Novidades da Lojinha",
    itens: [
      "Estoque ganhou o botão \"Ocultar zerados\" ao lado do título; o app lembra a sua escolha neste aparelho.",
      "A sócia agora vê o Resumos completo (despesas, lucro líquido, caixa e comparativo), só para consulta.",
    ],
  },
  {
    versao: "2026-10-12",
    titulo: "Novidades da Lojinha",
    itens: [
      "Agora dá para vender vários produtos na mesma venda: use \"+ Adicionar outro item\" na tela de venda.",
      "Na lista, os itens da mesma venda aparecem juntos num cartão só, com o total e o detalhe de cada um.",
      "A venda ganhou um campo de observação (opcional), que também pode ser editado depois.",
      "Cadastro e edição de produtos (custo e preço) agora ficam só com o gerente.",
    ],
  },
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
