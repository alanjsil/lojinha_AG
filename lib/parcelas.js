import { brl, dataBR } from "./formato.js";
import { JANELA_VENDA_HORAS } from "./vendas.js";

// Parcelas de venda no cartão: vencem todo dia 8, a partir do mês seguinte à venda
// (23/10 em 2x → 08/11 e 08/12). Espelha vendas_gerar_parcelas() do banco (mig. 035).
export const DIA_VENCIMENTO = 8;

// 1ª parcela padrão: dia 8 do mês seguinte à data da venda ("AAAA-MM-DD")
export function primeiroVencimentoVenda(data) {
  const [a, m] = data.split("-").map(Number);
  const t = a * 12 + m; // índice (base 0) do mês seguinte
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-${String(DIA_VENCIMENTO).padStart(2, "0")}`;
}

// ---------- Baixa de parcelas (mig. 042) ----------
// Parcela de cartão só entra no caixa (e a comissão dela só cai) em `recebido_em`, a data da baixa.
// Sem baixa, é "aberta" até o vencimento e "atrasada" depois dele. À vista nasce recebida na data da venda.

// Quem mexe na baixa (mig. 043). Quem realmente barra é receber_parcelas() no banco; aqui é para mensagem e botões.
//   gerente → qualquer venda, a qualquer momento
//   vendedor e sócia → só a própria venda; desfazem só a baixa que eles deram, até 48 h depois
export function podeDarBaixa({ papel, usuarioId, vendedorId }) {
  if (papel === "gerente") return true;
  return (papel === "vendedor" || papel === "socia") && Boolean(usuarioId) && usuarioId === vendedorId;
}

// devolve o motivo da recusa, ou null quando pode. meta = { por, em } de vendas.recebimentos_meta (sem meta: histórico da 042)
export function motivoSemDesfazer({ papel, usuarioId, vendedorId, meta, agora = new Date() }) {
  if (papel === "gerente") return null;
  if (!podeDarBaixa({ papel, usuarioId, vendedorId })) return "Só quem lançou a venda (ou o gerente) mexe nas parcelas dela.";
  const dada = new Date(meta?.em ?? NaN).getTime();
  if (meta?.por !== usuarioId || !Number.isFinite(dada) || agora.getTime() - dada >= JANELA_VENDA_HORAS * 3600000) {
    return `Você só desfaz a baixa que você deu, até ${JANELA_VENDA_HORAS} horas depois. Peça ao gerente.`;
  }
  return null;
}

// marca o que este usuário pode fazer em cada compra e tira autoria e horário, que o navegador não precisa receber
export function comPermissoes(compras, { papel, usuarioId, agora = new Date() }) {
  return compras.map(({ vendedorId, parcelas, ...c }) => ({
    ...c,
    podeBaixar: podeDarBaixa({ papel, usuarioId, vendedorId }),
    parcelas: parcelas.map((p) => ({
      ...p,
      podeDesfazer: p.recebida && p.itens.every((i) => motivoSemDesfazer({ papel, usuarioId, vendedorId, meta: i.meta, agora }) === null),
      itens: p.itens.map(({ meta: _meta, ...i }) => i),
    })),
  }));
}

const dia = (iso) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 864e5;

// recebida: dias = distância até o vencimento (antecipada antes dele, emAtraso depois); aberta: dias até vencer; atrasada: dias vencida
export function situacaoParcela({ vencimento, recebido_em }, hoje) {
  if (recebido_em) {
    const d = dia(vencimento) - dia(recebido_em);
    return { tipo: "recebida", dias: Math.abs(d), antecipada: d > 0, emAtraso: d < 0 };
  }
  const d = dia(hoje) - dia(vencimento);
  return d > 0 ? { tipo: "atrasada", dias: d } : { tipo: "aberta", dias: Math.abs(d) };
}

// Parcelas que contam num período (comissão do Resumos/Painel): o que foi recebido nele. Período futuro é projeção,
// então vale o que ainda não foi recebido e vence nele. `q` é a consulta do Supabase sobre `parcelas`.
export function filtrarPorCaixa(q, de, ate, hoje) {
  if (de > hoje) return q.is("recebido_em", null).gte("vencimento", de).lte("vencimento", ate);
  return q.gte("recebido_em", de).lte("recebido_em", ate);
}

// mesma regra da função receber_parcelas() do banco, para avisar antes de enviar; null = válida
export function dataRecebimentoValida(data, dataVenda, hoje) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data ?? "")) return "Informe a data do recebimento.";
  if (data > hoje) return "A data do recebimento não pode ser no futuro.";
  if (dataVenda && data < dataVenda) return "A data do recebimento não pode ser antes da venda.";
  return null;
}

// itens do mesmo grupo_id são uma compra só
const chaveDaVenda = (v) => v.grupo_id ?? v.id;

// Compras (uma por grupo_id) com as parcelas k/n somadas entre os itens. `linhas`: parcelas do banco com
// venda: { id, grupo_id, data, parcelas, vendedor_id, recebimentos_meta, cliente_nome, cliente_telefone, produtos: { nome }, perfis: { nome } }.
// Cada parcela guarda os itens (venda_id + número) que a baixa precisa enviar. Só dados, nada de função.
export function agruparCompras(linhas, hoje) {
  const compras = new Map();
  for (const l of linhas) {
    const v = l.venda;
    const chave = chaveDaVenda(v);
    let c = compras.get(chave);
    if (!c) {
      c = {
        chave,
        data: v.data,
        cliente: v.cliente_nome || null,
        telefone: v.cliente_telefone || null,
        vendedor: v.perfis?.nome ?? "-",
        vendedorId: v.vendedor_id ?? null,
        produtos: [],
        n: 0,
        porNumero: new Map(),
      };
      compras.set(chave, c);
    }
    if (v.data < c.data) c.data = v.data;
    const produto = v.produtos?.nome;
    if (produto && !c.produtos.includes(produto)) c.produtos.push(produto);
    c.n = Math.max(c.n, Number(v.parcelas));
    const p = c.porNumero.get(l.numero) ?? { numero: l.numero, vencimento: l.vencimento, valor: 0, itens: [] };
    p.vencimento = l.vencimento < p.vencimento ? l.vencimento : p.vencimento;
    p.valor += Number(l.valor);
    p.itens.push({ venda_id: l.venda_id, numero: l.numero, valor: Number(l.valor), recebido_em: l.recebido_em ?? null, meta: v.recebimentos_meta?.[String(l.numero)] ?? null });
    c.porNumero.set(l.numero, p);
  }

  return [...compras.values()]
    .map((c) => {
      const parcelas = [...c.porNumero.values()]
        .sort((a, b) => a.numero - b.numero)
        .map((p) => {
          const recebida = p.itens.every((i) => i.recebido_em);
          const recebido_em = recebida ? p.itens.map((i) => i.recebido_em).sort().at(-1) : null;
          return { ...p, valor: round2(p.valor), recebida, recebido_em, situacao: situacaoParcela({ vencimento: p.vencimento, recebido_em }, hoje) };
        });
      const abertas = parcelas.filter((p) => !p.recebida);
      const total = parcelas.reduce((s, p) => s + p.valor, 0);
      const aberto = abertas.reduce((s, p) => s + p.valor, 0);
      const atrasadas = abertas.filter((p) => p.situacao.tipo === "atrasada");
      return {
        chave: c.chave,
        data: c.data,
        cliente: c.cliente,
        telefone: c.telefone,
        vendedor: c.vendedor,
        vendedorId: c.vendedorId,
        produtos: c.produtos,
        n: c.n,
        parcelas,
        pagas: parcelas.length - abertas.length,
        total: round2(total),
        aberto: round2(aberto),
        atrasado: round2(atrasadas.reduce((s, p) => s + p.valor, 0)),
        nAtrasadas: atrasadas.length,
        proximo: abertas.map((p) => p.vencimento).sort()[0] ?? null,
      };
    })
    .sort((a, b) => (b.atrasado > 0) - (a.atrasado > 0) || (a.proximo ?? "9999").localeCompare(b.proximo ?? "9999") || b.data.localeCompare(a.data));
}

const round2 = (x) => Math.round(x * 100) / 100;

// a tela mostra o mês escolhido: fica a compra com parcela em aberto, que vence ou que foi recebida nele
export function comprasDoMes(compras, mes) {
  return compras.filter((c) => c.parcelas.some((p) => !p.recebida || p.vencimento.slice(0, 7) === mes || p.recebido_em?.slice(0, 7) === mes));
}

// KPIs do topo. `linhas`: as mesmas parcelas do banco (com venda), `mes` = AAAA-MM escolhido.
// faltaMes = vence no mês e ainda não foi recebida (atrasadas do mês incluídas); antecipado = recebido no mês antes do vencimento.
export function resumoParcelas(linhas, hoje, mes) {
  const r = { atrasado: 0, nAtrasadas: 0, comprasAtrasadas: 0, faltaMes: 0, aReceber: 0, recebidoMes: 0, antecipadoMes: 0 };
  const atrasadas = new Set();
  for (const l of linhas) {
    const valor = Number(l.valor);
    if (!l.recebido_em) {
      r.aReceber += valor;
      if (l.vencimento.slice(0, 7) === mes) r.faltaMes += valor;
      if (l.vencimento < hoje) {
        r.atrasado += valor;
        r.nAtrasadas += 1;
        atrasadas.add(chaveDaVenda(l.venda));
      }
    } else if (l.recebido_em.slice(0, 7) === mes) {
      r.recebidoMes += valor;
      if (l.recebido_em < l.vencimento) r.antecipadoMes += valor;
    }
  }
  r.comprasAtrasadas = atrasadas.size;
  for (const k of ["atrasado", "faltaMes", "aReceber", "recebidoMes", "antecipadoMes"]) r[k] = round2(r[k]);
  return r;
}

// texto do WhatsApp para cobrar parcelas atrasadas: parcelas = [{ numero, vencimento, valor }], n = total de parcelas
export function mensagemCobranca(cliente, parcelas, n) {
  const primeiro = (cliente || "").trim().split(/\s+/)[0];
  const lista = parcelas.map((p) => `${p.numero}/${n} (venceu em ${dataBR(p.vencimento, true)}, ${brl(p.valor)})`).join("; ");
  const plural = parcelas.length > 1;
  return `Olá${primeiro ? `, ${primeiro}` : ""}! Aqui é da Lojinha A&G. Passando para lembrar que ${plural ? "as parcelas" : "a parcela"} ${lista} ${plural ? "estão" : "está"} em aberto. Qualquer dúvida, é só chamar!`;
}
