import { brl, qtd } from "./formato.js";

// Carrinho da vitrine: { [produtoId]: quantidade }. Guardado no aparelho do cliente.
export const MAX_POR_ITEM = 99;
export const MAX_ITENS = 30;

// quanto dá para pedir de um produto: o que restar (a vitrine só informa quando são poucas) ou o máximo geral
export function limiteDe(produto) {
  const restam = Number(produto?.restam);
  return Number.isFinite(restam) && produto?.restam != null ? Math.max(0, Math.min(MAX_POR_ITEM, Math.trunc(restam))) : MAX_POR_ITEM;
}

// soma +1/−1 (ou define) respeitando 0..maximo; zero tira o produto do carrinho
export function mudarQuantidade(carrinho, produtoId, quantidade, maximo = MAX_POR_ITEM) {
  const q = Math.max(0, Math.min(MAX_POR_ITEM, maximo, Math.trunc(quantidade) || 0));
  const novo = { ...carrinho };
  if (q === 0) delete novo[produtoId];
  else if (!(produtoId in novo) && Object.keys(novo).length >= MAX_ITENS) return carrinho;
  else novo[produtoId] = q;
  return novo;
}

// tira do carrinho o que saiu da vitrine ou esgotou desde a última visita e reduz ao que ainda resta
export function limparCarrinho(carrinho, produtos) {
  const limites = new Map(produtos.filter((p) => !p.esgotado).map((p) => [p.id, limiteDe(p)]));
  const limpo = {};
  for (const [id, q] of Object.entries(carrinho ?? {})) {
    const n = Math.min(Math.trunc(Number(q)), limites.get(id) ?? 0);
    if (n >= 1) limpo[id] = n;
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

// ---------- Andamento do pedido (mig. 031) ----------
// novo → confirmado → pronto → entregue; cancelado a qualquer momento antes de entregue (e pode reabrir)
export const STATUS_PEDIDO = { novo: "Recebido", confirmado: "Confirmado", pronto: "Pronto", entregue: "Entregue", cancelado: "Cancelado" };
export const ETAPAS = ["novo", "confirmado", "pronto", "entregue"];
export const ABERTOS = ["novo", "confirmado", "pronto"];

// próximo passo (botão principal do vendedor); null quando não há
export function proximoStatus(status) {
  const i = ETAPAS.indexOf(status);
  return i >= 0 && i < ETAPAS.length - 1 ? ETAPAS[i + 1] : null;
}

// só anda para a frente; cancela o que ainda está aberto; reabre o cancelado
export function mudancaValida(de, para) {
  if (para === "cancelado") return ABERTOS.includes(de);
  if (de === "cancelado") return para === "novo";
  const i = ETAPAS.indexOf(de);
  const j = ETAPAS.indexOf(para);
  return i >= 0 && j > i;
}

// texto do aviso (push) para o cliente quando o pedido muda
export function avisoStatus(numero, status) {
  const corpo = {
    confirmado: "A loja confirmou o seu pedido e já está separando.",
    pronto: "Seu pedido está pronto! Combine a retirada ou a entrega pelo WhatsApp.",
    entregue: "Pedido entregue. Obrigado pela compra!",
    cancelado: "Seu pedido foi cancelado. Chame a loja no WhatsApp se tiver dúvida.",
    novo: "Seu pedido foi reaberto pela loja.",
  }[status];
  return { titulo: `Pedido nº ${numero}: ${STATUS_PEDIDO[status].toLowerCase()}`, corpo };
}

// "54988881234" → "(54) 98888-1234" (com 55 na frente, tira o país)
export function formatarTelefone(t) {
  let d = soDigitos(t);
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}
