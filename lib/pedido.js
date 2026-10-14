import { brl, qtd } from "./formato.js";

// Carrinho da vitrine: { [produtoId]: quantidade }. Guardado no aparelho do cliente.
export const MAX_POR_ITEM = 99;
export const MAX_ITENS = 30;

// soma +1/−1 (ou define) respeitando 0..MAX_POR_ITEM; zero tira o produto do carrinho
export function mudarQuantidade(carrinho, produtoId, quantidade) {
  const q = Math.max(0, Math.min(MAX_POR_ITEM, Math.trunc(quantidade) || 0));
  const novo = { ...carrinho };
  if (q === 0) delete novo[produtoId];
  else if (!(produtoId in novo) && Object.keys(novo).length >= MAX_ITENS) return carrinho;
  else novo[produtoId] = q;
  return novo;
}

// tira do carrinho o que saiu da vitrine ou esgotou desde a última visita
export function limparCarrinho(carrinho, produtos) {
  const disponiveis = new Set(produtos.filter((p) => !p.esgotado).map((p) => p.id));
  const limpo = {};
  for (const [id, q] of Object.entries(carrinho ?? {})) {
    const n = Math.trunc(Number(q));
    if (disponiveis.has(id) && n >= 1) limpo[id] = Math.min(n, MAX_POR_ITEM);
  }
  return limpo;
}

// linhas do carrinho com nome e preço da vitrine, mais os totais
export function resumoCarrinho(carrinho, produtos) {
  const porId = new Map(produtos.map((p) => [p.id, p]));
  const itens = Object.entries(carrinho)
    .filter(([id]) => porId.has(id))
    .map(([id, quantidade]) => {
      const p = porId.get(id);
      return { produto_id: id, nome: p.nome, preco: Number(p.preco), quantidade, subtotal: quantidade * Number(p.preco) };
    });
  return {
    itens,
    quantidade: itens.reduce((s, i) => s + i.quantidade, 0),
    total: itens.reduce((s, i) => s + i.subtotal, 0),
  };
}

export const soDigitos = (t) => String(t ?? "").replace(/\D/g, "");

// celular/fixo com DDD (10–11 dígitos), aceitando +55 na frente
export function telefoneValido(t) {
  const d = soDigitos(t);
  return d.length >= 10 && d.length <= 13;
}

// Texto que vai para o WhatsApp da loja; usa os itens e o total que o banco gravou
export function mensagemPedido({ numero, nome, telefone, obs, itens, total }) {
  const linhas = [
    `*Pedido nº ${numero}* — Lojinha A&G`,
    "",
    ...itens.map((i) => `• ${qtd(i.quantidade)} × ${i.nome} — ${brl(i.quantidade * Number(i.preco))}`),
    "",
    `*Total: ${brl(total)}*`,
    "",
    `Nome: ${nome}`,
    `Telefone: ${telefone}`,
  ];
  if (obs?.trim()) linhas.push(`Obs.: ${obs.trim()}`);
  return linhas.join("\n");
}

// wa.me exige o número só com dígitos e com o código do país; sem número configurado, não há link
export function linkWhatsApp(numeroLoja, texto) {
  let d = soDigitos(numeroLoja);
  if (!d) return null;
  if (d.length <= 11) d = `55${d}`;
  return `https://wa.me/${d}?text=${encodeURIComponent(texto)}`;
}
