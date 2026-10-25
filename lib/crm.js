import { chavesPeriodo } from "./painel.js";
import { soDigitos, telefoneValido } from "./pedido.js";

// Contas do CRM (PC). A compra do cliente vem sempre da venda: pedido da loja entregue já virou venda
// com o cliente herdado (mig. 038), então pedido não conta como compra (não duplica).

// cliente digitado na venda: os dois campos são opcionais; o que vier precisa ser válido
export function clienteDaVenda({ nome, telefone } = {}) {
  const n = String(nome ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const t = soDigitos(telefone);
  if (n && (n.length < 2 || n.length > 80)) return { erro: "Nome do cliente: de 2 a 80 letras." };
  if (t && !telefoneValido(t)) return { erro: "WhatsApp do cliente inválido: DDD + número." };
  return { cliente_nome: n || null, cliente_telefone: t || null };
}

// "5554988881234" e "54988881234" são o mesmo número
export function chaveTelefone(t) {
  const d = soDigitos(t);
  return d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
}

const chaveNome = (n) =>
  String(n ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const receitaDe = (v) => Number(v.quantidade) * Number(v.preco_unit);

// identidade: conta do cliente → WhatsApp → nome. Um WhatsApp já visto numa venda com conta vai para a conta.
function identificador(vendas) {
  const contaDoTelefone = new Map();
  for (const v of vendas) if (v.cliente_id && v.cliente_telefone) contaDoTelefone.set(chaveTelefone(v.cliente_telefone), v.cliente_id);
  return (v) => {
    if (v.cliente_id) return `c:${v.cliente_id}`;
    const tel = v.cliente_telefone ? chaveTelefone(v.cliente_telefone) : "";
    if (tel) return contaDoTelefone.has(tel) ? `c:${contaDoTelefone.get(tel)}` : `t:${tel}`;
    const nome = chaveNome(v.cliente_nome);
    return nome ? `n:${nome}` : null;
  };
}

// uma linha por cliente: total, nº de compras (grupo_id = uma compra), ticket, 1ª/última compra e produtos
export function clientes(vendas) {
  const chaveDe = identificador(vendas);
  const mapa = new Map();
  // da mais antiga para a mais nova: o nome/telefone que fica é o mais recente
  const ordenadas = [...vendas].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  for (const v of ordenadas) {
    const chave = chaveDe(v);
    if (!chave) continue;
    const c = mapa.get(chave) ?? { chave, nome: null, telefone: null, conta: false, total: 0, lucro: 0, compras: new Map(), produtos: new Map(), primeira: v.data, ultima: v.data };
    if (v.cliente_nome) c.nome = v.cliente_nome;
    if (v.cliente_telefone) c.telefone = chaveTelefone(v.cliente_telefone);
    if (v.cliente_id) c.conta = true;
    c.total += receitaDe(v);
    c.lucro += Number(v.lucro ?? 0);
    const compra = c.compras.get(v.grupo_id ?? v.id) ?? { data: v.data, valor: 0 };
    compra.valor += receitaDe(v);
    c.compras.set(v.grupo_id ?? v.id, compra);
    const nomeProduto = v.produtos?.nome ?? "-";
    const p = c.produtos.get(nomeProduto) ?? { nome: nomeProduto, quantidade: 0, receita: 0 };
    p.quantidade += Number(v.quantidade);
    p.receita += receitaDe(v);
    c.produtos.set(nomeProduto, p);
    c.ultima = v.data;
    mapa.set(chave, c);
  }
  return [...mapa.values()]
    .map(({ compras, produtos, ...c }) => ({
      ...c,
      nome: c.nome ?? "Sem nome",
      datas: [...compras.values()].map((x) => x.data).sort(),
      // [{ data, valor }] por compra, da mais antiga para a mais nova
      historico: [...compras.values()].sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0)),
      nCompras: compras.size,
      ticket: compras.size ? c.total / compras.size : 0,
      produtos: [...produtos.values()].sort((a, b) => b.receita - a.receita),
    }))
    .sort((a, b) => b.total - a.total);
}

// quanto o cliente gastou (e em quantas compras) entre de e ate
export function noPeriodo(c, de, ate) {
  const doPeriodo = c.historico.filter((x) => x.data >= de && x.data <= ate);
  return { compras: doPeriodo.length, gasto: doPeriodo.reduce((s, x) => s + x.valor, 0) };
}

// no período: quem comprou (ativos), quem comprou pela 1ª vez (novos) e quem já tinha comprado antes (recorrentes)
export function recorrencia(lista, de, ate) {
  const ativos = lista.filter((c) => c.datas.some((d) => d >= de && d <= ate));
  const novos = ativos.filter((c) => c.primeira >= de);
  return { ativos: ativos.length, novos: novos.length, recorrentes: ativos.length - novos.length };
}

const diasEntre = (a, b) => Math.round((new Date(`${b}T12:00:00`) - new Date(`${a}T12:00:00`)) / 864e5);

// clientes sem comprar há 30–59, 60–89 e 90+ dias (os que mais gastaram primeiro)
export function sumidos(lista, hoje) {
  const faixas = { d30: [], d60: [], d90: [] };
  for (const c of lista) {
    const dias = diasEntre(c.ultima, hoje);
    const item = { ...c, dias };
    if (dias >= 90) faixas.d90.push(item);
    else if (dias >= 60) faixas.d60.push(item);
    else if (dias >= 30) faixas.d30.push(item);
  }
  return faixas;
}

// pedidos da loja criados no período (pedido.dia = data de Brasília do criado_em): por situação,
// conversão (entregues ÷ todos), cancelados e tempo médio do pedido até a entrega (horas)
export function funil(pedidos, de, ate) {
  const doPeriodo = pedidos.filter((p) => p.dia >= de && p.dia <= ate);
  const por = { novo: 0, confirmado: 0, pronto: 0, entregue: 0, cancelado: 0 };
  for (const p of doPeriodo) if (p.status in por) por[p.status] += 1;
  const entregues = doPeriodo.filter((p) => p.status === "entregue" && p.status_em);
  const horas = entregues.map((p) => (new Date(p.status_em) - new Date(p.criado_em)) / 36e5).filter((h) => h >= 0);
  const total = doPeriodo.length;
  return {
    total,
    por,
    abertos: por.novo + por.confirmado + por.pronto,
    conversao: total ? por.entregue / total : null,
    cancelamento: total ? por.cancelado / total : null,
    horasAteEntregar: horas.length ? horas.reduce((s, h) => s + h, 0) / horas.length : null,
    valorEntregue: entregues.reduce((s, p) => s + Number(p.total), 0),
  };
}

// pedidos recebidos e entregues por dia (ou mês) do período, para o gráfico
export function seriePedidos(pedidos, de, ate, por = "dia") {
  const mapa = new Map(chavesPeriodo(de, ate, por).map((k) => [k, { chave: k, recebidos: 0, entregues: 0 }]));
  for (const p of pedidos) {
    const ponto = mapa.get(por === "mes" ? p.dia.slice(0, 7) : p.dia);
    if (!ponto) continue;
    ponto.recebidos += 1;
    if (p.status === "entregue") ponto.entregues += 1;
  }
  return [...mapa.values()];
}
