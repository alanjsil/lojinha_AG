import assert from "node:assert/strict";
import { test } from "node:test";
import { chaveTelefone, clienteDaVenda, clientes, funil, noPeriodo, recorrencia, seriePedidos, sumidos } from "../lib/crm.js";

const venda = (o) => ({ id: o.id, grupo_id: o.grupo_id ?? null, data: o.data, quantidade: o.q ?? 1, preco_unit: o.p ?? 10, lucro: o.lucro ?? 4, produtos: { nome: o.prod ?? "Bolo" }, ...o.cli });

test("cliente da venda: opcional, normalizado e validado", () => {
  assert.deepEqual(clienteDaVenda({}), { cliente_nome: null, cliente_telefone: null });
  assert.deepEqual(clienteDaVenda({ nome: "  Ana   Paula ", telefone: "(54) 98888-1234" }), { cliente_nome: "Ana Paula", cliente_telefone: "54988881234" });
  assert.ok(clienteDaVenda({ nome: "A" }).erro);
  assert.ok(clienteDaVenda({ telefone: "1234" }).erro);
});

test("chaveTelefone tira o 55 do país", () => {
  assert.equal(chaveTelefone("5554988881234"), "54988881234");
  assert.equal(chaveTelefone("54988881234"), "54988881234");
});

test("clientes: junta por conta, WhatsApp e nome; grupo conta como uma compra", () => {
  const lista = clientes([
    venda({ id: "1", grupo_id: "g", data: "2026-09-01", cli: { cliente_nome: "Ana", cliente_telefone: "54988881234" } }),
    venda({ id: "2", grupo_id: "g", data: "2026-09-01", prod: "Torta", p: 30, cli: { cliente_nome: "Ana", cliente_telefone: "54988881234" } }),
    // mesma Ana, agora com conta (pedido da loja) e com o 55 na frente
    venda({ id: "3", data: "2026-10-10", cli: { cliente_nome: "Ana P.", cliente_telefone: "5554988881234", cliente_id: "u1" } }),
    venda({ id: "4", data: "2026-10-12", cli: { cliente_nome: "joão" } }),
    venda({ id: "5", data: "2026-10-13", cli: { cliente_nome: "João " } }),
    venda({ id: "6", data: "2026-10-14", cli: {} }),
  ]);
  assert.equal(lista.length, 2);
  const [ana, joao] = lista;
  assert.equal(ana.nome, "Ana P.");
  assert.equal(ana.conta, true);
  assert.equal(ana.nCompras, 2);
  assert.equal(ana.total, 50);
  assert.equal(ana.ticket, 25);
  assert.equal(ana.primeira, "2026-09-01");
  assert.equal(ana.ultima, "2026-10-10");
  assert.deepEqual(ana.produtos.map((p) => p.nome), ["Torta", "Bolo"]);
  assert.deepEqual(noPeriodo(ana, "2026-10-01", "2026-10-31"), { compras: 1, gasto: 10 });
  assert.deepEqual(ana.historico, [
    { data: "2026-09-01", valor: 40 },
    { data: "2026-10-10", valor: 10 },
  ]);
  assert.equal(joao.nCompras, 2);
});

test("recorrência e sumidos", () => {
  const lista = [
    { chave: "a", primeira: "2026-08-01", ultima: "2026-10-05", datas: ["2026-08-01", "2026-10-05"] },
    { chave: "b", primeira: "2026-10-02", ultima: "2026-10-02", datas: ["2026-10-02"] },
    { chave: "c", primeira: "2026-07-01", ultima: "2026-07-20", datas: ["2026-07-01", "2026-07-20"] },
    { chave: "d", primeira: "2026-09-01", ultima: "2026-09-10", datas: ["2026-09-01", "2026-09-10"] },
  ];
  assert.deepEqual(recorrencia(lista, "2026-10-01", "2026-10-25"), { ativos: 2, novos: 1, recorrentes: 1 });
  const s = sumidos(lista, "2026-10-25");
  assert.deepEqual(s.d30.map((c) => [c.chave, c.dias]), [["d", 45]]);
  assert.deepEqual(s.d60, []);
  assert.deepEqual(s.d90.map((c) => [c.chave, c.dias]), [["c", 97]]);
  assert.deepEqual(sumidos(lista, "2026-11-12").d60.map((c) => c.chave), ["d"]);
});

test("funil dos pedidos do período", () => {
  const f = funil(
    [
      { dia: "2026-10-01", status: "entregue", total: 50, criado_em: "2026-10-01T10:00:00Z", status_em: "2026-10-01T16:00:00Z" },
      { dia: "2026-10-02", status: "entregue", total: 30, criado_em: "2026-10-02T10:00:00Z", status_em: "2026-10-03T00:00:00Z" },
      { dia: "2026-10-03", status: "cancelado", total: 20 },
      { dia: "2026-10-04", status: "novo", total: 10 },
      { dia: "2026-09-30", status: "entregue", total: 99 },
    ],
    "2026-10-01",
    "2026-10-31",
  );
  assert.equal(f.total, 4);
  assert.equal(f.conversao, 0.5);
  assert.equal(f.cancelamento, 0.25);
  assert.equal(f.abertos, 1);
  assert.equal(f.horasAteEntregar, 10);
  assert.equal(f.valorEntregue, 80);
  assert.equal(funil([], "2026-10-01", "2026-10-31").conversao, null);
});

test("série de pedidos por dia", () => {
  const s = seriePedidos(
    [
      { dia: "2026-10-01", status: "entregue" },
      { dia: "2026-10-01", status: "novo" },
    ],
    "2026-10-01",
    "2026-10-02",
  );
  assert.deepEqual(s, [
    { chave: "2026-10-01", recebidos: 2, entregues: 1 },
    { chave: "2026-10-02", recebidos: 0, entregues: 0 },
  ]);
});
