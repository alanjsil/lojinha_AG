import assert from "node:assert/strict";
import { test } from "node:test";
import { primeiroVencimentoVenda } from "../lib/parcelas.js";

test("venda de 23/10 vence a 1ª parcela em 08/11", () => {
  assert.equal(primeiroVencimentoVenda("2026-10-23"), "2026-11-08");
});

test("vira o ano", () => {
  assert.equal(primeiroVencimentoVenda("2026-12-31"), "2027-01-08");
  assert.equal(primeiroVencimentoVenda("2026-11-01"), "2026-12-08");
});

// ---------- baixa de parcelas (mig. 042) ----------
import {
  agruparCompras,
  comprasDoMes,
  dataRecebimentoValida,
  filtrarPorCaixa,
  mensagemCobranca,
  resumoParcelas,
  situacaoParcela,
} from "../lib/parcelas.js";

const HOJE = "2026-11-10";

test("situação: aberta, atrasada e recebida (antecipada ou depois do prazo)", () => {
  assert.deepEqual(situacaoParcela({ vencimento: "2026-11-10", recebido_em: null }, HOJE), { tipo: "aberta", dias: 0 });
  assert.deepEqual(situacaoParcela({ vencimento: "2026-12-08", recebido_em: null }, HOJE), { tipo: "aberta", dias: 28 });
  assert.deepEqual(situacaoParcela({ vencimento: "2026-11-08", recebido_em: null }, HOJE), { tipo: "atrasada", dias: 2 });
  assert.deepEqual(situacaoParcela({ vencimento: "2026-12-08", recebido_em: "2026-11-03" }, HOJE), { tipo: "recebida", dias: 35, antecipada: true, emAtraso: false });
  assert.deepEqual(situacaoParcela({ vencimento: "2026-11-08", recebido_em: "2026-11-09" }, HOJE), { tipo: "recebida", dias: 1, antecipada: false, emAtraso: true });
  assert.equal(situacaoParcela({ vencimento: "2026-11-08", recebido_em: "2026-11-08" }, HOJE).antecipada, false);
});

test("situação atravessa a virada de ano e o horário de verão sem errar um dia", () => {
  assert.equal(situacaoParcela({ vencimento: "2027-01-08", recebido_em: "2026-12-28" }, HOJE).dias, 11);
});

function consultaFalsa() {
  const chamadas = [];
  const q = new Proxy({}, { get: (_, nome) => (...args) => (chamadas.push([nome, ...args]), q) });
  return { q, chamadas };
}

test("período passado ou corrente conta o que foi recebido nele", () => {
  const { q, chamadas } = consultaFalsa();
  filtrarPorCaixa(q, "2026-11-01", "2026-11-10", HOJE);
  assert.deepEqual(chamadas, [
    ["gte", "recebido_em", "2026-11-01"],
    ["lte", "recebido_em", "2026-11-10"],
  ]);
});

test("período futuro é projeção: o que ainda não foi recebido e vence nele", () => {
  const { q, chamadas } = consultaFalsa();
  filtrarPorCaixa(q, "2026-12-01", "2026-12-31", HOJE);
  assert.deepEqual(chamadas, [
    ["is", "recebido_em", null],
    ["gte", "vencimento", "2026-12-01"],
    ["lte", "vencimento", "2026-12-31"],
  ]);
});

test("data do recebimento: não vale no futuro nem antes da venda", () => {
  assert.equal(dataRecebimentoValida("2026-11-10", "2026-10-23", HOJE), null);
  assert.equal(dataRecebimentoValida("2026-10-23", "2026-10-23", HOJE), null);
  assert.match(dataRecebimentoValida("2026-11-11", "2026-10-23", HOJE), /futuro/);
  assert.match(dataRecebimentoValida("2026-10-22", "2026-10-23", HOJE), /antes da venda/);
  assert.match(dataRecebimentoValida("", "2026-10-23", HOJE), /Informe/);
});

// venda de 2 itens (mesmo grupo) em 2x + venda avulsa de 1 item em 3x
const venda = (id, extra = {}) => ({ id, grupo_id: null, data: "2026-10-23", parcelas: 2, cliente_nome: "Maria Souza", cliente_telefone: "11999998888", produtos: { nome: "Batom" }, perfis: { nome: "Ana" }, ...extra });
const linha = (venda_id, v, numero, vencimento, valor, recebido_em = null) => ({ venda_id, venda: v, numero, vencimento, valor, recebido_em });

function exemplo() {
  const a = venda("a", { grupo_id: "g" });
  const b = venda("b", { grupo_id: "g", produtos: { nome: "Base" } });
  const c = venda("c", { parcelas: 3, data: "2026-09-01", cliente_nome: null, cliente_telefone: null });
  return [
    linha("a", a, 1, "2026-11-08", 60),
    linha("a", a, 2, "2026-12-08", 60),
    linha("b", b, 1, "2026-11-08", 40),
    linha("b", b, 2, "2026-12-08", 40),
    linha("c", c, 1, "2026-10-08", 30, "2026-10-08"),
    linha("c", c, 2, "2026-11-08", 30),
    linha("c", c, 3, "2026-12-08", 30),
  ];
}

test("agrupa os itens do mesmo grupo e soma cada parcela", () => {
  const compras = agruparCompras(exemplo(), HOJE);
  const g = compras.find((x) => x.chave === "g");
  assert.equal(g.cliente, "Maria Souza");
  assert.deepEqual(g.produtos, ["Batom", "Base"]);
  assert.equal(g.n, 2);
  assert.equal(g.total, 200);
  assert.equal(g.aberto, 200);
  assert.equal(g.atrasado, 100);
  assert.equal(g.nAtrasadas, 1);
  assert.equal(g.pagas, 0);
  assert.equal(g.proximo, "2026-11-08");
  assert.deepEqual(g.parcelas[0].itens.map((i) => i.venda_id), ["a", "b"]);
  assert.equal(g.parcelas[0].valor, 100);
});

test("compra com atraso vem primeiro; parcela paga sai do aberto", () => {
  const compras = agruparCompras(exemplo(), HOJE);
  assert.equal(compras.length, 2);
  const c = compras.find((x) => x.chave === "c");
  assert.equal(c.pagas, 1);
  assert.equal(c.total, 90);
  assert.equal(c.aberto, 60);
  assert.equal(c.parcelas[0].recebida, true);
  assert.equal(c.parcelas[0].situacao.tipo, "recebida");
});

test("parcela só vale como recebida quando todos os itens receberam", () => {
  const linhas = exemplo();
  linhas[0].recebido_em = "2026-11-03"; // só o item "a" da 1ª parcela
  const g = agruparCompras(linhas, HOJE).find((x) => x.chave === "g");
  assert.equal(g.parcelas[0].recebida, false);
  assert.equal(g.parcelas[0].recebido_em, null);
  linhas[2].recebido_em = "2026-11-05";
  const g2 = agruparCompras(linhas, HOJE).find((x) => x.chave === "g");
  assert.equal(g2.parcelas[0].recebida, true);
  assert.equal(g2.parcelas[0].recebido_em, "2026-11-05");
  assert.equal(g2.pagas, 1);
});

test("comprasDoMes mantém quem tem parcela em aberto, vencendo ou recebida no mês", () => {
  const linhas = exemplo();
  const compras = agruparCompras(linhas, HOJE);
  assert.equal(comprasDoMes(compras, "2026-11").length, 2); // g em aberto, c ainda tem 2 abertas
  for (const l of linhas.filter((x) => x.venda_id === "c")) l.recebido_em = "2026-10-08";
  const quitada = agruparCompras(linhas, HOJE);
  assert.equal(comprasDoMes(quitada, "2026-11").length, 2); // c vence em 08/11 (paga antes), g está em aberto
  assert.equal(comprasDoMes(quitada, "2026-10").length, 2); // c foi recebida em outubro
  assert.equal(comprasDoMes(quitada, "2027-03").length, 1); // só g, que segue em aberto
});

test("KPIs: atrasado, falta no mês, a receber, recebido e antecipado", () => {
  const linhas = exemplo();
  linhas[1].recebido_em = "2026-11-02"; // 60 antecipado (vencia em 12/2)
  const r = resumoParcelas(linhas, HOJE, "2026-11");
  assert.equal(r.atrasado, 40 + 60 + 30); // 1ª parcela do grupo (100) + 2ª da venda c (30)
  assert.equal(r.nAtrasadas, 3);
  assert.equal(r.comprasAtrasadas, 2);
  assert.equal(r.faltaMes, 130);
  assert.equal(r.recebidoMes, 60);
  assert.equal(r.antecipadoMes, 60);
  assert.equal(r.aReceber, 60 + 40 + 40 + 30 + 30);
});

test("cobrança no WhatsApp", () => {
  const t = mensagemCobranca("Maria Souza", [{ numero: 1, vencimento: "2026-11-08", valor: 100 }], 2);
  assert.match(t, /^Olá, Maria!/);
  assert.match(t, /a parcela 1\/2 \(venceu em 08\/11\/2026, R\$\s100,00\) está em aberto/);
  assert.match(mensagemCobranca("", [{ numero: 1, vencimento: "2026-11-08", valor: 1 }, { numero: 2, vencimento: "2026-12-08", valor: 1 }], 3), /^Olá! .*as parcelas .* estão em aberto/);
});

// ---------- quem mexe na baixa (mig. 043) ----------
import { comPermissoes, motivoSemDesfazer, podeDarBaixa } from "../lib/parcelas.js";

const AGORA = new Date("2026-11-10T12:00:00Z");
const horasAtras = (h) => new Date(AGORA.getTime() - h * 3600000).toISOString();
const base = { usuarioId: "u1", vendedorId: "u1", agora: AGORA };

test("dar baixa: gerente em qualquer venda; vendedor e sócia só na própria; cliente nunca", () => {
  assert.equal(podeDarBaixa({ papel: "gerente", usuarioId: "g", vendedorId: "u1" }), true);
  assert.equal(podeDarBaixa({ papel: "vendedor", usuarioId: "u1", vendedorId: "u1" }), true);
  assert.equal(podeDarBaixa({ papel: "vendedor", usuarioId: "u2", vendedorId: "u1" }), false);
  assert.equal(podeDarBaixa({ papel: "socia", usuarioId: "s", vendedorId: "u1" }), false);
  assert.equal(podeDarBaixa({ papel: "socia", usuarioId: "s", vendedorId: "s" }), true);
  assert.equal(podeDarBaixa({ papel: "cliente", usuarioId: "u1", vendedorId: "u1" }), false);
  assert.equal(podeDarBaixa({ papel: "vendedor", usuarioId: undefined, vendedorId: undefined }), false);
});

test("desfazer: vendedor só a baixa dele, até 48 h; gerente sempre", () => {
  const dele = (h) => ({ por: "u1", em: horasAtras(h) });
  assert.equal(motivoSemDesfazer({ ...base, papel: "vendedor", meta: dele(47) }), null);
  assert.match(motivoSemDesfazer({ ...base, papel: "vendedor", meta: dele(48) }), /48 horas/);
  assert.match(motivoSemDesfazer({ ...base, papel: "vendedor", meta: { por: "g", em: horasAtras(1) } }), /48 horas/);
  assert.match(motivoSemDesfazer({ ...base, papel: "vendedor", meta: null }), /48 horas/); // histórico da 042
  assert.match(motivoSemDesfazer({ papel: "vendedor", usuarioId: "u2", vendedorId: "u1", meta: { por: "u2", em: horasAtras(1) }, agora: AGORA }), /quem lançou/);
  assert.equal(motivoSemDesfazer({ ...base, papel: "gerente", meta: null }), null);
});

test("comPermissoes marca o que pode e não entrega autoria ao navegador", () => {
  const v = venda("a", { vendedor_id: "u1", recebimentos_meta: { 1: { por: "u1", em: horasAtras(1) }, 2: { por: "g", em: horasAtras(1) } } });
  const linhas = [linha("a", v, 1, "2026-11-08", 50, "2026-11-08"), linha("a", v, 2, "2026-12-08", 50, "2026-11-09"), linha("a", v, 3, "2027-01-08", 50)];
  const [c] = comPermissoes(agruparCompras(linhas, HOJE), { papel: "vendedor", usuarioId: "u1", agora: AGORA });
  assert.equal(c.podeBaixar, true);
  assert.deepEqual(c.parcelas.map((x) => x.podeDesfazer), [true, false, false]);
  assert.equal("vendedorId" in c, false);
  assert.equal(JSON.stringify(c).includes('"por"'), false);
  const [outro] = comPermissoes(agruparCompras(linhas, HOJE), { papel: "socia", usuarioId: "s", agora: AGORA });
  assert.equal(outro.podeBaixar, false);
  assert.deepEqual(outro.parcelas.map((x) => x.podeDesfazer), [false, false, false]);
});
