import { brl, dataBR, qtd } from "./formato.js";

export const TABELAS_LOG = {
  vendas: "Vendas",
  compras: "Compras",
  despesas: "Despesas",
  lancamentos: "Lançamentos",
  produtos: "Produtos",
  contagens_estoque: "Contagens",
  categorias: "Categorias",
};

export const ACOES_LOG = { criou: "Criou", editou: "Editou", apagou: "Apagou", restaurou: "Restaurou" };

const CAMPOS = {
  data: "Data",
  quantidade: "Quantidade",
  preco_unit: "Preço",
  custo_unit: "Custo",
  pagamento: "Pagamento",
  parcelas: "Parcelas",
  tipo: "Tipo",
  descricao: "Descrição",
  valor: "Valor",
  fornecedor: "Fornecedor",
  nome: "Nome",
  quantidade_contada: "Contado",
  observacao: "Observação",
  obs: "Obs",
  unidade: "Unidade",
  custo: "Custo",
  preco: "Preço",
  ativo: "Ativo",
  ordem: "Ordem",
  categoria_id: "Categoria",
  foto_url: "Foto",
};

const DINHEIRO = new Set(["preco_unit", "custo_unit", "valor", "custo", "preco"]);

// colunas calculadas ou de controle: não interessam a quem lê o log
const IGNORADAS = new Set(["lucro", "comissao", "comissao_socia", "comissao_pct", "socia_pct", "created_at", "apagado_em", "apagado_por"]);

function formatarValor(campo, v) {
  if (v === null || v === undefined || v === "") return "–";
  if (typeof v === "boolean") return v ? "sim" : "não";
  if (DINHEIRO.has(campo)) return brl(v);
  if (campo === "quantidade") return qtd(v);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return dataBR(v, true);
  return String(v);
}

// linhas "Campo: antes → depois" de uma edição (só as colunas que mudaram)
export function mudancas(antes, depois) {
  const chaves = Object.keys(depois ?? {}).filter((k) => !IGNORADAS.has(k));
  return chaves.map((k) => `${CAMPOS[k] ?? k}: ${formatarValor(k, antes?.[k])} → ${formatarValor(k, depois[k])}`);
}

// resumo curto do registro (criou/apagou/restaurou trazem a linha inteira)
export function resumoRegistro(tabela, d, nomeProduto = () => "Produto") {
  if (!d) return "";
  const dt = d.data ? ` · ${dataBR(d.data)}` : "";
  switch (tabela) {
    case "vendas":
      return `${nomeProduto(d.produto_id)} · ${qtd(d.quantidade)} × ${brl(d.preco_unit)}${dt}${d.obs ? ` · Obs: ${d.obs}` : ""}`;
    case "compras":
      return `${nomeProduto(d.produto_id)} · ${qtd(d.quantidade)} × ${brl(d.custo_unit)}${dt}`;
    case "despesas":
      return `${d.tipo}${d.descricao ? ` (${d.descricao})` : ""} · ${brl(d.valor)}${dt}`;
    case "lancamentos":
      return `${String(d.tipo).replaceAll("_", " ")} · ${brl(d.valor)}${dt}`;
    case "produtos":
      return `${d.nome} · custo ${brl(d.custo)} · preço ${brl(d.preco)}`;
    case "contagens_estoque":
      return `${nomeProduto(d.produto_id)} · contado ${qtd(d.quantidade_contada)}${dt}`;
    case "categorias":
      return `${d.nome} · ordem ${d.ordem}`;
    default:
      return "";
  }
}

// ids cuja última entrada no log é "apagou" (a lista vem da mais nova para a mais antiga)
export function aindaApagados(entradas) {
  const ultima = new Map();
  for (const e of entradas) if (!ultima.has(e.registro_id)) ultima.set(e.registro_id, e.acao);
  return new Set([...ultima].filter(([, acao]) => acao === "apagou").map(([id]) => id));
}
